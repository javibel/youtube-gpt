CREATE TABLE extension_scorecard_operations (
 id TEXT PRIMARY KEY, principal TEXT NOT NULL, key TEXT NOT NULL UNIQUE, "eventId" TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL CHECK(state IN ('pending','complete')), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "videoId" TEXT, "viewCount" BIGINT, "capturedAt" TIMESTAMP(3),
 CHECK (("videoId" IS NULL AND "viewCount" IS NULL AND "capturedAt" IS NULL)
 OR (state='complete' AND "videoId" IS NOT NULL AND "videoId" ~ '^[A-Za-z0-9_-]{11}$' AND "viewCount" IS NOT NULL AND "viewCount" BETWEEN 0 AND 9007199254740991 AND "capturedAt" IS NOT NULL))
);
CREATE INDEX extension_scorecard_operations_principal ON extension_scorecard_operations(principal);
