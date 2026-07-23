-- Adminprofil: valfritt användarnamn (unikt) + avatar-URL (R2).
-- Rent additiv — påverkar inga befintliga rader eller flöden.
ALTER TABLE "AdminUser" ADD COLUMN "username" TEXT;
ALTER TABLE "AdminUser" ADD COLUMN "avatarUrl" TEXT;

CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");
