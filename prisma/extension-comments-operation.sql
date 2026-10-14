CREATE TABLE extension_comments_operations (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  "eventId" TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('pending','complete')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("userId",key)
);
CREATE INDEX extension_comments_operations_user ON extension_comments_operations ("userId");
