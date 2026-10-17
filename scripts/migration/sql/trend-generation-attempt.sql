-- Additive local fence. A prior row only excludes;it never restores an original.
CREATE TABLE trend_generation_attempts (
 id TEXT PRIMARY KEY,
 "userId" TEXT NOT NULL,
 date TEXT NOT NULL,
 source JSONB NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending',
 alerts JSONB,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',clock_timestamp()),
 "completedAt" TIMESTAMP(3),
 UNIQUE("userId",date),
 CHECK(length(id)>0 AND length("userId")>0 AND date~'^\d{4}-\d{2}-\d{2}$'),
 CHECK((jsonb_typeof(source)='object' AND source->>'userId'="userId") IS TRUE),
 CHECK(state IN ('pending','completed')),
 CHECK((state='pending' AND alerts IS NULL AND "completedAt" IS NULL) OR
 (state='completed' AND alerts IS NOT NULL AND jsonb_typeof(alerts)='array' AND jsonb_array_length(alerts)<=3 AND "completedAt" IS NOT NULL))
);