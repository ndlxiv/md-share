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

export function renderMarkdown(markdown = "") {
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

export { escapeHtml, slugify };
