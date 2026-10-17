BEGIN;
CREATE TABLE social_publication_daily_attempts (
  id text PRIMARY KEY,
  platform text NOT NULL CHECK (platform IN ('facebook','instagram')),
  "accountId" text NOT NULL CHECK ("accountId" ~ '^[0-9]{1,32}$'),
  date text NOT NULL CHECK (date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  "ownerKind" text NOT NULL CHECK ("ownerKind" IN ('manual','cron')),
  "ownerId" text NOT NULL CHECK (length("ownerId")>0),
  state text NOT NULL DEFAULT 'admitted' CHECK (state='admitted'),
  "createdAt" timestamp(3) NOT NULL DEFAULT timezone('UTC',clock_timestamp()),
  UNIQUE (platform,"accountId",date),
  UNIQUE ("ownerKind","ownerId")
);
COMMIT;
