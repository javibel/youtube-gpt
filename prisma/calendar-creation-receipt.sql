-- Additive original creation receipt. No expiry or reclaim by clock/reset/hash.
CREATE TABLE IF NOT EXISTS calendar_creation_receipts (
 id TEXT PRIMARY KEY,
 "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 key TEXT NOT NULL,
 input TEXT NOT NULL,
 "entryId" TEXT REFERENCES calendar_entries(id) ON DELETE SET NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS calendar_creation_receipts_userid_key_key ON calendar_creation_receipts ("userId", key);
CREATE INDEX IF NOT EXISTS calendar_creation_receipts_userid_createdat_idx ON calendar_creation_receipts ("userId", "createdAt");
