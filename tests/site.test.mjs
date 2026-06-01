import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const file = (...parts) => join(root, ...parts);

test("project has production markdown sharing structure", () => {
  assert.equal(existsSync(file("src/content.config.ts")), true);
  assert.equal(existsSync(file("src/content/shares/example.md")), true);
  assert.equal(existsSync(file("src/pages/index.astro")), true);
  assert.equal(existsSync(file("src/pages/p/[slug].astro")), true);
});

test("built homepage lists public markdown shares", () => {
  const htmlPath = file("dist/index.html");
  assert.equal(existsSync(htmlPath), true, "run npm run build first");
  const html = readFileSync(htmlPath, "utf8");
  assert.match(html, /MD Share/);
  assert.match(html, /Example Markdown Share/);
  assert.match(html, /href="\/p\/example\/?"/);
});

test("built markdown page renders markdown content and copy link control", () => {
  const htmlPath = file("dist/p/example/index.html");
  assert.equal(existsSync(htmlPath), true, "example page should be pre-rendered");
  const html = readFileSync(htmlPath, "utf8");
  assert.match(html, /Hello bố/);
  assert.match(html, /hello markdown/);
  assert.match(html, /Copy link/);
});
