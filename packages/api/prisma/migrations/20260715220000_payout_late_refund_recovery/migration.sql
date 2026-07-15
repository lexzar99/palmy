-- P1 payout hardening: immutable economic snapshots and exact carry-forward
-- recovery for cumulative refunds received after a payout was already PAID.
-- This patch is intentionally idempotent because production is manually
-- baselined; see docs/LAUNCH_DATABASE_RUNBOOK.md.

ALTER TABLE "RestaurantPayout"
  ADD COLUMN IF NOT EXISTS "manualAdjustmentAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lateRefundAdjustmentAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "commissionPctSnapshot" INTEGER,
  ADD COLUMN IF NOT EXISTS "feeVatPctSnapshot" INTEGER,
  ADD COLUMN IF NOT EXISTS "selfDeliverySnapshot" BOOLEAN;

-- Preserve every existing manual adjustment before retiring the ambiguous
-- legacy column. Dynamic SQL keeps the patch safe on a fresh/retried schema.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'RestaurantPayout'
      AND column_name = 'adjustmentAmount'
  ) THEN
    EXECUTE '
      UPDATE "RestaurantPayout"
      SET "manualAdjustmentAmount" = "adjustmentAmount"
      WHERE "manualAdjustmentAmount" = 0 AND "adjustmentAmount" <> 0
    ';
    EXECUTE 'ALTER TABLE "RestaurantPayout" DROP COLUMN "adjustmentAmount"';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'RestaurantPayout_lateRefundAdjustmentAmount_nonnegative_check'
      AND conrelid = '"RestaurantPayout"'::regclass
  ) THEN
    ALTER TABLE "RestaurantPayout"
      ADD CONSTRAINT "RestaurantPayout_lateRefundAdjustmentAmount_nonnegative_check"
      CHECK ("lateRefundAdjustmentAmount" >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PayoutRecoveryAllocation" (
  "id" TEXT NOT NULL,
  "sourcePayoutId" TEXT NOT NULL,
  "targetPayoutId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RESERVED',
  "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "appliedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "releaseReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayoutRecoveryAllocation_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PayoutRecoveryAllocation_amount_positive_check'
      AND conrelid = '"PayoutRecoveryAllocation"'::regclass
  ) THEN
    ALTER TABLE "PayoutRecoveryAllocation"
      ADD CONSTRAINT "PayoutRecoveryAllocation_amount_positive_check" CHECK ("amount" > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PayoutRecoveryAllocation_status_check'
      AND conrelid = '"PayoutRecoveryAllocation"'::regclass
  ) THEN
    ALTER TABLE "PayoutRecoveryAllocation"
      ADD CONSTRAINT "PayoutRecoveryAllocation_status_check"
      CHECK ("status" IN ('RESERVED', 'APPLIED', 'RELEASED'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PayoutRecoveryAllocation_distinct_payouts_check'
      AND conrelid = '"PayoutRecoveryAllocation"'::regclass
  ) THEN
    ALTER TABLE "PayoutRecoveryAllocation"
      ADD CONSTRAINT "PayoutRecoveryAllocation_distinct_payouts_check"
      CHECK ("sourcePayoutId" <> "targetPayoutId");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PayoutRecoveryAllocation_sourcePayoutId_fkey'
      AND conrelid = '"PayoutRecoveryAllocation"'::regclass
  ) THEN
    ALTER TABLE "PayoutRecoveryAllocation"
      ADD CONSTRAINT "PayoutRecoveryAllocation_sourcePayoutId_fkey"
      FOREIGN KEY ("sourcePayoutId") REFERENCES "RestaurantPayout"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PayoutRecoveryAllocation_targetPayoutId_fkey'
      AND conrelid = '"PayoutRecoveryAllocation"'::regclass
  ) THEN
    ALTER TABLE "PayoutRecoveryAllocation"
      ADD CONSTRAINT "PayoutRecoveryAllocation_targetPayoutId_fkey"
      FOREIGN KEY ("targetPayoutId") REFERENCES "RestaurantPayout"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "PayoutRecoveryAllocation_sourcePayoutId_targetPayoutId_key"
  ON "PayoutRecoveryAllocation"("sourcePayoutId", "targetPayoutId");
CREATE INDEX IF NOT EXISTS "PayoutRecoveryAllocation_sourcePayoutId_status_idx"
  ON "PayoutRecoveryAllocation"("sourcePayoutId", "status");
CREATE INDEX IF NOT EXISTS "PayoutRecoveryAllocation_targetPayoutId_status_idx"
  ON "PayoutRecoveryAllocation"("targetPayoutId", "status");

CREATE OR REPLACE FUNCTION viaeats_validate_payout_recovery_allocation()
RETURNS trigger AS $$
DECLARE
  source_restaurant TEXT;
  source_status TEXT;
  target_restaurant TEXT;
  target_status TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."status" = 'APPLIED' AND (
      NEW."sourcePayoutId" IS DISTINCT FROM OLD."sourcePayoutId" OR
      NEW."targetPayoutId" IS DISTINCT FROM OLD."targetPayoutId" OR
      NEW."amount" IS DISTINCT FROM OLD."amount" OR
      NEW."status" IS DISTINCT FROM OLD."status" OR
      NEW."reservedAt" IS DISTINCT FROM OLD."reservedAt" OR
      NEW."appliedAt" IS DISTINCT FROM OLD."appliedAt"
    ) THEN
      RAISE EXCEPTION 'Applied payout recovery allocations are immutable';
    END IF;
    IF NEW."sourcePayoutId" IS DISTINCT FROM OLD."sourcePayoutId" OR
       NEW."targetPayoutId" IS DISTINCT FROM OLD."targetPayoutId" THEN
      RAISE EXCEPTION 'Payout recovery source and target are immutable';
    END IF;
  END IF;

  SELECT "restaurantId", "status" INTO source_restaurant, source_status
  FROM "RestaurantPayout" WHERE "id" = NEW."sourcePayoutId";
  SELECT "restaurantId", "status" INTO target_restaurant, target_status
  FROM "RestaurantPayout" WHERE "id" = NEW."targetPayoutId";

  IF source_restaurant IS NULL OR target_restaurant IS NULL OR source_restaurant <> target_restaurant THEN
    RAISE EXCEPTION 'Payout recovery source and target must belong to the same restaurant';
  END IF;
  IF source_status <> 'PAID' THEN
    RAISE EXCEPTION 'Payout recovery source must be PAID';
  END IF;
  IF NEW."status" = 'RESERVED' AND target_status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Reserved payout recovery target must be APPROVED';
  END IF;
  IF NEW."status" = 'APPLIED' AND target_status <> 'PAID' THEN
    RAISE EXCEPTION 'Applied payout recovery target must be PAID';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "PayoutRecoveryAllocation_validate" ON "PayoutRecoveryAllocation";
CREATE TRIGGER "PayoutRecoveryAllocation_validate"
  BEFORE INSERT OR UPDATE ON "PayoutRecoveryAllocation"
  FOR EACH ROW EXECUTE FUNCTION viaeats_validate_payout_recovery_allocation();

CREATE OR REPLACE FUNCTION viaeats_block_payout_recovery_hard_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Hard delete of PayoutRecoveryAllocation is disabled; release the reservation instead';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "PayoutRecoveryAllocation_block_hard_delete" ON "PayoutRecoveryAllocation";
CREATE TRIGGER "PayoutRecoveryAllocation_block_hard_delete"
  BEFORE DELETE ON "PayoutRecoveryAllocation"
  FOR EACH ROW EXECUTE FUNCTION viaeats_block_payout_recovery_hard_delete();
