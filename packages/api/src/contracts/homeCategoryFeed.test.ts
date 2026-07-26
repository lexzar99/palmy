import assert from 'node:assert/strict';
import {
  composeHomeCategoryFeed,
  type HomeFeedCandidate,
  type HomeFeedTag,
} from '../lib/homeCategoryFeed';
import type { HomeCategorySectionPayload } from '../lib/homeCategorySections';

const now = new Date('2026-07-26T12:00:00.000Z');
const pizzaTag: HomeFeedTag = {
  id: 'tag-pizza',
  name: 'Pizza',
  nameEn: 'Pizza',
  slug: 'pizza',
  color: '#FF6B00',
  icon: null,
};
const unusedTag: HomeFeedTag = {
  id: 'tag-unused',
  name: 'Sushi',
  nameEn: 'Sushi',
  slug: 'sushi',
  color: '#2474D2',
  icon: null,
};

const candidate = (id: string, etaMinutes: number, ordersToday: number): HomeFeedCandidate => ({
  id,
  name: `Restaurang ${id}`,
  slug: `restaurang-${id}`,
  cuisine: 'Pizza',
  city: 'Lund',
  imageUrl: null,
  heroImageUrl: null,
  isOpen: true,
  tags: [pizzaTag],
  featuredClass: 3,
  homeBoost: id === 'a' ? 100 : 0,
  homeBoostStartsAt: id === 'a' ? new Date('2026-07-26T00:00:00.000Z') : null,
  homeBoostEndsAt: id === 'a' ? new Date('2026-07-27T00:00:00.000Z') : null,
  ordersToday,
  orders7d: ordersToday * 3,
  etaMinutes,
  actualAverageMinutesToday: null,
  completedTimingsToday: 0,
  rating: 4.5,
  ratingCount: 50,
  deliveryFeeOre: 2900,
  freeDelivery: false,
  freeDeliveryReason: null,
  dealMaxPercent: 0,
  hasActiveDeal: false,
});

const section = (id: string, sortOrder: number): HomeCategorySectionPayload => ({
  id,
  title: id,
  titleEn: null,
  slug: id,
  subtitle: null,
  subtitleEn: null,
  description: null,
  descriptionEn: null,
  isActive: true,
  sortOrder,
  filterMode: 'FILTER',
  maxRestaurants: 3,
  manualRestaurantIds: [],
  filters: {
    openNowOnly: true,
    sortBy: 'ETA',
    sortDirection: 'ASC',
  },
  schedule: { enabled: false },
  presentation: { layout: 'MEDIUM_RAIL', accent: 'ORANGE' },
  ranking: {
    strategy: 'WEIGHTED',
    avoidDuplicateFirst: true,
    appearancePenalty: 6,
    maxAdminBoostPoints: 8,
  },
  createdAt: now,
  updatedAt: now,
});

const feed = composeHomeCategoryFeed({
  sections: [section('snabbast', 1), section('också-snabbt', 2)],
  candidates: [candidate('a', 42, 10), candidate('b', 20, 2), candidate('c', 31, 1)],
  availableTags: [pizzaTag, unusedTag],
  city: 'Lund',
  zone: '22350',
  now,
});

assert.equal(feed.sections[0].restaurants[0].id, 'b', 'ETA ASC ska sätta lägst ETA först');
assert.equal(feed.sections[1].restaurants[0].id, 'c', 'samma restaurang får inte vara etta i två rails');
assert.equal(feed.availableTags.length, 1, 'taggar utan publik restaurang ska inte bli tomma sökchips');
assert.equal(feed.availableTags[0].restaurantCount, 3);
assert.equal(feed.feeSemantics.addressSpecific, false);
assert.equal(feed.strategy.historicalExposureApplied, false);

const publicRestaurant = feed.sections[0].restaurants[0] as unknown as Record<string, unknown>;
assert.equal('score' in publicRestaurant, false);
assert.equal('scoreBreakdown' in publicRestaurant, false);
const publicMetrics = publicRestaurant.metrics as Record<string, unknown>;
for (const privateField of ['ordersToday', 'orders7d', 'actualAverageMinutesToday', 'adminBoost', 'historicalImpressions']) {
  assert.equal(privateField in publicMetrics, false, `${privateField} får inte exponeras publikt`);
}
assert.equal((publicRestaurant.reasons as string[]).includes('ACTIVE_ADMIN_BOOST'), false);

console.log('home category feed contracts: ok');
