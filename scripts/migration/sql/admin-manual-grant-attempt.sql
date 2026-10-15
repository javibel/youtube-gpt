-- Additive local migration. Apply once with an original owned executor against
-- the identified synthetic database. No inherited table, FK, TTL or reset.
BEGIN;
CREATE TABLE admin_manual_grant_attempts (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  email TEXT NOT NULL,
  "sessionRef" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL UNIQUE,
  "targetEmail" TEXT NOT NULL UNIQUE,
  "subscriptionId" TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL CHECK (plan IN ('pro','business')),
  "durationDays" INTEGER NOT NULL CHECK ("durationDays" BETWEEN 1 AND 365),
  "createdAt" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','completed')),
  "completedAt" TIMESTAMP(3),
  CHECK ("periodEnd" = "createdAt" + "durationDays" * INTERVAL '1 day'),
  CHECK ((state='pending' AND "completedAt" IS NULL) OR (state='completed' AND "completedAt" IS NOT NULL))
);
COMMIT;
