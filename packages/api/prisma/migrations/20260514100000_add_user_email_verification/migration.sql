-- AlterTable: email-verification support. Token är 32 bytes hex (64 tecken),
-- unique-index så vi kan slå upp användare direkt på inkommande token.
-- emailVerifiedAt sätts när token konsumeras via /api/account/verify-email.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerificationToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerificationExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "User_emailVerificationToken_key" ON "User"("emailVerificationToken");
