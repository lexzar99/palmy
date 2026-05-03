import prisma from './prisma';

export type HomeCategoryFilterMode = 'FILTER' | 'MANUAL' | 'HYBRID';
export type HomeCategorySortBy = 'FEATURED' | 'RATING' | 'ETA' | 'NAME';
export type HomeCategorySortDirection = 'ASC' | 'DESC';

export interface HomeCategoryFilters {
  searchTerm?: string | null;
  cuisines?: string[];
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

export interface HomeCategorySchedule {
  enabled?: boolean;
  daysOfWeek?: number[];
  startTime?: string | null;
  endTime?: string | null;
}

export interface HomeCategorySectionPayload {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  filterMode: HomeCategoryFilterMode;
  maxRestaurants: number;
  manualRestaurantIds: string[];
  filters: HomeCategoryFilters;
  schedule: HomeCategorySchedule;
  createdAt: Date;
  updatedAt: Date;
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

export function normalizeHomeCategoryFilters(input: Partial<HomeCategoryFilters> | null | undefined): HomeCategoryFilters {
  return {
    searchTerm: input?.searchTerm ? String(input.searchTerm).trim() : null,
    cuisines: normalizeStringArray(input?.cuisines),
    tags: normalizeStringArray(input?.tags),
    featuredClasses: normalizeNumberArray(input?.featuredClasses),
    minRating: input?.minRating == null ? null : Number(input.minRating),
    maxEtaMinutes: input?.maxEtaMinutes == null ? null : Number(input.maxEtaMinutes),
    maxDeliveryFee: input?.maxDeliveryFee == null ? null : Number(input.maxDeliveryFee),
    freeDeliveryOnly: Boolean(input?.freeDeliveryOnly),
    dealsOnly: Boolean(input?.dealsOnly),
    openNowOnly: Boolean(input?.openNowOnly),
    sortBy: (input?.sortBy as HomeCategorySortBy) || 'FEATURED',
    sortDirection: (input?.sortDirection as HomeCategorySortDirection) || 'DESC',
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
    slug: section.slug,
    subtitle: section.subtitle ?? null,
    description: section.description ?? null,
    isActive: Boolean(section.isActive),
    sortOrder: Number(section.sortOrder ?? 0),
    filterMode: (section.filterMode || 'FILTER') as HomeCategoryFilterMode,
    maxRestaurants: Number(section.maxRestaurants ?? 8),
    manualRestaurantIds: normalizeStringArray(parseJson(section.manualRestaurantIds, [] as string[])),
    filters: normalizeHomeCategoryFilters(parseJson(section.filters, {} as HomeCategoryFilters)),
    schedule: normalizeHomeCategorySchedule(parseJson(section.schedule, {} as HomeCategorySchedule)),
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

const defaultCategories: Array<{
  title: string;
  slug: string;
  subtitle: string;
  sortOrder: number;
  filterMode: HomeCategoryFilterMode;
  maxRestaurants: number;
  filters: HomeCategoryFilters;
  schedule: HomeCategorySchedule;
}> = [
  {
    title: 'Heta listan',
    slug: 'heta-listan',
    subtitle: 'Toppvalen i din stad just nu',
    sortOrder: 10,
    filterMode: 'FILTER',
    maxRestaurants: 8,
    filters: {
      featuredClasses: [1, 2],
      sortBy: 'FEATURED',
      sortDirection: 'DESC',
    },
    schedule: { enabled: false },
  },
  {
    title: 'Pizza fredag',
    slug: 'pizza-fredag',
    subtitle: 'Fredagsfavoriter när pizzasuget slår till',
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
  },
  {
    title: 'Snabb lunch',
    slug: 'snabb-lunch',
    subtitle: 'Snabba val för vardagens lunchrush',
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
  },
  {
    title: 'Sushi suget',
    slug: 'sushi-suget',
    subtitle: 'När du vill ha något fräscht och snabbt',
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
  },
  {
    // Fri leverans: standard FILTER-mode med freeDeliveryOnly = true plockar
    // automatiskt upp restauranger som har deliveryFee=0 eller har en
    // matchande zon med fri leverans. Admin kan när som helst byta till
    // MANUAL/HYBRID och välja restauranger för hand precis som med de
    // övriga rails (Pizza fredag, Snabb lunch, Heta listan).
    title: 'Fri leverans',
    slug: 'fri-leverans',
    subtitle: 'Restauranger som kör ut gratis',
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
  },
];

export async function ensureDefaultHomeCategorySections() {
  for (const category of defaultCategories) {
    const existing = await prisma.homeCategorySection.findUnique({ where: { slug: category.slug } });
    if (existing) continue;

    await prisma.homeCategorySection.create({
      data: {
        title: category.title,
        slug: category.slug,
        subtitle: category.subtitle,
        description: null,
        isActive: true,
        sortOrder: category.sortOrder,
        filterMode: category.filterMode,
        maxRestaurants: category.maxRestaurants,
        manualRestaurantIds: JSON.stringify([]),
        filters: JSON.stringify(normalizeHomeCategoryFilters(category.filters)),
        schedule: JSON.stringify(normalizeHomeCategorySchedule(category.schedule)),
      },
    });
  }
}
