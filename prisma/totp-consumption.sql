-- Additive schema; apply only in an explicitly authorized database.
-- Consumption is permanent. No expiry or generic recovery deletes watermarks.
CREATE TABLE IF NOT EXISTS "totp_consumptions" (
  "key" TEXT PRIMARY KEY,
  "counter" BIGINT NOT NULL CHECK ("counter" >= 0),
  "consumed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
