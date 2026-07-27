import prisma from './prisma';

export type HomeCategoryFilterMode = 'FILTER' | 'MANUAL' | 'HYBRID';
export type HomeCategorySortBy =
  | 'SMART'
  | 'FEATURED'
  | 'ORDERS_TODAY'
  | 'ORDERS_7D'
  | 'RATING'
  | 'ETA'
  | 'DELIVERY_FEE'
  | 'DISCOUNT'
  | 'NAME';
export type HomeCategorySortDirection = 'ASC' | 'DESC';
export type HomeCategoryRankingStrategy = 'WEIGHTED' | 'BALANCED';
export type HomeCategoryLayout = 'MEDIUM_RAIL' | 'LARGE_RAIL' | 'GRID';
export type HomeCategoryAccent = 'ORANGE' | 'BLUE' | 'GREEN' | 'PURPLE' | 'NAVY';

export interface HomeCategoryFilters {
  searchTerm?: string | null;
  cuisines?: string[];
  tagIds?: string[];
  // Legacy namnfilter. Nya adminflödet skriver tagIds men fältet läses kvar.
  tags?: string[];
  featuredClasses?: number[];
  minRating?: number | null;
  maxEtaMinutes?: number | null;
  maxDeliveryFee?: number | null;
  freeDeliveryOnly?: boolean;
  dealsOnly?: boolean;
  openNowOnly?: boolean;
  sortBy?: HomeCategorySortBy;
  sortDirection?: HomeCategorySortDirection;
}

export interface HomeCategoryPresentation {
  layout?: HomeCategoryLayout;
  accent?: HomeCategoryAccent;
  accentColor?: string | null;
  backgroundColor?: string | null;
  icon?: string | null;
}

export interface HomeCategoryRankingWeights {
  ordersToday?: number;
  orders7d?: number;
  eta?: number;
  ratingConfidence?: number;
  deliveryFee?: number;
  freeDelivery?: number;
  discount?: number;
  tier?: number;
  dailyRotation?: number;
}

export interface HomeCategoryRanking {
  strategy?: HomeCategoryRankingStrategy;
  weights?: HomeCategoryRankingWeights;
  avoidDuplicateFirst?: boolean;
  appearancePenalty?: number;
  maxAdminBoostPoints?: number;
}

export interface HomeCategorySchedule {
  enabled?: boolean;
  daysOfWeek?: number[];
  startTime?: string | null;
  endTime?: string | null;
}

export interface HomeCategorySectionPayload {
  id: string;
  title: string;
  titleEn: string | null;
  slug: string;
  subtitle: string | null;
  subtitleEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  isActive: boolean;
  sortOrder: number;
  filterMode: HomeCategoryFilterMode;
  maxRestaurants: number;
  manualRestaurantIds: string[];
  filters: HomeCategoryFilters;
  schedule: HomeCategorySchedule;
  presentation: HomeCategoryPresentation;
  ranking: HomeCategoryRanking;
  createdAt: Date;
  updatedAt: Date;
}

export type PublicHomeCategorySectionPayload = Omit<HomeCategorySectionPayload, 'ranking'>;

export function toPublicHomeCategorySection(
  section: HomeCategorySectionPayload,
): PublicHomeCategorySectionPayload {
  const { ranking: _ranking, ...publicSection } = section;
  return publicSection;
}

const dayMap: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function normalizeNumberArray(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
};

export function normalizeHomeCategoryFilters(input: Partial<HomeCategoryFilters> | null | undefined): HomeCategoryFilters {
  return {
    searchTerm: input?.searchTerm ? String(input.searchTerm).trim() : null,
    cuisines: normalizeStringArray(input?.cuisines),
    tagIds: normalizeStringArray(input?.tagIds),
    tags: normalizeStringArray(input?.tags),
    featuredClasses: normalizeNumberArray(input?.featuredClasses),
    minRating: input?.minRating == null ? null : Number(input.minRating),
    maxEtaMinutes: input?.maxEtaMinutes == null ? null : Number(input.maxEtaMinutes),
    maxDeliveryFee: input?.maxDeliveryFee == null ? null : Number(input.maxDeliveryFee),
    freeDeliveryOnly: Boolean(input?.freeDeliveryOnly),
    dealsOnly: Boolean(input?.dealsOnly),
    openNowOnly: Boolean(input?.openNowOnly),
    sortBy: (input?.sortBy as HomeCategorySortBy) || 'SMART',
    sortDirection: (input?.sortDirection as HomeCategorySortDirection) || 'DESC',
  };
}

export function normalizeHomeCategoryPresentation(
  input: Partial<HomeCategoryPresentation> | null | undefined,
): HomeCategoryPresentation {
  return {
    layout: (input?.layout as HomeCategoryLayout) || 'MEDIUM_RAIL',
    accent: (input?.accent as HomeCategoryAccent) || 'ORANGE',
    accentColor: input?.accentColor ? String(input.accentColor) : null,
    backgroundColor: input?.backgroundColor ? String(input.backgroundColor) : null,
    icon: input?.icon ? String(input.icon).trim() : null,
  };
}

export const DEFAULT_HOME_RANKING_WEIGHTS: Required<HomeCategoryRankingWeights> = {
  ordersToday: 28,
  orders7d: 12,
  eta: 16,
  ratingConfidence: 16,
  deliveryFee: 7,
  freeDelivery: 5,
  discount: 8,
  tier: 5,
  dailyRotation: 3,
};

export function normalizeHomeCategoryRanking(
  input: Partial<HomeCategoryRanking> | null | undefined,
): HomeCategoryRanking {
  const weights = input?.weights || {};
  return {
    strategy: (input?.strategy as HomeCategoryRankingStrategy) || 'WEIGHTED',
    weights: {
      ordersToday: clamp(weights.ordersToday, 0, 100, DEFAULT_HOME_RANKING_WEIGHTS.ordersToday),
      orders7d: clamp(weights.orders7d, 0, 100, DEFAULT_HOME_RANKING_WEIGHTS.orders7d),
      eta: clamp(weights.eta, 0, 100, DEFAULT_HOME_RANKING_WEIGHTS.eta),
      ratingConfidence: clamp(weights.ratingConfidence, 0, 100, DEFAULT_HOME_RANKING_WEIGHTS.ratingConfidence),
      deliveryFee: clamp(weights.deliveryFee, 0, 100, DEFAULT_HOME_RANKING_WEIGHTS.deliveryFee),
      freeDelivery: clamp(weights.freeDelivery, 0, 100, DEFAULT_HOME_RANKING_WEIGHTS.freeDelivery),
      discount: clamp(weights.discount, 0, 100, DEFAULT_HOME_RANKING_WEIGHTS.discount),
      tier: clamp(weights.tier, 0, 25, DEFAULT_HOME_RANKING_WEIGHTS.tier),
      dailyRotation: clamp(weights.dailyRotation, 0, 10, DEFAULT_HOME_RANKING_WEIGHTS.dailyRotation),
    },
    avoidDuplicateFirst: input?.avoidDuplicateFirst !== false,
    appearancePenalty: clamp(input?.appearancePenalty, 0, 30, 6),
    // En manuell boost får aldrig ensam dominera organiska signaler.
    maxAdminBoostPoints: clamp(input?.maxAdminBoostPoints, 0, 15, 8),
  };
}

export function normalizeHomeCategorySchedule(input: Partial<HomeCategorySchedule> | null | undefined): HomeCategorySchedule {
  return {
    enabled: Boolean(input?.enabled),
    daysOfWeek: normalizeNumberArray(input?.daysOfWeek).filter((value) => value >= 0 && value <= 6),
    startTime: input?.startTime ? String(input.startTime) : null,
    endTime: input?.endTime ? String(input.endTime) : null,
  };
}

export function serializeHomeCategorySection(section: any): HomeCategorySectionPayload {
  return {
    id: section.id,
    title: section.title,
    titleEn: section.titleEn ?? null,
    slug: section.slug,
    subtitle: section.subtitle ?? null,
    subtitleEn: section.subtitleEn ?? null,
    description: section.description ?? null,
    descriptionEn: section.descriptionEn ?? null,
    isActive: Boolean(section.isActive),
    sortOrder: Number(section.sortOrder ?? 0),
    filterMode: (section.filterMode || 'FILTER') as HomeCategoryFilterMode,
    maxRestaurants: Number(section.maxRestaurants ?? 8),
    manualRestaurantIds: normalizeStringArray(parseJson(section.manualRestaurantIds, [] as string[])),
    filters: normalizeHomeCategoryFilters(parseJson(section.filters, {} as HomeCategoryFilters)),
    schedule: normalizeHomeCategorySchedule(parseJson(section.schedule, {} as HomeCategorySchedule)),
    presentation: normalizeHomeCategoryPresentation(
      parseJson(section.presentation, {} as HomeCategoryPresentation),
    ),
    ranking: normalizeHomeCategoryRanking(parseJson(section.ranking, {} as HomeCategoryRanking)),
    createdAt: section.createdAt,
    updatedAt: section.updatedAt,
  };
}

function getStockholmTimeParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Stockholm',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((part) => part.type === 'weekday')?.value || 'Mon';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || '0');

  return {
    weekday: dayMap[weekday] ?? 1,
    minutes: hour * 60 + minute,
  };
}

function parseClock(value?: string | null) {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function isHomeCategoryVisibleNow(schedule: HomeCategorySchedule | null | undefined, now = new Date()) {
  if (!schedule?.enabled) return true;

  const { weekday, minutes } = getStockholmTimeParts(now);

  if (schedule.daysOfWeek?.length && !schedule.daysOfWeek.includes(weekday)) {
    return false;
  }

  const startMinutes = parseClock(schedule.startTime);
  const endMinutes = parseClock(schedule.endTime);

  if (startMinutes == null || endMinutes == null) return true;

  if (startMinutes <= endMinutes) {
    return minutes >= startMinutes && minutes <= endMinutes;
  }

  return minutes >= startMinutes || minutes <= endMinutes;
}

// ── Tillfällen ────────────────────────────────────────────────────────────────
// "Pizza fredag" på en måndag bränner mer förtroende än en tom räls gör. Admin
// kan alltid sätta ett eget schema (schedule.enabled) och då gäller bara det.
// Saknas schema läser vi tillfället ur namnet, så att egenskapade kategorier
// blir sanna direkt utan att någon måste efterredigera dem i admin.
interface OccasionRule {
  pattern: RegExp;
  daysOfWeek?: number[];
  startTime?: string;
  endTime?: string;
}

const DAY_OCCASIONS: OccasionRule[] = [
  { pattern: /fredag|friday/, daysOfWeek: [5], startTime: '14:00', endTime: '23:59' },
  { pattern: /l[öo]rdag|saturday/, daysOfWeek: [6] },
  { pattern: /s[öo]ndag|sunday/, daysOfWeek: [0] },
  // Helgen börjar på fredagen i kundens huvud, så helgkategorier får tre dagar.
  { pattern: /helg|weekend/, daysOfWeek: [5, 6, 0] },
  { pattern: /m[åa]ndag|monday/, daysOfWeek: [1] },
  { pattern: /tisdag|tuesday/, daysOfWeek: [2] },
  { pattern: /onsdag|wednesday/, daysOfWeek: [3] },
  { pattern: /torsdag|thursday/, daysOfWeek: [4] },
];

const TIME_OCCASIONS: OccasionRule[] = [
  { pattern: /brunch/, daysOfWeek: [6, 0], startTime: '09:00', endTime: '14:00' },
  { pattern: /frukost|breakfast|morgon/, startTime: '06:00', endTime: '10:30' },
  { pattern: /natt|late.?night/, startTime: '21:00', endTime: '03:59' },
  { pattern: /lunch/, startTime: '10:30', endTime: '14:30' },
  { pattern: /kv[äa]ll|evening|middag|dinner/, startTime: '16:00', endTime: '23:59' },
];

export function inferHomeCategorySchedule(section: {
  slug?: string | null;
  title?: string | null;
  titleEn?: string | null;
}): HomeCategorySchedule | null {
  const haystack = `${section.slug || ''} ${section.title || ''} ${section.titleEn || ''}`
    .toLocaleLowerCase('sv');
  const day = DAY_OCCASIONS.find((rule) => rule.pattern.test(haystack));
  const time = TIME_OCCASIONS.find((rule) => rule.pattern.test(haystack));
  if (!day && !time) return null;

  // Dagen kommer från dagsregeln, klockslaget från tidsregeln när båda matchar
  // ("Fredagskväll" = fredag 16:00–23:59, inte fredag från 14:00).
  const window = time || day;
  return {
    enabled: true,
    daysOfWeek: day?.daysOfWeek ?? time?.daysOfWeek ?? [],
    startTime: window?.startTime ?? null,
    endTime: window?.endTime ?? null,
  };
}

export function effectiveHomeCategorySchedule(section: {
  slug?: string | null;
  title?: string | null;
  titleEn?: string | null;
  schedule?: HomeCategorySchedule | null;
}): HomeCategorySchedule {
  if (section.schedule?.enabled) return section.schedule;
  return inferHomeCategorySchedule(section) || normalizeHomeCategorySchedule(section.schedule);
}

export function isHomeCategorySectionVisibleNow(
  section: {
    slug?: string | null;
    title?: string | null;
    titleEn?: string | null;
    schedule?: HomeCategorySchedule | null;
  },
  now = new Date(),
) {
  return isHomeCategoryVisibleNow(effectiveHomeCategorySchedule(section), now);
}

const defaultCategories: Array<{
  title: string;
  titleEn: string;
  slug: string;
  subtitle: string;
  subtitleEn: string;
  sortOrder: number;
  filterMode: HomeCategoryFilterMode;
  maxRestaurants: number;
  filters: HomeCategoryFilters;
  schedule: HomeCategorySchedule;
  presentation?: HomeCategoryPresentation;
  ranking?: HomeCategoryRanking;
}> = [
  {
    title: 'Utvalt idag',
    titleEn: 'Picked today',
    slug: 'utvalt-idag',
    subtitle: 'Populärt, snabbt och väl omtyckt just nu',
    subtitleEn: 'Popular, fast and well liked right now',
    sortOrder: 5,
    filterMode: 'FILTER',
    maxRestaurants: 8,
    filters: {
      openNowOnly: true,
      sortBy: 'SMART',
      sortDirection: 'DESC',
    },
    schedule: { enabled: false },
    presentation: { layout: 'MEDIUM_RAIL', accent: 'ORANGE' },
    ranking: { strategy: 'BALANCED', avoidDuplicateFirst: true },
  },
  {
    title: 'Heta listan',
    titleEn: 'Trending now',
    slug: 'heta-listan',
    subtitle: 'Toppvalen i din stad just nu',
    subtitleEn: "Top picks in your city right now",
    sortOrder: 10,
    filterMode: 'FILTER',
    maxRestaurants: 8,
    filters: {
      featuredClasses: [1, 2],
      sortBy: 'SMART',
      sortDirection: 'DESC',
    },
    schedule: { enabled: false },
    presentation: { layout: 'MEDIUM_RAIL', accent: 'ORANGE' },
    ranking: { strategy: 'WEIGHTED', avoidDuplicateFirst: true },
  },
  {
    title: 'Pizza fredag',
    titleEn: 'Pizza Friday',
    slug: 'pizza-fredag',
    subtitle: 'Fredagsfavoriter när pizzasuget slår till',
    subtitleEn: 'Friday favourites when the pizza craving hits',
    sortOrder: 20,
    filterMode: 'FILTER',
    maxRestaurants: 8,
    filters: {
      searchTerm: 'pizza',
      cuisines: ['Pizza'],
      openNowOnly: true,
      sortBy: 'RATING',
      sortDirection: 'DESC',
    },
    schedule: {
      enabled: true,
      daysOfWeek: [5],
      startTime: '15:00',
      endTime: '23:59',
    },
    presentation: { layout: 'MEDIUM_RAIL', accent: 'ORANGE' },
    ranking: { strategy: 'WEIGHTED', avoidDuplicateFirst: true },
  },
  {
    // Sushi på fredag lever bara om staden faktiskt har sushi som är öppet —
    // annars filtreras rälsen bort som tom och Pizza fredag tar platsen.
    title: 'Sushi fredag',
    titleEn: 'Sushi Friday',
    slug: 'sushi-fredag',
    subtitle: 'Fredagsrullar när du vill ha något fräscht',
    subtitleEn: 'Friday rolls when you want something fresh',
    sortOrder: 22,
    filterMode: 'FILTER',
    maxRestaurants: 8,
    filters: {
      cuisines: ['Sushi'],
      openNowOnly: true,
      sortBy: 'RATING',
      sortDirection: 'DESC',
    },
    schedule: {
      enabled: true,
      daysOfWeek: [5],
      startTime: '14:00',
      endTime: '23:59',
    },
    presentation: { layout: 'MEDIUM_RAIL', accent: 'BLUE' },
    ranking: { strategy: 'WEIGHTED', avoidDuplicateFirst: true },
  },
  {
    title: 'Helgens snabbaste',
    titleEn: 'Fastest this weekend',
    slug: 'helgens-snabbaste',
    subtitle: 'Kortast väntan i helgen just nu',
    subtitleEn: 'Shortest wait right now this weekend',
    sortOrder: 24,
    filterMode: 'FILTER',
    maxRestaurants: 8,
    filters: {
      maxEtaMinutes: 40,
      openNowOnly: true,
      sortBy: 'ETA',
      sortDirection: 'ASC',
    },
    schedule: {
      enabled: true,
      daysOfWeek: [5, 6, 0],
      startTime: null,
      endTime: null,
    },
    presentation: { layout: 'MEDIUM_RAIL', accent: 'GREEN' },
    ranking: {
      strategy: 'WEIGHTED',
      avoidDuplicateFirst: true,
      weights: { eta: 45, ordersToday: 18, ratingConfidence: 12 },
    },
  },
  {
    title: 'Helgens populäraste',
    titleEn: 'Most popular this weekend',
    slug: 'helgens-popularaste',
    subtitle: 'Mest beställt av andra i helgen',
    subtitleEn: 'Most ordered by others this weekend',
    sortOrder: 26,
    filterMode: 'FILTER',
    maxRestaurants: 8,
    filters: {
      openNowOnly: true,
      sortBy: 'ORDERS_7D',
      sortDirection: 'DESC',
    },
    schedule: {
      enabled: true,
      daysOfWeek: [5, 6, 0],
      startTime: null,
      endTime: null,
    },
    presentation: { layout: 'MEDIUM_RAIL', accent: 'ORANGE' },
    ranking: {
      strategy: 'WEIGHTED',
      avoidDuplicateFirst: true,
      weights: { orders7d: 40, ordersToday: 22, ratingConfidence: 12 },
    },
  },
  {
    title: 'Snabb lunch',
    titleEn: 'Quick lunch',
    slug: 'snabb-lunch',
    subtitle: 'Snabba val för vardagens lunchrush',
    subtitleEn: 'Fast picks for the weekday lunch rush',
    sortOrder: 30,
    filterMode: 'FILTER',
    maxRestaurants: 8,
    filters: {
      maxEtaMinutes: 25,
      openNowOnly: true,
      sortBy: 'ETA',
      sortDirection: 'ASC',
    },
    schedule: {
      enabled: true,
      daysOfWeek: [1, 2, 3, 4, 5],
      startTime: '11:00',
      endTime: '14:00',
    },
    presentation: { layout: 'MEDIUM_RAIL', accent: 'GREEN' },
    ranking: {
      strategy: 'WEIGHTED',
      avoidDuplicateFirst: true,
      weights: { eta: 40, ordersToday: 20, ratingConfidence: 15 },
    },
  },
  {
    title: 'Sushi suget',
    titleEn: 'Sushi cravings',
    slug: 'sushi-suget',
    subtitle: 'När du vill ha något fräscht och snabbt',
    subtitleEn: 'When you want something fresh and fast',
    sortOrder: 40,
    filterMode: 'FILTER',
    maxRestaurants: 8,
    filters: {
      cuisines: ['Sushi'],
      minRating: 4,
      openNowOnly: true,
      sortBy: 'RATING',
      sortDirection: 'DESC',
    },
    schedule: { enabled: false },
    presentation: { layout: 'MEDIUM_RAIL', accent: 'BLUE' },
    ranking: { strategy: 'WEIGHTED', avoidDuplicateFirst: true },
  },
  {
    // Fri leverans: serverfeeden plockar upp ovillkorlig grundavgift 0 kr eller
    // en aktiv fri-leverans-deal. Adressens zonpris avgörs först i den separata
    // leveransofferten och påstås aldrig här. Admin kan när som helst byta till
    // MANUAL/HYBRID och välja restauranger för hand precis som med de
    // övriga rails (Pizza fredag, Snabb lunch, Heta listan).
    title: 'Fri leverans',
    titleEn: 'Free delivery',
    slug: 'fri-leverans',
    subtitle: 'Restauranger som kör ut gratis',
    subtitleEn: 'Restaurants that deliver for free',
    sortOrder: 50,
    filterMode: 'FILTER',
    maxRestaurants: 12,
    filters: {
      freeDeliveryOnly: true,
      openNowOnly: true,
      sortBy: 'FEATURED',
      sortDirection: 'DESC',
    },
    schedule: { enabled: false },
    presentation: { layout: 'MEDIUM_RAIL', accent: 'GREEN' },
    ranking: {
      strategy: 'WEIGHTED',
      avoidDuplicateFirst: true,
      weights: { freeDelivery: 40, deliveryFee: 20, ratingConfidence: 15 },
    },
  },
  {
    title: 'Bra betyg',
    titleEn: 'Top rated',
    slug: 'bra-betyg',
    subtitle: 'Omtyckta val med många riktiga omdömen',
    subtitleEn: 'Well liked picks with real reviews',
    sortOrder: 60,
    filterMode: 'FILTER',
    maxRestaurants: 8,
    filters: {
      minRating: 4,
      openNowOnly: true,
      sortBy: 'RATING',
      sortDirection: 'DESC',
    },
    schedule: { enabled: false },
    presentation: { layout: 'MEDIUM_RAIL', accent: 'PURPLE' },
    ranking: {
      strategy: 'WEIGHTED',
      avoidDuplicateFirst: true,
      weights: { ratingConfidence: 45, ordersToday: 15, orders7d: 15 },
    },
  },
];

export async function ensureDefaultHomeCategorySections() {
  for (const category of defaultCategories) {
    const existing = await prisma.homeCategorySection.findUnique({ where: { slug: category.slug } });
    if (existing) continue;

    await prisma.homeCategorySection.create({
      data: {
        title: category.title,
        titleEn: category.titleEn,
        slug: category.slug,
        subtitle: category.subtitle,
        subtitleEn: category.subtitleEn,
        description: null,
        descriptionEn: null,
        isActive: true,
        sortOrder: category.sortOrder,
        filterMode: category.filterMode,
        maxRestaurants: category.maxRestaurants,
        manualRestaurantIds: JSON.stringify([]),
        filters: JSON.stringify(normalizeHomeCategoryFilters(category.filters)),
        schedule: JSON.stringify(normalizeHomeCategorySchedule(category.schedule)),
        presentation: JSON.stringify(normalizeHomeCategoryPresentation(category.presentation)),
        ranking: JSON.stringify(normalizeHomeCategoryRanking(category.ranking)),
      },
    });
  }
}
