# Pizzeria Roma Åstorp – uppsättning i viaeats

Källa: Romas Lumit-meny (`embed.lumit.se/stores/802/data.json`, avläst 2026-10-21) och pizzeriaromaastorp.se.
Lumit erbjuder bara avhämtning och äta på plats, så Roma läggs upp som **endast avhämtning**. Telefon och organisationsnummer är inte inlagda.

| Fil | Vad |
|---|---|
| `lumit-menu.json` | Normaliserad Lumit-meny: 141 rätter, ingredienser, familjepris per prisklass, inkluderad sås |
| `build.mjs` | Genererar `menu.yaml`, `roma.json`, `image-sources.json`, sajtens `menu-data.json` och alla bilder |
| `logo.mjs` | Romas logga omritad som vektor (Shrikhand + Archivo Black som vektorbanor), ikoner och hero |
| `restaurant.json` | Body till `POST /api/restaurants`: utkast, `pickupOnly`, slug `pizzeria-roma-astorp`, 0 omdömen |
| `apply.mjs` | Lägger upp allt via admin-API:t och kan köras om |
| `apps/web/public/demo/pizzeria-roma/` | Demosajten → `/demo/pizzeria-roma` (PWA) |

## Menyn

- **Priser exakt som i Lumit.** 15 kategorier, svenska namn i Lumits ordning.
- **Storlek** (bildrutor): Normal, Familjepizza, Glutenfri botten +30 kr, Barnpizza −10 kr. Lumit har 9 prisklasser för familjepizza
  (+165 till +201 kr). Varje klass blir en egen grupp som heter "Storlek" och identifieras på `description`, så `apply.mjs` kopplar dem
  per pizza. **Skillnad mot Lumit:** där kostar extrapålägg dubbelt på familjepizza (`x2`). I viaeats kostar de lika mycket oavsett storlek.
- **Välj sås (ingår)** på kebabrätter och pizzor där Lumit har "Valfri sås". Ryggbiffen har "Stekt potatis eller pommes".
- **Extrapålägg** på pizzor, sallader och kebab (kött 30, grönsaker 20, ost 20, sås 19). Sås i burk, Tillbehör och Lägg till dryck är bildrutor.
- **Vesuvio** saknar ingredienser i Lumit. Standardreceptet (tomatsås, ost, skinka) är inlagt. Bekräfta med Roma.
- **Öppettiderna** är Lumits (mån–tors 13–21, fre–sön 11–21). Gamla sajten visar andra, äldre tider.

## Bilder (demo, godkänt av användaren 2026-10-21)

Bara riktiga foton, inga ritade bilder. Saknas en riktig bild får tillvalet eller rätten ingen bild.
- **Rätter:** Palmyras matfoton. Samma namn ger samma foto, andra pizzor får Palmyras pizza med mest lika ingredienser
  (huvudproteinet väger tyngst). Kopplingen står i `image-sources.json`. Grillen har Lumits biffoto, och Pommes låda är pommesdelen ur Palmyras Box-foto.
  Utan bild: Chili cheese, Bröd med ost, Tzatziki, Cuba Cola, Cuba Cola Zero, 7up.
- **Storlek:** Palmyras storleksfoton (Normal, Familj). Glutenfri visar Normal, och Barnpizza visar Normal i mindre skala.
- **Såser:** Palmyras. Ingen sås och Tzatziki har ingen bild. **Drycker:** Palmyras packshots och Wanthai-demons.
- **Kategorier och sajten:** Lumits foton för Roma (`img/photos/`), plus Romas fasadfoto som hero.
- **Ordning i produktmodalen:** bildrutor först (Storlek, Välj sås, Lägg till dryck, Sås i burk, Tillbehör), därefter listorna
  (potatisval, extra kött, grönsaker, ost, sås).

## Produktion – i denna ordning

1. `pickupOnly`-SQL:en (`migrations_manual/20260921_restaurant_pickup_only.sql`) måste vara körd. Ingen ny SQL för Roma.
2. Lägg till `pizzeria-roma-astorp` i `KIOSK_RESTAURANT_SLUGS` i både Railway (API) och Vercel (webb). Annars nekar embeddens kassa.
3. Commit + push till `main`.
4. När deployen är ute:
   ```bash
   VIAEATS_ADMIN_TOKEN='<admin_token-cookien>' node docs/restaurants/pizzeria-roma-astorp/apply.mjs --api https://api.viaeats.se --images r2 --image-base https://www.viaeats.se
   ```
   Skapar staden **Åstorp** om den saknas. Skriptet väntar själv vid rate limit (tar några minuter).
5. Publicera först när Roma sagt ja.

Bygga om bilderna: `node docs/restaurants/pizzeria-roma-astorp/build.mjs` (hämtar Palmyras foton från produktions-API:t).

## Demo på plats med koden DEMO1

`docs/restaurants/demo1-code.mjs` skapar **DEMO1**: 99 % rabatt, gäller bara Wanthai och Pizzeria Roma, även i deras inbäddade
beställning. Rabatten bärs av restaurangen (som alla rabattkoder), inte av viaeats.
```bash
VIAEATS_ADMIN_TOKEN='<admin_token-cookien>' node docs/restaurants/demo1-code.mjs --api https://api.viaeats.se
```
- **Betala med Swish.** En pizza för 125 kr blir 1,25 kr. Stripe kräver minst 3 kr, så kort ger "Kunde inte initiera betalning" på ordrar under cirka 300 kr.
- **Restaurangen måste vara publicerad** för att beställningen ska fungera i produktion. Ett utkast svarar 404 i embedden. Alternativet är att visa den lokala demon.
- Ordern hamnar hos restaurangen som en riktig order. Stäng av koden i admin (Kuponger) när demona är klara.
- Hos andra restauranger nekas DEMO1 redan i kassan och vid orderläggning (`lib/discountRestaurantScope.ts`, kontrakt `test:discount-scope`).
