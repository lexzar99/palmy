-- Customer tombstones make account deletion revocable without hard-deleting
-- order or accounting records. Safe for the currently unbaselined production
-- database as well as a normal Prisma migration history.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
