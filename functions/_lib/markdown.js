import { marked } from "marked";
import {
  escapeHtml,
  renderMarkdown as renderMarkdownWithMarked,
  sanitizeHtml,
  slugify,
  stripFrontmatter,
} from "./markdown-core.js";

export function renderMarkdown(markdown = "") {
  return renderMarkdownWithMarked(marked, markdown);
}

export { escapeHtml, sanitizeHtml, slugify, stripFrontmatter };
