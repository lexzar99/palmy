ALTER TABLE "Product" ADD COLUMN "rewardPointsMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5;
ALTER TABLE "Product" ADD COLUMN "rewardPointsPrice" INTEGER;

ALTER TABLE "RestaurantSettings" ALTER COLUMN "dpointsPerKr" SET DEFAULT 0.1;
ALTER TABLE "RestaurantSettings" ALTER COLUMN "dpointsMaxBalance" SET DEFAULT 2500;

UPDATE "RestaurantSettings"
SET "dpointsPerKr" = 0.1,
    "dpointsMaxBalance" = GREATEST("dpointsMaxBalance", 2500)
WHERE id = 'settings';
