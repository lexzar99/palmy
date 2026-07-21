-- Gästkund-konvertering och anonymiserad launch-statistik.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "convertedFromGuestAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "conversionSource" TEXT;

CREATE TABLE IF NOT EXISTS "LaunchEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "sessionId" TEXT,
  "referrer" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LaunchEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LaunchEvent_eventType_createdAt_idx"
  ON "LaunchEvent"("eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "LaunchEvent_sessionId_createdAt_idx"
  ON "LaunchEvent"("sessionId", "createdAt");
