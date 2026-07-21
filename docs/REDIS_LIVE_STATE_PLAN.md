# Redis för live-tillstånd: plan för implementation

Skriven 2026-07-22. Målgrupp: AI-agent/utvecklare som implementerar detta
självständigt ("Luna"). All kod som nämns ligger i `packages/api/` (Express +
Prisma/PostgreSQL + Socket.IO, deployas på Railway, tjänsten "ViaEats API" i
projektet `laudable-recreation`).

## Mål

Flytta högfrekvent, flyktig data (kurirpositioner, live-ETA:er, presence,
auth-cache) från PostgreSQL till Redis så att databasen avlastas. Postgres
behåller allt varaktigt/transaktionellt. Ingen funktionalitet får ändras för
klienterna (kurirappar, admin, kundweb) — bara var datan bor.

## Avgränsning — rör INTE detta (ägs av annat pågående arbete)

- `packages/api/src/lib/dispatchScoring.ts` och poänglogiken i
  `packages/api/src/lib/dispatch.ts` (smart tilldelning). Du får LÄSA position
  från Redis i `buildDispatchCandidates` (se Fas 1), men ändra inte poäng,
  vågor eller offer-flödet.
- `packages/api/src/lib/travelMatrix.ts` (OSRM-integrationen) — dess
  in-memory-cache flyttas eventuellt i Fas 4, men bara om Fas 1–3 är klara.
- Flutter-kurirappen (`mobile_apps/Delivera courier/`) och kurir-PWA:n
  (`apps/courier/`) — inga API-kontraktsändringar behövs; klienterna märker
  ingenting.
- Kör ALDRIG `prisma migrate deploy`/`db push` mot produktion (se
  `docs/LAUNCH_DATABASE_RUNBOOK.md`). Redis-arbetet kräver ingen DB-migration.

## Nulägesanalys: vad som belastar Postgres idag

Alla siffror per online-kurir. Kurirappen pingar position var 8–10 s och
pollar jobb var 10–15 s.

1. **Positionsping** — `POST /api/courier/location`
   (`packages/api/src/routes/courier.ts`, route `router.post('/location', ...)`):
   - `prisma.courier.update` (currentLat/currentLng/lastSeenAt) — varje ping.
   - `prisma.delivery.findMany` (aktiva leveranser) — varje ping.
   - `refreshCourierActiveEtas` (`packages/api/src/lib/orderEta.ts`) — gör
     ytterligare en `findMany` (med order + restaurant + items!) och EN
     `prisma.order.update` PER aktiv leverans (skriver om 6 ETA-fält).
   - Summa: med 2 aktiva leveranser ≈ 5–6 queries var 8:e sekund, dygnet runt.
2. **Auth på varje request** — `requireCourier`-middlewaren
   (`routes/courier.ts`) gör `prisma.courier.findUnique` på VARJE anrop,
   inklusive varje ping och varje jobb-poll.
3. **Jobb-pollen** — `GET /api/courier/jobs`: orderpool-query + ETA-simulering
   per order + `getActiveOffers` (DispatchOffer-läsning) var 10–15 s per kurir.
4. **Dedup-state i minnet** — `newJobNotified`-Map i
   `packages/api/src/lib/courierPush.ts` och `dispatchStarted`-Map i
   `lib/dispatch.ts` är per-instans (bryter vid multi-instans/omstart).

## Princip

- **Redis = färskvara**: skrivs ofta, läses för "just nu"-beslut, återskapas
  automatiskt av nästa ping om den försvinner. Får försvinna vid omstart.
- **Postgres = fakta**: pengar, ordrar, konton, vem som accepterade vad när,
  bevis, historik. Får aldrig försvinna.
- Tumregel: vore det en katastrof att tappa raden → Postgres. Skriver nästa
  ping ändå över den → Redis.

## Nyckeldesign (Redis)

| Nyckel | Typ | Innehåll | TTL |
|---|---|---|---|
| `courier:pos:{courierId}` | hash | `lat`, `lng`, `at` (epoch ms) | 10 min |
| `courier:geo:{city}` | geo-set (GEOADD) | member = courierId | städas lazy: medlem vars `courier:pos:*` saknas ignoreras/tas bort |
| `courier:presence:{courierId}` | string "1" | heartbeat, förnyas av varje ping | 3 min |
| `order:eta:{orderId}` | hash | de 6 ETA-fälten (`etaReadyAt`, `etaPickupAt`, `etaCustomerAt`, `etaCustomerMin`, `etaPriorityScore`, `etaReason`) | 15 min |
| `courier:auth:{courierId}` | string (JSON av kurir-raden) | cache för requireCourier | 60 s + explicit DEL vid mutationer |
| `dispatch:dedup:{orderId}` | string, SET NX | ersätter in-memory-dedup | 90 s |

City-namn normaliseras med `.trim().toLowerCase()` i geo-nyckeln (jämför
`city: { equals: ..., mode: 'insensitive' }` i befintliga queries).

## Vad som STANNAR i Postgres (ändra inte)

- **`Delivery` + accept-racet**: den unika constrainten på `Delivery.orderId`
  är domaren för vem som vinner en order (`routes/courier.ts`, accept-routen,
  P2002-hanteringen). Flyttas ALDRIG.
- Orders, betalningar, refunds, moms, payout-frysningar (`payOre` m.m.).
- Kurirkonton, passwordHash, tokenVersion, ratePerKm, city, vehicle.
- `DispatchOffer` — revisionslogg för tilldelningen, låg volym, behålls.
- Push-tokens/subscriptions, historik, statistik.
- **Senaste-kända-position-snapshot**: `currentLat/currentLng/lastSeenAt` på
  `Courier` behålls som lågfrekvent kopia (flushas, se Fas 1) så att
  admin-kartan och omstarter har en approximativ bild.

## Fas 1 — positioner (störst vinst, gör först)

1. **Ny modul `packages/api/src/lib/liveState.ts`**:
   - Redis-klient via `redis`-paketet (finns redan i dependencies, används av
     `lib/socket.ts` för Socket.IO-adaptern — återanvänd `REDIS_URL`-env och
     samma anslutningsmönster, men skapa en EGEN klient, dela inte adapterns).
   - Kritiskt mönster (samma som OSRM-fallbacken i `travelMatrix.ts`):
     **alla funktioner har tyst fallback**. Är Redis nere/oconfigurerad ska
     allt bete sig exakt som idag (läs/skriv Postgres). Ingen route får 500:a
     på grund av Redis. Logga varning max 1 gång per 5 min.
   - Env-flagga `LIVE_STATE=pg` stänger av hela lagret (nödbroms, samma
     mönster som `DISPATCH_MODE=open`).
   - API-förslag: `setCourierPosition(courierId, city, lat, lng)`,
     `getCourierPosition(courierId)`, `getCourierPositions(courierIds[])`,
     `touchPresence(courierId)`, `isFresh(courierId)` (presence-TTL:n lever).
2. **Skriv-vägen** — `POST /location` i `routes/courier.ts`:
   - Skriv position till Redis (pos-hash + GEOADD + presence) istället för
     `prisma.courier.update` per ping.
   - **Write-behind-flush**: uppdatera Postgres `currentLat/currentLng/
     lastSeenAt` högst var 60:e sekund per kurir (håll `lastFlushedAt` i
     Redis eller i minnet) samt alltid vid `POST /session/stop`.
   - Socket-emitterna (`courier:location` till order-rum + admin-room) ska
     vara kvar oförändrade.
3. **Läs-vägarna** (Redis först, Postgres-värde som fallback):
   - `buildDispatchCandidates` i `lib/dispatch.ts`: kurirens position +
     färskhet (`hasLocation`/`locationFresh` sätts idag från
     `courier.currentLat`/`lastSeenAt` — läs från liveState istället;
     candidate-objektets FORM får inte ändras).
   - `GET /jobs`-scoringen i `routes/courier.ts` (använder
     `courier.currentLat/currentLng`).
   - `estimateOrderEta`-anropen som får `courier` — skicka in ett
     courier-objekt där currentLat/Lng redan ersatts med Redis-värdet
     (ändra INTE orderEta.ts signatur för detta).
   - Admin-kurirlistan (`adminCourierRouter.get('/')` + `/:id`) — behåll
     Postgres-läsning men overlaya färska Redis-positioner om de finns.
4. **Verifiering**: befintliga kontrakt ska passera: `npm run test:contracts`,
   `npm run test:dispatch`, `npm run test:order-status` (körs från
   `packages/api/`). Lägg till `src/contracts/liveState.test.ts` som testar
   fallback-beteendet UTAN Redis (modulen ska ge Postgres-genomslag när
   klienten saknas — mocka inte Redis, testa off-läget).

## Fas 2 — auth-cache + presence

1. `requireCourier`: läs `courier:auth:{id}` (JSON). Miss → `findUnique` +
   SET EX 60. Vid träff: verifiera `tokenVersion` mot JWT-payloadens `tv`
   precis som idag.
2. **Invalidering (kritiskt)**: `DEL courier:auth:{id}` vid ALLA mutationer av
   kurir-raden: `adminCourierRouter.patch('/:id')` (inkl. e-post/lösenordsbyte
   som bumpar tokenVersion), `POST /:id/revoke`, `POST /session/start|stop`,
   vehicle-ändringar. Sök på `prisma.courier.update` i `routes/courier.ts`
   och täck varje ställe.
3. Ersätt färskhetskollar på `lastSeenAt` med presence-nyckeln där det är
   "är kuriren vid liv nu?"-semantik (dispatchens `locationFresh`).

## Fas 3 — live-ETA till Redis

1. `refreshCourierActiveEtas` + `refreshOrderEta` (`lib/orderEta.ts`): skriv
   ETA-snapshotten till `order:eta:{orderId}` istället för `prisma.order.update`
   NÄR anropet kommer från positionspingen. Vid statusövergångar (accept,
   picked-up, complete i `routes/courier.ts` samt admin-statusändringar) ska
   Postgres FORTSATT uppdateras (dagens beteende) — det är persistensen.
2. Läsare av ETA-fälten: `jobFromOrder`/`activeFromDelivery`
   (`etaResponseFields`), kundtracking-emitterna (`emitOrderStatus`) och
   admin — läs Redis-hashen först, Postgres-fälten som fallback.
3. Resultat: positionspingen slutar helt att skriva på `Order`-tabellen.

## Fas 4 — valfritt, bara om Fas 1–3 är i drift och stabila

- `dispatch:dedup:{orderId}` ersätter `newJobNotified`/`dispatchStarted`-Maps
  (SET NX EX 90) → multi-instans-säkert.
- Delad travel-matrix-cache: flytta par-cachen i `travelMatrix.ts` till Redis
  (hash per par, TTL 10 min). Koordinera — filen ägs av annat spår.
- 3–5 s mikrocache av den scorade jobbpoolen per stad.

## Infrastruktur

1. Provisionera Redis i Railway-projektet `laudable-recreation`
   (dashboard → New → Database → Redis, eller `railway add`). Minnesbehov för
   denna datamängd: < 50 MB.
2. Sätt `REDIS_URL` på tjänsten "ViaEats API" (Railway kan referera
   databasens variabel). OBS: `lib/socket.ts` börjar då automatiskt använda
   Redis-adaptern för Socket.IO — det är önskat och redan byggt/testat, men
   verifiera sockets efter deploy.
3. Lokal utveckling: `docker run -p 6379:6379 redis:7-alpine` +
   `REDIS_URL=redis://localhost:6379` i `packages/api/.env`.

## Definition of done per fas

- Alla kontraktstester gröna + nya fallback-tester.
- `tsc --noEmit` rent i `packages/api`.
- Deploy med `REDIS_URL` osatt beter sig EXAKT som före ändringen.
- Mätbart: efter Fas 1+3 ska en positionsping generera 0 Postgres-writes
  (förutom 1/min-flushen); verifiera i Railway-metrics/pg_stat_statements.
- Commits pushas till `main` OCH `production` (branchen `production` hålls
  i synk med main i detta repo).
