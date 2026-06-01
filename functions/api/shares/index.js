import { json, methodNotAllowed, readJson } from "../../_lib/api.js";
import { stripFrontmatter } from "../../_lib/markdown.js";

const MAX_CONTENT_LENGTH = 100_000;
const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-";

function randomSlug(length = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function titleFromMarkdown(content) {
  const heading = String(content).match(/^#\s+(.+)$/m)?.[1];
  return heading?.trim() || "Untitled Markdown Share";
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
  const slug = randomSlug();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO documents (slug, title, description, content, public, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`
  ).bind(slug, title, description, content, now, now).run();

  const url = new URL(`/s/${slug}`, request.url).toString();
  return json({ share: { slug, title, description, created_at: now }, url }, 201);
}

export const onRequestGet = methodNotAllowed;
export const onRequestPut = methodNotAllowed;
export const onRequestPatch = methodNotAllowed;
export const onRequestDelete = methodNotAllowed;
