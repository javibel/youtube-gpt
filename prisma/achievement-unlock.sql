CREATE TABLE achievement_unlock_admissions (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  "achievementId" TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('pending','complete')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("userId",key)
);
CREATE INDEX achievement_unlock_admissions_user ON achievement_unlock_admissions ("userId");
