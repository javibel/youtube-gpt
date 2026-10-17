BEGIN;
CREATE TABLE admin_youtube_draft_attempts (
 id TEXT NOT NULL PRIMARY KEY,
 "commandRef" TEXT NOT NULL UNIQUE,
 "userId" TEXT NOT NULL REFERENCES users(id),
 email TEXT NOT NULL,
 "sessionRef" TEXT NOT NULL,
 "channelId" TEXT NOT NULL CHECK("channelId" ~ '^UC[A-Za-z0-9_-]{22}$'),
 "commentId" TEXT NOT NULL CHECK(length("commentId") BETWEEN 1 AND 256 AND "commentId" !~ '[[:space:]]'),
 "threadId" TEXT NOT NULL CHECK(length("threadId") BETWEEN 1 AND 256 AND "threadId" !~ '[[:space:]]'),
 source JSONB NOT NULL CHECK(jsonb_typeof(source)='object' AND octet_length(source::text)<=131072),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','completed')),
 content TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',clock_timestamp()),
 "completedAt" TIMESTAMP(3),
 UNIQUE("channelId","commentId"),
 CHECK((state='pending' AND content IS NULL AND "completedAt" IS NULL)
 OR(state='completed' AND content IS NOT NULL AND length(btrim(content))>0 AND length(content)<=2000 AND octet_length(content)<=4096 AND "completedAt" IS NOT NULL))
);
COMMIT;
