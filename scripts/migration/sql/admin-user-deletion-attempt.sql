-- Apply once only by an owned executor to the identified synthetic database.
-- Permanent negative constraints, no FK/cascade/TTL/reset/recovery authority.
BEGIN;
CREATE TABLE admin_user_deletion_attempts (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  email TEXT NOT NULL,
  "sessionRef" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL UNIQUE,
  "targetEmail" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','completed')),
  "completedAt" TIMESTAMP(3),
  CHECK ((state='pending' AND "completedAt" IS NULL) OR (state='completed' AND "completedAt" IS NOT NULL))
);
COMMIT;
