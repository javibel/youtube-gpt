-- Additive local schema, after checking the designated synthetic database.
-- Rows deny duplicate work. They grant no recovery, takeover or release.
CREATE TABLE optimize_update_attempts (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "videoId" TEXT NOT NULL,
  key TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','complete')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("userId",key)
);
CREATE INDEX optimize_update_attempts_userId_videoId_state_idx ON optimize_update_attempts("userId","videoId",state);
CREATE UNIQUE INDEX optimize_update_attempts_pending_video_idx ON optimize_update_attempts("userId","videoId") WHERE state <> 'complete';
