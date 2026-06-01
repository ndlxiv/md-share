import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const loadRenderer = () => import(pathToFileURL(join(root, "functions", "_lib", "markdown.js")));

test("markdown renderer escapes unsafe HTML and renders core markdown", async () => {
  const mod = await loadRenderer();
  const html = mod.renderMarkdown(`# Title\n\n<script>alert(1)</script>\n\n- one\n- two\n\n\`\`\`js\nconsole.log("x")\n\`\`\``);
  assert.match(html, /<h1 id="title">Title<\/h1>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /<ul>[\s\S]*<li>one<\/li>[\s\S]*<li>two<\/li>[\s\S]*<\/ul>/);
  assert.match(html, /<pre><code class="language-js">console\.log\(&quot;x&quot;\)/);
});

test("markdown renderer preserves tables, ordered lists, and richer inline formatting", async () => {
  const mod = await loadRenderer();
  const html = mod.renderMarkdown(`| Metric | Value | Note |\n|---|---:|:---:|\n| Revenue | £17.1M | **cleaned** data |\n| Customers | 5,852 | \`RFM\` base |\n\n1. First ordered item\n2. Second ordered item\n\n~~old~~ **bold** *italic* [Docs](https://example.com)`);

  assert.match(html, /<table>/);
  assert.match(html, /<thead><tr><th>Metric<\/th><th class="align-right">Value<\/th><th class="align-center">Note<\/th><\/tr><\/thead>/);
  assert.match(html, /<tbody>[\s\S]*<td>Revenue<\/td><td class="align-right">£17\.1M<\/td><td class="align-center"><strong>cleaned<\/strong> data<\/td>[\s\S]*<\/tbody>/);
  assert.match(html, /<ol>[\s\S]*<li>First ordered item<\/li>[\s\S]*<li>Second ordered item<\/li>[\s\S]*<\/ol>/);
  assert.match(html, /<del>old<\/del> <strong>bold<\/strong> <em>italic<\/em>/);
  assert.match(html, /<a[^>]+href="https:\/\/example\.com"[^>]*>Docs<\/a>/);
  assert.doesNotMatch(html, /\| Metric \|/);
});

test("markdown renderer turns section dividers into horizontal rules", async () => {
  const mod = await loadRenderer();
  const html = mod.renderMarkdown(`Intro\n\n---\n\nNext section\n\n***\n\nFinal section`);

  assert.match(html, /<p>Intro<\/p>\s*<hr>\s*<p>Next section<\/p>\s*<hr>\s*<p>Final section<\/p>/);
  assert.doesNotMatch(html, /<p>---<\/p>/);
  assert.doesNotMatch(html, /<p>\*\*\*<\/p>/);
});

test("markdown renderer hides frontmatter from preview output", async () => {
  const mod = await loadRenderer();
  const html = mod.renderMarkdown(`---\r\ntitle: Hidden Metadata\r\ndescription: Should not render\r\n---\r\n# Visible Title`);

  assert.match(html, /<h1 id="visible-title">Visible Title<\/h1>/);
  assert.doesNotMatch(html, /Hidden Metadata/);
  assert.doesNotMatch(html, /Should not render/);
  assert.doesNotMatch(html, /<p>---<\/p>/);
});

test("markdown renderer covers common GitHub-style markdown", async () => {
  const mod = await loadRenderer();
  const html = mod.renderMarkdown(`#### H4\n\n__bold__ _italic_\n\n![Logo](https://example.com/logo.png)\n\n[Relative](/docs)\n\n+ plus item\n\n- parent\n  - child\n\n- [x] done\n- [ ] todo\n\n~~~js\nconsole.log(1)\n~~~\n\n<https://example.com>`);

  assert.match(html, /<h4[^>]*>H4<\/h4>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<img[^>]+src="https:\/\/example\.com\/logo\.png"[^>]+alt="Logo"/);
  assert.match(html, /<a href="\/docs"[^>]*>Relative<\/a>/);
  assert.match(html, /<ul>[\s\S]*<li>plus item<\/li>[\s\S]*<\/ul>/);
  assert.match(html, /<li>parent[\s\S]*<ul>[\s\S]*<li>child<\/li>[\s\S]*<\/ul>[\s\S]*<\/li>/);
  assert.match(html, /<input[^>]+type="checkbox"[^>]+checked/);
  assert.match(html, /<input[^>]+type="checkbox"/);
  assert.match(html, /<pre><code class="language-js">console\.log\(1\)\n<\/code><\/pre>/);
  assert.match(html, /<a href="https:\/\/example\.com"[^>]*>https:\/\/example\.com<\/a>/);
});
