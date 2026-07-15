-- Launch-intresse: namn/e-post, explicit marketing consent och unik 30%-kod.
CREATE TABLE IF NOT EXISTS "LaunchLead" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "couponCode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'INTERESTED',
  "marketingConsentAt" TIMESTAMP(3) NOT NULL,
  "couponSentAt" TIMESTAMP(3),
  "sessionId" TEXT,
  "referrer" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LaunchLead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LaunchLead_email_key" ON "LaunchLead"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "LaunchLead_couponCode_key" ON "LaunchLead"("couponCode");
CREATE INDEX IF NOT EXISTS "LaunchLead_createdAt_idx" ON "LaunchLead"("createdAt");
CREATE INDEX IF NOT EXISTS "LaunchLead_status_createdAt_idx" ON "LaunchLead"("status", "createdAt");
