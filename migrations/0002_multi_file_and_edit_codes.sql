-- md-share: multi-file shares and owner edit codes. Run once after 0001.
-- files: JSON array of {filename, content}; NULL = legacy single-file row that
--        keeps its file in content/filename.
-- edit_code_hash: SHA-256 of the normalized edit code; NULL = not editable.
ALTER TABLE shares ADD COLUMN files TEXT;
ALTER TABLE shares ADD COLUMN edit_code_hash TEXT;
ALTER TABLE shares ADD COLUMN updated_at TEXT;
