# Redis live-state: körbar implementationsplan

Uppdaterad 2026-07-22 efter kodgranskning. Dokumentet är ett
implementationskontrakt för en enklare agent. Det ska gå att följa uppifrån och
ned utan att agenten behöver fatta egna arkitekturbeslut.

## 0. Uppdrag och arbetssätt

Implementera Redis-stöd för högfrekvent live-data i `packages/api/` utan att
ändra något klientkontrakt. Gör en fas i taget och gå inte vidare förrän fasens
grind är grön.

Agenten ska:

- använda repo-standardkommandon med `pnpm`, inte `npm`;
- börja med `git status --short` och bevara alla befintliga, orelaterade
  ändringar och otrackade filer;
- arbeta på den branch som redan är utcheckad; inte byta branch, pusha, merga
  eller deploya utan uttrycklig instruktion i den aktuella uppgiften;
- inte köra `prisma migrate deploy`, `prisma db push`, seed, wipe eller någon
  annan DB-mutation; Redis-arbetet kräver ingen Prisma-migration;
- använda symbolnamnen i planen som ankare. Radnummer nedan är ungefärliga och
  kan flytta sig;
- stanna och rapportera om en grind får ett nytt fel. Dölj inte felet med
  `--transpile-only`, bred `catch` eller genom att försvaga ett test.

## 1. Resultat som ska uppnås

När `LIVE_STATE=redis` och Redis fungerar ska:

1. kurirpositionen skrivas till Redis vid varje godkänd ping;
2. `Courier.currentLat/currentLng/lastSeenAt` vara en write-behind-snapshot som
   skrivs högst en gång per 60 sekunder och alltid vid sessionsstopp;
3. en positionsping skriva live-ETA till Redis och göra noll `Order`-writes;
4. dispatch, kurir-API, kundtracking och admin läsa senaste giltiga
   Redis-position/ETA med PostgreSQL som fallback;
5. Redis-fel aldrig ensamt orsaka ett 500-svar eller tappa en position/ETA som
   tidigare hade skrivits till PostgreSQL;
6. Socket.IO-events och alla befintliga JSON-former vara oförändrade.

När `LIVE_STATE` saknas, har ett annat värde än `redis`, eller när `REDIS_URL`
saknas ska beteendet vara samma som före Redis-arbetet:

- position skrivs till PostgreSQL på varje ping;
- ETA från pingen skrivs till PostgreSQL;
- läsare använder PostgreSQL;
- auth går direkt till PostgreSQL;
- Socket.IO får fortfarande använda sin egen Redis-adapter om `REDIS_URL`
  finns. `LIVE_STATE` får aldrig stänga av `lib/socket.ts`.

## 2. Hårda gränser

Rör inte:

- `packages/api/src/lib/dispatchScoring.ts` eller score-, våg- och
  offerlogiken;
- `packages/api/src/lib/travelMatrix.ts` eller OSRM-cachen;
- accept-domaren: unik constraint på `Delivery.orderId`, `P2002`-hanteringen
  och `resolveOffersOnAccept`;
- Flutter-kurirappen, kurir-PWA:n eller andra klienter;
- var pengar, payout, orderstatus, betalningar, refunds eller andra
  transaktionella fakta lagras. `routes/orders.ts` får ändras endast för de
  uttryckligt listade live-overlay-/durable-ETA-punkterna.

Redis får aldrig avgöra vem som vinner ett accept-race och får aldrig vara
källa till `ratePerKmOre`, `payOre` eller `tipOre`.

## 3. Nuläge som implementationen måste respektera

### 3.1 Positionspingen

`POST /api/courier/location` i `src/routes/courier.ts` gör i dag:

- en `prisma.courier.update` per ping;
- en aktiv-leveransquery för socket-emits;
- `refreshCourierActiveEtas`, som gör en andra aktiv-leveransquery och en
  `prisma.order.update` per aktiv order.

Kurirappen pingar ungefär var 8–10 sekund. Det är den största skrivlasten.

### 3.2 Auth

`requireCourier` i samma fil gör `prisma.courier.findUnique` på varje request.
En hel `Courier`-rad innehåller bland annat `passwordHash`, personnummer,
adress, payout-konto samt FCM/APNs-token. En hel rad får därför aldrig cachas.

### 3.3 ETA-triggerkarta

Persistensläget ska vara explicit vid varje anrop. Det får inte finnas ett
booleskt eller implicit standardläge som av misstag gör ett status-event
flyktigt.

| Symbol/anrop | Trigger | Sink |
|---|---|---|
| `courier.ts`, `/location`, nu kring rad 571 | positionsping | `live-ping` |
| `courier.ts`, accept, kring rad 376 | kurirtilldelning | `durable-event` |
| `courier.ts`, picked-up, kring rad 433 | statusövergång | `durable-event` |
| `courier.ts`, complete, kring rad 519–520 | terminal status + kvarvarande stopp | `durable-event` |
| `admin.ts`, ändrad `estimatedTime`, kring rad 924 | varaktig ändring | `durable-event` |
| `admin.ts`, orderstatus, kring rad 1023 | statusövergång | `durable-event` |
| `orders.ts`, order skapad, kring rad 1590 | initial snapshot | `durable-event` |
| `orders.ts`, dev-status, kring rad 2532 | statusövergång | `durable-event` |
| `orders.ts`, self-delivery klar, kring rad 2580 | statusövergång | `durable-event` |

Endast `/location` får använda `live-ping`.

## 4. Fasta designbeslut

Följ dessa beslut; uppfinn inte alternativa modeller under implementationen.

### 4.1 Explicit opt-in

- `LIVE_STATE=redis` aktiverar lagret.
- Alla andra värden, inklusive tomt/okänt värde, betyder PostgreSQL-läge.
- `REDIS_URL` måste också finnas för att Redis-läget ska vara aktivt.
- Lägg till `LIVE_STATE=pg` i `.env.example` som säker standard.

Det gör att kod kan deployas avstängd även om `REDIS_URL` redan används av
Socket.IO.

### 4.2 Redis-only kärna och explicit fallback-signal

Skapa `packages/api/src/lib/liveState.ts`. Den modulen får inte importera
Prisma. Den ansvarar för anslutning, nycklar, serialisering och Redis-kommandon.

Läsningar ska skilja på träff, riktig cache-miss och infrastrukturfel:

```ts
type LiveRead<T> =
  | { state: 'hit'; value: T }
  | { state: 'miss' }
  | { state: 'disabled' }
  | { state: 'unavailable' };

type BatchLiveRead<T> =
  | { state: 'ok'; values: Map<string, T> } // frånvarande id = miss
  | { state: 'disabled' }
  | { state: 'unavailable' };
```

Skrivningar ska returnera de explicita, operationsspecifika resultattyperna i
avsnitt 6. Anroparen gör PostgreSQL-fallback endast för `disabled` eller
`unavailable`. Returnera aldrig bara `null`/`false` där superseded/occupied och
Redis-fel får olika semantik.

För batcher gäller: ett command-/anslutningsfel gör hela batchen
`unavailable`; en enskild saknad eller korrupt post utelämnas bara ur `values`
och får inte fälla övriga poster.

### 4.3 Egen, återhämtningsbar klient

Live-state ska ha en egen `redis`-klient. Dela inte Socket.IO:s pub/sub-klienter.

Klienten ska:

- skapas lazy vid första aktiva anropet;
- ha en delad `connectPromise`, så samtidiga requests inte skapar flera
  anslutningar;
- använda `disableOfflineQueue: true` och kort `connectTimeout` (cirka 1,5–2 s);
- sätt även `socket.socketTimeout`/en kommandodeadline på cirka 2 s, så en
  redan ansluten men hängd socket inte blockerar en request obegränsat;
- ha begränsade reconnect-försök per anslutningscykel;
- öppna en in-process circuit breaker i cirka 30 s efter misslyckad anslutning
  innan en ny klient får skapas;
- kunna återhämta sig senare. Kopiera inte Socket-klientens permanenta
  “ge upp efter tre försök”-beteende;
- logga fel utan URL/credentials, högst en gång per fem minuter, och logga en
  enda återhämtningsrad när anslutningen fungerar igen;
- aldrig lämna en avvisad `connect()`-promise eller `error`-event ohanterad.

Vid socket-/kommandotimeout eller command error: destroy:a den felande
klienten, nollställ `connectPromise`, öppna circuit breakern och returnera
`unavailable`. Låt aldrig en timeout-promise ligga kvar och fortsätta samla
kommandon i bakgrunden.

Bygg kärnan som en testbar factory med ett litet `RedisLike`-interface,
injekterbar clock/env/client factory. Exportera produktionswrappers runt en
singleton. Då kan kontraktstester simulera hit, miss och kastande Redis utan
ett riktigt nätverk.

### 4.4 Ingen GEO eller separat presence i kärnleveransen

Skapa inte `courier:geo:{city}` i denna implementation. Ingen befintlig läsare
gör GEO-sökning; nyckeln ger därför bara extra writes och stale city-members.

Skapa inte heller en separat presence-nyckel. `/location` är redan heartbeat,
och positionshashens `at` ger exakt samma färskhetssignal. Behåll dagens
dispatchgräns på fem minuter. Positionens egen TTL är tio minuter, men
`locationFresh` är sann endast när vald positions `at` är yngre än fem minuter.

Om en separat heartbeat-route utan GPS införs senare kan presence läggas till
som ett separat projekt.

### 4.5 PostgreSQL är alltid fakta

Följande stannar alltid i PostgreSQL:

- `Delivery`, accept-race och fryst ersättning;
- orderstatus, betalning, refund, moms och payout;
- kurirkonto, lösenord, `tokenVersion`, aktiv/online-session, stad och fordon;
- `DispatchOffer` och revisionshistorik;
- senaste positionssnapshot, lågfrekvent;
- durable ETA som skapats av order-/status-event.

### 4.6 Nyaste giltiga värde vinner

“Redis först” betyder inte blint Redis. Vid position-overlay ska Redis `at`
jämföras med PostgreSQL `lastSeenAt`; välj det nyaste giltiga värdet. Detta
hindrar en äldre Redis-position från att återinföras efter ett avbrott.

ETA får bara overlayas när Redis-snapshotens schema, orderstatus och
orderrevision matchar den PostgreSQL-order som läsaren redan har hämtat.

## 5. Nyckelschema

Alla live-state-nycklar ska få prefixet från `LIVE_STATE_KEY_PREFIX`, med säker
default `viaeats:live:v1`. Produktion och staging måste använda olika
Redis-tjänster. Ett separat live-state-prefix räcker inte för att isolera
Socket.IO-adapterns egna standardnycklar, så dela inte Redis mellan miljöerna.

| Suffix efter prefix | Typ | Fält/värde | TTL |
|---|---|---|---|
| `courier:pos:{courierId}` | hash | `v`, `lat`, `lng`, `at` (epoch ms) | 10 min |
| `courier:pos-flush:{courierId}` | string | slumpad owner-token | 60 s |
| `courier:auth:{courierId}` | hash | `v`, `updatedAt`, allowlistad JSON i `data` | 30 s |
| `order:eta:{orderId}` | hash | metadata + samtliga sex ETA-fält | 15 min |

Order-ETA-hashen ska innehålla:

- `v`;
- `orderStatus`;
- `orderUpdatedAt` som epoch ms;
- `computedAt` som epoch ms;
- `sourcePositionAt` som epoch ms eller JSON-`null`;
- `etaReadyAt`, `etaPickupAt`, `etaCustomerAt`, `etaCustomerMin`,
  `etaPriorityScore`, `etaReason`.

Koda vart och ett av de sex ETA-värdena med `JSON.stringify`, även `null`.
Skriv alla sex vid varje snapshot. Lämna aldrig kvar ett gammalt hashfält när
det nya värdet är `null`. Datum avkodas till `Date` innan befintliga rena
helpers anropas.

## 6. Minsta publika API

Efter samtliga faser ska `liveState.ts` minst exponera följande. Position/ETA
införs i Fas 1; auth-raderna och `CourierAuthContext` läggs till först i Fas 4:

```ts
type CourierPosition = { lat: number; lng: number; at: Date };

getCourierPosition(courierId): Promise<LiveRead<CourierPosition>>;
getCourierPositions(courierIds): Promise<BatchLiveRead<CourierPosition>>;
setCourierPosition(input): Promise<PositionWriteResult>;
releasePositionFlushClaim(courierId, ownerToken): Promise<MaintenanceResult>;
resetPositionFlushClaim(courierId): Promise<MaintenanceResult>;

getCourierAuth(courierId): Promise<LiveRead<CourierAuthContext>>;
fillCourierAuthIfEmpty(context): Promise<AuthFillResult>;  // atomisk if-absent
replaceCourierAuth(context): Promise<AuthReplaceResult>;   // revision-CAS
invalidateCourierAuth(courierId): Promise<MaintenanceResult>;

getOrderEta(order): Promise<LiveRead<OrderEtaSnapshot>>;
getOrderEtas(orders): Promise<BatchLiveRead<OrderEtaSnapshot>>;
setOrderEta(snapshotWithMetadata): Promise<EtaWriteResult>;
deleteOrderEta(orderId): Promise<MaintenanceResult>;
```

Resultattyperna ska också skilja normala CAS-resultat från fel:

- ETA: `stored | superseded | disabled | unavailable`;
- auth fill: `stored | occupied | disabled | unavailable`;
- auth replace: `stored | superseded | conflict | disabled | unavailable`.
- maintenance: `done | not-found | not-owner | disabled | unavailable`.

`superseded` och `occupied` är inte Redisfel. En superseded live-ETA betyder
att en nyare snapshot redan finns och ska **inte** trigga PG-fallback.
Ingen publik Redis-mutation får kasta till routen; den ska returnera ett av de
explicita resultaten ovan och logga throttlat internt.

Undvik runtime-cirklar: använd `import type` för `OrderEtaSnapshot`, eller lägg
delade wire-typer i en liten `liveStateTypes.ts`. `deleteOrderEta` är endast för
corrupt/test/explicit maintenance, aldrig ersättning för en terminal
status-snapshot.

`PositionWriteResult` ska ange:

- om den inkommande positionen accepterades eller var äldre än lagrad data;
- den effektiva position som resten av requesten ska använda;
- om denna request vann 60-sekunders flush-claim;
- claimens owner-token, så den kan släppas säkert efter misslyckad PG-flush;
- `disabled`/`unavailable`, vilket alltid betyder omedelbar PG-write.

Använd Lua eller likvärdig atomisk CAS för två saker:

1. en äldre `at` får inte skriva över en nyare position;
2. en ETA med lägre `orderUpdatedAt`, eller samma revision men äldre
   `sourcePositionAt`/`computedAt`, får inte skriva över en nyare snapshot.

Jämför ETA-versioner lexikografiskt i ordningen `orderUpdatedAt`,
`sourcePositionAt` och `computedAt` (null position behandlas som `0`). Fånga
`computedAt` en gång **innan** beräkningen börjar; sätt det inte först när den
asynkrona Redis-writen körs. Annars kan en långsam äldre beräkning se nyare ut.

Om en positionswrite förkastas som äldre ska den inte ta flush-claim eller
emitta sin inkommande koordinat. Returnera den redan lagrade effektiva
positionen och använd den genom resten av requesten.

Positions-CAS, positions-TTL och `SET ... NX PX 60000` för flush-claim ska ske
i samma Lua-operation. En accepterad write sätter TTL; en superseded write får
inte förnya vare sig positions- eller ETA-TTL. ETA-CAS ska atomiskt skriva
metadata, alla sex fält och TTL.

Vid lika positionstimestamp behålls den redan lagrade positionen. En lagrad
`at` mer än 60 sekunder i framtiden relativt injicerad clock behandlas som
korrupt så den inte blockerar nya pingar i tio minuter. Nästa giltiga ping får
ersätta den.

Frisläppning av flush-claim ska vara
compare-and-delete på owner-token; en process får aldrig radera en annan
process claim.

## 7. Fas 0 — baseline och säkerhet

Kör från reporoten:

```bash
git status --short
pnpm --filter @viaeats/api test:contracts
pnpm --filter @viaeats/api test:dispatch
pnpm --filter @viaeats/api test:order-status
pnpm --filter @viaeats/api test:hermes
pnpm --filter @viaeats/api test:customer-notifier
pnpm --filter @viaeats/api test:notification-reconciler
pnpm --filter @viaeats/api test:order-access
pnpm --filter @viaeats/api exec tsc --noEmit
```

Kontrollera dessutom med `rg` att integrationssymbolerna i denna plan finns.
Notera eventuella redan existerande testfel och ändra inget utanför Redis-scope.

**Grind 0:** baseline är dokumenterad och inga produktionskommandon har körts.

## 8. Fas 1 — Redis-kärna, codecs och tester

### 8.1 Filer

- Ny: `packages/api/src/lib/liveState.ts`.
- Ny: `packages/api/src/contracts/liveState.test.ts`.
- Ändra `packages/api/package.json` med det explicita scriptet
  `test:live-state`.
- Valfritt, men endast som ett par: real-Redis-testfilen
  `packages/api/src/contracts/liveStateRedis.integration.test.ts` och scriptet
  `test:live-state:redis`. Skapa inte ett script som pekar på en fil som saknas.
- Ändra `packages/api/.env.example` med `LIVE_STATE=pg` och
  `LIVE_STATE_KEY_PREFIX=viaeats:live:v1`.
- Lägg till en lokal `redis:7-alpine`-service i rootens `docker-compose.yml`;
  ingen persistence krävs för live-state.

### 8.2 Obligatoriska kontraktstester utan riktig Redis

Använd factoryns fake-client och testa:

- off-läge gör inga connectförsök och returnerar `disabled`;
- saknad `REDIS_URL` returnerar `disabled` även om `LIVE_STATE=redis`;
- hit, riktig miss och kastande klient ger tre skilda resultat;
- två samtidiga första anrop delar samma connect-promise;
- circuit breaker hindrar connect-storm och tillåter senare återhämtning;
- fel-loggningen throttlas;
- koordinat och datum round-trippar;
- ogiltig/corrupt data blir miss, aldrig ett godkänt värde eller 500;
- äldre position förkastas;
- första ping vinner flush, nästa inom 60 s gör det inte, ny ping efter TTL
  vinner igen;
- bara ägarens token kan släppa flush-claim;
- ETA-datum, tal, noll och `null` round-trippar;
- äldre orderrevision, äldre `sourcePositionAt` och därefter äldre
  `computedAt` förkastas i rätt prioritetsordning;
- status/schema-mismatch läses som miss;
- batchläsning gör pipeline/multi, inte ett seriellt Redis-anrop per id.

Auth-primitiverna och `CourierAuthContext` införs först i Fas 4. De är med i
det slutliga API:t i avsnitt 6, men ska inte krävas för Grind 1.

Det frivilliga integrationstestet ska använda en unik testprefix och vägra köra
mot en produktions-URL. Rensa endast nycklar under testprefixet; kör aldrig
`FLUSHALL` eller `FLUSHDB`.

### 8.3 Grind

```bash
pnpm --filter @viaeats/api test:live-state
pnpm --filter @viaeats/api exec tsc --noEmit
```

**Grind 1:** inga routes är ändrade ännu, kärnan kan återhämta sig efter fel,
och testerna bevisar skillnaden mellan miss och unavailable.

## 9. Fas 2 — kurirposition och write-behind

### 9.1 Gemensam fallback-helper

Skapa `packages/api/src/lib/courierLivePosition.ts`. Den får importera Prisma
och `liveState.ts` och ska vara den enda platsen som väljer mellan live- och
PG-position.

Gör orchestreringen testbar via en factory eller rena persistenshelpers med
injekterad Prisma-lik adapter, live-state och clock. Grindarna får inte nöja sig
med regex-test av routekällkod.

Den ska erbjuda single- och batchvariant och:

- validera Redis-position;
- jämföra Redis `at` med PG `lastSeenAt` och välja den nyaste;
- behålla PG-fälten vid miss/disabled/unavailable;
- hämta endast `currentLat/currentLng/lastSeenAt` från PG om anroparen inte
  redan har en PG-snapshot, även vid Redis-hit, så newest-wins kan bevisas.
  Starta den minimala PG-läsningen och Redis-läsningen parallellt;
- returnera ett nytt courier-objekt; mutera inte Prisma-objektet.

Det innebär medvetet en minimal Courier-query på `/jobs` när auth-cachen är
aktiv och dess context saknar position. Auth-cachen avlastar fortfarande
positionspingarna och övriga requests; försök inte återinföra position i
auth-context för att undvika denna query.

### 9.2 `POST /location`

I `routes/courier.ts`, route `router.post('/location', ...)`:

1. Validera `Number.isFinite`, latitud `[-90, 90]` och longitud `[-180, 180]`.
2. Skapa en server-timestamp exakt en gång för requesten.
3. Anropa `setCourierPosition`.
4. Om Redis är disabled/unavailable: gör samma awaitade PG-update som i dag.
5. Om Redis accepterar positionen och requesten vann flush-claim: uppdatera PG
   med exakt den effektiva positionens `at`.
6. Om den periodiska PG-flushen misslyckas men Redis-skrivningen lyckades:
   logga throttlat, släpp claim med owner-token och svara fortfarande OK.
7. Om både Redis och PG-fallback misslyckas: behåll dagens 500-semantik.
8. Använd den effektiva, nyaste positionen för ETA och båda socket-eventen.
9. Redan i denna fas: lägg till valfri `activeDeliveries?` i options för
   `refreshCourierActiveEtas` utan att ännu ändra dess PG-persistens. Hämta
   aktiva leveranser en gång med `getCourierActiveDeliveries`, skicka samma
   lista till ETA-refresh och använd den för order-rummen.
10. Flytta ETA-refreshen utanför Socket.IO-`try`. Ett oinitierat socketlager får
    inte stoppa ETA-refresh.

Alla PG-positionswrites, både fallback och periodisk flush, ska vara
newest-wins: använd villkorad `updateMany` där befintlig `lastSeenAt` är null
eller `<= incoming.at`. Om writen förlorar mot en nyare PG-position är det en
lyckad no-op, inte 500; läs den nyare PG-positionen och använd den som effektiv
position. En äldre request får aldrig skriva PG-snapshotten bakåt.

Socket-eventnamn, rum och payloadfält ska vara identiska med i dag.

### 9.3 Sessionsstopp

I `POST /session/stop`:

- läs senaste effektiva live/PG-position;
- persistenta `online:false` och den newest-wins-skyddade positionen i samma
  transaktion;
- använd positionens verkliga `at`, inte stopptiden, som `lastSeenAt`;
- sessionsstopp är durable och får inte lyckas om `online:false` inte sparas.

Implementera newest-wins utan att riskera `online:false`: gör en transaktion
med villkorad positionsupdate och en ovillkorlig online-update om
positionsvillkoret inte vann. Om ingen giltig position finns ska befintliga
PG-koordinater bevaras, aldrig sättas till null. Efter lyckat stop ska
`courier:pos-flush:*` resetas best effort, så första pingen i en snabbt
omstartad session kan vinna en ny flush-claim. Samma reset görs efter
revoke/inaktivering; en race kan högst orsaka en extra snapshotwrite, inte
dataförlust.

Låt live-positionen ligga kvar till sin tio minuters TTL även efter stop,
revoke eller `isActive=false`. `online`/`isActive` i PG styr behörighet och
dispatch; den sista positionen behövs fortfarande för tracking och en samtidig
in-flight-ping får annars återintroducera nyckeln efter en delete. Ingen
GEO-städning behövs eftersom GEO inte införs.

### 9.4 Samtliga positionsläsare

Ändra alla följande; hoppa inte över någon:

- `routes/courier.ts`, `GET /jobs`: bygg ett `liveCourier` och använd samma
  objekt för `here` och `estimateOrderEta`;
- `routes/courier.ts`, `GET /jobs/:orderId`: overlay före ETA;
- accept-routen: gör ingen **extra positions-Redis-roundtrip** före
  `Delivery.create` (auth-cachen får redan ha lästs). Efter vunnet DB-race,
  overlaya positionen före ETA-refresh;
- picked-up och complete: overlaya före alla ETA-anrop som får courier;
- `lib/dispatch.ts`, `buildDispatchCandidates`: batch-overlay direkt efter
  courier-queryn och före `matrixPoints`, `buildTravelLookup`, ETA, avstånd och
  freshness. Candidate-objektets form får inte ändras;
- `adminCourierRouter.get('/')`: batch-overlay före responsmappningen;
- `adminCourierRouter.get('/:id')`: overlay `session.currentLat/currentLng/
  lastSeenAt`;
- `routes/orders.ts`, kundtracking `router.get('/:id')`: overlay tilldelad
  courier efter godkänd ägarskapskontroll och före `courierCanBeShown`. Använd
  `delivery.courierId` eller lägg till `id: true` i nested courier-selecten;
- `routes/admin.ts`, `router.get('/orders/:id')`: overlay tilldelad courier
  före adminresponsen.

`online` och stad fortsätter vara avsiktligt PG-sessionstillstånd. Freshness
beräknas från vald positions `at` med samma femminutersgräns som i dag.

### 9.5 Grind

Lägg kontrakt för newest-wins, PG-fallback, femminuters-freshness,
batch-overlay och stop-flush. Kör sedan hela verifieringspaketet i avsnitt 13.

**Grind 2:** med fake Redis up blir första ping en PG-write och följande pingar
inom 60 s inga PG-writes; med fake Redis down blir varje ping en PG-write.
Dispatchkontrakten är oförändrat gröna.

## 10. Fas 3 — live-ETA

### 10.1 Gör sink obligatorisk

Ändra `refreshOrderEta` och `refreshCourierActiveEtas` i `lib/orderEta.ts` så
varje anrop måste ange:

```ts
sink: 'live-ping' | 'durable-event'
```

Använd inget defaultvärde. TypeScript ska tvinga agenten att klassificera varje
call site enligt tabellen i avsnitt 3.3.

Behåll `activeDeliveries?` som lades till i Fas 2, så `/location` fortsätter
återanvända sin enda query.

### 10.2 Skrivregler

`live-ping`:

- fånga `computedAt` en gång före ETA-beräkningen och bär med den genom writen;
- beräkna med senaste effektiva courier-position;
- skriv varje snapshot till Redis;
- om en enskild Redis-write är disabled/unavailable ska just den snapshoten
  skrivas till PG som i dag;
- om writen returnerar `superseded` finns redan en nyare Redis-snapshot; gör
  ingen PG-fallback och skriv aldrig den äldre ETA:n till PG;
- en fungerande Redis-write ska inte följas av en `Order`-write.

PG-fallbacken ska vara en compare-and-swap på den `status` och `updatedAt` som
ETA:n beräknades från. Använd `updateMany`; vid mismatch har ett nyare event
vunnit och den gamla pingen ska avstå, inte skriva eller retry:a över det.

`durable-event`:

- skriv alltid alla sex ETA-fält till PostgreSQL;
- använd den returnerade orderns `status` och nya `updatedAt` som Redis-revision;
- skriv därefter motsvarande Redis-snapshot best effort;
- om Redis-write misslyckas ska eventet fortfarande lyckas via PG;
- terminal/cancelled snapshot ska atomiskt ersätta metadata och alla sex värden
  inklusive nuller. Radera inte bara nyckeln: en långsam ping som startade före
  statusövergången kan annars återskapa gammal ETA efter `DEL`.

Även durable PG-writen ska guardas på den status/revision som beräkningen läste.
Vid konflikt: ladda om ordern och räkna om högst en gång; om den andra CAS:en
också förlorar ska funktionen avstå kontrollerat och låta vinnande event äga
snapshotten. Redis-metadata tas från den lyckade PG-writens därefter återlästa
`status`/`updatedAt`, aldrig från det första stale objektet.

Extrahera ETA-sink/persistensbeslutet bakom en injicerbar Prisma-lik adapter så
tester kan räkna PG-writes och skapa statusrace deterministiskt. Använd inte
regex på källkod som bevis för noll writes eller fallback.

`refreshOrderEta` ska vid tilldelad courier overlaya dennes live-position före
beräkningen. Då får adminstatusvägar inte stale PG-position bara för att deras
caller inte redan har ett courier-objekt.

### 10.3 Race-skydd

En Redis-läsare får bara använda ETA när:

- snapshotversionen stöds;
- `orderStatus` exakt matchar den redan lästa PG-ordern;
- `orderUpdatedAt` är exakt samma som PG-orderns `updatedAt`;
- samtliga sex fält går att avkoda.

CAS-skrivningen ska hindra följande race:

1. ping A börjar, ping B börjar senare och skriver först — A får inte skriva
   över B;
2. ping A börjar före `DELIVERED`, durable-event skriver terminal ETA — A får
   inte återuppliva den gamla statusens ETA;
3. admin ändrar `estimatedTime` utan statusbyte — en äldre live-snapshot får
   inte skriva över den nya durable ETA:n.

### 10.4 Läsare

Behåll `etaResponseFields`, `customerStepEtaEndsAt`, `jobFromOrder` och
`activeFromDelivery` synkrona och rena. Hämta Redis i batch och overlaya
objekten före dessa helpers.

Täck:

- `routes/courier.ts`, `GET /active` och `GET /deliveries/:id`;
- `routes/orders.ts`, kundtracking `GET /:id`, före både
  `customerStepEtaEndsAt` och `etaResponseFields`;
- `routes/orders.ts`, båda idempotency-/checkout-replay-svaren kring nuvarande
  rad 324–365 och 1573–1578, efter respektive ägarskapskontroll;
- `routes/admin.ts`, orderlistan `GET /orders`, med en batch för upp till 200
  order, inte N Redis-roundtrips;
- `routes/admin.ts`, orderdetalj `GET /orders/:id`;
- `routes/hermes.ts`, orderlookup/sammanfattning, med batch för de få order som
  visas.

Följande event-/outboxkonsumenter ska fortsätta läsa durable PG-ETA och får
inte bli beroende av flyktig Redis-data:

- `emitOrderStatus` i `routes/courier.ts`;
- `pushLiveActivityForOrder` i `lib/liveActivityDispatch.ts`;
- `dispatchCustomerOrderStatus` i `lib/customerOrderNotifier.ts`;
- `repairCurrentOrderNotification` i
  `lib/customerNotificationReconciler.ts`.

Samma durable-regel gäller status-emits i `admin.ts` kring nuvarande rad
936–940 och 1070–1075, dev/self-delivery-emits i `orders.ts` kring 2536/2585,
debug Live Activity kring 2298–2332 samt skapanderesponsen kring 1703. De
använder den nyss persisterade event-snapshotten; lägg inte in en ny Redis-read
mellan PG-commit och emit/response.

Historik-/profilvyerna `profile.ts GET /orders` och
`admin.ts GET /customers/:id/orders` får avsiktligt visa durable PG-ETA och ska
inte live-overlayas. De är inte live-trackingytor. Dokumentera detta i kodkommentar
om råa Order-rader fortsätter spreadas där.

### 10.5 Grind

Lägg tester för triggerklassificeringen, race-skyddet, alla-null, datum/noll,
batchoverlay, PG-CAS vid Redisfel, durable reload-once och kundtrackingens
fallback. Kör hela avsnitt 13.

**Grind 3:** fungerande Redis ger noll `Order`-writes från `/location`;
Redisfel ger samma PG-writes som före ändringen; alla status-event är durable.

## 11. Fas 4 — auth-cache, separat säkerhetsgrind

Implementera denna fas efter position och ETA. Lämna den avstängd i produktion
tills revocation-racet är verifierat. Använd en separat opt-in:

```env
LIVE_STATE_AUTH_CACHE=0
```

Endast exakt värde `1`, tillsammans med aktivt live-state, aktiverar cachen.

### 11.1 Allowlist

Skapa `src/lib/courierAuthCache.ts` och en `CourierAuthContext` med endast:

- `v`, `id`, `name`, `email`, `phone`, `city`, `vehicle`, `online`,
  `isActive`, `tokenVersion`, `updatedAt`.

Koda `updatedAt` som epoch ms på wire och avkoda/validera explicit. Byt
`CourierRequest.courier?: any` till `CourierAuthContext` och spara även JWT:ns
verifierade `tv` separat på requesten för färska mutationskontroller. Typningen
ska göra det till ett compile-fel att återanvända saknade `ratePerKm`- eller
positionsfält från auth-context.

Lägg nu till auth-primitiverna från avsnitt 6 i `liveState.ts`. De ska returnera
`disabled` när `LIVE_STATE_AUTH_CACHE` inte är exakt `1`, även om position/ETA
använder Redis. Lägg codec-/schema-/CAS-testerna i `liveState.test.ts` i denna
fas.

Exkludera uttryckligen:

- `passwordHash`, personnummer, adress, payout-konto och profilbild;
- FCM/APNs-token och pushmetadata;
- `ratePerKm` och alla positionsfält.

Använd en Prisma-`select` som endast hämtar allowlisten. Trasig JSON, okänd
version eller saknat fält ska vara cache-miss och best-effort-raderas.

### 11.2 Cache-aside utan stale refill

I `requireCourier`:

1. verifiera JWT på exakt samma sätt som i dag;
2. läs cache;
3. vid miss, läs allowlistad context från PG;
4. fyll cachen atomiskt endast om hashnyckeln saknas och sätt 30 s TTL, så en
   sen gammal DB-läsning inte kan skriva över en mutation som redan gjort
   write-through;
5. kontrollera `isActive` och `tokenVersion` exakt som i dag;
6. vid disabled/unavailable, använd PG direkt.

Cacha inte negativa “kurir saknas”-resultat.

Auth-relevanta mutationer är:

- `/session/start`;
- `/session/stop`;
- `/vehicle`;
- admin `/:id/revoke`;
- admin `PATCH /:id` för `isActive`, stad, fordon, telefon, e-post, lösenord,
  `tokenVersion` och `online`.

För dessa: best-effort-invalidera före PG-mutationen, gör PG-mutationen med
`select` av den nya contexten, och skriv den nya contexten efter lyckad commit.
Den sista operationen är en atomisk revision-CAS på `updatedAt`, inte en blind
overwrite. En äldre samtidig mutation får inte skriva över en nyare context.
Detta protokoll stänger både cache-aside-racet och omordnade mutationer.

Vid exakt samma `updatedAt` och identisk payload får cachen behållas. Vid samma
revision men olika payload ska CAS-scriptet radera auth-nyckeln och returnera
`conflict`, så nästa request läser sanningen från PG; välj inte godtyckligt en
av payloadarna.

Push-tokenmutationerna i `courierFcm.ts`/`courierApns.ts` kräver ingen
invalidation eftersom pushfält inte cachas.

### 11.3 Färsk PG-kontroll för varaktiga mutationer

En stale auth-cache får inte låta en revokad kurir återöppna sin session eller
ändra en order. Skapa ett gemensamt middleware/helper som läser aktuell
allowlistad context från PG och återkontrollerar `isActive` samt JWT:ns
`tokenVersion` för lågfrekventa, varaktiga mutationer.

Använd kontrollen på:

- `/session/start` och `/vehicle`;
- accept och decline;
- picked-up och complete;
- push subscribe/unsubscribe/register/unregister samt push test.

`/location` undantas eftersom den är högfrekvent; efter revoke är kuriren redan
`online:false`/`isActive:false` i PG och kan inte dispatchas eller vinna accept.
`/session/stop` ska fortsätta få stänga en session och är alltid en säker
mutation. Read-only endpoints kan ha auth-cachens dokumenterade, maximalt
30-sekunders stale-fönster.

`/session/start` ska dessutom använda en villkorad PG-update på aktuell
`tokenVersion` och `isActive=true`, så en revoke mellan färskhetskontrollen och
uppdateringen inte kan återställa `online:true`.

Jämför alltid PG `tokenVersion` med JWT-payloadens faktiska `tv`. Vid mismatch
ska svaret använda samma 401-kontrakt som `requireCourier`, inte ett nytt
felmeddelande eller 500.

### 11.4 Pengar och kritisk accept

Accept-routen ska, precis före `Delivery.create`, läsa aktuell `ratePerKm`,
`isActive` och `tokenVersion` från PostgreSQL. Avvisa om kontot/tokenen inte
längre är giltig. Beräkna och frys ersättningen från denna PG-läsning.

Återanvänd gärna den färska mutationskontrollens PG-resultat och inkludera
`ratePerKm` i just accept-selecten; gör inte två redundanta queries.

Gör fortfarande ingen extra positions-Redis-roundtrip före `Delivery.create`.

Detta skyddar både accept-racet och pengar från en 30 sekunder gammal
auth-context.

### 11.5 Känd failure trade-off

En cache kan inte ge stark konsistens över PG och Redis vid ett partiellt fel.
Med protokollet ovan är revoke omedelbar när Redis-mutationen lyckas och
bounded till auth-TTL när just write-through misslyckas men en gammal nyckel
senare blir läsbar igen. Därför:

- TTL är 30 s, inte 60 s;
- alla lågfrekventa varaktiga mutationer gör PG-revalidering;
- auth-cachen är separat avstängningsbar;
- produktion aktiverar den först efter uttryckligt godkännande.

### 11.6 Grind

Testa hit/miss/unavailable, corrupt JSON, inactive, tokenVersion, parallell
gammal fill + revoke, omordnade samtidiga mutationer, alla mutationsguards
ovan och nyligen ändrad `ratePerKm`.

**Grind 4:** endast den uttryckliga, TTL-begränsade auth-allowlisten förekommer
i serialiserad context; inga lösenords-, KYC-, payout-, positions- eller
pushhemligheter finns där. Revoke-racet är reproducerat i test och alla
varaktiga mutationsguards är verifierade.

## 12. Observability och lokal drift

### 12.1 Miljövariabler

Dokumentera i `packages/api/.env.example`:

```env
REDIS_URL=
LIVE_STATE=pg
LIVE_STATE_AUTH_CACHE=0
LIVE_STATE_KEY_PREFIX=viaeats:live:v1
```

`REDIS_URL` är gemensam anslutningsinformation, men Socket.IO och live-state
har separata klienter och felhantering.

### 12.2 Hälsa

Den nuvarande admin-health-routen säger `up` bara för att `REDIS_URL` finns.
Rapportera de två konsumenterna separat:

- live-state: mode samt riktig kort `PING`/latens när mode är `redis`;
- Socket.IO-adaptern: `connected | fallback | unconfigured`, från ett litet
  read-only statusvärde i `lib/socket.ts`.

En live-state-PING bevisar inte att Socket.IO-adaptern anslöt; den kan ha fallit
tillbaka till in-memory. `LIVE_STATE=pg` får inte skapa live-klienten bara för
health. Behåll befintliga status-enumet `up | down | unconfigured` och befintlig
`services.redis` för bakåtkompatibilitet; lägg till separata detaljfält utan att
ta bort gamla. Exponera aldrig URL eller feltext som kan innehålla credentials.

### 12.3 Lokal Redis

Starta via compose, inte med ett anonymt produktionskommando:

```bash
docker compose up -d redis
```

Lokal `.env` kan använda `redis://localhost:6379`, men lägg aldrig en riktig
Railway-URL i repo eller testlogg.

## 13. Obligatorisk verifiering efter varje integrationsfas

Kör från reporoten:

```bash
pnpm --filter @viaeats/api test:live-state
pnpm --filter @viaeats/api test:contracts
pnpm --filter @viaeats/api test:dispatch
pnpm --filter @viaeats/api test:order-status
pnpm --filter @viaeats/api test:hermes
pnpm --filter @viaeats/api test:customer-notifier
pnpm --filter @viaeats/api test:notification-reconciler
pnpm --filter @viaeats/api test:order-access
pnpm --filter @viaeats/api exec tsc --noEmit
git diff --check
git status --short
```

Lägg till ett explicit ETA-testscript om de nya ETA-kontrakten inte körs av
`test:live-state`. Observera att nuvarande `test:contracts` inte automatiskt
kör en ny `liveState.test.ts`; därför krävs det nya package-scriptet.

Verifiera tre lägen:

| Läge | Förväntan |
|---|---|
| `LIVE_STATE=pg` | exakt gamla PG-vägar, ingen live-klient |
| Redis aktiv och frisk | live writes/reads, write-behind enligt TTL |
| Redis aktiv men klienten kastar | omedelbar PG-fallback, inga Redis-orsakade 500 |

För real-Redis-smoke, använd endast lokal/testinstans och unik prefix. Kontrollera
TTL på nycklarna, att äldre CAS-writes nekas och att inga nycklar skapas utan
prefix.

## 14. Railway — separat handoff, inte del av kodagentens fria mandat

Kodagenten ska stanna innan den skapar tjänst, sätter variabler eller deployar.
Be användaren om något av följande:

1. en redan inloggad/länkad Railway CLI-session och bekräftelse på exakt
   environment/service; eller
2. att användaren gör dashboard-stegen nedan.

Ingen Redis- eller Railway-åtkomst behövs för att implementera och testa
off/fake/local-lägena.

### 14.1 Dashboard, rekommenderad väg

I projektet `laudable-recreation`:

1. välj rätt environment, helst staging före production;
2. lägg till Redis via `+ New` → Database → Redis;
3. på API-tjänsten, skapa reference variable
   `REDIS_URL=${{Redis.REDIS_URL}}` där `Redis` ersätts med tjänstens faktiska
   namn;
4. sätt först `LIVE_STATE=pg` och `LIVE_STATE_AUTH_CACHE=0`;
5. deploya och verifiera att API samt Socket.IO startar;
6. sätt `LIVE_STATE=redis`, deploya och canary-verifiera position + ETA;
7. lämna auth-cachen `0` tills Fas 4:s säkerhetsgrind är godkänd.

Se Railways officiella dokumentation för
[Redis-tjänsten och `REDIS_URL`](https://docs.railway.com/databases/redis) samt
[reference variables](https://docs.railway.com/variables/reference).

### 14.2 CLI, endast efter uttryckligt godkännande

Verifiera först target med read-only `railway status` och CLI-hjälpen. Aktuell
Railway-dokumentation anger `railway add --database redis` för att lägga till
databasen och `railway variables set` för variabler:

- [`railway add`](https://docs.railway.com/cli/add)
- [`railway variables`](https://docs.railway.com/cli/variable)

Gissa aldrig environment eller service-id. Skriv inte ut renderad `REDIS_URL`.
Använd en reference variable, inte en kopierad publik TCP-URL.

## 15. Produktionsrollout och rollback

Rolloutordning:

1. deploya kod med `LIVE_STATE=pg`;
2. verifiera baseline/API/socket;
3. aktivera `LIVE_STATE=redis` med auth-cache av;
4. följ felloggar, Redis-minne/latens, API-latens och Postgres writes minst en
   full kurirsession;
5. verifiera manuellt: start session, flera positioner, admin-karta,
   kundtracking, jobs, accept, picked-up, complete och session stop;
6. verifiera att en positionping ger högst en Courier-write/minut och noll
   Order-writes när Redis är frisk;
7. aktivera auth-cache separat endast efter beslut.

Omedelbar rollback:

- sätt `LIVE_STATE=pg` och redeploya/restarta API;
- låt `REDIS_URL` vara kvar så Socket.IO-adaptern fortsätter fungera;
- radera inte Redis-tjänsten under incidenten;
- Redis-live-data får självdö via TTL. Ingen backfill eller DB-rollback behövs.

## 16. Definition of done

Kärnleveransen är klar först när:

- [ ] alla kommandon i avsnitt 13 är gröna;
- [ ] `LIVE_STATE=pg` bevisligen följer gamla PG-vägar;
- [ ] Redis hit/miss/unavailable har olika testad semantik;
- [ ] klienten återhämtar sig efter ett Redis-avbrott;
- [ ] inga Redis-fel ensamt orsakar 500;
- [ ] position-CAS och ETA-CAS stoppar äldre writes;
- [ ] PG-position och Redis-position jämförs på timestamp;
- [ ] första positionen och session stop flushas till PG;
- [ ] efterföljande positionspingar skriver Courier högst en gång/minut;
- [ ] fungerande Redis ger noll Order-writes från positionsping;
- [ ] samtliga position- och ETA-läsare i planen är overlayade i batch där det
  är möjligt;
- [ ] dispatch candidate-form, scoring, vågor och accept-race är oförändrade;
- [ ] durable events skriver PG före/bredvid best-effort Redis;
- [ ] endast uttryckligt allowlistad, TTL-begränsad position/profil-PII finns i
  Redis; aldrig lösenord, KYC-, payout- eller pushhemligheter;
- [ ] inga Prisma-migrationer finns i diffen;
- [ ] inga klientfiler, `dispatchScoring.ts` eller `travelMatrix.ts` är ändrade;
- [ ] endast avsedda filer finns i `git status`;
- [ ] implementationen är inte pushad/deployad utan separat tillstånd.

Auth-cachen är klar först när dess extra grind i Fas 4 också är uppfylld.

## 17. Explicit senare arbete — implementera inte nu

Följande är egna framtida projekt:

- GEO-index per stad, först när en faktisk GEO-läsare ersätter en PG-query;
- separat presence, först när heartbeat kan ske utan GPS;
- travel-matrix-cache i Redis;
- 3–5 sekunders jobbpool-cache;
- multi-instans-dedup för dispatch/push.

Om dedup görs senare måste `dispatchStarted` och `newJobNotified` få två olika
nyckelfamiljer, exempelvis `dispatch:start-dedup:{orderId}` och
`push:new-job-dedup:{orderId}`. En gemensam nyckel kan göra att dispatch och
push blockerar varandra. `SET NX` ensam gör dessutom inte hela
`advanceDispatch/createNextOffer` multi-instanssäkert; det kräver ett separat
distribuerat eller DB-baserat lås och en egen designgranskning.
