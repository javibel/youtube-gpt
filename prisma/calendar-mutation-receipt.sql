-- Additive immutable business results; no expiry, recreation or runner recovery.
CREATE TABLE IF NOT EXISTS calendar_mutation_receipts (
 id TEXT PRIMARY KEY,
 "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 key TEXT NOT NULL,
 method TEXT NOT NULL,
 "entryId" TEXT NOT NULL,
 input TEXT NOT NULL,
 output TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS calendar_mutation_receipts_userid_key_key ON calendar_mutation_receipts ("userId", key);
CREATE INDEX IF NOT EXISTS calendar_mutation_receipts_userid_createdat_idx ON calendar_mutation_receipts ("userId", "createdAt");
