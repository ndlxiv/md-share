import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const file = (...parts) => join(root, ...parts);

test("project has a single anonymous markdown sharing structure", () => {
  assert.equal(existsSync(file("src/pages/index.astro")), true);
  assert.equal(existsSync(file("functions/api/shares/index.js")), true);
  assert.equal(existsSync(file("functions/s/[id].js")), true);
  assert.equal(existsSync(file("public/share.js")), true);
  assert.equal(existsSync(file("migrations/0001_create_shares.sql")), true);
  // admin / content-collection / dead code removed
  assert.equal(existsSync(file("src/pages/admin.astro")), false);
  assert.equal(existsSync(file("public/admin.js")), false);
  assert.equal(existsSync(file("public/index.js")), false);
  assert.equal(existsSync(file("functions/api/docs")), false);
  assert.equal(existsSync(file("functions/p")), false);
  assert.equal(existsSync(file("src/content.config.ts")), false);
});

test("built homepage is a one-page markdown writer without burn-after-reading", () => {
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
  assert.match(html, /\/share\.js/);
  // exactly one Create Share button on the home screen
  assert.equal((html.match(/>Create Share</g) || []).length, 1);
  assert.doesNotMatch(html, /Burn after reading/);
  assert.doesNotMatch(html, /href="\/admin\/"/);

  const cssFile = readdirSync(file("dist", "_astro")).find((name) => name.endsWith(".css"));
  assert.ok(cssFile, "built CSS asset should exist");
  const css = readFileSync(file("dist", "_astro", cssFile), "utf8");
  assert.match(css, /--od-bg:\s*#fafafa/);
  assert.match(css, /--od-ink:\s*#111111/);
});

test("client script renders preview, sends password, and calls public share API", () => {
  const jsPath = file("dist/share.js");
  assert.equal(existsSync(jsPath), true, "share client script should be built");
  const js = readFileSync(jsPath, "utf8");
  assert.match(js, /\/api\/shares/);
  assert.match(js, /filename: selectedFilename/);
  assert.match(js, /updateFileLabel/);
  assert.match(js, /marked|renderMarkdown|preview/i);
  assert.match(js, /Create Another Share/);
  assert.match(js, /✅/);
  assert.match(js, /#share-password/);
  assert.doesNotMatch(js, /burnAfterReading/);
});

test("create API stores anonymous shares with expiration and optional password", () => {
  const source = readFileSync(file("functions/api/shares/index.js"), "utf8");
  assert.match(source, /onRequestPost/);
  assert.match(source, /content_required/);
  assert.match(source, /content_too_large/);
  assert.match(source, /INSERT INTO shares/);
  assert.match(source, /filename/);
  assert.match(source, /safeFilename/);
  assert.match(source, /expires_at/);
  assert.match(source, /password_hash/);
  assert.match(source, /sha256/);
  assert.match(source, /const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"/);
  assert.doesNotMatch(source, /requireAdmin/);
  assert.doesNotMatch(source, /burnAfterReading/);
});

test("public /s route server-renders shares with password and expiration handling", () => {
  const source = readFileSync(file("functions/s/[id].js"), "utf8");
  assert.match(source, /renderMarkdown/);
  assert.match(source, /FROM shares WHERE id = \?/);
  assert.match(source, /downloadFilename/);
  assert.match(source, /scriptJson/);
  assert.match(source, /aria-label="Copy to clipboard"/);
  assert.match(source, /aria-label="Download file"/);
  assert.match(source, />📋<\/button>/);
  assert.match(source, />⬇️<\/button>/);
  assert.match(source, /Raw/);
  // password gate + expiration enforcement
  assert.match(source, /password_hash/);
  assert.match(source, /name="password"/);
  assert.match(source, /sha256/);
  assert.match(source, /isExpired/);
  assert.match(source, /DELETE FROM shares WHERE id = \?/);
});

test("created share actions use icon-only controls with accessible labels", () => {
  const source = readFileSync(file("src", "pages", "index.astro"), "utf8");
  assert.match(source, /id="copy-share-url"[^>]+aria-label="Copy share link"[^>]*>📋<\/button>/);
  assert.match(source, /id="open-share-url"[^>]+aria-label="Open share"[^>]*>🔗<\/a>/);
  assert.doesNotMatch(source, /Burn after reading/);
});
