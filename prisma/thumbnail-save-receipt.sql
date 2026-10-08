-- Additive deletion guard, committed atomically with keyed original history.
-- No output, image or metadata; no authority to recover or repeat deleted writes.
CREATE TABLE IF NOT EXISTS thumbnail_save_receipts (
 id TEXT PRIMARY KEY,
 "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 digest TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS thumbnail_save_receipts_userid_createdat_idx ON thumbnail_save_receipts ("userId", "createdAt");
