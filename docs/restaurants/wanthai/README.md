# Wanthai Foodtruck – uppsättning i viaeats

Källa: wanthai.se och Wanthais WEIQ-meny (weiq.app/Wanthai/meny), avläst 2026-10-21. **Endast avhämtning.**
Telefon och organisationsnummer är medvetet inte inlagda.

| Fil | Vad |
|---|---|
| `restaurant.json` | Body till `POST /api/restaurants`: **utkast** (`draft: true`), `pickupOnly: true`, slug `wanthai-foodtruck`, 0 omdömen |
| `menu.yaml` | 5 kategorier, 47 produkter, 9 tillvalsgrupper, med priser exakt som hos WEIQ |
| `images.json` | Bildkarta: logga, hero, kategorier, rätter och bildrutor (BOX_IMAGE) |
| `apply.mjs` | Lägger upp allt via admin-API:t, går att köra om (restaurang → import → bildrutor → bilder och ordning) |
| `apps/web/public/demo/wanthai/` | Demosajten → `/demo/wanthai` (rewrite i `next.config.ts`), PWA med manifest och service worker |

## Vad som är känt och vad som är antaget

- **Plats:** vagnen flyttar. 2026-10-21 stod den på Sundstorget i Höganäs, 11:30–19:00. Det är adressen i `restaurant.json`.
  Sajten läser plats, öppettider och priser live från viaeats-API:t, så när Wan ändrar adressen i admin följer sajten med.
- **Öppettider är ANTAGNA:** alla dagar 11:30–19:00 utifrån dagens tid. Wanthai skriver bara "följ oss på Facebook". Bekräfta med Wan.
- **Tillval enligt WEIQ:** protein (biff och räkor kostar +13), ris eller nudlar, hetta. Currys, laab och pad kra pao har
  bara medelstark och mycket stark hos WEIQ, därför finns gruppen "Hetta (lagas alltid med chili)". WEIQ:s flik "Allergier" blev gruppen "Allergi".
- **Bilder:** rätt- och tillbehörsfotona är Wanthais egna menybilder från WEIQ, men flera ser ut som stockbilder (Pad Thai har en vattenstämpelrest).
  Fråga Wanthai om rättigheterna och ta gärna egna foton. Läskbilderna har Palmyras format: Coca-Cola, Cola Zero, Pepsi Max och
  Mer Apelsin är Palmyras egna bilder, resten är WEIQ-förpackningsbilder lagda i samma format (Ramlösa Grönt äpple och Red Bull
  Peach/Summer är beskurna redan i källan).
- **Loggan** är frilagd ur stämpelfotot i WEIQ-headern, med webbadress och telefonnummer bortplockade.

## Produktion – i den här ordningen

1. **SQL:** inget nytt för Wanthai. `pickupOnly`-kolumnen (`migrations_manual/20260921_restaurant_pickup_only.sql`)
   måste dock redan vara körd i produktion. Om den inte är det (Cucco väntar på samma sak): kör den först, enligt `docs/LAUNCH_DATABASE_RUNBOOK.md`.
2. **Env-variabel i både Railway (API) och Vercel (webb):**
   `KIOSK_RESTAURANT_SLUGS=palmyra-pizzeria-lund,osteria-cucco-lund,wanthai-foodtruck,pizzeria-roma-astorp`.
   Utan den nekar kassan i embedden med "Embedded beställningsåtkomst saknas" (standardvärdet är bara Palmyra). Det gäller Cucco också.
   `LAUNCH_ACCESS_COOKIE_SECRET` måste vara samma i båda (den finns redan eftersom Palmyras embed fungerar).
3. **Commit + push till `main`** (demosajten, rewriten och betygsfixen i `RestaurantMenu.tsx`).
4. **Skapa restaurangen** när deployen är ute (bilderna hämtas från den deployade demomappen och läggs i R2):
   ```bash
   VIAEATS_ADMIN_TOKEN='<admin_token-cookien>' node docs/restaurants/wanthai/apply.mjs --api https://api.viaeats.se --images r2 --image-base https://www.viaeats.se/demo/wanthai/img
   ```
   Token: logga in på admin som superadmin → DevTools → Application → Cookies → `admin_token`.
   Skriptet skapar staden **Höganäs** om den inte finns.
5. **Publicera** (`draft: false` i admin) först när Wanthai sagt ja. Fram till dess svarar API:t 404 publikt, så menyn i
   `www.viaeats.se/demo/wanthai/meny.html` laddar inte (samma som Cucco).

Kör inte `apply.mjs` igen efter att riktiga ordrar kommit in: bildrutegrupperna skrivs om helt (nya extra-id:n).

## Lokalt (demobart nu)

Lokala `packages/api/.env` pekar på **produktionsdatabasen**, så demon körs mot en egen lokal Postgres (`viaeats_local`, Homebrew `postgresql@17`).
Startkonfigurationerna i `.claude/launch.json`:

- `api-localdb`: API på port 4002 mot `viaeats_local`, egen JWT-hemlighet, ingen mejltransport, Stripe i testläge.
- `web-localdb`: webben på port 3004 mot det lokala API:t.

Öppna `http://localhost:3004/demo/wanthai`. I den lokala databasen är Wanthai publicerad (`--publish`) så att embedden fungerar för en anonym kund.
Verifierat: meny, tillval, bildrutor, varukorg, låst avhämtning, moms 6 % och vidare till Stripes testkassa.

## Demo på plats med koden DEMO1

`docs/restaurants/demo1-code.mjs` skapar **DEMO1**: 99 % rabatt, gäller bara Wanthai och Pizzeria Roma, även i deras inbäddade
beställning. Rabatten bärs av restaurangen (som alla rabattkoder), inte av viaeats.
```bash
VIAEATS_ADMIN_TOKEN='<admin_token-cookien>' node docs/restaurants/demo1-code.mjs --api https://api.viaeats.se
```
- **Betala med Swish.** En pizza för 125 kr blir 1,25 kr. Stripe kräver minst 3 kr, så kort ger "Kunde inte initiera betalning" på ordrar under cirka 300 kr.
- **Restaurangen måste vara publicerad** för att beställningen ska fungera i produktion. Ett utkast svarar 404 i embedden. Alternativet är att visa den lokala demon.
- Ordern hamnar hos restaurangen som en riktig order. Stäng av koden i admin (Kuponger) när demona är klara.
- Hos andra restauranger nekas DEMO1 redan i kassan ("Rabattkoden gäller inte hos den här restaurangen") och vid orderläggning.
  Samma regel i båda (`lib/discountRestaurantScope.ts`, kontrakt `test:discount-scope`).
