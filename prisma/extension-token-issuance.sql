CREATE TABLE extension_token_issuances (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  "tokenId" TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('pending','complete')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("userId",key)
);
CREATE INDEX extension_token_issuances_user ON extension_token_issuances ("userId");
