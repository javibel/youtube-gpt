-- Additive synthetic schema only. Rows deny replay, never recovery.
-- The captured team/membership IDs survive deletion without granting authority.
CREATE TABLE team_rename_attempts (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  email TEXT NOT NULL,
  key TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "previousRole" TEXT NOT NULL CHECK("previousRole" IN('owner','admin')),
  "previousName" TEXT NOT NULL,
  name TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','complete')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("userId",key)
);
CREATE UNIQUE INDEX team_rename_pending ON team_rename_attempts("teamId") WHERE state='pending';
CREATE INDEX team_rename_lookup ON team_rename_attempts("teamId",state);
