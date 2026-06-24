-- Additiv: konfigurerbart streak-mål (ordrar / 7 dagar). Idempotent.
ALTER TABLE "RestaurantSettings" ADD COLUMN IF NOT EXISTS "dpointsStreakTarget" INTEGER NOT NULL DEFAULT 3;
