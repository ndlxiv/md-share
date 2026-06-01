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
const fileInput = document.querySelector("#file-input");
const dropZone = document.querySelector(".drop-zone");
const addFile = document.querySelector("#add-file");
const passwordProtect = document.querySelector("#password-protect");
const passwordRow = document.querySelector("#password-row");
const createAnotherLabel = "Create Another Share";
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

const inlineMarkdown = (value = "") => {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return html;
};

const isTableDelimiter = (line = "") =>
  /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

const isTableRow = (line = "") => line.includes("|") && !/^\s*```/.test(line);

const isHorizontalRule = (line = "") => /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);

function stripFrontmatter(markdown = "") {
  const text = String(markdown).replace(/\r\n/g, "\n").replace(/^\uFEFF/, "");
  if (!text.startsWith("---\n")) return { body: text };
  const end = text.indexOf("\n---", 4);
  if (end === -1) return { body: text };
  return { body: text.slice(end + 4).replace(/^\n/, "") };
}

function splitTableRow(line = "") {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function tableAlignments(delimiter = "") {
  return splitTableRow(delimiter).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    return "left";
  });
}

const alignClass = (align) => (align === "right" || align === "center" ? ` class="align-${align}"` : "");

function renderMarkdown(markdown = "") {
  const normalized = stripFrontmatter(markdown).body;
  const lines = normalized.split("\n");
  const html = [];
  let paragraph = [];
  let list = [];
  let listType = "ul";
  let inCode = false;
  let codeLang = "";
  let codeLines = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${inlineMarkdown(paragraph.join(" ").trim())}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      html.push(`<${listType}>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</${listType}>`);
      list = [];
      listType = "ul";
    }
  };
  const flushBlocks = () => {
    flushParagraph();
    flushList();
  };

  const renderTableAt = (index) => {
    if (!isTableRow(lines[index]) || !isTableDelimiter(lines[index + 1] || "")) return null;
    const headers = splitTableRow(lines[index]);
    const aligns = tableAlignments(lines[index + 1]);
    const rows = [];
    let cursor = index + 2;
    while (cursor < lines.length && isTableRow(lines[cursor]) && lines[cursor].trim()) {
      rows.push(splitTableRow(lines[cursor]));
      cursor += 1;
    }
    const thead = `<thead><tr>${headers.map((cell, i) => `<th${alignClass(aligns[i])}>${inlineMarkdown(cell)}</th>`).join("")}</tr></thead>`;
    const tbody = `<tbody>${rows
      .map((row) => `<tr>${headers.map((_, i) => `<td${alignClass(aligns[i])}>${inlineMarkdown(row[i] || "")}</td>`).join("")}</tr>`)
      .join("")}</tbody>`;
    return { html: `<table>${thead}${tbody}</table>`, nextIndex: cursor };
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const codeFence = line.match(/^```\s*([\w-]+)?\s*$/);
    if (codeFence) {
      if (inCode) {
        html.push(`<pre><code${codeLang ? ` class="language-${escapeHtml(codeLang)}"` : ""}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        inCode = false;
        codeLang = "";
        codeLines = [];
      } else {
        flushBlocks();
        inCode = true;
        codeLang = codeFence[1] || "";
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushBlocks();
      continue;
    }

    const table = renderTableAt(index);
    if (table) {
      flushBlocks();
      html.push(table.html);
      index = table.nextIndex - 1;
      continue;
    }

    if (isHorizontalRule(line)) {
      flushBlocks();
      html.push("<hr>");
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushBlocks();
      const level = heading[1].length;
      const text = heading[2].trim();
      html.push(`<h${level} id="${slugify(text)}">${inlineMarkdown(text)}</h${level}>`);
      continue;
    }

    const unorderedItem = line.match(/^[-*]\s+(.+)$/);
    const orderedItem = line.match(/^\d+[.)]\s+(.+)$/);
    if (unorderedItem || orderedItem) {
      flushParagraph();
      const nextType = orderedItem ? "ol" : "ul";
      if (list.length && listType !== nextType) flushList();
      listType = nextType;
      list.push((unorderedItem || orderedItem)[1].trim());
      continue;
    }

    const quote = line.match(/^>\s?(.+)$/);
    if (quote) {
      flushBlocks();
      html.push(`<blockquote>${inlineMarkdown(quote[1].trim())}</blockquote>`);
      continue;
    }

    paragraph.push(line.trim());
  }

  if (inCode) {
    html.push(`<pre><code${codeLang ? ` class="language-${escapeHtml(codeLang)}"` : ""}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  flushBlocks();
  return html.join("\n");
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
  copyShareUrl.textContent = "Copied";
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

updateFileLabel();
updatePreview();
