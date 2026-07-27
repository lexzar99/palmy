// Puls-motorerna: autonoma hemskärmsmoduler. Servern komponerar, appen renderar.
// Principer: allt data-drivet (inga påhittade siffror), max N moduler per dag
// (hemskärmen ska andas, inte svämma över), tema roterar per vecka, allt styrs
// och loggas via EngineSetting/EngineEvent (admin → Motorn).

import prisma from './prisma';
import { getChampionRestaurantIds } from './showcase';
import { themeForKey, dailyPick, dailyScore, dayOfYear } from './themeRotation';

const LIVE_STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERING'];
const DONE_STATUSES = ['DELIVERED', 'COMPLETED'];
const EXCLUDED_STATUSES = ['CANCELLED', 'REJECTED'];

export type EngineKey =
  | 'theme_rotation'
  | 'champion'
  | 'personal_favorite'
  | 'hot_products'
  | 'favorite_product'
  | 'fastest_today'
  | 'daily_drop'
  | 'new_restaurants'
  | 'trending'
  | 'comeback'
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
    key: 'personal_favorite',
    title: 'Din favoritrestaurang',
    description: 'Kundens egen mest beställda restaurang tar Aktuellt-platsen istället för veckans globala favorit. Gäster och nya kunder ser den globala som vanligt.',
    defaultParams: { minOrders: 3, windowDays: 180 },
    paramLabels: { minOrders: 'Min antal ordrar', windowDays: 'Fönster (dagar)' },
  },
  {
    key: 'hot_products',
    title: 'Hetast just nu',
    description: 'Mest beställda produkterna senaste 72 timmarna. Bara artiklar över prisgolvet.',
    defaultParams: { minPriceKr: 70, maxItems: 5, windowHours: 72, maxPerRestaurant: 2 },
    paramLabels: { minPriceKr: 'Prisgolv (kr)', maxItems: 'Max produkter', windowHours: 'Fönster (timmar)', maxPerRestaurant: 'Max per restaurang' },
  },
  {
    key: 'favorite_product',
    title: 'Din favorit',
    description: 'Kundens mest beställda artikel (3+ köp, över prisgolvet) får ett specialkort med 10% direkt i modalen. Försvinner efter köp, kommer tillbaka efter en paus som anpassas till kundens aktivitet.',
    defaultParams: { minPriceKr: 100, minCount: 3, percent: 10, activeCooldownDays: 5, quietCooldownDays: 2 },
    paramLabels: { minPriceKr: 'Prisgolv (kr)', minCount: 'Min antal köp', percent: 'Rabatt (%)', activeCooldownDays: 'Paus aktiv kund (dagar)', quietCooldownDays: 'Paus tyst kund (dagar)' },
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
    description: 'En utvald rätt (över prisgolvet) per dag med tidsfönster och nedräkning. Ny rätt och nytt tema imorgon.',
    defaultParams: { minPriceKr: 100, startHour: 15, endHour: 21 },
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
];

export type EngineSettings = Record<EngineKey, { enabled: boolean; params: Record<string, number> }>;
export const PREVIEW_ALL_MODULES_KEY = 'preview_all_modules';

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

export async function isPreviewAllModulesEnabled(): Promise<boolean> {
  const row = await (prisma as any).engineSetting.findUnique({ where: { key: PREVIEW_ALL_MODULES_KEY } }).catch(() => null);
  return Boolean(row?.enabled);
}

export async function setPreviewAllModulesEnabled(enabled: boolean): Promise<boolean> {
  await (prisma as any).engineSetting.upsert({
    where: { key: PREVIEW_ALL_MODULES_KEY },
    create: { key: PREVIEW_ALL_MODULES_KEY, enabled, params: {} },
    update: { enabled, params: {} },
  });
  await (prisma as any).engineEvent.create({
    data: {
      id: `ev${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      engine: 'preview_all_modules',
      message: enabled ? 'Testläge på: alla moduler visas i appen' : 'Testläge av: normal rotation gäller',
      meta: { enabled },
    },
  }).catch(() => null);
  return enabled;
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
  featuredClass: r.featuredClass ?? null,
});

const productDto = (p: any) => ({
  productId: p.id,
  name: p.name,
  priceKr: Math.round(p.price || 0) / 100,
  imageUrl: p.imageUrl || null,
  restaurant: restaurantDto(p.category.restaurant),
});

async function previewRestaurants(limit = 4) {
  const restaurants = await prisma.restaurant.findMany({
    where: { archivedAt: null, comingSoon: false, draft: false },
    select: { id: true, name: true, slug: true, cuisine: true, imageUrl: true, heroImageUrl: true, rating: true, featuredClass: true },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  });
  return restaurants.map(restaurantDto);
}

async function previewProducts(limit = 4) {
  const products = await prisma.product.findMany({
    where: { isActive: true, category: { isActive: true, restaurant: { archivedAt: null, comingSoon: false, draft: false } } },
    include: { category: { select: { restaurant: { select: { id: true, name: true, slug: true, cuisine: true, imageUrl: true, heroImageUrl: true, rating: true, featuredClass: true } } } } },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  });
  return (products as any[]).map(productDto);
}

// ── Champion: mest beställda restaurangen senaste 7 dagarna ────────────────
async function buildChampion(params: Record<string, number>) {
  const [restaurantId] = await getChampionRestaurantIds();
  if (!restaurantId) return null;
  const restaurant = await prisma.restaurant.findFirst({
    where: { id: restaurantId, archivedAt: null },
    select: { id: true, name: true, slug: true, cuisine: true, imageUrl: true, heroImageUrl: true, rating: true, comingSoon: true, draft: true },
  });
  if (!restaurant || restaurant.comingSoon || restaurant.draft) return null;
  const orders7d = await prisma.order.count({
    where: {
      restaurantId: restaurant.id,
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      status: { notIn: EXCLUDED_STATUSES },
    },
  });
  // Showcase-adminen är den gemensamma publiceringskällan. Om en restaurang
  // redan har valts där ska den synas i web och app även när veckans lokala
  // ordervolym ligger under den gamla motorns miniminivå.
  void params;

  // Endast restaurangens hero-banner (ägarbeslut, ingen bildrotation).
  const images = [restaurant.heroImageUrl || restaurant.imageUrl].filter((url): url is string => Boolean(url));

  await logEngineEvent('champion', `Veckans favorit: ${restaurant.name} (${orders7d} ordrar/7d)`, {
    restaurantId: restaurant.id,
    orders7d,
  });
  return {
    type: 'CHAMPION',
    id: `champion:${restaurant.id}`,
    theme: themeForKey(`champion:${restaurant.id}`),
    title: 'Veckans favorit',
    subtitle: 'Mest älskad den här veckan',
    restaurant: restaurantDto(restaurant),
    images,
  };
}

async function previewChampion() {
  const restaurants = await previewRestaurants(1);
  const restaurant = restaurants[0];
  if (!restaurant) return null;
  const images = [restaurant.heroImageUrl || restaurant.imageUrl].filter((url): url is string => Boolean(url));
  return {
    type: 'CHAMPION',
    id: `preview:champion:${restaurant.id}`,
    theme: themeForKey(`preview:champion:${restaurant.id}`),
    title: 'Veckans favorit',
    subtitle: 'Populär nära dig',
    restaurant,
    images,
  };
}

// ── Din favorit: kundens egen mest beställda restaurang ────────────────────
// Tar champion-platsen i Aktuellt när kunden har ett tydligt eget mönster.
// Klienterna renderar första CHAMPION-modulen, därför delar de två motorerna
// samma typ — det får bara finnas en åt gången.
async function buildPersonalFavorite(userId: string, params: Record<string, number>) {
  const minOrders = Math.max(2, Math.round(params.minOrders || 3));
  const windowDays = Math.max(30, Math.round(params.windowDays || 180));
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });

  // Ordrar lagda som gäst på samma telefonnummer räknas också — annars tappar
  // kunden sin historik i samma sekund som hen skapar konto.
  const identityFilter: any[] = [{ userId }];
  if (user?.phone) identityFilter.push({ customerPhone: user.phone });

  const grouped = await (prisma.order.groupBy as any)({
    by: ['restaurantId'],
    where: {
      createdAt: { gte: since },
      status: { notIn: EXCLUDED_STATUSES },
      restaurantId: { not: null },
      OR: identityFilter,
    },
    _count: { restaurantId: true },
    orderBy: { _count: { restaurantId: 'desc' } },
    take: 3,
  });

  const [top, runnerUp] = grouped as any[];
  const orders = Number(top?._count?.restaurantId || 0);
  if (!top?.restaurantId || orders < minOrders) return null;

  const restaurant = await prisma.restaurant.findFirst({
    where: { id: top.restaurantId, archivedAt: null },
    select: { id: true, name: true, slug: true, cuisine: true, imageUrl: true, heroImageUrl: true, rating: true, featuredClass: true, comingSoon: true, draft: true },
  });
  if (!restaurant || restaurant.comingSoon || restaurant.draft) return null;

  // "Du beställer alltid här" är bara sant när favoriten faktiskt dominerar.
  const runnerUpOrders = Number(runnerUp?._count?.restaurantId || 0);
  const dominant = orders >= Math.max(minOrders + 1, runnerUpOrders * 2);
  const images = [restaurant.heroImageUrl || restaurant.imageUrl].filter((url): url is string => Boolean(url));

  return {
    type: 'CHAMPION',
    id: `personal-favorite:${restaurant.id}`,
    theme: themeForKey(`personal-favorite:${restaurant.id}`),
    title: 'Din favorit',
    subtitle: dominant ? 'Du beställer alltid här' : 'Du beställde här mest',
    restaurant: restaurantDto(restaurant),
    images,
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
      category: { select: { restaurant: { select: { id: true, name: true, slug: true, cuisine: true, imageUrl: true, heroImageUrl: true, rating: true, comingSoon: true, draft: true } } } },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  // Max N artiklar totalt och max 2 per restaurang — bredd över stan,
  // inte fem rätter från samma kök.
  const maxItems = params.maxItems || 5;
  const maxPerRestaurant = Math.max(1, params.maxPerRestaurant || 2);
  const perRestaurant = new Map<string, number>();
  const items: any[] = [];
  for (const g of grouped as any[]) {
    if (items.length >= maxItems) break;
    const product = byId.get(g.productId) as any;
    const restaurant = product?.category?.restaurant;
    if (!product || !restaurant || restaurant.comingSoon || restaurant.draft) continue;
    const used = perRestaurant.get(restaurant.id) || 0;
    if (used >= maxPerRestaurant) continue;
    perRestaurant.set(restaurant.id, used + 1);
    items.push({
      productId: product.id,
      name: product.name,
      priceKr: Math.round(product.price) / 100,
      imageUrl: product.imageUrl || null,
      restaurant: restaurantDto(restaurant),
    });
  }
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

async function previewHotProducts() {
  const products = await previewProducts(8);
  if (!products.length) return null;
  return {
    type: 'HOT_PRODUCTS',
    id: 'preview:hot_products',
    theme: themeForKey('preview:hot_products'),
    title: 'Hetast just nu',
    subtitle: 'Mest beställt de senaste dagarna',
    products,
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
      category: { isActive: true, restaurant: { comingSoon: false, draft: false, createdAt: { lte: minRestaurantCreated } } },
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

async function previewNewMenuItems() {
  const items = await previewProducts(4);
  if (!items.length) return null;
  return {
    type: 'NEW_MENU_ITEMS',
    id: 'preview:new_menu_items',
    theme: themeForKey('preview:new_menu_items'),
    title: 'Nytt på menyn',
    subtitle: 'Färska tillskott hos dina lokala',
    items,
  };
}

// ── Snabbast idag: senaste 36 timmarnas leveranser + nuvarande kö ───────────
async function buildFastestToday(params: Record<string, number>) {
  // Rullande fönster, inte kalenderdygn: efter 00:00 behåller vi gårdagens
  // faktiska leveranstider tills dagens volym hunnit bli representativ.
  const rollingSince = new Date(Date.now() - 36 * 60 * 60 * 1000);
  const [delivered, live] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: rollingSince }, status: { in: DONE_STATUSES }, restaurantId: { not: null } },
      select: { restaurantId: true, createdAt: true, updatedAt: true },
    }),
    prisma.order.groupBy({
      by: ['restaurantId'],
      where: { createdAt: { gte: rollingSince }, status: { in: LIVE_STATUSES }, restaurantId: { not: null } },
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
    where: { id: { in: candidates.map((c) => c.restaurantId) }, archivedAt: null, comingSoon: false, draft: false },
    select: { id: true, name: true, slug: true, cuisine: true, imageUrl: true, heroImageUrl: true, rating: true, featuredClass: true },
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
    subtitle: 'Räknat på riktiga leveranser senaste 36 timmarna',
    restaurants: items,
  };
}

async function previewFastestToday() {
  const restaurants = (await previewRestaurants(4)).map((r, index) => ({
    ...r,
    avgMinutesToday: 22 + index * 4,
    deliveredToday: 8 - index,
  }));
  if (!restaurants.length) return null;
  return {
    type: 'FASTEST_TODAY',
    id: 'preview:fastest_today',
    theme: themeForKey('preview:fastest_today'),
    title: 'Snabbast idag',
    subtitle: 'Räknat på riktiga leveranser senaste 36 timmarna',
    restaurants,
  };
}

// ── Dagens drop: EN utvald bestseller per dag, tidsfönster + nedräkning ─────
async function buildDailyDrop(params: Record<string, number>, force = false) {
  const now = new Date();
  const hour = now.getHours();
  const startHour = params.startHour ?? 15;
  const endHour = params.endHour ?? 21;
  if (!force && (hour < startHour || hour >= endHour)) return null;

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const minPriceOre = Math.round((params.minPriceKr || 100) * 100);
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
    include: { category: { select: { restaurant: { select: { id: true, name: true, slug: true, cuisine: true, imageUrl: true, heroImageUrl: true, rating: true, comingSoon: true, draft: true } } } } },
  });
  const restaurant = (product as any)?.category?.restaurant;
  if (!product || !restaurant || restaurant.comingSoon || restaurant.draft) return null;
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

async function previewDailyDrop(params: Record<string, number>) {
  const real = await buildDailyDrop(params, true);
  if (real) return real;
  const products = await previewProducts(1);
  const product = products[0];
  if (!product) return null;
  const endsAt = new Date();
  endsAt.setHours(Math.max(endsAt.getHours() + 2, 21), 0, 0, 0);
  return {
    type: 'DAILY_DROP',
    id: `preview:daily_drop:${product.productId}`,
    theme: themeForKey(`preview:daily_drop:${product.productId}`),
    title: 'Dagens drop',
    subtitle: 'Ikväll till 21:00',
    endsAt: endsAt.toISOString(),
    product,
  };
}

// Trendar + Ny i stan bor nu i lib/showcase (enskilda hero-kort i sponsor-
// karusellen), inte som pulse-moduler. Deras build/preview-funktioner togs bort.

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
    where: { id: pick.restaurantId, archivedAt: null, comingSoon: false, draft: false },
    select: { id: true, name: true, slug: true, cuisine: true, imageUrl: true, heroImageUrl: true, rating: true, featuredClass: true },
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

async function previewComeback() {
  const restaurants = await previewRestaurants(1);
  const restaurant = restaurants[0];
  if (!restaurant) return null;
  return {
    type: 'COMEBACK',
    id: `preview:comeback:${restaurant.id}`,
    theme: themeForKey(`preview:comeback:${restaurant.id}`),
    title: `${restaurant.name} saknar dig`,
    subtitle: 'Dags igen?',
    restaurant,
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

async function buildOccasion(force = false) {
  const now = new Date();
  const items = await readOccasions();
  const matching = force
    ? items.filter((o) => o.active)
    : items.filter(
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

async function previewOccasion() {
  const real = await buildOccasion(true);
  if (real) return real;
  return {
    type: 'OCCASION',
    id: 'preview:occasion',
    theme: 'ember',
    title: 'Fredagsmys?',
    subtitle: 'Något gott nära dig',
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

async function buildWeather(params: Record<string, number>, force = false) {
  const lat = params.lat || 55.7;
  const lon = params.lon || 13.19;
  const symbol = await cachedWeather(lat, lon);
  if (!force && (symbol === null || !RAINY_SYMBOLS.has(symbol))) return null;
  const snowy = symbol >= 15 && symbol <= 17 || symbol >= 25;
  return {
    type: 'WEATHER',
    id: 'weather',
    theme: 'midnight',
    title: snowy ? 'Snöar ute. Stanna inne.' : 'Regnar ute. Vi kör.',
    subtitle: 'Maten kommer till dig, du myser.',
  };
}

async function previewWeather(params: Record<string, number>) {
  return buildWeather(params, true);
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

// ── Din favorit: mest beställda artikeln (3+ köp, över prisgolvet) ──────────
// Roterar bland kandidaterna dag för dag. Försvinner medan en claim är aktiv
// och under en paus efter köp — pausen är kortare för tysta kunder (de behöver
// en anledning att komma tillbaka) och längre för aktiva.
export async function favoriteCandidates(userId: string, params: Record<string, number>) {
  const minPriceOre = Math.round((params.minPriceKr || 100) * 100);
  const minCount = Math.max(2, Math.round(params.minCount || 3));
  const grouped = await (prisma.orderItem.groupBy as any)({
    by: ['productId'],
    where: {
      basePrice: { gte: minPriceOre },
      order: { userId, status: { notIn: EXCLUDED_STATUSES } },
    },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 8,
  });
  const strong = (grouped as any[]).filter((g) => (g._sum.quantity || 0) >= minCount);
  if (!strong.length) return [];
  const products = await prisma.product.findMany({
    where: {
      id: { in: strong.map((g) => g.productId) },
      isActive: true,
      price: { gte: minPriceOre },
      category: { isActive: true, restaurant: { comingSoon: false, draft: false } },
    },
    include: { category: { select: { restaurant: { select: { id: true, name: true, slug: true, cuisine: true, imageUrl: true, heroImageUrl: true, rating: true, comingSoon: true } } } } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  return strong
    .map((g) => {
      const product = byId.get(g.productId) as any;
      const restaurant = product?.category?.restaurant;
      if (!product || !restaurant || restaurant.comingSoon) return null;
      return { product, restaurant, timesOrdered: g._sum.quantity || 0 };
    })
    .filter(Boolean) as { product: any; restaurant: any; timesOrdered: number }[];
}

const favoriteProductIdFor = (userDeal: any) => {
  const metadata = (userDeal?.metadata || {}) as any;
  const productId = String(metadata.favoriteProductId || '').trim();
  return productId || null;
};

const favoriteProductVisible = async (userDeal: any) => {
  const productId = favoriteProductIdFor(userDeal);
  if (!productId) return true;
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      isActive: true,
      category: { isActive: true, restaurant: { comingSoon: false, draft: false } },
    },
    select: { id: true },
  });
  return Boolean(product);
};

async function buildFavoriteProduct(userId: string, params: Record<string, number>) {
  // Aktiv favorit-claim ute? Då visas inget kort (den ligger i kassan).
  const active = await (prisma as any).userDeal.findFirst({
    where: { userId, type: 'FAVORITE_PRODUCT', status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] },
    select: { id: true, metadata: true },
  });
  if (active) {
    if (await favoriteProductVisible(active)) return null;
    await (prisma as any).userDeal.updateMany({
      where: { id: active.id, status: { in: ['ACTIVE', 'RESERVED'] } },
      data: { status: 'EXPIRED' },
    }).catch(() => null);
  }

  // Paus efter köp: aktiva kunder får vänta längre, tysta lockas tillbaka fortare.
  const lastUsed = await (prisma as any).userDeal.findFirst({
    where: { userId, type: 'FAVORITE_PRODUCT', status: 'USED' },
    orderBy: { usedAt: 'desc' },
    select: { usedAt: true },
  });
  if (lastUsed?.usedAt) {
    const recentOrders = await prisma.order.count({
      where: { userId, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, status: { notIn: EXCLUDED_STATUSES } },
    });
    const cooldownDays = recentOrders >= 2 ? (params.activeCooldownDays || 5) : (params.quietCooldownDays || 2);
    if (new Date(lastUsed.usedAt).getTime() > Date.now() - cooldownDays * 24 * 60 * 60 * 1000) return null;
  }

  const candidates = await favoriteCandidates(userId, params);
  if (!candidates.length) return null;
  // Rotation: 4 köp och 6 köp av två olika artiklar → varannan gång var.
  const pick = dailyPick(candidates, `favorite:${userId}`);
  if (!pick) return null;
  const priceOre = Math.min(pick.product.price, pick.product.discountPrice || pick.product.price);
  const percent = Math.max(5, Math.round(params.percent || 10));
  return {
    type: 'FAVORITE',
    id: `favorite:${pick.product.id}`,
    theme: themeForKey(`favorite:${pick.product.id}`),
    title: 'Din favorit',
    subtitle: `Du har beställt den ${pick.timesOrdered} gånger`,
    percent,
    product: {
      productId: pick.product.id,
      name: pick.product.name,
      priceKr: Math.round(priceOre) / 100,
      imageUrl: pick.product.imageUrl || null,
      restaurant: restaurantDto(pick.restaurant),
    },
  };
}

async function previewFavoriteProduct(params: Record<string, number>) {
  const products = await previewProducts(1);
  const product = products[0];
  if (!product) return null;
  return {
    type: 'FAVORITE',
    id: `preview:favorite:${product.productId}`,
    theme: themeForKey(`preview:favorite:${product.productId}`),
    title: 'Din favorit',
    subtitle: 'Du har beställt den 4 gånger',
    percent: Math.max(5, Math.round(params.percent || 10)),
    product,
  };
}

// ── Dygnspulsen: hälsning efter tid på dygnet (server-styrd copy) ───────────
export function greetingForNow(date = new Date()): string {
  void date;
  return '';
}

// ── Kompositören: max N moduler per dag, roterande urval ────────────────────
const MAX_MODULES = 6;

export async function buildHomePulse(userId: string | null): Promise<{ greeting: string; modules: any[] }> {
  const settings = await getEngineSettings();
  const previewAll = await isPreviewAllModulesEnabled();
  const buildForPreview = async (normal: Promise<any>, preview: () => Promise<any>) => {
    const module = await normal.catch(() => null);
    return module || (previewAll ? preview() : null);
  };
  const engineOn = (key: EngineKey) => previewAll || settings[key].enabled;
  const jobs: Promise<any>[] = [
    // Kundens egen favorit äger Aktuellt-platsen när den finns, annars veckans
    // globala favorit. Aldrig båda: klienterna visar första CHAMPION-modulen.
    (async () => {
      const personal = engineOn('personal_favorite') && userId
        ? await buildPersonalFavorite(userId, settings.personal_favorite.params).catch(() => null)
        : null;
      if (personal) return personal;
      return engineOn('champion')
        ? buildForPreview(buildChampion(settings.champion.params), previewChampion)
        : null;
    })(),
    engineOn('hot_products') ? buildForPreview(buildHotProducts(settings.hot_products.params), previewHotProducts) : Promise.resolve(null),
    Promise.resolve(null),
    engineOn('fastest_today') ? buildForPreview(buildFastestToday(settings.fastest_today.params), previewFastestToday) : Promise.resolve(null),
    engineOn('daily_drop') ? buildForPreview(buildDailyDrop(settings.daily_drop.params, previewAll), () => previewDailyDrop(settings.daily_drop.params)) : Promise.resolve(null),
    // Trendar + Ny i stan hanteras nu som enskilda hero-kort i sponsor-karusellen
    // (lib/showcase), inte som pulse-rälsar. Därför inte med här längre.
    engineOn('comeback') && userId ? buildForPreview(buildComeback(userId, settings.comeback.params), previewComeback) : previewAll ? previewComeback() : Promise.resolve(null),
    engineOn('occasions') ? buildForPreview(buildOccasion(previewAll), previewOccasion) : Promise.resolve(null),
    engineOn('weather_pulse') ? buildForPreview(buildWeather(settings.weather_pulse.params, previewAll), () => previewWeather(settings.weather_pulse.params)) : Promise.resolve(null),
  ];
  const results = await Promise.allSettled(jobs);
  const modules = results
    .map((r) => (r.status === 'fulfilled' ? r.value : null))
    .filter(Boolean) as any[];

  // Personligt + hero har förtur; resten roterar dagligen om det finns fler
  // än plats. Appen interfolierar modulerna mellan restaurangsektionerna.
  const priorityTypes = new Set(['CHAMPION', 'DAILY_DROP', 'POINTS_NUDGE', 'STREAK', 'COMEBACK', 'OCCASION', 'WEATHER', 'FAVORITE']);
  const priority = modules.filter((m) => priorityTypes.has(m.type));
  const rest = modules
    .filter((m) => !priorityTypes.has(m.type))
    .sort((a, b) => dailyScore(`slot:${a.type}`) - dailyScore(`slot:${b.type}`));
  const picked = previewAll ? [...priority, ...rest] : [...priority, ...rest].slice(0, MAX_MODULES);

  // Tema-rotation avstängd → neutralt tema på allt.
  if (!settings.theme_rotation.enabled) {
    for (const module of picked) module.theme = 'sky';
  }
  return { greeting: greetingForNow(), modules: picked };
}
