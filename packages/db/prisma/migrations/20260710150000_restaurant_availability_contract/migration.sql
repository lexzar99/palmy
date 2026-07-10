-- Additive availability model. No existing column is dropped; the only
-- existing-column write is a safe cityId backfill for exact name matches.
CREATE TYPE "RestaurantAcceptingOrdersMode" AS ENUM ('SCHEDULED', 'FORCE_OPEN', 'FORCE_CLOSED');

ALTER TABLE "RestaurantSettings"
ADD COLUMN "platformOrdersPaused" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Restaurant"
ADD COLUMN "scheduledOpenNow" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "acceptingOrdersMode" "RestaurantAcceptingOrdersMode" NOT NULL DEFAULT 'SCHEDULED',
ADD COLUMN "acceptingOrdersOverrideUntil" TIMESTAMP(3),
ADD COLUMN "acceptingOrdersOverrideReason" TEXT;

-- Preserve the last known schedule projection until the watchdog refreshes it.
-- isOpen remains untouched as a compatibility column.
UPDATE "Restaurant" SET "scheduledOpenNow" = "isOpen";

ALTER TABLE "City"
ADD COLUMN "ordersPaused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ordersPausedUntil" TIMESTAMP(3),
ADD COLUMN "ordersPauseReason" TEXT;

-- Older rows sometimes only carry the legacy Restaurant.city text. Bind exact
-- city-name matches so the new city overlay also covers those restaurants.
UPDATE "Restaurant" AS r
SET "cityId" = c."id"
FROM "City" AS c
WHERE r."cityId" IS NULL
  AND r."city" IS NOT NULL
  AND lower(trim(r."city")) = lower(trim(c."name"));
