# Freds Pizzeria (Hässleholm): uppsättning i viaeats

Källa: foodora (foodora.se/restaurant/rd9y), avläst 2026-10-27. Freds har ingen egen hemsida. Företagsnamnet är Fared Restaurang och adressen Vattugatan 12, Hässleholm.
Telefon, e-post och organisationsnummer läggs medvetet inte in.

| Fil | Vad |
|---|---|
| `build.py` | Källan till menyn: skriver `menu.yaml` och `images.json`. Ändra här och kör `python3 build.py` |
| `menu.yaml` | 21 kategorier, 168 produkter (80 pizzor, 54 andra rätter och 34 drycker), 6 tillvalsgrupper |
| `images.json` | Bildkarta. Storlek, sås, sås i burk, tillbehör och dryck blir bildrutor, extra pålägg är en lista |
| `restaurant.json` | Restaurangen, `pickupOnly`, 0 omdömen |
| `apply.mjs` | Lägger upp allt via admin-API:t (samma skript som för Balkan) |
| `apps/web/public/demo/freds-pizzeria/img/` | Logga, hero, 132 rättbilder, 21 bildrutor och 35 drycker |

## Bilderna
- **Rätter:** 22 kollage i 4k (Higgsfield, Nano Banana 2, cirka 70 krediter) med Palmyras foton som referens. Alla pizzor ligger på samma runda
  valnötsbräda och övriga rätter på samma vita tallrik, på samma mörka ek och i samma ljus. Kollagen och `tools/crop.py` finns i `~/Website/freds-site/`.
- **Drycker:** Palmyras och Wanthais produktbilder. De 13 som saknades är genererade i samma vita stil. **Fanta Exotic 50 cl och 2 l ser ut som
  vanlig Fanta Orange.** Byt mot riktiga produktbilder innan produktion.
- **Logga:** ett enkelt ordmärke (FREDS PIZZERIA), eftersom Freds saknar digital logga. Byt mot deras egen om de har en.

## Antaget (foodora visar inte tillval när restaurangen är stängd)
- Storlek Familj +110 kr och priserna för extra pålägg (15 och 25 kr) är Palmyras.
- Såsvalet och "Sås i burk" följer Palmyras upplägg, och priserna för sås i burk är Freds egna (såser 10 cl).
- Foodoras "Freds Deal" (30 % kampanj) och "Populärt" är inte med. Priserna är ordinarie.
- Öppettiderna är förenklade (nattöppet efter 00 helger är inte med). Koordinaterna är ungefärliga.

## Lokalt (gjort 2026-10-27)
Upplagd och **publicerad** i `viaeats_local`, där öppettiderna är satta till dygnet runt för test. `KIOSK_RESTAURANT_SLUGS` i launch-konfigen har fått `freds-pizzeria-hassleholm`.

## Produktion (inte gjort)
Samma ordning som Balkan: committa och pusha bilderna, lägg till `KIOSK_RESTAURANT_SLUGS` i Railway och Vercel, och kör
`apply.mjs --api https://api.viaeats.se --images r2 --image-base https://www.viaeats.se/demo/freds-pizzeria/img --publish`.
**Publicera direkt**, eftersom ett utkast är osynligt och länkarna inte fungerar.
