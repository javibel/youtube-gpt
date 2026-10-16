-- Additive local protocol. Existing attempts never authorize another producer.
BEGIN;
CREATE TABLE social_post_generation_attempts (
  id TEXT NOT NULL PRIMARY KEY,
  date TEXT NOT NULL CHECK(date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  platform TEXT NOT NULL CHECK(platform IN('facebook','instagram')),
  slot TEXT NOT NULL CHECK(slot IN('morning','evening')),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','completed')),
  content TEXT,
  pillar TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',clock_timestamp()),
  "completedAt" TIMESTAMP(3),
  UNIQUE(date,platform,slot),
  CHECK(slot='morning' OR platform='instagram'),
  CHECK((state='pending' AND content IS NULL AND pillar IS NULL AND "completedAt" IS NULL)
    OR(state='completed' AND content IS NOT NULL AND pillar IS NOT NULL AND length(btrim(content))>0 AND length(content)<=20000 AND length(btrim(pillar))>0 AND "completedAt" IS NOT NULL))
);
COMMIT;
