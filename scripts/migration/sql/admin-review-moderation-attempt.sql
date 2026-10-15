-- Additive local migration. Apply once only to the identified synthetic database.
-- Fail if the table already exists: an uncertain original must be observed,
-- never replayed or adopted from this file. No inherited table is changed.
BEGIN;
CREATE TABLE "admin_review_moderation_attempts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "sessionRef" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "status" TEXT NOT NULL CHECK ("status" IN ('approved', 'rejected')),
  "state" TEXT NOT NULL DEFAULT 'pending' CHECK ("state" IN ('pending', 'completed')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CHECK (("state" = 'pending' AND "completedAt" IS NULL)
      OR ("state" = 'completed' AND "completedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "admin_review_moderation_attempts_reviewId_key"
  ON "admin_review_moderation_attempts"("reviewId");
-- No foreign keys/cascades: account/review deletion cannot erase denials.
-- No TTL, cleanup, reset, recovery, or permission to apply to production.
COMMIT;
