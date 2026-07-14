-- Telefonbaserade referrals med separata erbjudanden för mottagare/värvare.
ALTER TABLE "RestaurantSettings"
  ADD COLUMN IF NOT EXISTS "referralInviteeDealId" TEXT,
  ADD COLUMN IF NOT EXISTS "referralInviterDealId" TEXT;

ALTER TABLE "UserDeal"
  ADD COLUMN IF NOT EXISTS "code" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "UserDeal_code_key" ON "UserDeal"("code");
CREATE INDEX IF NOT EXISTS "UserDeal_code_status_idx" ON "UserDeal"("code", "status");

ALTER TABLE "Referral"
  ADD COLUMN IF NOT EXISTS "shareCode" TEXT,
  ADD COLUMN IF NOT EXISTS "inviterPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "inviteePhone" TEXT;

UPDATE "Referral" AS r
SET "shareCode" = COALESCE(r."shareCode", r."code"),
    "inviterPhone" = COALESCE(r."inviterPhone", CASE
      WHEN regexp_replace(COALESCE(i."phone", ''), '\D', '', 'g') LIKE '0%' THEN '+46' || substring(regexp_replace(i."phone", '\D', '', 'g') FROM 2)
      WHEN regexp_replace(COALESCE(i."phone", ''), '\D', '', 'g') LIKE '46%' THEN '+' || regexp_replace(i."phone", '\D', '', 'g')
      ELSE NULL
    END)
FROM "User" AS i
WHERE i."id" = r."inviterUserId";

UPDATE "Referral" AS r
SET "inviteePhone" = COALESCE(r."inviteePhone", CASE
      WHEN regexp_replace(COALESCE(u."phone", ''), '\D', '', 'g') LIKE '0%' THEN '+46' || substring(regexp_replace(u."phone", '\D', '', 'g') FROM 2)
      WHEN regexp_replace(COALESCE(u."phone", ''), '\D', '', 'g') LIKE '46%' THEN '+' || regexp_replace(u."phone", '\D', '', 'g')
      ELSE NULL
    END)
FROM "User" AS u
WHERE u."id" = r."inviteeUserId";

WITH ranked AS (
  SELECT "id", row_number() OVER (PARTITION BY "inviteePhone" ORDER BY "createdAt", "id") AS rn
  FROM "Referral"
  WHERE "inviteePhone" IS NOT NULL
)
UPDATE "Referral" AS r
SET "inviteePhone" = NULL
FROM ranked
WHERE r."id" = ranked."id" AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "Referral_inviteePhone_key" ON "Referral"("inviteePhone");
CREATE INDEX IF NOT EXISTS "Referral_shareCode_idx" ON "Referral"("shareCode");
