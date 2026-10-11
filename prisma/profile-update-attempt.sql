-- Additive synthetic schema. A stored row only denies reuse, never resumes work.
CREATE TABLE profile_update_attempts (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  email TEXT NOT NULL, key TEXT NOT NULL, operation TEXT NOT NULL,
  "previousName" TEXT, name TEXT, "previousLang" TEXT, lang TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','complete')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (key ~ '^[A-Za-z0-9_-]{1,128}$'),
  CHECK (
    (operation='name' AND name IS NOT NULL AND char_length(name) BETWEEN 1 AND 100
      AND ("previousName" IS NULL OR char_length("previousName")<=1000)
      AND name IS DISTINCT FROM "previousName" AND "previousLang" IS NULL AND lang IS NULL)
    OR (operation='language' AND name IS NULL AND "previousName" IS NULL
      AND "previousLang" IS NOT NULL AND "previousLang" IN('es','en')
      AND lang IS NOT NULL AND lang IN('es','en') AND lang<>"previousLang")
  ),
  UNIQUE("userId",key)
);
CREATE UNIQUE INDEX profile_update_pending_user ON profile_update_attempts("userId") WHERE state='pending';
