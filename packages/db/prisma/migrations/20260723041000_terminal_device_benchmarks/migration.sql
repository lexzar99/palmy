-- Manual partner-tablet diagnostics and benchmark reports.
-- The Android client sends a bounded JSON payload; selected columns make
-- ranking/search cheap without losing raw details.
CREATE TABLE IF NOT EXISTS "TerminalDeviceBenchmark" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "restaurantDeviceId" TEXT,
  "deviceId" TEXT NOT NULL,
  "appVersion" TEXT,
  "deviceBrand" TEXT,
  "deviceModel" TEXT,
  "osVersion" TEXT,
  "socVendor" TEXT,
  "cpuHardware" TEXT,
  "score" INTEGER NOT NULL,
  "grade" TEXT,
  "durationMs" INTEGER,
  "batteryLevel" INTEGER,
  "batteryHealth" TEXT,
  "batteryTemperatureC" DOUBLE PRECISION,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerminalDeviceBenchmark_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TerminalDeviceBenchmark_restaurantId_fkey'
  ) THEN
    ALTER TABLE "TerminalDeviceBenchmark"
      ADD CONSTRAINT "TerminalDeviceBenchmark_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TerminalDeviceBenchmark_restaurantDeviceId_fkey'
  ) THEN
    ALTER TABLE "TerminalDeviceBenchmark"
      ADD CONSTRAINT "TerminalDeviceBenchmark_restaurantDeviceId_fkey"
      FOREIGN KEY ("restaurantDeviceId") REFERENCES "RestaurantDevice"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "TerminalDeviceBenchmark_restaurantId_createdAt_idx"
  ON "TerminalDeviceBenchmark"("restaurantId", "createdAt");

CREATE INDEX IF NOT EXISTS "TerminalDeviceBenchmark_deviceId_createdAt_idx"
  ON "TerminalDeviceBenchmark"("deviceId", "createdAt");

CREATE INDEX IF NOT EXISTS "TerminalDeviceBenchmark_score_idx"
  ON "TerminalDeviceBenchmark"("score");
