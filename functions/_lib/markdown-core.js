// Shared, marked-agnostic Markdown sanitizer + render pipeline.
//
// This is the single source of truth: the Cloudflare Function imports it
// directly and the homepage React island bundles it through Vite. Keep this
// module free of any runtime-specific imports (no `marked`, no Node APIs) so
// both runtimes can share it; `marked` is passed in.

export const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const slugify = (value = "") =>
  String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";

const allowedTags = new Set([
  "a", "blockquote", "br", "code", "dd", "del", "details", "dl", "dt", "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "img", "input", "kbd", "li", "mark", "ol", "p", "pre", "s", "strong", "sub", "summary", "sup", "table", "tbody", "td", "th", "thead", "tr", "ul",
]);
const globalAttrs = new Set(["class", "id"]);
const tagAttrs = {
  a: new Set(["href", "title", "target", "rel"]),
  code: new Set(["class"]),
  img: new Set(["src", "alt", "title"]),
  input: new Set(["type", "checked", "disabled"]),
  th: new Set(["align", "class"]),
  td: new Set(["align", "class"]),
};
const booleanAttrs = new Set(["checked", "disabled"]);

function safeUrl(value = "", { image = false } = {}) {
  const trimmed = String(value).trim();
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return trimmed;
  try {
    const url = new URL(trimmed);
    // data: URLs are only ever allowed for images, and only for image/* media
    // types: data:text/html and friends are classic XSS vectors.
    if (url.protocol === "data:") {
      return image && /^data:image\//i.test(trimmed) ? trimmed : "";
    }
    const allowed = image ? ["http:", "https:"] : ["http:", "https:", "mailto:", "tel:"];
    if (allowed.includes(url.protocol)) return trimmed;
  } catch {
    return "";
  }
  return "";
}

// Relative links (`setup.md`, `./guide.md#install`) are dropped unless the
// caller supplies a resolver, which maps them onto another file of the same
// share. The resolver may only return same-origin paths or fragments.
function resolveRelative(value, resolveLink) {
  const trimmed = String(value).trim();
  if (!resolveLink || !trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("//")) return "";
  const resolved = resolveLink(trimmed);
  return typeof resolved === "string" && /^[/#]/.test(resolved) && !resolved.startsWith("//") ? resolved : "";
}

function sanitizeAttributes(tag, rawAttrs = "", options = {}) {
  const allowed = new Set([...(tagAttrs[tag] || []), ...globalAttrs]);
  const attrs = [];
  for (const match of rawAttrs.matchAll(/([:@A-Za-z0-9_-]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'`=<>]+))?/g)) {
    const name = match[1].toLowerCase();
    if (!allowed.has(name)) continue;
    let value = match[2] || "";
    value = value.replace(/^['"]|['"]$/g, "");
    if ((tag === "a" && name === "href") || (tag === "img" && name === "src")) {
      const safe = safeUrl(value, { image: tag === "img" });
      value = safe || (tag === "a" ? resolveRelative(value, options.resolveLink) : "");
      if (!value) continue;
    }
    if (tag === "input") {
      if (name === "type" && value !== "checkbox") continue;
      if (name === "disabled") value = "";
    }
    if ((tag === "th" || tag === "td") && name === "align") {
      if (value === "right" || value === "center") attrs.push(`class="align-${value}"`);
      continue;
    }
    if (name === "target" && value !== "_blank") continue;
    if (booleanAttrs.has(name)) {
      attrs.push(name);
    } else {
      attrs.push(`${name}="${escapeHtml(value)}"`);
    }
  }
  if (tag === "a" && attrs.some((attr) => attr.startsWith("href=\"http")) && !attrs.some((attr) => attr.startsWith("rel="))) {
    attrs.push('rel="noreferrer"');
  }
  if (tag === "a" && attrs.some((attr) => attr.startsWith("href=\"http")) && !attrs.some((attr) => attr.startsWith("target="))) {
    attrs.push('target="_blank"');
  }
  if (tag === "input" && !attrs.includes("disabled")) attrs.push("disabled");
  if (tag === "input") {
    const rank = (attr) => (attr.startsWith("type=") ? 0 : attr === "checked" ? 1 : attr === "disabled" ? 2 : 3);
    attrs.sort((a, b) => rank(a) - rank(b));
  }
  return attrs.length ? ` ${attrs.join(" ")}` : "";
}

export function sanitizeHtml(html = "", options = {}) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?(?:script|style|iframe|object|embed|form)[\s\S]*?>/gi, (tag) => escapeHtml(tag))
    .replace(/<\/?([A-Za-z][A-Za-z0-9-]*)([^>]*)>/g, (full, rawTag, rawAttrs = "") => {
      const tag = rawTag.toLowerCase();
      if (!allowedTags.has(tag)) return escapeHtml(full);
      if (full.startsWith("</")) return `</${tag}>`;
      return `<${tag}${sanitizeAttributes(tag, rawAttrs, options)}>`;
    });
}

export function stripFrontmatter(markdown = "") {
  const text = String(markdown).replace(/\r\n/g, "\n").replace(/^\uFEFF/, "");
  if (!text.startsWith("---\n")) return { data: {}, body: text };
  const end = text.indexOf("\n---", 4);
  if (end === -1) return { data: {}, body: text };
  const raw = text.slice(4, end).trim();
  const body = text.slice(end + 4).replace(/^\n/, "");
  const data = {};
  for (const line of raw.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim().replace(/^['"]|['"]$/g, "");
    if (value === "true") value = true;
    if (value === "false") value = false;
    data[match[1]] = value;
  }
  return { data, body };
}

function textFromHtml(html = "") {
  return String(html).replace(/<[^>]*>/g, "").replace(/&[#A-Za-z0-9]+;/g, " ").trim();
}

function normalizeRenderedHtml(html = "") {
  return String(html)
    .replace(/<li><p>([\s\S]*?)<\/p>\s*(<ul>)/g, "<li>$1$2")
    .replace(/<li><p>([\s\S]*?)<\/p>\s*<\/li>/g, "<li>$1</li>")
    .replace(/>\s*(?:\r?\n)\s*</g, "><")
    .trim();
}

function addHeadingIds(html = "") {
  return String(html).replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_match, level, content) => {
    return `<h${level} id="${slugify(textFromHtml(content))}">${content}</h${level}>`;
  });
}

// `marked` is injected so this module stays runtime-agnostic. `options.resolveLink`
// rewrites relative links between files of a multi-file share.
export function renderMarkdown(marked, markdown = "", options = {}) {
  const { body } = stripFrontmatter(markdown);
  const raw = marked.parse(body, { async: false, breaks: false, gfm: true });
  return normalizeRenderedHtml(addHeadingIds(sanitizeHtml(raw, options)));
}
