-- Additive local admission only. No runtime DDL,lease,expiry,recovery or cache adoption.
BEGIN;
CREATE TABLE cron_daily_brand_image_attempts (
  id TEXT NOT NULL PRIMARY KEY,
  date TEXT NOT NULL UNIQUE CHECK(date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  "sourceId" TEXT NOT NULL UNIQUE REFERENCES social_post_generation_attempts(id),
  platform TEXT NOT NULL CHECK(platform IN('facebook','instagram')),
  slot TEXT NOT NULL CHECK(slot IN('morning','evening')),
  state TEXT NOT NULL DEFAULT 'admitted' CHECK(state='admitted'),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',clock_timestamp()),
  CHECK(slot='morning' OR platform='instagram')
);
COMMIT;
