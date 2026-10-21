import { sha256 } from "./api.js";
import {
  DEFAULT_EXPIRATION,
  EXPIRATION_OPTIONS,
  LIMITS,
  assignFileSlugs,
  byteLength,
  dedupeFilenames,
  defaultFilename,
  safeFilename,
  titleFromMarkdown,
} from "./files-core.js";
import { stripFrontmatter } from "./markdown.js";

const SHARE_COLUMNS =
  "id, title, description, content, COALESCE(filename, 'share.md') AS filename, created_at, expires_at, password_hash, files, edit_code_hash, updated_at";

export async function loadShare(db, id) {
  return db.prepare(`SELECT ${SHARE_COLUMNS} FROM shares WHERE id = ?`).bind(id).first();
}

export async function deleteShare(db, id) {
  return db.prepare("DELETE FROM shares WHERE id = ?").bind(id).run();
}

export function isExpired(row) {
  return Boolean(row.expires_at) && Date.now() > Date.parse(row.expires_at);
}

// Shares created before multi-file support keep their single file in
// `content`/`filename`; newer rows hold the ordered list as JSON in `files`.
export function rowFiles(row) {
  if (row.files) {
    try {
      const parsed = JSON.parse(row.files);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      /* fall through to the legacy columns */
    }
  }
  return [{ filename: row.filename || "share.md", content: row.content || "" }];
}

export function withSlugs(files) {
  const slugs = assignFileSlugs(files.map((file) => file.filename));
  return files.map((file, index) => ({ ...file, slug: slugs[index] }));
}

export function expiresAtFor(key, now = new Date()) {
  const option = EXPIRATION_OPTIONS.find((item) => item.value === key) ||
    EXPIRATION_OPTIONS.find((item) => item.value === DEFAULT_EXPIRATION);
  return option.ms === null ? null : new Date(now.getTime() + option.ms).toISOString();
}

// Validates the files of a create/update request. Accepts `files: [{filename,
// content}]` and, for older clients, a single `content` (+ `filename`).
export function parseFiles(input) {
  const source = Array.isArray(input.files)
    ? input.files
    : [{ filename: input.filename, content: input.content }];
  if (source.length > LIMITS.maxFiles) return { error: "too_many_files", status: 413 };

  const files = [];
  for (const item of source) {
    const content = String(item?.content ?? "").replace(/\r\n/g, "\n").trim();
    if (!content) continue;
    if (content.length > LIMITS.maxFileChars) return { error: "content_too_large", status: 413 };
    const fallback = defaultFilename(content, files.length);
    files.push({ filename: safeFilename(item?.filename, fallback), content });
  }
  if (!files.length) return { error: "content_required", status: 400 };

  const names = dedupeFilenames(files.map((file) => file.filename));
  names.forEach((name, index) => (files[index].filename = name));
  const total = files.reduce((sum, file) => sum + byteLength(file.content) + byteLength(file.filename), 0);
  if (total > LIMITS.maxTotalBytes) return { error: "content_too_large", status: 413 };
  return { files };
}

export function describeFiles(files, input = {}) {
  const first = files[0];
  const { data } = stripFrontmatter(first.content);
  const title = String(input.title || titleFromMarkdown(first.content) || "Untitled Markdown Share").trim().slice(0, 160);
  const description = String(input.description || data.description || "").trim().slice(0, 280);
  return { title, description };
}

// Resolves the password hash for create/update. `currentHash` is the stored
// hash when editing: protected + blank password keeps it.
export async function resolvePasswordHash(input, currentHash = null) {
  if (!input.passwordProtected) return { hash: null };
  const password = typeof input.password === "string" ? input.password : "";
  if (password) return { hash: await sha256(password) };
  if (currentHash) return { hash: currentHash };
  return { error: "password_required", status: 400 };
}

export function publicFiles(files, origin, id) {
  return withSlugs(files).map(({ filename, slug }) => ({
    filename,
    slug,
    url: new URL(`/s/${id}/${slug}`, origin).toString(),
  }));
}
