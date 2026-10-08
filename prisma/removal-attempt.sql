-- Local additive receipt. No lease/reset/reclaim or reconstructed recovery authority.
CREATE TABLE IF NOT EXISTS removal_attempts (
 id TEXT PRIMARY KEY,
 "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 digest TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending',
 output BYTEA,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (output IS NULL OR octet_length(output) <= 10485760)
);
CREATE INDEX IF NOT EXISTS removal_attempts_userid_createdat_idx ON removal_attempts ("userId","createdAt");
