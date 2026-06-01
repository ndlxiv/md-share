import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const file = (...parts) => join(root, ...parts);

const loadCreate = () => import(pathToFileURL(file("functions", "api", "shares", "index.js")));
const loadView = () => import(pathToFileURL(file("functions", "s", "[id].js")));
const loadApi = () => import(pathToFileURL(file("functions", "_lib", "api.js")));
const loadScheduled = () => import(pathToFileURL(file("functions", "_scheduled.js")));

// Minimal in-memory D1 mock that understands the handful of statements this app issues.
function makeDb(seed = []) {
  const store = new Map(seed.map((row) => [row.id, { ...row }]));
  const calls = { inserts: [], deletes: [], selects: [] };
  return {
    store,
    calls,
    prepare(sql) {
      return {
        sql,
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async first() {
          calls.selects.push(this.args[0]);
          return store.get(this.args[0]) ?? null;
        },
        async run() {
          if (/^\s*INSERT/i.test(sql)) {
            const [id, title, description, content, filename, created_at, expires_at, password_hash] = this.args;
            store.set(id, { id, title, description, content, filename, created_at, expires_at, password_hash });
            calls.inserts.push(this.args);
          } else if (/^\s*DELETE/i.test(sql)) {
            calls.deletes.push({ sql, args: this.args });
            if (/WHERE id = \?/.test(sql)) {
              store.delete(this.args[0]);
            } else if (/expires_at/i.test(sql)) {
              const cutoff = this.args[0];
              for (const [key, value] of store) {
                if (value.expires_at && value.expires_at < cutoff) store.delete(key);
              }
            }
          }
          return { success: true };
        },
      };
    },
  };
}

const postRequest = (body) => ({
  url: "https://share.test/api/shares",
  json: async () => body,
});

// --- T4.1: real behaviour tests for the create endpoint -------------------

test("POST /api/shares stores a valid share and returns its public url", async () => {
  const { onRequestPost } = await loadCreate();
  const db = makeDb();
  const res = await onRequestPost({ request: postRequest({ content: "# Hello\n\nBody" }), env: { DB: db } });

  assert.equal(res.status, 201);
  const payload = await res.json();
  assert.match(payload.url, /^https:\/\/share\.test\/s\/[0-9a-z]+$/);
  assert.equal(payload.share.title, "Hello");
  assert.equal(db.store.size, 1, "exactly one row persisted");
});

test("POST /api/shares rejects empty content with 400 and oversized content with 413", async () => {
  const { onRequestPost } = await loadCreate();
  const db = makeDb();

  const empty = await onRequestPost({ request: postRequest({ content: "   " }), env: { DB: db } });
  assert.equal(empty.status, 400);
  assert.deepEqual(await empty.json(), { error: "content_required" });

  const huge = await onRequestPost({ request: postRequest({ content: "x".repeat(100_001) }), env: { DB: db } });
  assert.equal(huge.status, 413);
  assert.deepEqual(await huge.json(), { error: "content_too_large" });

  assert.equal(db.store.size, 0, "nothing persisted for rejected input");
});

test("POST /api/shares hashes the password instead of storing it in clear text", async () => {
  const { onRequestPost } = await loadCreate();
  const { sha256 } = await loadApi();
  const db = makeDb();
  await onRequestPost({
    request: postRequest({ content: "# Secret", passwordProtected: true, password: "hunter2" }),
    env: { DB: db },
  });
  const [row] = [...db.store.values()];
  assert.equal(row.password_hash, await sha256("hunter2"));
  assert.notEqual(row.password_hash, "hunter2");
});

// --- T4.1: real behaviour tests for the view endpoint ---------------------

const VIEW_REQUEST = { url: "https://share.test/s/abc" };

test("GET /s/<id> renders an existing share with security headers", async () => {
  const { onRequestGet } = await loadView();
  const db = makeDb([
    { id: "abc", title: "Doc", description: "", content: "# Doc\n\nhi", filename: "doc.md", expires_at: null, password_hash: null },
  ]);
  const res = await onRequestGet({ request: VIEW_REQUEST, env: { DB: db }, params: { id: "abc" } });

  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /<h1 id="doc">Doc<\/h1>/);
  // hardening headers (T4.4)
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.match(res.headers.get("content-security-policy") || "", /default-src/);
});

test("GET /s/<id> returns 404 for an unknown id", async () => {
  const { onRequestGet } = await loadView();
  const db = makeDb();
  const res = await onRequestGet({ request: VIEW_REQUEST, env: { DB: db }, params: { id: "missing" } });
  assert.equal(res.status, 404);
});

test("GET /s/<id> returns 410 and lazily deletes an expired share", async () => {
  const { onRequestGet } = await loadView();
  const db = makeDb([
    { id: "old", title: "Old", description: "", content: "x", filename: "o.md", expires_at: "2000-01-01T00:00:00.000Z", password_hash: null },
  ]);
  const res = await onRequestGet({ request: VIEW_REQUEST, env: { DB: db }, params: { id: "old" } });
  assert.equal(res.status, 410);
  assert.equal(db.store.has("old"), false, "expired row deleted on access");
  assert.ok(db.calls.deletes.some((d) => /WHERE id = \?/.test(d.sql)));
});

test("GET /s/<id> shows the password gate (401) without leaking the body", async () => {
  const { onRequestGet } = await loadView();
  const { sha256 } = await loadApi();
  const db = makeDb([
    { id: "abc", title: "Locked", description: "", content: "TOP SECRET BODY", filename: "s.md", expires_at: null, password_hash: await sha256("pw") },
  ]);
  const res = await onRequestGet({ request: VIEW_REQUEST, env: { DB: db }, params: { id: "abc" } });
  assert.equal(res.status, 401);
  const body = await res.text();
  assert.doesNotMatch(body, /TOP SECRET BODY/);
  assert.match(body, /name="password"/);
});

const postForm = (password) => ({
  url: "https://share.test/s/abc",
  formData: async () => ({ get: (key) => (key === "password" ? password : null) }),
});

test("POST /s/<id> unlocks with the correct password and rejects a wrong one", async () => {
  const { onRequestPost } = await loadView();
  const { sha256 } = await loadApi();
  const seed = () => [
    { id: "abc", title: "Locked", description: "", content: "the real body", filename: "s.md", expires_at: null, password_hash: undefined },
  ];

  const hash = await sha256("correct");
  const okDb = makeDb(seed());
  okDb.store.get("abc").password_hash = hash;
  const ok = await onRequestPost({ request: postForm("correct"), env: { DB: okDb }, params: { id: "abc" } });
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /the real body/);

  const badDb = makeDb(seed());
  badDb.store.get("abc").password_hash = hash;
  const bad = await onRequestPost({ request: postForm("wrong"), env: { DB: badDb }, params: { id: "abc" } });
  assert.equal(bad.status, 401);
  assert.doesNotMatch(await bad.text(), /the real body/);
});

// --- T4.4: constant-time hash comparison ----------------------------------

test("api exposes a constant-time string comparison used for password hashes", async () => {
  const api = await loadApi();
  assert.equal(typeof api.timingSafeEqual, "function");
  assert.equal(api.timingSafeEqual("abc123", "abc123"), true);
  assert.equal(api.timingSafeEqual("abc123", "abc124"), false);
  // unequal lengths must not throw and must compare unequal
  assert.equal(api.timingSafeEqual("abc", "abcdef"), false);
  assert.equal(api.timingSafeEqual("", ""), true);

  // the view handler must not fall back to a plain === comparison of hashes
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(file("functions", "s", "[id].js"), "utf8");
  assert.doesNotMatch(source, /===\s*row\.password_hash/);
  assert.match(source, /timingSafeEqual/);
});

// --- T4.3: scheduled cleanup of expired shares ----------------------------

test("scheduled cleanup deletes only rows past their expiry", async () => {
  const mod = await loadScheduled();
  assert.equal(typeof mod.deleteExpiredShares, "function");
  assert.equal(typeof mod.scheduled, "function");

  const db = makeDb([
    { id: "expired", title: "e", description: "", content: "x", filename: "e.md", expires_at: "2001-01-01T00:00:00.000Z", password_hash: null },
    { id: "future", title: "f", description: "", content: "x", filename: "f.md", expires_at: "2999-01-01T00:00:00.000Z", password_hash: null },
    { id: "never", title: "n", description: "", content: "x", filename: "n.md", expires_at: null, password_hash: null },
  ]);

  await mod.deleteExpiredShares(db, "2026-06-01T00:00:00.000Z");

  assert.equal(db.store.has("expired"), false, "expired row removed");
  assert.equal(db.store.has("future"), true, "future row kept");
  assert.equal(db.store.has("never"), true, "never-expiring row kept");
  // the delete must be bounded by an expiry predicate, never a blanket wipe
  const del = db.calls.deletes.at(-1);
  assert.match(del.sql, /expires_at/i);
  assert.match(del.sql, /<\s*\?/);
});

test("scheduled handler runs cleanup against env.DB", async () => {
  const mod = await loadScheduled();
  const db = makeDb([
    { id: "expired", title: "e", description: "", content: "x", filename: "e.md", expires_at: "2001-01-01T00:00:00.000Z", password_hash: null },
  ]);
  await mod.scheduled({ scheduledTime: Date.parse("2026-06-01T00:00:00.000Z") }, { DB: db }, { waitUntil() {} });
  assert.equal(db.store.has("expired"), false);
});

// --- T4.3: Pages-compatible cron configuration ----------------------------

test("wrangler.toml stays deployable for Pages while scheduled cleanup is tested", async () => {
  const { readFileSync } = await import("node:fs");
  const toml = readFileSync(file("wrangler.toml"), "utf8");
  assert.doesNotMatch(toml, /\[triggers\]/);
  assert.match(toml, /Cloudflare Pages rejects cron trigger blocks/);
});
