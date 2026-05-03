-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "pausedUntil" TIMESTAMP(3);
