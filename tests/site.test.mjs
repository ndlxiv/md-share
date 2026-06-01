import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

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
  // Create Share button for both desktop (od-create-top) and mobile (action bar)
  assert.equal((html.match(/>Create Share</g) || []).length, 2);
  assert.match(html, /class="[^"]*\bmobile-action-bar\b[^"]*"/);
  assert.match(html, /id="create-share-mobile"/);
  assert.doesNotMatch(html, /Burn after reading/);
  assert.doesNotMatch(html, /href="\/admin\/"/);

  const sourceCss = readFileSync(file("src", "styles", "global.css"), "utf8");
  assert.doesNotMatch(
    sourceCss,
    /\.mobile-action-bar\s*\{[^}]*position:\s*fixed/s,
    "mobile Create Share control must stay in normal flow instead of covering the editor"
  );

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
  assert.match(js, /Create another/);
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

test("public share copy button toggles to a check then resets its icon, keeping its label", () => {
  const source = readFileSync(file("functions/s/[id].js"), "utf8");
  // label/title must survive the copy interaction (no destructive textContent overwrite of the label)
  assert.match(source, /aria-label="Copy to clipboard"/);
  assert.match(source, /title="Copy to clipboard"/);
  // a dedicated handler shows ✅ then resets back to 📋 after a timeout
  assert.match(source, /setTimeout/);
  assert.match(source, /textContent\s*=\s*['"]📋['"]/);
  assert.match(source, /textContent\s*=\s*['"]✅['"]/);
  // the inline onclick must no longer permanently set the icon to ✅ without resetting it
  assert.doesNotMatch(source, /\.then\(\(\)=>this\.textContent='✅'\)/);
});

test("share page templates drop the unused /s/<id> plumbing", () => {
  const source = readFileSync(file("functions/s/[id].js"), "utf8");
  // the content/message/shell templates no longer thread an unused id param
  assert.doesNotMatch(source, /const shell = \(\{[^}]*\bid\b/);
  assert.doesNotMatch(source, /const contentPage = \(\{[^}]*\bid\b/);
  assert.doesNotMatch(source, /const messagePage = \(\{[^}]*\bid\b/);
  // id is still genuinely needed for the password gate form action only
  assert.match(source, /action="\/s\/\$\{escapeHtml\(id\)\}"/);
});

test("public share page offers consistent icon-only actions with accessible labels", () => {
  const source = readFileSync(file("functions/s/[id].js"), "utf8");
  // copy link, copy markdown source, share, download — all icon-only with aria-label + title
  assert.match(source, /aria-label="Copy to clipboard"/);
  assert.match(source, /aria-label="Copy Markdown source"/);
  assert.match(source, /aria-label="Share"/);
  assert.match(source, /aria-label="Download file"/);
  assert.match(source, /title="Copy Markdown source"/);
  assert.match(source, /title="Share"/);
  // share uses the Web Share API with a copy-link fallback
  assert.match(source, /navigator\.share/);
  assert.match(source, /shareLink/);
  // copy source copies the raw markdown, not the URL
  assert.match(source, /copySource/);
  assert.match(source, /writeText\(rawContent\)/);
});

test("wide tables stay inside the viewport with horizontal scroll", () => {
  // inline BASE_STYLE used by the server-rendered share page
  const idSource = readFileSync(file("functions/s/[id].js"), "utf8");
  assert.match(idSource, /\.prose table\{[^}]*overflow-x:auto/);
  // built global stylesheet that drives the editor preview
  const cssFile = readdirSync(file("dist", "_astro")).find((name) => name.endsWith(".css"));
  assert.ok(cssFile, "built CSS asset should exist");
  const css = readFileSync(file("dist", "_astro", cssFile), "utf8");
  assert.match(css, /\.prose table\{[^}]*overflow-x:auto/);
});

test("created share screen exposes clear labeled actions", () => {
  const source = readFileSync(file("src", "pages", "index.astro"), "utf8");
  assert.match(source, /id="copy-share-url"[^>]*>📋 Copy link<\/button>/);
  assert.match(source, /id="open-share-url"[^>]*>🔗 Open<\/a>/);
  assert.match(source, /id="create-another"[^>]*>[^<]*Create another<\/button>/);
  assert.match(source, /id="share-url"[^>]*readonly/);
  assert.doesNotMatch(source, /Burn after reading/);
});

// --- T3.2: derive the redirect origin from the request/env, no hardcoded domain ---

test("public /s route derives its origin from the request/env rather than a hardcoded domain", () => {
  const source = readFileSync(file("functions/s/[id].js"), "utf8");
  // no hardcoded production domain literal and no static SITE constant
  assert.doesNotMatch(source, /md-share-6y3/);
  assert.doesNotMatch(source, /\.pages\.dev/);
  assert.doesNotMatch(source, /const SITE\s*=\s*["']https?:/);
  // origin comes from the incoming request (with an optional env override)
  assert.match(source, /new URL\(request\.url\)/);
  assert.match(source, /env\.SITE_URL/);
});

// --- T3.3: catch D1 insert failures and retry once on id collision ---

test("create API guards the D1 insert and retries once on id collision", async () => {
  const source = readFileSync(file("functions/api/shares/index.js"), "utf8");
  assert.match(source, /storage_failed/);
  assert.match(source, /catch/);

  const { onRequestPost } = await import(pathToFileURL(file("functions/api/shares/index.js")));
  const makeRequest = () => ({
    url: "https://example.test/api/shares",
    json: async () => ({ content: "# Hello world\n\nbody" }),
  });

  // 1) a transient/persistent storage failure becomes a clean 500 JSON, not a raw stack
  const failingDb = {
    prepare: () => ({ bind: () => ({ run: async () => { throw new Error("D1_ERROR: disk full"); } }) }),
  };
  const failRes = await onRequestPost({ request: makeRequest(), env: { DB: failingDb } });
  assert.equal(failRes.status, 500);
  assert.deepEqual(await failRes.json(), { error: "storage_failed" });

  // 2) a UNIQUE id collision is retried once and then succeeds (201)
  let attempts = 0;
  const collidingDb = {
    prepare: () => ({
      bind: () => ({
        run: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error("UNIQUE constraint failed: shares.id");
          return { success: true };
        },
      }),
    }),
  };
  const okRes = await onRequestPost({ request: makeRequest(), env: { DB: collidingDb } });
  assert.equal(okRes.status, 201);
  assert.equal(attempts, 2, "should retry exactly once after a collision");
});

// --- T3.4: simplify the misleading fake multi-file UI ---

test("home page no longer fakes a multi-file workspace", () => {
  const source = readFileSync(file("src", "pages", "index.astro"), "utf8");
  // the misleading "x/10 files" counter is gone
  assert.doesNotMatch(source, /1\/10 files/);
  assert.doesNotMatch(source, /\/10 files/);
  // the "add file" affordance that implies multiple files is gone
  assert.doesNotMatch(source, /aria-label="Add file"/);

  const htmlPath = file("dist/index.html");
  if (existsSync(htmlPath)) {
    assert.doesNotMatch(readFileSync(htmlPath, "utf8"), /\/10 files/);
  }
});

test("client script drops the add-file affordance", () => {
  const js = readFileSync(file("dist/share.js"), "utf8");
  assert.doesNotMatch(js, /#add-file/);
});

// --- Responsive layout polish: tablet hero/options + mobile spacing ---------

test("tablet (<=1180) stacks the hero so actions don't float in empty space", () => {
  const css = readFileSync(file("src", "styles", "global.css"), "utf8");
  const tablet = css.match(/@media \(max-width: 1180px\)\s*\{[\s\S]*?\n\}/);
  assert.ok(tablet, "a <=1180px media query should exist");
  const block = tablet[0];
  // hero collapses to a single column and the action cluster aligns to the start
  assert.match(block, /\.od-hero-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(block, /\.od-hero-actions\s*\{[^}]*justify-items:\s*start/);
});

test("tablet (<=1180) renders options as a compact 2-column form, not a 3-up strip", () => {
  const css = readFileSync(file("src", "styles", "global.css"), "utf8");
  const tablet = css.match(/@media \(max-width: 1180px\)\s*\{[\s\S]*?\n\}/);
  assert.ok(tablet, "a <=1180px media query should exist");
  const block = tablet[0];
  // two-column grid spanning the full row
  assert.match(block, /\.options-panel\s*\{[^}]*grid-column:\s*1 \/ -1/);
  assert.match(block, /\.options-panel\s*\{[^}]*grid-template-columns:\s*repeat\(2,/);
  // the password toggle stays in the first column with a comfortable hit area;
  // hidden password field + helper text span full width when needed
  assert.match(block, /\.options-panel \.switch-row\s*\{[^}]*display:\s*inline-flex/);
  assert.match(block, /\.options-panel \.switch-row\s*\{[^}]*gap:\s*12px/);
  assert.match(block, /\.options-panel \.switch-row\s*\{[^}]*min-height:\s*48px/);
  assert.match(block, /\.options-panel #password-row,[\s\S]*?\.options-panel \.meta,[\s\S]*?grid-column:\s*1 \/ -1/);
  // the old awkward 3-equal-column strip is gone everywhere
  assert.doesNotMatch(css, /grid-template-columns:\s*1fr 1fr 1fr/);
});

test("narrow screens (<=900) collapse options to a single column", () => {
  const css = readFileSync(file("src", "styles", "global.css"), "utf8");
  const narrow = css.match(/@media \(max-width: 900px\)\s*\{[\s\S]*?\n\}/);
  assert.ok(narrow, "a <=900px media query should exist");
  assert.match(narrow[0], /\.options-panel\s*\{[^}]*grid-template-columns:\s*1fr/);
});

test("mobile keeps Create Share after options, in-flow, and full-width", () => {
  const source = readFileSync(file("src", "pages", "index.astro"), "utf8");
  assert.ok(
    source.indexOf("class=\"options-panel") < source.indexOf("class=\"mobile-action-bar"),
    "mobile Create Share action should come after share options in the form flow"
  );
  assert.doesNotMatch(source, /mobile-action-bar[\s\S]*README\.md/);

  const css = readFileSync(file("src", "styles", "global.css"), "utf8");
  // action bar surfaces in normal flow at <=900, after editor/options, not as a floating overlay
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.mobile-action-bar\s*\{[^}]*display:\s*flex/);
  assert.match(css, /\.mobile-action-bar\s*\{[^}]*grid-column:\s*1 \/ -1/);
  assert.match(css, /\.mobile-action-bar\s*\{[^}]*order:\s*4/);
  assert.doesNotMatch(css, /\.mobile-action-bar\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /\.mobile-action-bar \.button\s*\{[^}]*width:\s*100%/);
  assert.match(css, /\.mobile-action-bar \.button\s*\{[^}]*min-height:\s*48px/);
  // <=640 keeps options/create before the live preview so the submit action stays near the form controls
  const phone = css.match(/@media \(max-width: 640px\)\s*\{[\s\S]*?\n\}/)[0];
  assert.match(phone, /\.od-workspace\s*\{[^}]*gap:\s*10px/);
  assert.match(phone, /\.options-panel\s*\{[^}]*order:\s*3/);
  assert.match(phone, /\.preview-panel\s*\{[^}]*order:\s*5/);
});

// --- T5.1: README and astro.config agree on a single domain ----------------

test("README and astro.config use one consistent domain", () => {
  const readme = readFileSync(file("README.md"), "utf8");
  const astroConfig = readFileSync(file("astro.config.mjs"), "utf8");
  // README advertises the same canonical domain astro.config builds against
  assert.match(astroConfig, /https:\/\/md-share-6y3\.pages\.dev/);
  assert.match(readme, /https:\/\/md-share-6y3\.pages\.dev/);
  assert.doesNotMatch(astroConfig, /https:\/\/md-share\.pages\.dev/);
  assert.doesNotMatch(readme, /https:\/\/md-share\.pages\.dev/);
  // rate limiting is explicitly documented as deferred, not silently missing
  assert.match(readme, /[Rr]ate limiting is deferred/);
});
