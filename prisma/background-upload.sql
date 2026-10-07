-- Additive schema for upload receipts; apply only under an explicitly approved database workflow.
CREATE TABLE IF NOT EXISTS background_uploads (
 id TEXT PRIMARY KEY,
 "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 digest TEXT NOT NULL,
 output TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS background_uploads_userId_createdAt_idx ON background_uploads ("userId", "createdAt");
