import { json, methodNotAllowed, readJson } from "../../_lib/api.js";
import { generateEditCode, hashEditCode } from "../../_lib/edit-code.js";
import {
  describeFiles,
  expiresAtFor,
  parseFiles,
  publicFiles,
  resolvePasswordHash,
} from "../../_lib/shares.js";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";

function randomId(length = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export async function onRequestPost({ request, env }) {
  const input = await readJson(request);
  if (!input) return json({ error: "invalid_json" }, 400);

  const parsed = parseFiles(input);
  if (parsed.error) return json({ error: parsed.error }, parsed.status);
  const { files } = parsed;

  const password = await resolvePasswordHash(input);
  if (password.error) return json({ error: password.error }, password.status);

  const { title, description } = describeFiles(files, input);
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = expiresAtFor(input.expiration, now);
  const editCode = generateEditCode();
  const editCodeHash = await hashEditCode(editCode);
  // The first file is mirrored into the legacy content/filename columns so a
  // rollback to the single-file build still renders new shares.
  const [first] = files;
  let id = randomId();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await env.DB.prepare(
        `INSERT INTO shares (id, title, description, content, filename, created_at, expires_at, password_hash, files, edit_code_hash, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, title, description, first.content, first.filename, createdAt, expiresAt, password.hash, JSON.stringify(files), editCodeHash, null).run();

      const origin = new URL(request.url).origin;
      return json(
        {
          share: { id, title, description, filename: first.filename, created_at: createdAt, expires_at: expiresAt, files: publicFiles(files, origin, id) },
          url: new URL(`/s/${id}`, origin).toString(),
          editCode,
          editUrl: new URL(`/e/${id}#${editCode}`, origin).toString(),
        },
        201
      );
    } catch (error) {
      const isCollision = /unique|constraint|shares\.id/i.test(String(error?.message || error));
      if (attempt === 0 && isCollision) {
        id = randomId();
        continue;
      }
      break;
    }
  }

  return json({ error: "storage_failed" }, 500);
}

export const onRequestGet = methodNotAllowed;
export const onRequestPut = methodNotAllowed;
export const onRequestPatch = methodNotAllowed;
export const onRequestDelete = methodNotAllowed;
