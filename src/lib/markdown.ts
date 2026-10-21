import { marked } from "marked";
import { renderMarkdown as renderWithMarked } from "../../functions/_lib/markdown-core.js";

export function renderMarkdown(markdown: string, options: { resolveLink?: (href: string) => string } = {}) {
  return renderWithMarked(marked, markdown, options) as string;
}

export function formatBytes(bytes: number) {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(bytes < 10_000 ? 1 : 0)} KB`;
  return `${(bytes / 1_000_000).toFixed(2)} MB`;
}
