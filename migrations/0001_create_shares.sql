-- md-share: anonymous markdown shares stored in Cloudflare D1.
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  filename TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  burn_after_reading INTEGER NOT NULL DEFAULT 0,
  password_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_shares_expires_at ON shares (expires_at);
