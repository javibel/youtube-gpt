-- Additive synthetic cancellation admission. Rows only deny new originals.
-- No provider identifier, URL, secret or recovery capability is persisted.
CREATE TABLE subscription_cancellation_attempts (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  email TEXT NOT NULL, key TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL, plan TEXT NOT NULL CHECK(plan IN('pro','business')),
  status TEXT NOT NULL CHECK(status IN('active','trialing')),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','complete')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(key ~ '^[A-Za-z0-9_-]{1,128}$')
);
