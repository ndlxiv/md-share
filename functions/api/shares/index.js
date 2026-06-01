import { json, methodNotAllowed, readJson, sha256 } from "../../_lib/api.js";
import { stripFrontmatter } from "../../_lib/markdown.js";

const MAX_CONTENT_LENGTH = 100_000;
const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";

// expiration key -> milliseconds offset (null = never)
const EXPIRATION_MS = {
  "1h": 3_600_000,
  "1d": 86_400_000,
  "7d": 604_800_000,
  "30d": 2_592_000_000,
  never: null,
};
const DEFAULT_EXPIRATION = "30d";

function randomId(length = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function titleFromMarkdown(content) {
  const heading = String(content).match(/^#\s+(.+)$/m)?.[1];
  return heading?.trim() || "Untitled Markdown Share";
}

function safeFilename(value, fallback = "share.md") {
  const name = String(value || "")
    .trim()
    .replace(/[\\/<>:"|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120);
  if (!name) return fallback;
  return /\.(md|markdown|txt)$/i.test(name) ? name : `${name}.md`;
}

export async function onRequestPost({ request, env }) {
  const input = await readJson(request);
  if (!input) return json({ error: "invalid_json" }, 400);

  const content = String(input.content || "").trim();
  if (!content) return json({ error: "content_required" }, 400);
  if (content.length > MAX_CONTENT_LENGTH) return json({ error: "content_too_large" }, 413);

  const parsed = stripFrontmatter(content);
  const title = String(input.title || parsed.data.title || titleFromMarkdown(content)).trim().slice(0, 160);
  const description = String(input.description || parsed.data.description || "").trim().slice(0, 280);
  const filename = safeFilename(input.filename || parsed.data.filename || `${title}.md`);
  const id = randomId();
  const now = new Date();
  const createdAt = now.toISOString();

  const expirationKey = Object.prototype.hasOwnProperty.call(EXPIRATION_MS, input.expiration)
    ? input.expiration
    : DEFAULT_EXPIRATION;
  const offset = EXPIRATION_MS[expirationKey];
  const expiresAt = offset === null ? null : new Date(now.getTime() + offset).toISOString();

  let passwordHash = null;
  if (input.passwordProtected && typeof input.password === "string" && input.password) {
    passwordHash = await sha256(input.password);
  }

  await env.DB.prepare(
    `INSERT INTO shares (id, title, description, content, filename, created_at, expires_at, password_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, title, description, content, filename, createdAt, expiresAt, passwordHash).run();

  const url = new URL(`/s/${id}`, request.url).toString();
  return json({ share: { id, title, description, filename, created_at: createdAt }, url }, 201);
}

export const onRequestGet = methodNotAllowed;
export const onRequestPut = methodNotAllowed;
export const onRequestPatch = methodNotAllowed;
export const onRequestDelete = methodNotAllowed;
