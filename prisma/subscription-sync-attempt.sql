-- Additive synthetic sync admission; rows only deny another original.
-- No provider ID, price, secret or recovery capability is persisted.
CREATE TABLE subscription_sync_attempts (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  email TEXT NOT NULL, key TEXT NOT NULL,
  "subscriptionId" TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','complete')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(key ~ '^[A-Za-z0-9_-]{1,128}$')
);
