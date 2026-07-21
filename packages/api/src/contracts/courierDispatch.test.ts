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

// --- Scenario 4: identiskt läge men gammal GPS → färsk position vinner.
{
  const newOrder = makeOrder({ dropLat: R.latitude, dropLng: R.longitude + km(1) });
  const ranked = rankDispatchCandidates([
    candidateFor('STALE', makeCourier({ lat: R.latitude, lng: R.longitude - km(1), fresh: false }), [], newOrder),
    candidateFor('FRESH', makeCourier({ lat: R.latitude, lng: R.longitude - km(1) }), [], newOrder),
  ]);
  assert.equal(ranked[0].courierId, 'FRESH', 'scenario 4: färsk GPS ska slå inaktuell GPS');
}

// --- Scenario 5: kandidat utan simulerbar ETA hamnar efter en med riktig ETA.
{
  const ranked = rankDispatchCandidates([
    { courierId: 'UNKNOWN', etaCustomerMin: null, activeCount: 0, pickupDistanceKm: null, locationFresh: true },
    { courierId: 'KNOWN', etaCustomerMin: 30, activeCount: 0, pickupDistanceKm: 2, locationFresh: true },
  ]);
  assert.equal(ranked[0].courierId, 'KNOWN', 'scenario 5: känd ETA rankas före okänd');
}

// --- Scenario 6: lika ETA → färre aktiva ordrar vinner (rättvisa/buffert).
{
  const a = computeDispatchScore({ courierId: 'x', etaCustomerMin: 25, activeCount: 0, pickupDistanceKm: 1, locationFresh: true });
  const b = computeDispatchScore({ courierId: 'y', etaCustomerMin: 25, activeCount: 3, pickupDistanceKm: 1, locationFresh: true });
  assert.ok(a < b, 'scenario 6: samma ETA → lägre belastning ska ge lägre (bättre) poäng');
}

console.log('courier dispatch contracts: ok');
