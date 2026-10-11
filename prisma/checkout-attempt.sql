-- Additive local synthetic admission; retained rows only deny, never recover.
-- Even complete rows exclude a fresh checkout: no trusted payment retirement exists.
-- No provider/customer/session URL, capability or secret is persisted here.
CREATE TABLE checkout_attempts (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  email TEXT NOT NULL, key TEXT NOT NULL, plan TEXT NOT NULL CHECK(plan IN('monthly','yearly','business_monthly','business_yearly')),
  lang TEXT NOT NULL CHECK(lang IN('es','en')), currency TEXT NOT NULL CHECK(currency IN('eur','usd')),
  "priceId" TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','complete')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(key ~ '^[A-Za-z0-9_-]{1,128}$')
);
