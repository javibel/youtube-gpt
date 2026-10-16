-- Additive local schema. Neither old rows nor clocks can restore a sender.
BEGIN;
CREATE TABLE daily_ideas_email_attempts (
  id TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id),
  date TEXT NOT NULL CHECK(date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  "ideaId" TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','provider-accepted')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',clock_timestamp()),
  "acceptedAt" TIMESTAMP(3),
  UNIQUE("userId",date),
  CHECK((state='pending' AND "acceptedAt" IS NULL) OR (state='provider-accepted' AND "acceptedAt" IS NOT NULL))
);
COMMIT;
