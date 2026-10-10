-- Fresh original admissions only. Pending rows reserve quota and deny takeover;
-- completed rows never reconstruct acknowledgement or recovery authority.
CREATE TABLE competitor_creation_attempts (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "channelId" TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','complete')),
  "competitorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX competitor_creation_lookup ON competitor_creation_attempts ("userId", "channelId", state);
CREATE UNIQUE INDEX competitor_creation_pending ON competitor_creation_attempts ("userId", "channelId") WHERE state = 'pending';
