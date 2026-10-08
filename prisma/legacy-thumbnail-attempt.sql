-- Conservative admission and business result; no recovery lease/TTL/reset.
CREATE TABLE IF NOT EXISTS legacy_thumbnail_attempts (
 id TEXT PRIMARY KEY,
 "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 digest TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending',
 output TEXT,
 prompt TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS legacy_thumbnail_attempts_userid_createdat_idx ON legacy_thumbnail_attempts ("userId","createdAt");
