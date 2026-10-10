-- Additive migration; local synthetic database application requires identity
-- validation. Production application/retention/recovery are not authorized.
CREATE TABLE ab_test_creation_attempts (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "videoId" TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','complete')),
  "testId" TEXT REFERENCES ab_tests(id) ON DELETE SET NULL ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX ab_test_creation_attempts_testId_key ON ab_test_creation_attempts("testId");
CREATE INDEX ab_test_creation_attempts_userId_state_idx ON ab_test_creation_attempts("userId",state);
CREATE INDEX ab_test_creation_attempts_userId_videoId_state_idx ON ab_test_creation_attempts("userId","videoId",state);
