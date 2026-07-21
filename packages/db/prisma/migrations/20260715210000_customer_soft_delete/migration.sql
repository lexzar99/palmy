-- Keep the shared schema migration history aligned with the API schema.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
