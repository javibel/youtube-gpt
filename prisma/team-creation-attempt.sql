-- Original fresh admissions only; stored pending/complete rows deny replay.
-- The single-membership constraint also closes races with legacy joins.
CREATE UNIQUE INDEX team_member_user_single ON team_members ("userId");
CREATE TABLE team_creation_attempts (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  email TEXT NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','complete')),
  "teamId" TEXT UNIQUE REFERENCES teams(id) ON DELETE SET NULL ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("userId",key)
);
CREATE UNIQUE INDEX team_creation_pending ON team_creation_attempts ("userId") WHERE state = 'pending';
CREATE INDEX team_creation_lookup ON team_creation_attempts ("userId",state);
