CREATE TABLE affiliate_application_admissions (
 email TEXT PRIMARY KEY,
 "noticeId" TEXT NOT NULL UNIQUE,
 "affiliateId" TEXT NOT NULL UNIQUE,
 lang TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "completedAt" TIMESTAMP(3),
 CONSTRAINT affiliate_application_affiliate_fkey FOREIGN KEY ("affiliateId")
   REFERENCES affiliates(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
);
