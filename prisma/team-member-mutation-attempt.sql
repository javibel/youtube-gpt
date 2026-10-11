-- Additive synthetic schema only. Stored admissions deny replay, never recovery.
-- Team/member identifiers intentionally survive their removal.
CREATE TABLE team_member_mutation_attempts (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  email TEXT NOT NULL,
  key TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN('role','remove')),
  "teamId" TEXT NOT NULL,
  "actorMemberId" TEXT NOT NULL,
  "actorRole" TEXT NOT NULL CHECK("actorRole" IN('owner','admin')),
  "memberId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "previousRole" TEXT NOT NULL CHECK("previousRole" IN('admin','member')),
  role TEXT CHECK(role IN('admin','member')),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','complete')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK((operation='remove' AND role IS NULL) OR(operation='role' AND role IS NOT NULL AND role<>"previousRole")),
  UNIQUE("userId",key)
);
CREATE UNIQUE INDEX team_member_mutation_pending ON team_member_mutation_attempts("teamId") WHERE state='pending';
CREATE INDEX team_member_mutation_lookup ON team_member_mutation_attempts("teamId",state);
