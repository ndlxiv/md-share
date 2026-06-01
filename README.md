# MD Share

Production-ready static web app for sharing Markdown files as clean public pages.

## Free stack

- Astro static site
- GitHub repository
- Cloudflare Pages free hosting
- No database, no always-on server

## Add a new Markdown share

Create a file under:

```text
src/content/shares/my-note.md
```

Use frontmatter:

```md
---
title: "My Note"
description: "Short description"
createdAt: 2026-06-01
public: true
---

# My Note

Markdown content here.
```

After deploy, the page is available at:

```text
/p/my-note
```

## Local development

```bash
npm install
npm run dev
```

## Verify production build

```bash
npm run verify
```

## Deploy to Cloudflare Pages

### Option 1: Cloudflare dashboard

1. Push this repo to GitHub.
2. Open Cloudflare Dashboard → Workers & Pages → Create application → Pages.
3. Connect the GitHub repo.
4. Build settings:
   - Framework preset: Astro
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Node version: `20` or newer

### Option 2: Wrangler CLI

Login once:

```bash
npx wrangler login
```

Deploy:

```bash
npm run build
npx wrangler pages deploy dist --project-name md-share
```

## Notes

- Files with `public: false` are excluded from generated pages and homepage listing.
- If the GitHub repository is public, never commit private Markdown content.
- For private/unlisted shares, use hard-to-guess filenames and keep the repo private.
