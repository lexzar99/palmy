-- Smart tilldelning: riktade uppdrag-erbjudanden till bäst lämpad kurir i vågor.
-- IDEMPOTENT: säker att köra som manuell produktionspatch (se
-- docs/LAUNCH_DATABASE_RUNBOOK.md — `prisma migrate deploy` är blockerat tills
-- databasen är baselined). Kör den ordagrant i SQL-editorn; API:t degraderar
-- tyst till öppet läge (broadcast) tills tabellen finns.
CREATE TABLE IF NOT EXISTS "DispatchOffer" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "wave" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'OFFERED',
    "score" DOUBLE PRECISION,
    "etaMin" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispatchOffer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DispatchOffer_orderId_status_idx" ON "DispatchOffer"("orderId", "status");
CREATE INDEX IF NOT EXISTS "DispatchOffer_status_expiresAt_idx" ON "DispatchOffer"("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "DispatchOffer_courierId_status_expiresAt_idx" ON "DispatchOffer"("courierId", "status", "expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DispatchOffer_orderId_fkey'
  ) THEN
    ALTER TABLE "DispatchOffer"
      ADD CONSTRAINT "DispatchOffer_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DispatchOffer_courierId_fkey'
  ) THEN
    ALTER TABLE "DispatchOffer"
      ADD CONSTRAINT "DispatchOffer_courierId_fkey"
      FOREIGN KEY ("courierId") REFERENCES "Courier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
