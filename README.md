# MD Share

Editable Markdown sharing app.

## What it does

- Public homepage lists Markdown documents from Cloudflare D1.
- `/admin/` lets the owner upload `.md` files, edit Markdown, save, and delete documents.
- `/p/<slug>/` renders each public Markdown document.
- Saving in the web UI updates the public link immediately. No manual deploy is needed for content changes.

## Free stack

- Astro static shell
- Cloudflare Pages hosting
- Cloudflare Pages Functions API
- Cloudflare D1 free database
- GitHub repository for source code

## URLs

- Public site: `https://md-share-6y3.pages.dev`
- Admin UI: `https://md-share-6y3.pages.dev/admin/`
- Example page: `https://md-share-6y3.pages.dev/p/example/`

## Admin token

The Admin UI stores the token only in browser `localStorage` after you paste it.

On the local Windows machine, the generated token was saved outside the repo at:

```text
C:\Users\ndl\md-share-admin-token.txt
```

Do not commit this token to GitHub.

## Local development

```bash
npm install
npm run dev
```

## Verify production build

```bash
npm run verify
```

## Cloudflare setup

Create/apply D1 database:

```bash
npx wrangler d1 create md-share-db
npx wrangler d1 migrations apply md-share-db --remote
```

Set the admin secret:

```bash
npx wrangler pages secret put ADMIN_TOKEN --project-name md-share
```

Deploy app shell/functions:

```bash
npm run deploy:cloudflare
```

After this, content changes happen through `/admin/` and do not require deploy.

## Notes

- Public documents are visible to anyone with the link and on the homepage.
- Hidden documents can be saved with `public: false`, but this is not a full private access-control system.
- The Markdown renderer escapes raw HTML before rendering to reduce XSS risk.
