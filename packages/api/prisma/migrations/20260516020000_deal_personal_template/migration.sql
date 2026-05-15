-- Personal-template-flagga på Deal. Dealen syns inte som global rabatt
-- på sajten utan används endast som mall av referral/welcome-systemet
-- för att skapa per-user UserDeals.
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "isPersonalTemplate" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Deal_isPersonalTemplate_idx" ON "Deal"("isPersonalTemplate");
