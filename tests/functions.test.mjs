import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crc32 as zlibCrc32 } from "node:zlib";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const file = (...parts) => join(root, ...parts);
const load = (...parts) => import(pathToFileURL(file(...parts)));

const loadCreate = () => load("functions", "api", "shares", "index.js");
const loadManage = () => load("functions", "api", "shares", "[id].js");
const loadView = () => load("functions", "s", "[id].js");
const loadFileView = () => load("functions", "s", "[id]", "[file].js");
const loadApi = () => load("functions", "_lib", "api.js");
const loadEditCode = () => load("functions", "_lib", "edit-code.js");
const loadZip = () => load("functions", "_lib", "zip.js");
const loadScheduled = () => load("functions", "_scheduled.js");

const COLUMNS = ["id", "title", "description", "content", "filename", "created_at", "expires_at", "password_hash", "files", "edit_code_hash", "updated_at"];

// In-memory D1 mock for the handful of statements this app issues.
function makeDb(seed = []) {
  const store = new Map(seed.map((row) => [row.id, Object.fromEntries(COLUMNS.map((c) => [c, row[c] ?? null]))]));
  const calls = { deletes: [], updates: [] };
  return {
    store,
    calls,
    prepare(sql) {
      return {
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async first() {
          const row = store.get(this.args[0]);
          return row ? { ...row, filename: row.filename ?? "share.md" } : null;
        },
        async run() {
          if (/^\s*INSERT/i.test(sql)) {
            store.set(this.args[0], Object.fromEntries(COLUMNS.map((c, i) => [c, this.args[i] ?? null])));
          } else if (/^\s*UPDATE/i.test(sql)) {
            const [title, description, content, filename, files, expires_at, password_hash, updated_at, id] = this.args;
            Object.assign(store.get(id), { title, description, content, filename, files, expires_at, password_hash, updated_at });
            calls.updates.push(id);
          } else if (/^\s*DELETE/i.test(sql)) {
            calls.deletes.push({ sql, args: this.args });
            if (/WHERE id = \?/.test(sql)) store.delete(this.args[0]);
            else for (const [key, value] of store) if (value.expires_at && value.expires_at < this.args[0]) store.delete(key);
          }
          return { success: true };
        },
      };
    },
  };
}

const jsonRequest = (url, body, { method = "POST", headers = {} } = {}) =>
  new Request(url, { method, headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

async function createShare(db, body) {
  const { onRequestPost } = await loadCreate();
  const res = await onRequestPost({ request: jsonRequest("https://share.test/api/shares", body), env: { DB: db } });
  return { res, payload: await res.json() };
}

// --- Create ---------------------------------------------------------------

test("POST /api/shares stores a single-file share (legacy body) and returns links + a one-time edit code", async () => {
  const db = makeDb();
  const { res, payload } = await createShare(db, { content: "# Hello\n\nBody" });
  assert.equal(res.status, 201);
  assert.match(payload.url, /^https:\/\/share\.test\/s\/[0-9a-z]{16}$/);
  assert.equal(payload.share.title, "Hello");
  assert.equal(payload.share.filename, "Hello.md", "filename derives from the title, not README.md");
  assert.match(payload.editCode, /^[0-9A-Z]{4}(-[0-9A-Z]{4}){5}$/);
  assert.equal(payload.editUrl, `https://share.test/e/${payload.share.id}#${payload.editCode}`);

  const row = db.store.get(payload.share.id);
  assert.equal(row.edit_code_hash.length, 64, "only the hash is stored");
  assert.ok(!JSON.stringify(row).includes(payload.editCode.replace(/-/g, "")), "edit code never stored in clear text");
});

test("POST /api/shares stores multiple files in order, de-duplicating names", async () => {
  const db = makeDb();
  const { res, payload } = await createShare(db, {
    files: [
      { filename: "notes.md", content: "# One" },
      { filename: "NOTES.md", content: "# Two" },
      { filename: "", content: "# Third file" },
      { filename: "empty.md", content: "   " },
    ],
  });
  assert.equal(res.status, 201);
  assert.deepEqual(payload.share.files.map((f) => f.filename), ["notes.md", "NOTES-2.md", "Third file.md"]);
  assert.deepEqual(payload.share.files.map((f) => f.slug), ["notes", "notes-2", "third-file"]);
  const row = db.store.get(payload.share.id);
  assert.equal(JSON.parse(row.files).length, 3);
  assert.equal(row.content, "# One", "first file mirrored into the legacy column");
});

test("POST /api/shares enforces content, file-count and size limits", async () => {
  const db = makeDb();
  assert.deepEqual((await createShare(db, { content: "   " })).payload, { error: "content_required" });
  const tooBig = await createShare(db, { content: "x".repeat(100_001) });
  assert.equal(tooBig.res.status, 413);
  const many = await createShare(db, { files: Array.from({ length: 21 }, (_, i) => ({ filename: `${i}.md`, content: "x" })) });
  assert.equal(many.res.status, 413);
  assert.equal(many.payload.error, "too_many_files");
  const total = await createShare(db, { files: Array.from({ length: 11 }, (_, i) => ({ filename: `${i}.md`, content: "x".repeat(99_000) })) });
  assert.equal(total.res.status, 413);
  assert.equal(db.store.size, 0, "nothing persisted for rejected input");
});

test("POST /api/shares hashes passwords and rejects protection without a password", async () => {
  const { sha256 } = await loadApi();
  const db = makeDb();
  const missing = await createShare(db, { content: "# S", passwordProtected: true, password: "" });
  assert.equal(missing.res.status, 400);
  assert.equal(missing.payload.error, "password_required");

  const { payload } = await createShare(db, { content: "# Secret", passwordProtected: true, password: "hunter2" });
  assert.equal(db.store.get(payload.share.id).password_hash, await sha256("hunter2"));
});

test("POST /api/shares retries once on an id collision", async () => {
  const { onRequestPost } = await loadCreate();
  let attempts = 0;
  const db = {
    prepare: () => ({
      bind() {
        return this;
      },
      async run() {
        attempts += 1;
        if (attempts === 1) throw new Error("UNIQUE constraint failed: shares.id");
      },
    }),
  };
  const res = await onRequestPost({ request: jsonRequest("https://share.test/api/shares", { content: "# x" }), env: { DB: db } });
  assert.equal(res.status, 201);
  assert.equal(attempts, 2);
});

// --- Edit codes -------------------------------------------------------------

test("edit codes are 120-bit, normalised forgivingly and hashed", async () => {
  const { generateEditCode, normalizeEditCode, hashEditCode } = await loadEditCode();
  const codes = new Set(Array.from({ length: 2000 }, generateEditCode));
  assert.equal(codes.size, 2000);
  const code = [...codes][0];
  assert.match(code, /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}(-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}){5}$/);
  assert.equal(normalizeEditCode(` ${code.toLowerCase()} `), code.replace(/-/g, ""));
  assert.equal(normalizeEditCode("o0il"), "0011");
  assert.equal(await hashEditCode(code.toLowerCase().replace(/-/g, " ")), await hashEditCode(code));
  assert.equal(await hashEditCode("short"), "");
});

async function manage(method, db, id, code, body) {
  const mod = await loadManage();
  const handler = { GET: mod.onRequestGet, PUT: mod.onRequestPut, DELETE: mod.onRequestDelete }[method];
  const headers = code === undefined ? {} : { "x-edit-code": code };
  const request = body ? jsonRequest(`https://share.test/api/shares/${id}`, body, { method, headers }) : new Request(`https://share.test/api/shares/${id}`, { method, headers });
  return handler({ request, env: { DB: db }, params: { id } });
}

test("GET/PUT/DELETE /api/shares/<id> require the matching edit code", async () => {
  const db = makeDb();
  const { payload } = await createShare(db, { files: [{ filename: "a.md", content: "# A" }], expiration: "1h" });
  const { id } = payload.share;

  assert.equal((await manage("GET", db, id)).status, 401);
  assert.equal((await manage("GET", db, id, "AAAA-AAAA-AAAA-AAAA-AAAA-AAAA")).status, 403);
  assert.equal((await manage("PUT", db, id, "wrong", { content: "# hacked" })).status, 403);
  assert.equal(db.store.get(id).content, "# A", "rejected edit leaves content untouched");

  const loaded = await manage("GET", db, id, payload.editCode.toLowerCase());
  assert.equal(loaded.status, 200);
  const { share } = await loaded.json();
  assert.deepEqual(share.files, [{ filename: "a.md", content: "# A" }]);
  assert.equal(JSON.stringify(share).includes("edit_code"), false, "hash never returned");
});

test("PUT /api/shares/<id> replaces files, keeps the id and expiry, and manages the password", async () => {
  const { sha256 } = await loadApi();
  const db = makeDb();
  const { payload } = await createShare(db, { files: [{ filename: "a.md", content: "# A" }], expiration: "1h", passwordProtected: true, password: "old" });
  const { id } = payload.share;
  const before = db.store.get(id).expires_at;

  const res = await manage("PUT", db, id, payload.editCode, {
    files: [{ filename: "b.md", content: "# B" }, { filename: "c.md", content: "# C" }],
    expiration: "keep",
    passwordProtected: true,
    password: "",
  });
  assert.equal(res.status, 200);
  const row = db.store.get(id);
  assert.equal(row.title, "B");
  assert.deepEqual(JSON.parse(row.files).map((f) => f.filename), ["b.md", "c.md"]);
  assert.equal(row.expires_at, before, "keep preserves the expiry");
  assert.equal(row.password_hash, await sha256("old"), "blank password keeps the current one");
  assert.ok(row.updated_at);

  await manage("PUT", db, id, payload.editCode, { content: "# B", expiration: "never", passwordProtected: true, password: "new" });
  assert.equal(db.store.get(id).password_hash, await sha256("new"));
  assert.equal(db.store.get(id).expires_at, null);

  await manage("PUT", db, id, payload.editCode, { content: "# B", passwordProtected: false });
  assert.equal(db.store.get(id).password_hash, null);
});

test("DELETE /api/shares/<id> removes the share; expired and legacy shares are not editable", async () => {
  const db = makeDb([
    { id: "legacy", title: "L", description: "", content: "x", filename: "l.md", expires_at: null },
    { id: "old", title: "O", description: "", content: "x", filename: "o.md", expires_at: "2000-01-01T00:00:00.000Z", edit_code_hash: "x" },
  ]);
  assert.equal((await manage("GET", db, "legacy", "AAAA")).status, 403);
  assert.equal((await manage("GET", db, "old", "AAAA")).status, 410);
  assert.equal(db.store.has("old"), false);
  assert.equal((await manage("GET", db, "missing", "AAAA")).status, 404);

  const { payload } = await createShare(db, { content: "# Bye" });
  assert.equal((await manage("DELETE", db, payload.share.id, payload.editCode)).status, 204);
  assert.equal(db.store.has(payload.share.id), false);
});

// --- View -------------------------------------------------------------------

const viewRequest = (path, init) => new Request(`https://share.test${path}`, init);

async function view(db, id, fileSlug, init) {
  const mod = fileSlug ? await loadFileView() : await loadView();
  const method = init?.method === "POST" ? "onRequestPost" : "onRequestGet";
  return mod[method]({ request: viewRequest(`/s/${id}${fileSlug ? `/${fileSlug}` : ""}${init?.query || ""}`, init), env: { DB: db }, params: { id, file: fileSlug } });
}

const multiRow = (extra = {}) => ({
  id: "abc",
  title: "Guide",
  description: "",
  content: "# Guide",
  filename: "guide.md",
  created_at: "2026-10-01T00:00:00.000Z",
  expires_at: null,
  files: JSON.stringify([
    { filename: "guide.md", content: "# Guide\n\nSee [setup](./setup.md#install)." },
    { filename: "setup.md", content: "# Setup\n\n## Install" },
  ]),
  edit_code_hash: "h",
  ...extra,
});

test("GET /s/<id> renders the first file with hardening headers and no emoji", async () => {
  const res = await view(makeDb([multiRow()]), "abc");
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /<h1 id="guide">Guide<\/h1>/);
  assert.match(body, /href="\/s\/abc\/setup#install"/, "relative links resolve to sibling files");
  assert.match(body, /class="view-sidebar/);
  assert.match(body, /href="\/e\/abc"/, "edit entry point");
  assert.match(body, /data-icon="link"/);
  assert.doesNotMatch(body, /[\p{Extended_Pictographic}]/u);
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.match(res.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
});

test("GET /s/<id>/<file> renders that file; unknown files are 404", async () => {
  const db = makeDb([multiRow()]);
  const res = await view(db, "abc", "setup");
  assert.equal(res.status, 200);
  assert.match(await res.text(), /<strong>setup\.md<\/strong>/);
  assert.equal((await view(db, "abc", "nope")).status, 404);
});

test("legacy single-file rows still render", async () => {
  const res = await view(makeDb([{ id: "abc", title: "Doc", description: "", content: "# Doc\n\nhi", filename: "doc.md", expires_at: null }]), "abc");
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /<h1 id="doc">Doc<\/h1>/);
  assert.doesNotMatch(body, /class="view-sidebar/);
  assert.doesNotMatch(body, /href="\/e\/abc"/, "no edit link without an edit code");
});

test("GET /s/<id> returns 404 for unknown ids and 410 (with deletion) for expired shares", async () => {
  assert.equal((await view(makeDb(), "missing")).status, 404);
  const db = makeDb([multiRow({ id: "old", expires_at: "2000-01-01T00:00:00.000Z" })]);
  assert.equal((await view(db, "old")).status, 410);
  assert.equal(db.store.has("old"), false);
});

test("?download=zip returns a valid stored zip of every file", async () => {
  const res = await view(makeDb([multiRow()]), "abc", null, { query: "?download=zip" });
  assert.equal(res.headers.get("content-type"), "application/zip");
  const bytes = new Uint8Array(await res.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50);
  assert.ok(text.includes("guide.md") && text.includes("setup.md"));
});

test("zip CRC-32 matches zlib", async () => {
  const { crc32 } = await loadZip();
  const data = new TextEncoder().encode("# Hello, Markdown: tiếng Việt");
  assert.equal(crc32(data), zlibCrc32(data));
});

test("password gate hides content, unlocks with the password and remembers it for sibling files", async () => {
  const { sha256 } = await loadApi();
  const db = makeDb([multiRow({ password_hash: await sha256("pw") })]);

  const gate = await view(db, "abc");
  assert.equal(gate.status, 401);
  const gateBody = await gate.text();
  assert.doesNotMatch(gateBody, /See \[setup\]|<h1 id="guide">/);
  assert.match(gateBody, /action="\/s\/abc"/);

  const wrong = await view(db, "abc", null, { method: "POST", body: new URLSearchParams({ password: "nope" }) });
  assert.equal(wrong.status, 401);
  assert.match(await wrong.text(), /Incorrect password/);

  const ok = await view(db, "abc", null, { method: "POST", body: new URLSearchParams({ password: "pw" }) });
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get("set-cookie");
  assert.match(cookie, /^mds_unlock=\d+\.[0-9a-f]{64}; Path=\/s\/abc; Max-Age=3600; HttpOnly; SameSite=Lax; Secure$/);

  const sibling = await view(db, "abc", "setup", { headers: { cookie: cookie.split(";")[0] } });
  assert.equal(sibling.status, 200);
  const forged = await view(db, "abc", "setup", { headers: { cookie: "mds_unlock=9999999999.deadbeef" } });
  assert.equal(forged.status, 401);
});

test("view handler compares password hashes in constant time", async () => {
  const api = await loadApi();
  assert.equal(api.timingSafeEqual("abc123", "abc123"), true);
  assert.equal(api.timingSafeEqual("abc123", "abc124"), false);
  assert.equal(api.timingSafeEqual("abc", "abcdef"), false);
  const source = readFileSync(file("functions", "_lib", "view.js"), "utf8");
  assert.doesNotMatch(source, /===\s*row\.password_hash/);
  assert.match(source, /timingSafeEqual/);
});

// --- Scheduled cleanup ----------------------------------------------------

test("scheduled cleanup deletes only rows past their expiry", async () => {
  const mod = await loadScheduled();
  const db = makeDb([
    { id: "expired", expires_at: "2001-01-01T00:00:00.000Z" },
    { id: "future", expires_at: "2999-01-01T00:00:00.000Z" },
    { id: "never", expires_at: null },
  ]);
  await mod.scheduled({ scheduledTime: Date.parse("2026-06-01T00:00:00.000Z") }, { DB: db }, { waitUntil() {} });
  assert.deepEqual([...db.store.keys()], ["future", "never"]);
  assert.match(db.calls.deletes.at(-1).sql, /expires_at\s*<\s*\?/i);
});

test("wrangler.toml stays deployable for Pages", () => {
  const toml = readFileSync(file("wrangler.toml"), "utf8");
  assert.doesNotMatch(toml, /\[triggers\]/);
  assert.match(toml, /Cloudflare Pages rejects cron trigger blocks/);
});
