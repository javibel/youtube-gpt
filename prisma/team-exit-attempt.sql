-- Additive synthetic schema. Stored rows deny new work, never recovery.
-- Team/membership IDs survive deletion; no cleanup or expiry grants authority.
CREATE TABLE team_exit_attempts (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  email TEXT NOT NULL,
  key TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "previousRole" TEXT NOT NULL CHECK("previousRole" IN('owner','admin','member')),
  operation TEXT NOT NULL CHECK((operation='delete' AND "previousRole"='owner') OR (operation='leave' AND "previousRole" IN('admin','member'))),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','complete')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("userId",key)
);
CREATE UNIQUE INDEX team_exit_pending ON team_exit_attempts("teamId") WHERE state='pending';
CREATE INDEX team_exit_lookup ON team_exit_attempts("teamId",state);
