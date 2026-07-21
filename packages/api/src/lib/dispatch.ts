// ---------------------------------------------------------------------------
//  Smart tilldelning ("dispatch") av leveransordrar till kurirer.
//
//  Flöde per ny order (DELIVERY, vi-levererar):
//    1. Ranka alla online-kurirer i staden med rankDispatchCandidates —
//       simulerad kund-ETA (kurirens aktiva stopp + nya ordern, orderEta.ts)
//       + belastnings-/närhets-/GPS-färskhetsstraff.
//    2. Reservera ordern EXKLUSIVT för bästa kuriren (DispatchOffer OFFERED,
//       deadline OFFER_TTL_SEC). Bara den kuriren ser jobbet i /jobs och får
//       en riktad push med nedräkning.
//    3. Ingen respons / avböjt → erbjudandet kaskaderar till nästa kurir.
//    4. Efter MAX_TARGETED_WAVES riktade erbjudanden (eller när kandidaterna
//       tagit slut) öppnas ordern för ALLA (klassisk först-till-kvarn) och en
//       vanlig bred ny-order-push går ut.
//
//  "Öppen" representeras av frånvaron av aktiva OFFERED-rader — ingen extra
//  statuskolumn behövs och gamla ordrar är automatiskt öppna.
//
//  Robusthet: deadlines drivs av in-process-timers MEN backas av (a) lazy
//  expiry i getActiveOffers (körs vid varje /jobs-läsning) och (b) en periodisk
//  sweeper var 15:e sekund som även överlever serveromstart (DB-scan, inte
//  in-flight timeouts). Själva accept-racet avgörs som förut av den unika
//  constrainten på Delivery.orderId — erbjudandet är en mjuk reservation.
//
//  DISPATCH_MODE=open (env) stänger av hela motorn → exakt gamla beteendet.
// ---------------------------------------------------------------------------
import prisma from './prisma';
import { haversineKm } from '../utils/geo';
import { estimateOrderEta, getCourierActiveDeliveries } from './orderEta';
import { rankDispatchCandidates, type ScoredDispatchCandidate } from './dispatchScoring';
import {
  alertNoCouriersOnline,
  notifyCouriersOfNewJob,
  notifyCourierJobOffer,
  scheduleNoCourierAcceptedCheck,
} from './courierPush';

export const MAX_ACTIVE = 6;
export const OFFER_TTL_SEC = 40;
const MAX_TARGETED_WAVES = 3;
const STALE_LOCATION_MS = 5 * 60_000;
const SWEEP_INTERVAL_MS = 15_000;
const AVAILABLE_ORDER_STATUSES = ['ACCEPTED', 'PREPARING', 'READY'];

export function isSmartDispatchEnabled(): boolean {
  return (process.env.DISPATCH_MODE || 'smart').toLowerCase() !== 'open';
}

// Dedup för ACCEPTED→PREPARING-dubbeltriggern från admin (samma skäl som i
// notifyCouriersOfNewJob, men motorn har sin egen livscykel).
const dispatchStarted = new Map<string, number>();
const DISPATCH_DEDUP_MS = 90_000;

const offerTimers = new Map<string, NodeJS.Timeout>();

function clearOfferTimer(orderId: string) {
  const t = offerTimers.get(orderId);
  if (t) {
    clearTimeout(t);
    offerTimers.delete(orderId);
  }
}

function armOfferTimer(orderId: string, expiresAt: Date) {
  clearOfferTimer(orderId);
  const delay = Math.max(500, expiresAt.getTime() - Date.now() + 250);
  const timer = setTimeout(() => {
    offerTimers.delete(orderId);
    void advanceDispatch(orderId).catch((e) => console.warn('[dispatch] advance fel:', e?.message));
  }, delay);
  offerTimers.set(orderId, timer);
}

type DispatchableOrder = {
  id: string;
  orderNumber: string | null;
  restaurant: any;
  [key: string]: any;
};

/** Ordern är fortfarande möjlig att tilldela (ingen kurir, rätt status). */
async function loadDispatchableOrder(orderId: string): Promise<DispatchableOrder | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { restaurant: true, items: true, delivery: true },
  });
  if (
    !order ||
    order.type !== 'DELIVERY' ||
    order.delivery ||
    !AVAILABLE_ORDER_STATUSES.includes(String(order.status || '').toUpperCase()) ||
    (order.restaurant as any)?.selfDelivery ||
    !(order.restaurant as any)?.city
  ) {
    return null;
  }
  return order as any;
}

/**
 * Ranka stadens tillgängliga kurirer för en order. Exkluderar fullbelagda
 * kurirer (MAX_ACTIVE) och de i excludeIds (redan erbjudna).
 */
export async function buildDispatchCandidates(
  order: DispatchableOrder,
  excludeIds: Set<string> = new Set(),
): Promise<ScoredDispatchCandidate[]> {
  const city = String(order.restaurant?.city || '');
  const couriers = await prisma.courier.findMany({
    where: { online: true, isActive: true, city: { equals: city, mode: 'insensitive' } },
  });
  const eligible = couriers.filter((c) => !excludeIds.has(c.id));
  if (eligible.length === 0) return [];

  const now = new Date();
  const restaurantCoord =
    order.restaurant?.latitude != null && order.restaurant?.longitude != null
      ? { lat: order.restaurant.latitude as number, lng: order.restaurant.longitude as number }
      : null;

  const candidates = await Promise.all(
    eligible.map(async (courier) => {
      const activeDeliveries = await getCourierActiveDeliveries(courier.id);
      if (activeDeliveries.length >= MAX_ACTIVE) return null;
      const eta = estimateOrderEta(order, { now, courier, activeDeliveries, appendAsCandidate: true });
      const hasCoord = typeof courier.currentLat === 'number' && typeof courier.currentLng === 'number';
      const pickupDistanceKm =
        hasCoord && restaurantCoord
          ? Math.round(haversineKm(courier.currentLat as number, courier.currentLng as number, restaurantCoord.lat, restaurantCoord.lng) * 10) / 10
          : null;
      const locationFresh =
        hasCoord && courier.lastSeenAt != null && now.getTime() - new Date(courier.lastSeenAt).getTime() < STALE_LOCATION_MS;
      return {
        courierId: courier.id,
        etaCustomerMin: eta.etaCustomerMin,
        activeCount: activeDeliveries.length,
        pickupDistanceKm,
        hasLocation: hasCoord,
        locationFresh,
      };
    }),
  );
  return rankDispatchCandidates(candidates.filter((c): c is NonNullable<typeof c> => c != null));
}

/** Öppna ordern för alla (broadcast) — sista vågen / inga kandidater kvar. */
async function openOrderForAll(order: DispatchableOrder) {
  clearOfferTimer(order.id);
  await notifyCouriersOfNewJob({
    orderId: order.id,
    restaurantId: order.restaurant?.id ?? order.restaurantId,
    orderType: 'DELIVERY',
    orderNumber: order.orderNumber,
    estimatedTime: order.estimatedTime,
  });
}

/** Skapa nästa riktade erbjudande. Returnerar false om ordern istället öppnades. */
async function createNextOffer(order: DispatchableOrder): Promise<boolean> {
  const previous = await prisma.dispatchOffer.findMany({
    where: { orderId: order.id },
    select: { courierId: true, wave: true },
  });
  const offeredIds = new Set(previous.map((p) => p.courierId));
  const wave = previous.reduce((m, p) => Math.max(m, p.wave), 0) + 1;

  if (wave > MAX_TARGETED_WAVES) {
    await openOrderForAll(order);
    return false;
  }
  const candidates = await buildDispatchCandidates(order, offeredIds);
  if (candidates.length === 0) {
    await openOrderForAll(order);
    return false;
  }
  const best = candidates[0];
  const expiresAt = new Date(Date.now() + OFFER_TTL_SEC * 1000);
  await prisma.dispatchOffer.create({
    data: {
      orderId: order.id,
      courierId: best.courierId,
      wave,
      status: 'OFFERED',
      score: best.score,
      etaMin: best.etaCustomerMin,
      expiresAt,
    },
  });
  armOfferTimer(order.id, expiresAt);
  void notifyCourierJobOffer({
    courierId: best.courierId,
    orderId: order.id,
    restaurantName: order.restaurant?.name ?? 'Restaurang',
    city: order.restaurant?.city ?? '',
    expiresInSec: OFFER_TTL_SEC,
  }).catch(() => null);
  console.log(
    `[dispatch] order ${order.orderNumber ?? order.id} → våg ${wave}: kurir ${best.courierId} (eta ${best.etaCustomerMin ?? '?'} min, ${best.activeCount} aktiva, poäng ${best.score})`,
  );
  return true;
}

/**
 * Startpunkt: ny tillgänglig order. Ersätter den breda broadcasten när smart
 * dispatch är på; annars faller den igenom till gamla notifyCouriersOfNewJob.
 * Fire-and-forget från orderflödet — får aldrig blocka.
 */
export async function dispatchNewOrder(opts: {
  orderId?: string | null;
  restaurantId: string | null | undefined;
  orderType: string | null | undefined;
  orderNumber?: string | null;
  estimatedTime?: number | null;
}): Promise<void> {
  try {
    if (!opts.orderId || opts.orderType !== 'DELIVERY' || !opts.restaurantId) return;
    if (!isSmartDispatchEnabled()) {
      await notifyCouriersOfNewJob(opts);
      return;
    }

    // Dedup (ACCEPTED→PREPARING triggar två gånger inom sekunder).
    const now = Date.now();
    const last = dispatchStarted.get(opts.orderId);
    if (last && now - last < DISPATCH_DEDUP_MS) return;
    dispatchStarted.set(opts.orderId, now);
    if (dispatchStarted.size > 500) {
      for (const [k, t] of dispatchStarted) if (now - t > DISPATCH_DEDUP_MS) dispatchStarted.delete(k);
    }

    const order = await loadDispatchableOrder(opts.orderId);
    if (!order) return;

    // Redan ett aktivt erbjudande (annan instans/dubbeltrigg) → låt det leva.
    const active = await prisma.dispatchOffer.findFirst({
      where: { orderId: order.id, status: 'OFFERED', expiresAt: { gt: new Date() } },
    });
    if (active) {
      armOfferTimer(order.id, active.expiresAt);
      return;
    }

    const online = await prisma.courier.count({
      where: { online: true, isActive: true, city: { equals: String(order.restaurant?.city || ''), mode: 'insensitive' } },
    });
    if (online === 0) {
      await alertNoCouriersOnline({
        orderId: order.id,
        orderNumber: order.orderNumber,
        restaurantName: order.restaurant?.name ?? 'Restaurang',
        city: order.restaurant?.city ?? '',
        estimatedTime: opts.estimatedTime,
      });
      return;
    }
    scheduleNoCourierAcceptedCheck({
      orderId: order.id,
      orderNumber: order.orderNumber,
      restaurantName: order.restaurant?.name ?? 'Restaurang',
      city: order.restaurant?.city ?? '',
    });
    await createNextOffer(order);
  } catch (e) {
    console.warn('[dispatch] dispatchNewOrder fel:', (e as Error)?.message);
  }
}

/** Gå vidare i kaskaden: förfall gamla erbjudanden och erbjud nästa kurir. */
export async function advanceDispatch(orderId: string): Promise<void> {
  clearOfferTimer(orderId);
  await prisma.dispatchOffer.updateMany({
    where: { orderId, status: 'OFFERED', expiresAt: { lte: new Date() } },
    data: { status: 'EXPIRED', respondedAt: new Date() },
  });
  // Fortfarande ett levande erbjudande (t.ex. decline på gammalt medan ett
  // nytt redan skapats) → rör inget, se bara till att timern lever.
  const alive = await prisma.dispatchOffer.findFirst({
    where: { orderId, status: 'OFFERED', expiresAt: { gt: new Date() } },
  });
  if (alive) {
    armOfferTimer(orderId, alive.expiresAt);
    return;
  }
  const order = await loadDispatchableOrder(orderId);
  if (!order) {
    // Tagen/avbruten → städa ev. kvarvarande öppna erbjudanden.
    await prisma.dispatchOffer.updateMany({
      where: { orderId, status: 'OFFERED' },
      data: { status: 'CANCELLED', respondedAt: new Date() },
    });
    return;
  }
  await createNextOffer(order);
}

/** Kuriren avböjde sitt erbjudande → kaskadera direkt (ingen väntan på TTL). */
export async function declineOffer(orderId: string, courierId: string): Promise<boolean> {
  try {
    const changed = await prisma.dispatchOffer.updateMany({
      where: { orderId, courierId, status: 'OFFERED' },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
    if (changed.count > 0) {
      void advanceDispatch(orderId).catch(() => null);
      return true;
    }
  } catch (e) {
    warnMissingTableOnce(e);
  }
  return false;
}

// Logga tabell-saknas-läget EN gång (inte per request) — annars drunknar loggen.
let missingTableWarned = false;
function warnMissingTableOnce(e: unknown) {
  if (missingTableWarned) return;
  missingTableWarned = true;
  console.warn(
    '[dispatch] DispatchOffer-tabellen kunde inte läsas — kör i öppet läge tills DB-patchen är applicerad:',
    (e as Error)?.message,
  );
}

/** Efter vunnet accept-race: bokför utfallet och stäng kaskaden. */
export async function resolveOffersOnAccept(orderId: string, courierId: string): Promise<void> {
  clearOfferTimer(orderId);
  await prisma.dispatchOffer.updateMany({
    where: { orderId, courierId, status: 'OFFERED' },
    data: { status: 'ACCEPTED', respondedAt: new Date() },
  });
  await prisma.dispatchOffer.updateMany({
    where: { orderId, status: 'OFFERED' },
    data: { status: 'CANCELLED', respondedAt: new Date() },
  });
}

export type ActiveOffer = { courierId: string; expiresAt: Date; wave: number };

/**
 * Aktiva (o-förfallna) erbjudanden för en mängd ordrar → styr synligheten i
 * GET /jobs: reserverad order syns bara för den erbjudna kuriren. Förfallna
 * erbjudanden knuffas vidare lazy härifrån (backup om timern dött).
 */
export async function getActiveOffers(orderIds: string[]): Promise<Map<string, ActiveOffer>> {
  if (!isSmartDispatchEnabled() || orderIds.length === 0) return new Map();
  // Saknas DispatchOffer-tabellen (patchen inte körd i produktion än, se
  // LAUNCH_DATABASE_RUNBOOK) → degradera tyst till öppet läge. Jobblistan får
  // ALDRIG 500:a på grund av dispatch-motorn.
  let offers: { orderId: string; courierId: string; expiresAt: Date; wave: number }[];
  try {
    offers = await prisma.dispatchOffer.findMany({
      where: { orderId: { in: orderIds }, status: 'OFFERED' },
      select: { orderId: true, courierId: true, expiresAt: true, wave: true },
    });
  } catch (e) {
    warnMissingTableOnce(e);
    return new Map();
  }
  const now = Date.now();
  const map = new Map<string, ActiveOffer>();
  const expired = new Set<string>();
  for (const o of offers) {
    if (o.expiresAt.getTime() > now) {
      map.set(o.orderId, { courierId: o.courierId, expiresAt: o.expiresAt, wave: o.wave });
    } else {
      expired.add(o.orderId);
    }
  }
  for (const id of expired) {
    if (!map.has(id)) void advanceDispatch(id).catch(() => null);
  }
  return map;
}

/**
 * Periodisk sweeper + återstart-återhämtning. DB-scannen gör att kaskaden
 * överlever serveromstarter (in-flight setTimeouts försvinner annars).
 */
export function startDispatchEngine(): void {
  if (!isSmartDispatchEnabled()) {
    console.log('[dispatch] DISPATCH_MODE=open — smart tilldelning avstängd (broadcast-läge).');
    return;
  }
  const sweep = async () => {
    try {
      const stale = await prisma.dispatchOffer.findMany({
        where: { status: 'OFFERED', expiresAt: { lte: new Date() } },
        select: { orderId: true },
        distinct: ['orderId'],
        take: 50,
      });
      for (const s of stale) await advanceDispatch(s.orderId).catch(() => null);
    } catch (e) {
      console.warn('[dispatch] sweep fel:', (e as Error)?.message);
    }
  };
  void (async () => {
    try {
      // Återuppta levande erbjudanden efter omstart.
      const alive = await prisma.dispatchOffer.findMany({
        where: { status: 'OFFERED', expiresAt: { gt: new Date() } },
        select: { orderId: true, expiresAt: true },
      });
      for (const a of alive) armOfferTimer(a.orderId, a.expiresAt);
      await sweep();
    } catch (e) {
      console.warn('[dispatch] init fel:', (e as Error)?.message);
    }
  })();
  setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
  console.log('[dispatch] Smart tilldelning aktiv (vågor à ' + OFFER_TTL_SEC + ' s, max ' + MAX_TARGETED_WAVES + ' riktade).');
}
