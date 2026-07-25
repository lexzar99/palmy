# Förarapp för self-delivery-restauranger — analys & plan

Status: **förslag / beslutsunderlag**. Inget är byggt.
Datum: 2026-07-24
Granskad kodbas: `packages/api`, `packages/db`, `mobile_apps/Delivera courier`, `mobile_apps/Delivera flutter business`, `mobile_apps/ViaEats Swift iOS`, `apps/web`, `apps/courier`.

---

## 0. Vad som redan finns (och som ska återanvändas)

Det här är viktigare än det låter: ungefär **70 % av backend-infrastrukturen finns redan**, byggd för plattformskurirerna.

| Funktion | Var | Återanvänds hur |
|---|---|---|
| Positionsskrivning med write-behind (Redis → PG-flush med claim, 10 min TTL) | `packages/api/src/lib/liveState.ts`, `courierLivePosition.ts` | Nytt keyspace `driver:*`, samma Lua-skript och `createCourierPositionWriteBehind`-mönster |
| Live-position till kund via Socket.IO `order:${id}`-rum | `routes/courier.ts:575`, `apps/web/app/order/[id]/page.tsx:481` | **Får INTE återanvändas rakt av** — se §6, kunden ska gatas |
| Enhetsparning med engångskod + refresh-rotation | `DevicePairingCode`, `routes/terminal.ts:219` | Kopieras nästan rakt av för förartelefonen |
| Riktiga vägavstånd/restider (OSRM + cache + haversine-fallback) | `lib/travelMatrix.ts`, `tools/osrm` | Ryggraden i confidence-scoren |
| ETA-motor (etaReadyAt / etaPickupAt / etaCustomerAt) + per-zon-historik | `lib/orderEta.ts`, `orderLiveEta.ts`, `restaurantZoneEta.ts` | Får äntligen sanna mätvärden att lära sig av |
| iOS Live Activity end-to-end (ActivityKit + APNs push + widget-target) | `lib/liveActivityPush.ts`, `liveActivityDispatch.ts`, `ViaEatsSwiftOrderWidget/` | Bevisad APNs-kedja; förarens LA blir ett nytt target, inte ny infrastruktur |
| Flutter-app med geolocator, bakgrundslägen, offline-kö, FCM | `mobile_apps/Delivera courier/lib/core/{location_service,pending_queue,push_service}.dart` | Skelettet till förarappen |
| Backend-konfigurerbara motorparametrar + händelselogg | `EngineSetting`, `EngineEvent` (schema.prisma:1543) | Alla trösklar/intervall i §5 och §7 |
| `selfDelivery`-flagga och status-maskin som redan ger self-delivery `PREPARING → DELIVERING → DELIVERED` | `Restaurant.selfDelivery`, `lib/orderStatusMachine.ts` | Grinden som avgör om förarflödet är aktivt |
| Retentionsjobb-mönster (TTL-fält + batchad radering) | `lib/cleanup.ts` | GPS-retention i §9 |

Slutsats: det här är inte ett greenfield-projekt. Det är ett **nytt klient-scenario ovanpå befintlig kuririnfrastruktur**.

---

## 1. Ärlig bedömning av idén

### Värt att bygga? Ja — men inte den delen du fokuserar mest på.

**Det som skapar mest affärsvärde (i ordning):**

1. **Sanna tidsstämplar för "maten lämnade restaurangen" och "maten kom fram".**
   Idag är `deliveringAt` en knapptryckning på plattan. Restauranger trycker "på väg" när maten är packad — inte när den lämnar. Det är den enskilt största felkällan i er ETA och den enda som kunden faktiskt märker. Förarens geofence-utgång ger er sanningen gratis, utan någon confidence score alls.
2. **Leveransbekräftelse med tid + plats.** Löser tvister ("maten kom aldrig") och ger `restaurantZoneEta.ts` riktig träningsdata per zon.
3. **Trust Score-signaler** som är mätbara istället för anekdotiska.
4. **Livekarta till kunden.** Fint, men det är den fjärde viktigaste saken — inte den första.

**Det som är överkomplicerat:**

- **Confidence-scoren som gate för livekartan är rätt idé men fel prioritet.** Den löser ett problem (missvisande karta) som ni kan lösa till 100 % genom att *inte visa kartan alls* i MVP. Ni får ~85 % av affärsvärdet utan en enda rad scoring-kod.
- **Automatisk order-till-förare-matchning.** Se nästa avsnitt — den kan inte fungera tillförlitligt, av informationsteoretiska skäl, inte tekniska.

### Antaganden i din idé som är fel eller riskabla

**(a) "Systemet ska avgöra vilken förare som har vilken order."**
Det här är det centrala felantagandet. Du beskriver själv scenariot: föraren har en Foodora-order som ni inte känner till. Ingen mängd GPS-signalbearbetning kan skilja "har ViaEats-ordern men kör Foodora först" från "har inte ViaEats-ordern" — **informationen finns inte i datan**. Ni gissar på en dold variabel.

Konsekvensen: automatisk matchning kommer ha en felfrekvens som ni inte kan mäta och inte kan sänka. Och varje fel visar fel förare på kundens karta — exakt det du vill undvika.

**Rekommendation: vänd på det.** Ett tryck från föraren är inte fallback, det är **primärmekanismen**. Automatik används bara för att *förvälja* när det finns exakt en kandidat, och föraren bekräftar ändå med samma tryck. Ett tryck kostar 1,5 sekunder. Ett fel kostar en kund.

**(b) "Android-overlay."** Nej. `SYSTEM_ALERT_WINDOW` kräver att användaren manuellt gräver i systeminställningar, är begravd olika djupt hos Xiaomi/Oppo/Samsung, och en **notis-actionknapp gör exakt samma jobb med noll behörigheter**. Overlay ger noll extra funktion här. Bygg inte.

**(c) "Håll inne knappen i 2–3 sekunder" i Live Activity.** Går inte. Live Activity-knappar (iOS 17+, App Intents) stöder bara enkeltryck — ingen long-press, ingen gest. Hold-to-confirm kan bara finnas inuti appen. Det påverkar designen i §8.

**(d) "Appen sköter GPS automatiskt även när den är stängd."** Delvis fel på iOS. Om föraren **force-quittar** appen (swipe up) upphör vanliga bakgrundspositionsuppdateringar helt tills appen öppnas igen. Undantaget — och det är den viktigaste tekniska detaljen i hela dokumentet — är att **region monitoring (geofence) och significant location changes återstartar en force-quittad app i bakgrunden**. Det är därför geofencing inte är en "kanske"-fråga utan er enda motståndskraft mot iOS. Se §4.

**(e) "Automatisk leveransbekräftelse."** Du misstänker rätt att det blir fel. Se §8 — jag rekommenderar automatiskt *förslag*, aldrig automatisk *stängning* (med ett smalt undantag för datahygien).

**(f) Batterivinsten från adaptiva lägen är mindre än man tror under rusning.** En pizzeriaförare är ute ~40 min per timme mellan 17–21. Under rusning sparar lägesmodellen ~25–30 %. Den stora vinsten är de 60 % av passet som är väntetid. Räkna med hela passet, inte rusningen. Se §10.

### Finns enklare lösning som ger 80–90 %?

Ja, och den är MVP:n i §12:
**Parning + pass + en-tryck-koppling + stor Levererad-knapp + geofence-utgång. Ingen kundkarta.**
Kunden får ärlig status och en ETA som för första gången bygger på när maten faktiskt lämnade. Det är byggbart på ~6 veckor och riskerar ingenting.

---

## 2. Rekommenderad produktlösning

**Förarappen är en "skiftterminal", inte en leveransapp.**

Tre skärmar totalt:

1. **Parningsskärm** — 6-siffrig kod från restaurangens platta. En gång per telefon.
2. **Passkärm** — en stor knapp: *Starta pass* / *Avsluta pass*. Visar restaurangnamn + "Position delas: PÅ".
3. **Körskärm** — visas bara när det finns minst en order i `DELIVERING`:
   - Om **en** okopplad order och föraren just lämnat geofencen → ordern förvalt, ett kort med kundnamn + gata + ordernummer och knappen **"Jag kör den här"**.
   - Om **flera** → lista med korten, ett tryck per kort.
   - Efter koppling → **en enda stor knapp: "Levererad"** + liten "Fel order?"-länk.
   - Efter tryck → 5 min ångra-remsa med kundnamn + adress.

Utanför appen:
- **Android:** permanent foreground-service-notis med actionknappen "Levererad" när en order är kopplad.
- **iOS:** Live Activity på låsskärm/Dynamic Island med samma knapp (fas 2).

Det är hela produkten. Ingen karta i förarappen (Google Maps-djuplänk räcker, `url_launcher` finns redan), ingen chatt, inga intäktssiffror (per policy: kurirappar visar aldrig ersättning — samma princip gäller här, restaurangens förare har ingen ViaEats-ersättning över huvud taget).

---

## 3. Systemflöde: passtart → levererad

```
FÖRARE                     APP                      BACKEND                  PLATTA/KUND
──────────────────────────────────────────────────────────────────────────────────────
Öppnar app        →  har token?
                     nej → kodfält        →  POST /driver/pair
                                             validerar DevicePairingCode
                                             (purpose=DRIVER, single-use, 10 min)
                                          →  driver-token + refresh        Platta: visar
                                                                            "Anders parad"

Trycker Starta    →  behörighetsprompt    →  POST /driver/shift/start      Platta: Anders ●
pass                 registrerar geofence     DriverShift skapas,
                     kring restaurangen       consentVersion loggas
                     LÄGE = AT_RESTAURANT

(väntar)          →  ingen kontinuerlig GPS. Geofence + significant changes.
                     ~1 ping / 10 min                                       Kostnad ≈ 0

Restaurangen                                 order.status = DELIVERING
trycker "på väg"                             (deliveringAt = nu)           Kund: "Maten
                                             ⚠ INGEN kundkarta ännu         är på väg"
                                          →  socket driver:orders
                     LÄGE = CANDIDATE
                     ping var 30 s

Kör ut ur          →  geofence exit-event  →  POST /driver/positions
geofencen             (väcker även force-      DeliveryEvent GEOFENCE_EXIT
                      quittad iOS-app)        ⭐ ETA-ankare = HÄR, inte
                                                 plattans knapptryck
                                             1 kandidatorder? → förvälj
                                          →  socket driver:assignment-hint

Trycker "Jag      →  LÄGE = ACTIVE        →  POST /driver/orders/:id/claim
kör den här"         ping var 15 s            Delivery.restaurantDriverId
                                             låses (atomiskt, first-wins)
                                             confidence-loop startar        Kund: ETA
                                                                            skärps

<400 m från kund  →  LÄGE = NEAR          →  score ≥ 70 x2 → level=LIVE    Kund: karta
                     ping var 8 s            socket order:tracking          (fas 2)
                     LA/notis primas

Trycker           →  offline-kö om nät    →  POST .../delivered
"Levererad"          saknas (finns redan)     status=DELIVERED, källa,
                                             lat/lng/accuracy loggas
                     5 min ångra-remsa        kundpush FÖRDRÖJD 90 s        Kund: "Levererad"
                                                                            (efter 90 s)

(inget tryck)     →  LÄGE = AT_RESTAURANT när geofence-enter, annars IDLE efter 10 min stilla
```

---

## 4. Teknisk arkitektur

### Klient: Flutter + native där det krävs

Flutter för allt UI och all affärslogik. Native bara för tre saker:

| Sak | Plattform | Varför native |
|---|---|---|
| Live Activity + App Intent-knapp | iOS, Swift | ActivityKit och App Intents har ingen fungerande Flutter-motsvarighet. Widget-target + MethodChannel. |
| Region monitoring (geofence) som återstartar force-quittad app | iOS, Swift | `geolocator` exponerar inte `CLLocationManager.startMonitoring(for: CLCircularRegion)`. Detta är kritiskt. |
| Foreground service med actionknapp | Android, Kotlin | `geolocator`s inbyggda FGS-notis saknar actions. Egen service + `NotificationCompat.Action` som skickar broadcast. |

Allt annat (`geolocator` positionsström, `flutter_secure_storage`, `dio`, offline-kö) kopieras från `Delivera courier`.

**iOS-behörigheter och Info.plist**
- `NSLocationWhenInUseUsageDescription` + `NSLocationAlwaysAndWhenInUseUsageDescription`
- `UIBackgroundModes: location`
- Be om **When In Use först**, eskalera till **Always** först efter första passet (Apples "provisional always"-mönster ger högre acceptansgrad än att fråga direkt)
- `showsBackgroundLocationIndicator = true` — den blå indikatorn är inte bara en Apple-regel, den är er GDPR-transparens (§9)
- iOS 17+: använd `CLLocationUpdate.liveUpdates(.otherNavigation)` istället för `startUpdatingLocation` där tillgängligt

**Android-behörigheter — viktigt Play Store-beslut**
- `ACCESS_FINE_LOCATION` + `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION` + `POST_NOTIFICATIONS`
- **Undvik `ACCESS_BACKGROUND_LOCATION`.** Startar ni foreground-servicen medan appen är synlig (vilket alltid är fallet — föraren trycker "Starta pass") räcker fine location. Det sparar er Play Console-deklarationsformuläret för bakgrundsposition, som är den långsammaste granskningen Google har. FGS-typen `location` kräver en egen, betydligt lättare deklaration.
- `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` — be om det vid passtart, med en förklarande skärm. Xiaomi/Oppo/Huawei dödar annars servicen inom 30 min.

### Backend

Inget nytt paradigm. `packages/api/src/routes/driver.ts` + `lib/driverTracking.ts` + `lib/deliveryConfidence.ts`.

- **Positioner:** `POST /api/driver/positions` tar en **batch** av samples. Detta är inte en optimering utan en arkitekturell nödvändighet: det ger offline-sync gratis och sänker request-antalet 4–6×.
- **Live state:** Redis, samma modul som kurirerna (`liveState.ts` utökas med `driver:`-keyspace). PG-flush max var 60:e sekund per förare via befintlig claim-mekanism.
- **Realtid:** Socket.IO, befintlig Redis-adapter. Nya rum: `driver:${driverId}` och `restaurant-drivers:${restaurantId}` (för plattan).
- **Confidence:** körs **på ingest**, inte på timer. En OSRM-ruttfråga per (order, förare)-koppling, cachad; därefter är korridorstestet ren geometri. Att anropa OSRM per ping är kostnadsfällan — gör det inte.

---

## 5. GPS-lägen och uppdateringsfrekvenser

**Riktning: telefonen pushar. Backend frågar aldrig.** En pull-modell kräver att backend kan väcka en sovande telefon — det kan den inte göra pålitligt på någon plattform, och en silent push som väcker appen var 15:e sekund kommer strypas av både APNs och Doze.

Alla värden nedan är **defaults i `EngineSetting`-nyckeln `driver.tracking`**, hämtas av appen i `GET /driver/state` och kan ändras utan app-release.

| Läge | Trigger in | Precision | distanceFilter | Sändning | Batteri |
|---|---|---|---|---|---|
| **IDLE** | Pass på, ingen order ute, utanför geofence >10 min | significant changes / passive | — | Bara vid händelse, max 1/10 min | <0,3 %/h |
| **AT_RESTAURANT** | Inne i restaurangens geofence (radie 120 m) | balanced | 100 m | Vid geofence-exit + heartbeat 10 min | ~0,4 %/h |
| **CANDIDATE** | ≥1 order i `DELIVERING`, ingen kopplad förare, föraren utanför geofence | high | 50 m | 30 s | ~2 %/h |
| **ACTIVE** | Order kopplad till föraren | high | 30 m | 15 s i rörelse, 45 s stillastående | ~4 %/h |
| **NEAR_CUSTOMER** | <400 m fågelvägen till kund | best | 15 m | 8 s | ~5 %/h |
| **COMPLETING** | Levererad tryckt | balanced | 100 m | 60 s i 3 min (fångar ångra + nästa stopp) | ~1 %/h |

**Triggers istället för fasta intervall — använd alla tre:**
1. **Geofence (region monitoring)** kring restaurangen. Den enda mekanism som återstartar en force-quittad iOS-app. Registrera *alltid*, i alla lägen.
2. **Geofence kring kunden** (150 m) när order kopplas. Ger ankomst-event utan att polla.
3. **distanceFilter** som primär drivare i rörelse — hastighetsberoende sändning faller ut naturligt (står bilen stilla kommer inga events, då tar heartbeaten över).

**Stopp:** Passet avslutas manuellt → allt stoppas. Auto-stopp om: inne i geofence + noll rörelse i 45 min + ingen aktiv order (`AUTO_IDLE`), eller pass >12 h (`AUTO_MAXLEN`). Auto-stopp ska **notifiera föraren och plattan**, aldrig ske tyst.

**Offline:** `pending_queue.dart`-mönstret (finns) utökas till positioner. Ringbuffer i `shared_preferences`, max 500 samples / 6 h. Vid återanslutning: en batchad POST, backend sorterar på `at` och avvisar samples äldre än 30 min för live-syfte men lagrar dem för analys och för att rekonstruera rutten. **Gamla positioner får aldrig flytta kundens kartmarkör** — de flaggas `late=true` och exkluderas från confidence.

**Batteribudget, hela passet:** 6 h där 2,5 h är ACTIVE/NEAR och 3,5 h är IDLE/AT_RESTAURANT → ≈ 12–15 % av batteriet. Naiv konstant hög precision ≈ 25–30 %. Det är skillnaden mellan "min telefon dör på passet" och "det märks inte".

---

## 6. Confidence score — regelbaserad, 0–100

**Först: den gäller bara om kunden ska se en karta.** Statusar och ETA visas alltid, oberoende av score.

### Hårda grindar (allt uppfyllt, annars score = 0)

- `order.status == DELIVERING`
- Föraren är kopplad till ordern (`Delivery.restaurantDriverId` satt)
- Senaste positionen <90 s gammal, `accuracy < 100 m`, inte `late`
- Föraren är utanför restaurangens geofence
- Minst 4 positionssamples sedan koppling (≈60 s data)

### Poängkomponenter

| # | Signal | Max | Beräkning |
|---|---|---|---|
| 1 | **Koppling** | 40 | Förarens eget tryck = 40. Systemförval som föraren *inte* bekräftat = 15. Ren gissning = 0. |
| 2 | **Avståndstrend** | 25 | Glidande fönster: senaste 5 samples / max 3 min. `progress = (d_first − d_last) / d_first`, där `d` = OSRM-vägavstånd till kund (haversine-fallback). `min(25, progress × 60)`. Kräver ≥3 av 4 delsteg minskande — det filtrerar bort enkelriktade omvägar. |
| 3 | **Riktning** | 15 | Vinkel mellan rörelseriktning och bäring till kund. `15 × max(0, cos θ)` , räknas **bara när hastighet >3 m/s**. Under 3 m/s bidrar komponenten 0 istället för negativt (parkering, kö). |
| 4 | **Ruttkorridor** | 10 | Avstånd till den vid koppling hämtade OSRM-polylinen restaurang→kund. Innanför `max(150 m, 15 % av återstående avstånd)` = 10, linjär avtrappning till 0 vid dubbla tröskeln. |
| 5 | **Rörelserimlighet** | 10 | Hastighet 2–25 m/s och ingen teleportering (>60 m/s mellan samples → förkasta samplet helt). |

### Avdrag

| Signal | Avdrag | Återhämtning |
|---|---|---|
| Stillastående >90 s på plats >300 m från kund (**annan leverans**) | −25 | Trappas av med 5 p/min efter att rörelsen mot kunden återupptagits |
| Nettoavstånd ökat >400 m över fönstret | −30 | Direkt när trend 2 blir positiv igen |
| Föraren är närmare en **annan** aktiv ViaEats-kund än denna | −20 | Och +10 till det andra paret (skapar naturlig omprioritering) |
| GPS-noggrannhet 50–100 m | −10 | — |
| Position 90–180 s gammal | −15 | — |

### Nivåer och hysteres

| Score | Nivå | Kunden får se |
|---|---|---|
| <45 | `NONE` | Status + grov ETA. Ingen karta, inget avstånd. |
| 45–69 | `ETA` | Status + skarpare ETA + avståndsband ("ca 8 min bort"). Ingen karta. |
| ≥70, **två utvärderingar i rad** | `LIVE` | Karta med förarens position. |

**Hysteres (obligatoriskt):**
- Uppåt: kräver 2 konsekutiva ≥70. Nedåt: kräver 2 konsekutiva <50. Utan detta blinkar kartan i varje rondell.
- Nivån får **aldrig gå NONE → LIVE direkt** om ordern varit i `NONE` <60 s.
- När `LIVE` tappas: frys sista positionen i 60 s med "Uppdaterar position…", gå sedan till `ETA` med neutral text. **Ta aldrig bort kartan med en förklaring som antyder problem.**
- Markören får bara flyttas framåt längs ruttkorridoren när avvikelsen är <korridorbredden — annars snappas den till korridoren. Kunden ska aldrig se en markör studsa mellan hustak.

### Vad scoren *inte* löser

Fall 2 i din lista (föraren har ViaEats-ordern men kör en annan order först) hamnar korrekt i `ETA`-nivån tack vare stillastående-avdraget — men **bara efter** att föraren stannat 90 s. De första 3–4 minuterna av felriktad körning ser identiska ut med "kör en omväg". Därför: score ≥70 kan inte nås förrän avståndstrenden varit positiv i minst 3 mätpunkter. Det är avsiktligt konservativt. Ni kommer visa kartan senare än konkurrenterna. Det är rätt val.

---

## 7. Kundupplevelse — ärliga texter

| Situation | Kunden ser | Karta |
|---|---|---|
| Restaurangen lagar | "Restaurangen förbereder din beställning" + ETA-fönster | Nej |
| `DELIVERING` satt, förare ej identifierad | "Maten är klar och på väg ut" + ETA | Nej |
| Förare kopplad, låg score | "Maten är på väg" + ETA | Nej |
| Förare kör annan leverans först | "Maten är på väg" + **justerad ETA** | Nej |
| Osäker rutt | Samma som ovan — ingen skillnad synlig för kunden | Nej |
| Tydligt på väg (≥70) | "På väg till dig · ca 7 min" | **Ja** |
| Nära (<400 m) | "Föraren är strax framme" | Ja |
| Stannat utanför | "Föraren är framme vid din adress" (efter 60 s stillastående <120 m) | Ja, fryst |
| Levererad | "Levererad kl 18:42" (efter 90 s fördröjning) | Nej |
| GPS saknas | "Maten är på väg" + ETA. **Ingen felmeddelandetext.** | Nej |
| Föraren tappat nät | Frys 60 s → tillbaka till ETA-läge, tyst | Nej |
| Försenad (>ETA+8 min) | "Det tar lite längre än beräknat. Ny uppskattning: 19:05." | Behåller nuvarande nivå |

**Regler för copy:**
- Aldrig "maten hålls varm" — det kan ni inte verifiera.
- Aldrig visa exakt ETA-sekund. Alltid intervall eller avrundat till 5 min när score <70.
- Aldrig en text som förklarar *varför* kartan försvann. Det inbjuder till misstro.
- Frånvaro av karta ska aldrig se ut som ett fel — layouten måste vara komplett och lugn utan den. Designa **ETA-läget först**, kartan som tillägg.

---

## 8. Leveransbekräftelse — jämförelse

| Metod | Feltryck | Interaktion | Rekommendation |
|---|---|---|---|
| Helt automatisk (geofence-exit efter stillastående) | **Hög.** Flerfamiljshus, GPS-drift, förare parkerar 80 m bort, två ordrar i samma port | Noll | ❌ Nej |
| Enkeltryck | Medel | 1 tryck | ⚠️ Bara med ångra |
| Dubbeltryck | Låg | 2 tryck | ❌ Oupptäckbart, går inte i Live Activity |
| Håll inne 2–3 s | Låg | 1 lång tryckning | ⚠️ **Går inte i Live Activity eller notis** |
| **Enkeltryck + 5 min ångra + fördröjd kundpush** | **Låg i praktiken** | 1 tryck | ✅ **Rekommenderas** |
| Automatiskt förslag + bekräftelse | Låg | 1 tryck (men vid rätt tidpunkt) | ✅ Som komplement |

**Rekommenderat flöde:**

1. När föraren är <80 m från kunden och stått stilla 45 s → **prima** knappen (notis/LA byter till "Levererad hos {gata}" och blir grön). Ingen automatisk stängning.
2. Enkeltryck. Ordern markeras `DELIVERED` internt **omedelbart** (rätt tidsstämpel).
3. **Kundens push + reviewprompt fördröjs 90 sekunder.** Mönstret finns redan i kodbasen (`deliveringAt` har samma fördröjda visning). Det gör att ~90 % av feltrycken aldrig når kunden.
4. 5 min ångra-remsa i appen med **kundnamn + gata + ordernummer** — utan dem ångrar föraren fel order.
5. Vid ångring: status tillbaka till `DELIVERING`, `DeliveryEvent DELIVERY_UNDONE` loggas, plattan notifieras. Har kundpushen redan gått ut: skicka **ingen** rättelse-push (det skapar mer förvirring än det löser) — uppdatera bara ordersidan.
6. **Auto-stängning endast som datahygien:** order i `DELIVERING` där föraren varit <150 m från kund, sedan tillbaka i restaurangens geofence, och 25 min gått → markera `DELIVERED` med `deliveredSource=AUTO_INFERRED`. Denna flagga **exkluderas från Trust Score och från leveranstidsstatistiken**, och ordersidan säger "Leveransen registrerades automatiskt". Det är städning, inte mätning.

Om knappen aldrig trycks och auto-regeln inte slår: efter 45 min i `DELIVERING` → notis till plattan, inte till kunden.

---

## 9. Live Activity, notiser och Shortcuts

### iOS

- **Live Activity med App Intent-knapp fungerar när appen är force-quittad.** Intenten körs i widget-extensionens process. Det är den enda vägen till "Levererad utan att öppna appen".
- **Men bakgrundspositionen fungerar INTE efter force-quit** — bara region monitoring/significant changes återstartar appen. Så: LA-knappen kan lyckas medan positionsdatan är gammal. Backend måste därför acceptera `delivered` **utan färsk position** och logga `positionAgeSec` istället för att avvisa. Avvisa aldrig en leveransmarkering på grund av GPS.
- Krav: iOS 16.2 för LA, **iOS 17.0 för interaktiva knappar**. Under 17 → LA visar bara status, knappen finns i notisen.
- LA startas från appen när order kopplas, uppdateras via APNs-push med befintlig `liveActivityPush.ts`-kedja (nytt `ActivityAttributes`-target, samma nycklar och samma token-registreringsmönster).
- Dynamic Island: kompakt = ikon + minuter kvar. Expanderad = adress + knapp.
- **Ingen hold-to-confirm.** Enkeltryck + ångra i appen, per §8.

### Android

- Foreground service, typ `location`, med `NotificationCompat.Action` "Levererad". `PendingIntent` → `BroadcastReceiver` → API-anrop, appen behöver aldrig öppnas.
- Notisen är **inte valfri** — den är både Androids krav och er GDPR-transparens.
- **Bygg inte overlay.** Ingen funktionell vinst, permission-friktion, och Play Store granskar `SYSTEM_ALERT_WINDOW` hårdare varje år.
- OEM-batterioptimering är den verkliga fienden. Mitigering: (1) be om ignore-battery-optimizations vid passtart, (2) **backend-watchdog** — upptäck >8 min positionsglapp under aktivt pass och visa på restaurangens platta: *"Anders telefon har slutat rapportera position."* Restaurangen kan då fysiskt fråga föraren. Det är billigare och mer effektivt än att kämpa mot Xiaomis firmware.

### Apple Shortcuts / Automations — ärlig bedömning

| Fråga | Svar |
|---|---|
| Kan starta ett arbetspass? | Ja, tekniskt — personlig automation "När jag ansluter till Wi-Fi *Restaurangen*" → Öppna app / kör App Intent. Sedan iOS 16.4 utan bekräftelse. |
| Aktiveras vid ankomst till restaurangen? | Ja, "När jag anländer till [plats]". |
| Under arbetstid? | Ja, tidsbaserad automation. |
| Förbättra bakgrunds-GPS? | **Nej.** Noll effekt på behörigheter eller bakgrundskörning. |
| Kringgå iOS-begränsningar? | **Nej. Inga.** |

**Verdict:** Bygg **App Intents** (`"Starta passet"`, `"Markera levererad"`) — det är ~1 dagsverke och ger Siri + Shortcuts + LA-knappen i samma kod. Men bygg det som en **bekvämlighet**, aldrig som en beroende komponent: automationer måste sättas upp manuellt per förare, går sönder tyst, och kan inte deployas av er. Nämn det i föraronboardingen som ett tips. Aldrig i arkitekturen.

---

## 10. Datamodell och events

### Nya Prisma-modeller

```prisma
model RestaurantDriver {
  id           String   @id @default(cuid())
  restaurantId String
  restaurant   Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  name         String
  phone        String?
  isActive     Boolean  @default(true)
  vehicle      String   @default("CAR")
  createdAt    DateTime @default(now())
  shifts       DriverShift[]
  @@index([restaurantId, isActive])
}

model DriverShift {
  id           String    @id @default(cuid())
  driverId     String
  driver       RestaurantDriver @relation(fields: [driverId], references: [id], onDelete: Cascade)
  restaurantId String
  deviceId     String
  startedAt    DateTime  @default(now())
  endedAt      DateTime?
  endedReason  String?   // MANUAL | AUTO_IDLE | AUTO_MAXLEN | DEVICE_REPLACED
  consentVersion String
  permissionState String  // ALWAYS | WHEN_IN_USE | DENIED
  lastPositionAt DateTime?
  @@index([restaurantId, endedAt])
  @@index([driverId, startedAt])
}

model DeliveryEvent {
  id           String   @id @default(cuid())
  orderId      String?
  restaurantId String
  driverId     String?
  type         String   // se lista nedan
  at           DateTime @default(now())
  lat          Float?
  lng          Float?
  accuracyM    Float?
  meta         Json?
  @@index([orderId, at])
  @@index([restaurantId, type, at])
}

model DriverPositionSample {
  id        String   @id @default(cuid())
  driverId  String
  shiftId   String
  at        DateTime
  lat       Float
  lng       Float
  accuracyM Float?
  speedMps  Float?
  headingDeg Float?
  orderId   String?  // satt när samplet togs under aktiv koppling
  late      Boolean  @default(false)
  @@index([driverId, at])
  @@index([orderId, at])
}

model DeliveryTrack {          // permanent, komprimerad ersättning för raw
  id             String   @id @default(cuid())
  orderId        String   @unique
  driverId       String?
  polyline       String   // Douglas–Peucker-förenklad, ≤50 punkter
  distanceKm     Float
  durationSec    Int
  geofenceExitAt DateTime?
  arrivedAt      DateTime?
  deliveredAt    DateTime?
  maxGapSec      Int
  maxConfidence  Int
  createdAt      DateTime @default(now())
}
```

### Fältutökningar

- `Delivery`: `restaurantDriverId String?` + relation. **Återanvänd `Delivery`-tabellen** — den äger redan `pickedUpAt`/`deliveredAt`/proof och konsumeras av admin, finance och ETA. Att duplicera den för self-delivery skapar två sanningar. `payOre` förblir 0 (restaurangens förare har ingen ViaEats-ersättning). DB-constraint: högst en av `courierId` / `restaurantDriverId` satt.
- `Order`: `driverAssignedAt DateTime?`, `trackingLevel String @default("NONE")`, `deliveredSource String?` (`DRIVER_BUTTON|TABLET|AUTO_INFERRED|ADMIN`), `deliveryUndoneAt DateTime?`
- `DevicePairingCode`: `purpose String @default("TERMINAL")` — återanvänd modellen istället för en ny.

### Eventtyper och vad de används till

| Event | Bättre ETA | Statistik | Tvist | Trust Score | Manipulation |
|---|:-:|:-:|:-:|:-:|:-:|
| `SHIFT_STARTED` / `SHIFT_ENDED` | | ✓ | | ✓ | ✓ |
| `DRIVER_PAIRED` / `DEVICE_REPLACED` | | | | | ✓ |
| `ORDER_MARKED_DELIVERING` (plattan) | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GEOFENCE_EXIT` ⭐ | ✓✓ | ✓ | ✓ | ✓✓ | ✓ |
| `ORDER_CLAIMED` / `ORDER_UNCLAIMED` | | ✓ | ✓ | | ✓ |
| `TRACKING_LEVEL_CHANGED` | | ✓ | | | |
| `ARRIVED_NEAR_CUSTOMER` | ✓✓ | ✓ | ✓ | ✓ | |
| `DELIVERY_CONFIRMED` (+ källa, avstånd, accuracy) | ✓✓ | ✓ | ✓✓ | ✓✓ | ✓✓ |
| `DELIVERY_UNDONE` | | ✓ | ✓ | ✓ | ✓ |
| `POSITION_GAP` (>8 min) | | | ✓ | ✓ | ✓✓ |
| `LOW_ACCURACY_PERIOD` | | | ✓ | | |
| `DETOUR_STOP_DETECTED` | ✓ | ✓ | | ✓ | |

⭐ `GEOFENCE_EXIT` är det mest värdefulla eventet i hela systemet. `deliveringAt` (plattans knapp) minus `GEOFENCE_EXIT` = **restaurangens "på väg"-fördröjning**. Den enda siffran som direkt förklarar varför era ETA:er slår fel.

### Trust Score — mönster, inte incidenter

Rullande 30 dagar, **minst 20 leveranser** innan någon signal räknas, jämförs som z-score mot stadens median, **flaggas först efter 2 konsekutiva perioder**:

| Mätvärde | Vad det avslöjar |
|---|---|
| P50 av `GEOFENCE_EXIT − deliveringAt` | Restaurangen markerar "på väg" för tidigt |
| Andel `DELIVERY_CONFIRMED` >300 m från kundadress | Slarv eller förhandsmarkering |
| `DELIVERY_UNDONE`-frekvens | Feltryck eller manipulation |
| Andel pass med noll rörelse ("spöktelefon") | Telefonen ligger kvar |
| `AUTO_INFERRED`-andel | Föraren använder inte knappen |
| Faktisk vs utlovad ETA, P75 | Systematisk underskattning |

En enskild avvikelse gör ingenting. Två perioder i rad → intern flagga i admin, inte en automatisk sanktion.

---

## 11. API och realtid

```
POST   /api/terminal/driver-codes            (plattan) → { code, expiresAt }
POST   /api/driver/pair                      { code, deviceId, name } → { token, refreshToken }
POST   /api/driver/refresh
POST   /api/driver/shift/start               { permissionState, consentVersion } → { shiftId, config }
POST   /api/driver/shift/stop
GET    /api/driver/state                     → { mode, geofences[], assignment, candidates[], config }
POST   /api/driver/positions                 { samples: [{at,lat,lng,accuracyM,speedMps,headingDeg}] }
POST   /api/driver/orders/:orderId/claim     → 200 | 409 (redan tagen)
POST   /api/driver/orders/:orderId/release
POST   /api/driver/orders/:orderId/delivered { at, lat?, lng?, accuracyM?, source }
POST   /api/driver/orders/:orderId/undo      (≤5 min)
```

**Socket.IO**

| Rum | Event | Riktning |
|---|---|---|
| `driver:${driverId}` | `driver:mode`, `driver:candidates`, `driver:assignment`, `driver:shift-ended` | → app |
| `restaurant-drivers:${restaurantId}` | `driver:status`, `driver:gap-warning` | → plattan |
| `order:${orderId}` | `order:tracking` `{ level, lat?, lng?, etaCustomerAt }` | → kund |

**Kritisk regel:** kunden får **aldrig** `courier:location` för en self-delivery-order. Den befintliga direktsändningen i `routes/courier.ts:575` broadcastar rått till `order:`-rummet. Förarflödet måste gå genom `order:tracking` med `level`-fältet, annars läcker positionen förbi hela confidence-modellen. Detta är den enskilt viktigaste implementationsdetaljen.

---

## 12. Flera förare och flera ordrar

| Situation | Systemets beteende |
|---|---|
| 1 förare, 1 order | Förvälj automatiskt vid geofence-exit. Föraren bekräftar med ett tryck. Score kan nå 70. |
| 1 förare, flera ordrar samma håll | Alla kopplas till föraren. Ruttordning gissas **inte** — varje order får egen score mot sin egen kund. Den närmaste får `LIVE`, övriga `ETA`. |
| 1 förare, flera ordrar olika håll | Samma sak. Avdraget "närmare annan kund" gör att bara en åt gången når `LIVE`. Kunderna längre bak får en ETA som inkluderar de tidigare stoppen. |
| Förare kör extern order först | Ingen signal — tills det stillastående-avdraget slår. Kunden ser `ETA` hela tiden. Fungerar korrekt genom att göra ingenting. |
| 2 förare, 1 order | Kortet visas för båda. First-wins via atomisk `updateMany` med `where: { restaurantDriverId: null }`. Förloraren får 409 och kortet försvinner. |
| 2 förare, flera ordrar | Varje förare ser bara okopplade ordrar. Listan krymper live via socket. |
| 2 förare lämnar samtidigt | Ingen auto-förval (fler än en kandidat). Båda måste trycka. Detta är rätt beteende. |
| Fel förare kopplad | "Fel order?" → release → kortet blir tillgängligt igen. `ORDER_UNCLAIMED` loggas. Kundens nivå går tillbaka till `ETA` med hysteres-frysning. |
| Förare glömmer avsluta pass | Auto-stopp efter 45 min stillastående i geofencen utan aktiv order, eller 12 h. |
| Telefon kvar i restaurangen | Ingen geofence-exit → aldrig kandidat → aldrig kopplad → aldrig karta. Plattan får `driver:gap-warning` om den är "aktiv men orörlig" >30 min. |
| Byter telefon mitt i passet | Ny parningskod → nytt `deviceId` → gammal shift avslutas `DEVICE_REPLACED`, ny shift ärver aktiv koppling. Gamla telefonens token revokeras direkt. |

---

## 13. Scenariogenomgång

| # | Scenario | App | Backend | Kund | Restaurang | Data | Risk |
|---|---|---|---|---|---|---|---|
| 1 | 1 förare, 1 order | Förval, ett tryck, ACTIVE | Score → LIVE efter ~90 s | Karta | "Anders kör #1042" | Full track | Låg |
| 2 | 1 förare, flera samma håll | Alla kort visas, trycker på båda | Två kopplingar, separata scores | Närmaste: karta. Andra: ETA | Båda listade | Två tracks | Kund 2 undrar varför ingen karta → texten måste vara neutral |
| 3 | 1 förare, flera olika håll | Samma | "närmare annan kund"-avdrag håller nere den bortre | En karta åt gången | Båda listade | Två tracks | ETA för order 2 måste inkludera stopp 1 — annars ljuger vi |
| 4 | Extern order först | Inget särskilt | Stillastående-avdrag −25 | ETA hela tiden, aldrig karta | Ser förarens position (internt) | Detour-event | **Detta är huvudscenariot. Löses av att inte visa kartan.** |
| 5 | 2 förare, 1 order | Kort hos båda | First-wins 409 | Normal | Ser vem som vann | Claim-events | Låg |
| 6 | 2 förare, flera ordrar | Krympande listor | Per-par scoring | Per order | Full översikt | — | Kognitiv last vid >4 samtidiga → begränsa listan till 4 + "visa fler" |
| 7 | 2 lämnar samtidigt | Inget förval | Väntar på tryck | ETA tills tryck | Ser 2 aktiva utan koppling | — | Om ingen trycker: kartan visas aldrig. Acceptabelt. |
| 8 | Fel förare kopplad | "Fel order?" | Release + omkoppling | Nivå → `ETA`, karta fryses 60 s | Ser bytet | Unclaim-event | Kunden kan ha sett fel bil i ~1 min. Hysteresen begränsar skadan. |
| 9 | Levererad av misstag | Ångra-remsa 5 min | Kundpush fördröjd 90 s | Ser oftast ingenting | Ser undo | Undo-event | Efter 90 s: kunden ser fel status kort. Ingen rättelse-push. |
| 10 | Glömmer markera | Notis efter 10 min | Auto-close efter 25 min (`AUTO_INFERRED`) | "Levererad" (utan tid) | Varning på plattan | Flaggad som auto | Auto-tid är opålitlig → exkluderas från statistik |
| 11 | "På väg" medan maten står kvar | Ingen geofence-exit | ETA ankras på exit, inte på knappen | ETA korrekt trots restaurangens tidiga knapp | — | Lead-time mätt | **Fixar tyst ert största ETA-fel** |
| 12 | Telefon kvar i restaurangen | AT_RESTAURANT för evigt | Aldrig kandidat | Bara ETA | Gap-varning efter 30 min | Ghost-shift | Låg — systemet failar tyst åt rätt håll |
| 13 | Inget internet på vägen | Ringbuffer, kö | Batch vid retur, `late=true` | Frysning 60 s → ETA | Gap-varning | Full track efteråt | Sena samples får inte flytta markören |
| 14 | Dålig GPS | Skickar accuracy | −10, hårdgrind >100 m | ETA | — | Low-accuracy-event | Låg |
| 15 | Flerfamiljshus | NEAR_CUSTOMER, knapp primad | Ingen adressprecision krävs | "Föraren är framme" | — | Arrival-event | GPS pekar på fel port → **visa aldrig "vid din dörr"**, bara "vid din adress" |
| 16 | Stannar vid annan adress först | Inget | −25, faller till `ETA` | Kartan försvinner efter 2 utvärderingar | — | Detour-event | Kunden kan hinna se en sväng åt fel håll i ~40 s |
| 17 | Score för låg hela vägen | Normal | Nivå `ETA` | ETA-läge, komplett layout | Full intern karta | Full track | **Måste kännas som en fullständig upplevelse, inte en trasig** |
| 18 | Karta visats, sedan fel håll | Normal | −30, hysteres, frys 60 s | Frusen markör → neutral ETA-vy | — | Level-change-event | Sämsta fallet i systemet. Hysteresen är enda skyddet. |
| 19 | Byter telefon mitt i passet | Ny parning | Shift `DEVICE_REPLACED`, koppling ärvs | Frysning under bytet | Ser bytet | Två shifts, en track | Gammal token måste revokeras direkt |
| 20 | OS dödar appen | iOS: geofence återstartar. Android: FGS + battery-opt-dispens | Gap-detektering | Frysning → ETA | Gap-varning | Gap-event | **iOS force-quit utan region monitoring = totalt tapp. Därför är geofencing obligatorisk.** |

---

## 14. Integritet, juridik och säkerhet

### Rättslig grund — viktig detalj

**Samtycke är fel rättslig grund.** I ett anställningsförhållande är samtycke enligt EDPB inte frivilligt (maktobalans). Rätt grund är **berättigat intresse (art. 6.1.f)** med en dokumenterad intresseavvägning som **restaurangen** gör — restaurangen är personuppgiftsansvarig för sina förare.

**ViaEats är sannolikt personuppgiftsbiträde** för förarnas positionsdata. Det betyder att ert befintliga restaurangavtal behöver ett **biträdesavtal-tillägg** som täcker positionsdata, underbiträden (Railway, Redis-leverantör, R2, OSRM-host) och retention. Detta är en avtalsuppgift, inte en kodupgift — men den måste vara klar innan första skarpa restaurangen. Kolla `docs/avtal/`.

Notera också: kontinuerlig positionsövervakning av anställda kan utlösa **förhandlingsskyldighet enligt MBL** hos kollektivavtalsbunden restaurang. Flagga det för restaurangen; ni ska inte ge juridisk rådgivning, men ni ska inte heller låtsas att frågan inte finns.

### Designprinciper

- Insamling **endast under aktivt pass**. `endedAt` satt = hård stopp i backend, samples avvisas.
- Föraren ser alltid att spårning pågår (iOS blå indikator + Android permanent notis). Detta är inte en bieffekt — bygg inte bort det.
- Onboardingskärm på svenska: vad samlas in, varför, hur länge, hur man avslutar. `consentVersion` sparas på shiften.
- **Positionsdata är aldrig synlig för andra förare.** Restaurangens platta ser aktiva förares position; historik kräver admin.
- Kunden ser aldrig förarens namn, telefon eller historik — bara en prick.

### Retention

| Data | Tid | Motivering |
|---|---|---|
| Rå `DriverPositionSample` | **72 h** | Tvist inom några dygn, felsökning |
| `DeliveryTrack` (förenklad polyline) | **90 dagar** | Tvistlösning, ruttanalys |
| `DeliveryEvent` | **12 mån** | ETA-förbättring, Trust Score |
| Aggregat (distans, tid, exit→leverans) | **24 mån** | Ekonomi och statistik |
| Confidence-serier | Sparas inte. Bara slutlig max + nivåbyten (i `DeliveryEvent`) | Ingen nytta av tidsserien |
| Positioner för ordrar som aldrig kopplades | **24 h** | Ingen legitim långtidsanvändning |

Implementeras med samma batchade TTL-jobb som `cleanupExpiredDeliveryProofs()` i `lib/cleanup.ts`.

### Säkerhet mot manipulation

- Parningskod: 6 siffror, 10 min, engångs, rate-limit per restaurang (befintligt mönster i `terminal.ts`).
- Positionsvalidering: förkasta samples med `speed > 60 m/s`, `accuracy > 500 m`, eller tidsstämpel i framtiden.
- **Klienten är aldrig auktoritet över tid.** `at` från appen accepteras men clampas till serverns fönster; `DELIVERY_CONFIRMED` får serverns tid som sanning.
- Mock-location-detektering: `Position.isMocked` (Android) loggas som event, blockerar inte — men flaggar mönster i Trust Score.
- Levererad-tryck >1 km från kundadressen → tillåts (nätet kan vara dött, adressen kan vara fel) men loggas och räknas i Trust Score.

---

## 15. Kostnad och prestanda

Antag 20 self-delivery-restauranger, 2 förare styck, 5 h pass/dag.

| Post | Volym | Kommentar |
|---|---|---|
| Positionsanrop | ~12 000 req/dag | Batchade 4 samples/request. Försumbart mot befintlig trafik. |
| Redis-skrivningar | ~48 000/dag | Samma Lua-skript som kurirerna |
| PG-flush | ~1 200/dag | Claim-mekanismen begränsar till 1/60 s/förare |
| Rå samples lagrade | ~48 000 rader/dag, ~9 MB rullande 72 h | Trivialt |
| OSRM-anrop | ~1 per orderkoppling ≈ 400/dag | **Endast om ruttcachen respekteras.** Per-ping OSRM = 48 000/dag = kostnadsfällan |
| Confidence-beräkning | O(förare × öppna ordrar) per ping, båda ≤5 | <1 ms, ren geometri efter ruttcache |
| Socket-events | ~2× positionsvolymen | Redis-adaptern finns redan |

Slutsats: **kostnaden är inte en begränsning.** Batteriet och iOS-bakgrundsbeteendet är de verkliga begränsningarna.

---

## 16. MVP-plan

### Fas 0 — experiment innan slutgiltigt beslut (1 vecka)

Dessa fyra måste göras innan ni committar till fas 2. De kan spräcka planen.

1. **iOS bakgrundstest, verklig förare, verkligt pass.** Mät andel förväntade pings som faktiskt kommer in när appen är (a) i bakgrunden, (b) i bakgrunden med Google Maps i förgrunden, (c) force-quittad med region monitoring, (d) i Låg energiförbrukning. **Om (c) inte återstartar appen pålitligt faller hela iOS-resiliensen.**
2. **Live Activity + App Intent-spike.** Kan "Levererad" tryckas från låsskärmen med appen dödad, och når anropet backend? En dags arbete, avgör hela iOS-UX:en.
3. **Android OEM-test på de telefoner förarna faktiskt har** — inte er Pixel. Xiaomi och Samsung med aggressiv batterisparning, 6 h pass. Mät hur ofta servicen dödas.
4. **Batterimätning per läge** på en 3 år gammal telefon.

### Fas 1 — MVP (~33 dagsverken, 6–7 v en utvecklare / ~4 v två)

| Del | Dagar |
|---|---|
| Prisma-modeller + migration (**manuellt SQL i prod** — `migrate deploy` är förbjudet) | 1,5 |
| Driver-auth + parning (kopiera `terminal/pair`) | 2 |
| Plattan: generera kod, förarlista, aktiva pass | 3 |
| Flutter-skal (återanvänd `Delivera courier`) | 5 |
| GPS-lägesmotor + batchuppladdning + offline-kö | 5 |
| Android FGS + notis-actionknapp (Kotlin) | 3 |
| Backend: ingest, Redis-keyspace, kopplingslogik | 5 |
| Levererad/ångra + fördröjd kundpush | 3 |
| Kundens ärliga statustexter (**ingen karta**) | 3 |
| Admin: eventtidslinje | 3 |

**Kunden får ingen karta i fas 1.** Kunden får en ETA som för första gången bygger på sanningen.

### Fas 2 — Livekarta (~21 dagsverken)

Confidence score (5) · nivå-gating + hysteres i kund-UI (3) · iOS Live Activity + App Intent (8) · region monitoring native (3) · konfig-UI i admin över `EngineSetting` (2).

### Fas 3 — Analys

Trust Score-aggregat, per-zon-ETA-återmatning till `restaurantZoneEta.ts`, automatiskt leveransförslag, gap-varningar till plattan.

### Om maskininlärning — ärligt

**Skjut upp det länge.** En enskild restaurang genererar ~50 leveranser/dag. Ni behöver tusentals per geografiskt område innan en modell slår en median. Och det som mest förbättrar ETA är inte en modell utan **historiska medianer per zon och tid på dygnet** — vilket `restaurantZoneEta.ts` redan gör och som blir dramatiskt bättre bara av att få sanna `GEOFENCE_EXIT`-tidsstämplar.

Realistisk ML-kandidat om 12–18 månader: gradient boosting som förutspår `exit → delivered` från (zon, tid, väder, antal stopp, förare). Inte en djupinlärningsmodell. Inte confidence-scoren — den ska förbli förklarbar, eftersom ni måste kunna svara på "varför såg kunden ingen karta".

---

## 17. Testplan

**Fältscenarier (måste köras med riktig bil, inte simulator):**

1. Rak leverans 3 km — verifiera att `LIVE` nås inom 2 min och aldrig tappas.
2. Leverans där enda vägen börjar 400 m åt fel håll (bro/enkelriktat) — **får inte** falla ur `LIVE`.
3. Extern order först, 1,5 km åt motsatt håll, 4 min stopp — **får inte** nå `LIVE` för ViaEats-ordern.
4. Två förare lämnar inom 30 s, två ordrar — verifiera att fel koppling är omöjlig utan tryck.
5. Flygplansläge från geofence-exit till 200 m från kund — verifiera att kön töms, `late=true` sätts, och att markören inte hoppar bakåt.
6. Force-quit av iOS-appen mitt i leveransen — verifiera att kundgeofencen återstartar appen.
7. Levererad-tryck från låsskärmen med dödad app.
8. Ångra 4 min efter tryck, verifiera att kunden inte fick push.
9. Telefon i restaurangen hela passet — verifiera att ingen karta någonsin visas och att plattan varnar.
10. Flerfamiljshus, GPS-avvikelse 40 m — verifiera texten "vid din adress", inte "vid din dörr".

**Enhetstestbart utan bil:** confidence-scoren ska ta en array av samples och returnera nivå — hela regelmotorn ska vara en ren funktion med inspelade GPS-spår som fixtures. Spela in verkliga spår i fas 1 och använd dem som testdata i fas 2. Det är den enskilt mest värdefulla testinvesteringen.

---

## 18. Slutrekommendation

### Bygg nu
- Parning, pass, en-tryck-koppling, stor Levererad-knapp med ångra.
- `GEOFENCE_EXIT` som ETA-ankare istället för plattans knapp.
- Adaptiva GPS-lägen, backend-konfigurerbara.
- Batchad positionsingest + offline-kö.
- Android foreground-service med actionknapp.
- Eventlogg och admin-tidslinje.
- Kundvyn i `ETA`-läge — komplett och lugn, utan karta.

### Skjut upp
- Confidence score och livekarta till kund (fas 2, efter att ni har verkliga GPS-spår att testa mot).
- iOS Live Activity med interaktiv knapp (fas 2 — men gör spiken nu).
- Trust Score-aggregering (fas 3).
- Automatiskt leveransförslag (fas 3).

### Bygg inte
- **Android-overlay.** Notis-actionknapp gör samma sak utan friktion.
- **Automatisk leveransstängning** som mätdata. Bara som flaggad datahygien.
- **Automatisk order-till-förare-matchning utan bekräftelse.** Informationen finns inte i datan.
- **Maskininlärning** i confidence-scoren. Den måste vara förklarbar.
- **Apple Shortcuts som beroende komponent.** App Intents ja, automationer som arkitektur nej.
- **Hold-to-confirm** — det kan inte finnas där knappen faktiskt används.

### Experiment som måste göras före slutligt beslut
1. iOS force-quit + region monitoring-återstart, verkligt pass.
2. Live Activity App Intent → backend med dödad app.
3. Android OEM-överlevnad på förarnas riktiga telefoner, 6 h.
4. Batteri per läge på gammal hårdvara.

Faller experiment 1 eller 3 ska ni **inte** bygga livekartan alls — då blir datan för hålig för att kunna visas ärligt, och hela värdet ligger i tidsstämplarna. Vilket, som sagt, är där det mesta av värdet ligger ändå.

---

## 19. Enklaste lösningen per problem

Det här avsnittet ersätter delar av §2, §5 och §12 ovan. Efter att ha tittat närmare på plattans kod finns en enklare lösning på matchningsproblemet än den jag först föreslog.

### P1 — Order-till-förare-matchning

**Enklaste lösningen: plattan kopplar föraren, inte förarappen.**

Personen som lämnar över matkassen *vet redan* vem som kör. Den personen står redan med fingret på plattan och trycker "Markera på väg". Så lägg valet där.

- **En förare på pass → noll frågor.** Backend kopplar automatiskt vid `DELIVERING`. Inget tryck någonstans.
- **Flera förare på pass →** knappen "Markera på väg" öppnar en enkel lista: `[Anders] [Sara]`. Ett tryck. Ordern kopplas.

Förarens telefon behöver **inte interageras med alls** för att koppling ska ske. Det var ju hela målet.

Ändringen i plattan är liten och lokaliserad — [order_card.dart:644](mobile_apps/Delivera%20flutter%20business/lib/widgets/order_card.dart:644) och `advanceNextStatus()` i [order_provider.dart:122](mobile_apps/Delivera%20flutter%20business/lib/providers/order_provider.dart:122) är de enda ställen där `DELIVERING` sätts. `onAdvance('DELIVERING')` blir `onAdvance('DELIVERING', driverId)`.

Detta tar bort från förarappen: kandidatlista, socket-driven krympande lista, first-wins-race, 409-hantering. Kvar i appen blir bara **"Fel order?"** som korrigering.

Backend-regel: `DELIVERING` utan `driverId` är fortfarande tillåtet (restaurang utan förarappen, eller föraren hann inte starta pass) — då finns ingen koppling, ingen karta, bara ETA. Systemet degraderar tyst.

### P2 — Confidence score

**Enklaste lösningen: bygg inte en score. Bygg fem booleaner.**

```ts
// lib/deliveryTracking.ts — hela "modellen" i MVP+
export function trackingLevel(s: TrackingInput): 'NONE' | 'ETA' | 'LIVE' {
  if (!s.driverId) return 'ETA';
  if (!s.leftRestaurantAt) return 'ETA';
  if (s.positionAgeSec > 90) return 'ETA';
  if (s.accuracyM > 100) return 'ETA';
  if (s.stoppedFarFromCustomerSec > 90) return 'ETA';   // annan leverans
  if (!s.distanceDecreasedOverLast3) return 'ETA';
  return 'LIVE';
}
```

Ingen viktning, inga trösklar att tuna, inget att förklara. Plus hysteres (2 utvärderingar i rad i båda riktningarna) — det är obligatoriskt oavsett modell.

Den viktade 0–100-scoren i §6 är inte fel, den är **för tidig**. Ni kan inte tuna vikter utan verkliga GPS-spår. Spela in spår i fas 1, bygg scoren i fas 2 mot dem som fixtures. Booleanerna ovan är dessutom exakt de hårda grindarna i §6 — ingenting kastas bort.

### P3 — Geofence-utgång som ETA-ankare

**Enklaste lösningen: ingen geofence. En avståndskontroll på servern.**

Native region monitoring behövs inte för det här. Det behövs bara för iOS-resiliens (P6), vilket är ett separat problem.

```ts
// i POST /api/driver/positions, per sample
if (!shift.leftRestaurantAt && haversineM(sample, restaurant) > 150) {
  await markLeftRestaurant(shift.id, sample.at);   // + DeliveryEvent
}
```

Fem rader. `Restaurant.latitude/longitude` finns redan. Sedan ankras kundens ETA på `leftRestaurantAt` när det finns, annars på `deliveringAt` som idag. Det är hela grejen — och det är den mest värdefulla raden kod i hela projektet.

### P4 — Android-knappen

**Enklaste lösningen: ingen Kotlin alls.**

`flutter_local_notifications: ^19.5.0` finns redan i [pubspec.yaml](mobile_apps/Delivera%20courier/pubspec.yaml) och stöder både actionknappar och `onDidReceiveBackgroundNotificationResponse` (bakgrundsisolat — appen behöver inte vara öppen).

- `geolocator`s inbyggda `foregroundNotificationConfig` (finns redan i [location_service.dart:68](mobile_apps/Delivera%20courier/lib/core/location_service.dart:68)) håller servicen och behörigheten vid liv. Texten blir "Position delas".
- När en order kopplas: posta **en** ongoing-notis via `flutter_local_notifications` med action `LEVERERAD`, i samma notifikationsgrupp så Android kollapsar dem visuellt.
- Callback i bakgrundsisolat → läs token från `flutter_secure_storage` → POST. Appen öppnas aldrig.

Två notiser under aktiv leverans är kosmetiskt lite fult men noll native kod och noll extra behörighet. Ta det.

### P5 — Skydd mot feltryck utan hold-to-confirm

**Enklaste lösningen: knappen existerar bara när den kan vara rätt.**

Närhetsgrindning ersätter hold-to-confirm helt:

1. Notisen/LA:n har **ingen** Levererad-knapp förrän föraren är <150 m från kunden. Ett fickklick 3 km bort är fysiskt omöjligt eftersom knappen inte finns.
2. Enkeltryck. Ordern blir `DELIVERED` internt direkt (rätt tidsstämpel).
3. **Kundens push fördröjs 90 s.** Mönstret finns redan — `Order.deliveringAt` har samma fördröjda visning. De flesta feltryck når aldrig kunden.
4. 5 min ångra i appen, med kundnamn + gata så rätt order återställs.
5. Hold-to-confirm finns **bara** inuti appen, som den enda vägen att trycka Levererad när föraren är >150 m bort (dött nät, fel adress, kunden möter upp på gatan).

Tre lager, noll gester i notisen.

### P6 — iOS force-quit

**Enklaste lösningen: gör det till ett icke-problem i MVP genom sekvensering.**

Bakgrundspositionen behövs bara till livekartan. MVP har ingen livekarta. Alltså:

| Vad som händer vid force-quit i MVP | Konsekvens |
|---|---|
| Positionsströmmen dör | Ingen karta att tappa. Kunden ser ETA, som förut. |
| `leftRestaurantAt` kanske inte sätts | ETA faller tillbaka på `deliveringAt` — dagens beteende. Inget blir sämre. |
| Levererad-knappen | Föraren öppnar appen och trycker. Fungerar alltid. |
| Backend | Upptäcker glapp >8 min → varning på plattan: *"Anders telefon slutade rapportera."* Restaurangen frågar honom fysiskt. |

Ingen native kod i MVP. **Region monitoring blir en förutsättning för fas 2**, inte för fas 1 — och då räcker en ~60 raders Swift-shim bakom en MethodChannel som registrerar exakt en region (restaurangen). Inget geofence-ramverk.

### P7 — Android-behörigheten

**Enklaste lösningen: en regel, kodifierad i en kommentar.**

> Positionsspårning startas **endast** från en synlig activity, dvs. från förarens tryck på "Starta pass". Aldrig från en push, aldrig från `BOOT_COMPLETED`, aldrig från ett bakgrundsisolat.

Håller ni den regeln räcker `ACCESS_FINE_LOCATION` och ni slipper Play Consoles bakgrundspositions-deklaration. Bryter ni den en enda gång kraschar servicen med `SecurityException` i produktion på Android 12+ — så skriv regeln i `location_service.dart` och i PR-checklistan.

### Reviderad MVP-omfattning

Förenklingarna tar bort ~6 dagsverken och gör förarappen nästan interaktionsfri:

| Ändring | Effekt |
|---|---|
| Plattan kopplar förare (P1) | −2 d, och förarappen tappar sin mest komplexa skärm |
| Booleaner istället för score (P2) | Flyttar 5 d till fas 2 |
| Serversidig avståndskontroll (P3) | −1 d |
| Inget Kotlin (P4) | −3 d |
| Ingen native Swift i MVP (P6) | Redan utanför fas 1 |

**MVP ≈ 27 dagsverken.** Förarappen består av tre skärmar där föraren i normalfallet trycker **två gånger per pass**: "Starta pass" och "Levererad".

---

## 20. Zonmodellen — geometrisk analys för Lund

Detta avsnitt **ersätter §6 (confidence score)** som primär modell. Den viktade scoren blir ett komplement, inte grunden.

### Vad som redan finns

Zone-editorn i [zone-editor.tsx](apps/admin/src/modules/zones/components/zone-editor.tsx) ritar redan **både cirklar och polygoner**:

```ts
// apps/admin/src/modules/zones/api.ts:6
type: "circle" | "polygon";
radiusKm?: number;
polygon?: [number, number][];
```

Lagring finns i `Restaurant.deliveryZones` (per restaurang) och `City.zones` + `City.polygon` (per stad). **Ingen ny geometri-infrastruktur behövs.**

### Räkningen: varför fasta sektorer inte fungerar

En sektor med total öppningsvinkel α har vid avstånd d bågbredden

```
w = 2 · d · sin(α/2)
```

Lunds stadsdelar är 1,0–1,4 km breda. Sätt målet w = 1,2 km och lös ut α per avstånd:

| Stadsdel | Avstånd från centrum | Krävd α |
|---|---|---|
| Norra Fäladen | 1,8 km | ~42° |
| Klostergården | 1,7 km | ~45° |
| Mårtens Fälad | 2,3 km | ~30° |
| Nöbbelöv | 2,4 km | ~29° |
| Värpinge | 2,4 km | ~29° |
| Linero | 2,7 km | ~26° |
| Stora Råby | 3,2 km | ~22° |
| Brunnshög | 3,4 km | ~20° |

**Kvoten mellan största och minsta krävda vinkel är 2,25×.** Det betyder att ingen konstant α fungerar:

- α = 45° (rätt för Norra Fäladen) ger vid Brunnshög `6,8 · sin(22,5°) = 2,60 km` båge — sektorn täcker Brunnshög **plus** halva Norra Fäladen **plus** delar av Mårtens Fälad. Värdelös som diskriminator.
- α = 20° (rätt för Brunnshög) ger vid Norra Fäladen `3,0 · sin(10°) = 0,52 km` båge — täcker 40 % av stadsdelen. Massor av falska negativ.

**Slutsats: den korrekta formen smalnar av med avståndet — det är inte en sektor, det är en polygon.** Polygonerna i din skärmdump är alltså redan den matematiskt riktiga versionen av sektoridén. Bygg inte sektorlogik; använd polygonerna.

Antal zoner: 360° / 35° (medianvinkeln) ≈ **10 zoner för Lund.** Du har 7 ritade. Lägg till Centrum (inner), Kobjer/Väster och eventuellt dela Brunnshög/Science Village → 10. Det stämmer med geometrin.

### Innercirkeln — radie och konsekvens

Två oberoende kriterier landar på samma tal:

1. **Commitment.** Lunds inre ringled (Ringvägen / Bredgatan / Kävlingevägen / Tornavägen) ligger 0,7–0,9 km från centrum. Innan föraren lämnat ringen kan hon fortfarande köra vart som helst. Riktningen blir entydig först vid **1,0–1,3 km**.
2. **Nytta.** Effektiv hastighet i Lund city är ~20 km/h (ljus, 30/40-zoner). 1,2 km ≈ **3,5 min**. En karta med under 4 minuter kvar tillför ingenting.

**Rekommendation: 1,5 km vägavstånd** (fågelvägen 1,2 km × Lunds detour-faktor ~1,3 för korta stadsresor). Använd vägavstånd eftersom OSRM-anropet redan görs för ETA:n.

**Konsekvens du bör veta:** för en centrumrestaurang faller uppskattningsvis **35–45 % av ordrarna inom innercirkeln** — Centrum, Nöden, Väster, norra Klostergården, södra Norra Fäladen. Det är Lunds tätaste och mest studenttäta område, och matleveransvolymen skevar ännu mer centralt än befolkningen.

Nästan hälften av ordrarna får alltså aldrig en karta. Det är acceptabelt — de är 5–7-minutersleveranser — men det är ett argument för att kartan är en minoritetsfunktion och ska prioriteras därefter.

### Den verkliga bristen: transitkorridorer

Här håller inte 99 %. Zoner nära staden är **genomfartsled** för zoner bortom dem:

| Zon | Är transit för | Väg |
|---|---|---|
| Norra Fäladen (grön) | Brunnshög (cyan) | Norra Ringen / Sölvegatan–Tornavägen |
| Mårtens Fälad (cyan syd) | Linero, Stora Råby (lila) | Dalbyvägen / Sandbyvägen |
| Klostergården (röd) | St Lars, Bergströmshusen | Höjeågatan / Malmövägen |
| Nöbbelöv (rosa) | Vallkärra | Vallkärravägen |

**4 av 7 ritade zoner är transit för något.** Testet "föraren är i zon Z → levererar i Z" ger därför falska positiv: en förare på väg till Brunnshög befinner sig i Norra Fäladen-zonen i 2–3 minuter.

### Fixen: commit-polygoner, förberäknade med OSRM

Detta är där OSRM faktiskt gör nytta — **vid förberäkning, inte vid körning.**

Per restaurang R, kör en gång (och vid varje zonändring):

```
1. D = { centroid för varje zon } ∪ { 8 kompasspunkter på 6 km }   // ~15 punkter
2. För varje d i D: hämta OSRM-rutt R → d.                          // 15 anrop TOTALT
3. C = union av alla ruttgeometrier, buffrade 70 m.                  // transitkorridorer
4. För varje zon Z:  commitPolygon(Z) = Z \ C
5. Om area(commitPolygon(Z)) < 20 % av area(Z)
      → markera zonen "ingen livekarta" (ren transitzon)
```

Kostnad: **15 OSRM-anrop per restaurang, en gång.** Inte per order, inte per ping.

Körtidstestet blir därefter:

```ts
if (pointInPolygon(driverPos, commitPolygon[customerZone])) level = 'LIVE';
```

**En point-in-polygon. Noll OSRM. Noll latens** — kartan tänds på första fixen inuti polygonen, istället för att vänta på tre minskande mätpunkter som §19 krävde. Det är strikt bättre än både §6 och §19.

Behåll bara ett avdrag från §6: **stillastående >90 s utanför kundens commit-polygon → tillbaka till `ETA`.** Det fångar den externa leveransen.

### Ärlig träffsäkerhet: 93–95 %, inte 99 %

Kombinerat med att **plattan kopplar föraren** (§19 P1) gör zonmodellen inte längre *identifiering* utan *verifiering* — ett mycket lättare jobb. Därför:

| Felkälla | Frekvens | Effekt |
|---|---|---|
| Geometriskt falskt positiv (transit) | ~0 % efter commit-polygoner | — |
| Fel förare kopplad | ~0 % — plattan vet | — |
| **Föraren bär vår order + en extern order till samma zon, levererar den externa först** | **~5–7 %** | Kunden ser ett extra stopp 200–500 m bort |
| Kunden bor i ren transitzon | ~3 % av ordrarna | Ingen karta, bara ETA |

De ~5–7 % är **inte** det katastrofala fallet. Kunden ser aldrig föraren köra *bort* från sig — bara ett kort extra stopp i samma stadsdel. Kvalitativt en helt annan sak än "maten körs runt".

**Varför inte 99 %:** för att komma dit måste du veta om den externa ordern. Den informationen finns inte i din data, och ingen geometri skapar den. 99 % är inte en modelleringsfråga, det är en informationsfråga.

### Den billiga vägen till ~98 %

Plattan vet redan vem som kör. Låt den också veta *om det finns mer i bilen*:

> Förarväljaren får en valfri kryssruta: **"Kör även annan leverans"**

Ett tryck av restaurangpersonalen — samma person, samma skärm, samma sekund. Är den kryssad: håll `trackingLevel = ETA` fram till det **första** stillaståendet >60 s, släpp sedan `LIVE` när föraren rör sig igen mot commit-polygonen.

Det tar residualen från ~6 % till ~2 % för priset av en checkbox. Bygg den i samma PR som förarväljaren.

### Datamodell — var geometrin ska bo

| Data | Var | Varför |
|---|---|---|
| Innercirkel (radie, km) | `Restaurant.deliveryZones`, `type: "circle"` | Måste centreras på **restaurangen**, inte staden. Skärmdumpens cirklar funkar för en centrumrestaurang men inte för en i Gunnesbo. |
| Stadsdelspolygoner | `City.zones`, `type: "polygon"` | Delas mellan alla restauranger i Lund. Duplicera dem inte per restaurang. |
| Commit-polygoner | Ny tabell `RestaurantZoneCommit` (restaurantId, cityZoneId, polygon, computedAt) | Beror på både restaurang **och** zon. Förberäknad cache, invalideras vid zonändring eller adressändring. |

Existerande `normalizeDeliveryZones()` i [cities.ts:254](packages/api/src/routes/cities.ts:254) validerar redan formen.

### Vad detta gör med planen

- §6:s viktade 0–100-score **behövs inte längre som primär modell.** Den blir ett komplement för zoner där commit-polygonen är för liten, och för restauranger utan ritade zoner.
- Fas 2 blir billigare: ingen vikttuning, ingen inspelningsbaserad kalibrering. Ersätts av ett förberäkningsjobb (~3 dagsverken) + point-in-polygon (~0,5 d) + admin-vy som visar commit-polygonerna på kartan (~2 d).
- **Zonritningen är en driftuppgift, inte en utvecklingsuppgift.** Verktyget finns. Någon ritar 10 polygoner för Lund på en eftermiddag.

---

## 21. Empiriska OSRM-resultat för Lund

Beräknat 2026-07-25 mot OSRM (bilprofil, OSM-data) från en restaurang på Bytaregatan i centrala Lund. 72 bäringar × 16 radier = 1 152 ruttavstånd, 72 fulla ruttgeometrier, 12 fjärrutter. Visualisering: [lund-tracking-zones.html](docs/lund-tracking-zones.html). Skript: `scratchpad/lund-v4.mjs`.

### Detta korrigerar §20

| §20 antog | Mätningen visar |
|---|---|
| Innerzon ≈ 1,2 km fågelvägen / 1,5 km väg | **1 500 m vägavstånd = 250–1 000 m fågelvägen, ≥4× variation** beroende på riktning |
| Detour-faktor ~1,3× | **1,37–1,59×** (P25–P50) |
| ~10 sektorer | **13 sektorer** i säkraste läget, 7–9 i balanserat |
| Commit-polygoner ger karta större delen av resan | **Kartan syns i snitt bara 32 % av resan, och bara för 57 % av leveransytan** |

### Huvudresultatet: sektorantal och commit-avstånd är samma parameter

Det finns ingen inställning som ger både smala (informativa) sektorer och tidig karta. Det är en Pareto-kurva:

| T (m delad väg) | Sektorer | Bredd | Commit | Yta m. karta | Tripp m. karta | Båge/stadsdel |
|---|---|---|---|---|---|---|
| 600 | 3 | 75–160° | 1 500 m | 85 % | 47 % | 2,78 |
| 1 000–1 500 | 5 | 30–125° | 1 500 m | 85 % | 47 % | 2,10 |
| 1 800 | 7 | 30–85° | 1 670 m | 81 % | 43 % | 1,49 |
| 2 400 | 9 | 20–65° | 1 846 m | 77 % | 40 % | 1,32 |
| 2 800 | 12 | 15–50° | 2 661 m | 64 % | 35 % | 1,15 |
| **3 200** | **13** | **15–40°** | **2 760 m** | **57 %** | **32 %** | **1,12** |

`T` = hur långt två rutter måste dela väg för att räknas som samma utfartskorridor. `Båge/stadsdel` = sektorns bredd vid kundens avstånd delat med en Lund-stadsdels bredd (1 200 m); över 1,0 betyder att sektorn rymmer mer än en stadsdel — då vet vi inte vilken.

**Ingen inställning når båge/stadsdel < 1,0 med en användbar sektorindelning.** Lund är för litet och för radiellt. Att pressa under 1,0 kräver 20+ sektorer, där de smalaste blir 5–10° breda = 260–520 m vid 3 km. Det är smalare än ett kvarter, alltså inom GPS-felmarginalen — sektorn skulle flippa av bruset. Det är överanpassning, inte precision.

### Rekommenderad indelning: 13 sektorer, T = 3 200 m

| Sektor | Bäring | Bredd | Commit | Bredd @3 km |
|---|---|---|---|---|
| S0 | 0–30° | 35° | 3 265 m | 1 804 m |
| S1 | 35–45° | 15° | 2 661 m | 783 m |
| S2 | 50–75° | 30° | 2 665 m | 1 553 m |
| S3 | 80–95° | 20° | 2 552 m | 1 042 m |
| S4 | 100–130° | 35° | 2 274 m | 1 804 m |
| S5 | 135–155° | 25° | 3 163 m | 1 299 m |
| S6 | 160–175° | 20° | 3 163 m | 1 042 m |
| S7 | 180–205° | 30° | 3 141 m | 1 553 m |
| S8 | 210–220° | 15° | 2 760 m | 783 m |
| S9 | 225–240° | 20° | 3 246 m | 1 042 m |
| S10 | 245–280° | 40° | 1 665 m | 2 052 m |
| S11 | 285–315° | 35° | 2 916 m | 1 804 m |
| S12 | 320–355° | 40° | 1 500 m | 2 052 m |

Commit-avstånd varierar **1 500–3 265 m** mellan sektorer. Det är inte en radie — det är en egenskap hos varje utfartsled. S12 (NNV, mot Nöbbelöv/Gunnesbo) är låst redan vid innerzonens kant; S0 (N) och S9 (SV) kräver över 3 km innan föraren är entydigt låst.

### Metodfel jag hittade under beräkningen

Dokumenterade så de inte upprepas:

1. **Korridorklustring vid fast avstånd (1 300 m) gav falskt få korridorer** — vid 1 300 m från centrala Lund har vägnätet inte grenat sig än. Rätt mått är **gemensam ruttprefix**, inte position vid ett godtyckligt avstånd.
2. **Närhetstest ("sista punkt inom 70 m av annan rutt") fastnade på parallellgator** och sköt commit-avståndet till 4 000–4 600 m. Rätt mått är **första divergensen**, inte sista närheten.
3. **Fjärrutter (8 km ut) förorenade commit-beräkningen** — de modellerar genomfart ut ur staden, vilket en pizzeriaförare inte gör. Uteslutna.
4. **Sektorer under 15° är artefakter av bäringsupplösningen**, inte verklig vägstruktur. Slås ihop med grannen.
5. **Commit måste klampas till innerzonen.** Utan klampning fick S12 commit 1 408 m, alltså innanför den zon som per definition inte har tracking — kartan skulle tänts i no-track-området.

### Konsekvens för planen

Detta **stärker** slutsatsen i §16 och §18. Med en rigorös vägbaserad modell:

- Bara **57 % av leveransytan** kan någonsin få livekarta — och ytan är inte order-viktad. Centrala Lund är stadens tätaste område, så **order-viktat är siffran betydligt lägre** (uppskattat 30–40 % av ordrarna).
- Kartan syns i snitt under **32 % av resan**.
- Alltså: för en centrumrestaurang i Lund gäller livekartan ungefär **en tredjedel av ordrarna, under en tredjedel av resan**. Ungefär 10 % av den totala leveranstiden i systemet.

Bygg ETA-läget ordentligt. Kartan är garnering.

### Vad som måste göras per restaurang

~85 OSRM-anrop, en gång, vid onboarding eller adressändring:
- 13 `/table`-anrop (1 152 rutnätspunkter i chunkar om 90)
- 72 `/route`-anrop för ruttgeometrier

Er egen OSRM (`tools/osrm`, Skåne-data, `--max-table-size 200`) klarar detta på några sekunder. Resultatet cachas i `RestaurantZoneCommit`. **Noll OSRM vid körning** — runtime är en point-in-polygon.

---

## 22. Är modellen optimal? Två testade förbättringar som föll

Jag testade två hypoteser för att förbättra §21-modellen. **Båda gjorde det sämre.** Dokumenterade här så de inte provas igen.

### Hypotes 1: per-order commit istället för per-sektor — FÖLL

Idén: istället för ett commit-avstånd per sektor, räkna det per order på kundens **egen** rutt (som ändå hämtas för ETA). Definition: sista punkten där en rutt mot en adress >800 m från kunden fortfarande delar väg.

Testat på 14 destinationer runt Lund:

| Modell | Snitt täckning av resan | Får karta alls |
|---|---|---|
| Per sektor | **42 %** | 12/14 |
| Per order | 22 % | 10/14 |

**Varför den föll:** om vägen fortsätter förbi kundens dörr till andra adresser är föraren inte låst till *kunden* förrän hon i praktiken är framme. Exempel: Klostergården på 3 441 m väg — rutten mot en adress 3 948 m ut delar väg ända till 3 553 m, alltså **förbi kunden**. Per-order commit blir 3 553 m → aldrig karta.

**Vad det egentligen visar:** de två modellerna svarar på olika frågor.
- Per sektor: *"är föraren låst till rätt del av staden?"* → 42 % täckning, men kilen är 780–2 050 m bred vid 3 km, alltså flera adresser.
- Per order: *"är föraren låst till exakt denna adress?"* → nära visshet, men tänds först i sista femtedelen av resan.

Address-level visshet är **överkonstruktion**. Kilen är den rätta garantin för en livekarta: den utesluter att kunden ser föraren köra åt fel håll, vilket var hela poängen. Kräv inte mer.

### Hypotes 2: mindre leveransområde ger tidigare commit — FÖLL

Idén: de långa södra commit-avstånden orsakas av referensdestinationer 3 900–5 000 m ut som ligger utanför bebyggt Lund (fält, Höje å, Hjärup-hållet). Kapa leveransområdet → commit borde falla.

| Leveransgräns | Sektorer | Commit median | Södra commit | Yta m. karta | Tripp m. karta |
|---|---|---|---|---|---|
| 2 500 m | 9 | 1 846 m | 2 022 m | 47 % | 16 % |
| 3 000 m | 12 | 2 552 m | 2 732 m | 42 % | 20 % |
| 3 500 m | 13 | 2 760 m | 3 163 m | 35 % | 23 % |
| 4 000 m | 13 | 2 760 m | 3 163 m | 45 % | 24 % |
| **5 000 m** | **13** | **2 760 m** | **3 163 m** | **57 %** | **32 %** |

**Södra commit rörde sig inte alls** (3 163 m i båda fallen). Tvetydigheten är intern i bebyggt Lund, inte orsakad av fjärrdestinationer.

Och **mindre område gör det sämre**, inte säkrare: commit-avståndet sätts av vägnätet och flyttar sig inte, så en mindre yta betyder bara att fler kunder hamnar innanför det. Täckningen faller 57 % → 35 %.

### Svaret på "större, mindre, färre eller fler?"

| Ändring | Effekt |
|---|---|
| **Färre/bredare sektorer** | Mer täckning (3 sektorer → 85 % av ytan) men båge/stadsdel 2,78 — kilen rymmer 2–3 stadsdelar, så kartan säger inte längre att föraren kör mot *ditt* område |
| **Fler/smalare sektorer** | Säkrare till 15°. Under det blir sektorn 260–520 m bred vid 3 km — inom GPS-brusets marginal, sektorn flippar av slumpen |
| **Större leveransområde** | Kontraintuitivt **bättre** täckning, oförändrad säkerhet |
| **Mindre leveransområde** | Sämre på alla mått |

**13 sektorer vid 5 km är det bästa tillgängliga** — och inte för att jag tunade väl, utan för att Lunds vägnät sätter gränsen. Den går inte att optimera bort.

### Varför södra Lund är streckat

Streckat = **identifieringsband**: vi vet vilken utfartsled föraren tog, men inte vart hon ska. Där visas ETA, aldrig karta.

Södra Lund är nästan helt streckat för att **alla sydliga rutter delar en enda vägkorridor i 3 043 m** och skiljs vid en enda punkt:

```
55.69087, 13.18646   —  1 691 m fågelvägen, 3 043 m via väg (detour 1,8×)
```

Bäring 150°, 165° och 180° följer samma väg hela sträckan dit. Fram till den punkten är Klostergården, S:t Lars, Stora Råby och allt söder därom **omöjliga att skilja på**. Jämför västerut: bäring 340° och 285° skiljs redan efter 790 m.

Detta är inte en modellbrist — det är Lunds vägstruktur. Södra Lund har en vägrygg utan parallellalternativ.

### Den verkligt användbara slutsatsen: sektorerna är inte likvärdiga

Commit-avståndet varierar **2,2×** mellan sektorer (1 500–3 265 m). Att köra en uniform regel slösar bort den skillnaden. Per sektor, andel av dess egna kunder som kan få karta och under hur stor del av resan:

| Sektor | Riktning (bäringshärledd) | Bredd | Commit | Egna kunder m. karta | Av resan | Omdöme |
|---|---|---|---|---|---|---|
| S12 | NNV — Nöbbelöv | 40° | 1 500 m | 78 % | 49 % | **Karta fungerar bra** |
| S10 | V — Värpinge/Kobjer | 40° | 1 665 m | 78 % | 43 % | **Karta fungerar bra** |
| S4 | OSO — Linero/Vipeholm | 35° | 2 274 m | 76 % | 34 % | Karta sent i resan |
| S3 | O — Mårtens Fälad | 20° | 2 552 m | 46 % | 29 % | Karta sent i resan |
| S2 | NO — Brunnshög | 30° | 2 665 m | 60 % | 28 % | Karta sent i resan |
| S1 | NNO | 15° | 2 661 m | 39 % | 25 % | Endast ETA |
| S11 | VNV — Gunnesbo | 35° | 2 916 m | 48 % | 22 % | Endast ETA |
| S6 | SSO | 20° | 3 163 m | 53 % | 20 % | Endast ETA |
| S8 | SSV | 15° | 2 760 m | 52 % | 19 % | Endast ETA |
| S7 | S — Klostergården/S:t Lars | 30° | 3 141 m | 48 % | 19 % | Endast ETA |
| S5 | SO — Stora Råby | 25° | 3 163 m | 38 % | 19 % | Endast ETA |
| S0 | N — mot Vallkärra | 35° | 3 265 m | 44 % | 18 % | Endast ETA |
| S9 | SV | 20° | 3 246 m | 12 % | 7 % | Endast ETA |

**Livekartan är genuint användbar i 2 av 13 sektorer, marginell i 3, och aldrig i 8.**

Rekommendation: sätt `mapEnabled` per sektor i den förberäknade cachen istället för en global tröskel. Det kostar inget — datan finns redan i samma körning — och det slutar med att kartan bara tänds där den faktiskt betyder något. För de 8 ETA-sektorerna behöver kundvyn aldrig ens ladda kartkomponenten.

Detta stärker §21:s slutsats ytterligare: **bygg ETA-läget som huvudupplevelsen. Kartan är ett undantag för två väderstreck.**

---

## 23. Restauranger utanför centrum — mätt på tre positioner

Jag gissade i §22 att en förortsrestaurang "troligen får fler användbara sektorer". **Det var fel.** Här är mätningen.

| Restaurang | Sektorer | Commit min–max | Median | Innerzon | Yta m. karta | Tripp | Båge/stadsdel | GOD / SEN / ETA |
|---|---|---|---|---|---|---|---|---|
| Centrum (Bytaregatan) | 13 | 1 500–3 265 m | 2 760 m | 250–1 000 m | 57 % | 32 % | 1,12 | **2** / 3 / 8 |
| Norra Fäladen | 11 | 2 245–3 283 m | 3 044 m | 250–1 250 m | 49 % | 25 % | 1,42 | **0** / 5 / 6 |
| Linero | 12 | 1 500–3 231 m | 2 678 m | 250–1 250 m | 61 % | 33 % | 1,15 | **3** / 4 / 5 |

### Mönstret är inte centrum vs förort

- **Norra Fäladen är sämst av alla tre.** Noll sektorer där kartan fungerar bra, högsta tvetydigheten (1,42), lägsta täckningen. Orsak: området är inneslutet — för att komma någonstans måste föraren först ut på en ringled, och *alla* riktningar delar den. Minsta commit-avstånd är 2 245 m; från centrum är det 1 500 m.
- **Linero är bäst av alla tre.** Tre sektorer med god karta (S3, S4 commit klampade till 1 500 m = de divergerar nästan omedelbart), 61 % av ytan. Orsak: österut/sydöst är vägnätet glest och grenar sig direkt. Däremot är allt västerut in mot staden dåligt (S6, S7, S8 commit 2 934–3 231 m) — det delar Dalbyvägen-korridoren.

**Det avgörande är hur snabbt vägnätet grenar sig från just den punkten.** Det är en rent lokal egenskap som inte går att härleda från adressen, från avståndet till centrum, eller från om restaurangen känns "central" eller inte.

### Ett stabilt fynd: sektorantalet

11, 12, 13. **Antalet korridorer är en egenskap hos Lund**, inte hos restaurangen — staden bär ungefär 12 utfartskorridorer oavsett var man står. Det som varierar är *vilka bäringar* som hör till vilken korridor och *hur långt ut* commit ligger.

Praktisk nytta: använd det som **sanity-check i onboarding-jobbet**. Landar en ny restaurang utanför 10–14 sektorer är något fel — troligen felaktiga koordinater, eller att restaurangen snappat till en motorväg istället för en lokalgata. Larma istället för att spara skräpzoner.

### Svaret: per restaurang, men automatiskt

**Universal fix fungerar inte.** Antalet goda sektorer varierar 0–3, commit-medianen 2 678–3 044 m, tvetydigheten 1,12–1,42. En gemensam regelmängd skulle antingen visa missvisande kartor för Norra Fäladen eller kväva fungerande kartor för Linero.

**Men per restaurang är billigt och helt automatiskt:**

- ~85 OSRM-anrop (13 `/table` + 72 `/route`), **en gång** vid onboarding eller adressändring
- Mot er egen Skåne-OSRM: några sekunder
- Resultat cachas i `RestaurantZoneCommit`
- **Ingen manuell zonritning.** Ingen driftuppgift. Backend räknar själv.

Det är precis den lösning som efterfrågades: backend använder OSRM för att själv avgöra vilka zoner som gäller.

### Kompromissen ligger inte i grövre sektorer

Den rätta kompromissen är att acceptera **`mapEnabled = false` för hela restauranger**. Norra Fäladen får aldrig livekarta — inte som en begränsning, utan för att datan säger att den skulle bli missvisande. ETA:n blir ändå bättre av `leftRestaurantAt`, vilket är där värdet ligger.

Grövre sektorer skulle bara flytta felet från "ingen karta" till "fel karta".

### Konsekvens för förortsrestauranger: centrumkunderna får aldrig karta

Detta är värt att veta innan ni säljer in funktionen. För en restaurang i Norra Fäladen:

- Kund i **Norra Fäladen** (samma område): innanför innerzonen, 250–1 250 m → aldrig karta, bara ETA. Korrekt — leveransen tar 4 minuter.
- Kund i **centrala Lund** (~1 800 m): i identifieringsbandet, eftersom commit ligger på 2 682–3 283 m → **aldrig karta**.
- Centrala Lund är sannolikt en stor del av en Norra Fäladen-restaurangs volym.

Så: en förortsrestaurang kan i praktiken ha noll kunder som får se en karta. Sälj aldrig in livekartan som en generell funktion.

### Zoner får INTE styra GPS-pollingen

En viktig avgränsning, eftersom frågan blandar två saker:

| Beslut | Styrs av | Varför |
|---|---|---|
| **Hur ofta telefonen skickar position** | Orderstatus + geofence (§5-lägena) | Måste vara identiskt oavsett vilken sektor kunden ligger i. Med två ordrar i olika sektorer är sektorstyrd polling odefinierad. |
| **Vad kunden får se** | Sektor + commit (denna analys) | Ren läs-sida, räknas på positioner som redan finns |

Kopplar man ihop dem betyder en bugg i zonberäkningen att GPS-insamlingen degraderas — och insamlingen är det som har värde. Håll dem separata.

**Den enda legitima optimeringen zonerna ger:** har en restaurang noll GOD- och SEN-sektorer kan backend hoppa över hela spårutvärderingen och aldrig ens emitta koordinater i `order:tracking`. Det sparar beräkning, inte GPS.

---

## 24. Hur täckningen ökas — fem lever, mätta

### Korrigering av §21–23 först

Alla tidigare täckningssiffror var **sträckbaserade**. Mätt i **tid** — vilket är vad kunden upplever — är basen lägre:

| Mått | Sträcka | Tid |
|---|---|---|
| Av resan med karta (centrum, 13 sektorer) | 32 % | **27 %** |

Den låsta slutsträckan går snabbare per km än den tidiga delen, så tidstäckningen är genomgående ~5 procentenheter lägre. Räkna med **27 %**, inte 32 %.

### De fem leverna

| Lever | Yta m. karta | Av resan (tid) | Båge/stadsdel | Omdöme |
|---|---|---|---|---|
| Baslinje: 13 sektorer, golv 1 500 m | 57 % | 27 % | 1,12 | — |
| **L1** Ta bort 1 500 m-golvet | 57 % | 27 % | 1,11 | ❌ **Död** |
| **L4** Korridortolerans 25→80 m | 56–58 % | 26–27 % | 1,11–1,23 | ❌ **Död** |
| **L3** Grov nivå, 7 sektorer | 83 % | 35 % | 1,47 | ✅ **Stor** |
| **L3+** Extra grov, 5 sektorer | 96 % | 50 % | 1,93 | ⚠️ Kilen rymmer 2 stadsdelar |
| **L5** Plattan intygar enda leverans | **85 %** | **38 %** | — | ✅ **Störst, och gratis** |

**L1 är död** eftersom golvet i praktiken aldrig binder — bara en sektor (S12) klampades, med 92 m. Bortagning ger 0–1 pp.

**L4 är död.** 45 m är rätt tolerans; 25 m och 80 m ger ±1 pp. Parallellgator 50 m isär *är* olika vägar med olika destinationer.

**L3 fungerar** men kostar precision: kilen växer från ~1,1 till ~1,5 stadsdelar. Det betyder att UI-påståendet måste svagas — se nivåmodellen nedan.

**L5 är den stora vinsten**, och den är inte geometrisk utan **informationsteoretisk**. Intygar restaurangen att det bara finns en leverans i bilen finns ingen tvetydighet att lösa, och commit kan sättas till innerzonens kant:

| Restaurang | Baslinje (yta / tid) | Med L5 (yta / tid) |
|---|---|---|
| Centrum | 57 % / 27 % | **85 % / 38 %** |
| Norra Fäladen | 49 % / 20 % | **81 % / 38 %** |
| Linero | 61 % / 30 % | **81 % / 41 %** |

Notera att L5 **nästan fördubblar det värsta fallet**. Norra Fäladen, där geometrin misslyckas helt (noll goda sektorer), blir likvärdig med centrum. En kryssruta löser det som ingen mängd OSRM-beräkning kan.

### L6: skilj "en karta" från "förarens position"

Den lever som inte syns i tabellen ovan, eftersom den inte är geometrisk:

**Visa ruttlinjen alltid.** OSRM-rutten restaurang → kund hämtas redan för ETA:n. Rendera den som en polyline på kartan, utan förarmarkör. Kunden får rumslig kontext — "så här går maten" — för **100 % av ordrarna**, med noll risk och noll ny data.

Det mesta av vad kunden vill ha från "en karta" är kontext, inte övervakning. Lägg förarmarkören ovanpå först när nivåmodellen tillåter det.

**Avvisa** varianten "visa en prick som rör sig längs rutten baserat på ETA". Det är att hitta på en position. Gör aldrig det.

### Rekommenderad nivåmodell

Bygg i denna ordning:

| Steg | Mekanism | Kunden ser | Täckning |
|---|---|---|---|
| **0** | Ruttlinje från befintlig ETA-rutt | Karta med rutt, ingen prick | **100 %** |
| **1** | Plattan: "kör även annan leverans" okryssad (L5) | Förarprick + "på väg till dig" | **85 % / 38 %** |
| **2** | Kryssad → grov geometri, 7 sektorer (L3) | Förarprick + **"i ditt område om ca X min"** | **83 % / 35 %** |
| **3** | Fin geometri, 13 sektorer (L3 → Tier B) | Uppgradera till "på väg till dig" | 57 % / 27 % |

Resultat: **alla får en karta, ~85 % får en förarprick, ~57 % får det starka påståendet.** Mot baslinjens 57 % / 27 % är det en väsentlig förbättring, och varje nivå har ett påstående som matchar sin faktiska säkerhet.

### Risken med L5 och hur den stängs

L5 vilar helt på att restaurangen kryssar ärligt. Kryssar de aldrig i medan de kör Foodora-ordrar blir täckningen falsk — och då visar ni kunden precis det ni ville undvika.

**Självkorrigerande skydd, med data ni ändå samlar:** `DETOUR_STOP_DETECTED` (§10) räknar stillastående >90 s långt från kunden. Visar en restaurang återkommande omvägsstopp medan de intygar enkelleverans → **degradera dem permanent till geometri-läge (steg 2–3)**. Ingen sanktion, ingen diskussion — bara mindre karta.

Det gör L5 säker utan att kräva att någon litar på någon.

---

## 25. L7 — könummer istället för kryssruta

Uppgradering av L5: istället för en binär kryssruta anger personalen **vilket stopp i turen** vår order är. Backend räknar sedan leveransstopp och vet när föraren är på sista benet.

`1 av 1` är exakt L5. Modellen **generaliserar** alltså kryssrutan istället för att ersätta den.

### Huvudvärdet är ETA, inte kartan

Det här är den viktiga insikten, och den ligger inte där idén siktade.

Körtid restaurang → kund i Lund (OSRM, centrala Lund):

| Avstånd | P25 | P50 | P75 |
|---|---|---|---|
| 1 000–2 000 m | 3,5 min | 4,0 min | 4,4 min |
| 2 000–3 000 m | 5,4 min | 5,9 min | 6,4 min |
| 3 000–4 000 m | 7,3 min | 7,7 min | 8,4 min |

Ett föregående stopp kostar mellanled (~0,7 × normalbenet) plus dwell (parkera, lämna, tillbaka ut i trafiken):

| Dwell | Per föregående stopp | Order nr 2 | Nr 3 | Nr 4 |
|---|---|---|---|---|
| 1,5 min | 5,6 min | +6 min | +11 min | +17 min |
| 2,5 min | 6,6 min | +7 min | +13 min | +20 min |
| 3,5 min | 7,6 min | +8 min | +15 min | +23 min |

**Är vår order nr 3 kommer maten 11–15 minuter senare än "på väg" antyder.** Det är den största lögnen kunden får höra idag — mycket större än någon kartprecision. Ett heltal från plattan rättar den.

Formeln, som slår rakt in i befintlig `orderEta.ts` / `refreshCourierActiveEtas`:

```
etaCustomerAt = leftRestaurantAt
              + (N − 1 − k) × legEstimate        // k = redan detekterade stopp
              + OSRM(förarens position → kund)   // sista benet, live
legEstimate  = 0,7 × median-OSRM-ben + dwell     // starta dwell på 2,5 min, kalibrera
```

ETA:n blir **mer** exakt under körningens gång, i takt med att `k` växer. Det är en bättre egenskap än allt annat i den här planen.

### Kartvärdet är verkligt men mindre

| Vår order | Sista benets andel av hela turen |
|---|---|
| 1 av 1 | 100 % |
| 2 av 2 | 50 % |
| 3 av 3 | 33 % |
| 4 av 4 | 25 % |

När räknaren når `N − 1` är den återstående resan enkeldestination → geometriproblemet försvinner → **L5-nivå täckning (85 % / 38 %) på det sista benet**. Vilket är precis det ben kunden bryr sig om.

### Stoppdetekteringen är den svåra delen

Att räkna är lätt. Att avgöra *vad* ett stopp var är en klassificerare, och den kommer ha fel.

Kriteriet "inte vid trafikljus" kräver ljusens positioner. OSM har `highway=traffic_signals`, men **OSRM:s API exponerar dem inte** — det skulle kräva Overpass-frågor eller ett eget OSM-extrakt. Mycket arbete för en svag signal.

Bättre diskriminatorer, alla gratis med data ni redan har:

| Signal | Trafikljus / kö | Leveransstopp |
|---|---|---|
| **Varaktighet** | Lunds ljus cyklar väl under 90 s | 60 s – 4 min |
| **Avstånd från ruttlinjen** ⭐ | Ljus ligger **på** OSRM-rutten | Parkerad, typiskt >20 m ifrån |
| **Kursändring vid start** | Fortsätter samma riktning | Ofta U-vändning eller sväng (>120°) |
| **GPS-drift under stoppet** | Ingen | 15–40 m om telefonen följer med till dörren |

Rekommenderad regel, utan ny data:

```
leveransstopp = varaktighet ≥ 100 s
                OCH ( >25 m från ruttlinjen  ELLER  kursändring > 120° )
```

Ruttlinjen har ni redan — den hämtas för ETA:n.

### Designregel: räkna hellre för lågt

Asymmetrin är avgörande:

- **Räkna för högt** → kartan tänds medan föraren fortfarande har en annan order → exakt det fel hela modellen finns för att undvika.
- **Räkna för lågt** → kartan förblir släckt → ofarligt.

Kräv därför **stark** evidens per stopp. Klassificeraren ska missa snarare än hitta på.

### Två fällor

**Omordning.** Föraren hoppar över en kund som inte svarar och kommer tillbaka senare — då blir nr 3 plötsligt nr 2 och räknaren stämmer inte. Lösning: behandla `N` som en **övre gräns**. Tänd kartan när `stopp ≥ N − 1` **eller** när geometrins commit är uppfylld, vilket som kommer först. **Släck aldrig** kartan för att räknaren rört sig fel väg.

**Inmatningen är svårare än en kryssruta.** Plattan känner ViaEats-ordrarna men inte Foodora-ordrarna, så personalen måste själv veta sekvensen. En stepper — *"Vår order är stopp nr [1] [2] [3] [4+]"* — är fortfarande ett tryck, men mer felbenäget än en kryssruta. Behåll `1` som default, så degraderar felaktig inmatning till L5-beteende.

**Affärskänslig data:** siffran är ett påstående om konkurrentvolym. Inte personuppgift, men kommersiellt känsligt. Lagra **bara heltalet** — aldrig något om de andra ordrarna.

### Vad jag inte kan kvantifiera

**Stoppdetekteringens träffsäkerhet.** Jag har inga verkliga GPS-spår, så varje precision/recall-tal jag gav er skulle vara påhittat.

Det gör den till ett **Fas 0-experiment** (§16): spela in 20 verkliga turer där föraren själv noterar när hon lämnar över, kör klassificeraren mot spåren och mät. Klarar den inte ~90 % precision med bias mot underräkning ska L7 inte styra kartan — men **ETA-delen är värd att bygga ändå**, eftersom den bara behöver siffran `N`, inte detekteringen.

Det är den rätta uppdelningen: `N` ger ETA-vinsten direkt och riskfritt. Stoppdetekteringen ger kartvinsten, men bara om den mäts först.

---

## 26. L8 — självkalibrerande batch-detektering (noll manuell input)

### Först: varför 99 % per order inte går

Tre modellfamiljer är nu testade och alla slår i samma vägg:

| Modell | § | Resultat |
|---|---|---|
| Viktad 0–100-score | 21 | Kräver kalibrering mot spår som inte finns |
| Per-order commit på kundens egen rutt | 22 | **Sämre** — 22 % mot 42 % |
| Sektorgeometri | 21–23 | 57 % / 27 %, tak satt av vägnätet |

Orsaken är densamma varje gång: **alla signaler är positionshärledda, och säkerheten om "kommer den här föraren till mig" stiger monotont med närhet.** Den enda punkten där den är 99 % är när föraren står vid dörren — värdelöst för en karta.

Informationen om den externa ordern **finns inte i er data**. Ingen algoritm skapar information. Det är en informationsgräns, inte en modelleringsgräns.

### Antagandet som är värt att bryta

99 % behövs bara för att kartan **påstår** "föraren kör till dig nu". Ändra påståendet och kravet försvinner.

En prick med etiketten *"Föraren är ute på leverans"* är 100 % korrekt närhelst en förare är kopplad och utanför innerzonen. Noll geometri behövs.

Men var ärlig om skillnaden: **icke-vilseledande är inte samma sak som lugnande.** En prick som rör sig bort från kunden lugnar inte, ens med förbehåll. Därför:

| Säkerhet | Vad kunden ser | Effekt |
|---|---|---|
| Låg | **Ruttlinje + ETA + antal stopp före** | Rumslig kontext, ingen oro |
| Hög | **Prick** + "på väg till dig" | Lugnande |

Pricken är inte till för att bevisa något — den är till för att lugna. Visa den bara när den gör det.

### Mekanismen: systemet lär sig själv, ingen skriver något

Nyckeln är att **den interna batchen redan är känd gratis.** Plattan kopplar föraren till N ViaEats-ordrar (§19 P1) — det är ingen ny input, det är steg 1 i planen.

```
1. Plattan kopplar förare + N interna ViaEats-ordrar        ← gratis, redan i planen
2. Stoppklassificeraren räknar leveransstopp under turen
3. externStopp = detekteradeStopp − interntLevererade       ← båda kända EFTER turen
4. Varje tur lär alltså retroaktivt ut hur många externa
   ordrar den hade. Ingen skriver in något.
5. Efter 2–4 veckor: fördelning per restaurang, veckodag och timme
6. Prior väljer nivå automatiskt:
      extern-rat ≈ 0   → L5-behandling utan kryssruta
      extern-rat hög   → geometri/räknare
```

**Bonusen som stänger luckan i §25:** på turer där intern batch = N och ingen extern order förekom har ni **grundsanning för klassificeraren**. Den kalibrerar sig alltså själv på enkelplattforms-turer och appliceras därefter på blandade. Det precision-tal jag inte kunde ge er mäter systemet självt, i produktion.

### Siffror

Blandad täckning när priorn är inlärd, mot baslinjens 57 % / 27 %:

| Extern batch-rat | Turer utan extern | Yta m. prick | Tid m. prick | Vinst |
|---|---|---|---|---|
| 10 % | 90 % | **84 %** | 36 % | +27 pp yta / +9 pp tid |
| 20 % | 80 % | 83 % | 34 % | +26 / +7 |
| 25 % | 75 % | 83 % | 32 % | +26 / +5 |
| 35 % | 65 % | 82 % | 30 % | +25 / +3 |
| 50 % | 50 % | 81 % | 26 % | +24 / **−1** |

**Läs tabellen rätt:** vinsten ligger i **ytan** — hur många kunder som får en prick alls — inte i hur stor del av resan. Tidsvinsten är 3–9 pp och vid 50 % extern batching blir den negativ. Det är ingen universallösning för trippandelen.

Inlärningstid för ±5 pp vid 95 % konfidens:

| Extern batch-rat | Turer | Dagar (10 turer/dag) |
|---|---|---|
| ~10 % | 139 | **14** |
| ~25 % | 289 | 29 |
| ~40 % | 369 | 37 |

### Den manuella inputen blir tillfällig

Under uppvärmningen finns ingen prior. Lösningen är elegant: **använd L7-steppern bara under onboarding**, och släpp den automatiskt när priorn konvergerat.

```
vecka 1–4:  personalen anger stoppnummer (L7)  → ger ETA-vinst direkt
                                                + grundsanning till priorn
efter:      steppern försvinner, priorn styr    → noll manuell input
```

Det är så nära "automatiserat med minimal manuell input" som problemet tillåter: manuellt under inlärning, aldrig därefter.

### Det ärliga taket

Även fullt kalibrerat: **~83 % av kunderna får en prick, ~32 % av resan, och det starka påståendet bara på sista benet.**

99 % per order över hela resan är inte uppnåeligt. Den som påstår det visar antingen pricken utan påståendet — eller ljuger.
