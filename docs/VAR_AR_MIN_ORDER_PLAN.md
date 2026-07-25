# "Var är min order?" — plan för att minska supportsamtal

Status: **förslag / beslutsunderlag**
Datum: 2026-07-25
Relaterat: [RESTAURANT_DRIVER_APP_PLAN.md](RESTAURANT_DRIVER_APP_PLAN.md) §21–26

Målet är inte spårning. Målet är att **kunden vet vad som händer utan att störa restaurangen, och att bara verkligt trasiga fall når supporten.**

---

## 1. Rotorsaken — Foodora-buggen finns i er egen kod

Jag verifierade i kodbasen. Det finns **tre underskattningar som staplar på varandra** i löftet kunden får före köp.

### (a) Förköps-ETA:n mäter inte hela leveransen

[restaurantEta.ts:4-6](../packages/api/src/lib/restaurantEta.ts):

> Vi mäter tiden från `Order.createdAt` till `Order.deliveringAt` — d.v.s. från det att kunden lade ordern till att restaurangen markerade den "på väg".

**Körningen till kunden är inte med.** I Lund är det (OSRM-median):

| Avstånd | Körtid |
|---|---|
| 1–2 km | 4,0 min |
| 2–3 km | 5,9 min |
| 3–4 km | 7,7 min |

Löftet är alltså systematiskt **4–8 minuter för optimistiskt** redan innan något annat går fel.

### (b) Taket på 60 min döljer långsamma restauranger

[restaurantEta.ts:22-24](../packages/api/src/lib/restaurantEta.ts): `ETA_ALLOWED_VALUES = [25…60]`, och `snapEta()` clampar in allt utanför.

Men [orderEta.ts:144](../packages/api/src/lib/orderEta.ts) tillåter `estimatedTime` upp till **90** min, och partnerappens `maxPrepMinutes()` ger self-delivery-restauranger **90**.

Så:

1. Kunden ser ≤60 min på restaurangsidan.
2. Restaurangen accepterar och anger 70.
3. **Kundens nedräkning hoppar uppåt.**

Det är exakt Foodora-beteendet, byggt in i er ETA-kedja — och det slår hårdast mot just self-delivery-restaurangerna, eftersom de är de som får ange 90.

### (c) Nya restauranger visar 40 min oavsett verklighet

Under 5 levererade ordrar returneras `ETA_DEFAULT_MINUTES = 40`. En ny restaurang som i praktiken behöver 70 lovar 40 till sina första kunder — de mest kritiska kunderna de har.

### Plus batchningen

Är vår order nr 3 i turen tillkommer **+11 till +15 min** (driver-planen §25).

### Sammanlagt, realistiskt fall

Restaurang med 55 min verklig tillagning, kund 2,5 km bort, vår order nr 3:

| Post | Minuter |
|---|---|
| Visat vid kassan | **40** |
| Verklig tillagning | 55 |
| Körning till kund | +6 |
| Två stopp före | +13 |
| **Verklig leverans** | **74** |
| **Gap** | **+34 min** |

**Det är supportsamtalet.** Det är inte ett spårningsproblem — det är ett löftesproblem.

---

## 2. Invarianten allt annat byggs på

> **En ETA som visats för kunden får bara krympa. Aldrig växa.**

Att smalna av känns som framsteg. Att växa känns som svek — och varje växning kostar ett samtal. Foodoras fel är inte att de har fel, det är att de har fel **uppåt, upprepat**.

Praktiskt: visa **intervall**, inte ett tal.

| Skede | Vad kunden ser | Varför |
|---|---|---|
| Kassan | "55–75 min" | Övre gränsen är ärlig. Landar utfallet inne i spannet har inget "blivit sämre" |
| Accepterad, tid angiven | "60–70 min" | Smalnar |
| Maten lämnade restaurangen | "19:25–19:35" | Smalnar |
| Nära kund | "ca 19:28" | Smalnar |

Spannet får bara krympa. Måste den övre gränsen flyttas ut — då är det en **avvikelse**, inte en uppdatering, och den hanteras av §4.

---

## 3. Fixarna, i ordning efter hävstång

| # | Fix | Fil | Insats |
|---|---|---|---|
| 1 | Mät `createdAt → deliveredAt` istället för `→ deliveringAt`. Faller `deliveredAt` bort, använd `deliveringAt + OSRM-ben`. | [restaurantEta.ts](../packages/api/src/lib/restaurantEta.ts) | 0,5 d |
| 2 | Visa **spann** i kassan. Undre = P25, övre = **P75** ur samma historik, inte snittet. | restaurantEta + web | 1,5 d |
| 3 | Ta bort 60-taket för self-delivery, eller sätt taket till samma 90 som `estimatedTime` tillåter. Ett tak som är lägre än vad restaurangen får ange **garanterar** en uppåtjustering. | restaurantEta.ts:22 | 0,5 d |
| 4 | Nya restauranger: visa spann från **stadens median för self-delivery**, inte 40. Och märk det som uppskattning. | restaurantEta.ts | 0,5 d |
| 5 | Blockera uppåtjusteringar i UI:t. Växer ETA:n → gå till avvikelseflödet, uppdatera inte tyst nedräkningen. | orderEta + web + LiveActivity | 2 d |
| 6 | Batch-korrigering: `+ (N−1) × legEstimate` när könummer finns (driver-planen §25) | orderEta.ts | 1 d |

**Fix 1–4 är ~3 dagsverken och tar bort det mesta av gapet.** De kräver ingen förarapp, ingen GPS, ingen ny hårdvara. Det är den billigaste supportminskningen som finns i systemet.

---

## 4. Proaktivt avvikelsebesked — före kunden märker det

Regeln: **kunden ska aldrig vara den som upptäcker förseningen.**

Trigger: prognosen passerar den övre gränsen i det spann kunden senast såg.

Push, med **orsak** — utan orsak läses det som inkompetens:

> "Din order är försenad. Restaurangen har högt tryck just nu. Ny uppskattning: **19:45**. Vi hör av oss igen om det ändras."

Tre krav:
- **Orsakskategori krävs.** Härledd ur data, inte påhittad: högt tryck (många samtidiga ordrar), sen accept, maten står klar men ingen förare, föraren har stopp före, uppkoppling tappad.
- **Max en push per avvikelse.** Tre pushar = tre svek.
- **Ny övre gräns med marginal.** Sätt den så den håller. Hellre 19:45 och leverans 19:38 än 19:35 och en fjärde push.

---

## 5. Självbetjäning: en tidslinje, inte en chat

Det som besvarar "var är min order?" för de flesta är inte en karta och inte en människa. Det är **att se att något faktiskt händer**.

Lägg en knapp på ordersidan — *"Vad händer med min order?"* — som visar den ärliga tidslinjen ur `DeliveryEvent`:

```
✓ 18:42  Beställning mottagen
✓ 18:44  Restaurangen accepterade — angav 60 min
✓ 18:47  Tillagning startade
✓ 19:31  Maten lämnade restaurangen
◦ 19:38  Beräknad framme hos dig
         Föraren har 1 stopp före dig
```

Egenskaper:
- **Noll mänsklig inblandning.** Ren läsning av data ni redan har.
- **Ingen restaurang störs.**
- Vid tomma luckor: skriv luckan ärligt — *"Vi har inte hört från restaurangen sedan 18:47"* — hellre än att låtsas.

Detta är den enskilt största samtalsminskningen efter §3, och den är billig. Uppskattning: **2 dagsverken.**

---

## 6. AI-mellanhanden — min ärliga bedömning

Din idé: en AI som frågar plattan "hur går det för order ***" och återkommer till kunden.

**Den naiva versionen bör inte byggas.** En platt-prompt kl 19:30 när de har 15 ordrar i kön är **precis lika störande som ett telefonsamtal, ofta värre** — det ligger på enheten de behöver för att jobba. Ni flyttar avbrottet, ni tar inte bort det.

### Den version som är värd att bygga

AI:ns jobb är **triage**, inte budbärande:

| Läge | Vad AI:n gör | Restaurangen störs |
|---|---|---|
| Datan svarar | Genererar svaret ur `DeliveryEvent` + ETA och skickar till kunden | Nej |
| Datan är tvetydig men läget normalt | Väntar. Skickar proaktiv statusrad. | Nej |
| **Datan är tvetydig OCH läget onormalt** | Frågar plattan — **en gång**, tre knappar, ingen inskrivning | Ja, minimalt |
| Restaurangen svarar inte på 5 min | Eskalerar till dig med sammanställd historik | Nej |

"Onormalt" måste vara mätbart, inte känsla. Föreslagna trösklar:
- `PREPARING` i > 1,5 × angiven tid utan `DELIVERING`
- `DELIVERING` satt men ingen geofence-utgång på > 10 min
- Ingen förare kopplad > 15 min efter `DELIVERING`
- Positionsglapp > 8 min under aktiv leverans

Platt-prompten, en gång, tre tryck:

> **Order #1042 — kunden frågar**
> [ Klar om 10 min ] [ Klar om 20 min ] [ Problem — ring mig ]

Svaret går direkt till kunden som ny övre gräns. **Ingen fritext, ingen dialog.**

### Varning om agent-rostern

Ni har ett medvetet beslut: **exakt tre Hermes-agenter** (Kocken/`MENU_AGENT`, Falken/`GLOBAL_VIEWER`, Torget/`GROWTH_AGENT`), övriga avaktiverade. `GLOBAL_VIEWER` finns i [middleware/auth.ts](../packages/api/src/middleware/auth.ts) och används av `opsMetrics.ts` och `apiHealthAdmin.ts`.

Den här funktionen bör därför **ligga inne i Falken (GLOBAL_VIEWER)**, som redan är övervakningsrollen — inte bli en fjärde agent. Vill ni ändå utöka rostern är det ett eget beslut som bör tas uttalat, inte som en sidoeffekt av den här funktionen.

---

## 7. Skuldregler — automatiska, inte bedömda

Principen: **om supporten måste utreda har ni redan förlorat tiden.** Beräkna en `faultParty` på varje försenad order, med bevis, och låt supporten *bekräfta* istället för att gräva.

| Signal | Skuld | Bevis |
|---|---|---|
| Accept > 5 min efter order | Restaurang | `createdAt`, `acceptedAt` |
| `PREPARING → DELIVERING` > 1,5 × egen angiven tid | Restaurang | `preparingAt`, `deliveringAt`, `estimatedTime` |
| `deliveringAt` satt men geofence-utgång > 8 min senare | **Restaurang** — markerade "på väg" medan maten stod kvar | `deliveringAt`, `GEOFENCE_EXIT` |
| Körning > 2 × OSRM-prognos + omvägsstopp | Restaurang (deras förare) | `DETOUR_STOP_DETECTED`, OSRM-referens |
| Ingen förare kopplad, inga positioner, pass aldrig startat | Restaurang — använde inte systemet | avsaknad av `DriverShift` |
| Föraren < 60 m från adressen > 5 min, kunden svarar inte | **Kund** | `ARRIVED_NEAR_CUSTOMER`, samtalslogg |
| Adressen validerad i kassan men kunden säger fel adress | **Kund** | `ZoneValidation`, `deliveryLatitude/Longitude` |
| Adressen **inte** validerad i kassan | **ViaEats** | avsaknad av validering |
| Betalning/teknik-fel på vår sida | **ViaEats** | `PaymentRefund`, felloggar |
| Ingen signal räcker | **Oavgjort** → till människa | hela tidslinjen bifogas |

Två regler som gör det rättvist:

1. **En enstaka avvikelse straffar aldrig.** Skuld loggas per order; Trust Score reagerar först på mönster över 30 dagar med minst 20 ordrar (driver-planen §10).
2. **`ViaEats` är default vid tvivel.** Kan systemet inte visa vems fel det var är det vårt. Det håller reglerna ärliga och gör att luckor i loggningen upptäcks istället för att skyllas bort.

---

## 8. Kompensation före kunden ber om den

Måste kunden be om kompensation ringer de. Ge den innan.

| Försening mot senast visad övre gräns | Åtgärd | Beslut |
|---|---|---|
| < 10 min | Inget, bara ärlig statusuppdatering | — |
| 10–20 min | Automatisk rabattkod nästa order | Automatiskt |
| 20–35 min | Leveransavgiften återbetalas automatiskt | Automatiskt |
| > 35 min | Återbetalning + personligt meddelande | Automatiskt, flaggas till dig |
| Maten kom aldrig | Full återbetalning | Automatiskt, flaggas till dig |

Ekonomin styrs av `faultParty`: bärs kostnaden av restaurangen dras den i nästa payout ([payoutPolicy.ts](../packages/api/src/lib/payoutPolicy.ts) finns redan); är det vårt fel bär vi den. Kunden märker aldrig skillnaden — det är hela poängen.

Detta ska bygga på befintlig `UserDeal`/`DiscountCode`-infrastruktur, inte en ny mekanism.

---

## 9. Byggordning

| Steg | Vad | Insats | Effekt på samtal |
|---|---|---|---|
| **1** | ETA-fix 1–4 (§3): mät hela resan, spann, ta bort taket, ny-restaurang-default | **3 d** | **Störst** — tar bort orsaken |
| **2** | Tidslinjen "Vad händer med min order?" (§5) | 2 d | Stor — självbetjäning |
| **3** | Proaktiv avvikelsepush med orsak (§4) | 2 d | Stor |
| **4** | Blockera uppåtjustering i UI (fix 5) | 2 d | Medel |
| **5** | Automatisk `faultParty` + bevis (§7) | 3 d | Ingen på volym, men **kortar** varje samtal |
| **6** | Automatisk kompensationstrappa (§8) | 2 d | Medel |
| **7** | Falken-triage, datasvar först (§6) | 4 d | Medel |
| **8** | Platt-prompt vid onormalt läge (§6) | 2 d | Liten, men täcker de svåra fallen |

**Steg 1–3 är 7 dagsverken och angriper rotorsaken.** Ingen förarapp, ingen GPS, ingen kartberäkning.

---

## 10. Vad detta betyder för förarappen

Förarappen är inte lösningen på det här problemet — men den levererar de **bevis** §7 behöver: `GEOFENCE_EXIT`, `ARRIVED_NEAR_CUSTOMER`, `DETOUR_STOP_DETECTED`. Utan dem är flera skuldregler inte avgörbara och hamnar på "Oavgjort → till människa".

Prioritetsordningen blir därför:

1. **ETA-sanning och transparens** (denna plan, steg 1–3) — löser problemet
2. **Förarappens tidsstämplar** (driver-planen fas 1) — gör skuldreglerna avgörbara
3. **Livekartan** (driver-planen fas 2) — 83 % av kunderna, 32 % av resan, marginell effekt på samtal

Kartan var aldrig svaret. Löftet var problemet.

---

## 11. Rätt ETA utan förarapp

### Blockeraren: ni kan inte mäta det ni vill förutsäga

`deliveredAt` finns **bara på `Delivery`** ([schema.prisma:349](../packages/db/prisma/schema.prisma)) — och för self-delivery skapas ingen `Delivery`-rad.

**Ni har alltså ingen tidsstämpel för när en self-delivery-order faktiskt levererades.** Målvariabeln existerar inte. Ingen modell i världen hjälper förrän den gör det.

Värre: [admin.ts:1008](../packages/api/src/routes/admin.ts) nollar `deliveringAt` när en order hoppar direkt till `DELIVERED` utan att passera `DELIVERING`. Markerar restaurangen bara "levererad" i slutet av turen förlorar ni **både** avgångs- och ankomsttiden.

**Fix 0, före allt annat:**
1. Lägg `Order.deliveredAt DateTime?` — sätts vid varje `→ DELIVERED`-övergång (prod-migration manuellt via psql, per husregeln).
2. Ta bort `deliveringAt`-nollningen. Sätt den istället till `deliveredAt` om den saknas.
3. Bakåtfyll historik ur `AuditLog` så långt det går.

Insats: **0,5 dagsverke.** Utan den är resten av detta avsnitt oimplementerbart.

### Omformuleringen som löser problemet

Ni behöver **inte** veta Foodora-antalet. Ni behöver **fördelningen av den fördröjning det orsakar**, betingad på sådant ni faktiskt ser.

Den viktigaste observerbara proxyn: **ert eget samtidiga orderantal hos restaurangen just nu.** Båda plattformarna toppar på samma middagsrusning. Är ViaEats-trycket högt är Foodora-trycket sannolikt också högt. Ni mäter inte den okända variabeln — ni mäter dess skugga.

### Skattaren: uppslagstabell med nedfall, ingen ML

```
nyckel  = (restaurantId, dagtyp, timbucket, lastbucket, avståndsbucket)
värde   = { p50, p75, p85 } av verklig createdAt → deliveredAt
```

- `dagtyp` — vardag / helg
- `timbucket` — lunch / eftermiddag / kvällsrusning / sent
- `lastbucket` — samtidiga aktiva ViaEats-ordrar: 0–1 / 2–3 / 4+
- `avståndsbucket` — OSRM-vägavstånd: <2 km / 2–3,5 km / >3,5 km

**Nedfall när cellen är tunn** (färre än 8 observationer):

```
full cell → släpp avstånd → släpp last → släpp timme
          → restaurangens median → stadens median för self-delivery
```

Ingen maskininlärning. Förklarbart, felsökbart, och blir bättre av sig självt.

### Lova en kvantil, inte ett medelvärde

Lovar ni P50 är ni sena **hälften av gångerna**. Det är matematiskt garanterat och det är där samtalen kommer ifrån.

| Vad som visas | Kvantil |
|---|---|
| Spannets undre gräns | P50 |
| **Spannets övre gräns** | **P85** |

Då hamnar 85 % av ordrarna inne i spannet och "creepen" försvinner för de flesta.

### Fördelningen är tvåtoppig — och det spelar roll

En batchad order är inte "lite senare". Det är ett **annat tillstånd**:

```
direkt leverans     ≈ 40 min   ████████
batchad (3–5 stopp) ≈ 70 min              ██████
medelvärdet         ≈ 55 min        ↑ nästan ingen order landar här
```

Ett enda tal är därför fel **per konstruktion** — medelvärdet ligger i dalen mellan topparna. Visa spannet, och när sannolikheten för batchning är hög, säg det rakt ut:

> "Beräknad leverans **19:20–19:50**. Restaurangen kör flera leveranser i samma tur just nu."

`P(batchad)` skattas ur samtidig last + timme, **utan** att känna Foodora-antalet.

### Den bästa app-fria signalen: ändra vad ni frågar restaurangen om

Idag betyder `estimatedTime` *"klar om X min"*. Men glappet mellan **klar** och **avgång** är exakt batchningsfördröjningen — den okända ni jagar.

**Byt fältets betydelse för self-delivery-restauranger:**

| Idag | Nytt |
|---|---|
| "Klar om ___ min" | **"Lämnar restaurangen om ___ min"** |

Samma interaktion, samma fält, **ett ord ändrat** — och det fångar hela den osynliga batchningsfördröjningen, från den person som faktiskt vet. Ingen app, ingen GPS, ingen ny skärm.

### Korrigera deras optimism automatiskt

De kommer underskatta. Det är mätbart och rättningsbart:

```
biasFactor(restaurang) = median( verklig avgångsfördröjning / angiven )
                         över senaste 20 ordrarna
```

Säger en restaurang konsekvent 30 min och tar 50 blir `biasFactor = 1,67`, och kunden ser det korrigerade talet. Tyst, automatiskt, ingen diskussion med restaurangen.

Det här är kärnmekanismen — och den fungerar med plattan de redan har.

### Formeln, app-fri

```
avgång  = acceptedAt + angivenAvgång × biasFactor(restaurang, timme, last)
etaMitt = avgång + OSRM(restaurang → kund) × 1,15 + överlämning
spann   = [ P50-modellen , P85-modellen ]
```

Startvärden att kalibrera bort:

| Parameter | Start | Not |
|---|---|---|
| `biasFactor` | **1,3** | tills 20 ordrar mätts |
| trafikfaktor | **1,15** | samma som [travelMatrix.ts](../packages/api/src/lib/travelMatrix.ts) redan använder för CAR |
| överlämning | **2 min** | parkering + till dörren |

### Hur länge tills modellen är användbar

Full betingning ger 2 × 4 × 3 × 3 = **72 celler per restaurang**. Vid 30 ordrar/dag ≈ 900/månad blir det ~12 per cell — **för tunt**.

Realistiskt:

| Nivå | Celler | Ordrar/cell/månad | Användbar efter |
|---|---|---|---|
| `biasFactor` per restaurang | 1 | 900 | **~3 veckor** |
| (restaurang × timbucket) | 4–8 | 110–225 | **~4 veckor** |
| + lastbucket | 12–24 | 40–75 | ~3 månader |
| Full betingning | 72 | 12 | 6+ månader |

Bygg alltså `biasFactor` + timbucket först. De ger nästan hela vinsten och konvergerar inom en månad.

### Buggen du beskrev: "visas som levererad innan den är det"

Verifierat: **det finns ingen timer som auto-sätter `DELIVERED`.** Det är alltså rent ett nedräknings-/UI-problem, vilket är goda nyheter — det är billigt att fixa.

Tre regler:

1. **Rendera aldrig "framme" eller "levererad" ur en timer.** Bara ur ett faktiskt event.
2. **Nedräkningen får inte nå noll och stanna där.** Vid T-0 utan `DELIVERED`: byt till *"Föraren är på väg — vi uppdaterar så snart vi vet mer."*
3. **T-0 utlöser avvikelseflödet** (§4) med ny övre gräns och orsak. Kunden får beskedet innan de hinner undra.

Berörda ytor: [order/[id]/page.tsx](../apps/web/app/order/[id]/page.tsx) `etaLeft`-nedräkningen, samt Live Activity-mappningen i [liveActivityDispatch.ts](../packages/api/src/lib/liveActivityDispatch.ts).

### Sammanlagd insats, app-fritt

| Steg | Insats |
|---|---|
| Fix 0: `Order.deliveredAt` + sluta nolla `deliveringAt` | 0,5 d |
| Byt fältbetydelse till "lämnar om" | 0,5 d |
| `biasFactor` per restaurang | 1,5 d |
| Kvantiluppslag med nedfall (P50/P85) | 3 d |
| Tvåtoppigt spann + batchtext | 1 d |
| Nedräkningsfixen (T-0 aldrig "framme") | 1,5 d |
| **Totalt** | **8 dagsverken** |

Ingen förarapp. Ingen GPS. Ingen kartberäkning. Och `Order.deliveredAt` är dessutom förutsättningen för att förarappen senare ska kunna mäta något alls.

---

## 12. Kvittoskanner-idén — bedömning

**Idén:** en förarapp för self-delivery där föraren fotar *alla* kvitton i turen (ViaEats, Foodora, telefonordrar). OCR extraherar namn, nummer och adress, appen väger in återstående tid per order och bygger en optimerad flerstoppsrutt. Eftersom vi då känner **hela** turen kan vi ge exakt ETA och köposition för våra ordrar — och restaurangen får sina papperskvitton digitaliserade.

### Vad som är genuint starkt

1. **Den löser den informationsgräns jag upprepat kallat olöslig.** I §21–26 av driver-planen visade jag att ingen geometri, ingen score och ingen ML kan veta om det finns en Foodora-order i bilen, eftersom informationen inte finns i datan. Den här idén angriper inte modellen — den **flyttar datainsamlingen till källan**. Det är rätt sorts lösning.
2. **Värdeutbytet är verkligt.** Pizzeriaförare knappar in adresser i Maps en åt gången eller kör på minnet. Auto-sekvenserad flerstoppsrutt är värd riktiga pengar för dem.
3. **Rätt fångstögonblick.** Kvittona ligger fysiskt i förarens hand innan hon åker. Inget extra arbete uppstår om fotosteget är snabbt.
4. **Ruttoptimeringen är nästan gratis hos er.** OSRM:s `/trip`-endpoint löser handelsresandeproblemet direkt, och ni driftar redan OSRM med Skåne-data. Geokodning finns via Places. De delar som *låter* svåra är billiga.

### Blockeraren, och den är inte teknisk

**Foodora-ordern innehåller personuppgifter om en person som inte har någon relation till ViaEats.** Namn, telefonnummer och hemadress.

| Problem | Innebörd |
|---|---|
| **Rättslig grund saknas** | Foodoras kund har aldrig samtyckt till att ViaEats behandlar deras uppgifter. Restaurangen kan inte ge bort en grund den inte har. |
| **Ändamålsbegränsning, art. 5(1)(b)** | Uppgifterna samlades in för att leverera *den* ordern. Att spara dem för analys — "samla in data som fan" — är en ny, oförenlig ändamålsanvändning. |
| **Avtalsrisk för restaurangen** | Plattformsavtal förbjuder i regel att orderdata delas med konkurrerande plattform. Ni skulle inte bara medverka till ett avtalsbrott — ni skulle skapa ett **systematiskt och dokumenterat** sådant. Det är sämre än ad hoc. |
| **Er egen exponering** | Ni blir personuppgiftsansvariga för ett register över konkurrentens kunder, byggt utan grund. Det är den sortens sak som en tillsynsanmälan från en konkurrent riktas mot. |

Jag är inte jurist och det här är inte juridisk rådgivning. Men slutsatsen är tillräckligt tydlig för ett produktbeslut: **verktyget kan byggas — den datainsamling du beskriver kan inte behållas.** Och eftersom insamlingen var en huvudmotivering faller en stor del av det tänkta värdet.

### Ger den 100 % täckning? Nej — 70–90 %

Fyra läckor även med perfekt OCR:

- **Föraren hoppar över fotosteget** när det är stressigt. Efterlevnad blir aldrig 100 %.
- **Ordrar som kommer in under turen** (telefonorder medan föraren är ute) finns inte i fotot.
- **Föraren kör inte alltid appens föreslagna sekvens.** Ni får *mängden* stopp och en *föreslagen* ordning, inte den faktiska.
- **En order kan avbrytas** mitt i turen.

Men här finns en bra nyhet: blir appen förarens faktiska navigationsverktyg trycker hon "nästa stopp" ändå. **Det ger er den verkliga sekvensen gratis, och långt pålitligare än GPS-baserad stoppdetektering** (driver-planen §25). Det är den starkaste biprodukten av hela idén.

### Strategisk skörhet

Foodora kontrollerar kvittoformatet. De kan ändra det, ta bort utskriften helt (de är redan huvudsakligen plattbaserade), eller skriva in ett förbud i partneravtalet. **Er inputkanal ägs av er konkurrent.**

Ni skulle dessutom göra Foodoras leveranser effektivare — en subvention till konkurrentens drift. Motargumentet är att restaurangen blir mer lojal mot er, men det bör vara ett medvetet val, inte en bieffekt.

### Vad som är billigt och vad som är dyrt

| Del | Insats | Not |
|---|---|---|
| Flerstoppsoptimering | **Låg** | OSRM `/trip` finns redan |
| Geokodning + zonvalidering | **Låg** | Places-infra finns |
| Kamerafångst | Låg | — |
| VLM-OCR (namn/nummer/adress) | Medel | Termiska kvitton, skrynkliga, blekta. Ett kvitto per foto — en trave blir markant sämre. Räkna ~90–95 % fältträff på bra foto. Kostnad försumbar med Haiku-klass. |
| **OCR-rättnings-UX** | **Hög** | Föraren måste kunna rätta fel på 3 sekunder i en stressad situation. Det här är den svåra designen, inte OCR:en. |
| Tillståndsmaskin för icke-ViaEats-ordrar | Medel | — |
| **Compliance: DPA, ändamål, gallring** | **Hög** | Blockerande, inte teknisk |

Realistisk uppskattning: **60–80 dagsverken utöver bas-förarappens 27.** Det är ett eget produktspår på 3–4 månader, inte en utökning.

### Rekommendation: dela idén i två nivåer

Kärninsikten som räddar den: **för ETA behöver ni inte veta VEM de andra ordrarna är. Bara HUR MÅNGA och GROVT VAR.** Det är ruttoptimeringen som behöver adresserna — inte ETA:n.

**Nivå 1 — juridiskt ren, bygg denna**

- Föraren fotar/registrerar bara restaurangens **egna** ordrar (telefon, disk). Där är restaurangen personuppgiftsansvarig, ViaEats biträde, rent med ett DPA-tillägg.
- ViaEats-ordrarna har ni redan.
- För plattformsordrar: **inget kvitto, ingen OCR.** Föraren trycker ett antal och valfritt ett grovt område: `[2 stopp] [norr ▾]`.
- **Noll personuppgifter om konkurrentens kunder.**

Det ger `N` (totalt antal stopp), vår position i turen, och riktningen på de andra stoppen — vilket är **exakt vad §25-formeln och det tvåtoppiga spannet behöver.** Alltså i praktiken hela ETA-vinsten.

**Nivå 2 — ruttoptimering med fulla adresser**

Bygg först när tre saker finns på plats:
1. Restaurangens **skriftliga bekräftelse** att de får dela uppgifterna.
2. DPA-tillägg som täcker plattformsordrar och underbiträden.
3. **Hård ändamålsbegränsning:** adresser används bara för att sekvensera turen, raderas när turen är klar, **mineras aldrig**. Ingen analys, ingen aggregering, ingen konkurrentinsikt.

Punkt 3 är den som gör nivå 2 tillåten, och den tar bort den datainsamling som var en huvudmotivering. Det är den ärliga avvägningen.

### Byggordning i förhållande till resten

| Prioritet | Vad | Insats | Effekt |
|---|---|---|---|
| 1 | ETA-sanningen (§3, §11) | 11 d | Löser supportproblemet |
| 2 | Nivå 1: antal + riktning från plattan/appen | ~8 d | Ger hela ETA-vinsten, juridiskt rent |
| 3 | Förarappens tidsstämplar (driver-planen fas 1) | 27 d | Gör skuldreglerna avgörbara |
| 4 | Nivå 2: kvittoskanner + ruttoptimering | 60–80 d | Eget produktspår, kräver juridik först |

**Nivå 1 ger ~90 % av ETA-värdet för ~10 % av insatsen och noll juridisk risk.** Bygg den. Nivå 2 är ett riktigt produkt­spår med riktigt värde — men behandla det som ett eget beslut med juridiken löst i förväg, inte som en utökning av förarappen.

---

## 13. Kvittoskannern — arkitekturen som håller

§12 identifierade blockeraren. Det här avsnittet löser den. Slutsatsen: **hela produkten är byggbar, inklusive plattformskvitton.** Det som inte går är att *lagra* konkurrentens kunduppgifter — och det behöver ni inte.

### Nyckelinsikten: datan ni vill ha är inte datan som är problemet

| Fält | Behövs till | Är det personuppgift? | Behöver sparas? |
|---|---|---|---|
| Namn | Föraren identifierar rätt kasse | Ja | **Nej** |
| Telefon | Ringa vid problem | Ja | **Nej** |
| Gatuadress | Geokodning | Ja | **Nej** |
| Koordinat | Ruttsekvensering | Ja (bostad) | Bara under turen |
| **Antal stopp** | ETA-formeln §11 | **Nej** | **Ja** |
| **Tidsstämplar** | ETA-formeln | **Nej** | **Ja** |
| **Grov riktning / stadsdel** | Tvåtoppigt spann | **Nej** | **Ja** |
| **Batch-rat per timme** | Prior i §26 | **Nej** | **Ja** |

**Allt som driver ETA:n är icke-personuppgifter.** Radering-direkt kostar er alltså ingenting av det ni faktiskt ville ha. Din instinkt var korrekt — jag underskattade hur mycket den räddar.

### Det som gör det lagligt: OCR på enheten

Den enskilt starkaste designändringen. Kör textigenkänningen **lokalt på telefonen**, inte i molnet:

- **iOS:** Vision framework (`VNRecognizeTextRequest`) — offline, gratis, snabbt
- **Android:** ML Kit Text Recognition — offline, gratis
- **Flutter:** `google_mlkit_text_recognition`, passar direkt ihop med `image_picker` som redan finns i [Delivera courier](../mobile_apps/Delivera%20courier/pubspec.yaml)

Konsekvensen är avgörande:

```
Kvittofoto  ──► OCR på enheten ──► namn/telefon/adress ligger BARA i appen
                                        │
                                   geokodning
                                        │
                                        ▼
Servern tar EMOT:  { stopId: "a7f3", lat, lng, sekvens: 3 }
Servern ser ALDRIG: namn, telefonnummer, gatuadress, bild
```

**Namnet och telefonnumret når aldrig era servrar.** Bilden laddas aldrig upp. Ni behandlar inte de uppgifterna alls — de stannar på restaurangens förares telefon, där de redan låg i pappersform.

Det är dessutom **snabbare och billigare** än en VLM-runda: ingen nätlatens mitt i rusningen, ingen tokenkostnad, funkar utan täckning.

### Kvarvarande yta och hur den stängs

Koordinaten till en privatbostad är fortfarande personuppgift. Så:

| Data | Var | Gallring |
|---|---|---|
| Kvittobild | Enhetens RAM | Kastas direkt efter extraktion, aldrig till disk, aldrig till R2 |
| Namn, telefon, gata | Enbart appen, krypterat | Raderas när turen avslutas |
| Koordinat (icke-ViaEats-stopp) | Redis, aldrig Postgres | TTL = turens slut + 2 h |
| Sekvens + tidsstämplar | Postgres | Permanent — icke-personuppgift |
| Antal + stadsdel | Postgres | Permanent — icke-personuppgift |

Implementation: återanvänd [liveState.ts](../packages/api/src/lib/liveState.ts). Den har redan Redis-TTL-mönstret (`POSITION_TTL_MS`) och en fallback när Redis är nere. Nytt keyspace `run:<runId>:stops`, TTL sätts vid skapandet. **Ingen Prisma-modell för icke-ViaEats-stopp** — det är själva garantin. Kan det inte lagras kan det inte läcka.

### Rättslig konstruktion

| Roll | Vem | Varför |
|---|---|---|
| Personuppgiftsansvarig för icke-ViaEats-stopp | **Restaurangen** | De tog emot ordern och har skyldigheten att leverera den |
| Personuppgiftsbiträde | **ViaEats** | Vi tillhandahåller ett ruttverktyg på deras instruktion |
| Rättslig grund | Restaurangens **fullgörande av avtal** med sin kund | Samma ändamål uppgifterna samlades in för: att leverera maten |

Det här håller därför att **ändamålet är oförändrat**. Uppgifterna används till exakt det de gavs för — att få maten till dörren — och inget annat. Det är skillnaden mot §12:s problemformulering, där lagring för analys var ett *nytt* ändamål.

Vad som krävs konkret:

1. **DPA-tillägg** i partneravtalet: ViaEats som biträde för ruttdata, med underbiträden listade (Railway, Redis, geokodning), gallringstider som ovan, och instruktionsbunden behandling.
2. **Uttrycklig auktorisation, inte förbud.** Skriv att restaurangen *får* mata in sina övriga leveranser, med angivna begränsningar. En klausul som säger "bara ViaEats-kvitton" i en app byggd för hela turen är inte trovärdig — man bedöms på designen. Öppen och strukturerad är en starkare position än förnekande.
3. **En rad i restaurangens integritetspolicy** som ni kan skriva åt dem: att ett ruttplaneringsverktyg används och att uppgifterna raderas efter leverans.
4. **Radera-vid-uppsägning** och exportfunktion — standard biträdesklausuler.

### Foodora-avtalet: restaurangens beslut, men gör det upplyst

Att plattformsavtalet kan förbjuda delning är **restaurangens avvägning**, inte er. Men hantera det som ett upplyst beslut, inte som något ni tigit om — annars är det ni som förlorar restaurangen när det brakar:

> En ruta i onboardingen: *"Jag ansvarar för att min användning av ruttplaneringen är förenlig med mina övriga plattformsavtal."*

Det är inte en disclaimer som gömmer designen. Det är en korrekt fördelning av ett beslut som faktiskt är deras — och det skyddar er kommersiellt, för de kan inte säga att de inte visste.

### Vad ni får behålla — och det är mycket

Per restaurang, permanent, helt lagligt eftersom inget är personuppgift:

- Antal stopp per tur, per timme, per veckodag
- Andel turer med externa ordrar — **precis den prior §26 behövde, utan inlärningsperiod och utan stoppdetektering**
- Fördelning av vår orders position i turen
- Riktningsfördelning på stadsdelsnivå
- Verklig avgångstid vs restaurangens angivna → **`biasFactor` direkt mätt** (§11)
- Verklig `deliveredAt` per stopp när föraren trycker "levererat"

Det ger er ETA-motorn ni ville ha, batch-priorn, könumret och `biasFactor` — allt på en gång. **Nivå 1 i §12 blir onödig; det här ersätter den.**

### Vad detta gör med täckningen

| Modell | Yta | Av resan | Not |
|---|---|---|---|
| Geometri (driver-planen §21) | 57 % | 27 % | Taket satt av vägnätet |
| L5 kryssruta | 85 % | 38 % | Kräver ärlighet |
| **Kvittoskanner, känd sekvens** | **~100 %** | **~100 % av vårt ben** | Begränsas bara av efterlevnad |

Föraren trycker "nästa stopp" ändå, eftersom appen är hennes navigation. **Ni får den faktiska sekvensen som biprodukt** — ingen stoppdetektering, ingen klassificerare, ingen kalibrering. Hela §25 och §26 blir överflödiga.

Realistiskt tak: **70–90 %**, satt av hur ofta föraren faktiskt fotar. Det är ett UX-problem, inte ett juridiskt eller matematiskt.

### Reviderad insats

On-device-OCR tar bort VLM-pipelinen och bildlagringen, vilket sänker både kostnad och risk:

| Del | Insats |
|---|---|
| Kamerafångst + on-device OCR (Flutter + ML Kit/Vision) | 8 d |
| Fältparsning + rättnings-UX (**den svåra delen**) | 10 d |
| Geokodning + zonvalidering (Places-infra finns) | 3 d |
| Flerstoppsoptimering (OSRM `/trip` finns) | 4 d |
| Efemär stopplagring i Redis (liveState-mönstret finns) | 3 d |
| Navigation-handoff + "nästa stopp"-flöde | 5 d |
| ETA-integration + statistikinsamling | 5 d |
| DPA-tillägg, policytext, onboarding-ruta | 3 d |
| **Totalt** | **~41 d** |

Ner från 60–80 d i §12, främst för att molnbaserad OCR och bildlagring försvinner. Ovanpå bas-förarappens 27 d.

### Rättnings-UX är den verkliga risken

OCR ger ~90–95 % fältträff på ett bra foto av **ett** kvitto. En trave i ett foto blir markant sämre — tvinga ett kvitto per bild.

Vid 5–10 % fel och 5 kvitton per tur får föraren ett fel varannan tur, mitt i rusningen. Designkrav:

- Fel ska kunna rättas i **under 3 sekunder**
- Adressen valideras mot Places medan hon fotograferar; ogiltig adress markeras direkt, inte efter fem kvitton
- Numeriskt tangentbord för husnummer, autocomplete för gatan
- **Om OCR:en är osäker: hoppa inte över stoppet — visa det med tom adress högst i listan** så det inte försvinner tyst

Klarar ni inte det trycker föraren aldrig igen efter andra veckan, och hela datainsamlingen dör. Det är där jag skulle lägga mest designtid, inte på OCR-modellen.
