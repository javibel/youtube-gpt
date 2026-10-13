CREATE TABLE waitlist_welcome_admissions (
 email TEXT PRIMARY KEY,
 "noticeId" TEXT NOT NULL UNIQUE,
 "rowId" TEXT NOT NULL UNIQUE REFERENCES launch_waitlist(id) ON DELETE RESTRICT,
 status TEXT NOT NULL DEFAULT 'pending',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "completedAt" TIMESTAMP(3)
);
