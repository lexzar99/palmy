-- Stackbar fri-leverans-flagga separat från discountType. Tidigare var
-- FREE_DELIVERY ett value i discountType-enum, men det förhindrade
-- kombination med procent/kr-rabatt. Nu kan en deal ha både t.ex.
-- "25% rabatt" OCH "fri leverans" samtidigt.
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "freeDelivery" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserDeal" ADD COLUMN IF NOT EXISTS "freeDelivery" BOOLEAN NOT NULL DEFAULT false;

-- Migrera befintliga deals: om discountType=FREE_DELIVERY → sätt
-- freeDelivery=true och discountType=NONE så data är konsistent.
UPDATE "Deal" SET "freeDelivery" = true, "discountType" = 'NONE'
WHERE "discountType" = 'FREE_DELIVERY';

UPDATE "UserDeal" SET "freeDelivery" = true, "discountType" = 'NONE'
WHERE "discountType" = 'FREE_DELIVERY';
