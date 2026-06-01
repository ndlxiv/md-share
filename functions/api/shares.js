// POST /api/shares — create an anonymous markdown share, persisted to D1.
const MAX_CONTENT_BYTES = 262144; // 256 KB
const EXPIRATION_MS = {
  "1h": 3600000,
  "1d": 86400000,
  "7d": 604800000,
  "30d": 2592000000,
  never: null,
};
const DEFAULT_EXPIRATION = "30d";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

function makeId(length = 10) {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let id = "";
  for (const byte of bytes) id += alphabet[byte % alphabet.length];
  return id;
}

async function sha256(text) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "database_unavailable" }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const content = typeof body.content === "string" ? body.content : "";
  if (!content.trim()) return json({ error: "empty_content" }, 400);
  if (new TextEncoder().encode(content).length > MAX_CONTENT_BYTES) {
    return json({ error: "content_too_large" }, 413);
  }

  const filename =
    typeof body.filename === "string" && body.filename.trim()
      ? body.filename.trim().slice(0, 200)
      : "share.md";

  const expirationKey = Object.prototype.hasOwnProperty.call(EXPIRATION_MS, body.expiration)
    ? body.expiration
    : DEFAULT_EXPIRATION;
  const offset = EXPIRATION_MS[expirationKey];
  const now = Date.now();
  const expiresAt = offset === null ? null : now + offset;

  const burn = body.burnAfterReading ? 1 : 0;

  let passwordHash = null;
  if (body.passwordProtected && typeof body.password === "string" && body.password) {
    passwordHash = await sha256(body.password);
  }

  const id = makeId();
  await env.DB.prepare(
    "INSERT INTO shares (id, content, filename, created_at, expires_at, burn_after_reading, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(id, content, filename, now, expiresAt, burn, passwordHash)
    .run();

  const origin = new URL(request.url).origin;
  return json({ id, url: `${origin}/view/?id=${id}` }, 201);
}
