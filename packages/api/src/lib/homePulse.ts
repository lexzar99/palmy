// Puls-motorerna: autonoma hemskärmsmoduler. Servern komponerar, appen renderar.
// Principer: allt data-drivet (inga påhittade siffror), max N moduler per dag
// (hemskärmen ska andas, inte svämma över), tema roterar per vecka, allt styrs
// och loggas via EngineSetting/EngineEvent (admin → Motorn).

import prisma from './prisma';
import { themeForKey, dailyPick, dailyScore, dayOfYear } from './themeRotation';

const LIVE_STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERING'];
const DONE_STATUSES = ['DELIVERED', 'COMPLETED'];
const EXCLUDED_STATUSES = ['CANCELLED', 'REJECTED'];

export type EngineKey =
  | 'theme_rotation'
  | 'champion'
  | 'hot_products'
  | 'new_menu_items'
  | 'fastest_today'
  | 'points_nudge'
  | 'daily_drop'
  | 'new_restaurants'
  | 'trending'
  | 'comeback'
  | 'streak_card'
  | 'surprise_bonus'
  | 'occasions'
  | 'weather_pulse';

export interface EngineDef {
  key: EngineKey;
  title: string;
  description: string;
  defaultParams: Record<string, number>;
  paramLabels: Record<string, string>;
}

export const ENGINE_DEFS: EngineDef[] = [
  {
    key: 'theme_rotation',
    title: 'Tema-rotation',
    description: 'Samma kort byter tema/färg varje vecka så flödet känns nytt. Lås tema på ett enskilt kort genom att sätta det i kortets formulär.',
    defaultParams: {},
    paramLabels: {},
  },
  {
    key: 'champion',
    title: 'Veckans favorit',
    description: 'Restaurangen med flest ordrar senaste 7 dagarna får ett herokort. Topp 3 roterar dag för dag.',
    defaultParams: { minOrders7d: 5 },
    paramLabels: { minOrders7d: 'Min ordrar/7 dagar' },
  },
  {
    key: 'hot_products',
    title: 'Hetast just nu',
    description: 'Mest beställda produkterna senaste 72 timmarna. Bara artiklar över prisgolvet.',
    defaultParams: { minPriceKr: 70, maxItems: 8, windowHours: 72 },
    paramLabels: { minPriceKr: 'Prisgolv (kr)', maxItems: 'Max produkter', windowHours: 'Fönster (timmar)' },
  },
  {
    key: 'new_menu_items',
    title: 'Nytt på menyn',
    description: 'Nya produkter hos etablerade partners blir kort automatiskt. Bulk-skydd: helt nya restauranger och massuppladdningar räknas inte som nyheter.',
    defaultParams: { windowDays: 10, minRestaurantAgeDays: 14, bulkThreshold: 8, maxItems: 4 },
    paramLabels: { windowDays: 'Nyhetsfönster (dagar)', minRestaurantAgeDays: 'Min restaurangålder (dagar)', bulkThreshold: 'Bulk-gräns (produkter)', maxItems: 'Max kort' },
  },
  {
    key: 'fastest_today',
    title: 'Snabbast idag',
    description: 'Räknar dagens levererade ordrar och nuvarande kö per restaurang. Bara restauranger under tidstaket visas — långsamma dagar göms.',
    defaultParams: { minDeliveredToday: 3, maxItems: 4, maxAvgMinutes: 45 },
    paramLabels: { minDeliveredToday: 'Min levererade idag', maxItems: 'Max restauranger', maxAvgMinutes: 'Tidstak (min)' },
  },
  {
    key: 'daily_drop',
    title: 'Dagens drop',
    description: 'En utvald bestseller per dag med tidsfönster och nedräkning. Ny produkt och nytt tema imorgon.',
    defaultParams: { minPriceKr: 70, startHour: 15, endHour: 21 },
    paramLabels: { minPriceKr: 'Prisgolv (kr)', startHour: 'Startar (timme)', endHour: 'Slutar (timme)' },
  },
  {
    key: 'new_restaurants',
    title: 'Ny i stan',
    description: 'Nyöppnade restauranger får en egen räls i två veckor. Helt automatiskt.',
    defaultParams: { windowDays: 14, maxItems: 6 },
    paramLabels: { windowDays: 'Fönster (dagar)', maxItems: 'Max restauranger' },
  },
  {
    key: 'trending',
    title: 'Trendar',
    description: 'Restauranger med störst ordertillväxt mot förra veckan.',
    defaultParams: { minOrders: 5, maxItems: 4 },
    paramLabels: { minOrders: 'Min ordrar denna vecka', maxItems: 'Max restauranger' },
  },
  {
    key: 'comeback',
    title: 'Vi saknar dig',
    description: 'Kund som gillade en restaurang men inte beställt på länge påminns varsamt.',
    defaultParams: { minOrders: 2, quietDays: 21 },
    paramLabels: { minOrders: 'Min tidigare ordrar', quietDays: 'Tyst i (dagar)' },
  },
  {
    key: 'streak_card',
    title: 'Uppdrag på hemskärmen',
    description: 'Pågående uppdrag med progress visas på hemskärmen, inte bara under Rewards.',
    defaultParams: {},
    paramLabels: {},
  },
  {
    key: 'occasions',
    title: 'Occasions-kalendern',
    description: 'Återkommande tillfällen (fredagsmys, lönehelg) blir kort automatiskt de dagar och timmar de gäller. Redigera tillfällena nedan.',
    defaultParams: {},
    paramLabels: {},
  },
  {
    key: 'weather_pulse',
    title: 'Väder-pulsen',
    description: 'Regn eller snö i stan (SMHI, gratis) ger ett comfort-kort. Ingen API-nyckel behövs.',
    defaultParams: { lat: 55.7, lon: 13.19 },
    paramLabels: { lat: 'Latitud', lon: 'Longitud' },
  },
  {
    key: 'surprise_bonus',
    title: 'Överraskningen',
    description: 'En liten poängbonus på var N:e order, deterministiskt utvald. Variabel belöning, budgeterad och loggad.',
    defaultParams: { points: 25, everyNOrders: 7 },
    paramLabels: { points: 'Bonuspoäng', everyNOrders: 'Var N:e order' },
  },
  {
    key: 'points_nudge',
    title: 'Nästan framme',
    description: 'Visar ibland (inte varje start) en reward-produkt kunden är ~70 % nära, så att köpet som behövs har god marginal.',
    defaultParams: { minRatioPct: 50, maxRatioPct: 85, showEveryNDays: 3 },
    paramLabels: { minRatioPct: 'Min andel (%)', maxRatioPct: 'Max andel (%)', showEveryNDays: 'Visas var N:e dag' },
  },
];

export type EngineSettings = Record<EngineKey, { enabled: boolean; params: Record<string, number> }>;

export async function getEngineSettings(): Promise<EngineSettings> {
  const rows = await (prisma as any).engineSetting.findMany().catch(() => []);
  const byKey = new Map<string, any>(rows.map((r: any) => [r.key, r]));
  const result = {} as EngineSettings;
  for (const def of ENGINE_DEFS) {
    const row = byKey.get(def.key);
    result[def.key] = {
      enabled: row ? Boolean(row.enabled) : true,
      params: { ...def.defaultParams, ...((row?.params as any) || {}) },
    };
  }
  return result;
}

// Loggar till Motorn-sidan. Dedupe: samma motor + samma meddelande som senaste
// raden loggas inte igen (annars spammas loggen vid varje cache-miss).
export async function logEngineEvent(engine: EngineKey, message: string, meta?: any): Promise<void> {
  try {
    const last = await (prisma as any).engineEvent.findFirst({
      where: { engine },
      orderBy: { createdAt: 'desc' },
      select: { message: true },
    });
    if (last?.message === message) return;
    await (prisma as any).engineEvent.create({
      data: { id: `ev${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, engine, message, meta: meta ?? undefined },
    });
  } catch (e: any) {
    console.warn('[engine] event log failed:', e?.message);
  }
}

const restaurantDto = (r: any) => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  cuisine: r.cuisine || null,
  imageUrl: r.imageUrl || null,
  heroImageUrl: r.heroImageUrl || null,
  rating: r.rating ?? null,
});

// ── Champion: mest beställda restaurangen senaste 7 dagarna ────────────────
async function buildChampion(params: Record<string, number>) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const grouped = await (prisma.order.groupBy as any)({
    by: ['restaurantId'],
    where: { createdAt: { gte: since }, status: { notIn: EXCLUDED_STATUSES }, restaurantId: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { restaurantId: 'desc' } },
    take: 3,
  });
  const top = (grouped as any[]).filter((g) => g._count._all >= (params.minOrders7d || 5));
  if (!top.length) return null;
  const pick = dailyPick(top, 'champion');
  if (!pick?.restaurantId) return null;
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: pick.restaurantId },
    select: { id: true, name: true, slug: true, cuisine: true, imageUrl: true, heroImageUrl: true, rating: true, comingSoon: true },
  });
  if (!restaurant || restaurant.comingSoon) return null;
  await logEngineEvent('champion', `Veckans favorit: ${restaurant.name} (${pick._count._all} ordrar/7d)`, {
    restaurantId: restaurant.id,
    orders7d: pick._count._all,
  });
  return {
    type: 'CHAMPION',
    id: `champion:${restaurant.id}`,
    theme: themeForKey(`champion:${restaurant.id}`),
    title: 'Veckans favorit',
    subtitle: `${pick._count._all} beställningar senaste veckan`,
    restaurant: restaurantDto(restaurant),
  };
}

// ── Hetast just nu: mest beställda produkterna (prisgolv skyddar snittet) ───
async function buildHotProducts(params: Record<string, number>) {
  const since = new Date(Date.now() - (params.windowHours || 72) * 60 * 60 * 1000);
  const minPriceOre = Math.round((params.minPriceKr || 70) * 100);
  const grouped = await (prisma.orderItem.groupBy as any)({
    by: ['productId'],
    where: {
      createdAt: { gte: since },
      basePrice: { gte: minPriceOre },
      order: { status: { notIn: EXCLUDED_STATUSES } },
    },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 24,
  });
  if (!(grouped as any[]).length) return null;
  const products = await prisma.product.findMany({
    where: { id: { in: (grouped as any[]).map((g) => g.productId) }, isActive: true, price: { gte: minPriceOre } },
    include: {
      category: { select: { restaurant: { select: { id: true, name: true, slug: true, cuisine: true, imageUrl: true, heroImageUrl: true, rating: true, comingSoon: true } } } },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const items = (grouped as any[])
    .map((g) => {
      const product = byId.get(g.productId) as any;
      const restaurant = product?.category?.restaurant;
      if (!product || !restaurant || restaurant.comingSoon) return null;
      return {
        productId: product.id,
        name: product.name,
        priceKr: Math.round(product.price) / 100,
        imageUrl: product.imageUrl || null,
        restaurant: restaurantDto(restaurant),
      };
    })
    .filter(Boolean)
    .slice(0, params.maxItems || 8);
  if (!items.length) return null;
  return {
    type: 'HOT_PRODUCTS',
    id: 'hot_products',
    theme: themeForKey('module:hot_products'),
    title: 'Hetast just nu',
    subtitle: 'Mest beställt de senaste dagarna',
    products: items,
  };
}

// ── Nytt på menyn: nya produkter hos ETABLERADE partners (bulk-skydd) ───────
async function buildNewMenuItems(params: Record<string, number>) {
  const windowStart = new Date(Date.now() - (params.windowDays || 10) * 24 * 60 * 60 * 1000);
  const minRestaurantCreated = new Date(Date.now() - (params.minRestaurantAgeDays || 14) * 24 * 60 * 60 * 1000);
  const fresh = await prisma.product.findMany({
    where: {
      createdAt: { gte: windowStart },
      isActive: true,
      category: { isActive: true, restaurant: { comingSoon: false, createdAt: { lte: minRestaurantCreated } } },
    },
    include: {
      category: { select: { restaurant: { select: { id: true, name: true, slug: true, cuisine: true, imageUrl: true, heroImageUrl: true, rating: true, createdAt: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 120,
  });
  if (!fresh.length) return null;

  // Bulk-skydd: en restaurang som lagt in många produkter i fönstret bygger
  // om sin meny — det är inte "nyheter". Max 1 kort per restaurang.
  const byRestaurant = new Map<string, any[]>();
  for (const product of fresh as any[]) {
    const rid = product.category?.restaurant?.id;
    if (!rid) continue;
    if (!byRestaurant.has(rid)) byRestaurant.set(rid, []);
    byRestaurant.get(rid)!.push(product);
  }
  const items: any[] = [];
  for (const [, list] of byRestaurant) {
    if (list.length > (params.bulkThreshold || 8)) continue; // menybygge, skippa
    const product = list[0];
    items.push({
      productId: product.id,
      name: product.name,
      priceKr: Math.round(product.price) / 100,
      imageUrl: product.imageUrl || null,
      restaurant: restaurantDto(product.category.restaurant),
    });
  }
  if (!items.length) return null;
  items.sort((a, b) => dailyScore(`newitem:${a.productId}`) - dailyScore(`newitem:${b.productId}`));
  return {
    type: 'NEW_MENU_ITEMS',
    id: 'new_menu_items',
    theme: themeForKey('module:new_menu_items'),
    title: 'Nytt på menyn',
    subtitle: 'Färska tillskott hos dina lokala',
    items: items.slice(0, params.maxItems || 4),
  };
}

// ── Snabbast idag: dagens levererade ordrar + nuvarande kö ──────────────────
async function buildFastestToday(params: Record<string, number>) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [delivered, live] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: startOfDay }, status: { in: DONE_STATUSES }, restaurantId: { not: null } },
      select: { restaurantId: true, createdAt: true, updatedAt: true },
    }),
    prisma.order.groupBy({
      by: ['restaurantId'],
      where: { createdAt: { gte: startOfDay }, status: { in: LIVE_STATUSES }, restaurantId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const liveByRestaurant = new Map<string, number>((live as any[]).map((g) => [g.restaurantId, g._count._all]));

  const stats = new Map<string, { total: number; minutesSum: number }>();
  for (const order of delivered) {
    if (!order.restaurantId) continue;
    const minutes = Math.max(5, (order.updatedAt.getTime() - order.createdAt.getTime()) / 60000);
    if (minutes > 180) continue; // uppenbart hängande order, förorena inte snittet
    const entry = stats.get(order.restaurantId) || { total: 0, minutesSum: 0 };
    entry.total += 1;
    entry.minutesSum += minutes;
    stats.set(order.restaurantId, entry);
  }
  const maxAvg = params.maxAvgMinutes || 45;
  const candidates = [...stats.entries()]
    .filter(([, s]) => s.total >= (params.minDeliveredToday || 3))
    .map(([restaurantId, s]) => {
      const avgMinutes = s.minutesSum / s.total;
      const activeNow = liveByRestaurant.get(restaurantId) || 0;
      // Kö väger in: snabb historik men full kö just nu ska inte lova snabbt.
      return { restaurantId, avgMinutes, activeNow, deliveredToday: s.total, score: avgMinutes * (1 + activeNow * 0.15) };
    })
    // Tidstaket: "snabbast" måste faktiskt vara snabbt. 77 min visas aldrig.
    .filter((c) => c.avgMinutes <= maxAvg)
    .sort((a, b) => a.score - b.score)
    .slice(0, params.maxItems || 4);
  if (!candidates.length) return null;

  const restaurants = await prisma.restaurant.findMany({
    where: { id: { in: candidates.map((c) => c.restaurantId) }, comingSoon: false },
    select: { id: true, name: true, slug: true, cuisine: true, imageUrl: true, heroImageUrl: true, rating: true },
  });
  const byId = new Map(restaurants.map((r) => [r.id, r]));
  const items = candidates
    .map((c) => {
      const restaurant = byId.get(c.restaurantId);
      if (!restaurant) return null;
      return {
        ...restaurantDto(restaurant),
        avgMinutesToday: Math.round(c.avgMinutes),
        deliveredToday: c.deliveredToday,
      };
    })
    .filter(Boolean);
  if (!items.length) return null;
  return {
    type: 'FASTEST_TODAY',
    id: 'fastest_today',
    theme: themeForKey('module:fastest_today'),
    title: 'Snabbast idag',
    subtitle: 'Räknat på dagens riktiga leveranser',
    restaurants: items,
  };
}

// ── Nästan framme: reward-produkt kunden är ~70 % nära (visas ibland) ───────
function rewardPointsPrice(product: { price: number; rewardPointsMultiplier?: number | null; rewardPointsPrice?: number | null }): number {
  if (typeof product.rewardPointsPrice === 'number' && product.rewardPointsPrice > 0) return Math.ceil(product.rewardPointsPrice);
  const priceKr = Math.round(product.price) / 100;
  const multiplier = typeof product.rewardPointsMultiplier === 'number' && product.rewardPointsMultiplier > 0 ? product.rewardPointsMultiplier : 1.5;
  return Math.ceil(priceKr * multiplier);
}

async function buildPointsNudge(userId: string, params: Record<string, number>) {
  // Inte varje start: dagsstabil rytm per kund (var N:e dag).
  const everyN = Math.max(1, Math.round(params.showEveryNDays || 3));
  if (dailyScore(`nudge:${userId}`) % everyN !== 0) return null;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { pointsBalance: true } });
  const balance = user?.pointsBalance ?? 0;
  if (balance <= 0) return null;

  const products = await prisma.product.findMany({
    where: { rewardable: true, isActive: true, category: { isActive: true, restaurant: { comingSoon: false } } },
    include: { category: { select: { restaurant: { select: { id: true, name: true, slug: true, cuisine: true, imageUrl: true, heroImageUrl: true, rating: true } } } } },
    take: 120,
  });
  const minRatio = (params.minRatioPct || 50) / 100;
  const maxRatio = (params.maxRatioPct || 85) / 100;
  let best: { product: any; cost: number; ratio: number } | null = null;
  for (const product of products as any[]) {
    if (!product.category?.restaurant) continue;
    const cost = rewardPointsPrice(product);
    if (cost <= 0) continue;
    const ratio = balance / cost;
    if (ratio < minRatio || ratio > maxRatio) continue;
    // Närmast 70 % vinner — kunden behöver handla med god marginal för resten.
    if (!best || Math.abs(ratio - 0.7) < Math.abs(best.ratio - 0.7)) best = { product, cost, ratio };
  }
  if (!best) return null;
  return {
    type: 'POINTS_NUDGE',
    id: `points_nudge:${best.product.id}`,
    theme: themeForKey(`nudge:${best.product.id}`),
    title: 'Nästan framme',
    product: {
      productId: best.product.id,
      name: best.product.name,
      imageUrl: best.product.imageUrl || null,
      costPoints: best.cost,
      restaurant: restaurantDto(best.product.category.restaurant),
    },
    balance,
    remainingPoints: Math.max(0, best.cost - balance),
  };
}

// ── Dagens drop: EN utvald bestseller per dag, tidsfönster + nedräkning ─────
async function buildDailyDrop(params: Record<string, number>) {
  const now = new Date();
  const hour = now.getHours();
  const startHour = params.startHour ?? 15;
  const endHour = params.endHour ?? 21;
  if (hour < startHour || hour >= endHour) return null;

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const minPriceOre = Math.round((params.minPriceKr || 70) * 100);
  const grouped = await (prisma.orderItem.groupBy as any)({
    by: ['productId'],
    where: { createdAt: { gte: since }, basePrice: { gte: minPriceOre }, order: { status: { notIn: EXCLUDED_STATUSES } } },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 10,
  });
  if (!(grouped as any[]).length) return null;
  const pick = dailyPick(grouped as any[], 'daily_drop');
  if (!pick) return null;
  const product = await prisma.product.findFirst({
    where: { id: pick.productId, isActive: true },
    include: { category: { select: { restaurant: { select: { id: true, name: true, slug: true, cuisine: true, imageUrl: true, heroImageUrl: true, rating: true, comingSoon: true } } } } },
  });
  const restaurant = (product as any)?.category?.restaurant;
  if (!product || !restaurant || restaurant.comingSoon) return null;
  const endsAt = new Date(now);
  endsAt.setHours(endHour, 0, 0, 0);
  await logEngineEvent('daily_drop', `Dagens drop: ${product.name} hos ${restaurant.name}`, { productId: product.id });
  return {
    type: 'DAILY_DROP',
    id: `daily_drop:${product.id}`,
    theme: themeForKey(`drop:${product.id}`, now),
    title: 'Dagens drop',
    subtitle: `Ikväll till ${String(endHour).padStart(2, '0')}:00`,
    endsAt: endsAt.toISOString(),
    product: {
      productId: product.id,
      name: product.name,
      priceKr: Math.round(product.price) / 100,
      imageUrl: product.imageUrl || null,
      restaurant: restaurantDto(restaurant),
    },
  };
}

// ── Ny i stan: nyöppnade restauranger, automatisk räls i två veckor ─────────
async function buildNewRestaurants(params: Record<string, number>) {
  const since = new Date(Date.now() - (params.windowDays || 14) * 24 * 60 * 60 * 1000);
  const restaurants = await prisma.restaurant.findMany({
    where: { comingSoon: false, createdAt: { gte: since } },
    select: { id: true, name: true, slug: true, cuisine: true, imageUrl: true, heroImageUrl: true, rating: true },
    orderBy: { createdAt: 'desc' },
    take: params.maxItems || 6,
  });
  if (!restaurants.length) return null;
  return {
    type: 'NEW_RESTAURANTS',
    id: 'new_restaurants',
    theme: themeForKey('module:new_restaurants'),
    title: 'Ny i stan',
    subtitle: 'Nyöppnat nära dig',
    restaurants: restaurants.map(restaurantDto),
  };
}

// ── Trendar: störst ordertillväxt mot förra veckan ──────────────────────────
async function buildTrending(params: Record<string, number>) {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const [thisWeek, lastWeek] = await Promise.all([
    (prisma.order.groupBy as any)({
      by: ['restaurantId'],
      where: { createdAt: { gte: new Date(now - weekMs) }, status: { notIn: EXCLUDED_STATUSES }, restaurantId: { not: null } },
      _count: { _all: true },
    }),
    (prisma.order.groupBy as any)({
      by: ['restaurantId'],
      where: { createdAt: { gte: new Date(now - 2 * weekMs), lt: new Date(now - weekMs) }, status: { notIn: EXCLUDED_STATUSES }, restaurantId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const lastByRestaurant = new Map<string, number>((lastWeek as any[]).map((g) => [g.restaurantId, g._count._all]));
  const minOrders = params.minOrders || 5;
  const candidates = (thisWeek as any[])
    .filter((g) => g._count._all >= minOrders)
    .map((g) => {
      const prev = lastByRestaurant.get(g.restaurantId) || 0;
      const growth = prev > 0 ? (g._count._all - prev) / prev : g._count._all >= minOrders ? 1 : 0;
      return { restaurantId: g.restaurantId, orders: g._count._all, growthPct: Math.round(growth * 100) };
    })
    .filter((c) => c.growthPct >= 20)
    .sort((a, b) => b.growthPct - a.growthPct)
    .slice(0, params.maxItems || 4);
  if (!candidates.length) return null;
  const restaurants = await prisma.restaurant.findMany({
    where: { id: { in: candidates.map((c) => c.restaurantId) }, comingSoon: false },
    select: { id: true, name: true, slug: true, cuisine: true, imageUrl: true, heroImageUrl: true, rating: true },
  });
  const byId = new Map(restaurants.map((r) => [r.id, r]));
  const items = candidates
    .map((c) => {
      const restaurant = byId.get(c.restaurantId);
      if (!restaurant) return null;
      return { ...restaurantDto(restaurant), growthPct: c.growthPct };
    })
    .filter(Boolean);
  if (!items.length) return null;
  return {
    type: 'TRENDING',
    id: 'trending',
    theme: themeForKey('module:trending'),
    title: 'Trendar i stan',
    subtitle: 'Växer snabbast just nu',
    restaurants: items,
  };
}

// ── Vi saknar dig: gillad restaurang, tyst i N dagar (personlig) ────────────
async function buildComeback(userId: string, params: Record<string, number>) {
  const quietSince = new Date(Date.now() - (params.quietDays || 21) * 24 * 60 * 60 * 1000);
  const grouped = await (prisma.order.groupBy as any)({
    by: ['restaurantId'],
    where: { userId, status: { notIn: EXCLUDED_STATUSES }, restaurantId: { not: null } },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  const candidates = (grouped as any[])
    .filter((g) => g._count._all >= (params.minOrders || 2) && g._max.createdAt && new Date(g._max.createdAt) < quietSince)
    .sort((a, b) => b._count._all - a._count._all);
  if (!candidates.length) return null;
  const pick = dailyPick(candidates, `comeback:${userId}`);
  if (!pick) return null;
  const restaurant = await prisma.restaurant.findFirst({
    where: { id: pick.restaurantId, comingSoon: false },
    select: { id: true, name: true, slug: true, cuisine: true, imageUrl: true, heroImageUrl: true, rating: true },
  });
  if (!restaurant) return null;
  return {
    type: 'COMEBACK',
    id: `comeback:${restaurant.id}`,
    theme: themeForKey(`comeback:${restaurant.id}`),
    title: `${restaurant.name} saknar dig`,
    subtitle: `${pick._count._all} beställningar tidigare. Dags igen?`,
    restaurant: restaurantDto(restaurant),
  };
}

// ── Uppdrag på hemskärmen: pågående mission med progress ────────────────────
async function buildStreakCard(userId: string) {
  const mission = await (prisma as any).userDeal.findFirst({
    where: {
      userId,
      type: 'APP_MISSION',
      status: 'ACTIVE',
      OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true, metadata: true },
  });
  if (!mission) return null;
  const meta = (mission.metadata || {}) as any;
  const target = Math.max(1, Math.round(Number(meta.missionTarget || 3)));
  const rewardPoints = Math.max(0, Math.round(Number(meta.missionRewardPoints || 0)));
  const allTime = String(meta.appMissionType || '').toUpperCase() === 'TOTAL_ORDERS';
  const count = await prisma.order.count({
    where: {
      userId,
      pointsAwarded: true,
      ...(allTime ? {} : { createdAt: { gte: mission.createdAt } }),
      status: { notIn: EXCLUDED_STATUSES },
    },
  });
  if (count >= target) return null; // klart uppdrag firas i Rewards, inte här
  return {
    type: 'STREAK',
    id: `streak:${mission.id}`,
    theme: themeForKey(`streak:${mission.id}`),
    title: meta.title || 'Ditt uppdrag',
    subtitle: `${Math.min(count, target)} av ${target} · ${rewardPoints} p väntar`,
    progress: { count: Math.min(count, target), target, rewardPoints },
  };
}

// ── Occasions: admin-skapade återkommande tillfällen ────────────────────────
// Lagras i EngineSetting key='occasions_data', params = { items: [...] }.
export type OccasionItem = {
  id: string;
  name: string;
  title: string;
  subtitle?: string;
  theme?: string;
  days: number[]; // 0=söndag ... 6=lördag
  startHour: number;
  endHour: number;
  active: boolean;
};

export async function readOccasions(): Promise<OccasionItem[]> {
  const row = await (prisma as any).engineSetting.findUnique({ where: { key: 'occasions_data' } }).catch(() => null);
  const items = ((row?.params as any)?.items || []) as OccasionItem[];
  return Array.isArray(items) ? items : [];
}

export async function writeOccasions(items: OccasionItem[]): Promise<void> {
  await (prisma as any).engineSetting.upsert({
    where: { key: 'occasions_data' },
    create: { key: 'occasions_data', enabled: true, params: { items } },
    update: { params: { items } },
  });
}

async function buildOccasion() {
  const now = new Date();
  const items = await readOccasions();
  const matching = items.filter(
    (o) => o.active && o.days?.includes(now.getDay()) && now.getHours() >= (o.startHour ?? 0) && now.getHours() < (o.endHour ?? 24),
  );
  if (!matching.length) return null;
  const pick = dailyPick(matching, 'occasion');
  if (!pick) return null;
  return {
    type: 'OCCASION',
    id: `occasion:${pick.id}`,
    theme: pick.theme || themeForKey(`occasion:${pick.id}`),
    title: pick.title,
    subtitle: pick.subtitle || null,
  };
}

// ── Väder-pulsen: SMHI:s öppna prognos-API (gratis, nyckellöst) ─────────────
const RAINY_SYMBOLS = new Set([8, 9, 10, 12, 13, 14, 18, 19, 20, 21, 15, 16, 17, 25, 26, 27]);

async function fetchWeatherSymbol(lat: number, lon: number): Promise<number | null> {
  try {
    const url = `https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/${lon.toFixed(4)}/lat/${lat.toFixed(4)}/data.json`;
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) return null;
    const data: any = await response.json();
    const first = data?.timeSeries?.[0];
    const symbol = first?.parameters?.find((p: any) => p.name === 'Wsymb2')?.values?.[0];
    return typeof symbol === 'number' ? symbol : null;
  } catch {
    return null;
  }
}

async function buildWeather(params: Record<string, number>) {
  const lat = params.lat || 55.7;
  const lon = params.lon || 13.19;
  const symbol = await cachedWeather(lat, lon);
  if (symbol === null || !RAINY_SYMBOLS.has(symbol)) return null;
  const snowy = symbol >= 15 && symbol <= 17 || symbol >= 25;
  return {
    type: 'WEATHER',
    id: 'weather',
    theme: 'midnight',
    title: snowy ? 'Snöar ute. Stanna inne.' : 'Regnar ute. Vi kör.',
    subtitle: 'Maten kommer till dig, du myser.',
  };
}

// 30 min-cache i minnet (vädret ändras inte per request).
let weatherCache: { key: string; value: number | null; expiresAt: number } | null = null;
async function cachedWeather(lat: number, lon: number): Promise<number | null> {
  const key = `${lat}:${lon}`;
  const now = Date.now();
  if (weatherCache && weatherCache.key === key && weatherCache.expiresAt > now) return weatherCache.value;
  const value = await fetchWeatherSymbol(lat, lon);
  weatherCache = { key, value, expiresAt: now + 30 * 60 * 1000 };
  return value;
}

// ── Dygnspulsen: hälsning efter tid på dygnet (server-styrd copy) ───────────
export function greetingForNow(date = new Date()): string {
  const hour = date.getHours();
  const isFriday = date.getDay() === 5;
  if (isFriday && hour >= 15) return 'Fredag. Du vet vad som gäller.';
  if (hour >= 5 && hour < 10) return 'God morgon';
  if (hour >= 10 && hour < 14) return 'Lunchdags?';
  if (hour >= 14 && hour < 17) return 'Sugen på något?';
  if (hour >= 17 && hour < 22) return 'Dags för middag';
  return 'Kvällshungrig?';
}

// ── Kompositören: max N moduler per dag, roterande urval ────────────────────
const MAX_MODULES = 6;

export async function buildHomePulse(userId: string | null): Promise<{ greeting: string; modules: any[] }> {
  const settings = await getEngineSettings();
  const jobs: Promise<any>[] = [
    settings.champion.enabled ? buildChampion(settings.champion.params) : Promise.resolve(null),
    settings.hot_products.enabled ? buildHotProducts(settings.hot_products.params) : Promise.resolve(null),
    settings.new_menu_items.enabled ? buildNewMenuItems(settings.new_menu_items.params) : Promise.resolve(null),
    settings.fastest_today.enabled ? buildFastestToday(settings.fastest_today.params) : Promise.resolve(null),
    settings.daily_drop.enabled ? buildDailyDrop(settings.daily_drop.params) : Promise.resolve(null),
    settings.new_restaurants.enabled ? buildNewRestaurants(settings.new_restaurants.params) : Promise.resolve(null),
    settings.trending.enabled ? buildTrending(settings.trending.params) : Promise.resolve(null),
    userId && settings.points_nudge.enabled ? buildPointsNudge(userId, settings.points_nudge.params) : Promise.resolve(null),
    userId && settings.comeback.enabled ? buildComeback(userId, settings.comeback.params) : Promise.resolve(null),
    userId && settings.streak_card.enabled ? buildStreakCard(userId) : Promise.resolve(null),
    settings.occasions.enabled ? buildOccasion() : Promise.resolve(null),
    settings.weather_pulse.enabled ? buildWeather(settings.weather_pulse.params) : Promise.resolve(null),
  ];
  const results = await Promise.allSettled(jobs);
  const modules = results
    .map((r) => (r.status === 'fulfilled' ? r.value : null))
    .filter(Boolean) as any[];

  // Personligt + hero har förtur; resten roterar dagligen om det finns fler
  // än plats. Appen interfolierar modulerna mellan restaurangsektionerna.
  const priorityTypes = new Set(['CHAMPION', 'DAILY_DROP', 'POINTS_NUDGE', 'STREAK', 'COMEBACK', 'OCCASION', 'WEATHER']);
  const priority = modules.filter((m) => priorityTypes.has(m.type));
  const rest = modules
    .filter((m) => !priorityTypes.has(m.type))
    .sort((a, b) => dailyScore(`slot:${a.type}`) - dailyScore(`slot:${b.type}`));
  const picked = [...priority, ...rest].slice(0, MAX_MODULES);

  // Tema-rotation avstängd → neutralt tema på allt.
  if (!settings.theme_rotation.enabled) {
    for (const module of picked) module.theme = 'sky';
  }
  return { greeting: greetingForNow(), modules: picked };
}
