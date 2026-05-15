-- Add userDealId + userDealAmountKr to Order for UserDeal-coupon application
-- at checkout. Order PAID → UserDeal.status='USED'. Order failed/cancelled →
-- UserDeal.status='ACTIVE' (revert reservation).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "userDealId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "userDealAmountKr" INTEGER;
CREATE INDEX IF NOT EXISTS "Order_userDealId_idx" ON "Order"("userDealId");
