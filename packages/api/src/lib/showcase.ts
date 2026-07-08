/**
 * Showcase: dynamiska hemskärmskort (rabatter, trendar, ny i stan).
 *
 * Ersätter den gamla "Motorn"-adminen. Tre ytor beräknas automatiskt från
 * data och kan finjusteras med manuella overrides som gäller tills nästa
 * rotation:
 *
 *  - discounts: en restaurang per aktiv deal-yta, högsta rabatten avgör
 *    kortets text, max 5, prioritet tier (guld>silver>standard) sen ordrar.
 *    Roterar var 48:e timme (bara om erbjudandena faktiskt ändrats).
 *  - trending: restauranger med mest ordrar just nu (antal döljs för kunden).
 *    Roterar var 24:e timme.
 *  - new: nyöppnade restauranger (createdAt). Roterar var 24:e timme.
 *
 * State (rotationstid, snapshot, hidden/pinned) lagras i EngineSetting-KV så
 * ingen schema-migrering behövs. Prioritet/scope-helpers återanvänds från
 * lib/deals.ts.
 */
import prisma from './prisma';
import { getDealScopeType, parseApplicableRestaurantIds, parseDealTargetIds } from './deals';
import { THEME_POOL } from './themeRotation';

export type ShowcaseSurface = 'discounts' | 'trending' | 'new';

const STATE_KEY: Record<ShowcaseSurface, string> = {
  discounts: 'showcase_discounts',
  trending: 'showcase_trending',
  new: 'showcase_new',
};

const DEFAULT_HOURS: Record<ShowcaseSurface, number> = {
  discounts: 48,
  trending: 24,
  new: 24,
};

const MAX_SHOWN: Record<ShowcaseSurface, number> = {
  discounts: 5,
  trending: 6,
  new: 6,
};

const NEW_WINDOW_DAYS = 21;
const ORDER_WINDOW_DAYS = 30;
const EXCLUDED_STATUSES = ['CANCELLED', 'REJECTED', 'DELIVERY_FAILED'];

interface SurfaceState {
  rotationHours: number;
  rotatedAt: string | null; // ISO
  signature: string; // fingerprint av valbar mängd; ändras = nya erbjudanden
  snapshot: string[]; // restaurang-id valda vid senaste rotation
  hidden: string[]; // manuellt borttogglade
  pinned: string[]; // manuellt inlagda (går före snapshot)
}

function emptyState(surface: ShowcaseSurface): SurfaceState {
  return { rotationHours: DEFAULT_HOURS[surface], rotatedAt: null, signature: '', snapshot: [], hidden: [], pinned: [] };
}

async function readState(surface: ShowcaseSurface): Promise<SurfaceState> {
  const row = await (prisma as any).engineSetting.findUnique({ where: { key: STATE_KEY[surface] } }).catch(() => null);
  const base = emptyState(surface);
  if (!row?.params) return base;
  const p = row.params as any;
  return {
    rotationHours: Number.isFinite(p.rotationHours) && p.rotationHours > 0 ? Math.round(p.rotationHours) : base.rotationHours,
    rotatedAt: typeof p.rotatedAt === 'string' ? p.rotatedAt : null,
    signature: typeof p.signature === 'string' ? p.signature : '',
    snapshot: Array.isArray(p.snapshot) ? p.snapshot.filter((x: any) => typeof x === 'string') : [],
    hidden: Array.isArray(p.hidden) ? p.hidden.filter((x: any) => typeof x === 'string') : [],
    pinned: Array.isArray(p.pinned) ? p.pinned.filter((x: any) => typeof x === 'string') : [],
  };
}

async function writeState(surface: ShowcaseSurface, state: SurfaceState): Promise<void> {
  await (prisma as any).engineSetting.upsert({
    where: { key: STATE_KEY[surface] },
    create: { key: STATE_KEY[surface], enabled: true, params: state as any },
    update: { params: state as any },
  });
}

/**
 * Applicerar rotation + overrides på en rankad kandidatlista och returnerar de
 * synliga id:na. Snapshot fryses tills rotationsfönstret löpt ut OCH signaturen
 * ändrats (nya erbjudanden). Rotation nollar manuella overrides.
 */
async function resolve(
  surface: ShowcaseSurface,
  rankedCandidateIds: string[],
  signature: string,
  now: Date,
): Promise<{ shownIds: string[]; state: SurfaceState }> {
  const state = await readState(surface);
  const maxShown = MAX_SHOWN[surface];
  const windowMs = state.rotationHours * 60 * 60 * 1000;
  const rotatedAtMs = state.rotatedAt ? new Date(state.rotatedAt).getTime() : 0;
  const elapsed = now.getTime() - rotatedAtMs;
  const needInit = !state.rotatedAt || state.snapshot.length === 0;
  const changed = signature !== state.signature;

  if (needInit || (elapsed >= windowMs && changed)) {
    state.rotatedAt = now.toISOString();
    state.signature = signature;
    state.snapshot = rankedCandidateIds.slice(0, maxShown);
    state.hidden = [];
    state.pinned = [];
    await writeState(surface, state);
  } else if (changed && !state.signature) {
    // Första gången vi ser en signatur, spara den utan att röra snapshot.
    state.signature = signature;
    await writeState(surface, state);
  }

  const pinned = state.pinned.filter((id) => !state.hidden.includes(id));
  const fromSnapshot = state.snapshot.filter((id) => !state.hidden.includes(id) && !pinned.includes(id));
  const shownIds = [...pinned, ...fromSnapshot].slice(0, maxShown);
  return { shownIds, state };
}

// ── Rabattkort ──────────────────────────────────────────────────────────────

export interface DiscountCard {
  kind: 'DISCOUNT';
  restaurantId: string;
  restaurantSlug: string;
  restaurantName: string;
  headline: string;
  subtitle: string | null;
  footnote: string | null; // slutdatum, litet
  theme: string;
  imageUrl: string | null;
  featuredClass: number;
  percent: number | null;
}

const SV_MONTHS = ['jan', 'feb', 'mars', 'april', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];

function endDateFootnote(validUntil: Date | null): string | null {
  if (!validUntil) return null;
  const d = new Date(validUntil);
  return `Till ${d.getDate()} ${SV_MONTHS[d.getMonth()]}`;
}

function discountMagnitude(deal: any): number {
  // Rankar vilken deal per restaurang som vinner. Procent väger tyngst.
  if (deal.discountType === 'PERCENTAGE') return deal.discountValue || 0;
  if (deal.discountType === 'FIXED') return Math.min(50, Math.round((deal.discountValue || 0) / 100)); // kr, dämpat
  if (deal.discountType === 'FIXED_PRICE') return 5;
  if (deal.freeDelivery) return 1;
  return 0;
}

function themeForIndex(index: number): string {
  return THEME_POOL[index % THEME_POOL.length];
}

/**
 * Bygger kortdata för en restaurangs bästa deal. Texten följer scope:
 *  - hela restaurangen: "30% rabatt på hela Palmyra"
 *  - kategori:          "30% på kategorin Kebabpizzor" + restaurangnamn
 *  - produkt:           "Upp till 30% rabatt" + restaurangnamn
 */
function buildCardText(
  deal: any,
  restaurantName: string,
  categoryName: string | null,
): { headline: string; subtitle: string | null; percent: number | null } {
  const scope = getDealScopeType(deal);
  const pct = deal.discountType === 'PERCENTAGE' ? deal.discountValue || 0 : null;
  const krOff = deal.discountType === 'FIXED' ? Math.round((deal.discountValue || 0) / 100) : null;

  const valuePhrase = pct != null ? `${pct}%` : krOff != null ? `${krOff} kr` : deal.freeDelivery ? 'Fri leverans' : 'Erbjudande';

  if (scope === 'PRODUCT') {
    const head = pct != null ? `Upp till ${pct}% rabatt` : krOff != null ? `Upp till ${krOff} kr rabatt` : `${valuePhrase} hos ${restaurantName}`;
    return { headline: head, subtitle: restaurantName, percent: pct };
  }
  if (scope === 'CATEGORY') {
    const cat = categoryName || 'utvalda rätter';
    const head = pct != null ? `${pct}% på kategorin ${cat}` : krOff != null ? `${krOff} kr på ${cat}` : `${valuePhrase} på ${cat}`;
    return { headline: head, subtitle: restaurantName, percent: pct };
  }
  if (scope === 'MIN_ORDER') {
    const minKr = Math.round((deal.minOrder || 0) / 100);
    const head = pct != null ? `${pct}% rabatt hos ${restaurantName}` : `${valuePhrase} hos ${restaurantName}`;
    return { headline: head, subtitle: minKr > 0 ? `Över ${minKr} kr` : null, percent: pct };
  }
  // RESTAURANT / COMBO / fallback: hela stället
  if (deal.freeDelivery && pct == null && krOff == null) {
    return { headline: `Fri leverans hos ${restaurantName}`, subtitle: null, percent: null };
  }
  const head = pct != null ? `${pct}% rabatt på hela ${restaurantName}` : krOff != null ? `${krOff} kr rabatt på hela ${restaurantName}` : `${valuePhrase} hos ${restaurantName}`;
  return { headline: head, subtitle: null, percent: pct };
}

/**
 * Räknar fram alla rabatt-kandidater (en per restaurang, bästa dealen) rankade
 * efter tier sen ordrar. Returnerar hela listan (för admin-plockaren) +
 * kandidat-id:n i rankad ordning + en signatur över erbjudandemängden.
 */
async function computeDiscountCandidates(now: Date): Promise<{ cards: DiscountCard[]; signature: string }> {
  const deals = await prisma.deal.findMany({
    where: {
      isActive: true,
      isPersonalTemplate: false,
      isTemplate: false,
      OR: [{ validFrom: null }, { validFrom: { lte: now } }],
      AND: [{ OR: [{ validUntil: null }, { validUntil: { gte: now } }] }],
    },
    select: {
      id: true, title: true, triggerType: true, discountType: true, discountValue: true,
      minOrder: true, freeDelivery: true, validUntil: true, restaurantId: true, isGlobal: true,
      applicableRestaurantIds: true, triggerCategoryId: true, comboProductIds: true,
      maxUsages: true, usageCount: true,
    },
  });

  const usable = deals.filter((d) => {
    if (d.maxUsages != null && d.usageCount >= d.maxUsages) return false;
    const hasValue = d.discountType === 'PERCENTAGE' || d.discountType === 'FIXED' || d.discountType === 'FIXED_PRICE' || d.freeDelivery;
    return hasValue;
  });
  if (!usable.length) return { cards: [], signature: '' };

  // Aktiva restauranger (för global-scope-expansion + metadata).
  const restaurants = await prisma.restaurant.findMany({
    where: { comingSoon: false },
    select: { id: true, name: true, slug: true, imageUrl: true, heroImageUrl: true, featuredClass: true },
  });
  const restById = new Map(restaurants.map((r) => [r.id, r]));
  const allRestIds = restaurants.map((r) => r.id);

  const expand = (deal: any): string[] => {
    if (deal.isGlobal) return allRestIds;
    const ids = parseApplicableRestaurantIds(deal.applicableRestaurantIds);
    if (ids.length) return ids.filter((id: string) => restById.has(id));
    if (deal.restaurantId && restById.has(deal.restaurantId)) return [deal.restaurantId];
    return [];
  };

  // Bästa deal per restaurang (högsta magnituden vinner).
  const bestByRest = new Map<string, any>();
  for (const deal of usable) {
    const mag = discountMagnitude(deal);
    for (const rid of expand(deal)) {
      const prev = bestByRest.get(rid);
      if (!prev || mag > prev.__mag) bestByRest.set(rid, { ...deal, __mag: mag });
    }
  }
  if (!bestByRest.size) return { cards: [], signature: '' };

  // Kategori-namn för CATEGORY-scope. Formuläret sparar mål-kategorin i
  // comboProductIds (targetIds); triggerCategoryId är fallback (BOGO m.m.).
  const dealCategoryId = (d: any): string | null => {
    const ids = parseDealTargetIds(d.comboProductIds);
    if (ids.length) return ids[0];
    return d.triggerCategoryId || null;
  };
  const categoryIds = Array.from(bestByRest.values())
    .filter((d) => getDealScopeType(d) === 'CATEGORY')
    .map((d) => dealCategoryId(d))
    .filter((id): id is string => Boolean(id));
  const catNameById = new Map<string, string>();
  if (categoryIds.length) {
    const cats = await prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } });
    for (const c of cats) catNameById.set(c.id, c.name);
  }

  // Ordrar per restaurang (30 dagar) för sekundär prioritet.
  const since = new Date(now.getTime() - ORDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const grouped = await (prisma.order.groupBy as any)({
    by: ['restaurantId'],
    where: { createdAt: { gte: since }, status: { notIn: EXCLUDED_STATUSES }, restaurantId: { in: Array.from(bestByRest.keys()) } },
    _count: { _all: true },
  });
  const ordersByRest = new Map<string, number>((grouped as any[]).map((g) => [g.restaurantId, g._count._all]));

  // Rankning: tier (featuredClass asc, men 0=dold sist), sen ordrar desc.
  const tierRank = (fc: number) => (fc === 0 ? 99 : fc); // guld=1 först, dold sist
  const ranked = Array.from(bestByRest.entries())
    .map(([rid, deal]) => {
      const r = restById.get(rid)!;
      return { rid, deal, rest: r, orders: ordersByRest.get(rid) || 0, tier: tierRank(r.featuredClass ?? 3) };
    })
    .sort((a, b) => (a.tier !== b.tier ? a.tier - b.tier : b.orders - a.orders));

  const cards: DiscountCard[] = ranked.map((row, index) => {
    const catId = dealCategoryId(row.deal);
    const catName = catId ? catNameById.get(catId) || null : null;
    const { headline, subtitle, percent } = buildCardText(row.deal, row.rest.name, catName);
    return {
      kind: 'DISCOUNT',
      restaurantId: row.rid,
      restaurantSlug: row.rest.slug,
      restaurantName: row.rest.name,
      headline,
      subtitle,
      footnote: endDateFootnote(row.deal.validUntil),
      theme: themeForIndex(index),
      imageUrl: row.rest.heroImageUrl || row.rest.imageUrl || null,
      featuredClass: row.rest.featuredClass ?? 3,
      percent,
    };
  });

  // Signatur = mängden erbjudanden (restaurang+deal). Ändras = "nya erbjudanden".
  const signature = ranked.map((r) => `${r.rid}:${r.deal.id}`).sort().join('|');
  return { cards, signature };
}

/** Publika rabattkort för hemkarusellen (max 5, rotation + overrides). */
export async function getDiscountCards(now = new Date()): Promise<DiscountCard[]> {
  const { cards, signature } = await computeDiscountCandidates(now);
  if (!cards.length) return [];
  const rankedIds = cards.map((c) => c.restaurantId);
  const { shownIds } = await resolve('discounts', rankedIds, signature, now);
  const byId = new Map(cards.map((c) => [c.restaurantId, c]));
  return shownIds.map((id) => byId.get(id)).filter(Boolean) as DiscountCard[];
}

// ── Trendar / Ny i stan: löser fram synliga restaurang-id:n ──────────────────

/** Rankade kandidat-id:n för trendar (mest ordrar senaste 7 dagar). */
async function trendingCandidateIds(now: Date): Promise<string[]> {
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const grouped = await (prisma.order.groupBy as any)({
    by: ['restaurantId'],
    where: { createdAt: { gte: since }, status: { notIn: EXCLUDED_STATUSES }, restaurantId: { not: null } },
    _count: { _all: true },
  });
  const counts = (grouped as any[]).filter((g) => g.restaurantId).sort((a, b) => b._count._all - a._count._all);
  const ids = counts.map((g) => g.restaurantId as string);
  const active = await prisma.restaurant.findMany({ where: { id: { in: ids }, comingSoon: false }, select: { id: true } });
  const activeSet = new Set(active.map((r) => r.id));
  return ids.filter((id) => activeSet.has(id));
}

/** Rankade kandidat-id:n för ny i stan (senast skapade). */
async function newCandidateIds(now: Date): Promise<string[]> {
  const since = new Date(now.getTime() - NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.restaurant.findMany({
    where: { comingSoon: false, createdAt: { gte: since } },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => r.id);
}

export async function getTrendingRestaurantIds(now = new Date()): Promise<string[]> {
  const ids = await trendingCandidateIds(now);
  const { shownIds } = await resolve('trending', ids, ids.join('|'), now);
  return shownIds;
}

export async function getNewRestaurantIds(now = new Date()): Promise<string[]> {
  const ids = await newCandidateIds(now);
  const { shownIds } = await resolve('new', ids, ids.join('|'), now);
  return shownIds;
}

// ── Admin ────────────────────────────────────────────────────────────────────

export interface ShowcaseAdminSurface {
  surface: ShowcaseSurface;
  rotationHours: number;
  rotatedAt: string | null;
  shown: Array<{ restaurantId: string; name: string; slug: string; label: string; pinned: boolean; featuredClass: number }>;
  candidates: Array<{ restaurantId: string; name: string; slug: string; label: string; featuredClass: number }>;
}

function restLabel(surface: ShowcaseSurface, card: DiscountCard | null, name: string): string {
  if (surface === 'discounts' && card) return card.headline;
  return name;
}

export async function getShowcaseAdmin(now = new Date()): Promise<ShowcaseAdminSurface[]> {
  // Rabatter
  const { cards, signature } = await computeDiscountCandidates(now);
  const discountResolve = await resolve('discounts', cards.map((c) => c.restaurantId), signature, now);
  const cardById = new Map(cards.map((c) => [c.restaurantId, c]));

  // Trendar / ny
  const trendIds = await trendingCandidateIds(now);
  const trendResolve = await resolve('trending', trendIds, trendIds.join('|'), now);
  const newIds = await newCandidateIds(now);
  const newResolve = await resolve('new', newIds, newIds.join('|'), now);

  // Restaurang-metadata för alla inblandade id:n.
  const involved = new Set<string>([
    ...cards.map((c) => c.restaurantId),
    ...trendIds, ...trendResolve.shownIds, ...trendResolve.state.pinned,
    ...newIds, ...newResolve.shownIds, ...newResolve.state.pinned,
  ]);
  const rests = await prisma.restaurant.findMany({
    where: { id: { in: Array.from(involved) } },
    select: { id: true, name: true, slug: true, featuredClass: true },
  });
  const restById = new Map(rests.map((r) => [r.id, r]));

  const mkSurface = (
    surface: ShowcaseSurface,
    shownIds: string[],
    candidateIds: string[],
    state: SurfaceState,
  ): ShowcaseAdminSurface => {
    const shown = shownIds.map((id) => {
      const r = restById.get(id);
      const card = cardById.get(id) || null;
      return {
        restaurantId: id,
        name: r?.name || id,
        slug: r?.slug || '',
        label: restLabel(surface, card, r?.name || id),
        pinned: state.pinned.includes(id),
        featuredClass: r?.featuredClass ?? 3,
      };
    });
    // Kandidater att lägga in manuellt: för rabatter bara restauranger med deal;
    // för trend/ny valfri aktiv restaurang hämtas separat i routen.
    const candidates = candidateIds
      .filter((id) => !shownIds.includes(id))
      .map((id) => {
        const r = restById.get(id);
        const card = cardById.get(id) || null;
        return { restaurantId: id, name: r?.name || id, slug: r?.slug || '', label: restLabel(surface, card, r?.name || id), featuredClass: r?.featuredClass ?? 3 };
      });
    return { surface, rotationHours: state.rotationHours, rotatedAt: state.rotatedAt, shown, candidates };
  };

  return [
    mkSurface('discounts', discountResolve.shownIds, cards.map((c) => c.restaurantId), discountResolve.state),
    mkSurface('trending', trendResolve.shownIds, trendIds, trendResolve.state),
    mkSurface('new', newResolve.shownIds, newIds, newResolve.state),
  ];
}

export async function patchShowcase(
  surface: ShowcaseSurface,
  body: { rotationHours?: number; hide?: string; unhide?: string; pin?: string; unpin?: string },
): Promise<void> {
  const state = await readState(surface);
  if (Number.isFinite(body.rotationHours) && (body.rotationHours as number) > 0) {
    state.rotationHours = Math.round(body.rotationHours as number);
  }
  const add = (arr: string[], id: string) => (arr.includes(id) ? arr : [...arr, id]);
  const rm = (arr: string[], id: string) => arr.filter((x) => x !== id);
  if (body.hide) {
    state.hidden = add(state.hidden, body.hide);
    state.pinned = rm(state.pinned, body.hide);
  }
  if (body.unhide) state.hidden = rm(state.hidden, body.unhide);
  if (body.pin) {
    state.pinned = add(state.pinned, body.pin);
    state.hidden = rm(state.hidden, body.pin);
  }
  if (body.unpin) state.pinned = rm(state.pinned, body.unpin);
  await writeState(surface, state);
}
