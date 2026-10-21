import { marked } from "marked";
import {
  escapeHtml,
  renderMarkdown as renderMarkdownWithMarked,
  sanitizeHtml,
  slugify,
  stripFrontmatter,
} from "./markdown-core.js";

export function renderMarkdown(markdown = "", options = {}) {
  return renderMarkdownWithMarked(marked, markdown, options);
}

export { escapeHtml, sanitizeHtml, slugify, stripFrontmatter };
