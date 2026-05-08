-- Multi-restaurant support for DiscountCode
ALTER TABLE "DiscountCode" ADD COLUMN "applicableRestaurantIds" TEXT NOT NULL DEFAULT '[]';

-- BOGO Category deal fields on Deal
ALTER TABLE "Deal" ADD COLUMN "triggerCategoryId" TEXT;
ALTER TABLE "Deal" ADD COLUMN "triggerQuantity" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "Deal" ADD COLUMN "rewardCategoryId" TEXT;
