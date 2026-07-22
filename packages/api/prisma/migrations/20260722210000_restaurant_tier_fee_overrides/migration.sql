-- Per-restaurant tier fee overrides for bespoke commercial agreements.
-- Idempotent because production is still patched through reviewed SQL files.
ALTER TABLE "Restaurant"
  ADD COLUMN IF NOT EXISTS "tierGoldFeeOverride" INTEGER,
  ADD COLUMN IF NOT EXISTS "tierSilverFeeOverride" INTEGER,
  ADD COLUMN IF NOT EXISTS "tierStandardFeeOverride" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Restaurant_tierGoldFeeOverride_nonnegative'
  ) THEN
    ALTER TABLE "Restaurant"
      ADD CONSTRAINT "Restaurant_tierGoldFeeOverride_nonnegative"
      CHECK ("tierGoldFeeOverride" IS NULL OR "tierGoldFeeOverride" >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Restaurant_tierSilverFeeOverride_nonnegative'
  ) THEN
    ALTER TABLE "Restaurant"
      ADD CONSTRAINT "Restaurant_tierSilverFeeOverride_nonnegative"
      CHECK ("tierSilverFeeOverride" IS NULL OR "tierSilverFeeOverride" >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Restaurant_tierStandardFeeOverride_nonnegative'
  ) THEN
    ALTER TABLE "Restaurant"
      ADD CONSTRAINT "Restaurant_tierStandardFeeOverride_nonnegative"
      CHECK ("tierStandardFeeOverride" IS NULL OR "tierStandardFeeOverride" >= 0);
  END IF;
END $$;
