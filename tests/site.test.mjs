import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const file = (...parts) => join(root, ...parts);

test("project has simple public markdown sharing structure", () => {
  assert.equal(existsSync(file("src/pages/index.astro")), true);
  assert.equal(existsSync(file("functions/api/shares/index.js")), true);
  assert.equal(existsSync(file("functions/s/[[slug]].js")), true);
  assert.equal(existsSync(file("public/share.js")), true);
  assert.equal(existsSync(file("migrations/0001_create_documents.sql")), true);
});

test("built homepage is a one-page markdown writer like the reference", () => {
  const htmlPath = file("dist/index.html");
  assert.equal(existsSync(htmlPath), true, "run npm run build first");
  const html = readFileSync(htmlPath, "utf8");
  assert.match(html, /MDShare/);
  assert.match(html, /Open Design inspired/);
  assert.match(html, /Create Share/);
  assert.match(html, /Enter your markdown here/);
  assert.match(html, /Drop \.md files here/);
  assert.match(html, /Password protect/);
  assert.match(html, /Expiration/);
  assert.match(html, /Burn after reading/);
  assert.match(html, /mobile-action-bar/);
  assert.match(html, /\/share\.js/);
  assert.doesNotMatch(html, /Open Admin/);

  const cssFile = readdirSync(file("dist", "_astro")).find((name) => name.endsWith(".css"));
  assert.ok(cssFile, "built CSS asset should exist");
  const css = readFileSync(file("dist", "_astro", cssFile), "utf8");
  assert.match(css, /--od-bg:\s*#fafafa/);
  assert.match(css, /--od-ink:\s*#111111/);
  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(css, /@media\(max-width:640px\)/);
});

test("client script renders preview and calls public share API", () => {
  const jsPath = file("dist/share.js");
  assert.equal(existsSync(jsPath), true, "share client script should be built");
  const js = readFileSync(jsPath, "utf8");
  assert.match(js, /\/api\/shares/);
  assert.match(js, /filename: selectedFilename/);
  assert.match(js, /updateFileLabel/);
  assert.match(js, /marked|renderMarkdown|preview/i);
  assert.match(js, /Create Another Share/);
});

test("public share API accepts unauthenticated markdown with validation", () => {
  const apiPath = file("functions/api/shares/index.js");
  const source = readFileSync(apiPath, "utf8");
  assert.match(source, /onRequestPost/);
  assert.match(source, /content_required/);
  assert.match(source, /content_too_large/);
  assert.match(source, /INSERT INTO documents/);
  assert.match(source, /filename/);
  assert.match(source, /safeFilename/);
  assert.match(source, /const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"/);
  assert.doesNotMatch(source, /requireAdmin/);
});

test("public /s route renders stored markdown shares", () => {
  const routePath = file("functions/s/[[slug]].js");
  const source = readFileSync(routePath, "utf8");
  assert.match(source, /renderMarkdown/);
  assert.match(source, /SELECT slug, title, description, content, COALESCE\(filename/);
  assert.match(source, /downloadFilename/);
  assert.match(source, /scriptJson/);
  assert.doesNotMatch(source, /README\.md<\/p>/);
  assert.match(source, /Copy to clipboard/);
  assert.match(source, /Raw/);
});
