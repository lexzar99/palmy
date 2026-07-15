-- P1 finance hardening: durable, append-only refund evidence per PSP refund.
-- The patch is intentionally idempotent because production is manually
-- baselined; see docs/LAUNCH_DATABASE_RUNBOOK.md.

CREATE TABLE IF NOT EXISTS "PaymentRefund" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "paymentRef" TEXT NOT NULL,
  "refundRef" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "cumulativeAmount" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "source" TEXT NOT NULL,
  "actorAdminId" TEXT,
  "reason" TEXT,
  "providerCreatedAt" TIMESTAMP(3),
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PaymentRefund_orderId_fkey'
      AND conrelid = '"PaymentRefund"'::regclass
  ) THEN
    ALTER TABLE "PaymentRefund"
      ADD CONSTRAINT "PaymentRefund_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PaymentRefund_amount_check'
      AND conrelid = '"PaymentRefund"'::regclass
  ) THEN
    ALTER TABLE "PaymentRefund"
      ADD CONSTRAINT "PaymentRefund_amount_check"
      CHECK ("amount" > 0 AND "cumulativeAmount" >= "amount");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PaymentRefund_provider_check'
      AND conrelid = '"PaymentRefund"'::regclass
  ) THEN
    ALTER TABLE "PaymentRefund"
      ADD CONSTRAINT "PaymentRefund_provider_check"
      CHECK ("provider" IN ('mollie', 'stripe', 'adyen'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PaymentRefund_status_check'
      AND conrelid = '"PaymentRefund"'::regclass
  ) THEN
    ALTER TABLE "PaymentRefund"
      ADD CONSTRAINT "PaymentRefund_status_check"
      CHECK ("status" IN (
        'REQUESTED', 'QUEUED', 'PENDING', 'PROCESSING',
        'REFUNDED', 'FAILED', 'CANCELED', 'UNKNOWN'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PaymentRefund_source_check'
      AND conrelid = '"PaymentRefund"'::regclass
  ) THEN
    ALTER TABLE "PaymentRefund"
      ADD CONSTRAINT "PaymentRefund_source_check"
      CHECK ("source" IN (
        'ADMIN', 'WEBHOOK', 'REFUND_RECONCILE', 'PAYOUT_PREFLIGHT',
        'PAYMENT_STATUS', 'STRIPE_SYNC', 'ADYEN_WEBHOOK'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PaymentRefund_refs_nonblank_check'
      AND conrelid = '"PaymentRefund"'::regclass
  ) THEN
    ALTER TABLE "PaymentRefund"
      ADD CONSTRAINT "PaymentRefund_refs_nonblank_check"
      CHECK (
        btrim("paymentRef") <> ''
        AND btrim("idempotencyKey") <> ''
        AND ("refundRef" IS NULL OR btrim("refundRef") <> '')
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PaymentRefund_lifecycle_timestamps_check'
      AND conrelid = '"PaymentRefund"'::regclass
  ) THEN
    ALTER TABLE "PaymentRefund"
      ADD CONSTRAINT "PaymentRefund_lifecycle_timestamps_check"
      CHECK (
        ("status" <> 'REFUNDED' OR "completedAt" IS NOT NULL)
        AND ("status" NOT IN ('FAILED', 'CANCELED') OR "failedAt" IS NOT NULL)
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentRefund_idempotencyKey_key"
  ON "PaymentRefund"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentRefund_provider_refundRef_key"
  ON "PaymentRefund"("provider", "refundRef");
CREATE INDEX IF NOT EXISTS "PaymentRefund_orderId_createdAt_idx"
  ON "PaymentRefund"("orderId", "createdAt");
CREATE INDEX IF NOT EXISTS "PaymentRefund_provider_status_lastSeenAt_idx"
  ON "PaymentRefund"("provider", "status", "lastSeenAt");

CREATE OR REPLACE FUNCTION viaeats_validate_payment_refund_update()
RETURNS trigger AS $$
BEGIN
  IF
    NEW."id" IS DISTINCT FROM OLD."id" OR
    NEW."orderId" IS DISTINCT FROM OLD."orderId" OR
    NEW."provider" IS DISTINCT FROM OLD."provider" OR
    NEW."paymentRef" IS DISTINCT FROM OLD."paymentRef" OR
    NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey" OR
    NEW."amount" IS DISTINCT FROM OLD."amount" OR
    NEW."cumulativeAmount" IS DISTINCT FROM OLD."cumulativeAmount" OR
    NEW."source" IS DISTINCT FROM OLD."source" OR
    NEW."actorAdminId" IS DISTINCT FROM OLD."actorAdminId" OR
    NEW."reason" IS DISTINCT FROM OLD."reason" OR
    NEW."firstSeenAt" IS DISTINCT FROM OLD."firstSeenAt" OR
    NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'PaymentRefund economic/source fields are immutable';
  END IF;

  IF OLD."refundRef" IS NOT NULL AND NEW."refundRef" IS DISTINCT FROM OLD."refundRef" THEN
    RAISE EXCEPTION 'PaymentRefund refundRef may only be attached once';
  END IF;
  IF OLD."providerCreatedAt" IS NOT NULL
     AND NEW."providerCreatedAt" IS DISTINCT FROM OLD."providerCreatedAt" THEN
    RAISE EXCEPTION 'PaymentRefund providerCreatedAt may only be attached once';
  END IF;
  IF OLD."completedAt" IS NOT NULL THEN
    NEW."completedAt" := OLD."completedAt";
  END IF;
  IF OLD."failedAt" IS NOT NULL THEN
    NEW."failedAt" := OLD."failedAt";
  END IF;
  IF NEW."lastSeenAt" < OLD."lastSeenAt" THEN
    NEW."lastSeenAt" := OLD."lastSeenAt";
  END IF;
  IF OLD."status" = 'REFUNDED' AND NEW."status" <> 'REFUNDED' THEN
    RAISE EXCEPTION 'A refunded PaymentRefund lifecycle may not regress';
  END IF;
  IF OLD."status" IN ('FAILED', 'CANCELED')
     AND NEW."status" NOT IN (OLD."status", 'REFUNDED') THEN
    RAISE EXCEPTION 'A terminal PaymentRefund lifecycle may not regress';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "PaymentRefund_validate_update" ON "PaymentRefund";
CREATE TRIGGER "PaymentRefund_validate_update"
  BEFORE UPDATE ON "PaymentRefund"
  FOR EACH ROW EXECUTE FUNCTION viaeats_validate_payment_refund_update();

CREATE OR REPLACE FUNCTION viaeats_block_payment_refund_hard_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Hard delete of PaymentRefund is disabled; retain the accounting trail'
    USING ERRCODE = '23503';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "PaymentRefund_block_hard_delete" ON "PaymentRefund";
CREATE TRIGGER "PaymentRefund_block_hard_delete"
  BEFORE DELETE ON "PaymentRefund"
  FOR EACH ROW EXECUTE FUNCTION viaeats_block_payment_refund_hard_delete();
