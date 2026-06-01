import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const file = (...parts) => join(root, ...parts);
const loadRenderer = () => import(pathToFileURL(join(root, "functions", "_lib", "markdown.js")));
const normalizeSource = (text) => text.replace(/\r\n/g, "\n");

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

test("markdown renderer keeps practical inline HTML semantics", async () => {
  const mod = await loadRenderer();
  const html = mod.renderMarkdown(
    `Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to copy. E=mc<sup>2</sup>, H<sub>2</sub>O, <mark>highlight</mark>, <s>struck</s>.`
  );

  assert.match(html, /<kbd>Ctrl<\/kbd>/);
  assert.match(html, /<sup>2<\/sup>/);
  assert.match(html, /<sub>2<\/sub>/);
  assert.match(html, /<mark>highlight<\/mark>/);
  assert.match(html, /<s>struck<\/s>/);
});

test("markdown renderer supports collapsible details/summary and definition lists", async () => {
  const mod = await loadRenderer();
  const html = mod.renderMarkdown(
    `<details>\n<summary>More info</summary>\n\nHidden body text\n\n</details>\n\n<dl>\n<dt>Term</dt>\n<dd>Definition</dd>\n</dl>`
  );

  assert.match(html, /<details>/);
  assert.match(html, /<summary>More info<\/summary>/);
  assert.match(html, /<dl>/);
  assert.match(html, /<dt>Term<\/dt>/);
  assert.match(html, /<dd>Definition<\/dd>/);
});

test("the newly allowed tags do not open an XSS hole", async () => {
  const mod = await loadRenderer();
  const html = mod.renderMarkdown(
    `<details onclick="alert(1)"><summary>x<script>alert(1)</script></summary><mark onmouseover="steal()">y</mark></details>`
  );

  // structural tags survive but event-handler attributes are stripped
  assert.match(html, /<details>/);
  assert.doesNotMatch(html, /onclick/);
  assert.doesNotMatch(html, /onmouseover/);
  // raw <script> is neutralised, never executable
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

// --- T4.4: sanitizer hardening against XSS vectors ---

test("sanitizer blocks dangerous URL schemes and restricts data: URLs to images", async () => {
  const mod = await loadRenderer();

  // javascript: link href is dropped (anchor may survive without an href)
  const jsLink = mod.renderMarkdown(`[click](javascript:alert(1))`);
  assert.doesNotMatch(jsLink, /javascript:/i);

  // data:text/html is a classic XSS payload — never allowed, even on an image
  const htmlData = mod.renderMarkdown(`![x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)`);
  assert.doesNotMatch(htmlData, /data:text\/html/i);

  // a genuine inline image data URL is preserved
  const imgData = mod.renderMarkdown(`![x](data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==)`);
  assert.match(imgData, /src="data:image\/png;base64,iVBORw0KGgoAAAANSUhEUg=="/);
});

test("sanitizer neutralises svg/onload and comment-smuggled markup", async () => {
  const mod = await loadRenderer();

  // <svg onload=...> is not an allowed tag and must be escaped into inert text
  const svg = mod.renderMarkdown(`<svg onload="alert(1)"><circle r="10" /></svg>`);
  assert.match(svg, /&lt;svg/i);
  assert.doesNotMatch(svg, /<svg[\s>]/i);

  // markup smuggled inside an HTML comment must not survive as live nodes
  const commented = mod.renderMarkdown(`<mark>ok</mark><!-- <img src=x onerror=alert(1)> -->`);
  assert.match(commented, /<mark>ok<\/mark>/);
  assert.doesNotMatch(commented, /onerror/i);
});

// --- T3.1: a single source of truth for the renderer/sanitizer ---

test("server and client share one marked-agnostic renderer core", () => {
  const serverModule = normalizeSource(readFileSync(file("functions", "_lib", "markdown.js"), "utf8"));
  const clientModule = normalizeSource(readFileSync(file("public", "share.js"), "utf8"));

  // both runtimes import the shared core instead of redefining the sanitizer
  assert.match(serverModule, /from ["']\.\/markdown-core\.js["']/);
  assert.match(clientModule, /from ["']\.\/vendor\/markdown-core\.mjs["']/);

  // the ~120 lines of copy-pasted sanitizer logic no longer live in the client script
  assert.doesNotMatch(clientModule, /function sanitizeHtml/);
  assert.doesNotMatch(clientModule, /function sanitizeAttributes/);
  assert.doesNotMatch(clientModule, /const allowedTags = new Set/);
});

test("the vendored client core stays byte-identical to the canonical core (drift guard)", () => {
  const canonical = normalizeSource(readFileSync(file("functions", "_lib", "markdown-core.js"), "utf8"));
  const vendored = normalizeSource(readFileSync(file("public", "vendor", "markdown-core.mjs"), "utf8"));
  assert.equal(
    vendored,
    canonical,
    "public/vendor/markdown-core.mjs must be a verbatim copy of functions/_lib/markdown-core.js"
  );
});

test("server and client renderers produce identical HTML for the same input", async () => {
  const server = await loadRenderer();
  const { marked } = await import(pathToFileURL(file("public", "vendor", "marked.esm.mjs")));
  const core = await import(pathToFileURL(file("public", "vendor", "markdown-core.mjs")));

  const samples = [
    "# Title\n\nHello **world** with `code` and ~~strike~~.",
    "| A | B |\n|---|--:|\n| 1 | 2 |\n\n- [x] done\n- [ ] todo",
    "Press <kbd>Ctrl</kbd>+<kbd>C</kbd>. E=mc<sup>2</sup>, H<sub>2</sub>O, <mark>hi</mark>.",
    "<details>\n<summary>More</summary>\n\nBody\n\n</details>\n\n<script>alert(1)</script>",
    "[link](https://example.com) and ![img](https://example.com/a.png)",
  ];

  for (const sample of samples) {
    const serverHtml = server.renderMarkdown(sample);
    const clientHtml = core.renderMarkdown(marked, sample);
    assert.equal(clientHtml, serverHtml, `renderer drift for input: ${JSON.stringify(sample)}`);
  }
});
