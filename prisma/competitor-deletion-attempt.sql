-- Apply once only after checking the designated synthetic database/directory.
-- competitorId has no cascading FK: deleting the business row cannot release
-- a pending original producer or turn a stored receipt into recovery authority.
CREATE TABLE competitor_deletion_attempts (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "competitorId" TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','complete')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("userId", "competitorId")
);
