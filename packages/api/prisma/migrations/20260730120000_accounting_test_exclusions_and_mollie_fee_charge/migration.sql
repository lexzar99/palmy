ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "accountingExcluded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "accountingExclusionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "accountingExcludedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "accountingExcludedBy" TEXT;

ALTER TABLE "RestaurantPayout"
  ADD COLUMN IF NOT EXISTS "mollieFeeAmount" INTEGER NOT NULL DEFAULT 0;

-- These are the live Burger King test payments that were refunded during the
-- Mollie integration test. Keep the original transactions and fees intact,
-- but prevent them from becoming a restaurant liability or partner invoice.
UPDATE "Order"
SET
  "accountingExcluded" = true,
  "accountingExclusionReason" = COALESCE("accountingExclusionReason", 'Intern test – återbetald'),
  "accountingExcludedAt" = COALESCE("accountingExcludedAt", CURRENT_TIMESTAMP),
  "accountingExcludedBy" = COALESCE("accountingExcludedBy", 'system:burger-king-test-cleanup')
WHERE "orderNumber" IN (
  'BU-1002', 'BU-1003', 'BU-1004', 'BU-1005',
  'BU-1006', 'BU-1007', 'BU-1008', 'BU-1009',
  'BU-1010', 'BU-1011'
);

CREATE INDEX IF NOT EXISTS "Order_accountingExcluded_createdAt_idx"
  ON "Order" ("accountingExcluded", "createdAt");
