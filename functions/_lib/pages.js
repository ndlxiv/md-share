// HTML templates for the server-rendered share pages. Icons and CSS come from
// functions/_lib/generated.js, which scripts/generate-shared.mjs renders from
// the same React <Icon> component and stylesheet the homepage uses, so the
// Worker ships plain HTML with no React runtime.
import { ICONS, SHARED_CSS } from "./generated.js";
import { escapeHtml } from "./markdown.js";

export const icon = (name) => ICONS[name] || "";

function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const time = (iso) => `<time datetime="${escapeHtml(iso)}">${escapeHtml(dateFormat.format(new Date(iso)))} UTC</time>`;

const layout = ({ title, description = "", body, script = "" }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex,nofollow" />
<meta name="description" content="${escapeHtml(description || "Markdown share")}" />
<meta name="theme-color" content="#fafafa" />
<title>${escapeHtml(title)} · MDShare</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<style>${SHARED_CSS}</style>
</head>
<body>
<a class="skip-link" href="#content">Skip to content</a>
<header class="site-header">
  <nav class="container nav" aria-label="Main navigation">
    <a class="brand" href="/">MD<span>Share</span></a>
    <a class="button sm" href="/">${icon("plus")}<span>New share</span></a>
  </nav>
</header>
${body}
${script ? `<script>${script}</script>` : ""}
</body>
</html>`;

function copyButton(action, label, iconName) {
  return `<button class="icon-button copy-button" type="button" data-action="${action}" aria-label="${label}" title="${label}"><span class="icon-idle">${icon(iconName)}</span><span class="icon-done">${icon("check")}</span></button>`;
}

const VIEW_SCRIPT = `
const data = JSON.parse(document.getElementById('share-data').textContent);
const preview = document.getElementById('preview');
const raw = document.getElementById('raw');
const tabs = document.querySelectorAll('[data-tab]');
const status = document.getElementById('action-status');
tabs.forEach((tab) => tab.addEventListener('click', () => {
  const showRaw = tab.dataset.tab === 'raw';
  raw.hidden = !showRaw;
  preview.hidden = showRaw;
  tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
}));
function flash(button, message) {
  button.classList.add('is-copied');
  status.textContent = message;
  clearTimeout(button._reset);
  button._reset = setTimeout(() => { button.classList.remove('is-copied'); status.textContent = ''; }, 1600);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
const actions = {
  async 'copy-link'(button) { if (await copy(data.url)) flash(button, 'Link copied'); },
  async 'copy-source'(button) { if (await copy(data.raw)) flash(button, 'Markdown copied'); },
  async share(button) {
    if (navigator.share) { navigator.share({ title: document.title, url: data.url }).catch(() => {}); return; }
    if (await copy(data.url)) flash(button, 'Link copied');
  },
  download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data.raw], { type: 'text/markdown;charset=utf-8' }));
    a.download = data.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
};
document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => actions[button.dataset.action](button)));
const select = document.getElementById('file-select');
if (select) select.addEventListener('change', () => { location.href = select.value; });
const local = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
document.querySelectorAll('time[datetime]').forEach((node) => { node.textContent = local.format(new Date(node.dateTime)); });
`;

export function sharePage({ row, files, active, body }) {
  const multi = files.length > 1;
  const base = `/s/${encodeURIComponent(row.id)}`;
  const fileHref = (file) => `${base}/${encodeURIComponent(file.slug)}`;
  const index = files.indexOf(active);
  const prev = files[index - 1];
  const next = files[index + 1];
  const url = multi && index > 0 ? fileHref(active) : base;

  const meta = [
    row.updated_at ? `Updated ${time(row.updated_at)}` : row.created_at ? `Created ${time(row.created_at)}` : "",
    row.expires_at ? `Expires ${time(row.expires_at)}` : "Never expires",
  ].filter(Boolean).join(" · ");

  const sidebar = multi
    ? `<aside class="view-sidebar card" aria-label="Files in this share">
        <div class="panel-title"><span>Files</span><span class="pill">${files.length}</span></div>
        <nav class="file-nav">${files
          .map((file) => `<a class="file-link${file === active ? " active" : ""}" href="${fileHref(file)}"${file === active ? ' aria-current="page"' : ""}>${icon("file-text")}<span>${escapeHtml(file.filename)}</span></a>`)
          .join("")}</nav>
        <a class="button wide" href="${base}?download=zip" download>${icon("archive")}<span>Download all (.zip)</span></a>
      </aside>`
    : "";

  const fileSelect = multi
    ? `<label class="file-select"><span class="sr-only">Choose a file</span>${icon("files")}<select id="file-select">${files
        .map((file) => `<option value="${fileHref(file)}"${file === active ? " selected" : ""}>${escapeHtml(file.filename)}</option>`)
        .join("")}</select></label>`
    : "";

  const pager = multi
    ? `<nav class="pager" aria-label="Previous and next file">
        ${prev ? `<a class="button" href="${fileHref(prev)}">${icon("chevron-left")}<span>${escapeHtml(prev.filename)}</span></a>` : "<span></span>"}
        ${next ? `<a class="button" href="${fileHref(next)}"><span>${escapeHtml(next.filename)}</span>${icon("chevron-right")}</a>` : "<span></span>"}
      </nav>
      <a class="button wide zip-mobile" href="${base}?download=zip" download>${icon("archive")}<span>Download all (.zip)</span></a>`
    : "";

  const editLink = row.edit_code_hash
    ? `<a class="icon-button" href="/e/${encodeURIComponent(row.id)}" aria-label="Edit share" title="Edit share">${icon("pencil")}</a>`
    : "";

  return layout({
    title: multi ? `${active.filename} · ${row.title}` : row.title,
    description: row.description,
    body: `<main id="content" class="view-shell${multi ? " has-files" : ""}">
      ${sidebar}
      <section class="view-card card" aria-label="${escapeHtml(active.filename)}">
        <div class="view-head">
          <div class="view-file">${icon("file-text")}<strong>${escapeHtml(active.filename)}</strong></div>
          <p class="meta">${meta}</p>
        </div>
        ${fileSelect}
        <div class="view-toolbar">
          <div class="segmented" role="tablist" aria-label="View mode">
            <button type="button" role="tab" data-tab="preview" aria-selected="true">${icon("eye")}<span>Preview</span></button>
            <button type="button" role="tab" data-tab="raw" aria-selected="false">${icon("code")}<span>Raw</span></button>
          </div>
          <div class="actions">
            ${copyButton("copy-link", "Copy link", "link")}
            ${copyButton("copy-source", "Copy Markdown source", "copy")}
            ${copyButton("share", "Share", "share")}
            <button class="icon-button" type="button" data-action="download" aria-label="Download file" title="Download file">${icon("download")}</button>
            ${editLink}
          </div>
        </div>
        <p id="action-status" class="sr-only" aria-live="polite"></p>
        <article id="preview" class="prose">${body}</article>
        <pre id="raw" class="raw" hidden>${escapeHtml(active.content)}</pre>
        ${pager}
      </section>
    </main>
    <script type="application/json" id="share-data">${scriptJson({ raw: active.content, filename: active.filename, url })}</script>`,
    script: VIEW_SCRIPT,
  });
}

export function gatePage({ action, error = "" }) {
  return layout({
    title: "Protected share",
    body: `<main id="content" class="narrow-shell">
      <section class="card notice-card">
        <div class="notice-icon">${icon("lock")}</div>
        <h1>Protected share</h1>
        <p class="meta">This share is password protected. Enter the password to view it.</p>
        <form class="stack" method="POST" action="${escapeHtml(action)}">
          <label class="field"><span>Password</span>
            <input type="password" name="password" autocomplete="current-password" autofocus required />
          </label>
          ${error ? `<p class="form-error" role="alert">${icon("alert")}<span>${escapeHtml(error)}</span></p>` : ""}
          <button class="button primary wide" type="submit">${icon("key")}<span>Unlock</span></button>
        </form>
      </section>
    </main>`,
  });
}

export function messagePage({ title, message, icon: iconName = "alert", link = { href: "/", label: "Create a new share" } }) {
  return layout({
    title,
    body: `<main id="content" class="narrow-shell">
      <section class="card notice-card">
        <div class="notice-icon">${icon(iconName)}</div>
        <h1>${escapeHtml(title)}</h1>
        <p class="meta">${escapeHtml(message)}</p>
        <a class="button primary wide" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>
      </section>
    </main>`,
  });
}
