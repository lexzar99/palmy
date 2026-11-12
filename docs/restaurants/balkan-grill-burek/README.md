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

**Läge 2026-11-12:** restaurangen är publicerad i produktion (`/api/restaurant-status/balkan-grill-burek` svarar).
Domänlistorna i punkt 4 är ersatta av admin → restaurangen → Information → Domäner (fas 3).

## Hemsidan (`sites/balkan`, byggd 2026-11-12)
Samma koncept som Matmaster: skrollscen med omslaget och fyra rätter (`_kit/wave-stage.js` och `_kit/wave-scene.js`, delade med Matmaster),
lunchbuffén, favoriter, två filmer, hela plåtar, omdömen, hitta hit och vanliga frågor. Vercel-projektet heter `balkan-grill-burek`
(Root Directory `sites`, `SITE=balkan`). Tider, adress och telefon kommer från viaeats.

- **Bilderna:** 13 studiofoton (Higgsfield, GPT Image 2.6 i 4k, 2026-11-12) på svart rund tallrik med kajmak och ajvar i stålskålar,
  som restaurangen serverar. Grill Mix, ćevapi, pljeskavica och Skenderbeg har restaurangens egna foton som förlaga. Burek, Sofra och
  plåtarna är tolkningar. Källfilerna i full upplösning ligger inte i repot.
- **Filmerna** är riktiga, licensfria videor, utsnittna till 4:5 (1080×1350), utan ljud och spelade fram och tillbaka så att loopen inte hackar:
  - `film/grill.mp4`: biff på grillen med lågor, Pixabay 124830 (https://pixabay.com/videos/bbq-grill-meat-barbecue-food-124830/), Pixabay Content License.
  - `film/deg.mp4`: tunn deg kavlas framför vedeld, de första 7 sekunderna, Pexels 30771191
    (https://www.pexels.com/video/traditional-flatbread-making-near-open-fire-30771191/), Pexels License.
  - Båda licenserna tillåter kommersiell användning utan källhänvisning. Klippen får inte säljas vidare som de är.
    Inget gratis klipp med just spiralburek eller ćevapi hittades. Mixkits matklipp har numera begränsad licens och används inte.
- **Omdömen:** Google-snittet är 3,1 av 53 enligt Restaurant Guru (augusti 2026), så inget snittbetyg visas. Två citat på 5 av 5
  visas översatta till svenska, med en rad om att de är översatta från engelska. Diplomet "Best BBQ in Arlöv 2026" gick inte att bekräfta online och visas inte.
- **Telefon saknas i viaeats.** Plåtbeställning och "Frågor? Ring" visar numret först när det läggs in i admin.
- **balkangrillburek.se** pekar på Vercel sedan 2026-11-12 (namnservrar ns1/ns2.vercel-dns.com hos Loopia, www skickas vidare). Kvar:
  lägg domänen under Domäner i admin, annars stoppas kassan.
- **Att bekräfta:** lunchbuffén (145 och 175 kr, tiderna) och plåtpriserna är från affischen i oktober.

## TV-menyn vid kassan (`sites/balkan/tv/`, https://balkangrillburek.se/tv/, byggd 2026-11-12)
Stående tavla 1080×1920 som ersätter den vita menyskärmen vid kassan. Hela menyn (46 rätter) syns hela tiden.
- **Populärast:** Ćevapi, Pljeskavica, Grill Mix, Burek, Skenderbeg och Balkan Sofra som tallrikar fotade ovanifrån (Higgsfield,
  GPT Image 2.6, frilagda, `public/img/tv/`). De vrids sakta, ett varv på cirka 2,5–3 minuter, som på ett bord. Grill Mix bygger på
  restaurangens eget foto. Övriga rätter står i listor, med en liten tallrik vid några rubriker.
- **Paus:** menyn står sex minuter mellan pauserna, i turordningen i `tv/tv.js`: Beställ i mobilen (5 s) varannan gång,
  däremellan loggan över grillfilmen och ćevapi i lepinja (3 s var). Hela plåtar och Sofra är borttagna (användaren 2026-11-12).
  Rör man musen eller trycker på skärmen syns knappar för att förhandsvisa varje paus (Meny, Beställ i mobilen, Loggan, Ćevapi).
- **Dryck:** bara en smal rad med priserna längst ner, eftersom drycken syns i kylen. Ayran står också under Lägg till.
- **Priser:** live från viaeats (`_kit/tv.js`, var tionde minut). Det kräver att balkangrillburek.se ligger under Domäner i admin,
  annars visas priserna som står i sidan. En rätt som tas bort i admin försvinner från tavlan. Ny rätt kräver en rad i `tv/index.html`.
- **På TV:n:** öppna adressen i helskärm i Chrome eller Edge, till exempel `chrome --kiosk https://balkangrillburek.se/tv/`.
  Om TV:n visar liggande bild på den stående skärmen: lägg till `?rotate=90` (eller `270`). `?break` visar en paus direkt, `?nobreak` stänger av dem.
  Sidan laddar om sig själv varje natt 04.30, om nätet svarar.
