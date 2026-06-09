-- Leveransansvar + provisions-override per restaurang
ALTER TABLE "Restaurant" ADD COLUMN "selfDelivery" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Restaurant" ADD COLUMN "commissionPctOverride" INTEGER;

-- Plattform-ekonomi (singleton: RestaurantSettings). Admin-styrt, aldrig hårdkodat.
ALTER TABLE "RestaurantSettings" ADD COLUMN "commissionSelfPct" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "RestaurantSettings" ADD COLUMN "commissionPlatformPct" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "RestaurantSettings" ADD COLUMN "vatCustomerPct" INTEGER NOT NULL DEFAULT 6;
ALTER TABLE "RestaurantSettings" ADD COLUMN "vatPlatformFeePct" INTEGER NOT NULL DEFAULT 25;
ALTER TABLE "RestaurantSettings" ADD COLUMN "tierGoldFee" INTEGER NOT NULL DEFAULT 100000;
ALTER TABLE "RestaurantSettings" ADD COLUMN "tierSilverFee" INTEGER NOT NULL DEFAULT 70000;
ALTER TABLE "RestaurantSettings" ADD COLUMN "tierStandardFee" INTEGER NOT NULL DEFAULT 0;
