import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const file = (...parts) => join(root, ...parts);
const read = (...parts) => readFileSync(file(...parts), "utf8");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

test("project keeps the Astro + React + Pages Functions structure", () => {
  for (const path of [
    "src/pages/index.astro",
    "src/pages/edit.astro",
    "src/pages/404.astro",
    "src/components/ShareComposer.tsx",
    "src/components/icons/Icon.tsx",
    "functions/api/shares/index.js",
    "functions/api/shares/[id].js",
    "functions/s/[id].js",
    "functions/s/[id]/[file].js",
    "functions/e/[id].js",
    "migrations/0002_multi_file_and_edit_codes.sql",
    "public/robots.txt",
  ]) {
    assert.ok(existsSync(file(path)), `${path} exists`);
  }
  assert.equal(existsSync(file("public", "share.js")), false, "legacy vanilla client removed");
  assert.equal(existsSync(file("public", "vendor")), false, "vendored renderer copy removed");
  assert.match(read("astro.config.mjs"), /@astrojs\/react/);
});

test("no emoji, pictographic icon characters or em/en dashes in source", () => {
  const pictographic = /[\p{Extended_Pictographic}\u{FF0B}\u{2713}\u{2714}\u{2013}\u{2014}]|&[mn]dash;/u;
  const sources = [...walk(file("src")), ...walk(file("functions")), ...walk(file("public")), ...walk(file("tests")), ...walk(file("docs")), file("README.md")].filter(
    (path) => /\.(astro|tsx?|jsx?|mjs|css|html|txt|md)$/.test(path)
  );
  const offenders = sources.filter((path) => pictographic.test(readFileSync(path, "utf8"))).map((path) => relative(root, path));
  assert.deepEqual(offenders, []);
});

test("every icon goes through the shared React <Icon> registry", () => {
  const icon = read("src", "components", "icons", "Icon.tsx");
  assert.match(icon, /from "lucide-react"/);
  assert.match(icon, /export function Icon/);
  for (const component of ["ShareComposer.tsx", "CreatedPanel.tsx", "FileList.tsx", "CopyButton.tsx"]) {
    assert.match(read("src", "components", component), /<Icon name=/, `${component} renders <Icon>`);
  }
});

test("generated share-page icons and CSS are in sync with their sources", async () => {
  const { generate, OUTPUT } = await import(pathToFileURL(file("scripts", "generate-shared.mjs")));
  assert.equal((await generate()).replace(/\r\n/g, "\n"), readFileSync(OUTPUT, "utf8").replace(/\r\n/g, "\n"), "run `npm run generate`");
  assert.match(read("package.json"), /"prebuild": "npm run generate"/);
});

test("share pages render icons from the generated registry, not text glyphs", async () => {
  const { ICONS } = await import(pathToFileURL(file("functions", "_lib", "generated.js")));
  for (const name of ["link", "copy", "share", "download", "pencil", "lock", "check", "archive"]) {
    assert.match(ICONS[name], /^<svg[^>]+data-icon="[a-z-]+"[^>]+aria-hidden="true"/, `${name} icon`);
  }
  const pages = read("functions", "_lib", "pages.js");
  assert.match(pages, /aria-label="\$\{label\}"/, "icon-only buttons carry accessible labels");
});

test("editor is mobile-safe: viewport-fit, 16px inputs, safe-area action bar", () => {
  const layout = read("src", "layouts", "BaseLayout.astro");
  assert.match(layout, /viewport-fit=cover/);
  assert.match(layout, /lang="en"/);
  const shared = read("src", "styles", "shared.css");
  assert.match(shared, /font-size: 16px/);
  assert.match(shared, /@media \(pointer: coarse\)/);
  const global = read("src", "styles", "global.css");
  assert.match(global, /\.action-bar \{[^}]*env\(safe-area-inset-bottom\)/);
  assert.match(global, /@media \(min-width: 901px\) and \(min-height: 560px\)/);
  assert.match(global, /@media \(orientation: landscape\) and \(max-height: 559px\)/);
});

test("static assets are cached immutably and edit pages are not indexed", () => {
  const headers = read("public", "_headers");
  assert.match(headers, /\/_astro\/\*\s+Cache-Control: public, max-age=31536000, immutable/);
  assert.match(read("public", "robots.txt"), /Disallow: \/s\//);
  assert.match(read("functions", "e", "[id].js"), /env\.ASSETS\.fetch/);
});

test("README documents the domain, migrations and deferred rate limiting", () => {
  const readme = read("README.md");
  const config = read("astro.config.mjs");
  assert.match(config, /https:\/\/md-share-6y3\.pages\.dev/);
  assert.match(readme, /https:\/\/md-share-6y3\.pages\.dev/);
  assert.match(readme, /0002_multi_file_and_edit_codes\.sql/);
  assert.match(readme, /[Rr]ate limiting is deferred/);
});
