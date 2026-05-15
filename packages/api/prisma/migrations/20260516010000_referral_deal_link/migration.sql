-- Referral pekar nu på en valfri Deal som rabatt-mall.
-- Admin skapar Dealen i /admin/deals (full flexibilitet — percent, fixed,
-- BOGO, min-order, expiry osv) och länkar hit. När referral triggas
-- snapshotas Dealens värden in i UserDeal-raderna.

ALTER TABLE "RestaurantSettings" ADD COLUMN IF NOT EXISTS "referralDealId" TEXT;
ALTER TABLE "RestaurantSettings" ADD COLUMN IF NOT EXISTS "referralCouponsPerSide" INTEGER NOT NULL DEFAULT 1;
