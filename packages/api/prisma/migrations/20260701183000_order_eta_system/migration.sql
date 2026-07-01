ALTER TABLE "Order" ADD COLUMN "etaReadyAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "etaPickupAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "etaCustomerAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "etaCustomerMin" INTEGER;
ALTER TABLE "Order" ADD COLUMN "etaPriorityScore" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN "etaReason" TEXT;

CREATE INDEX "Order_etaCustomerAt_idx" ON "Order"("etaCustomerAt");
CREATE INDEX "Order_restaurantId_etaCustomerAt_idx" ON "Order"("restaurantId", "etaCustomerAt");
