// Owner-only management of a share, authorised by the edit code handed out
// once at creation. The code travels in the `x-edit-code` header — never in
// the URL — so it stays out of logs and history.
import { json, methodNotAllowed, readJson, timingSafeEqual } from "../../_lib/api.js";
import { hashEditCode } from "../../_lib/edit-code.js";
import {
  deleteShare,
  describeFiles,
  expiresAtFor,
  isExpired,
  loadShare,
  parseFiles,
  publicFiles,
  resolvePasswordHash,
  rowFiles,
} from "../../_lib/shares.js";

function getId(params) {
  return String(Array.isArray(params.id) ? params.id[0] : params.id || "").trim();
}

// Loads the share and checks the edit code. Returns { row } or { response }.
async function authorize(request, env, params) {
  const id = getId(params);
  const row = id ? await loadShare(env.DB, id) : null;
  if (!row) return { response: json({ error: "not_found" }, 404) };
  if (isExpired(row)) {
    await deleteShare(env.DB, id);
    return { response: json({ error: "expired" }, 410) };
  }
  if (!row.edit_code_hash) return { response: json({ error: "not_editable" }, 403) };

  const code = request.headers.get("x-edit-code") || "";
  if (!code) return { response: json({ error: "edit_code_required" }, 401) };
  const hash = await hashEditCode(code);
  if (!hash || !timingSafeEqual(hash, row.edit_code_hash)) return { response: json({ error: "invalid_edit_code" }, 403) };
  return { row };
}

function editableShare(row) {
  return {
    id: row.id,
    title: row.title,
    files: rowFiles(row).map(({ filename, content }) => ({ filename, content })),
    created_at: row.created_at,
    updated_at: row.updated_at || null,
    expires_at: row.expires_at || null,
    passwordProtected: Boolean(row.password_hash),
  };
}

export async function onRequestGet({ request, env, params }) {
  const { row, response } = await authorize(request, env, params);
  if (response) return response;
  return json({ share: editableShare(row) });
}

export async function onRequestPut({ request, env, params }) {
  const { row, response } = await authorize(request, env, params);
  if (response) return response;

  const input = await readJson(request);
  if (!input) return json({ error: "invalid_json" }, 400);

  const parsed = parseFiles(input);
  if (parsed.error) return json({ error: parsed.error }, parsed.status);
  const { files } = parsed;

  const password = await resolvePasswordHash(input, row.password_hash);
  if (password.error) return json({ error: password.error }, password.status);

  const { title, description } = describeFiles(files, input);
  const now = new Date();
  const updatedAt = now.toISOString();
  // "keep" (or no value) preserves the current expiry; anything else restarts
  // the clock from the moment of saving.
  const expiresAt = !input.expiration || input.expiration === "keep" ? row.expires_at : expiresAtFor(input.expiration, now);
  const [first] = files;

  await env.DB.prepare(
    `UPDATE shares SET title = ?, description = ?, content = ?, filename = ?, files = ?, expires_at = ?, password_hash = ?, updated_at = ?
     WHERE id = ?`
  ).bind(title, description, first.content, first.filename, JSON.stringify(files), expiresAt, password.hash, updatedAt, row.id).run();

  const origin = new URL(request.url).origin;
  const updated = { ...row, title, files: JSON.stringify(files), expires_at: expiresAt, password_hash: password.hash, updated_at: updatedAt };
  return json({
    share: { ...editableShare(updated), links: publicFiles(files, origin, row.id) },
    url: new URL(`/s/${row.id}`, origin).toString(),
  });
}

export async function onRequestDelete({ request, env, params }) {
  const { row, response } = await authorize(request, env, params);
  if (response) return response;
  await deleteShare(env.DB, row.id);
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

export const onRequestPost = methodNotAllowed;
export const onRequestPatch = methodNotAllowed;
