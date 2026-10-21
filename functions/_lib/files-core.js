// Runtime-agnostic rules for multi-file shares, shared by the Functions and the
// homepage editor so limits, file names and slugs never disagree.
import { slugify, stripFrontmatter } from "./markdown-core.js";

export const LIMITS = {
  maxFiles: 20,
  maxFileChars: 100_000,
  maxTotalBytes: 1_000_000,
};

export const EXPIRATION_OPTIONS = [
  { value: "1h", label: "1 hour", ms: 3_600_000 },
  { value: "1d", label: "1 day", ms: 86_400_000 },
  { value: "7d", label: "7 days", ms: 604_800_000 },
  { value: "30d", label: "30 days", ms: 2_592_000_000 },
  { value: "never", label: "Never", ms: null },
];
export const DEFAULT_EXPIRATION = "30d";

export const MARKDOWN_EXTENSIONS = /\.(md|markdown|txt)$/i;

export function byteLength(text = "") {
  return new TextEncoder().encode(String(text)).length;
}

export function titleFromMarkdown(content = "") {
  const { data, body } = stripFrontmatter(content);
  const heading = String(body).match(/^#\s+(.+)$/m)?.[1];
  return String(data.title || heading || "").trim().slice(0, 160);
}

export function safeFilename(value, fallback = "share.md") {
  const name = String(value || "")
    .trim()
    .replace(/[\\/<>:"|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120);
  if (!name) return fallback;
  return MARKDOWN_EXTENSIONS.test(name) ? name : `${name}.md`;
}

// Name shown for a file the user typed without naming it.
export function defaultFilename(content = "", index = 0) {
  const title = titleFromMarkdown(content);
  return safeFilename(title, index === 0 ? "untitled.md" : `untitled-${index + 1}.md`);
}

function withSuffix(name, n) {
  const match = name.match(/^(.*?)(\.[^.]+)?$/);
  return `${match[1]}-${n}${match[2] || ""}`;
}

// Case-insensitively de-duplicates file names: notes.md, notes-2.md, ...
export function dedupeFilenames(names) {
  const seen = new Set();
  return names.map((name) => {
    let candidate = name;
    for (let n = 2; seen.has(candidate.toLowerCase()); n += 1) candidate = withSuffix(name, n);
    seen.add(candidate.toLowerCase());
    return candidate;
  });
}

// Slugs are derived from the ordered file names rather than stored, so they
// stay stable for a given list and need no extra column.
export function assignFileSlugs(filenames) {
  const seen = new Set();
  return filenames.map((filename) => {
    const base = slugify(String(filename).replace(MARKDOWN_EXTENSIONS, "")) || "file";
    let slug = base;
    for (let n = 2; seen.has(slug); n += 1) slug = `${base}-${n}`;
    seen.add(slug);
    return slug;
  });
}

// Maps relative links such as `./setup.md#install` onto another file of the
// same share. `toHref(slug, hash)` decides the URL shape for each runtime.
export function createFileLinkResolver(filenames, toHref) {
  const slugs = assignFileSlugs(filenames);
  const lookup = new Map();
  filenames.forEach((filename, index) => {
    const lower = String(filename).toLowerCase();
    lookup.set(lower, slugs[index]);
    lookup.set(lower.replace(MARKDOWN_EXTENSIONS, ""), slugs[index]);
  });
  return (href) => {
    const [path, hash = ""] = String(href).split("#");
    let name = path.split("/").pop() || "";
    try {
      name = decodeURIComponent(name);
    } catch {
      return "";
    }
    const slug = lookup.get(name.toLowerCase());
    return slug ? toHref(slug, hash) : "";
  };
}
