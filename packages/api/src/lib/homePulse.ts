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
  | 'points_nudge';

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
    description: 'Räknar dagens levererade ordrar och nuvarande kö per restaurang. De snabbaste lyfts fram.',
    defaultParams: { minDeliveredToday: 3, maxItems: 4 },
    paramLabels: { minDeliveredToday: 'Min levererade idag', maxItems: 'Max restauranger' },
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
  const candidates = [...stats.entries()]
    .filter(([, s]) => s.total >= (params.minDeliveredToday || 3))
    .map(([restaurantId, s]) => {
      const avgMinutes = s.minutesSum / s.total;
      const activeNow = liveByRestaurant.get(restaurantId) || 0;
      // Kö väger in: snabb historik men full kö just nu ska inte lova snabbt.
      return { restaurantId, avgMinutes, activeNow, deliveredToday: s.total, score: avgMinutes * (1 + activeNow * 0.15) };
    })
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

// ── Kompositören: max N moduler per dag, roterande urval ────────────────────
const MAX_MODULES = 3;

export async function buildHomePulse(userId: string | null): Promise<{ modules: any[] }> {
  const settings = await getEngineSettings();
  const jobs: Promise<any>[] = [
    settings.champion.enabled ? buildChampion(settings.champion.params) : Promise.resolve(null),
    settings.hot_products.enabled ? buildHotProducts(settings.hot_products.params) : Promise.resolve(null),
    settings.new_menu_items.enabled ? buildNewMenuItems(settings.new_menu_items.params) : Promise.resolve(null),
    settings.fastest_today.enabled ? buildFastestToday(settings.fastest_today.params) : Promise.resolve(null),
    userId && settings.points_nudge.enabled ? buildPointsNudge(userId, settings.points_nudge.params) : Promise.resolve(null),
  ];
  const results = await Promise.allSettled(jobs);
  const modules = results
    .map((r) => (r.status === 'fulfilled' ? r.value : null))
    .filter(Boolean) as any[];

  // Champion (hero) och poäng-knuffen (personlig) har förtur; resten roterar
  // dagligen om det finns fler än plats. Hemskärmen ska andas.
  const priority = modules.filter((m) => m.type === 'CHAMPION' || m.type === 'POINTS_NUDGE');
  const rest = modules
    .filter((m) => m.type !== 'CHAMPION' && m.type !== 'POINTS_NUDGE')
    .sort((a, b) => dailyScore(`slot:${a.type}`) - dailyScore(`slot:${b.type}`));
  const picked = [...priority, ...rest].slice(0, MAX_MODULES);

  // Tema-rotation avstängd → neutralt tema på allt.
  if (!settings.theme_rotation.enabled) {
    for (const module of picked) module.theme = 'sky';
  }
  return { modules: picked };
}
