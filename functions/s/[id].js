import { sha256, timingSafeEqual } from "../_lib/api.js";
import { escapeHtml, renderMarkdown } from "../_lib/markdown.js";

// Hardening headers for every server-rendered share response. The page only
// uses same-origin assets plus inline <style>/<script> it ships itself, and
// images may be remote or inline data: URLs (restricted to image/* by the
// sanitizer), so the CSP stays tight without breaking the page.
const SECURITY_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "content-security-policy":
    "default-src 'self'; img-src 'self' https: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'self'",
};

function siteOrigin(request, env = {}) {
  return env.SITE_URL || new URL(request.url).origin;
}

function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

const BASE_STYLE = `:root{color-scheme:light;--bg:#fbfdff;--dot:#dbe7f3;--text:#111827;--muted:#64748b;--panel:#fff;--border:#d7e0ea;--accent:#6ea8da}
*{box-sizing:border-box}body{margin:0;min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);background:radial-gradient(var(--dot) 1px,transparent 1px);background-size:24px 24px;background-color:var(--bg)}
.shell{width:min(980px,calc(100% - 32px));margin:0 auto;padding:34px 0 80px}.topbar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:24px}.brand{font-size:1.4rem;font-weight:800;text-decoration:none;color:var(--text);letter-spacing:-.04em}.meta{color:var(--muted);font-size:.92rem}.card{border:1px solid var(--border);border-radius:18px;background:rgba(255,255,255,.86);box-shadow:0 18px 50px rgba(15,23,42,.08);padding:24px}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap}.actions{display:flex;gap:8px;flex-wrap:wrap}.button{border:1px solid var(--border);background:#fff;color:var(--text);border-radius:10px;padding:10px 12px;text-decoration:none;font:inherit;cursor:pointer}.button.primary{background:var(--accent);border-color:var(--accent);color:#06243a;font-weight:700}.tabs{display:flex;gap:6px;margin-bottom:16px;align-items:center;justify-content:space-between}.tab-group{display:flex;gap:6px}.tab{border:1px solid var(--border);background:#fff;border-radius:999px;padding:8px 12px}.field{display:flex;flex-direction:column;gap:8px;margin:14px 0}.field input{border:1px solid var(--border);border-radius:10px;padding:11px 12px;font:inherit}.error{color:#b91c1c;font-size:.92rem;min-height:1.2em}.prose{font-size:1.06rem;line-height:1.75}.prose h1,.prose h2,.prose h3{letter-spacing:-.035em;line-height:1.15}.prose hr{border:0;border-top:1px solid var(--border);margin:2rem 0}.prose table{display:block;width:100%;max-width:100%;overflow-x:auto;border-collapse:separate;border-spacing:0;margin:1.25rem 0;border:1px solid var(--border);border-radius:14px}.prose th,.prose td{padding:.82rem .95rem;border-bottom:1px solid var(--border);text-align:left;vertical-align:top}.prose th{background:#f1f5f9;font-weight:800}.prose tr:last-child td{border-bottom:0}.prose .align-right{text-align:right}.prose .align-center{text-align:center}.prose del{color:var(--muted)}.prose pre{background:#0f172a;color:#e5e7eb;border-radius:14px;padding:16px;overflow:auto}.prose code{background:#eaf1f8;border-radius:6px;padding:2px 5px}.prose pre code{background:transparent;padding:0}.raw{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;background:#f8fafc;border:1px solid var(--border);border-radius:14px;padding:16px;overflow:auto}.hidden{display:none}@media(max-width:720px){.shell{width:min(100% - 20px,980px);padding-top:18px}.card{padding:16px}.topbar{align-items:flex-start;flex-direction:column}.toolbar{align-items:flex-start}.prose table{display:block;overflow-x:auto;white-space:nowrap}.prose th,.prose td{white-space:normal;min-width:120px}}`;

const shell = ({ title, description = "", inner }) => `<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex,nofollow" />
  <meta name="description" content="${escapeHtml(description || "Markdown share")}" />
  <title>${escapeHtml(title)} · MDShare</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <style>${BASE_STYLE}</style>
</head>
<body>
  <main class="shell">
    <div class="topbar"><a class="brand" href="/">MDShare</a></div>
    ${inner}
  </main>
</body>
</html>`;

const contentPage = ({ title, description = "", body, raw, filename = "share.md" }) =>
  shell({
    title,
    description,
    inner: `<section class="card">
      <div class="toolbar">
        <div><p class="meta">${escapeHtml(filename)}</p><h1>${escapeHtml(title)}</h1>${description ? `<p>${escapeHtml(description)}</p>` : ""}</div>
      </div>
      <div class="tabs">
        <div class="tab-group"><button class="tab" id="preview-tab" type="button">Preview</button><button class="tab" id="raw-tab" type="button">Raw</button></div>
        <div class="actions"><button class="button" aria-label="Copy to clipboard" title="Copy to clipboard" onclick="copyLink(this)">📋</button><button class="button" aria-label="Copy Markdown source" title="Copy Markdown source" onclick="copySource(this)">📄</button><button class="button" aria-label="Share" title="Share" onclick="shareLink(this)">📤</button><button class="button" aria-label="Download file" title="Download file" onclick="downloadRaw()">⬇️</button></div>
      </div>
      <article id="preview" class="prose">${body}</article>
      <pre id="raw" class="raw hidden">${escapeHtml(raw)}</pre>
    </section>
    <script>
      const rawContent = ${scriptJson(raw)};
      const downloadFilename = ${scriptJson(filename)};
      const preview = document.querySelector('#preview');
      const raw = document.querySelector('#raw');
      document.querySelector('#preview-tab').onclick = () => { preview.classList.remove('hidden'); raw.classList.add('hidden'); };
      document.querySelector('#raw-tab').onclick = () => { raw.classList.remove('hidden'); preview.classList.add('hidden'); };
      function flashCopied(btn, icon){ btn.textContent = '✅'; clearTimeout(btn._resetTimer); btn._resetTimer = setTimeout(() => { btn.textContent = icon; }, 1600); }
      function copyLink(btn){ navigator.clipboard.writeText(location.href).then(() => { btn.textContent = '✅'; clearTimeout(btn._resetTimer); btn._resetTimer = setTimeout(() => { btn.textContent = '📋'; }, 1600); }); }
      function copySource(btn){ navigator.clipboard.writeText(rawContent).then(() => flashCopied(btn, '📄')); }
      function shareLink(btn){ const data = { title: document.title, url: location.href }; if (navigator.share) { navigator.share(data).catch(() => {}); } else { navigator.clipboard.writeText(location.href).then(() => flashCopied(btn, '📤')); } }
      function downloadRaw(){ const blob = new Blob([rawContent], {type:'text/markdown'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = downloadFilename; a.click(); URL.revokeObjectURL(a.href); }
    </script>`,
  });

const gatePage = ({ id, title = "Protected share", error = "" }) =>
  shell({
    title,
    id,
    inner: `<section class="card">
      <h1>🔒 Protected share</h1>
      <p>Share này được bảo vệ bằng mật khẩu. Nhập mật khẩu để xem nội dung.</p>
      <form method="POST" action="/s/${escapeHtml(id)}">
        <label class="field">Password
          <input type="password" name="password" autocomplete="off" autofocus required />
        </label>
        <p class="error">${escapeHtml(error)}</p>
        <button class="button primary" type="submit">Unlock</button>
      </form>
    </section>`,
  });

const messagePage = ({ title, message }) =>
  shell({ title, inner: `<section class="card"><h1>${escapeHtml(title)}</h1><p>${message}</p></section>` });

async function loadShare(env, id) {
  return env.DB.prepare(
    "SELECT id, title, description, content, COALESCE(filename, 'share.md') AS filename, expires_at, password_hash FROM shares WHERE id = ?"
  ).bind(id).first();
}

function isExpired(row) {
  return Boolean(row.expires_at) && Date.now() > Date.parse(row.expires_at);
}

function renderShare(row) {
  return new Response(
    contentPage({ title: row.title, description: row.description, filename: row.filename, raw: row.content, body: renderMarkdown(row.content) }),
    { headers: { ...SECURITY_HEADERS } }
  );
}

const html = (markup, status = 200) =>
  new Response(markup, { status, headers: { ...SECURITY_HEADERS } });

function getId(params) {
  return String(Array.isArray(params.id) ? params.id[0] : params.id || "").trim();
}

export async function onRequestGet({ request, env, params }) {
  const id = getId(params);
  if (!id) return Response.redirect(new URL("/", siteOrigin(request, env)), 302);

  const row = await loadShare(env, id);
  if (!row) return html(messagePage({ title: "Không tìm thấy", message: "Không tìm thấy share này." }), 404);

  if (isExpired(row)) {
    await env.DB.prepare("DELETE FROM shares WHERE id = ?").bind(id).run();
    return html(messagePage({ title: "Share đã hết hạn", message: "Liên kết này đã hết hạn và không còn khả dụng." }), 410);
  }

  if (row.password_hash) return html(gatePage({ id, title: row.title }), 401);

  return renderShare(row);
}

export async function onRequestPost({ request, env, params }) {
  const id = getId(params);
  if (!id) return Response.redirect(new URL("/", siteOrigin(request, env)), 302);

  const row = await loadShare(env, id);
  if (!row) return html(messagePage({ title: "Không tìm thấy", message: "Không tìm thấy share này." }), 404);

  if (isExpired(row)) {
    await env.DB.prepare("DELETE FROM shares WHERE id = ?").bind(id).run();
    return html(messagePage({ title: "Share đã hết hạn", message: "Liên kết này đã hết hạn và không còn khả dụng." }), 410);
  }

  if (!row.password_hash) return renderShare(row);

  const form = await request.formData().catch(() => null);
  const password = form ? String(form.get("password") || "") : "";
  if (password && timingSafeEqual(await sha256(password), row.password_hash)) return renderShare(row);

  return html(gatePage({ id, title: row.title, error: password ? "Sai mật khẩu, thử lại." : "Cần nhập mật khẩu." }), 401);
}
