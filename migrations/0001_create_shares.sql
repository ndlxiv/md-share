-- md-share: anonymous markdown shares stored in Cloudflare D1.
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  filename TEXT NOT NULL DEFAULT 'share.md',
  created_at TEXT NOT NULL,
  expires_at TEXT,           -- ISO8601, NULL = never expires
  password_hash TEXT         -- SHA-256 hex, NULL = no password
);

CREATE INDEX IF NOT EXISTS idx_shares_expires_at ON shares(expires_at);
