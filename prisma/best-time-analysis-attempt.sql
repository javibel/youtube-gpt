-- Fresh, acknowledged original only. Row presence denies every new original.
-- No source token, model credential or recovery capability is persisted.
CREATE TABLE best_time_analysis_attempts (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  email TEXT NOT NULL,
  "channelId" TEXT NOT NULL CHECK("channelId" ~ '^[-A-Za-z0-9_]{1,128}$'),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','complete')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
