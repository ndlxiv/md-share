import { escapeHtml, renderMarkdown } from "../_lib/markdown.js";
import { slugifyInput } from "../_lib/api.js";

const page = ({ title, description = "", body, slug }) => `<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="${escapeHtml(description)}" />
  <title>${escapeHtml(title)} · MD Share</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <style>
    :root{color-scheme:dark;--bg:#0b1020;--panel:rgba(255,255,255,.06);--text:#edf2ff;--muted:#aab6d3;--accent:#78dbff;--border:rgba(255,255,255,.14)}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);background:radial-gradient(circle at top left,rgba(120,219,255,.18),transparent 32rem),linear-gradient(135deg,#0b1020,#111827 58%,#090d18)}
    a{color:inherit}.container{width:min(960px,calc(100% - 32px));margin:0 auto}.site-header{padding:28px 0 12px}.nav{display:flex;align-items:center;justify-content:space-between;gap:16px}.brand{text-decoration:none;font-weight:800;letter-spacing:-.04em;font-size:1.2rem}.brand span{color:var(--accent)}.nav-link{color:var(--muted);text-decoration:none}
    .article-shell{width:min(820px,calc(100% - 32px));margin:44px auto 80px}.article-header{padding:28px;border:1px solid var(--border);border-radius:28px;background:var(--panel);box-shadow:0 24px 80px rgba(0,0,0,.35);margin-bottom:20px}.article-header h1{font-size:clamp(2.2rem,7vw,4rem);line-height:.95;letter-spacing:-.08em;margin:12px 0 16px}.article-meta,.lead,.footer{color:var(--muted)}.actions{display:flex;flex-wrap:wrap;gap:10px}.button{border:1px solid var(--border);background:rgba(255,255,255,.08);color:var(--text);border-radius:999px;padding:10px 14px;cursor:pointer;text-decoration:none;font:inherit}
    .prose{padding:30px;border:1px solid var(--border);border-radius:28px;background:rgba(5,8,18,.62);line-height:1.75;font-size:1.06rem}.prose h1,.prose h2,.prose h3{letter-spacing:-.04em;line-height:1.1}.prose p,.prose li,.prose blockquote{color:#d8e1f7}.prose blockquote{margin:1.5rem 0;padding:1rem 1.2rem;border-left:4px solid var(--accent);background:rgba(120,219,255,.08);border-radius:12px}.prose code{background:rgba(255,255,255,.1);padding:.15rem .35rem;border-radius:.4rem}.prose pre{padding:1rem;border-radius:16px;overflow-x:auto;border:1px solid var(--border)}.prose pre code{background:transparent;padding:0}.footer{padding:36px 0 60px;font-size:.92rem}
  </style>
</head>
<body>
<header class="site-header"><nav class="container nav" aria-label="Main navigation"><a class="brand" href="/">MD<span>Share</span></a><a class="nav-link" href="/admin/">Admin</a></nav></header>
<main class="article-shell">
  <header class="article-header">
    <p class="article-meta">/p/${escapeHtml(slug)}</p>
    <h1>${escapeHtml(title)}</h1>
    ${description ? `<p class="lead">${escapeHtml(description)}</p>` : ""}
    <div class="actions"><button class="button" onclick="navigator.clipboard.writeText(location.href).then(()=>this.textContent='Copied')">Copy link</button><a class="button" href="/admin/?edit=${encodeURIComponent(slug)}">Edit</a></div>
  </header>
  <article class="prose">${body}</article>
</main>
<footer class="container footer">Editable Markdown sharing powered by Cloudflare Pages Functions + D1.</footer>
</body>
</html>`;

export async function onRequestGet({ env, params }) {
  const rawSlug = Array.isArray(params.slug) ? params.slug.join("/") : params.slug;
  const slug = slugifyInput(rawSlug || "");
  if (!slug) return Response.redirect(new URL("/", "https://md-share-6y3.pages.dev"), 302);
  const doc = await env.DB.prepare(
    "SELECT slug, title, description, content FROM documents WHERE slug = ? AND public = 1"
  ).bind(slug).first();
  if (!doc) {
    return new Response(page({ title: "Không tìm thấy", slug, body: `<p>Không có tài liệu public nào ở slug <code>${escapeHtml(slug)}</code>.</p>` }), {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  return new Response(page({ ...doc, body: renderMarkdown(doc.content) }), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
  });
}
