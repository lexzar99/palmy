-- Dpoints: markera varor som köpbara med poäng (rewardable). Endast rewardable-
-- varor visar poäng-pris + "köp med poäng" i klienterna. Default av.
ALTER TABLE "Product" ADD COLUMN "rewardable" BOOLEAN NOT NULL DEFAULT false;

-- Dpoints: global budkostnad (öre) som läggs på en order som betalas ENBART med
-- poäng vid leverans (poängen täcker maten men inte kuriren). Hämtning = gratis.
ALTER TABLE "RestaurantSettings" ADD COLUMN "dpointsCourierCost" INTEGER NOT NULL DEFAULT 0;
