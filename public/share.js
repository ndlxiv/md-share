import { marked } from "./vendor/marked.esm.mjs";

const input = document.querySelector("#markdown-input");
const preview = document.querySelector("#markdown-preview");
const createButtons = [
  document.querySelector("#create-share"),
  document.querySelector("#create-share-secondary"),
  document.querySelector("#create-share-mobile"),
];
const createdPanel = document.querySelector("#created-panel");
const shareUrlInput = document.querySelector("#share-url");
const openShareUrl = document.querySelector("#open-share-url");
const copyShareUrl = document.querySelector("#copy-share-url");
const createAnother = document.querySelector("#create-another");
const createAnotherLabel = "Create Another Share";
const fileInput = document.querySelector("#file-input");
const dropZone = document.querySelector(".drop-zone");
const addFile = document.querySelector("#add-file");
const passwordProtect = document.querySelector("#password-protect");
const passwordRow = document.querySelector("#password-row");
let selectedFilename = "README.md";

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const slugify = (value = "") =>
  String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";

const allowedTags = new Set([
  "a", "blockquote", "br", "code", "del", "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "img", "input", "li", "ol", "p", "pre", "strong", "table", "tbody", "td", "th", "thead", "tr", "ul",
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
    const allowed = image ? ["http:", "https:", "data:"] : ["http:", "https:", "mailto:", "tel:"];
    if (allowed.includes(url.protocol)) return trimmed;
  } catch {
    return "";
  }
  return "";
}

function sanitizeAttributes(tag, rawAttrs = "") {
  const allowed = new Set([...(tagAttrs[tag] || []), ...globalAttrs]);
  const attrs = [];
  for (const match of rawAttrs.matchAll(/([:@A-Za-z0-9_-]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'`=<>]+))?/g)) {
    const name = match[1].toLowerCase();
    if (!allowed.has(name)) continue;
    let value = match[2] || "";
    value = value.replace(/^['"]|['"]$/g, "");
    if ((tag === "a" && name === "href") || (tag === "img" && name === "src")) {
      value = safeUrl(value, { image: tag === "img" });
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
  if (tag === "a" && attrs.some((attr) => attr.startsWith("href=\"http")) && !attrs.some((attr) => attr.startsWith("rel="))) attrs.push('rel="noreferrer"');
  if (tag === "a" && attrs.some((attr) => attr.startsWith("href=\"http")) && !attrs.some((attr) => attr.startsWith("target="))) attrs.push('target="_blank"');
  if (tag === "input" && !attrs.includes("disabled")) attrs.push("disabled");
  if (tag === "input") {
    const rank = (attr) => (attr.startsWith("type=") ? 0 : attr === "checked" ? 1 : attr === "disabled" ? 2 : 3);
    attrs.sort((a, b) => rank(a) - rank(b));
  }
  return attrs.length ? ` ${attrs.join(" ")}` : "";
}

function sanitizeHtml(html = "") {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?(?:script|style|iframe|object|embed|form)[\s\S]*?>/gi, (tag) => escapeHtml(tag))
    .replace(/<\/?([A-Za-z][A-Za-z0-9-]*)([^>]*)>/g, (full, rawTag, rawAttrs = "") => {
      const tag = rawTag.toLowerCase();
      if (!allowedTags.has(tag)) return escapeHtml(full);
      if (full.startsWith("</")) return `</${tag}>`;
      return `<${tag}${sanitizeAttributes(tag, rawAttrs)}>`;
    });
}

function stripFrontmatter(markdown = "") {
  const text = String(markdown).replace(/\r\n/g, "\n").replace(/^\uFEFF/, "");
  if (!text.startsWith("---\n")) return { body: text };
  const end = text.indexOf("\n---", 4);
  if (end === -1) return { body: text };
  return { body: text.slice(end + 4).replace(/^\n/, "") };
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

function renderMarkdown(markdown = "") {
  const { body } = stripFrontmatter(markdown);
  const raw = marked.parse(body, { async: false, breaks: false, gfm: true });
  return normalizeRenderedHtml(addHeadingIds(sanitizeHtml(raw)));
}

function updatePreview() {
  const value = input.value.trim();
  preview.classList.toggle("muted-preview", !value);
  preview.innerHTML = value ? renderMarkdown(input.value) : "Nothing to preview";
  createButtons.forEach((button) => (button.disabled = !value));
}

function updateFileLabel(filename = selectedFilename) {
  const fileNameNode = document.querySelector(".file-item span");
  const fileMetaNode = document.querySelector(".file-item small");
  if (fileNameNode) fileNameNode.textContent = filename;
  if (fileMetaNode) fileMetaNode.textContent = filename === "README.md" ? "Current document" : "Uploaded file";
}

async function createShare() {
  const content = input.value.trim();
  if (!content) return;
  createButtons.forEach((button) => (button.disabled = true));
  try {
    const response = await fetch("/api/shares", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content,
        filename: selectedFilename,
        expiration: document.querySelector("#expiration").value,
        burnAfterReading: document.querySelector("#burn-after-reading").checked,
        passwordProtected: passwordProtect.checked,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "create_failed");
    shareUrlInput.value = payload.url;
    openShareUrl.href = payload.url;
    createdPanel.hidden = false;
    createdPanel.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    alert(`Could not create share: ${error.message}`);
  } finally {
    updatePreview();
  }
}

async function loadFile(file) {
  if (!file) return;
  selectedFilename = file.name || "share.md";
  input.value = await file.text();
  updateFileLabel(selectedFilename);
  updatePreview();
}

input?.addEventListener("input", updatePreview);
createButtons.forEach((button) => button?.addEventListener("click", createShare));
copyShareUrl?.addEventListener("click", async () => {
  await navigator.clipboard.writeText(shareUrlInput.value);
  copyShareUrl.textContent = "✅";
  copyShareUrl.setAttribute("aria-label", "Copied share link");
});
createAnother?.addEventListener("click", () => {
  createdPanel.hidden = true;
  input.value = "";
  shareUrlInput.value = "";
  selectedFilename = "README.md";
  updateFileLabel(selectedFilename);
  updatePreview();
});
addFile?.addEventListener("click", () => fileInput.click());
fileInput?.addEventListener("change", () => loadFile(fileInput.files?.[0]));
dropZone?.addEventListener("dragover", (event) => event.preventDefault());
dropZone?.addEventListener("drop", (event) => {
  event.preventDefault();
  loadFile(event.dataTransfer.files?.[0]);
});
passwordProtect?.addEventListener("change", () => {
  passwordRow.hidden = !passwordProtect.checked;
});

if (createAnother) createAnother.textContent = createAnotherLabel;
updateFileLabel();
updatePreview();
