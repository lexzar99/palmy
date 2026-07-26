import prisma from './prisma';
import {
  type HomeCategoryFilters,
  type HomeCategoryRanking,
  type HomeCategorySectionPayload,
  type PublicHomeCategorySectionPayload,
  DEFAULT_HOME_RANKING_WEIGHTS,
  isHomeCategoryVisibleNow,
  serializeHomeCategorySection,
} from './homeCategorySections';
import { getEffectiveEtaMinutes } from './restaurantEta';
import { resolveRestaurantAvailability } from './restaurantAvailability';
import {
  isCustomerVisibleDeal,
  isDealAvailableNow,
  parseApplicableRestaurantIds,
} from './deals';
import { PAYOUT_NON_TEST_ORDER_FILTER } from './payoutPolicy';

const EXCLUDED_ORDER_STATUSES = ['CANCELLED', 'REJECTED', 'DELIVERY_FAILED'];
const PAID_ORDER_STATUSES = ['PAID', 'PARTIALLY_REFUNDED'];
const DAY_MS = 86_400_000;

export interface HomeFeedTag {
  id: string;
  name: string;
  nameEn: string | null;
  slug: string;
  color: string;
  icon: string | null;
  restaurantCount?: number;
}

export interface HomeFeedMetrics {
  etaMinutes: number;
  rating: number | null;
  ratingCount: number;
  deliveryFeeOre: number;
  freeDelivery: boolean;
  freeDeliveryReason: 'BASE_FEE' | 'ACTIVE_DEAL' | null;
  dealMaxPercent: number;
  featuredClass: number;
}

export interface HomeFeedRestaurant {
  id: string;
  name: string;
  slug: string;
  cuisine: string | null;
  city: string | null;
  imageUrl: string | null;
  heroImageUrl: string | null;
  isOpen: boolean;
  tags: HomeFeedTag[];
  tagIds: string[];
  reasons: string[];
  metrics: HomeFeedMetrics;
}

export interface HomeFeedSection extends PublicHomeCategorySectionPayload {
  restaurants: HomeFeedRestaurant[];
}

export interface HomeCategoryFeed {
  version: 1;
  generatedAt: string;
  context: {
    city: string | null;
    zone: string | null;
    dayKey: string;
  };
  strategy: {
    uniqueFirstPosition: true;
    appearancePenaltyApplied: true;
    historicalExposureApplied: false;
    historicalExposureReason: 'NO_IMPRESSION_DATA';
  };
  feeSemantics: {
    scope: 'BASE_OR_ACTIVE_DEAL';
    addressSpecific: false;
    addressQuoteRequiredForZoneFee: true;
  };
  availableTags: HomeFeedTag[];
  sections: HomeFeedSection[];
}

export interface HomeFeedCandidate {
  id: string;
  name: string;
  slug: string;
  cuisine: string | null;
  city: string | null;
  imageUrl: string | null;
  heroImageUrl: string | null;
  isOpen: boolean;
  tags: HomeFeedTag[];
  featuredClass: number;
  homeBoost: number;
  homeBoostStartsAt: Date | null;
  homeBoostEndsAt: Date | null;
  ordersToday: number;
  orders7d: number;
  etaMinutes: number;
  actualAverageMinutesToday: number | null;
  completedTimingsToday: number;
  rating: number | null;
  ratingCount: number;
  deliveryFeeOre: number;
  freeDelivery: boolean;
  freeDeliveryReason: 'BASE_FEE' | 'ACTIVE_DEAL' | null;
  dealMaxPercent: number;
  hasActiveDeal: boolean;
}

type ScoredCandidate = HomeFeedCandidate & {
  score: number;
  scoreBreakdown: Record<string, number>;
  reasons: string[];
  ratingConfidence: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const round = (value: number, decimals = 3) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

function stableUnitHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4_294_967_295;
}

function ratingConfidence(rating: number | null, ratingCount: number): number {
  if (rating == null || ratingCount <= 0) return 0;
  // Bayesianskt med försiktig lokal prior: ett ensamt femstjärnigt omdöme
  // slår inte en stabil 4,6 med hundratals omdömen.
  const priorRating = 4.2;
  const priorCount = 20;
  const bayesian = (rating * ratingCount + priorRating * priorCount) / (ratingCount + priorCount);
  return clamp01((bayesian - 3) / 2);
}

function activeAdminBoost(candidate: HomeFeedCandidate, now: Date): number {
  const raw = Math.max(0, Math.min(100, candidate.homeBoost || 0));
  if (raw <= 0) return 0;
  if (candidate.homeBoostStartsAt && candidate.homeBoostStartsAt > now) return 0;
  if (candidate.homeBoostEndsAt && candidate.homeBoostEndsAt < now) return 0;
  return raw;
}

function normalizedSignals(candidate: HomeFeedCandidate, maxima: { today: number; week: number }) {
  const confidence = ratingConfidence(candidate.rating, candidate.ratingCount);
  const effectiveSpeed = candidate.actualAverageMinutesToday ?? candidate.etaMinutes;
  return {
    ordersToday: maxima.today > 0 ? Math.sqrt(candidate.ordersToday / maxima.today) : 0,
    orders7d: maxima.week > 0 ? Math.sqrt(candidate.orders7d / maxima.week) : 0,
    eta: clamp01((60 - effectiveSpeed) / 40),
    ratingConfidence: confidence,
    deliveryFee: clamp01(1 - candidate.deliveryFeeOre / 9_900),
    freeDelivery: candidate.freeDelivery ? 1 : 0,
    discount: clamp01(candidate.dealMaxPercent / 50),
    tier: candidate.featuredClass === 1 ? 1 : candidate.featuredClass === 2 ? 0.5 : 0,
  };
}

function scoreCandidate(
  candidate: HomeFeedCandidate,
  section: HomeCategorySectionPayload,
  maxima: { today: number; week: number },
  appearances: number,
  contextSeed: string,
  now: Date,
): ScoredCandidate {
  const ranking = section.ranking;
  const weights = { ...DEFAULT_HOME_RANKING_WEIGHTS, ...(ranking.weights || {}) };
  const signals = normalizedSignals(candidate, maxima);
  const dailyRotation = stableUnitHash(`${contextSeed}|${section.slug}|${candidate.id}`);
  const maxBoostPoints = Number(ranking.maxAdminBoostPoints ?? 8);
  const boost = activeAdminBoost(candidate, now);
  const boostPoints = (boost / 100) * Math.max(0, Math.min(15, maxBoostPoints));
  const appearancePenalty = appearances * Number(ranking.appearancePenalty ?? 6);

  const scoreBreakdown = {
    ordersToday: signals.ordersToday * Number(weights.ordersToday || 0),
    orders7d: signals.orders7d * Number(weights.orders7d || 0),
    eta: signals.eta * Number(weights.eta || 0),
    ratingConfidence: signals.ratingConfidence * Number(weights.ratingConfidence || 0),
    deliveryFee: signals.deliveryFee * Number(weights.deliveryFee || 0),
    freeDelivery: signals.freeDelivery * Number(weights.freeDelivery || 0),
    discount: signals.discount * Number(weights.discount || 0),
    tier: signals.tier * Number(weights.tier || 0),
    dailyRotation: dailyRotation * Number(weights.dailyRotation || 0),
    adminBoost: boostPoints,
    appearancePenalty: -appearancePenalty,
    historicalExposure: 0,
  };

  const score = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);
  const reasons: string[] = [];
  if (candidate.ordersToday > 0 && candidate.ordersToday === maxima.today) reasons.push('MOST_ORDERS_TODAY');
  if (candidate.actualAverageMinutesToday != null) reasons.push('MEASURED_SPEED_TODAY');
  else if (candidate.etaMinutes > 0) reasons.push('CURRENT_ETA');
  if (candidate.rating != null && candidate.ratingCount > 0) reasons.push('RATING_WITH_REVIEWS');
  if (candidate.freeDelivery) reasons.push('FREE_DELIVERY');
  if (candidate.dealMaxPercent > 0) reasons.push('ACTIVE_PERCENT_DEAL');
  if (boostPoints > 0) reasons.push('ACTIVE_ADMIN_BOOST');

  return {
    ...candidate,
    score: round(score),
    scoreBreakdown: Object.fromEntries(
      Object.entries(scoreBreakdown).map(([key, value]) => [key, round(value)]),
    ),
    reasons,
    ratingConfidence: round(signals.ratingConfidence),
  };
}

function textIncludes(candidate: HomeFeedCandidate, needle: string) {
  const haystack = [
    candidate.name,
    candidate.cuisine || '',
    ...candidate.tags.map((tag) => `${tag.name} ${tag.slug}`),
  ].join(' ').toLocaleLowerCase('sv');
  return haystack.includes(needle.toLocaleLowerCase('sv'));
}

export function isEligibleForHomeSection(candidate: HomeFeedCandidate, filters: HomeCategoryFilters) {
  if (candidate.featuredClass === 0) return false;
  if (filters.openNowOnly && !candidate.isOpen) return false;
  if (filters.searchTerm && !textIncludes(candidate, filters.searchTerm)) return false;

  if (filters.cuisines?.length) {
    const cuisine = (candidate.cuisine || '').toLocaleLowerCase('sv');
    const hasCuisine = filters.cuisines.some((value) => {
      const normalized = value.toLocaleLowerCase('sv');
      return cuisine.includes(normalized) || candidate.tags.some((tag) =>
        tag.name.toLocaleLowerCase('sv') === normalized || tag.slug === normalized,
      );
    });
    if (!hasCuisine) return false;
  }

  if (filters.tagIds?.length) {
    const ids = new Set(candidate.tags.map((tag) => tag.id));
    if (!filters.tagIds.some((id) => ids.has(id))) return false;
  } else if (filters.tags?.length) {
    // Endast legacy-rader. Nya adminen skriver alltid tagIds.
    const names = new Set(candidate.tags.flatMap((tag) => [tag.name.toLocaleLowerCase('sv'), tag.slug]));
    if (!filters.tags.some((name) => names.has(name.toLocaleLowerCase('sv')))) return false;
  }

  if (filters.featuredClasses?.length && !filters.featuredClasses.includes(candidate.featuredClass)) return false;
  if (filters.minRating != null && (candidate.rating == null || candidate.rating < filters.minRating)) return false;
  if (filters.maxEtaMinutes != null && candidate.etaMinutes > filters.maxEtaMinutes) return false;
  if (filters.maxDeliveryFee != null && candidate.deliveryFeeOre > filters.maxDeliveryFee * 100) return false;
  if (filters.freeDeliveryOnly && !candidate.freeDelivery) return false;
  if (filters.dealsOnly && !candidate.hasActiveDeal) return false;
  return true;
}

function primaryMetric(candidate: ScoredCandidate, sortBy: string) {
  switch (sortBy) {
    case 'FEATURED': return candidate.featuredClass === 0 ? 0 : 4 - candidate.featuredClass;
    case 'ORDERS_TODAY': return candidate.ordersToday;
    case 'ORDERS_7D': return candidate.orders7d;
    case 'RATING': return candidate.ratingConfidence;
    case 'ETA': return candidate.actualAverageMinutesToday ?? candidate.etaMinutes;
    case 'DELIVERY_FEE': return candidate.deliveryFeeOre;
    case 'DISCOUNT': return candidate.dealMaxPercent;
    case 'NAME': return 0;
    default: return candidate.score;
  }
}

function weightedSort(items: ScoredCandidate[], section: HomeCategorySectionPayload) {
  const sortBy = section.filters.sortBy || 'SMART';
  const direction = section.filters.sortDirection || 'DESC';
  return [...items].sort((a, b) => {
    if (sortBy === 'NAME') {
      return direction === 'ASC'
        ? a.name.localeCompare(b.name, 'sv')
        : b.name.localeCompare(a.name, 'sv');
    }
    const aMetric = primaryMetric(a, sortBy);
    const bMetric = primaryMetric(b, sortBy);
    const comparison = direction === 'ASC' ? aMetric - bMetric : bMetric - aMetric;
    return comparison || b.score - a.score || a.id.localeCompare(b.id);
  });
}

function balancedOrder(items: ScoredCandidate[]) {
  const remaining = new Map(items.map((item) => [item.id, item]));
  const result: ScoredCandidate[] = [];
  const take = (sorted: ScoredCandidate[]) => {
    const found = sorted.find((item) => remaining.has(item.id));
    if (!found) return;
    result.push(found);
    remaining.delete(found.id);
  };

  // De tre första slotarna representerar separata, observerbara mål:
  // dagens efterfrågan, faktisk/aktuell snabbhet och betyg med review-evidens.
  take([...items].sort((a, b) => b.ordersToday - a.ordersToday || b.score - a.score));
  take([...items].sort((a, b) =>
    (a.actualAverageMinutesToday ?? a.etaMinutes) - (b.actualAverageMinutesToday ?? b.etaMinutes)
    || b.score - a.score,
  ));
  take([...items].sort((a, b) => b.ratingConfidence - a.ratingConfidence || b.ratingCount - a.ratingCount));
  result.push(...[...remaining.values()].sort((a, b) => b.score - a.score));
  return result;
}

function toRestaurantDto(candidate: ScoredCandidate): HomeFeedRestaurant {
  return {
    id: candidate.id,
    name: candidate.name,
    slug: candidate.slug,
    cuisine: candidate.cuisine,
    city: candidate.city,
    imageUrl: candidate.imageUrl,
    heroImageUrl: candidate.heroImageUrl,
    isOpen: candidate.isOpen,
    tags: candidate.tags,
    tagIds: candidate.tags.map((tag) => tag.id),
    reasons: candidate.reasons.filter((reason) => reason !== 'ACTIVE_ADMIN_BOOST'),
    metrics: {
      etaMinutes: candidate.etaMinutes,
      rating: candidate.rating,
      ratingCount: candidate.ratingCount,
      deliveryFeeOre: candidate.deliveryFeeOre,
      freeDelivery: candidate.freeDelivery,
      freeDeliveryReason: candidate.freeDeliveryReason,
      dealMaxPercent: candidate.dealMaxPercent,
      featuredClass: candidate.featuredClass,
    },
  };
}

export function composeHomeCategoryFeed(input: {
  sections: HomeCategorySectionPayload[];
  candidates: HomeFeedCandidate[];
  availableTags: HomeFeedTag[];
  city?: string | null;
  zone?: string | null;
  now?: Date;
}): HomeCategoryFeed {
  const now = input.now || new Date();
  const dayKey = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const contextSeed = `${dayKey}|${input.city || 'ALL'}|${input.zone || 'ALL'}`;
  const appearances = new Map<string, number>();
  const usedFirst = new Set<string>();
  const maxima = {
    today: Math.max(0, ...input.candidates.map((candidate) => candidate.ordersToday)),
    week: Math.max(0, ...input.candidates.map((candidate) => candidate.orders7d)),
  };

  const sections = input.sections
    .filter((section) => section.isActive && isHomeCategoryVisibleNow(section.schedule, now))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'sv'))
    .map((section) => {
      const manualOrder = new Map(section.manualRestaurantIds.map((id, index) => [id, index]));
      let eligible = input.candidates.filter((candidate) => isEligibleForHomeSection(candidate, section.filters));

      if (section.filterMode === 'MANUAL') {
        eligible = eligible.filter((candidate) => manualOrder.has(candidate.id));
      }

      let scored = eligible.map((candidate) =>
        scoreCandidate(candidate, section, maxima, appearances.get(candidate.id) || 0, contextSeed, now),
      );
      scored = section.ranking.strategy === 'BALANCED'
        ? balancedOrder(scored)
        : weightedSort(scored, section);

      if (section.filterMode === 'MANUAL') {
        scored.sort((a, b) => (manualOrder.get(a.id) ?? 99_999) - (manualOrder.get(b.id) ?? 99_999));
      } else if (section.filterMode === 'HYBRID') {
        scored.sort((a, b) => {
          const aManual = manualOrder.has(a.id);
          const bManual = manualOrder.has(b.id);
          if (aManual !== bManual) return aManual ? -1 : 1;
          if (aManual && bManual) return manualOrder.get(a.id)! - manualOrder.get(b.id)!;
          return b.score - a.score;
        });
      }

      if (section.ranking.avoidDuplicateFirst !== false && scored.length > 1 && usedFirst.has(scored[0].id)) {
        const unusedIndex = scored.findIndex((candidate) => !usedFirst.has(candidate.id));
        if (unusedIndex > 0) {
          const [unused] = scored.splice(unusedIndex, 1);
          scored.unshift(unused);
        }
      }

      scored = scored.slice(0, Math.max(1, section.maxRestaurants));
      if (scored[0]) usedFirst.add(scored[0].id);
      for (const candidate of scored) {
        appearances.set(candidate.id, (appearances.get(candidate.id) || 0) + 1);
      }

      const { ranking: _privateRanking, ...publicSection } = section;
      return { ...publicSection, restaurants: scored.map(toRestaurantDto) };
    })
    // Tomma rails förvirrar kunden och visas därför inte publikt. De ligger
    // fortfarande kvar i /all och kan tweakas i admin.
    .filter((section) => section.restaurants.length > 0);

  const visibleTagCounts = new Map<string, number>();
  for (const candidate of input.candidates) {
    if (candidate.featuredClass === 0) continue;
    for (const tag of candidate.tags) {
      visibleTagCounts.set(tag.id, (visibleTagCounts.get(tag.id) || 0) + 1);
    }
  }
  const availableTags = input.availableTags
    .filter((tag) => (visibleTagCounts.get(tag.id) || 0) > 0)
    .map((tag) => ({ ...tag, restaurantCount: visibleTagCounts.get(tag.id) || 0 }));

  return {
    version: 1,
    generatedAt: now.toISOString(),
    context: { city: input.city || null, zone: input.zone || null, dayKey },
    strategy: {
      uniqueFirstPosition: true,
      appearancePenaltyApplied: true,
      historicalExposureApplied: false,
      historicalExposureReason: 'NO_IMPRESSION_DATA',
    },
    feeSemantics: {
      scope: 'BASE_OR_ACTIVE_DEAL',
      addressSpecific: false,
      addressQuoteRequiredForZoneFee: true,
    },
    availableTags,
    sections,
  };
}

function stockholmStartOfDay(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value || 0);
  const year = part('year');
  const month = part('month');
  const day = part('day');
  const utcGuess = new Date(Date.UTC(year, month - 1, day));
  const guessParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(utcGuess);
  const guess = (type: string) => Number(guessParts.find((item) => item.type === type)?.value || 0);
  const asUtc = Date.UTC(guess('year'), guess('month') - 1, guess('day'), guess('hour'), guess('minute'), guess('second'));
  const offset = asUtc - utcGuess.getTime();
  return new Date(Date.UTC(year, month - 1, day) - offset);
}

type DealRollup = { maxPercent: number; freeDelivery: boolean; hasDeal: boolean };

async function dealRollups(restaurants: Array<{ id: string; brandId: string | null }>, now: Date) {
  const result = new Map(restaurants.map((restaurant) =>
    [restaurant.id, { maxPercent: 0, freeDelivery: false, hasDeal: false } as DealRollup],
  ));
  const deals = await prisma.deal.findMany({
    where: {
      isActive: true,
      isPersonalTemplate: false,
      isTemplate: false,
      OR: [{ validFrom: null }, { validFrom: { lte: now } }],
      AND: [{ OR: [{ validUntil: null }, { validUntil: { gte: now } }] }],
    },
  });
  const brandByRestaurant = new Map(restaurants.map((restaurant) => [restaurant.id, restaurant.brandId]));

  for (const deal of deals) {
    if (!isCustomerVisibleDeal(deal) || !isDealAvailableNow(deal, now)) continue;
    const hasEconomicValue = Boolean(deal.freeDelivery)
      || (
        ['PERCENTAGE', 'FIXED', 'FIXED_PRICE'].includes(deal.discountType)
        && Number(deal.discountValue || 0) > 0
      );
    if (!hasEconomicValue) continue;
    const applicable = new Set(parseApplicableRestaurantIds(deal.applicableRestaurantIds));
    for (const restaurant of restaurants) {
      const applies = deal.isGlobal
        || deal.restaurantId === restaurant.id
        || applicable.has(restaurant.id)
        || (deal.brandId && brandByRestaurant.get(restaurant.id) === deal.brandId);
      if (!applies) continue;
      const rollup = result.get(restaurant.id)!;
      rollup.hasDeal = true;
      rollup.freeDelivery ||= Boolean(deal.freeDelivery);
      if (deal.discountType === 'PERCENTAGE') {
        rollup.maxPercent = Math.max(rollup.maxPercent, Number(deal.discountValue || 0));
      }
    }
  }
  return result;
}

export async function loadHomeCategoryFeed(options: {
  city?: string | null;
  zone?: string | null;
  now?: Date;
}): Promise<HomeCategoryFeed> {
  const now = options.now || new Date();
  const today = stockholmStartOfDay(now);
  const week = new Date(now.getTime() - 7 * DAY_MS);

  const [sectionRows, restaurantRows, tags, settings, todayOrders, weekOrders, timingStats] = await Promise.all([
    prisma.homeCategorySection.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.restaurant.findMany({
      where: {
        archivedAt: null,
        draft: false,
        comingSoon: false,
        ...(options.city ? { city: { equals: options.city, mode: 'insensitive' as const } } : {}),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        cuisine: true,
        city: true,
        imageUrl: true,
        heroImageUrl: true,
        rating: true,
        ratingCount: true,
        deliveryFee: true,
        etaMinutes: true,
        etaCalculatedMinutes: true,
        etaOverrideMinutes: true,
        featuredClass: true,
        homeBoost: true,
        homeBoostStartsAt: true,
        homeBoostEndsAt: true,
        brandId: true,
        isOpen: true,
        scheduledOpenNow: true,
        acceptingOrdersMode: true,
        acceptingOrdersOverrideUntil: true,
        acceptingOrdersOverrideReason: true,
        pausedUntil: true,
        city_relation: {
          select: { ordersPaused: true, ordersPausedUntil: true, ordersPauseReason: true },
        },
        tagAssignments: {
          where: { tag: { isActive: true } },
          orderBy: [{ position: 'asc' }, { tag: { sortOrder: 'asc' } }],
          select: {
            tag: {
              select: { id: true, name: true, nameEn: true, slug: true, color: true, icon: true },
            },
          },
        },
      },
    }),
    prisma.restaurantTag.findMany({
      where: { isActive: true },
      select: { id: true, name: true, nameEn: true, slug: true, color: true, icon: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.restaurantSettings.findUnique({ where: { id: 'settings' } }),
    prisma.order.groupBy({
      by: ['restaurantId'],
      where: {
        ...PAYOUT_NON_TEST_ORDER_FILTER,
        createdAt: { gte: today },
        paymentStatus: { in: PAID_ORDER_STATUSES },
        status: { notIn: EXCLUDED_ORDER_STATUSES },
        restaurantId: { not: null },
      },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['restaurantId'],
      where: {
        ...PAYOUT_NON_TEST_ORDER_FILTER,
        createdAt: { gte: week },
        paymentStatus: { in: PAID_ORDER_STATUSES },
        status: { notIn: EXCLUDED_ORDER_STATUSES },
        restaurantId: { not: null },
      },
      _count: { _all: true },
    }),
    prisma.orderTimingStat.groupBy({
      by: ['restaurantId'],
      where: {
        recordedAt: { gte: today },
        isTestOrder: false,
        orderToDeliveredMin: { not: null, lte: 180 },
      },
      _avg: { orderToDeliveredMin: true },
      _count: { _all: true },
    }),
  ]);

  const rollups = await dealRollups(restaurantRows.map((restaurant) => ({
    id: restaurant.id,
    brandId: restaurant.brandId,
  })), now);
  const todayMap = new Map(todayOrders.map((row) => [row.restaurantId, row._count._all]));
  const weekMap = new Map(weekOrders.map((row) => [row.restaurantId, row._count._all]));
  const timingMap = new Map(timingStats.map((row) => [row.restaurantId, row]));

  const candidates: HomeFeedCandidate[] = restaurantRows.map((restaurant) => {
    const availability = resolveRestaurantAvailability(restaurant, {
      city: restaurant.city_relation,
      platform: settings,
    });
    const deal = rollups.get(restaurant.id) || { maxPercent: 0, freeDelivery: false, hasDeal: false };
    const timing = timingMap.get(restaurant.id);
    const baseFreeDelivery = restaurant.deliveryFee <= 0;
    return {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      cuisine: restaurant.cuisine || null,
      city: restaurant.city || null,
      imageUrl: restaurant.imageUrl || null,
      heroImageUrl: restaurant.heroImageUrl || null,
      isOpen: availability.isOpen,
      tags: restaurant.tagAssignments.map((assignment) => assignment.tag),
      featuredClass: restaurant.featuredClass ?? 3,
      homeBoost: restaurant.homeBoost ?? 0,
      homeBoostStartsAt: restaurant.homeBoostStartsAt,
      homeBoostEndsAt: restaurant.homeBoostEndsAt,
      ordersToday: todayMap.get(restaurant.id) || 0,
      orders7d: weekMap.get(restaurant.id) || 0,
      etaMinutes: getEffectiveEtaMinutes(restaurant),
      actualAverageMinutesToday: timing?._avg.orderToDeliveredMin == null
        ? null
        : round(timing._avg.orderToDeliveredMin, 1),
      completedTimingsToday: timing?._count._all || 0,
      rating: restaurant.rating ?? null,
      ratingCount: restaurant.ratingCount ?? 0,
      deliveryFeeOre: restaurant.deliveryFee,
      freeDelivery: baseFreeDelivery || deal.freeDelivery,
      freeDeliveryReason: deal.freeDelivery ? 'ACTIVE_DEAL' : baseFreeDelivery ? 'BASE_FEE' : null,
      dealMaxPercent: deal.maxPercent,
      hasActiveDeal: deal.hasDeal,
    };
  });

  return composeHomeCategoryFeed({
    sections: sectionRows.map(serializeHomeCategorySection),
    candidates,
    availableTags: tags,
    city: options.city,
    zone: options.zone,
    now,
  });
}
