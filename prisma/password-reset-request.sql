-- Pending exclusion never expires or restores delivery/recovery authority.
-- Only its live original can close it after an acknowledged terminal.
CREATE TABLE "password_reset_request_admissions" (
  "email" TEXT PRIMARY KEY,
  "noticeId" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL,
  "tokenId" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
