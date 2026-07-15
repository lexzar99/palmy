-- Durable multi-device customer push. Safe to run manually more than once in
-- the current unbaselined production database.

-- Launch-eventmätningen är permanent borttagen: namn/e-post samlas endast i
-- LaunchLead med uttryckligt samtycke och ingen pseudonym sessionspårning ska finnas kvar.
DROP TABLE IF EXISTS "LaunchEvent";
ALTER TABLE IF EXISTS "LaunchLead" DROP COLUMN IF EXISTS "sessionId";
ALTER TABLE IF EXISTS "LaunchLead" DROP COLUMN IF EXISTS "referrer";

CREATE TABLE IF NOT EXISTS "DeviceInstallation" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "provider" TEXT NOT NULL,
  "installationId" TEXT NOT NULL,
  "platform" TEXT,
  "tokenCiphertext" TEXT,
  "tokenHash" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "revokedAt" TIMESTAMP(3),
  "revokedReason" TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSuccessAt" TIMESTAMP(3),
  "lastFailureAt" TIMESTAMP(3),
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeviceInstallation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DeviceOrderSubscription" (
  "id" TEXT NOT NULL,
  "deviceInstallationId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeviceOrderSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NotificationOutbox" (
  "id" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "userId" TEXT,
  "orderId" TEXT,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "data" JSONB,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseOwner" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 8,
  "acceptedCount" INTEGER NOT NULL DEFAULT 0,
  "invalidCount" INTEGER NOT NULL DEFAULT 0,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NotificationDelivery" (
  "id" TEXT NOT NULL,
  "outboxId" TEXT NOT NULL,
  "deviceInstallationId" TEXT,
  "provider" TEXT NOT NULL,
  "attemptNo" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "errorCode" TEXT,
  "errorDetail" TEXT,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- Safe upgrade if an earlier preview of this patch created these as NOT NULL.
ALTER TABLE "DeviceInstallation" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "NotificationOutbox" ALTER COLUMN "userId" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "DeviceInstallation_tokenHash_key"
  ON "DeviceInstallation"("tokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "DeviceInstallation_provider_installationId_key"
  ON "DeviceInstallation"("provider", "installationId");
CREATE INDEX IF NOT EXISTS "DeviceInstallation_userId_active_idx"
  ON "DeviceInstallation"("userId", "active");
CREATE INDEX IF NOT EXISTS "DeviceInstallation_provider_active_idx"
  ON "DeviceInstallation"("provider", "active");
CREATE INDEX IF NOT EXISTS "DeviceInstallation_lastSeenAt_idx"
  ON "DeviceInstallation"("lastSeenAt");

CREATE UNIQUE INDEX IF NOT EXISTS "DeviceOrderSubscription_deviceInstallationId_orderId_key"
  ON "DeviceOrderSubscription"("deviceInstallationId", "orderId");
CREATE INDEX IF NOT EXISTS "DeviceOrderSubscription_orderId_revokedAt_expiresAt_idx"
  ON "DeviceOrderSubscription"("orderId", "revokedAt", "expiresAt");

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationOutbox_dedupeKey_key"
  ON "NotificationOutbox"("dedupeKey");
CREATE INDEX IF NOT EXISTS "NotificationOutbox_status_availableAt_idx"
  ON "NotificationOutbox"("status", "availableAt");
CREATE INDEX IF NOT EXISTS "NotificationOutbox_leaseExpiresAt_idx"
  ON "NotificationOutbox"("leaseExpiresAt");
CREATE INDEX IF NOT EXISTS "NotificationOutbox_userId_createdAt_idx"
  ON "NotificationOutbox"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "NotificationOutbox_orderId_createdAt_idx"
  ON "NotificationOutbox"("orderId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationDelivery_outboxId_deviceInstallationId_attemptN_key"
  ON "NotificationDelivery"("outboxId", "deviceInstallationId", "attemptNo");
CREATE INDEX IF NOT EXISTS "NotificationDelivery_outboxId_status_idx"
  ON "NotificationDelivery"("outboxId", "status");
CREATE INDEX IF NOT EXISTS "NotificationDelivery_deviceInstallationId_attemptedAt_idx"
  ON "NotificationDelivery"("deviceInstallationId", "attemptedAt");
CREATE INDEX IF NOT EXISTS "NotificationDelivery_provider_status_attemptedAt_idx"
  ON "NotificationDelivery"("provider", "status", "attemptedAt");

DO $$ BEGIN
  ALTER TABLE "DeviceInstallation"
    ADD CONSTRAINT "DeviceInstallation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DeviceOrderSubscription"
    ADD CONSTRAINT "DeviceOrderSubscription_deviceInstallationId_fkey"
    FOREIGN KEY ("deviceInstallationId") REFERENCES "DeviceInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DeviceOrderSubscription"
    ADD CONSTRAINT "DeviceOrderSubscription_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "NotificationOutbox"
    ADD CONSTRAINT "NotificationOutbox_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "NotificationOutbox"
    ADD CONSTRAINT "NotificationOutbox_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "NotificationDelivery"
    ADD CONSTRAINT "NotificationDelivery_outboxId_fkey"
    FOREIGN KEY ("outboxId") REFERENCES "NotificationOutbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ekonomiska payoutposter får aldrig försvinna genom en restaurang-hard-delete.
-- DROP + ADD är idempotent och ändrar ingen data.
ALTER TABLE "RestaurantPayout"
  DROP CONSTRAINT IF EXISTS "RestaurantPayout_restaurantId_fkey";
ALTER TABLE "RestaurantPayout"
  ADD CONSTRAINT "RestaurantPayout_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defense-in-depth: inga applikationsbuggar, konsolkörningar eller framtida
-- routes får hard-deleta order- eller payoutbokföring. Korrigeringar sker med
-- status/tombstone och nya ekonomiska poster, aldrig DELETE.
CREATE OR REPLACE FUNCTION viaeats_block_order_hard_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Hard delete of Order is disabled; use status/tombstone'
    USING ERRCODE = '23503';
END;
$$;

DROP TRIGGER IF EXISTS "Order_block_hard_delete" ON "Order";
CREATE TRIGGER "Order_block_hard_delete"
  BEFORE DELETE ON "Order"
  FOR EACH ROW EXECUTE FUNCTION viaeats_block_order_hard_delete();

CREATE OR REPLACE FUNCTION viaeats_block_restaurant_payout_hard_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Hard delete of RestaurantPayout is disabled; use an adjustment entry'
    USING ERRCODE = '23503';
END;
$$;

DROP TRIGGER IF EXISTS "RestaurantPayout_block_hard_delete" ON "RestaurantPayout";
CREATE TRIGGER "RestaurantPayout_block_hard_delete"
  BEFORE DELETE ON "RestaurantPayout"
  FOR EACH ROW EXECUTE FUNCTION viaeats_block_restaurant_payout_hard_delete();

DO $$ BEGIN
  ALTER TABLE "NotificationDelivery"
    ADD CONSTRAINT "NotificationDelivery_deviceInstallationId_fkey"
    FOREIGN KEY ("deviceInstallationId") REFERENCES "DeviceInstallation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
