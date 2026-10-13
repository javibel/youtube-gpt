-- Pending exclusion never expires or resets.
-- Only a live acknowledged original can close its marker after a known terminal.
CREATE TABLE "email_verification_resend_admissions" (
  "email" TEXT PRIMARY KEY,
  "noticeId" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
