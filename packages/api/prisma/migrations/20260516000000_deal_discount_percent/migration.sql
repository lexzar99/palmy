-- Lägger till procent-rabatt på UserDeal + Settings.
-- Befintliga amountKr-fält behålls för bakåtkompat med deals som redan
-- finns i DB. Ny logik (welcome + referral) använder percent-fälten.

ALTER TABLE "UserDeal" ADD COLUMN IF NOT EXISTS "discountPercent" INTEGER;

ALTER TABLE "RestaurantSettings" ADD COLUMN IF NOT EXISTS "welcomeDealPercent" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "RestaurantSettings" ADD COLUMN IF NOT EXISTS "referralRewardPercent" INTEGER NOT NULL DEFAULT 20;
