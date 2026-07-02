-- 2026-07-02: Utkast-läge för agent-onboarding (MENU_AGENT-rollen).
-- draft=true: restaurangen är osynlig i alla kund-ytor (list, detalj, meny,
-- deals) och kan inte ta emot ordrar. MENU_AGENT (Hermes-menyagenten "Kocken")
-- kan BARA skriva mot restauranger där draft=true. Publicering (draft=false)
-- görs av SUPER_ADMIN i admin-panelen, och då tappar agenten skrivrätten.
-- Kört via psql mot DIRECT_URL. Additiv, inga drops.
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "draft" BOOLEAN NOT NULL DEFAULT false;
