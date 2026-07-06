-- AlterTable: Företagsidentitet på singleton-raden RestaurantSettings.
-- Används av Terms, Privacy och support-flöden i web + RN. Fallback-värden
-- ("ViaEats AB", "support@viaeats.se" osv) hanteras i klienterna när null.
-- IF NOT EXISTS så `prisma db push` på Railway är idempotent.
ALTER TABLE "RestaurantSettings" ADD COLUMN IF NOT EXISTS "companyName" TEXT;
ALTER TABLE "RestaurantSettings" ADD COLUMN IF NOT EXISTS "organizationNumber" TEXT;
ALTER TABLE "RestaurantSettings" ADD COLUMN IF NOT EXISTS "companyAddress" TEXT;
ALTER TABLE "RestaurantSettings" ADD COLUMN IF NOT EXISTS "supportEmail" TEXT;
ALTER TABLE "RestaurantSettings" ADD COLUMN IF NOT EXISTS "privacyEmail" TEXT;
ALTER TABLE "RestaurantSettings" ADD COLUMN IF NOT EXISTS "noReplyEmail" TEXT;
