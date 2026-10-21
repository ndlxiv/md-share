# MD Share

Anonymous Markdown sharing: write or drop Markdown files, preview them live, and share one clean link.
https://md-share-6y3.pages.dev/

## What it does

- **Editor** (homepage): a React island with live preview, side-by-side on laptops and a Write/Preview switch on phones.
- **Multi-file shares**: up to 20 files (100,000 characters each, 1 MB total) behind one link. Each file also has its own URL, `/s/<id>/<file>`. Relative links between files (`[setup](./setup.md#install)`) are rewritten to point at the right file. **Download all** returns a `.zip`.
- **Edit code**: every new share gets a 24-character edit code (120 bits), shown exactly once. Only its SHA-256 hash is stored. The edit link `/e/<id>#<code>` keeps the code in the URL fragment, so it never reaches the server. With the code, the owner can change files, password and expiry, or delete the share; the link stays the same.
- **Expiration** (1h / 1d / 7d / 30d / never) and an optional **password**. Unlocking a password-protected share once covers all of its files: a one-hour, HttpOnly cookie signed with the share's password hash.
- **Rendering**: GitHub-flavored Markdown plus practical inline HTML, sanitized by one shared core (`functions/_lib/markdown-core.js`) that both the Worker and the browser import.
- **Icons**: React components (`src/components/icons/Icon.tsx`, built on lucide). No emoji anywhere in the UI. The server-rendered share pages use the same icons and stylesheet, pre-rendered to SVG/CSS by `scripts/generate-shared.mjs`, so the Worker ships plain HTML with no React runtime.
- **Responsive**: verified on 16:9 (1366×768 to 2560×1440), 16:10 (1280×800 to 1920×1200) and iPhone SE through Pro Max, in portrait and landscape.

Rate limiting is deferred: share ids and edit codes have enough entropy that enumeration is not practical. Add Cloudflare WAF rate-limiting rules on `/api/shares*` if abuse appears.

## Stack

- Astro (static) + React island for `/` and `/edit/`
- Cloudflare Pages Functions: `functions/api/shares/*` (create, edit, delete), `functions/s/*` (server-rendered share pages), `functions/e/[id].js` (edit route)
- Cloudflare D1 (`shares` table; the `files` column holds the JSON list of files)

## Local development

```bash
npm install
npm run dev                 # editor UI only (no Functions)
```

Full stack with Functions + local D1:

```bash
npm run db:migrate:local    # once: applies 0001 and 0002 to the local D1
npm run build
npm run preview             # wrangler pages dev on http://127.0.0.1:8788
```

## Verify

```bash
npx playwright install chromium webkit   # once
npm run verify   # astro check + build, unit tests, E2E (flows on Chromium and iPhone WebKit, plus the responsive matrix)
```

## Cloudflare setup / deploy

```bash
# Database migrations (run each file once against the remote D1)
npx wrangler d1 execute md-share-db --remote --file=migrations/0001_create_shares.sql
npx wrangler d1 execute md-share-db --remote --file=migrations/0002_multi_file_and_edit_codes.sql

# Build + deploy the static site and Functions
npm run deploy:cloudflare
```
