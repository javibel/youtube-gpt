-- Negative tombstones only.No payload or recovery/release/expiry API.
CREATE TABLE retention_deletion_attempts (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL,
 "rowKey" TEXT NOT NULL,
 version TEXT NOT NULL,
 "ownerId" TEXT,
 source JSONB NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending',
 deleted BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',clock_timestamp()),
 "completedAt" TIMESTAMP(3),
 UNIQUE(kind,"rowKey",version),
 CHECK(kind IN ('cache','score','alert') AND length(id)>0 AND length("rowKey")>0 AND version~'^[0-9]{1,10}$'),
 CHECK((jsonb_typeof(source)='object' AND source->>'kind'=kind AND source->>'rowKey'="rowKey" AND source->>'version'=version AND (source->>'ownerId') IS NOT DISTINCT FROM "ownerId") IS TRUE),
 CHECK((kind='cache' AND "ownerId" IS NULL) OR (kind<>'cache' AND "ownerId" IS NOT NULL)),
 CHECK((state='pending' AND NOT deleted AND "completedAt" IS NULL) OR (state='completed' AND deleted AND "completedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX retention_deletion_pending ON retention_deletion_attempts(kind,"rowKey") WHERE state='pending';
