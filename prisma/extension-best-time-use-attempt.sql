-- Additive migration only. Never adopt, reset or delete earlier operation rows.
CREATE TABLE extension_best_time_use_attempts (
 id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, "userId" TEXT NOT NULL,
 email TEXT NOT NULL, "tokenId" TEXT NOT NULL, "eventId" TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL CHECK(state IN ('pending','complete')),
 "createdAt" TIMESTAMP(3) NOT NULL, "eventAt" TIMESTAMP(3),
 CHECK(state='complete' OR "eventAt" IS NULL),
 CHECK("eventAt" IS NULL OR "eventAt"="createdAt")
);
CREATE INDEX extension_best_time_use_attempts_owner ON extension_best_time_use_attempts("userId");
