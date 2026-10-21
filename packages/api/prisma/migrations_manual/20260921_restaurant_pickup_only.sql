-- 2026-09-21: Restaurant.pickupOnly — "endast avhämtning" per restaurang.
-- Additiv kolumn med default false → ingen befintlig restaurang påverkas.
-- KÖRS MANUELLT I PRODUKTION FÖRE DEPLOY (Prisma selectar alla kolumner;
-- deploy före SQL ger P2022 på varje restaurangfråga). Se docs/LAUNCH_DATABASE_RUNBOOK.md.
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "pickupOnly" BOOLEAN NOT NULL DEFAULT false;
