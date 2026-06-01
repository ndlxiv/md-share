# MD Share

Simple anonymous Markdown sharing app.

## What it does

- Homepage is a one-page Markdown writer with live preview.
- Anyone can paste Markdown or drop a `.md` file, then click `Create Share` to get a public link.
- `/s/<id>` server-renders a clean read-only share page with Preview/Raw, copy, and download actions.
- Each share supports **expiration** (1h / 1d / 7d / 30d / never) and an optional **password**.
- Content is stored in Cloudflare D1, so new shares work immediately without redeploying.

## Free stack

- Astro static shell
- Cloudflare Pages hosting
- Cloudflare Pages Functions API
- Cloudflare D1 free database
- GitHub repository for source code

## URLs

- Public site: `https://md-share-6y3.pages.dev`
- Public share route: `https://md-share-6y3.pages.dev/s/<id>`

## Data model

Single table `shares` (see `migrations/0001_create_shares.sql`):

| column | meaning |
|---|---|
| `id` | random url-safe id, primary key |
| `title` / `description` | derived from the markdown (heading / frontmatter) |
| `content` | raw markdown |
| `filename` | suggested download filename |
| `created_at` | ISO timestamp |
| `expires_at` | ISO timestamp or NULL (never) |
| `password_hash` | SHA-256 hex or NULL |

Expired shares are deleted lazily on first access after expiry.

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

After this, new shares created through the homepage are served immediately without redeploying.

## Notes

- Public shares are visible to anyone with the link.
- The homepage create endpoint is intentionally unauthenticated; keep abuse/rate-limiting in mind at scale.
- The Markdown renderer escapes raw HTML before rendering to reduce XSS risk.
- Password is hashed with unsalted SHA-256 — adequate for casual sharing, not strong secrecy. A password-protected share still exposes its title/description on the unlock page.
