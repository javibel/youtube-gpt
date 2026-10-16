-- Local additive migration only. No replay/reset/cascade/TTL.
BEGIN;
CREATE TABLE daily_idea_generation_attempts (
  id TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id),
  date TEXT NOT NULL CHECK(date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','completed')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',clock_timestamp()),
  "completedAt" TIMESTAMP(3),
  UNIQUE("userId",date),
  CHECK((state='pending' AND "completedAt" IS NULL) OR (state='completed' AND "completedAt" IS NOT NULL))
);
COMMIT;
