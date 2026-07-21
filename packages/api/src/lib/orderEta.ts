import prisma from './prisma';
import { getEffectiveEtaMinutes } from './restaurantEta';
import { haversineKm } from '../utils/geo';
import { computeDeliveryWindowMs } from './deliveryWindow';
import type { TravelLookup } from './travelMatrix';

const ACTIVE_DELIVERY_STATUSES = ['EN_ROUTE_PICKUP', 'PICKED_UP'];
const TERMINAL_ORDER_STATUSES = ['DELIVERED', 'COMPLETED'];
const CANCELLED_ORDER_STATUSES = ['REJECTED', 'CANCELLED', 'DELIVERY_FAILED'];

type Coord = { lat: number; lng: number };
type EtaStopKind = 'pickup' | 'dropoff';

type EtaStop = {
  kind: EtaStopKind;
  orderId: string;
  coord: Coord | null;
  readyAt?: Date | null;
  serviceMin: number;
};

export type OrderEtaSnapshot = {
  etaReadyAt: Date | null;
  etaPickupAt: Date | null;
  etaCustomerAt: Date | null;
  etaCustomerMin: number | null;
  etaPriorityScore: number | null;
  etaReason: string | null;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + Math.round(minutes * 60_000));
}

/**
 * ETA for the customer's current tracking step.
 *
 * A restaurant-entered `estimatedTime` is "time until food is ready" for
 * pickup and every delivery mode. It must not be replaced by etaCustomerAt
 * until the delivery has actually started. Otherwise a restaurant entering
 * 35 minutes can incorrectly become 45 minutes for the customer because the
 * route estimate is added before anyone has left the restaurant.
 */
export function customerStepEtaEndsAt(
  order: any,
  statusInput: string = String(order?.status || ''),
): Date | null {
  const status = String(statusInput || '').toUpperCase();
  if (TERMINAL_ORDER_STATUSES.includes(status) || CANCELLED_ORDER_STATUSES.includes(status)) return null;
  if (status === 'PENDING' || status === 'AWAITING_PAYMENT') return null;
  // READY means the preparation promise has already been fulfilled. Platform
  // delivery waits for a courier next, so an old future readyAt must not keep
  // counting down as if the kitchen were still cooking.
  if (status === 'READY') return null;

  const selfDelivery = Boolean(order?.selfDelivery ?? order?.restaurant?.selfDelivery);
  const courierEnRoute = ['DELIVERING', 'OUT_FOR_DELIVERY', 'ON_THE_WAY'].includes(status);

  // Self-delivery has a separate 15-minute transit clock which starts at the
  // actual DELIVERING transition. Reusing etaCustomerAt here can carry the
  // kitchen countdown forward and show e.g. 38 minutes after "På väg".
  if (courierEnRoute && selfDelivery && order?.deliveringAt) {
    const deliveringAt = new Date(order.deliveringAt);
    return new Date(deliveringAt.getTime() + computeDeliveryWindowMs(deliveringAt, String(order?.id || '')));
  }
  if (courierEnRoute && order?.etaCustomerAt) {
    return new Date(order.etaCustomerAt);
  }
  if (courierEnRoute && order?.deliveringAt) {
    const deliveringAt = new Date(order.deliveringAt);
    return new Date(deliveringAt.getTime() + computeDeliveryWindowMs(deliveringAt, String(order?.id || '')));
  }
  if (order?.etaReadyAt) return new Date(order.etaReadyAt);
  if (order?.preparingAt && order?.estimatedTime) {
    return addMinutes(new Date(order.preparingAt), Number(order.estimatedTime));
  }
  if (order?.estimatedTime && ['ACCEPTED', 'PREPARING', 'READY'].includes(status)) {
    return addMinutes(new Date(), Number(order.estimatedTime));
  }
  return null;
}

function minutesBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 60_000;
}

function validCoord(lat: unknown, lng: unknown): Coord | null {
  return typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng)
    ? { lat, lng }
    : null;
}

function restaurantCoord(order: any): Coord | null {
  return validCoord(order?.restaurant?.latitude, order?.restaurant?.longitude);
}

function dropoffCoord(order: any): Coord | null {
  return validCoord(order?.deliveryLatitude, order?.deliveryLongitude);
}

// Trafikfaktor på OSRM:s "fri väg"-restid för bil (ljus, köer, parkering).
const CAR_TRAFFIC_FACTOR = 1.15;

function travelMinutes(
  from: Coord | null,
  to: Coord | null,
  vehicle?: string | null,
  travel?: TravelLookup | null,
): number {
  if (!from || !to) return 0;
  // Samma plats (< 50 m), t.ex. två ordrar från samma restaurang → ingen
  // restid alls. Utan detta kostade varje batchat stopp minst 3 "resminuter"
  // och best-insertion kunde aldrig löna sig för samlade hämtningar.
  if (haversineKm(from.lat, from.lng, to.lat, to.lng) < 0.05) return 0;
  const isCar = String(vehicle || '').toUpperCase() === 'CAR';
  const minPerKm = isCar ? 2.8 : 4.4;
  // Riktig ruttmatris (OSRM) när den finns: bil får verklig restid, cykel får
  // verkligt VÄGavstånd (ser broar/floder) × cykelns min/km. Okänt par eller
  // ingen matris → haversine som förut.
  const hit = travel?.(from, to) ?? null;
  if (hit) {
    const minutes = isCar ? hit.durationMin * CAR_TRAFFIC_FACTOR : hit.distanceKm * minPerKm;
    return clamp(2 + minutes, 3, 55);
  }
  const km = haversineKm(from.lat, from.lng, to.lat, to.lng);
  return clamp(2 + km * minPerKm, 3, 55);
}

function deliveryMinutes(order: any, vehicle?: string | null): number {
  const from = restaurantCoord(order);
  const to = dropoffCoord(order);
  if (!from || !to) return 18;
  return clamp(travelMinutes(from, to, vehicle) + 4, 10, 45);
}

function restaurantPrepMinutes(order: any): number {
  if (typeof order?.estimatedTime === 'number' && Number.isFinite(order.estimatedTime)) {
    return clamp(order.estimatedTime, 5, 90);
  }
  if (order?.restaurant) return getEffectiveEtaMinutes(order.restaurant);
  return 40;
}

function readyAtFor(order: any, now: Date): Date | null {
  const status = String(order?.status || '').toUpperCase();
  if (TERMINAL_ORDER_STATUSES.includes(status) || CANCELLED_ORDER_STATUSES.includes(status)) return null;
  if (order?.type === 'PICKUP') {
    const anchor = order?.preparingAt ? new Date(order.preparingAt) : new Date(order?.createdAt ?? now);
    return status === 'READY' ? now : addMinutes(anchor, restaurantPrepMinutes(order));
  }
  if (status === 'DELIVERING' || status === 'OUT_FOR_DELIVERY' || status === 'ON_THE_WAY') {
    // Once the food has left the restaurant, the delivery estimate starts
    // from the real pickup/departure time — never from the old kitchen ETA.
    return order?.deliveringAt ? new Date(order.deliveringAt) : now;
  }
  if (status === 'READY') {
    return order?.etaReadyAt ? new Date(order.etaReadyAt) : now;
  }
  const anchor = order?.preparingAt ? new Date(order.preparingAt) : new Date(order?.createdAt ?? now);
  const calculated = addMinutes(anchor, restaurantPrepMinutes(order));
  return calculated.getTime() < now.getTime() && status !== 'PENDING' ? now : calculated;
}

function targetCustomerAt(order: any, readyAt: Date | null, vehicle?: string | null): Date | null {
  if (!readyAt) return null;
  if (order?.scheduledFor) return new Date(order.scheduledFor);
  if (order?.type === 'PICKUP') return readyAt;
  return addMinutes(new Date(order?.createdAt ?? readyAt), restaurantPrepMinutes(order) + deliveryMinutes(order, vehicle));
}

function stopsForDelivery(delivery: any, readyByOrder: Map<string, Date | null>): EtaStop[] {
  const order = delivery?.order;
  if (!order) return [];
  const stops: EtaStop[] = [];
  const status = String(delivery?.status || '').toUpperCase();
  if (status === 'EN_ROUTE_PICKUP') {
    stops.push({
      kind: 'pickup',
      orderId: order.id,
      coord: restaurantCoord(order),
      readyAt: readyByOrder.get(order.id) ?? null,
      serviceMin: 3,
    });
  }
  if (status === 'EN_ROUTE_PICKUP' || status === 'PICKED_UP') {
    stops.push({
      kind: 'dropoff',
      orderId: order.id,
      coord: dropoffCoord(order),
      serviceMin: 4,
    });
  }
  return stops;
}

function stopsForCandidate(order: any, readyAt: Date | null): EtaStop[] {
  if (order?.type === 'PICKUP') return [];
  return [
    { kind: 'pickup', orderId: order.id, coord: restaurantCoord(order), readyAt, serviceMin: 3 },
    { kind: 'dropoff', orderId: order.id, coord: dropoffCoord(order), serviceMin: 4 },
  ];
}

type SimulateOptions = { now: Date; start: Coord | null; vehicle?: string | null; travel?: TravelLookup | null };

function simulateRoute(
  stops: EtaStop[],
  options: SimulateOptions,
): { pickupAtByOrder: Map<string, Date>; customerAtByOrder: Map<string, Date>; routeEndsAt: Date } {
  const pickupAtByOrder = new Map<string, Date>();
  const customerAtByOrder = new Map<string, Date>();
  let cursor = new Date(options.now);
  let position = options.start;

  for (const stop of stops) {
    cursor = addMinutes(cursor, travelMinutes(position, stop.coord, options.vehicle, options.travel));
    if (stop.kind === 'pickup' && stop.readyAt && cursor.getTime() < stop.readyAt.getTime()) {
      cursor = new Date(stop.readyAt);
    }
    cursor = addMinutes(cursor, stop.serviceMin);
    if (stop.kind === 'pickup') pickupAtByOrder.set(stop.orderId, new Date(cursor));
    if (stop.kind === 'dropoff') customerAtByOrder.set(stop.orderId, new Date(cursor));
    position = stop.coord ?? position;
  }

  return { pickupAtByOrder, customerAtByOrder, routeEndsAt: cursor };
}

// ── Best-insertion ──────────────────────────────────────────────────────────
// Nya ordern behöver inte alltid köras SIST: ligger dess hämtning/lämning på
// vägen kan den vävas in mitt i rutten. Vi provar alla giltiga positioner
// (hämtning före lämning, befintliga stopp behåller inbördes ordning) och
// väljer den med bäst mål: ny kunds ETA + viktad fördröjning för befintliga.
// JÄRNREGEL: ingen befintlig kund får försenas mer än MAX_EXISTING_DELAY_MIN
// jämfört med rutten utan nya ordern — annars förkastas positionen. Append
// sist är alltid tillåten (den försenar per definition ingen).
const MAX_EXISTING_DELAY_MIN = 6;
const EXISTING_DELAY_WEIGHT = 0.8;

function simulateBestInsertion(
  activeStops: EtaStop[],
  candidateStops: EtaStop[],
  candidateOrderId: string,
  opts: SimulateOptions,
): ReturnType<typeof simulateRoute> {
  const [pickupStop, dropStop] = candidateStops;
  const baseline = simulateRoute(activeStops, opts);
  // Append-varianten är referens och alltid giltig.
  let best = simulateRoute([...activeStops, pickupStop, dropStop], opts);
  const appendEta = best.customerAtByOrder.get(candidateOrderId);
  let bestObjective = appendEta ? minutesBetween(opts.now, appendEta) : Infinity;

  const n = activeStops.length;
  for (let i = 0; i <= n; i++) {
    for (let j = i; j <= n; j++) {
      if (i === n && j === n) continue; // = append, redan beräknad
      const stops = [...activeStops];
      stops.splice(i, 0, pickupStop);
      stops.splice(j + 1, 0, dropStop);
      const sim = simulateRoute(stops, opts);

      let sumDelayMin = 0;
      let feasible = true;
      for (const [orderId, at] of sim.customerAtByOrder) {
        if (orderId === candidateOrderId) continue;
        const base = baseline.customerAtByOrder.get(orderId);
        if (!base) continue;
        const delayMin = minutesBetween(base, at);
        if (delayMin > MAX_EXISTING_DELAY_MIN) {
          feasible = false;
          break;
        }
        if (delayMin > 0) sumDelayMin += delayMin;
      }
      if (!feasible) continue;

      const newEtaAt = sim.customerAtByOrder.get(candidateOrderId);
      if (!newEtaAt) continue;
      const objective = minutesBetween(opts.now, newEtaAt) + EXISTING_DELAY_WEIGHT * sumDelayMin;
      if (objective < bestObjective) {
        bestObjective = objective;
        best = sim;
      }
    }
  }
  return best;
}

function priorityScore(order: any, etaCustomerAt: Date | null, targetAt: Date | null, now: Date, activeStops: number): number | null {
  if (!etaCustomerAt || !targetAt) return null;
  const slackMin = minutesBetween(etaCustomerAt, targetAt);
  const ageMin = clamp(minutesBetween(new Date(order?.createdAt ?? now), now), 0, 120);
  const status = String(order?.status || '').toUpperCase();
  const statusBoost = status === 'READY' ? 30 : status === 'PREPARING' ? 16 : status === 'ACCEPTED' ? 10 : 0;
  const scheduledBoost = order?.scheduledFor ? 25 : 0;
  const pressure = slackMin < 0 ? Math.abs(slackMin) * 3 : Math.max(0, 35 - slackMin) * 1.3;
  return Math.round((pressure + ageMin * 0.35 + statusBoost + scheduledBoost - activeStops * 1.5) * 10) / 10;
}

function reasonFor(order: any, activeStops: number, etaCustomerMin: number | null): string {
  const parts = [];
  const status = String(order?.status || '').toUpperCase();
  if (status === 'READY') parts.push('maten är redo');
  else if (status === 'PREPARING') parts.push('restaurangens tillagningstid');
  else parts.push('restaurangens aktuella ETA');
  if (activeStops > 0) parts.push(`${activeStops} aktiva stopp hos budet`);
  if (etaCustomerMin != null) parts.push(`ca ${etaCustomerMin} min till kund`);
  return parts.join(' + ');
}

export function estimateOrderEta(
  order: any,
  options: {
    now?: Date;
    courier?: any | null;
    activeDeliveries?: any[];
    appendAsCandidate?: boolean;
    /** 'best' = prova alla giltiga infogningspositioner (dispatch); default append sist. */
    insertion?: 'append' | 'best';
    /** Riktiga vägrestider (OSRM-matris); null/undefined = haversine. */
    travelLookup?: TravelLookup | null;
  } = {},
): OrderEtaSnapshot {
  const now = options.now ?? new Date();
  const status = String(order?.status || '').toUpperCase();
  if (TERMINAL_ORDER_STATUSES.includes(status)) {
    const deliveredAt = order?.delivery?.deliveredAt ? new Date(order.delivery.deliveredAt) : now;
    return {
      etaReadyAt: order?.etaReadyAt ? new Date(order.etaReadyAt) : null,
      etaPickupAt: order?.etaPickupAt ? new Date(order.etaPickupAt) : null,
      etaCustomerAt: deliveredAt,
      etaCustomerMin: 0,
      etaPriorityScore: 0,
      etaReason: 'Levererad',
    };
  }
  if (CANCELLED_ORDER_STATUSES.includes(status)) {
    return {
      etaReadyAt: null,
      etaPickupAt: null,
      etaCustomerAt: null,
      etaCustomerMin: null,
      etaPriorityScore: null,
      etaReason: null,
    };
  }

  const readyAt = readyAtFor(order, now);
  const courier = options.courier ?? order?.delivery?.courier ?? null;
  const start = validCoord(courier?.currentLat, courier?.currentLng);
  const vehicle = courier?.vehicle ?? null;
  const activeDeliveries = options.activeDeliveries ?? [];
  const readyByOrder = new Map<string, Date | null>();
  for (const delivery of activeDeliveries) {
    if (delivery?.order?.id) readyByOrder.set(delivery.order.id, readyAtFor(delivery.order, now));
  }
  if (order?.id) readyByOrder.set(order.id, readyAt);

  let etaPickupAt: Date | null = null;
  let etaCustomerAt: Date | null = null;
  const orderHasActiveDelivery = activeDeliveries.some((d) => d?.orderId === order?.id);
  const shouldSimulate =
    order?.type === 'DELIVERY' &&
    (activeDeliveries.length > 0 || options.appendAsCandidate || order?.delivery);

  if (shouldSimulate) {
    const activeStops = activeDeliveries.flatMap((d) => stopsForDelivery(d, readyByOrder));
    const candidateStops = !orderHasActiveDelivery ? stopsForCandidate(order, readyAt) : [];
    const simOpts: SimulateOptions = { now, start, vehicle, travel: options.travelLookup ?? null };
    const simulated =
      options.insertion === 'best' && candidateStops.length === 2 && activeStops.length > 0
        ? simulateBestInsertion(activeStops, candidateStops, order.id, simOpts)
        : simulateRoute([...activeStops, ...candidateStops], simOpts);
    etaPickupAt = simulated.pickupAtByOrder.get(order.id) ?? (status === 'DELIVERING' ? new Date(order?.deliveringAt ?? now) : null);
    etaCustomerAt = simulated.customerAtByOrder.get(order.id) ?? null;
  }

  if (order?.type === 'PICKUP') {
    etaPickupAt = readyAt;
    etaCustomerAt = readyAt;
  } else if (!etaCustomerAt && readyAt) {
    etaPickupAt = etaPickupAt ?? readyAt;
    etaCustomerAt = addMinutes(etaPickupAt, deliveryMinutes(order, vehicle));
  }

  const etaCustomerMin = etaCustomerAt ? Math.max(0, Math.ceil(minutesBetween(now, etaCustomerAt))) : null;
  const activeStopCount = activeDeliveries.flatMap((d) => stopsForDelivery(d, readyByOrder)).length;
  const targetAt = targetCustomerAt(order, readyAt, vehicle);

  return {
    etaReadyAt: readyAt,
    etaPickupAt,
    etaCustomerAt,
    etaCustomerMin,
    etaPriorityScore: priorityScore(order, etaCustomerAt, targetAt, now, activeStopCount),
    etaReason: reasonFor(order, activeStopCount, etaCustomerMin),
  };
}

export async function getCourierActiveDeliveries(courierId: string) {
  return prisma.delivery.findMany({
    where: { courierId, status: { in: ACTIVE_DELIVERY_STATUSES as any } },
    include: { order: { include: { restaurant: true, items: true, delivery: { include: { courier: true } } } } },
    orderBy: { acceptedAt: 'asc' },
  });
}

export async function refreshOrderEta(
  orderId: string,
  options: { courierId?: string | null; activeDeliveries?: any[]; courier?: any | null } = {},
): Promise<OrderEtaSnapshot | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { restaurant: true, items: true, delivery: { include: { courier: true } } },
  });
  if (!order) return null;

  const courierId = options.courierId ?? order.delivery?.courierId ?? null;
  const activeDeliveries = options.activeDeliveries ?? (courierId ? await getCourierActiveDeliveries(courierId) : []);
  const eta = estimateOrderEta(order, {
    courier: options.courier ?? order.delivery?.courier ?? null,
    activeDeliveries,
    appendAsCandidate: Boolean(courierId),
  });

  await prisma.order.update({
    where: { id: orderId },
    data: {
      etaReadyAt: eta.etaReadyAt,
      etaPickupAt: eta.etaPickupAt,
      etaCustomerAt: eta.etaCustomerAt,
      etaCustomerMin: eta.etaCustomerMin,
      etaPriorityScore: eta.etaPriorityScore,
      etaReason: eta.etaReason,
    },
  });

  return eta;
}

export async function refreshCourierActiveEtas(
  courierId: string,
  options: { courier?: any | null } = {},
): Promise<Map<string, OrderEtaSnapshot>> {
  const activeDeliveries = await getCourierActiveDeliveries(courierId);
  const result = new Map<string, OrderEtaSnapshot>();

  await Promise.all(activeDeliveries.map(async (delivery: any) => {
    if (!delivery?.order?.id) return;
    const eta = estimateOrderEta(delivery.order, {
      courier: options.courier ?? delivery.order?.delivery?.courier ?? null,
      activeDeliveries,
    });
    result.set(delivery.order.id, eta);
    await prisma.order.update({
      where: { id: delivery.order.id },
      data: {
        etaReadyAt: eta.etaReadyAt,
        etaPickupAt: eta.etaPickupAt,
        etaCustomerAt: eta.etaCustomerAt,
        etaCustomerMin: eta.etaCustomerMin,
        etaPriorityScore: eta.etaPriorityScore,
        etaReason: eta.etaReason,
      },
    });
  }));

  return result;
}

export function etaResponseFields(order: any) {
  return {
    etaReadyAt: order?.etaReadyAt ?? null,
    etaPickupAt: order?.etaPickupAt ?? null,
    etaCustomerAt: order?.etaCustomerAt ?? null,
    etaCustomerMin: order?.etaCustomerMin ?? null,
    etaPriorityScore: order?.etaPriorityScore ?? null,
    etaReason: order?.etaReason ?? null,
  };
}
