-- 2026-11-03: RestaurantDomain — restaurangens egna domäner (fas 3 i
-- docs/RESTAURANGSAJTER-PLATTFORM.md). Ersätter de hårdkodade listorna för
-- CORS, kioskbevis och betalningsretur.
--
-- Additiv: en ny tabell, inga ändringar i befintliga tabeller. API:t klarar sig
-- utan tabellen (de hårdkodade listorna gäller då), så ordningen mot deploy är
-- inte kritisk. Kör den ändå FÖRE deploy enligt docs/LAUNCH_DATABASE_RUNBOOK.md.
-- KÖRS MANUELLT. Aldrig via prisma migrate.
--
-- När tabellen finns är den ensam källa för kioskbevisen. Därför seedas de
-- partnerdomäner som i dag ligger i koden i samma transaktion. Kontrollera
-- resultatet av SELECT-satsen längst ned: varje restaurang som har en sajt ska
-- ha minst en rad, annars stoppas dess kassa.

BEGIN;

CREATE TABLE IF NOT EXISTS "RestaurantDomain" (
  "id"           TEXT         NOT NULL,
  "restaurantId" TEXT         NOT NULL,
  "host"         TEXT         NOT NULL,
  "isPrimary"    BOOLEAN      NOT NULL DEFAULT false,
  "menuPath"     TEXT         NOT NULL DEFAULT '/meny',
  "embedEnabled" BOOLEAN      NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantDomain_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RestaurantDomain_restaurantId_fkey" FOREIGN KEY ("restaurantId")
    REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- Samma regler som API:t: gemener, bara värdnamn, ingen sökväg.
  CONSTRAINT "RestaurantDomain_host_format" CHECK (
    "host" = lower("host")
    AND length("host") BETWEEN 4 AND 253
    AND "host" ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
  ),
  CONSTRAINT "RestaurantDomain_menuPath_format" CHECK (
    length("menuPath") BETWEEN 1 AND 128
    AND "menuPath" ~ '^/[A-Za-z0-9._~/-]*$'
    AND "menuPath" NOT LIKE '//%'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "RestaurantDomain_host_key" ON "RestaurantDomain"("host");
CREATE INDEX IF NOT EXISTS "RestaurantDomain_restaurantId_idx" ON "RestaurantDomain"("restaurantId");
-- Högst en huvuddomän per restaurang.
CREATE UNIQUE INDEX IF NOT EXISTS "RestaurantDomain_one_primary" ON "RestaurantDomain"("restaurantId") WHERE "isPrimary";

-- Seed: dagens partnerdomäner i embedPartner.ts, embed.js och DEFAULT_ORIGINS.
-- Sluggar som inte finns hoppas över tyst (SELECT ... WHERE slug = ...).
INSERT INTO "RestaurantDomain" ("id", "restaurantId", "host", "isPrimary", "menuPath")
SELECT 'rd_' || md5(v.host), r."id", v.host, v.is_primary, v.menu_path
FROM (VALUES
  ('palmyra-pizzeria-lund',     'www.palmyrapizzeria.se',  true,  '/meny.html'),
  ('palmyra-pizzeria-lund',     'palmyrapizzeria.se',      false, '/meny.html'),
  ('freds-pizzeria-hassleholm', 'fredspizza.se',           true,  '/meny'),
  ('freds-pizzeria-hassleholm', 'www.fredspizza.se',       false, '/meny'),
  ('freds-pizzeria-hassleholm', 'freds-pizzeria.vercel.app', false, '/meny'),
  ('eld-och-vin-angelholm',     'eld-och-vin.vercel.app',  true,  '/meny'),
  ('ramis-grill-vaxjo',         'ramis-grill.vercel.app',  true,  '/meny')
) AS v(slug, host, is_primary, menu_path)
JOIN "Restaurant" r ON r."slug" = v.slug
ON CONFLICT ("host") DO NOTHING;

COMMIT;

-- Kontroll efter körning:
SELECT r."slug", d."host", d."isPrimary", d."menuPath", d."embedEnabled"
FROM "RestaurantDomain" d JOIN "Restaurant" r ON r."id" = d."restaurantId"
ORDER BY r."slug", d."isPrimary" DESC, d."host";

-- Återställning (bara om det behövs; API:t faller då tillbaka på listorna i koden):
-- DROP TABLE IF EXISTS "RestaurantDomain";
