-- Varifrån besökaren kom.
--
-- utm_source fångar bara länkar vi själva taggat (mejlutskicket). Trafik från
-- Google, Instagram eller Facebook bär ingen sådan tagg — där är referraren
-- enda signalen. `referrer` sparar råvärdet så klassificeringen går att
-- granska i efterhand; `channel` är den normaliserade kanalen som rapporten
-- grupperar på.
ALTER TABLE "JourneyEvent" ADD COLUMN IF NOT EXISTS "referrer" TEXT;
ALTER TABLE "JourneyEvent" ADD COLUMN IF NOT EXISTS "channel"  TEXT;

CREATE INDEX IF NOT EXISTS "JourneyEvent_channel_createdAt_idx" ON "JourneyEvent"("channel", "createdAt");
