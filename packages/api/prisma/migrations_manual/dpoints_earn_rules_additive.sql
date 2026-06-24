-- Dpoints earn-rules config (additive, safe on shared prod, no drops).
-- JSON array: [{ "key", "label", "points", "enabled" }]. Drives how many
-- Dpoints each action awards (invite, reviews, etc.) + on/off per action.
ALTER TABLE "RestaurantSettings" ADD COLUMN IF NOT EXISTS "dpointsEarnRules" TEXT;
