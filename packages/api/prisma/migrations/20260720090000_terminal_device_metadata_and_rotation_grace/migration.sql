-- Terminal-sessioner: grace för refresh-token-rotation + enhetsmetadata.
-- Rent additiva nullable-kolumner; ingen befintlig data påverkas.
ALTER TABLE "RestaurantDevice" ADD COLUMN "prevRefreshTokenHash" TEXT;
ALTER TABLE "RestaurantDevice" ADD COLUMN "deviceBrand" TEXT;
ALTER TABLE "RestaurantDevice" ADD COLUMN "deviceModel" TEXT;
ALTER TABLE "RestaurantDevice" ADD COLUMN "osVersion" TEXT;
ALTER TABLE "RestaurantDevice" ADD COLUMN "appVersion" TEXT;
