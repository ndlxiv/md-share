import { slugifyInput } from "../_lib/api.js";
import { escapeHtml, renderMarkdown } from "../_lib/markdown.js";

function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

const page = ({ title, description = "", body, raw, slug, filename = "share.md" }) => `<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex,nofollow" />
  <meta name="description" content="${escapeHtml(description || "Markdown share")}" />
  <title>${escapeHtml(title)} · MDShare</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <style>
    :root{color-scheme:light;--bg:#fbfdff;--dot:#dbe7f3;--text:#111827;--muted:#64748b;--panel:#fff;--border:#d7e0ea;--accent:#6ea8da}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);background:radial-gradient(var(--dot) 1px,transparent 1px);background-size:24px 24px;background-color:var(--bg)}
    .shell{width:min(980px,calc(100% - 32px));margin:0 auto;padding:34px 0 80px}.topbar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:24px}.brand{font-size:1.4rem;font-weight:800;text-decoration:none;color:var(--text);letter-spacing:-.04em}.meta{color:var(--muted);font-size:.92rem}.card{border:1px solid var(--border);border-radius:18px;background:rgba(255,255,255,.86);box-shadow:0 18px 50px rgba(15,23,42,.08);padding:24px}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap}.actions{display:flex;gap:8px;flex-wrap:wrap}.button{border:1px solid var(--border);background:#fff;color:var(--text);border-radius:10px;padding:10px 12px;text-decoration:none;font:inherit;cursor:pointer}.tabs{display:flex;gap:6px;margin-bottom:16px}.tab{border:1px solid var(--border);background:#fff;border-radius:999px;padding:8px 12px}.prose{font-size:1.06rem;line-height:1.75}.prose h1,.prose h2,.prose h3{letter-spacing:-.035em;line-height:1.15}.prose pre{background:#0f172a;color:#e5e7eb;border-radius:14px;padding:16px;overflow:auto}.prose code{background:#eaf1f8;border-radius:6px;padding:2px 5px}.prose pre code{background:transparent;padding:0}.raw{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;background:#f8fafc;border:1px solid var(--border);border-radius:14px;padding:16px;overflow:auto}.hidden{display:none}@media(max-width:720px){.shell{width:min(100% - 20px,980px);padding-top:18px}.card{padding:16px}.topbar{align-items:flex-start;flex-direction:column}}
  </style>
</head>
<body>
  <main class="shell">
    <div class="topbar"><a class="brand" href="/">MDShare</a><span class="meta">/s/${escapeHtml(slug)}</span></div>
    <section class="card">
      <div class="toolbar">
        <div><p class="meta">${escapeHtml(filename)}</p><h1>${escapeHtml(title)}</h1>${description ? `<p>${escapeHtml(description)}</p>` : ""}</div>
        <div class="actions"><button class="button" aria-label="Copy to clipboard" onclick="navigator.clipboard.writeText(location.href).then(()=>this.textContent='Copied')">Copy to clipboard</button><button class="button" aria-label="Download file" onclick="downloadRaw()">Download file</button></div>
      </div>
      <div class="tabs"><button class="tab" id="preview-tab" type="button">Preview</button><button class="tab" id="raw-tab" type="button">Raw</button></div>
      <article id="preview" class="prose">${body}</article>
      <pre id="raw" class="raw hidden">${escapeHtml(raw)}</pre>
    </section>
  </main>
  <script>
    const rawContent = ${scriptJson(raw)};
    const downloadFilename = ${scriptJson(filename)};
    const preview = document.querySelector('#preview');
    const raw = document.querySelector('#raw');
    document.querySelector('#preview-tab').onclick = () => { preview.classList.remove('hidden'); raw.classList.add('hidden'); };
    document.querySelector('#raw-tab').onclick = () => { raw.classList.remove('hidden'); preview.classList.add('hidden'); };
    function downloadRaw(){ const blob = new Blob([rawContent], {type:'text/markdown'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = downloadFilename; a.click(); URL.revokeObjectURL(a.href); }
  </script>
</body>
</html>`;

export async function onRequestGet({ env, params }) {
  const rawSlug = Array.isArray(params.slug) ? params.slug.join("/") : params.slug;
  const slug = slugifyInput(rawSlug || "");
  if (!slug) return Response.redirect(new URL("/", "https://md-share-6y3.pages.dev"), 302);

  const doc = await env.DB.prepare(
    "SELECT slug, title, description, content, COALESCE(filename, 'share.md') AS filename FROM documents WHERE slug = ? AND public = 1"
  ).bind(slug).first();

  if (!doc) {
    return new Response(page({ title: "Không tìm thấy", slug, raw: "", body: `<p>Không tìm thấy share này.</p>` }), {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  return new Response(page({ ...doc, raw: doc.content, body: renderMarkdown(doc.content) }), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
  });
}
