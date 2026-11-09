# Matmaster Balkan & Orient (Ekslingan 8, Väla, Helsingborg): uppsättning i viaeats

Demo, byggd 2026-11-09. Restaurangen är **inte** kund och finns inte i viaeats än. Sajten ligger i `sites/matmaster/` med `notInViaeats: true`.

Källor:
- **Meny och priser:** menytavlan i restaurangen, fotograferad av gäster på restaurantguru.com (cirka ett år gammal).
- **Kampanjpriset** "pommes och dricka +50 kr" till ćevapi och pljeskavica kommer från restaurangens egen kampanjbild.
- **Betyg:** Google 4,8 med över 200 omdömen, Restaurant Guru 4,8 (plats 6 av 154 snabbmatsställen i Helsingborg), Tripadvisor 4,8 och Facebook 4,9.

Restaurangen har ingen fungerande nätbeställning. matmasterbalkan.se svarar inte, foodora-sidan är borta och Wolt har dem inte.

| Fil | Vad |
|---|---|
| `build.py` | Skapar de tre filerna nedan. Ändra menyn här |
| `restaurant.json` | Body till `POST /api/restaurants`: utkast, `pickupOnly: true`, 0 omdömen |
| `menu.yaml` | 9 kategorier, 46 rätter, 6 tillvalsgrupper |
| `data.json` | Ordning, tillval per rätt och bilder, läses av `../apply-menu.mjs` |
| `apps/web/public/demo/matmaster/img/` | Logga, hero och 42 rättbilder |

## Bilderna
42 genererade studiofoton (Higgsfield, GPT Image 2.6, cirka 10,5 krediter) med samma mörka sten, hårda sidoljus och papper.
Alla rätter har bild utom Läsk burk, Läsk flaska och Red Bull, som är varumärken. Hemsidans skrollscen har dessutom fem liggande bilder i `sites/matmaster/public/img/scene/`.
Bilderna är tolkningar och inte restaurangens egna. Visa dem för restaurangen, och byt till deras egna foton om de har.

## Att bekräfta med restaurangen
- **Såser:** tavlan säger bara "valfri sås". Vitlök, mild, stark och ingen är antagna.
- **Öppettider:** källorna skiljer sig åt. `restaurant.json` har vardagar 11 till 19 och helger 12 till 18.
- **Dagens lunch:** 99 kr vardagar 11 till 14, avläst från en suddig skylt. Rätten syns hela dagen i menyn, eftersom viaeats inte kan tidsstyra en enskild rätt.
- **Priserna:** tavlan är cirka ett år gammal. Kampanjbilden säger 99 kr för ćevapi och pljeskavica, och tavlan säger 105 kr.
- **Barnmenyn** finns på restaurangmenyn.se men utan priser, och är därför inte med.

## Lägga upp (inte gjort)
Lokalt:
```bash
python3 docs/restaurants/matmaster-balkan-orient-helsingborg/build.py
VIAEATS_ADMIN_TOKEN=<lokal-jwt> node docs/restaurants/apply-menu.mjs --dir matmaster-balkan-orient-helsingborg --api http://127.0.0.1:4002 --images local
```
Produktion, först när restaurangen sagt ja: pusha bilderna, kör med `--api https://api.viaeats.se --images r2 --image-base https://www.viaeats.se`,
publicera och lägg in domänen i admin. Ta sedan bort `notInViaeats` och `public/status.json` i `sites/matmaster/`.
