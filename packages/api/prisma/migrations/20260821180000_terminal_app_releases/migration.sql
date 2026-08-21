-- Partner-APK:er som terminalerna uppdaterar sig från, plus engångskoderna
-- som låser upp den dolda nedladdningssidan.
--
-- Additiv migration: bara nya tabeller, inga ändringar på befintliga. Kan
-- köras mot prod utan att API:t behöver stoppas.

CREATE TABLE "TerminalAppRelease" (
    "id" TEXT NOT NULL,
    "versionCode" INTEGER NOT NULL,
    "versionName" TEXT NOT NULL,
    "flavor" TEXT NOT NULL DEFAULT 'sunmi',
    "r2Key" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TerminalAppRelease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TerminalAppRelease_flavor_versionCode_key"
    ON "TerminalAppRelease"("flavor", "versionCode");
CREATE INDEX "TerminalAppRelease_flavor_isActive_idx"
    ON "TerminalAppRelease"("flavor", "isActive");

CREATE TABLE "TerminalDownloadCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "deviceId" TEXT,
    "restaurantId" TEXT,
    "releaseId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TerminalDownloadCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TerminalDownloadCode_code_key" ON "TerminalDownloadCode"("code");
CREATE INDEX "TerminalDownloadCode_expiresAt_idx" ON "TerminalDownloadCode"("expiresAt");
