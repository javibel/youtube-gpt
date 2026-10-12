-- Additive synthetic denial, never entitlement, recovery, or an expiring lease.
CREATE TABLE checkout_webhook_denials (
 id TEXT PRIMARY KEY,
 "userId" TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 email TEXT NOT NULL, "eventId" TEXT NOT NULL UNIQUE, "sessionId" TEXT NOT NULL UNIQUE,
 "customerId" TEXT NOT NULL UNIQUE, "stripeSubscriptionId" TEXT NOT NULL, "linkedSubscriptionId" TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state='pending'),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
