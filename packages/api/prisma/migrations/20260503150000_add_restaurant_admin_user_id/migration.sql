-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "adminUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Restaurant_adminUserId_key" ON "Restaurant"("adminUserId");
