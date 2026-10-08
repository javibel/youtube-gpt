-- Keyless text admission; uncertainty has no reclaim lease/TTL/reset.
CREATE TABLE IF NOT EXISTS text_generation_attempts (
 id TEXT PRIMARY KEY,
 "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 state TEXT NOT NULL DEFAULT 'pending',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS text_generation_attempts_userid_createdat_idx ON text_generation_attempts ("userId","createdAt");
