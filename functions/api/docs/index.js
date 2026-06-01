import { json, methodNotAllowed, readJson, requireAdmin, slugifyInput } from "../../_lib/api.js";
import { stripFrontmatter } from "../../_lib/markdown.js";

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    "SELECT slug, title, description, created_at, updated_at, public FROM documents WHERE public = 1 ORDER BY updated_at DESC"
  ).all();
  return json({ documents: results });
}

export async function onRequestPost({ request, env }) {
  // Writes require Authorization: Bearer <ADMIN_TOKEN> via requireAdmin().
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const input = await readJson(request);
  if (!input) return json({ error: "invalid_json" }, 400);

  const parsed = stripFrontmatter(input.content || "");
  const title = String(input.title || parsed.data.title || "Untitled").trim();
  const slug = slugifyInput(input.slug || title);
  if (!slug) return json({ error: "slug_required" }, 400);
  const description = String(input.description ?? parsed.data.description ?? "").trim();
  const content = String(input.content ?? "");
  const isPublic = input.public === false || parsed.data.public === false ? 0 : 1;
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO documents (slug, title, description, content, public, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       content = excluded.content,
       public = excluded.public,
       updated_at = excluded.updated_at`
  ).bind(slug, title, description, content, isPublic, now, now).run();

  return json({ document: { slug, title, description, content, public: Boolean(isPublic), updated_at: now } }, 201);
}

export const onRequestPut = onRequestPost;
export const onRequestPatch = onRequestPost;
export const onRequestDelete = methodNotAllowed;
