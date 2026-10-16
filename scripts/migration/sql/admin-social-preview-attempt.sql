BEGIN;
CREATE TABLE admin_social_preview_attempts (
  id TEXT NOT NULL PRIMARY KEY,
  "commandRef" TEXT NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN('facebook','instagram')),
  type TEXT NOT NULL CHECK(type IN('morning','evening')),
  "userId" TEXT NOT NULL REFERENCES users(id),
  email TEXT NOT NULL,
  "sessionRef" TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','completed')),
  content TEXT,
  pillar TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',clock_timestamp()),
  "completedAt" TIMESTAMP(3),
  UNIQUE("commandRef",platform),
  CHECK((state='pending' AND content IS NULL AND pillar IS NULL AND "completedAt" IS NULL)
    OR(state='completed' AND content IS NOT NULL AND pillar IS NOT NULL AND length(btrim(content))>0 AND length(content)<=20000 AND length(btrim(pillar))>0 AND "completedAt" IS NOT NULL))
);
COMMIT;
