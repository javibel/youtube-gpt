BEGIN;
CREATE TABLE admin_gmail_draft_attempts (
 id TEXT NOT NULL PRIMARY KEY,
 "commandRef" TEXT NOT NULL UNIQUE,
 "userId" TEXT NOT NULL REFERENCES users(id),
 email TEXT NOT NULL,
 "sessionRef" TEXT NOT NULL,
 mailbox TEXT NOT NULL CHECK(length(mailbox) BETWEEN 3 AND 254),
 "messageId" TEXT NOT NULL CHECK("messageId" ~ '^[a-f0-9]{1,128}$'),
 "threadId" TEXT NOT NULL CHECK("threadId" ~ '^[a-f0-9]{1,128}$'),
 source JSONB NOT NULL CHECK(jsonb_typeof(source)='object' AND octet_length(source::text)<=131072),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','completed')),
 content TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',clock_timestamp()),
 "completedAt" TIMESTAMP(3),
 UNIQUE(mailbox,"messageId"),
 CHECK((state='pending' AND content IS NULL AND "completedAt" IS NULL)
 OR(state='completed' AND content IS NOT NULL AND length(btrim(content))>0 AND length(content)<=6000 AND octet_length(content)<=8192 AND "completedAt" IS NOT NULL))
);
COMMIT;
