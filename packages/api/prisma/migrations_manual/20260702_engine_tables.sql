-- 2026-07-02 · Fable — Puls-motorerna (applicerat i delade DB:n samma dag)
CREATE TABLE IF NOT EXISTS "EngineSetting" (
  "key" TEXT PRIMARY KEY,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "params" JSONB NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "EngineEvent" (
  "id" TEXT PRIMARY KEY,
  "engine" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "EngineEvent_engine_createdAt_idx" ON "EngineEvent"("engine","createdAt");
-- Uppdragsmål bor nu i Deal.triggerQuantity; milstolpe-uppdrag skapade som data:
-- dlvmilestone5orders0001 (150p) / dlvmilestone10orders001 (300p) / dlvmilestone25orders001 (750p)
