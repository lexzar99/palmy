-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "etaCalculatedMinutes" INTEGER;
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "etaOverrideMinutes" INTEGER;
