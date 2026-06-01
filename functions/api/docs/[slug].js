import { json, methodNotAllowed, readJson, requireAdmin, slugifyInput } from "../../_lib/api.js";
import { stripFrontmatter } from "../../_lib/markdown.js";

const getSlug = (params) => slugifyInput(params.slug || "");

export async function onRequestGet({ env, params }) {
  const slug = getSlug(params);
  const doc = await env.DB.prepare(
    "SELECT slug, title, description, content, created_at, updated_at, public FROM documents WHERE slug = ? AND public = 1"
  ).bind(slug).first();
  if (!doc) return json({ error: "not_found" }, 404);
  return json({ document: doc });
}

export async function onRequestPatch({ request, env, params }) {
  // Writes require Authorization: Bearer <ADMIN_TOKEN> via requireAdmin().
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const slug = getSlug(params);
  const existing = await env.DB.prepare("SELECT * FROM documents WHERE slug = ?").bind(slug).first();
  if (!existing) return json({ error: "not_found" }, 404);
  const input = await readJson(request);
  if (!input) return json({ error: "invalid_json" }, 400);

  const parsed = input.content === undefined ? { data: {}, body: existing.content } : stripFrontmatter(input.content || "");
  const next = {
    title: String(input.title ?? parsed.data.title ?? existing.title).trim() || existing.title,
    description: String(input.description ?? parsed.data.description ?? existing.description ?? "").trim(),
    content: String(input.content ?? existing.content),
    public: input.public === undefined ? existing.public : input.public ? 1 : 0,
    updated_at: new Date().toISOString(),
  };

  await env.DB.prepare(
    "UPDATE documents SET title = ?, description = ?, content = ?, public = ?, updated_at = ? WHERE slug = ?"
  ).bind(next.title, next.description, next.content, next.public, next.updated_at, slug).run();

  return json({ document: { slug, ...next, public: Boolean(next.public) } });
}

export async function onRequestDelete({ request, env, params }) {
  const auth = requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  const slug = getSlug(params);
  await env.DB.prepare("DELETE FROM documents WHERE slug = ?").bind(slug).run();
  return json({ ok: true });
}

export const onRequestPost = methodNotAllowed;
export const onRequestPut = onRequestPatch;
