-- Additive business admission/receipt table. No lease, reset, timeout reclaim or recovery authority.
CREATE TABLE IF NOT EXISTS background_image_attempts (
 id TEXT PRIMARY KEY,
 "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 digest TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending',
 output TEXT,
 prompt TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS background_image_attempts_userid_createdat_idx ON background_image_attempts ("userId", "createdAt");
