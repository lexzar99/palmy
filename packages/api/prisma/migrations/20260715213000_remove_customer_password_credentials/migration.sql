-- Customer authentication is exclusively verified phone OTP or Google/Apple.
-- Remove legacy customer password/reset/email-verification credentials so no
-- old code path can accidentally reactivate email/password authentication.
DROP INDEX IF EXISTS "User_passwordResetToken_key";
DROP INDEX IF EXISTS "User_emailVerificationToken_key";

ALTER TABLE "User"
  DROP COLUMN IF EXISTS "password",
  DROP COLUMN IF EXISTS "passwordResetToken",
  DROP COLUMN IF EXISTS "passwordResetExpiresAt",
  DROP COLUMN IF EXISTS "emailVerificationToken",
  DROP COLUMN IF EXISTS "emailVerificationExpiresAt",
  DROP COLUMN IF EXISTS "emailVerifiedAt";
