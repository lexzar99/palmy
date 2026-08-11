-- Core payment integrity for direct Swish + Stripe.
-- Idempotent and safe to run before the provider-neutral payout migration.

-- One real PSP reference may fund at most one order. Explicit test sentinels
-- are excluded because local/test flows intentionally reuse them.
CREATE UNIQUE INDEX IF NOT EXISTS "Order_stripePaymentIntentId_real_key"
  ON "Order" ((BTRIM("stripePaymentIntentId")))
  WHERE "stripePaymentIntentId" IS NOT NULL
    AND BTRIM("stripePaymentIntentId") <> ''
    AND UPPER(BTRIM("stripePaymentIntentId")) NOT IN ('TEST_PAYMENT', 'BYPASS', 'FREE_PROMO');

CREATE UNIQUE INDEX IF NOT EXISTS "Order_swishPaymentId_real_key"
  ON "Order" ((BTRIM("swishPaymentId")))
  WHERE "swishPaymentId" IS NOT NULL
    AND BTRIM("swishPaymentId") <> '';

-- The durable refund ledger predates direct Swish. Keep all supported PSPs in
-- one validated provider constraint so a successful Swish refund can be
-- persisted instead of failing after the remote bank call.
DO $$
BEGIN
  IF to_regclass('"PaymentRefund"') IS NOT NULL THEN
    ALTER TABLE "PaymentRefund"
      DROP CONSTRAINT IF EXISTS "PaymentRefund_provider_check";
    ALTER TABLE "PaymentRefund"
      ADD CONSTRAINT "PaymentRefund_provider_check"
      CHECK ("provider" IN ('mollie', 'stripe', 'adyen', 'swish')) NOT VALID;
    ALTER TABLE "PaymentRefund"
      VALIDATE CONSTRAINT "PaymentRefund_provider_check";
  END IF;
END $$;
