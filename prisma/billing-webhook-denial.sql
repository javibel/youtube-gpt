-- Additive synthetic permanent denial; no expiry, recovery, release or writer authority.
CREATE TABLE billing_webhook_denials (
 id TEXT PRIMARY KEY,
 "userId" TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 email TEXT NOT NULL, "eventId" TEXT NOT NULL UNIQUE, "eventType" TEXT NOT NULL,
 "objectId" TEXT NOT NULL UNIQUE, "customerId" TEXT NOT NULL UNIQUE,
 "stripeSubscriptionId" TEXT NOT NULL, "linkedSubscriptionId" TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state='pending'),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("eventType" IN ('invoice.payment_succeeded','invoice.payment_failed','customer.subscription.updated','customer.subscription.deleted','customer.subscription.trial_will_end','charge.refunded'))
);
