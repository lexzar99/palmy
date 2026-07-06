-- Invite tracking (additive only — safe on shared prod, no drops).
-- Repurposes the existing Referral model into an opaque share-token system
-- rewarding Vpoints. Run via:  prisma db execute --url "$DIRECT_URL" --file <this>

ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "channel"             TEXT;     -- web | app_installed | app_deferred | manual
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "inviteeFingerprint"  TEXT;
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "rewardInviterPoints" INTEGER;
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "rewardInviteePoints" INTEGER;
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "rewardLedgerKey"     TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Referral_rewardLedgerKey_key" ON "Referral"("rewardLedgerKey");
CREATE INDEX IF NOT EXISTS "Referral_inviteeFingerprint_status_idx" ON "Referral"("inviteeFingerprint","status");

-- Deferred-install click store (codeless attribution; TTL-swept for GDPR).
CREATE TABLE IF NOT EXISTS "InviteClick" (
  "id"          TEXT PRIMARY KEY,
  "token"       TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "ip"          TEXT,
  "userAgent"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"   TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "InviteClick_fingerprint_expiresAt_idx" ON "InviteClick"("fingerprint","expiresAt");
CREATE INDEX IF NOT EXISTS "InviteClick_token_idx" ON "InviteClick"("token");
