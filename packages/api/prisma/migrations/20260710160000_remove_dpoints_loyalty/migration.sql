-- Permanently remove the retired DPoints/Vpoints loyalty feature.
-- This migration is intentionally destructive and must be reviewed before deploy.

DROP TABLE IF EXISTS "PointsCampaignProgress" CASCADE;
DROP TABLE IF EXISTS "PointsCampaign" CASCADE;
DROP TABLE IF EXISTS "DpointsReward" CASCADE;
DROP TABLE IF EXISTS "SponsorCard" CASCADE;
DROP TABLE IF EXISTS "PointsTransaction" CASCADE;

DELETE FROM "UserDeal" WHERE "type" = 'APP_MISSION';
DELETE FROM "Deal" WHERE "appTemplate" = 'MISSION' OR "appMissionType" IS NOT NULL;
UPDATE "Deal" SET "appPlacement" = 'HOME_TOP' WHERE "appPlacement" = 'REWARDS';
UPDATE "Deal" SET "appCtaAction" = 'CLAIM' WHERE "appCtaAction" = 'REWARDS';

ALTER TABLE "Product"
  DROP COLUMN IF EXISTS "rewardable",
  DROP COLUMN IF EXISTS "rewardPointsMultiplier",
  DROP COLUMN IF EXISTS "rewardPointsPrice";

ALTER TABLE "Deal"
  DROP COLUMN IF EXISTS "appDpointsBonus",
  DROP COLUMN IF EXISTS "appMissionType";

ALTER TABLE "RestaurantSettings"
  DROP COLUMN IF EXISTS "welcomePointsActive",
  DROP COLUMN IF EXISTS "welcomePointsAmount",
  DROP COLUMN IF EXISTS "welcomePointsSponsorCardId",
  DROP COLUMN IF EXISTS "dpointsEnabled",
  DROP COLUMN IF EXISTS "dpointsPerKr",
  DROP COLUMN IF EXISTS "dpointsValuePerKr",
  DROP COLUMN IF EXISTS "dpointsCardOnHome",
  DROP COLUMN IF EXISTS "dpointsMaxBalance",
  DROP COLUMN IF EXISTS "dpointsCourierCost",
  DROP COLUMN IF EXISTS "dpointsCourierTiers",
  DROP COLUMN IF EXISTS "dpointsEarnRules",
  DROP COLUMN IF EXISTS "dpointsStreakTarget";

ALTER TABLE "User"
  DROP COLUMN IF EXISTS "pointsBalance";

ALTER TABLE "Order"
  DROP COLUMN IF EXISTS "pointsAwarded",
  DROP COLUMN IF EXISTS "pointsEarned",
  DROP COLUMN IF EXISTS "pointsSpent",
  DROP COLUMN IF EXISTS "pointsReverted";

ALTER TABLE "Referral"
  DROP COLUMN IF EXISTS "rewardInviterPoints",
  DROP COLUMN IF EXISTS "rewardInviteePoints",
  DROP COLUMN IF EXISTS "rewardLedgerKey";
