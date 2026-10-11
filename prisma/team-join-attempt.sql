-- Additive synthetic schema. Stored rows deny reuse; never resume a join.
CREATE TABLE team_join_attempts (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  email TEXT NOT NULL, key TEXT NOT NULL, "teamId" TEXT NOT NULL,
  "teamName" TEXT NOT NULL, "invitationId" TEXT NOT NULL,
  "targetEmail" TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN('admin','member')),
  "expiresAt" TEXT NOT NULL, "membershipId" TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','complete')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("userId",key)
);
CREATE UNIQUE INDEX team_join_pending_team ON team_join_attempts("teamId") WHERE state='pending';
CREATE UNIQUE INDEX team_join_pending_user ON team_join_attempts("userId") WHERE state='pending';
CREATE INDEX team_join_lookup ON team_join_attempts("teamId",state);
