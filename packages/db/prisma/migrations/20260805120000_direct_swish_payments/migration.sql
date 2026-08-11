ALTER TABLE "Order" ADD COLUMN "swishPaymentId" TEXT;

CREATE INDEX "Order_swishPaymentId_idx" ON "Order"("swishPaymentId");
