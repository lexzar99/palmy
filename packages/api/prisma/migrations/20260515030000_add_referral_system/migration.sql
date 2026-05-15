-- Referral- & Welcome-deal-system.
-- Idempotent (IF NOT EXISTS) eftersom Railway kör `prisma db push` i start-script.

-- ── User-tabellen: nya fält för referral ─────────────────────────────────────
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralCode"      TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referredByCode"    TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deviceFingerprint" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeenIp"        TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode");

-- ── RestaurantSettings: welcome-deal + referral-config ───────────────────────
ALTER TABLE "RestaurantSettings" ADD COLUMN IF NOT EXISTS "welcomeDealActive"      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RestaurantSettings" ADD COLUMN IF NOT EXISTS "welcomeDealAmountKr"    INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "RestaurantSettings" ADD COLUMN IF NOT EXISTS "welcomeDealMinOrderKr"  INTEGER NOT NULL DEFAULT 150;
ALTER TABLE "RestaurantSettings" ADD COLUMN IF NOT EXISTS "welcomeDealExpiresDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "RestaurantSettings" ADD COLUMN IF NOT EXISTS "referralEnabled"        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RestaurantSettings" ADD COLUMN IF NOT EXISTS "referralRewardKr"       INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "RestaurantSettings" ADD COLUMN IF NOT EXISTS "referralMinOrderKr"     INTEGER NOT NULL DEFAULT 150;

-- ── UserDeal — instans av en deal kopplad till en specifik user ──────────────
CREATE TABLE IF NOT EXISTS "UserDeal" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "userId"         TEXT NOT NULL,
  "dealId"         TEXT,
  "type"           TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'ACTIVE',
  "amountKr"       INTEGER,
  "expiresAt"      TIMESTAMP(3),
  "usedAt"         TIMESTAMP(3),
  "usedOnOrderId"  TEXT,
  "metadata"       JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserDeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "UserDeal_userId_status_idx" ON "UserDeal"("userId", "status");
CREATE INDEX IF NOT EXISTS "UserDeal_type_idx" ON "UserDeal"("type");

-- ── Referral — invite-länkar och deras lifecycle ─────────────────────────────
CREATE TABLE IF NOT EXISTS "Referral" (
  "id"               TEXT NOT NULL PRIMARY KEY,
  "code"             TEXT NOT NULL,
  "inviterUserId"    TEXT NOT NULL,
  "inviteeUserId"    TEXT,
  "inviteeEmail"     TEXT,
  "inviteeIP"        TEXT,
  "inviteeDeviceId"  TEXT,
  "status"           TEXT NOT NULL DEFAULT 'PENDING',
  "fraudFlags"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "inviteeOrderId"   TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "registeredAt"     TIMESTAMP(3),
  "rewardedAt"       TIMESTAMP(3),
  "revertedAt"       TIMESTAMP(3),
  "revertedBy"       TEXT,
  "revertReason"     TEXT,
  CONSTRAINT "Referral_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Referral_inviteeUserId_fkey" FOREIGN KEY ("inviteeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_code_key" ON "Referral"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_inviteeUserId_key" ON "Referral"("inviteeUserId");
CREATE INDEX IF NOT EXISTS "Referral_inviterUserId_idx" ON "Referral"("inviterUserId");
CREATE INDEX IF NOT EXISTS "Referral_status_idx" ON "Referral"("status");
