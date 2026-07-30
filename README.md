# MD Share

Simple anonymous Markdown sharing app.
https://md-share-6y3.pages.dev/

## What it does

- Homepage is a one-page Markdown writer with live preview.
- Anyone can paste Markdown or drop a `.md` file, then click `Create Share` to get a public link.
- `/s/<id>` server-renders a clean read-only share page with Preview/Raw and icon actions: copy link, copy Markdown source, share (Web Share API with copy-link fallback), and download.
- The renderer covers GitHub-flavored Markdown (tables, task lists, strikethrough, autolinks, heading ids) plus practical inline HTML (`kbd`, `sup`, `sub`, `mark`, `s`, `details`/`summary`, definition lists). Raw HTML is sanitized server- and client-side from a single shared core.
- Each share supports **expiration** (1h / 1d / 7d / 30d / never) and an optional **password**.
- Content is stored in Cloudflare D1, so new shares work immediately without redeploying.

## Local development

```bash
npm install
npm run dev
```

To exercise the Functions + D1 locally:

```bash
npm run build
npx wrangler d1 execute md-share-db --local --file=migrations/0001_create_shares.sql
npx wrangler pages dev
```

## Verify

```bash
npm run verify   # build + tests
```

## Cloudflare setup / deploy

```bash
# Create the shares table on the remote D1 (run once)
npx wrangler d1 execute md-share-db --remote --file=migrations/0001_create_shares.sql

# Build + deploy the shell and Functions
npm run deploy:cloudflare
```

