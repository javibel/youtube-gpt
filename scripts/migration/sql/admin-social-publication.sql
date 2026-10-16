BEGIN;
CREATE TABLE admin_social_publish_attempts (
  id text PRIMARY KEY,
  "commandRef" text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('facebook','instagram')),
  "accountId" text NOT NULL CHECK ("accountId" ~ '^[0-9]{1,32}$'),
  date text NOT NULL CHECK (date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  "userId" text NOT NULL REFERENCES users(id),
  "sessionRef" text NOT NULL,
  state text NOT NULL DEFAULT 'admitted' CHECK (state IN ('admitted','completed')),
  "recordId" text UNIQUE REFERENCES social_posts(id),
  "postId" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT timezone('UTC',clock_timestamp()),
  "completedAt" timestamp(3),
  UNIQUE (platform,"accountId",date),
  UNIQUE ("commandRef",platform),
  CHECK ((state='admitted' AND "recordId" IS NULL AND "postId" IS NULL AND "completedAt" IS NULL)
    OR (state='completed' AND "recordId" IS NOT NULL AND "postId" IS NOT NULL AND length("postId")>0 AND "completedAt" IS NOT NULL))
);
COMMIT;
