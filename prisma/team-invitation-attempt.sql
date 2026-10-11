-- Additive local schema. Retained rows deny reuse; never reconstruct a sender.
CREATE TABLE team_invitation_attempts (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  email TEXT NOT NULL, key TEXT NOT NULL, "teamId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL, "previousRole" TEXT NOT NULL CHECK("previousRole" IN('owner','admin')),
  "targetEmail" TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN('admin','member')),
  "invitationId" TEXT NOT NULL, "expiresAt" TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','complete')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("userId",key)
);
CREATE UNIQUE INDEX team_invitation_pending ON team_invitation_attempts("teamId") WHERE state='pending';
CREATE INDEX team_invitation_lookup ON team_invitation_attempts("teamId",state);
