# MD Share

Simple Markdown sharing app inspired by MDShare.

## What it does

- Homepage is a one-page Markdown writer with live preview.
- Anyone can paste Markdown or drop a `.md` file, then click `Create Share` to get a public link.
- `/s/<slug>` renders a clean read-only share page with Preview/Raw, copy, and download actions.
- `/admin/` still exists for owner-only upload/edit/delete with an admin token.
- Content is stored in Cloudflare D1, so new shares work immediately without redeploying.

## Free stack

- Astro static shell
- Cloudflare Pages hosting
- Cloudflare Pages Functions API
- Cloudflare D1 free database
- GitHub repository for source code

## URLs

- Public site: `https://md-share-6y3.pages.dev`
- Public share route: `https://md-share-6y3.pages.dev/s/<slug>`
- Legacy/admin-managed route: `https://md-share-6y3.pages.dev/p/example/`
- Admin UI: `https://md-share-6y3.pages.dev/admin/`

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

Set the admin secret for `/admin/` writes:

```bash
npx wrangler pages secret put ADMIN_TOKEN --project-name md-share
```

Deploy app shell/functions:

```bash
npm run deploy:cloudflare
```

After this, content changes through the homepage or `/admin/` do not require deploy.

## Notes

- Public shares are visible to anyone with the link.
- The homepage public create endpoint is intentionally unauthenticated for simple sharing; keep abuse/rate-limiting in mind if this becomes public at scale.
- The Markdown renderer escapes raw HTML before rendering to reduce XSS risk.
- Password protect, expiration, and burn-after-reading are present in the simple UI as MVP controls; backend enforcement can be hardened in a follow-up.
