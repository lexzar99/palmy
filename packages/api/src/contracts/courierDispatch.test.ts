// ---------------------------------------------------------------------------
//  Kontrakt: smart kurir-tilldelning (dispatchScoring + orderEta-simulering).
//
//  Verifierar de klassiska scenarierna som styr vem som får ett nytt uppdrag.
//  Ingen DB — bygger order/kurir-fixturer och kör de rena funktionerna.
// ---------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { estimateOrderEta } from '../lib/orderEta';
import { computeDispatchScore, rankDispatchCandidates } from '../lib/dispatchScoring';
import { haversineKm } from '../utils/geo';

const NOW = new Date('2026-07-21T17:00:00Z');

// Lund centrum ≈ (55.70, 13.19). 0.009° lat ≈ 1 km.
const R = { latitude: 55.7, longitude: 13.19 };
const km = (n: number) => n * 0.009;

let orderSeq = 0;
function makeOrder(opts: { dropLat: number; dropLng: number; status?: string }) {
  orderSeq += 1;
  return {
    id: `order-${orderSeq}`,
    type: 'DELIVERY',
    status: opts.status ?? 'READY',
    createdAt: new Date(NOW.getTime() - 10 * 60_000),
    estimatedTime: 20,
    restaurant: { ...R, city: 'Lund', selfDelivery: false },
    deliveryLatitude: opts.dropLat,
    deliveryLongitude: opts.dropLng,
  };
}

// Aktiv leverans som redan är PICKED_UP → kuriren måste köra dropoffen först.
function pickedUpDelivery(dropLat: number, dropLng: number) {
  const order = makeOrder({ dropLat, dropLng, status: 'DELIVERING' });
  return { status: 'PICKED_UP', orderId: order.id, order };
}

// Aktiv leverans på väg till hämtning (maten redo) → pickup + dropoff kvar.
function enRoutePickupDelivery(dropLat: number, dropLng: number) {
  const order = makeOrder({ dropLat, dropLng, status: 'READY' });
  return { status: 'EN_ROUTE_PICKUP', orderId: order.id, order };
}

function makeCourier(opts: { lat: number; lng: number; fresh?: boolean }) {
  return {
    currentLat: opts.lat,
    currentLng: opts.lng,
    vehicle: 'BIKE',
    lastSeenAt: opts.fresh === false ? new Date(NOW.getTime() - 30 * 60_000) : NOW,
  };
}

function candidateFor(
  id: string,
  courier: any,
  activeDeliveries: any[],
  newOrder: any,
) {
  const eta = estimateOrderEta(newOrder, { now: NOW, courier, activeDeliveries, appendAsCandidate: true });
  const dist = Math.round(haversineKm(courier.currentLat, courier.currentLng, R.latitude, R.longitude) * 10) / 10;
  const fresh = NOW.getTime() - courier.lastSeenAt.getTime() < 5 * 60_000;
  return {
    courierId: id,
    etaCustomerMin: eta.etaCustomerMin,
    activeCount: activeDeliveries.length,
    pickupDistanceKm: dist,
    hasLocation: true,
    locationFresh: fresh,
  };
}

// --- Scenario 1: "2 bud online — A har 1 order men är långt bort, B har 3
// ordrar men står nära restaurangen." B:s tre stopp körs FÖRE den nya ordern,
// så B:s närhet hjälper inte kunden → A ska vinna trots längre väg.
{
  const newOrder = makeOrder({ dropLat: R.latitude, dropLng: R.longitude + km(1) });
  const courierA = makeCourier({ lat: R.latitude, lng: R.longitude - km(3) });
  const activeA = [pickedUpDelivery(R.latitude, R.longitude - km(3.2))]; // nästan framme vid sin drop
  const courierB = makeCourier({ lat: R.latitude, lng: R.longitude + km(0.5) });
  const activeB = [
    pickedUpDelivery(R.latitude + km(2), R.longitude),
    pickedUpDelivery(R.latitude + km(2.3), R.longitude),
    pickedUpDelivery(R.latitude + km(2.6), R.longitude),
  ];
  const ranked = rankDispatchCandidates([
    candidateFor('A', courierA, activeA, newOrder),
    candidateFor('B', courierB, activeB, newOrder),
  ]);
  assert.equal(ranked[0].courierId, 'A', 'scenario 1: A (1 order, längre bort) ska slå B (3 ordrar, nära)');
  assert.ok(
    (ranked[0].etaCustomerMin ?? 999) < (ranked[1].etaCustomerMin ?? 999),
    'scenario 1: A ska ge kunden maten snabbare',
  );
}

// --- Scenario 2: B har fler ordrar men är NÄSTAN KLAR och står granne med
// restaurangen; A är ledig men långt bort → B ska vinna. Belastning i sig
// diskvalificerar inte — det är kundens ETA som styr.
{
  const newOrder = makeOrder({ dropLat: R.latitude, dropLng: R.longitude + km(1) });
  const courierA = makeCourier({ lat: R.latitude, lng: R.longitude - km(4) });
  const courierB = makeCourier({ lat: R.latitude, lng: R.longitude + km(0.4) });
  const activeB = [pickedUpDelivery(R.latitude, R.longitude + km(0.5))]; // 100 m till sista droppen
  const ranked = rankDispatchCandidates([
    candidateFor('A', courierA, [], newOrder),
    candidateFor('B', courierB, activeB, newOrder),
  ]);
  assert.equal(ranked[0].courierId, 'B', 'scenario 2: B (nästan klar, nära) ska slå A (ledig, långt bort)');
}

// --- Scenario 3: båda lediga → närmast vinner.
{
  const newOrder = makeOrder({ dropLat: R.latitude, dropLng: R.longitude + km(1) });
  const ranked = rankDispatchCandidates([
    candidateFor('NEAR', makeCourier({ lat: R.latitude, lng: R.longitude - km(1) }), [], newOrder),
    candidateFor('FAR', makeCourier({ lat: R.latitude, lng: R.longitude - km(2.5) }), [], newOrder),
  ]);
  assert.equal(ranked[0].courierId, 'NEAR', 'scenario 3: närmast lediga budet vinner');
}

// --- Scenario 4: identiskt läge men gammal GPS → färsk position vinner, men
// straffet är nästan noll (senaste kända position används) — en klart bättre
// ETA ska alltid slå färskhet.
{
  const newOrder = makeOrder({ dropLat: R.latitude, dropLng: R.longitude + km(1) });
  const ranked = rankDispatchCandidates([
    candidateFor('STALE', makeCourier({ lat: R.latitude, lng: R.longitude - km(1), fresh: false }), [], newOrder),
    candidateFor('FRESH', makeCourier({ lat: R.latitude, lng: R.longitude - km(1) }), [], newOrder),
  ]);
  assert.equal(ranked[0].courierId, 'FRESH', 'scenario 4: vid dött lopp ska färsk GPS slå inaktuell');
  assert.ok(
    ranked[1].score - ranked[0].score <= 2,
    'scenario 4: gammal-GPS-straffet ska vara nästan noll (max 2 min)',
  );
  // ...och ett stale-bud som är tydligt närmare/snabbare ska VINNA över färskt.
  const ranked2 = rankDispatchCandidates([
    candidateFor('STALE_NEAR', makeCourier({ lat: R.latitude, lng: R.longitude - km(0.5), fresh: false }), [], newOrder),
    candidateFor('FRESH_FAR', makeCourier({ lat: R.latitude, lng: R.longitude - km(3) }), [], newOrder),
  ]);
  assert.equal(ranked2[0].courierId, 'STALE_NEAR', 'scenario 4b: bättre ETA slår färskhet');
}

// --- Scenario 5: kandidat utan simulerbar ETA hamnar efter en med riktig ETA.
{
  const ranked = rankDispatchCandidates([
    { courierId: 'UNKNOWN', etaCustomerMin: null, activeCount: 0, pickupDistanceKm: null, hasLocation: true, locationFresh: true },
    { courierId: 'KNOWN', etaCustomerMin: 30, activeCount: 0, pickupDistanceKm: 2, hasLocation: true, locationFresh: true },
  ]);
  assert.equal(ranked[0].courierId, 'KNOWN', 'scenario 5: känd ETA rankas före okänd');
}

// --- Scenario 6: lika ETA → färre aktiva ordrar vinner (rättvisa/buffert).
{
  const a = computeDispatchScore({ courierId: 'x', etaCustomerMin: 25, activeCount: 0, pickupDistanceKm: 1, hasLocation: true, locationFresh: true });
  const b = computeDispatchScore({ courierId: 'y', etaCustomerMin: 25, activeCount: 3, pickupDistanceKm: 1, hasLocation: true, locationFresh: true });
  assert.ok(a < b, 'scenario 6: samma ETA → lägre belastning ska ge lägre (bättre) poäng');
}

// --- Scenario 7: helt utan position → simuleringens första ben blir gratis
// (optimistisk ETA), så budet får ett måttligt straff och ska INTE slå ett
// likvärdigt bud med känd (om än gammal) position.
{
  const withPos = computeDispatchScore({ courierId: 'known', etaCustomerMin: 25, activeCount: 0, pickupDistanceKm: 1.5, hasLocation: true, locationFresh: false });
  const noPos = computeDispatchScore({ courierId: 'ghost', etaCustomerMin: 25, activeCount: 0, pickupDistanceKm: null, hasLocation: false, locationFresh: false });
  assert.ok(withPos < noPos, 'scenario 7: senaste kända position ska slå ingen position alls');
}

// --- Scenario 8: best-insertion + batchning. Kuriren är på väg att hämta en
// order på restaurang R (drop 3 km norrut). Ny order från SAMMA restaurang
// med drop strax bortom den första. Append sist = kör norrut, tillbaka till R,
// norrut igen. Best-insertion = ta båda påsarna på en gång → klart snabbare.
{
  const newOrder = makeOrder({ dropLat: R.latitude + km(3.2), dropLng: R.longitude });
  const courier = makeCourier({ lat: R.latitude - km(0.5), lng: R.longitude });
  const active = [enRoutePickupDelivery(R.latitude + km(3), R.longitude)];
  const append = estimateOrderEta(newOrder, { now: NOW, courier, activeDeliveries: active, appendAsCandidate: true });
  const best = estimateOrderEta(newOrder, { now: NOW, courier, activeDeliveries: active, appendAsCandidate: true, insertion: 'best' });
  assert.ok(
    (best.etaCustomerMin ?? 999) < (append.etaCustomerMin ?? 999),
    `scenario 8: best-insertion (${best.etaCustomerMin} min) ska slå append sist (${append.etaCustomerMin} min)`,
  );
}

// --- Scenario 9: skyddet för befintliga kunder. Kuriren är 100 m från sin
// sista lämning; nya orderns hämtning kräver en omväg som skulle försena den
// befintliga kunden mer än taket → insättning förkastas, nya ordern körs sist
// (samma ETA som append).
{
  const newOrder = makeOrder({ dropLat: R.latitude - km(4), dropLng: R.longitude });
  const courier = makeCourier({ lat: R.latitude + km(2.9), lng: R.longitude });
  const active = [pickedUpDelivery(R.latitude + km(3), R.longitude)];
  const append = estimateOrderEta(newOrder, { now: NOW, courier, activeDeliveries: active, appendAsCandidate: true });
  const best = estimateOrderEta(newOrder, { now: NOW, courier, activeDeliveries: active, appendAsCandidate: true, insertion: 'best' });
  assert.equal(
    best.etaCustomerMin,
    append.etaCustomerMin,
    'scenario 9: insättning som försenar befintlig kund > taket ska förkastas (ETA = append)',
  );
}

// --- Scenario 10: ruttmatris-koppling. En lookup som säger att alla vägar är
// 10 km långa (broar/floder!) ska ge längre ETA än fågelvägen för en kort tur.
{
  const newOrder = makeOrder({ dropLat: R.latitude + km(1), dropLng: R.longitude });
  const courier = makeCourier({ lat: R.latitude - km(0.5), lng: R.longitude });
  const detourLookup = () => ({ durationMin: 20, distanceKm: 10 });
  const straight = estimateOrderEta(newOrder, { now: NOW, courier, activeDeliveries: [], appendAsCandidate: true });
  const routed = estimateOrderEta(newOrder, { now: NOW, courier, activeDeliveries: [], appendAsCandidate: true, travelLookup: detourLookup });
  assert.ok(
    (routed.etaCustomerMin ?? 0) > (straight.etaCustomerMin ?? 999),
    `scenario 10: vägnätets restid (${routed.etaCustomerMin} min) ska användas framför fågelvägen (${straight.etaCustomerMin} min)`,
  );
}

console.log('courier dispatch contracts: ok');
