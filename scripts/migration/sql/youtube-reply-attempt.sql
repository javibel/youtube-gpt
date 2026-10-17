-- Local additive fence. Existing rows are negative only;never resume an owner.
CREATE TABLE youtube_reply_attempts (
 id TEXT PRIMARY KEY,
 "channelId" TEXT NOT NULL,
 "commentId" TEXT NOT NULL,
 source JSONB NOT NULL,
 state TEXT NOT NULL DEFAULT 'admitted',
 "messageId" TEXT UNIQUE REFERENCES social_messages(id) ON DELETE RESTRICT,
 "replyId" TEXT UNIQUE,
 "replyText" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',clock_timestamp()),
 "completedAt" TIMESTAMP(3),
 UNIQUE("channelId","commentId"),
 CHECK(length(id)>0 AND length("channelId")>0 AND length("commentId")>0),
 CHECK((jsonb_typeof(source)='object' AND source->>'channelId'="channelId" AND source->>'commentId'="commentId" AND source->>'canReply'='true') IS TRUE),
 CHECK(state IN ('admitted','completed')),
 CHECK((state='admitted' AND "messageId" IS NULL AND "replyId" IS NULL AND "replyText" IS NULL AND "completedAt" IS NULL)
 OR(state='completed' AND "messageId" IS NOT NULL AND "replyId" IS NOT NULL AND "replyText" IS NOT NULL AND length("replyId")>0 AND length("replyText") BETWEEN 1 AND 2000 AND "completedAt" IS NOT NULL))
);
