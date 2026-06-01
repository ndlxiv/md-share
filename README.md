# MD Share

Simple anonymous Markdown sharing app.

## What it does

- Homepage is a one-page Markdown writer with live preview.
- Anyone can paste Markdown or drop a `.md` file, then click `Create Share` to get a public link.
- `/s/<id>` server-renders a clean read-only share page with Preview/Raw and icon actions: copy link, copy Markdown source, share (Web Share API with copy-link fallback), and download.
- The renderer covers GitHub-flavored Markdown (tables, task lists, strikethrough, autolinks, heading ids) plus practical inline HTML (`kbd`, `sup`, `sub`, `mark`, `s`, `details`/`summary`, definition lists). Raw HTML is sanitized server- and client-side from a single shared core.
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

The share route derives its origin from the incoming request, so it works on any
domain. Set the `SITE_URL` environment variable to override the redirect origin.

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

Expired shares are deleted lazily on first access after expiry. A tested cleanup
handler exists in `functions/_scheduled.js`, but Cloudflare Pages rejects
cron trigger blocks in `wrangler.toml`; attach it via a separate Worker or
dashboard-managed cron if you need background pruning for rows that are never
revisited.

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

## Security notes

- Public shares are visible to anyone with the link.
- The Markdown renderer escapes raw HTML and runs an allowlist sanitizer before output. `<script>/<style>/<iframe>/<object>/<embed>/<form>` are neutralized, `javascript:`/`vbscript:` URLs are dropped, and `data:` URLs are permitted only for `image/*` on `<img>`. External links get `rel="noreferrer"`.
- Share pages are served `noindex,nofollow` with hardening headers: `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, and a tight `Content-Security-Policy`.
- Password is hashed with unsalted SHA-256 — adequate for casual sharing, not strong secrecy. Hashes are compared in constant time. A password-protected share still exposes its title/description on the unlock page.
- **Rate limiting is deferred (not yet implemented).** The create endpoint (`POST /api/shares`) is intentionally unauthenticated and currently relies only on the 100 KB content cap. A durable limiter needs a new KV namespace or D1 counter table (a production binding/migration), so it is left out to keep deploys low-risk; add Cloudflare Turnstile or a KV-backed per-IP counter when abuse becomes a concern. See `docs/plans/2026-06-01-md-share-completion-plan.md` (T4.2).
