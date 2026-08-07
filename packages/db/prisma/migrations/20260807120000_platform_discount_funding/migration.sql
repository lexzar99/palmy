-- Freeze which part of each checkout discount is financed by ViaEats.
-- Legacy rows default to zero and therefore retain the conservative rule that
-- an unclassified discount is restaurant-funded.
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "platformFundedFoodDiscountAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "platformFundedDeliveryDiscountAmount" INTEGER NOT NULL DEFAULT 0;

-- Backfill only sources that are unambiguous in durable data. UserDeal.type is
-- the platform-issued coupon class used at checkout. Personal-template deals
-- without a UserDeal are the automatic welcome path. Unknown legacy discounts
-- deliberately stay zero for manual review rather than being guessed.
UPDATE "Order" o
SET
  "platformFundedFoodDiscountAmount" = o."foodDiscountAmount",
  "platformFundedDeliveryDiscountAmount" = o."deliveryDiscountAmount"
FROM "UserDeal" ud
WHERE o."userDealId" = ud."id"
  AND ud."type" IN ('WELCOME', 'REFERRAL_INVITER', 'REFERRAL_INVITEE', 'MANUAL');

UPDATE "Order" o
SET
  "platformFundedFoodDiscountAmount" = o."foodDiscountAmount",
  "platformFundedDeliveryDiscountAmount" = o."deliveryDiscountAmount"
FROM "Deal" d
WHERE o."userDealId" IS NULL
  AND o."appliedDealId" = d."id"
  AND d."isPersonalTemplate" = TRUE;

COMMENT ON COLUMN "Order"."platformFundedFoodDiscountAmount" IS
  'Immutable öre snapshot: food discount funded by ViaEats; never inferred for historical orders.';
COMMENT ON COLUMN "Order"."platformFundedDeliveryDiscountAmount" IS
  'Immutable öre snapshot: delivery discount funded by ViaEats; never inferred for historical orders.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = current_schema()
      AND t.relname = 'Order'
      AND c.conname = 'Order_platform_funded_discount_components_check'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_platform_funded_discount_components_check"
      CHECK (
        "platformFundedFoodDiscountAmount" >= 0
        AND "platformFundedFoodDiscountAmount" <= "foodDiscountAmount"
        AND "platformFundedDeliveryDiscountAmount" >= 0
        AND "platformFundedDeliveryDiscountAmount" <= "deliveryDiscountAmount"
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE "Order"
  VALIDATE CONSTRAINT "Order_platform_funded_discount_components_check";
