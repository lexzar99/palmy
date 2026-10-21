# Osteria Cucco — uppsättning i viaeats

Källa: osteriacucco.se + Cuccos Eatsmart-meny (avläst 2026-09-21). **Endast avhämtning.**

| Fil | Vad |
|---|---|
| `restaurant.json` | Body till `POST /api/restaurants` – skapas som **utkast** (`draft: true`), `pickupOnly: true` |
| `menu.yaml` | 4 kategorier, 23 rätter, 3 tillvalsgrupper – Admin → Meny → Massimport (kör torrkörning först) |
| `drinks-group.json` | Gör om "Lägg till dryck" till bildrutor som hos Palmyra |
| `apps/web/public/demo/osteria-cucco/` | Demosajten → `https://www.viaeats.se/demo/osteria-cucco` |

## Ordning (viktig)

1. **SQL i produktion FÖRST:** `packages/api/prisma/migrations_manual/20260921_restaurant_pickup_only.sql`
   (enligt `docs/LAUNCH_DATABASE_RUNBOOK.md`). Deploy före SQL ger Prisma P2022 på alla restaurangfrågor.
2. Commit + push till `main` (deployar API, webb och admin).
3. Skapa restaurangen ur `restaurant.json`, massimportera `menu.yaml`, patcha dryckesgruppen med `drinks-group.json`.
4. Bilder (`POST /api/admin/upload-r2`, `sourceUrl` eller fil): `kind=hero` ← `img/pizza-hands.webp`,
   `kind=logo` ← `img/logo-square.webp`, `kind=category` Pizza ← `img/oven.webp`,
   `kind=product` Pizza Margherita ← `img/hero.webp`. Övriga rätter saknar foto hos Cucco.
5. Publicera (`draft: false`) först när Cucco sagt ja – då kan riktiga kunder beställa.

## Tillval enligt Eatsmart

- Alla 12 pizzor: Glutenfri botten (+25), Något extra på pizzan (Prosciutto di Parma +40, Mortadella +35,
  Svampmix +30, Fänkålssalami +35, Gorgonzola +30), Lägg till dryck.
- Pasta: Lägg till dryck. Antipasti och drycker: inga tillval.
- Sprite finns som egen dryck men inte som tillval hos Eatsmart – lämnat så.
