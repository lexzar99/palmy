# ViaEats dynamiska hem v2

## Beslutet i en mening

Hemmet ska kännas som en native matapp: först ett lättskannat mediumflöde,
sedan ett stort bilddrivet **Aktuellt**-område och därefter ett fåtal
administratörsstyrda, dynamiska restaurangrälsar. Kunden ska hitta rätt mat med
högst två aktiva val, utan att systemet hittar på ETA, avgift, rabatt eller
betyg.

## Produktlöften som inte får brytas

1. **Direkt:** kunden ser restauranger före kampanjinnehåll och behöver inte
   förstå hur rankningen fungerar.
2. **Sant:** ett kort visar bara metadata som faktiskt finns. Saknat värde döljs.
3. **Lokalt:** adressens leveranszon har företräde framför restaurangens
   grundavgift och grund-ETA.
4. **Varierat:** samma restaurang ska normalt inte ligga först i två
   restaurangsektioner under samma hemrendering.
5. **Relevant:** en restaurang måste uppfylla sektionens filter innan ranking,
   tier eller admin-boost får påverka placeringen.
6. **Kontrollerbart:** admin kan ändra innehåll, schema, accent, layout och
   ranking utan en ny apprelease.
7. **Bakåtkompatibelt:** gamla klienter kan fortsätta läsa
   `/api/home-categories` och restaurangens gamla `tags`-array under
   övergången.

## Kundflödet

### Hem

Ordningen är:

1. adress och val mellan leverans/hämta själv,
2. mediumrälsen **Utvalt idag**,
3. det stora **Aktuellt**-området med sponsor/showcase/deal,
4. dynamiska kategorier från admin,
5. alla relevanta restauranger.

Hemmet har inga matkategorichips. Ett sökfält kan öppna eller styra Sök, men
själva utforskandet av Pizza, Sushi, Kebab och liknande bor på Sök.

### Sök

Sök visar:

- ett stort sökfält,
- stora taggchips från den publika taggkatalogen,
- bara taggar som har minst en publik restaurang i aktuell kontext,
- restauranger som matchar namn, kök eller någon av sina valda taggar.

Ett tryck på ett chip filtrerar direkt. Ett andra tryck öppnar restaurangen.
Det ger ett flöde på högst två aktiva val.

### Fem primära flikar

Samma informationsarkitektur används i webben och Swift:

1. Hem
2. Sök
3. Deals
4. Varukorg
5. Konto/Profil

Beställningshistorik ligger kvar som funktion under Profil/Varukorgens
efterköpsflöde; den upptar inte längre en egen huvudflik.

## Datamodell

### RestaurantTag

`RestaurantTag` är den centrala, adminstyrda katalogen.

- `id`: stabilt internt ID som filter sparar.
- `name` och `nameEn`: kundtext.
- `slug`: stabil maskinnyckel.
- `color` och `icon`: presentation i Sök.
- `isActive`: om taggen får visas och väljas.
- `sortOrder`: ordning bland chips.

### RestaurantTagAssignment

En restaurang kan ha flera taggar. Kopplingen lagras i
`RestaurantTagAssignment`, inte som manuellt inskriven kommaseparerad text.
`position` ger admin kontroll över taggarnas ordning på restaurangen.

Den gamla `Restaurant.tags`-arrayen finns kvar som en legacyprojektion.
Adminändringar synkar både relationerna och legacyfältet tills alla klienter är
migrerade. Det gör releasen reversibel och förhindrar att en äldre app tappar
filtrering.

### HomeCategorySection

En hemsektion består av fem oberoende delar:

1. **Identitet:** titel, undertitel, slug och språkvarianter.
2. **Publicering:** aktiv/inaktiv, ordning och max antal restauranger.
3. **Urval:** FILTER, MANUAL eller HYBRID samt konkreta filter.
4. **Schema:** veckodagar och klockslag i tidszonen Europe/Stockholm.
5. **Presentation och ranking:** layout, accent och viktning.

`presentation` innehåller layout (`MEDIUM_RAIL`, `LARGE_RAIL`, `GRID`), accent
och valfria färger/ikon. Orange är standard och primär ViaEats-färg. Blå,
grön, lila och marin används som sekundära accenter.

`ranking` innehåller strategi, signalvikter, variationsregler och tak för
admin-boost. JSON-fälten är additiva: äldre klienter ignorerar dem.

## Filter: vem får vara kandidat?

Urvalet görs före ranking. Följande filter kan kombineras:

- namn/sökterm,
- cuisine för bakåtkompatibilitet,
- ett eller flera stabila tagg-ID:n,
- tier/featured class,
- minsta riktiga betyg,
- högsta ETA,
- högsta leveransavgift,
- endast fri leverans,
- endast aktiv deal,
- endast öppet nu,
- manuell restauranglista.

### FILTER

Alla restauranger som uppfyller filtren rankas automatiskt.

### MANUAL

Endast restauranger som admin uttryckligen valt är med. Filter och
tillgänglighetsregler gäller fortfarande; en arkiverad eller dold restaurang
kan inte tvingas ut till kund.

### HYBRID

Adminvalda restauranger kommer först inom den tillåtna kandidatpoolen.
Resterande platser fylls dynamiskt. Detta passar en betald eller redaktionell
yta där innehållet måste vara kontrollerat men inte tomt.

## Rankning

Den nya feeden är `/api/home-categories/feed`. Den returnerar färdigrankade
sektioner, kortdata, taggkatalog, faktiska mätvärden och en förklaring per
restaurang.

### Signaler

Standardvikterna är:

| Signal | Standardvikt | Betydelse |
| --- | ---: | --- |
| Ordrar idag | 28 | aktuell efterfrågan, endast riktiga betalda icke-testordrar |
| Ordrar 7 dagar | 12 | stabil efterfrågan |
| ETA/snabbhet | 16 | faktisk snitttid idag när underlag finns, annars aktuell ETA |
| Betygskonfidens | 16 | Bayesjusterat betyg där antal recensioner räknas |
| Leveransavgift | 7 | lägre faktisk eller publicerad avgift är bättre |
| Fri leverans | 5 | verklig nollavgift eller aktiv fri-leverans-deal |
| Aktiv rabatt | 8 | högsta verkliga, aktiva procentrabatt |
| Tier | 5 | Guld före Silver; Standard får ingen tierbonus |
| Daglig rotation | 3 | liten deterministisk variation, inte slump vid varje refresh |

Signaler normaliseras innan de multipliceras med vikten. Ordervolym använder
kvadratrotsnormalisering så en stor restaurang inte kan låsa hela hemmet.

### Betygskonfidens

Ett ensamt femstjärnigt betyg ska inte slå en stabil restaurang med många
omdömen. Rankningen använder därför en försiktig lokal prior. Om
`ratingCount <= 0` är betygssignalen noll och kortet visar inte ett falskt
recensionsvärde.

### WEIGHTED

Alla signalpoäng summeras. Detta passar sektioner som **Fri leverans**,
**Bra betyg** och **Snabb lunch**, där admin vill styra vad som väger mest.

### BALANCED

De första platserna representerar olika kundbehov:

1. flest giltiga ordrar idag,
2. bäst faktisk/aktuell snabbhet,
3. starkast betyg med tillräckligt recensionsunderlag,
4. därefter den viktade totalpoängen.

Detta är standard för **Utvalt idag**. Sektionen blir därmed en blandning, inte
en enda topplista som alltid belönar den största restaurangen.

### Tier

Tier ger mer exponering men kringgår aldrig relevans:

- Guld får full tierpoäng.
- Silver får halv tierpoäng.
- Standard får ingen tierpoäng men kan vinna på efterfrågan, snabbhet,
  kvalitet, pris eller rotation.
- Dold tier (`featuredClass = 0`) är aldrig kandidat.

Tier är en begränsad signal, inte en garanterad förstaplats. Det skyddar
kundnyttan och gör betald exponering trovärdig.

### Tidsstyrd admin-boost

En restaurang kan få `homeBoost` 0–100 med start- och sluttid. Boosten
omvandlas till högst det antal poäng som sektionens `maxAdminBoostPoints`
tillåter; standardtaket är 8 och absolut tak är 15. En boost kan därför hjälpa
en bra kandidat men inte göra en irrelevant restaurang till Sushi eller Fri
leverans.

Exempel: Palmyra får boost 60 under en helg. Med tak 8 ger det 4,8 poäng.
Boosten upphör automatiskt vid sluttiden.

## Variation och rättvisare exponering

Feedmotorn behandlar sektionerna i adminordning.

1. En mängd `usedFirst` håller reda på restauranger som redan varit etta.
2. Om nästa sektion har samma etta flyttas högst rankade ännu oanvända kandidat
   fram.
3. Den tidigare ettan tas inte bort; den ligger kvar längre bak.
4. Om alla kandidater redan varit etta behålls bästa verkliga ordning.
5. Varje tidigare förekomst ger ett begränsat `appearancePenalty` i senare
   sektioner.

Resultatet är variation utan falsk relevans. En sushirestaurang kan inte ersättas
av en burgerrestaurang bara för att burgerrestaurangen inte synts tidigare.

Det finns ännu ingen pålitlig historisk impressionslogg. Därför är
`historicalExposure` uttryckligen neutral och feeden markerar
`NO_IMPRESSION_DATA`. Systemet hittar inte på en fairness-signal. När
impressions och klick senare loggas kan en långsiktig exposure-debt läggas till
utan att ändra klientkontraktet.

## Avgift och ETA: sanningsordning

På kortet används:

1. matchad leveranszons avgift/ETA för vald adress,
2. annan verifierad live-override,
3. restaurangens publicerade grundvärde,
4. inget värde.

Det finns ingen default på 30 minuter, 4,7 i betyg eller 0 kronor. Om
adresskontext saknas ska serverfeedens avgift beskrivas som grundavgift.
Klienten måste göra zonens värde till sanning så snart adressen validerats.

`Fri leverans` får bara visas när det verifierade värdet är noll eller när en
aktiv deal uttryckligen ger fri leverans.

## Kortens funktionella innehåll

Ett mediumkort kan visa:

- riktig bild,
- restaurangnamn och kök,
- öppet/stängt,
- ETA om den finns,
- zonens avgift eller Fri leverans,
- betyg och antal recensioner om antal är större än noll,
- högsta aktiva rabatt som “Upp till X%”,
- BOGO eller annan aktiv deal,
- tiermarkering,
- favoritknapp.

Visuella badges begränsas så bilden fortfarande gör kunden hungrig. Status
prioriteras framför marknadsbadges.

## Standardsektioner

Följande sektioner skapas additivt om de saknas:

- **Utvalt idag:** BALANCED, öppet nu, orange.
- **Heta listan:** tier + smart ranking, orange.
- **Pizza fredag:** pizza, fredag eftermiddag/kväll, orange.
- **Snabb lunch:** vardagslunch och ETA-tak, grön.
- **Sushi suget:** sushi och stabilt betyg, blå.
- **Fri leverans:** verifierad fri leverans, grön.
- **Bra betyg:** betyg med verkligt underlag, lila.

Admin kan ändra, pausa, flytta eller radera dem. Tomma sektioner visas inte för
kunden men finns kvar i admin.

## Scenarier med nuvarande riktiga restauranger

### Samma restaurang kvalificerar sig överallt

Anta att Palmyra ligger etta i Utvalt idag, kvalificerar sig för Pizza fredag
och också har fri leverans till adressen.

- Utvalt idag: Palmyra kan ligga etta.
- Pizza fredag: Pizzeria Kryddan eller Palma flyttas fram om de är giltiga;
  Palmyra ligger kvar på plats 2 eller 3.
- Fri leverans: Burger King kan flyttas fram om den faktiskt är gratis till
  adressen; annars används bästa giltiga kandidat och Palmyra kan upprepas.

### Snabb restaurang utan mätunderlag

Burger King har aktuell ETA men inga slutförda tidsmätningar idag.
Rankningen använder ETA och orsaken `CURRENT_ETA`; den påstår inte att
restaurangen är “snabbast enligt dagens leveranser”.

### Fem stjärnor från en recension

Burger King har betyg 5,0 med ett omdöme. Palmyra har 4,5 med sex omdömen.
Bayesjusteringen gör att det ensamma femstjärniga betyget inte automatiskt
vinner. Kortet visar ändå de faktiska värdena.

### Felaktigt negativt recensionsantal

Om en äldre rad har `ratingCount = -3` behandlas den som saknat
recensionsunderlag. Ingen negativ siffra eller påhittad rating visas.

### Fredag blir lördag

Pizza fredag är synlig inom sitt schema i Stockholmstid. När tidsfönstret
stänger försvinner hela sektionen automatiskt. Restaurangerna finns fortfarande
i Sök och andra relevanta sektioner.

### Bara en restaurang kvalificerar sig

Om endast Palmyra har fri leverans ska sektionen visa Palmyra även om den redan
varit etta. Relevans går före kosmetisk variation.

## Admins arbetsflöde

### Lägg till eller ändra en restaurangs taggar

1. Öppna restaurangen i admin.
2. Välj en eller flera taggar i multiselecten.
3. Saknas rätt tagg skapas den i den centrala taggkatalogen.
4. Spara. Relationerna och legacyprojektionen synkas atomiskt.
5. Sökchips och framtida kategorifeeds använder samma ID.

### Skapa en dynamisk kategori

1. Ge sektionen ett kundnära namn och kort undertitel.
2. Välj FILTER om den ska skötas automatiskt.
3. Välj tagg-ID:n och eventuella hårda filter.
4. Välj schema.
5. Välj mediumräls som standard och en sekundär accent.
6. Välj BALANCED eller ställ signalvikter.
7. Förhandsgranska kandidater och orsaker.
8. Aktivera och placera sektionen i ordningen.

### Belöna en restaurang

Använd först tier för långsiktig partnernivå. Använd tidsstyrd admin-boost för
en kort kampanj eller kvalitetssatsning. Använd MANUAL/HYBRID bara när
placeringen verkligen måste vara redaktionellt garanterad.

## Release och säkerhet

- Backupen ska verifieras före källändringar.
- Prisma-migrationen skapas i både API- och DB-schemat men körs inte
  automatiskt.
- Databasmigrationen körs senare enligt `LAUNCH_DATABASE_RUNBOOK.md`.
- Legacyendpoint och legacytaggar behålls under minst en full klientrelease.
- Webben och Swift ska falla tillbaka till legacydata om feed/taggkatalog ännu
  inte är driftsatt.
- Ingen kod pushas innan lokal webb-QA och installation på Jalle iPhone är
  godkända.
