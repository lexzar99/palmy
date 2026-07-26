import prisma from './prisma';

// Lärd leveranstid per restaurang, byggd på OrderTimingStat.
//
// Databasen skonas: varje restaurangs statistik räknas om högst var tredje
// timme (in-memory cache) och läses lazy — första anropet efter en kall start
// använder löftet tills bakgrundsladdningen är klar. Alla konsumenter är
// synkrona (customerStepEtaEndsAt) så cachen exponerar en sync-getter.
//
// Försiktighetsregler ("inte för lite data ger extrema värden"):
//  - minst MIN_SAMPLES levererade ordrar i underlaget (senaste WINDOW_DAYS)
//  - lärd visningstid ersätter bara löftet NEDÅT (aldrig längre tid)
//  - och bara när skillnaden är tydlig (≥ MIN_IMPROVEMENT_MIN minuter)
//  - golv: FLOOR_MIN — vi lovar aldrig orealistiska 10–20 minuter
//  - test-ordrar räknas aldrig med

const REFRESH_MS = 3 * 60 * 60 * 1000; // 3 timmar
const WINDOW_DAYS = 60;
const MIN_SAMPLES = 30;
const MIN_IMPROVEMENT_MIN = 8;
const FLOOR_MIN = 25;

export type LearnedRestaurantEta = {
  restaurantId: string;
  samples: number;
  promisedAvgMin: number | null;
  totalP50Min: number | null;
  totalP95Min: number | null;
  acceptToOnWayP50Min: number | null;
  onWayToDeliveredP50Min: number | null;
  computedAt: number;
};

type CacheEntry = { value: LearnedRestaurantEta | null; loadedAt: number; loading: boolean };
const cache = new Map<string, CacheEntry>();

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function avg(values: number[]): number | null {
  return values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
}

async function computeLearnedEta(restaurantId: string): Promise<LearnedRestaurantEta | null> {
  const model = (prisma as any).orderTimingStat;
  if (!model?.findMany) return null;
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await model.findMany({
    where: {
      restaurantId,
      isTestOrder: false,
      deliveredAt: { not: null },
      recordedAt: { gte: since },
    },
    select: {
      promisedMinutes: true,
      orderToDeliveredMin: true,
      acceptToOnWayMin: true,
      onWayToDeliveredMin: true,
    },
    take: 5_000,
  });
  const nums = (pick: (r: any) => unknown): number[] =>
    rows.map(pick).filter((v: unknown): v is number => typeof v === 'number' && Number.isFinite(v));
  return {
    restaurantId,
    samples: rows.length,
    promisedAvgMin: avg(nums((r) => r.promisedMinutes)),
    totalP50Min: percentile(nums((r) => r.orderToDeliveredMin), 50),
    totalP95Min: percentile(nums((r) => r.orderToDeliveredMin), 95),
    acceptToOnWayP50Min: percentile(nums((r) => r.acceptToOnWayMin), 50),
    onWayToDeliveredP50Min: percentile(nums((r) => r.onWayToDeliveredMin), 50),
    computedAt: Date.now(),
  };
}

/**
 * Sync-läsning ur cachen. Saknas färsk data triggas en bakgrundsladdning och
 * null returneras — konsumenten faller då tillbaka på restaurangens löfte.
 */
export function learnedEtaSync(restaurantId: string): LearnedRestaurantEta | null {
  if (!restaurantId) return null;
  const entry = cache.get(restaurantId);
  const fresh = entry && Date.now() - entry.loadedAt < REFRESH_MS;
  if (!fresh && !(entry?.loading)) {
    const next: CacheEntry = { value: entry?.value ?? null, loadedAt: entry?.loadedAt ?? 0, loading: true };
    cache.set(restaurantId, next);
    void computeLearnedEta(restaurantId)
      .then((value) => cache.set(restaurantId, { value, loadedAt: Date.now(), loading: false }))
      .catch(() => cache.set(restaurantId, { ...next, loading: false }));
  }
  return entry?.value ?? null;
}

/** Async-variant som väntar in beräkningen (används av admin-översikten). */
export async function learnedEta(restaurantId: string): Promise<LearnedRestaurantEta | null> {
  const entry = cache.get(restaurantId);
  if (entry && Date.now() - entry.loadedAt < REFRESH_MS) return entry.value;
  const value = await computeLearnedEta(restaurantId).catch(() => null);
  cache.set(restaurantId, { value, loadedAt: Date.now(), loading: false });
  return value;
}

/**
 * #1 — Lärd initial kundtid. Löftet gäller tills restaurangens egen data är
 * stark nog OCH tydligt bättre; då visas p50, aldrig under golvet och aldrig
 * längre än löftet. Ex: restaurangen ger 80 men brukar leverera på 50 → 50.
 */
export function learnedPromiseMinutes(restaurantId: string, promisedMinutes: number): number {
  const learned = learnedEtaSync(restaurantId);
  if (!learned || learned.samples < MIN_SAMPLES) return promisedMinutes;
  const p50 = learned.totalP50Min;
  if (p50 == null) return promisedMinutes;
  if (promisedMinutes - p50 < MIN_IMPROVEMENT_MIN) return promisedMinutes;
  return Math.max(FLOOR_MIN, Math.round(p50));
}

/**
 * #3 — Lärt förval för terminalens intervallknappar (tid till kund vid på väg).
 * Baseras på restaurangens egen transit-p50, viktad med aktuell press. Utan
 * tillräcklig data returneras null och terminalen använder sin lokala regel.
 */
export function suggestedDeliveryEtaMinutes(restaurantId: string, activeOrders: number): number | null {
  const learned = learnedEtaSync(restaurantId);
  if (!learned || learned.samples < MIN_SAMPLES) return null;
  const transit = learned.onWayToDeliveredP50Min;
  if (transit == null) return null;
  // Press-påslag: fler samtidiga ordrar → längre verklig tid till kund.
  const pressExtra = activeOrders >= 6 ? 8 : activeOrders >= 3 ? 4 : 0;
  const suggested = transit + pressExtra;
  // Snappa till terminalens knappar: 10 / 15 / 20 / 30.
  const options = [10, 15, 20, 30];
  return options.reduce((best, option) =>
    Math.abs(option - suggested) < Math.abs(best - suggested) ? option : best,
  );
}
