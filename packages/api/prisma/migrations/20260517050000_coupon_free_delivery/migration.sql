-- Stackbar fri leverans-flagga på DiscountCode. Default false så befintliga
-- rabattkoder fortsätter fungera exakt som tidigare. Admin kan bocka i på
-- nya/redigerade koder för att "20% + fri leverans" från en enda kod.
ALTER TABLE "DiscountCode"
  ADD COLUMN "freeDelivery" BOOLEAN NOT NULL DEFAULT false;
