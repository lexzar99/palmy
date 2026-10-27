# Balkan Grill & Burek (Burlöv Center): uppsättning i viaeats

Källa: restaurangens egen meny och sajt (balkangrillburek.se), avläst 2026-10-27. **Endast avhämtning** (antaget, bekräfta).
Demosajten ligger utanför repot i `~/Website/balkan-site/website` (Vite). Dess `/meny/` är viaeats-embedden för `balkan-grill-burek`.

| Fil | Vad |
|---|---|
| `restaurant.json` | Body till `POST /api/restaurants`: utkast, `pickupOnly: true`, 0 omdömen |
| `menu.yaml` | 8 kategorier, 46 produkter, 5 tillvalsgrupper, priser exakt som på menyn |
| `images.json` | Bildkarta. "Tillbehör" och "Pommes till burgaren" blir bildrutor, "Lägg till dryck" är en lista |
| `apply.mjs` | Lägger upp allt via admin-API:t, samma skript som för Wanthai |
| `apps/web/public/demo/balkan-grill-burek/img/` | Logga (kvadratisk), hero, 42 rättbilder och 7 bildrutor |

## Bilderna
Alla rätter är genererade studiofoton (Higgsfield, Nano Banana 2, cirka 21 krediter för sju kollage i 4k) med samma vita tallrik,
mörka ek, vinkel på cirka 40 grader och varma sidoljus. Restaurangens egna foton användes som referens, och inga matlådor förekommer.
Tillvalen (ajvar, kajmak, tzatziki, lepinja och pommes) står i samma studio i små vita skålar. Läsk, Cockta, lättöl och PEJA har
medvetet ingen bild, eftersom de är varumärken. Lax Deluxe, Ryggbiff Deluxe och Entrecôte saknar beskrivning på menyn, så tallrikarna
är en tolkning (grillat med potatis och grönsaker). Visa dem för restaurangen.

## Att bekräfta med restaurangen
- **Öppettider:** bara lunchbuffén är känd (vardagar 11–15, helger 11:30–15:30). I `restaurant.json` står 11:00/11:30–20:00, och det är antaget.
- **Koordinater:** ungefärliga, Burlöv Center.
- **Avhämtning eller leverans.**
- **Priser:** menybilden säger Pljeskavica 109 och Grill Mix 149, men deras gamla sajt säger 119 och 139.
- **Ingår:** hela plåtar med dessert och lunchbuffén ingår inte i onlinemenyn (förbeställning eller på plats).

## Lokalt (gjort 2026-10-27)
Upplagd och publicerad i `viaeats_local` med `api-localdb` (4002) och `web-localdb` (3004). `KIOSK_RESTAURANT_SLUGS` i `.claude/launch.json`
har fått `balkan-grill-burek`. Öppettiderna i den **lokala** databasen är satta till 00:00–23:59 för att kunna testa beställningen när som helst.
Kommandot för att köra om:
```bash
VIAEATS_ADMIN_TOKEN=<lokal-jwt> node docs/restaurants/balkan-grill-burek/apply.mjs --api http://127.0.0.1:4002 --images local --publish
```

## Produktion (inte gjort)
1. Commit och push av bilderna i `apps/web/public/demo/balkan-grill-burek/img/` (bilderna måste ligga på viaeats.se innan R2-uppladdningen).
2. `KIOSK_RESTAURANT_SLUGS` i Railway och Vercel ska få `balkan-grill-burek`.
3. Kör `apply.mjs --api https://api.viaeats.se --images r2 --image-base https://www.viaeats.se/demo/balkan-grill-burek/img --publish`.
   **Användaren 2026-10-27: den ska vara publicerad.** Ett utkast är osynligt, och embedden och länkarna fungerar inte.
4. Lägg till deras domän i embeddens och API:ts listor över tillåtna adresser, som för Wanthai.
