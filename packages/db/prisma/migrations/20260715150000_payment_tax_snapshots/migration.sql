-- Freeze the tax and discount composition used by the PSP and receipts.
-- Existing orders keep conservative defaults; only newly created orders use
-- the split fields as authoritative payment input.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "vatPercent" INTEGER;

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "foodDiscountAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "deliveryDiscountAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "smallOrderFee" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "foodVatPercent" INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS "deliveryVatPercent" INTEGER;

ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "vatPercent" INTEGER NOT NULL DEFAULT 6;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentEffectsCompletedAt" TIMESTAMP(3);

-- Do not replay historic paid orders when the recovery worker is introduced.
-- New checkout rows are created after this patch and remain NULL until all
-- idempotent payment business effects have completed.
UPDATE "Order"
SET "paymentEffectsCompletedAt" = COALESCE("paymentEffectsCompletedAt", NOW())
WHERE "paymentStatus" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- Provider får aldrig ärvas från en historisk Stripe-default. API:t fryser
-- den aktiva providern explicit när ordern skapas; befintliga rader ändras inte.
ALTER TABLE "Order" ALTER COLUMN "paymentProvider" DROP DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Product_vatPercent_check'
  ) THEN
    ALTER TABLE "Product"
      ADD CONSTRAINT "Product_vatPercent_check"
      CHECK ("vatPercent" IS NULL OR "vatPercent" IN (0, 6, 12, 25));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Order_discount_components_nonnegative_check'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_discount_components_nonnegative_check"
      CHECK (
        "foodDiscountAmount" >= 0
        AND "deliveryDiscountAmount" >= 0
        AND "smallOrderFee" >= 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Order_foodVatPercent_check'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_foodVatPercent_check"
      CHECK ("foodVatPercent" IN (0, 6, 12, 25));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Order_deliveryVatPercent_check'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_deliveryVatPercent_check"
      CHECK ("deliveryVatPercent" IS NULL OR "deliveryVatPercent" IN (0, 6, 12, 25));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_vatPercent_check'
  ) THEN
    ALTER TABLE "OrderItem"
      ADD CONSTRAINT "OrderItem_vatPercent_check"
      CHECK ("vatPercent" IN (0, 6, 12, 25));
  END IF;
END $$;
