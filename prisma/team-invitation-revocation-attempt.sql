-- Additive synthetic schema. Stored admissions deny replay, never recovery.
-- Team/invitation identities survive their deletion; no cleanup or expiry grants authority.
CREATE TABLE team_invitation_revocation_attempts (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  email TEXT NOT NULL,
  key TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation='revoke'),
  "teamId" TEXT NOT NULL,
  "actorMemberId" TEXT NOT NULL,
  "actorRole" TEXT NOT NULL CHECK("actorRole" IN('owner','admin')),
  "invitationId" TEXT NOT NULL,
  "targetEmail" TEXT NOT NULL,
  "previousRole" TEXT NOT NULL CHECK("previousRole" IN('admin','member')),
  "previousExpiresAt" TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','complete')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("userId",key)
);
CREATE UNIQUE INDEX team_invitation_revocation_pending ON team_invitation_revocation_attempts("teamId") WHERE state='pending';
CREATE INDEX team_invitation_revocation_lookup ON team_invitation_revocation_attempts("teamId",state);
