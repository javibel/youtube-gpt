-- Additive local migration; validate the designated synthetic database first.
-- testId is a business identity, not a cascading recovery/authority reference.
CREATE TABLE ab_test_mutation_attempts (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "videoId" TEXT NOT NULL,
  "testId" TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('cancel','apply_winner')),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','complete')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ab_test_mutation_attempts_userId_videoId_state_idx ON ab_test_mutation_attempts("userId","videoId",state);
CREATE INDEX ab_test_mutation_attempts_userId_testId_action_state_idx ON ab_test_mutation_attempts("userId","testId",action,state);
