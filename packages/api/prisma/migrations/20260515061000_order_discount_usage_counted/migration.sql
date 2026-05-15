-- Guard mot dubbel-increment av discount/deal usageCount.
-- Både Stripe-webhook och reconcile-poller kan trigga increment-logiken —
-- utan detta fält riskerade samma order räknas 2x. Atomisk uppdatering
-- med `WHERE discountUsageCounted = false` säkrar single-counting.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "discountUsageCounted" BOOLEAN NOT NULL DEFAULT false;
