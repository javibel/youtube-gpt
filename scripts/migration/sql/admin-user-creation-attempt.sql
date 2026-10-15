-- Additive local migration, not applied by preparing or generating the SDK.
-- Apply once only to the identified synthetic database with an owned executor.
-- Existing/uncertain tables must be observed through their original, not replayed.
BEGIN;
CREATE TABLE "admin_user_creation_attempts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "sessionRef" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "targetEmail" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'pending' CHECK ("state" IN ('pending', 'completed', 'rejected')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CHECK (("state" = 'pending' AND "completedAt" IS NULL)
      OR ("state" IN ('completed', 'rejected') AND "completedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "admin_user_creation_attempts_targetUserId_key"
  ON "admin_user_creation_attempts"("targetUserId");
CREATE UNIQUE INDEX "admin_user_creation_attempts_targetEmail_key"
  ON "admin_user_creation_attempts"("targetEmail");
-- No credentials, FK/cascade, TTL, cleanup, reset, adoption or recovery.
-- No inherited table is changed. This file never grants production permission.
COMMIT;
