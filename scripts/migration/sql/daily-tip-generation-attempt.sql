-- Additive migration for the identified synthetic database only.
-- No IF NOT EXISTS, TTL, reset or cascade: observe an uncertain original.
BEGIN;
CREATE TABLE daily_tip_generation_attempts (
  id TEXT NOT NULL PRIMARY KEY,
  date TEXT NOT NULL UNIQUE CHECK (date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','completed')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',clock_timestamp()),
  "completedAt" TIMESTAMP(3),
  CHECK ((state='pending' AND "completedAt" IS NULL)
    OR (state='completed' AND "completedAt" IS NOT NULL))
);
-- Raw SQL admission protocol; no generated Prisma model or production apply.
COMMIT;
