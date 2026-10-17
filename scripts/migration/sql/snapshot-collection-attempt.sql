-- Permanent negative fence only;no recovery/adoption/expiry API or user FK.
CREATE TABLE snapshot_collection_attempts (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL,
 "entityId" TEXT NOT NULL,
 "userId" TEXT NOT NULL,
 date TEXT NOT NULL,
 source JSONB NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending',
 "snapshotId" TEXT,
 statistics JSONB,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',clock_timestamp()),
 "completedAt" TIMESTAMP(3),
 UNIQUE(kind,"entityId",date),
 CHECK(kind='competitor' AND length(id)>0 AND length("entityId")>0 AND length("userId")>0 AND date~'^\d{4}-\d{2}-\d{2}$'),
 CHECK((jsonb_typeof(source)='object' AND source->>'competitorId'="entityId" AND source->>'userId'="userId") IS TRUE),
 CHECK(state IN ('pending','completed')),
 CHECK((state='pending' AND "snapshotId" IS NULL AND statistics IS NULL AND "completedAt" IS NULL) OR (state='completed' AND "snapshotId" IS NOT NULL AND statistics IS NOT NULL AND jsonb_typeof(statistics)='object' AND "completedAt" IS NOT NULL))
);
