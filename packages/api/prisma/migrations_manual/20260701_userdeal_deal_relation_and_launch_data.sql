-- 2026-07-01 · Fable
-- 1) UserDeal→Deal-relation (include: { deal } kraschade utan den; quote/feed var trasiga)
UPDATE "UserDeal" ud SET "dealId" = NULL
WHERE ud."dealId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Deal" d WHERE d.id = ud."dealId");
ALTER TABLE "UserDeal" ADD CONSTRAINT "UserDeal_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "Deal"(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- 2) Order-ETA + kurir-APNs (från commit 95ba0bf8) — REDAN APPLICERAT 2026-07-01
-- ALTER TABLE "Courier" ADD COLUMN "apnsDeviceToken" TEXT; ... (se migrations/20260701*)

-- 3) Lanseringsdata (referral-belöning, välkomstmall, uppdrag) skapades direkt i
--    prod-DB:n samma datum: Deal-id dlvreferralreward50kr01, dlvwelcome20procent0001,
--    dlvmission3orders7d0001 + RestaurantSettings.referralEnabled=true.
