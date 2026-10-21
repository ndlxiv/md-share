// Server-side handler shared by /s/<id> and /s/<id>/<file>.
import { sha256, timingSafeEqual } from "./api.js";
import { createFileLinkResolver } from "./files-core.js";
import { renderMarkdown } from "./markdown.js";
import { gatePage, messagePage, sharePage } from "./pages.js";
import { deleteShare, isExpired, loadShare, rowFiles, withSlugs } from "./shares.js";
import { createZip } from "./zip.js";

// Hardening headers for every server-rendered share response. The page only
// uses inline <style>/<script> it ships itself, and images may be remote or
// inline data: URLs (restricted to image/* by the sanitizer).
export const SECURITY_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow",
  "content-security-policy":
    "default-src 'self'; img-src 'self' https: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};

const UNLOCK_COOKIE = "mds_unlock";
const UNLOCK_TTL_SECONDS = 3600;

const html = (markup, status = 200, headers = {}) =>
  new Response(markup, { status, headers: { ...SECURITY_HEADERS, ...headers } });

const param = (value) => String(Array.isArray(value) ? value[0] : value || "").trim();

function siteOrigin(request, env = {}) {
  return env.SITE_URL || new URL(request.url).origin;
}

// The unlock cookie is an HMAC keyed by the share's password hash, so it needs
// no extra secret and is invalidated as soon as the password changes.
async function sign(key, message) {
  const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

function readCookie(request, name) {
  const header = request.headers?.get?.("cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

async function hasUnlockCookie(request, row) {
  const [exp, signature] = readCookie(request, UNLOCK_COOKIE).split(".");
  if (!exp || !signature || Number(exp) * 1000 < Date.now()) return false;
  return timingSafeEqual(signature, await sign(row.password_hash, `${row.id}.${exp}`));
}

async function unlockCookie(request, row) {
  const exp = Math.floor(Date.now() / 1000) + UNLOCK_TTL_SECONDS;
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const value = `${exp}.${await sign(row.password_hash, `${row.id}.${exp}`)}`;
  return `${UNLOCK_COOKIE}=${value}; Path=/s/${row.id}; Max-Age=${UNLOCK_TTL_SECONDS}; HttpOnly; SameSite=Lax${secure}`;
}

function zipResponse(row, files) {
  const body = createZip(files.map((file) => ({ name: file.filename, content: file.content })));
  const name = `${(row.title || "share").replace(/[^\w.-]+/g, "-").slice(0, 60) || "share"}.zip`;
  return new Response(body, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function renderShare(request, row, files, active, headers = {}) {
  if (new URL(request.url).searchParams.get("download") === "zip") return zipResponse(row, files);
  const resolveLink = createFileLinkResolver(
    files.map((file) => file.filename),
    (slug, hash) => `/s/${row.id}/${slug}${hash ? `#${hash}` : ""}`
  );
  const body = renderMarkdown(active.content, { resolveLink });
  return html(sharePage({ row, files, active, body }), 200, headers);
}

const notFound = () =>
  html(messagePage({ title: "Share not found", message: "This share does not exist or has been deleted.", icon: "file-x" }), 404);

export async function handleView({ request, env, params }, method) {
  const id = param(params.id);
  if (!id) return Response.redirect(new URL("/", siteOrigin(request, env)), 302);

  const row = await loadShare(env.DB, id);
  if (!row) return notFound();

  if (isExpired(row)) {
    await deleteShare(env.DB, id);
    return html(messagePage({ title: "Share expired", message: "This link has expired and is no longer available.", icon: "clock" }), 410);
  }

  const files = withSlugs(rowFiles(row));
  const slug = param(params.file);
  const active = slug ? files.find((file) => file.slug === slug) : files[0];
  if (!active) {
    return html(
      messagePage({ title: "File not found", message: "This file is no longer part of the share.", icon: "file-x", link: { href: `/s/${id}`, label: "View all files" } }),
      404
    );
  }

  if (!row.password_hash) return renderShare(request, row, files, active);
  if (await hasUnlockCookie(request, row)) return renderShare(request, row, files, active);

  const action = new URL(request.url).pathname;
  if (method !== "POST") return html(gatePage({ action }), 401);

  const form = await request.formData().catch(() => null);
  const password = form ? String(form.get("password") || "") : "";
  if (password && timingSafeEqual(await sha256(password), row.password_hash)) {
    return renderShare(request, row, files, active, { "set-cookie": await unlockCookie(request, row) });
  }
  return html(gatePage({ action, error: password ? "Incorrect password. Try again." : "Enter the password to continue." }), 401);
}
