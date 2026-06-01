import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");

test("project has editable web UI routes and Cloudflare D1 functions", () => {
  assert.ok(existsSync(join(root, "src", "pages", "admin.astro")), "admin UI page should exist");
  assert.ok(existsSync(join(root, "functions", "api", "docs", "index.js")), "docs collection API should exist");
  assert.ok(existsSync(join(root, "functions", "api", "docs", "[slug].js")), "single doc API should exist");
  assert.ok(existsSync(join(root, "functions", "p", "[[slug]].js")), "dynamic public markdown page function should exist");
  assert.ok(existsSync(join(root, "migrations", "0001_create_documents.sql")), "D1 migration should exist");

  const wrangler = read("wrangler.toml");
  assert.match(wrangler, /\[\[d1_databases\]\]/, "wrangler should bind a D1 database");
  assert.match(wrangler, /binding\s*=\s*"DB"/, "D1 binding should be DB");

  const admin = read("src", "pages", "admin.astro");
  assert.match(admin, /type="file"/, "admin UI should support uploading markdown files");
  assert.match(admin, /textarea/, "admin UI should support editing markdown content");
  assert.match(admin, /localStorage/, "admin UI should remember the admin token locally");
});

test("markdown renderer escapes unsafe HTML and renders core markdown", async () => {
  const mod = await import(pathToFileURL(join(root, "functions", "_lib", "markdown.js")));
  const html = mod.renderMarkdown(`# Title\n\n<script>alert(1)</script>\n\n- one\n- two\n\n\`\`\`js\nconsole.log("x")\n\`\`\``);
  assert.match(html, /<h1 id="title">Title<\/h1>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /<ul>[\s\S]*<li>one<\/li>[\s\S]*<li>two<\/li>[\s\S]*<\/ul>/);
  assert.match(html, /<pre><code class="language-js">console\.log\(&quot;x&quot;\)/);
});

test("markdown renderer preserves tables, ordered lists, and richer inline formatting", async () => {
  const mod = await import(pathToFileURL(join(root, "functions", "_lib", "markdown.js")));
  const html = mod.renderMarkdown(`| Metric | Value | Note |\n|---|---:|:---:|\n| Revenue | £17.1M | **cleaned** data |\n| Customers | 5,852 | \`RFM\` base |\n\n1. First ordered item\n2. Second ordered item\n\n~~old~~ **bold** *italic* [Docs](https://example.com)`);

  assert.match(html, /<table>/);
  assert.match(html, /<thead><tr><th>Metric<\/th><th class="align-right">Value<\/th><th class="align-center">Note<\/th><\/tr><\/thead>/);
  assert.match(html, /<tbody>[\s\S]*<td>Revenue<\/td><td class="align-right">£17\.1M<\/td><td class="align-center"><strong>cleaned<\/strong> data<\/td>[\s\S]*<\/tbody>/);
  assert.match(html, /<ol>[\s\S]*<li>First ordered item<\/li>[\s\S]*<li>Second ordered item<\/li>[\s\S]*<\/ol>/);
  assert.match(html, /<del>old<\/del> <strong>bold<\/strong> <em>italic<\/em>/);
  assert.match(html, /<a href="https:\/\/example\.com" target="_blank" rel="noreferrer">Docs<\/a>/);
  assert.doesNotMatch(html, /\| Metric \|/);
});

test("admin API functions require bearer auth for writes", () => {
  const collectionApi = read("functions", "api", "docs", "index.js");
  const itemApi = read("functions", "api", "docs", "[slug].js");
  assert.match(collectionApi, /Authorization/i);
  assert.match(collectionApi, /ADMIN_TOKEN/);
  assert.match(itemApi, /Authorization/i);
  assert.match(itemApi, /ADMIN_TOKEN/);
  assert.match(collectionApi, /INSERT INTO documents/i);
  assert.match(itemApi, /UPDATE documents/i);
  assert.match(itemApi, /DELETE FROM documents/i);
});
