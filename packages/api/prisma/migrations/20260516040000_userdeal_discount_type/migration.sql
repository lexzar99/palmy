-- Lägg discountType på UserDeal så vi kan snapshota Deal.discountType
-- (PERCENTAGE | FIXED | FREE_DELIVERY). FREE_DELIVERY behöver speciell
-- behandling vid checkout — discounten matchar deliveryFee, inte
-- subtotal. amountKr/discountPercent används som tidigare för de
-- värdebärande typerna.
ALTER TABLE "UserDeal" ADD COLUMN IF NOT EXISTS "discountType" TEXT;
