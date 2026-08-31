-- Kundresan: en rad per sak besökaren gjorde, från landning till levererad order.
--
-- Additiv: ny tabell, rör ingen befintlig. Utan den är allt som händer före en
-- order skapas osynligt — och det är där kunderna försvinner.
--
-- `sessionId` binder ihop en anonym besökares steg. Telefonnumret backfillas
-- på sessionens tidigare rader när kunden anger det i kassan.
CREATE TABLE IF NOT EXISTS "JourneyEvent" (
  "id"           TEXT NOT NULL,
  "sessionId"    TEXT NOT NULL,
  "step"         TEXT NOT NULL,
  "restaurantId" TEXT,
  "productId"    TEXT,
  "orderId"      TEXT,
  "phone"        TEXT,
  "email"        TEXT,
  "userId"       TEXT,
  "utmSource"    TEXT,
  "utmCampaign"  TEXT,
  "meta"         JSONB,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JourneyEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "JourneyEvent_sessionId_createdAt_idx" ON "JourneyEvent"("sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "JourneyEvent_step_createdAt_idx"      ON "JourneyEvent"("step", "createdAt");
CREATE INDEX IF NOT EXISTS "JourneyEvent_phone_createdAt_idx"     ON "JourneyEvent"("phone", "createdAt");
CREATE INDEX IF NOT EXISTS "JourneyEvent_createdAt_idx"           ON "JourneyEvent"("createdAt");
