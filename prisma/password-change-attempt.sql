-- Additive synthetic schema. Metadata denies reuse; it never restores an owner.
-- No password, password hash, intent digest, notice body or provider credentials.
CREATE TABLE password_change_attempts (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  email TEXT NOT NULL, key TEXT NOT NULL, lang TEXT NOT NULL CHECK(lang IN('es','en')),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','complete')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (key ~ '^[A-Za-z0-9_-]{1,128}$'),
  UNIQUE("userId",key)
);
CREATE UNIQUE INDEX password_change_pending_user ON password_change_attempts("userId") WHERE state='pending';
