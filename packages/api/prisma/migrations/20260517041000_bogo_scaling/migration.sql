-- BOGO-skalning: konfigurera hur många gratis-varor en BOGO ger
-- per gång trigger uppfylls + hård cap per order.
-- Defaults: rewardsPerTrigger=1, maxRewardsPerOrder=1 → exakt
-- nuvarande beteende ("1 gratis per order") så befintliga deals
-- inte påverkas.
ALTER TABLE "Deal"
  ADD COLUMN "bogoRewardsPerTrigger" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "bogoMaxRewardsPerOrder" INTEGER DEFAULT 1;
