import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const file = (...parts) => join(root, ...parts);

test("project has production editable markdown sharing structure", () => {
  assert.equal(existsSync(file("src/pages/index.astro")), true);
  assert.equal(existsSync(file("src/pages/admin.astro")), true);
  assert.equal(existsSync(file("functions/p/[[slug]].js")), true);
  assert.equal(existsSync(file("functions/api/docs/index.js")), true);
  assert.equal(existsSync(file("migrations/0001_create_documents.sql")), true);
});

test("built homepage points readers to public markdown shares and admin", () => {
  const htmlPath = file("dist/index.html");
  assert.equal(existsSync(htmlPath), true, "run npm run build first");
  const html = readFileSync(htmlPath, "utf8");
  assert.match(html, /MD Share/);
  assert.match(html, /Open Admin/);
  const js = readFileSync(file("dist/index.js"), "utf8");
  assert.match(js, /\/api\/docs/);
  assert.match(html, /href="\/p\/example\/?"/);
});

test("built admin page supports upload and edit controls", () => {
  const htmlPath = file("dist/admin/index.html");
  assert.equal(existsSync(htmlPath), true, "admin page should be built");
  const html = readFileSync(htmlPath, "utf8");
  assert.match(html, /type="file"/);
  assert.match(html, /textarea/);
  assert.match(html, /Save/);
  assert.match(html, /\/admin\.js/);
});
