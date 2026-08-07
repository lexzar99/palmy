import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { slugify } from '../lib/slug';
import { authenticate, AuthRequest, resolveAdminSessionFromToken } from '../middleware/auth';
import { getIO } from '../lib/socket';
import { isRestaurantOpen, nextOpeningAfterToday } from '../lib/openingHours';
import { normalizeDeliveryZones } from '../utils/deliveryZones';
import { moneyDto, nullableMoneyDto, oreToSek, parseOre, sekToOre } from '../utils/money';
import { getEffectiveEtaMinutes, ETA_DEFAULT_MINUTES } from '../lib/restaurantEta';
import {
  ACCEPTING_ORDERS_MODES,
  AcceptingOrdersMode,
  resolveRestaurantAvailability,
} from '../lib/restaurantAvailability';
import { resolveOrCreateCity } from '../lib/cityResolver';
import { cached, bustCache, bustRestaurantCaches } from '../lib/ttlCache';
import { revalidateWebRestaurant } from '../lib/revalidate';
import { menuCacheBust } from './menu';
import { deleteFromR2, listR2, r2Enabled, r2UrlToKey, slugifyPathSegment } from '../lib/r2';
import { syncRestaurantImagePrefix } from '../lib/r2Rename';
import { isCustomerVisibleDeal, isDealAvailableNow, parseApplicableRestaurantIds, parseDealProductIds } from '../lib/deals';
import { audit } from '../lib/auditLog';
import { normalizeFoodVatPercent } from '../lib/tax';

const router = Router();

const PLATFORM_ADMIN_ROLES = new Set(['SUPER_ADMIN', 'GLOBAL_VIEWER', 'MENU_AGENT', 'GROWTH_AGENT']);

async function upsertRestaurantAdminAccount(input: {
  restaurantId: string;
  restaurantName: string;
  email: string;
  passwordHash: string;
}) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing && PLATFORM_ADMIN_ROLES.has(existing.role)) {
    throw new Error('Admin-adressen tillhör ett plattformskonto och kan inte användas av en restaurang');
  }

  if (existing) {
    const otherOwner = await prisma.restaurant.findFirst({
      where: {
        id: { not: input.restaurantId },
        archivedAt: null,
        OR: [
          { adminUserId: existing.id },
          { adminEmail: { equals: email, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true },
    });
    if (otherOwner) {
      throw new Error(`Admin-adressen används redan av ${otherOwner.name}`);
    }
  }

  return prisma.$transaction(async (tx) => {
    const adminUser = existing
      ? await tx.adminUser.update({
          where: { id: existing.id },
          data: {
            password: input.passwordHash,
            isActive: true,
            name: `${input.restaurantName} Admin`,
            role: 'RESTAURANT_ADMIN',
          },
        })
      : await tx.adminUser.create({
          data: {
            email,
            password: input.passwordHash,
            name: `${input.restaurantName} Admin`,
            role: 'RESTAURANT_ADMIN',
            isActive: true,
          },
        });

    await tx.restaurant.update({
      where: { id: input.restaurantId },
      data: { adminUserId: adminUser.id, adminEmail: adminUser.email },
    });
    return adminUser;
  });
}

const kr = (amount: number) => sekToOre(amount, 'amountSek');
const fromOre = (amount?: number | null) => oreToSek(amount);
const tierOverrideToOre = (value: unknown, field: string): number | null => {
  if (value === null || value === '') return null;
  return sekToOre(Number(value), field);
};
// Extra options may intentionally adjust a base price downwards (for example
// a smaller pizza size). Product/delivery amounts are non-negative, but an
// addon is a signed delta and must not make the whole restaurant response 500.
const fromSignedOre = (amount?: number | null) => {
  if (amount == null) return 0;
  const numeric = Number(amount);
  return Number.isFinite(numeric) ? Math.round(numeric) / 100 : 0;
};
const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};

const safeParseAnyJson = <T>(value: unknown, fallback: T): T => {
  if (typeof value === 'string') return parseJson<T>(value, fallback);
  return (value as T) ?? fallback;
};

const parseJsonStringArray = (value: string | null | undefined): string[] => {
  const parsed = parseJson<unknown>(value, []);
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
};

const removeStringFromJsonArray = (value: string | null | undefined, itemToRemove: string): { json: string; removed: boolean } => {
  const current = parseJsonStringArray(value);
  const next = current.filter((item) => item !== itemToRemove);
  return { json: JSON.stringify(next), removed: next.length !== current.length };
};

const restaurantSchema = z.object({
  name: z.string().min(2),
  slug: z.string().optional(),
  // Some clients send null for optional text fields (e.g. when DB value is null).
  description: z.string().nullable().optional(),
  cuisine: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  zip: z.string().optional(),
  phone: z.string().optional(),
  // Public contact email for the restaurant — surfaces in the order-tracking
  // "Contact restaurant" button. Optional, nullable.
  email: z.string().nullable().optional(),
  // Legal identity — surfaced in the restaurant info modal so customers can
  // verify who they're ordering from. Both nullable.
  legalName: z.string().nullable().optional(),
  organizationNumber: z.string().nullable().optional(),
  adminEmail: z.string().optional(),
  imageUrl: z.string().nullable().optional(),
  heroImageUrl: z.string().nullable().optional(),
  offersImageUrl: z.string().nullable().optional(),
  deliveryFee: z.any().optional(),
  deliveryFeeOre: z.number().int().nonnegative().optional(),
  minOrderAmount: z.any().optional(),
  minOrderAmountOre: z.number().int().nonnegative().optional(),
  etaMinutes: z.any().optional(),
  // etaOverrideMinutes: admin-manuell override. Sätt null för att rensa
  // override och låta dynamiska beräkningen styra. Number = nytt override
  // i minuter (clampas server-side till 25–55).
  etaOverrideMinutes: z.any().optional(),
  tags: z.any().optional(),
  tagIds: z.array(z.string().min(1)).max(20).optional(),
  featuredClass: z.any().optional(),
  homeBoost: z.number().int().min(0).max(100).optional(),
  homeBoostStartsAt: z.string().datetime().nullable().optional(),
  homeBoostEndsAt: z.string().datetime().nullable().optional(),
  isOpen: z.boolean().optional(),
  acceptingOrdersMode: z.enum(ACCEPTING_ORDERS_MODES).optional(),
  acceptingOrdersOverrideUntil: z.string().datetime().nullable().optional(),
  acceptingOrdersOverrideReason: z.string().max(500).nullable().optional(),
  comingSoon: z.boolean().optional(),
  // Editing (agent-onboarding). Bara SUPER_ADMIN kan publicera; MENU_AGENT kan starta editing.
  draft: z.boolean().optional(),
  editing: z.boolean().optional(),
  rating: z.any().optional(),
  ratingCount: z.any().optional(),
  openingHours: z.any().optional(),
  adminPassword: z.string().optional(),
  internalInfo: z.string().nullable().optional(),
  latitude: z.any().optional(),
  longitude: z.any().optional(),
  placeId: z.string().nullable().optional(),
  deliveryZones: z.any().optional(),
  freeDeliveryAbove: z.any().optional(),
  freeDeliveryAboveOre: z.number().int().nonnegative().nullable().optional(),
  deliveryRadius: z.number().optional(),
  logoutCode: z.string().nullable().optional(),
  announcementText: z.string().nullable().optional(),
  vatPercent: z.union([z.literal(0), z.literal(6), z.literal(12), z.literal(25)]).nullable().optional(),
  // Leveransansvar: true = restaurangen levererar själv, false = plattformen.
  selfDelivery: z.boolean().optional(),
  // Provisions-override i %. null = global sats, 0 = provisionsfritt avtal.
  commissionPctOverride: z.number().int().min(0).max(100).nullable().optional(),
  // Restaurangspecifika tier-priser i kr/mån. null = använd global tier-sats.
  tierGoldFeeOverride: z.any().nullable().optional(),
  tierSilverFeeOverride: z.any().nullable().optional(),
  tierStandardFeeOverride: z.any().nullable().optional(),
  // ISO datetime sträng – när restaurangen ska öppna igen efter en paus.
  // null = ingen pause aktiv. Sätt till null för att avbryta pause.
  pausedUntil: z.string().datetime().nullable().optional(),
});

async function resolveTagSelection(tagIds: string[]) {
  const uniqueIds = [...new Set(tagIds.filter(Boolean))];
  if (uniqueIds.length > 20) throw new TypeError('En restaurang kan ha högst 20 taggar');
  const tags = await prisma.restaurantTag.findMany({
    where: { id: { in: uniqueIds }, isActive: true },
    select: { id: true, name: true },
  });
  if (tags.length !== uniqueIds.length) {
    throw new TypeError('En eller flera valda taggar finns inte eller är inaktiva');
  }
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  return uniqueIds.map((id, position) => ({ ...byId.get(id)!, position }));
}

function validateHomeBoostWindow(startsAt?: string | null, endsAt?: string | null, boost = 0) {
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  if (boost > 0 && !end) throw new TypeError('En tidsbegränsad boost måste ha ett slutdatum');
  if (boost > 0 && end && end <= new Date()) throw new TypeError('Boostens slutdatum måste ligga i framtiden');
  if (start && end && end < start) throw new TypeError('Boostens slut måste vara efter start');
  const effectiveStart = start || new Date();
  if (end && end.getTime() - effectiveStart.getTime() > 31 * 24 * 60 * 60 * 1000) {
    throw new TypeError('En boostperiod får vara högst 31 dagar');
  }
  return { start, end };
}

type DealSummary = { dealMaxPercent: number; dealCoversAll: boolean };

type AvailabilityOverlays = Parameters<typeof resolveRestaurantAvailability>[1];

const formatRestaurant = (
  restaurant: any,
  includeMenu = false,
  dealSummary?: DealSummary,
  overlays: AvailabilityOverlays = {
    city: restaurant.city_relation ?? null,
    platform: restaurant.platformSettings ?? null,
  },
) => {
  const activeOrdersCount = (restaurant.orders || []).length;
  // Effektiv ETA: override > beräknad > legacy etaMinutes > 40, clampad 25–55.
  // Detta är det värde som visas för kunden. Kunder ser aldrig
  // "etaCalculatedMinutes" eller "etaOverrideMinutes" råa — bara summan.
  const dynamicEta = getEffectiveEtaMinutes(restaurant);
  const availability = resolveRestaurantAvailability(restaurant, overlays);
  const assignedTags = Array.isArray(restaurant.tagAssignments)
    ? restaurant.tagAssignments.map((assignment: any) => assignment.tag).filter(Boolean)
    : [];
  const legacyTags = parseJson<string[]>(restaurant.tags, []);

  return {
    id: restaurant.id,
    name: restaurant.name,
    slug: restaurant.slug,
    description: restaurant.description,
    cuisine: restaurant.cuisine,
    address: restaurant.address,
    city: restaurant.city,
    zip: restaurant.zip,
    phone: restaurant.phone,
    email: restaurant.email ?? null,
    legalName: restaurant.legalName ?? null,
    organizationNumber: restaurant.organizationNumber ?? null,
    imageUrl: restaurant.imageUrl,
    heroImageUrl: restaurant.heroImageUrl,
    offersImageUrl: restaurant.offersImageUrl ?? null,
    rating: restaurant.rating ?? 4.6,
    ratingCount: restaurant.ratingCount ?? 0,
    deliveryFeeOre: restaurant.deliveryFee ?? 0,
    deliveryFeeMoney: moneyDto(restaurant.deliveryFee ?? 0),
    deliveryFee: fromOre(restaurant.deliveryFee),
    minOrderAmountOre: restaurant.minOrderAmount ?? 0,
    minOrderAmountMoney: moneyDto(restaurant.minOrderAmount ?? 0),
    minOrderAmount: fromOre(restaurant.minOrderAmount),
    etaMinutes: dynamicEta,
    baseEtaMinutes: restaurant.etaMinutes ?? ETA_DEFAULT_MINUTES, // legacy raw stored value
    etaCalculatedMinutes: restaurant.etaCalculatedMinutes ?? null, // auto från historik (null = för få ordrar)
    etaOverrideMinutes: restaurant.etaOverrideMinutes ?? null,     // admin manuell override (null = av)
    // Avhämtningstid räknas AUTOMATISKT som leveranstid − 5 min, clampad 5–25.
    // Visas bara i avhämtningsläge (ej leverans, ej på kort). Inget admin-fält.
    pickupEtaMinutes: Math.max(5, Math.min(25, dynamicEta - 5)),
    activeOrdersCount,
  isOpen: availability.isOpen,
  scheduledOpenNow: availability.scheduledOpenNow,
  acceptingOrdersMode: availability.configuredMode,
  effectiveAcceptingOrdersMode: availability.effectiveMode,
  acceptingOrdersOverrideUntil: availability.overrideUntil,
  acceptingOrdersOverrideReason: availability.overrideReason,
  acceptingOrdersOverrideActive: availability.manualOverrideActive,
  availabilityReason: availability.reason,
  availabilityOverlays: {
    platformPaused: availability.platformPaused,
    cityPaused: availability.cityPaused,
    restaurantPaused: availability.restaurantPaused,
    closedUntilOpening: availability.closedUntilOpening,
  },
  comingSoon: restaurant.comingSoon ?? false,
  draft: restaurant.draft ?? false,
  editing: restaurant.draft ?? false,
  manualIsOpen: availability.legacyManualIsOpen,
  // `pausedUntil` betyder "pausad mitt i öppettiden" för alla klienter. Ligger
  // tiden kvar från en dagsstängning är restaurangen inte pausad utan stängd,
  // och då ska fältet vara tomt — annars renderar redan utrullade appar
  // "Pausad till 11:00" istället för "Stängt · öppnar 11:00".
  pausedUntil: availability.restaurantPaused && restaurant.pausedUntil
    ? new Date(restaurant.pausedUntil).toISOString()
    : null,
  // Terminalens "stäng restaurang" har en egen tid: restaurangen är stängd
  // tills den öppnar igen. Skilj den från pausen så partner-appen kan visa
  // STÄNGD · 11:00 utan att kunden får se ordet "pausad".
  closedUntil: availability.closedUntilOpening ? availability.opensAt : null,
  opensAt: availability.opensAt,
  featuredClass: restaurant.featuredClass ?? 3,
  tags: assignedTags.length ? assignedTags.map((tag: any) => tag.name) : legacyTags,
  tagIds: assignedTags.map((tag: any) => tag.id),
  tagDetails: assignedTags.map((tag: any) => ({
    id: tag.id,
    name: tag.name,
    nameEn: tag.nameEn ?? null,
    slug: tag.slug,
    color: tag.color,
    icon: tag.icon ?? null,
  })),
  openingHours: parseJson<Record<string, any>>(restaurant.openingHours, {}),
  internalInfo: restaurant.internalInfo,
  announcementText: restaurant.announcementText ?? null,
  // Every app order is takeaway/delivery; current Swedish food default is 6%.
  vatPercent: normalizeFoodVatPercent(restaurant.vatPercent, 6),
  selfDelivery: restaurant.selfDelivery ?? false,
  commissionPctOverride: restaurant.commissionPctOverride ?? null,
  tierGoldFeeOverride: restaurant.tierGoldFeeOverride == null ? null : fromOre(restaurant.tierGoldFeeOverride),
  tierSilverFeeOverride: restaurant.tierSilverFeeOverride == null ? null : fromOre(restaurant.tierSilverFeeOverride),
  tierStandardFeeOverride: restaurant.tierStandardFeeOverride == null ? null : fromOre(restaurant.tierStandardFeeOverride),
  createdAt: restaurant.createdAt,
  updatedAt: restaurant.updatedAt,
  // Geo-data — används av admin-form (lat/lng/placeId visas read-only efter
  // Google Places autocomplete) och av web för djup-länkar till Maps.
  latitude: restaurant.latitude ?? null,
  longitude: restaurant.longitude ?? null,
  placeId: restaurant.placeId ?? null,
  // City-koppling (FK till City-tabellen) — används av web-filter så kunden
  // bara ser restauranger i sin stad-familj (city + childCities via merge).
  cityId: restaurant.cityId ?? null,
  deliveryRadius: restaurant.deliveryRadius ?? 5.0,
  deliveryZones: normalizeDeliveryZones(parseJson<any[]>(restaurant.deliveryZones, [])),
  freeDeliveryAboveOre: restaurant.freeDeliveryAbove ?? null,
  freeDeliveryAboveMoney: nullableMoneyDto(restaurant.freeDeliveryAbove),
  // Legacy admin/web field is formatted in SEK. Explicit ...Ore is canonical.
  freeDeliveryAbove: restaurant.freeDeliveryAbove == null ? null : fromOre(restaurant.freeDeliveryAbove),
  // Rabatt-sammanfattning för kortbadge: högsta procentrabatt just nu +
  // om den täcker hela menyn (platt) eller bara vissa kategorier/produkter.
  dealMaxPercent: dealSummary?.dealMaxPercent ?? 0,
  dealCoversAll: dealSummary?.dealCoversAll ?? false,
  menu: includeMenu
    ? (restaurant.categories || []).map((cat: any) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        position: cat.position,
        items: (cat.products || []).map((prod: any) => ({
          id: prod.id,
          name: prod.name,
          description: prod.description,
          price: fromOre(prod.price),
          imageUrl: prod.imageUrl,
          isVegan: prod.isVegan,
          isVegetarian: prod.isVegetarian,
          isGlutenFree: prod.isGlutenFree,
          extraGroups: (prod.extraGroups || [])
            .filter((peg: any) => peg.extraGroup?.restaurantId === restaurant.id)
            .sort((a: any, b: any) => (a.position || 0) - (b.position || 0))
            .map((peg: any) => ({
            id: peg.extraGroup.id,
            name: peg.extraGroup.name,
            type: peg.extraGroup.type,
            required: peg.extraGroup.required,
            minSelections: peg.extraGroup.minSelections,
            maxSelections: peg.extraGroup.maxSelections,
            displayStyle: peg.extraGroup.displayStyle,
            allowQuantity: peg.extraGroup.allowQuantity,
            extras: (peg.extraGroup.extras || []).map((e: any) => ({
              id: e.id,
              name: e.name,
              priceAddon: fromSignedOre(e.priceAddon),
              isDefault: e.isDefault,
              imageUrl: e.imageUrl,
            })),
          })),
        })),
      }))
    : undefined,
  };
};

// Hämtar alla aktiva procent-deals EN gång och grupperar per restaurang (ingen
// N+1). En deal räknas som FLAT (täcker hela menyn) om den inte är scopad till
// kategori/produkt; annars SCOPED. dealCoversAll = FLAT-max är minst lika hög
// som SCOPED-max. BOGO/combo och mall-deals exkluderas (BOGO är inte procent).
const buildDealSummaries = async (restaurants: { id: string; brandId?: string | null }[]) => {
  const summaries = new Map<string, DealSummary>();
  if (restaurants.length === 0) return summaries;

  const now = new Date();
  const candidateDeals = await prisma.deal.findMany({
    where: {
      isActive: true,
      discountType: 'PERCENTAGE',
      isPersonalTemplate: false,
      isTemplate: false,
      triggerType: { notIn: ['BOGO_CATEGORY', 'COMBO'] },
      OR: [{ validFrom: null }, { validFrom: { lte: now } }],
      AND: [{ OR: [{ validUntil: null }, { validUntil: { gte: now } }] }],
    },
  });

  // Per-restaurang: [maxFlat, maxScoped]. Restaurang tas med här ovan i where,
  // men usage-cap-filtret (isDealAvailableNow) körs per deal i JS nedan.
  const perRestaurant = new Map<string, { maxFlat: number; maxScoped: number }>();
  for (const r of restaurants) perRestaurant.set(r.id, { maxFlat: 0, maxScoped: 0 });
  const brandById = new Map<string, string>();
  for (const r of restaurants) if (r.brandId) brandById.set(r.id, r.brandId);

  for (const deal of candidateDeals) {
    if (!isCustomerVisibleDeal(deal)) continue;
    if (!isDealAvailableNow(deal, now)) continue;

    const value = Number(deal.discountValue || 0);
    if (!(value > 0)) continue;

    // FLAT = ingen kategori-/produkt-scoping. SCOPED = riktad.
    const isScoped =
      (deal.triggerType && deal.triggerType !== 'NONE') ||
      !!deal.triggerCategoryId ||
      !!deal.rewardCategoryId ||
      parseDealProductIds(deal.comboProductIds).length > 0 ||
      parseDealProductIds(deal.bogoTriggerProductIds).length > 0 ||
      parseDealProductIds(deal.bogoRewardProductIds).length > 0;

    const applicableIds = parseApplicableRestaurantIds(deal.applicableRestaurantIds);
    const applicableSet = new Set(applicableIds);

    for (const r of restaurants) {
      const applies =
        deal.isGlobal === true ||
        deal.restaurantId === r.id ||
        applicableSet.has(r.id) ||
        (!!deal.brandId && brandById.get(r.id) === deal.brandId);
      if (!applies) continue;

      const bucket = perRestaurant.get(r.id)!;
      if (isScoped) bucket.maxScoped = Math.max(bucket.maxScoped, value);
      else bucket.maxFlat = Math.max(bucket.maxFlat, value);
    }
  }

  for (const [id, { maxFlat, maxScoped }] of perRestaurant) {
    const dealMaxPercent = Math.max(maxFlat, maxScoped);
    if (dealMaxPercent <= 0) continue;
    summaries.set(id, {
      dealMaxPercent,
      dealCoversAll: maxFlat > 0 && maxFlat >= maxScoped,
    });
  }

  return summaries;
};

// Seed data
router.post('/seed', authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.admin?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Endast superior admin kan seeda' });
    }

    // Palmyra (huvudrestaurang)
    await prisma.restaurant.upsert({
      where: { slug: 'palmyra' },
      update: {},
      create: {
        name: 'Palmyra Pizzeria',
        slug: 'palmyra',
        description: 'Lunds klassiker med pizza, kebab och rullar.',
        cuisine: 'Pizza & Kebab',
        address: 'Västra Mårtensgatan 10',
        city: 'Lund',
        zip: '223 51',
        phone: '046-120 612',
        imageUrl: '/hero.png',
        heroImageUrl: '/hero-palmyra.svg',
        deliveryFee: kr(39),
        minOrderAmount: kr(150),
        etaMinutes: 32,
        featuredClass: 1,
        tags: JSON.stringify(['Pizza', 'Kebab', 'Rullar']),
      },
    });

    await prisma.restaurant.upsert({
      where: { slug: 'sushi-nori' },
      update: {},
      create: {
        name: 'Sushi Lounge',
        slug: 'sushi-nori',
        description: 'Poké bowls, nigiri och varma rullar.',
        cuisine: 'Sushi',
        city: 'Lund',
        imageUrl: '/burger_new.jpg',
        heroImageUrl: '/hero.png',
        deliveryFee: kr(29),
        minOrderAmount: kr(150),
        etaMinutes: 28,
        rating: 4.8,
        ratingCount: 230,
        featuredClass: 1,
        tags: JSON.stringify(['Sushi', 'Poké', 'Japanskt']),
      },
    });

    await prisma.restaurant.upsert({
      where: { slug: 'kebabino' },
      update: {},
      create: {
        name: 'Kebab House',
        slug: 'kebabino',
        description: 'Durum, tallrikar och halal kebab.',
        cuisine: 'Kebab',
        city: 'Lund',
        imageUrl: '/kebab_new.png',
        heroImageUrl: '/hero.png',
        deliveryFee: kr(25),
        minOrderAmount: kr(140),
        etaMinutes: 24,
        rating: 4.5,
        ratingCount: 180,
        featuredClass: 2,
        tags: JSON.stringify(['Kebab', 'Halal', 'Durum']),
      },
    });

    res.json({ success: true, message: 'Restauranger seedade' });
  } catch (err: any) {
    console.error('Seed error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Public: list restaurants
router.get('/', async (req, res) => {
  try {
    const { withMenu, city } = req.query;

    // Utkast-restauranger (agent-onboarding) är osynliga publikt. Admins ser
    // dem. Admin-panelen kör cookie-auth (admin_token, HttpOnly) med Bearer
    // som legacy-fallback — läs cookien FÖRST, samma ordning som authenticate.
    let includeDrafts = false;
    const listAuthHeader = req.headers.authorization;
    const listCookieToken = (req as any).cookies?.admin_token as string | undefined;
    const listToken = listCookieToken
      || (listAuthHeader?.startsWith('Bearer ') ? listAuthHeader.split(' ')[1] : null);
    if (listToken) {
      try {
        includeDrafts = Boolean(await resolveAdminSessionFromToken(listToken));
      } catch {
        includeDrafts = false;
      }
    }

    // Cache 20s: the public restaurant list is identical for all anonymous
    // callers (home/search/discover share it); also caches the per-row
    // formatRestaurant CPU. Collapses the herd to one query+format per window.
    // Draft-synlighet är en egen cache-dimension så admin-svar aldrig läcker
    // till anonyma anrop.
    const loadRestaurants = async () => {
    const [restaurants, platformSettings] = await Promise.all([prisma.restaurant.findMany({
      where: {
        archivedAt: null,
        ...(city ? { city: city as string } : {}),
        ...(includeDrafts ? {} : { draft: false }),
      },
      include: {
        tagAssignments: {
          where: { tag: { isActive: true } },
          orderBy: { position: 'asc' },
          include: { tag: true },
        },
        ...(withMenu === '1' ? {
          categories: {
            orderBy: { position: 'asc' },
            include: {
              products: {
                where: { isActive: true },
                orderBy: { position: 'asc' },
                include: {
                  extraGroups: {
                    include: { extraGroup: { include: { extras: { orderBy: { position: 'asc' } } } } }
                  }
                }
              }
            }
          }
        } : {}),
        orders: {
          where: { status: { in: ['PENDING', 'ACCEPTED', 'COOKING', 'DELIVERING'] } },
          select: { id: true }
        },
        city_relation: {
          select: { ordersPaused: true, ordersPausedUntil: true, ordersPauseReason: true },
        },
      },
      orderBy: { featuredClass: 'asc' },
    }), prisma.restaurantSettings.findUnique({ where: { id: 'settings' } })]);

    const dealSummaries = await buildDealSummaries(restaurants);

    return restaurants.map(r => formatRestaurant(r, withMenu === '1', dealSummaries.get(r.id), {
      city: r.city_relation,
      platform: platformSettings,
    }));
    };

    // Admin reads must be authoritative. With more than one Railway replica,
    // an in-memory cache on replica B cannot be invalidated by a PATCH handled
    // on replica A. Serving admins uncached prevents a successful publish/draft
    // change from appearing to jump back for up to 20 seconds.
    const out = includeDrafts
      ? await loadRestaurants()
      : await cached('rest:list', `${withMenu === '1' ? 'menu' : 'lite'}|${(city as string) || ''}|d0`, 20_000, loadRestaurants);

    res.json(out);
  } catch (err) {
    res.status(500).json({ error: 'Kunde inte hämta restauranger' });
  }
});

router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    // MENU_AGENT ("Kocken") får skapa restauranger, men de blir ALLTID
    // utkast (draft=true, osynliga för kunder) och agenten kan inte skapa
    // login-konton (adminPassword strippas). Publicering görs av SUPER_ADMIN.
    const isMenuAgent = req.admin?.role === 'MENU_AGENT';
    if (req.admin?.role !== 'SUPER_ADMIN' && !isMenuAgent) {
      res.status(403).json({ error: 'Kräver super admin-behörighet' });
      return;
    }

    const payload = restaurantSchema.parse(req.body);
    if (isMenuAgent) {
      payload.draft = true;
      payload.adminPassword = undefined;
    }
    if (isMenuAgent && (
      payload.homeBoost !== undefined
      || payload.homeBoostStartsAt !== undefined
      || payload.homeBoostEndsAt !== undefined
    )) {
      res.status(403).json({ error: 'Endast super-admin kan sätta hemskärmsboost' });
      return;
    }
    const selectedTags = payload.tagIds === undefined ? null : await resolveTagSelection(payload.tagIds);
    const boostWindow = validateHomeBoostWindow(
      payload.homeBoostStartsAt,
      payload.homeBoostEndsAt,
      payload.homeBoost ?? 0,
    );
    const slug = slugify(payload.slug || payload.name);
    const openingHours = JSON.stringify(payload.openingHours ?? {});
    const acceptingOrdersMode: AcceptingOrdersMode = payload.acceptingOrdersMode ?? 'SCHEDULED';
    const legacyClosedForToday = payload.acceptingOrdersMode === undefined && payload.isOpen === false;
    const data: any = {
      name: payload.name,
      slug: slug,
      description: payload.description,
      cuisine: payload.cuisine,
      address: payload.address,
      city: payload.city,
      zip: payload.zip,
      phone: payload.phone,
      adminEmail: payload.adminEmail?.trim().toLowerCase() || undefined,
      imageUrl: payload.imageUrl,
      heroImageUrl: payload.heroImageUrl,
      etaMinutes: payload.etaMinutes !== undefined ? Number(payload.etaMinutes) : undefined,
      featuredClass: payload.featuredClass !== undefined
        ? Math.max(0, Math.min(3, Math.round(Number(payload.featuredClass))))
        : undefined,
      homeBoost: payload.homeBoost ?? 0,
      homeBoostStartsAt: boostWindow.start,
      homeBoostEndsAt: boostWindow.end,
      // isOpen remains a legacy projection only. New clients use the mode.
      isOpen: acceptingOrdersMode !== 'FORCE_CLOSED',
      scheduledOpenNow: isRestaurantOpen(openingHours),
      acceptingOrdersMode,
      acceptingOrdersOverrideUntil: payload.acceptingOrdersOverrideUntil
        ? new Date(payload.acceptingOrdersOverrideUntil)
        : null,
      acceptingOrdersOverrideReason: payload.acceptingOrdersOverrideReason ?? null,
      pausedUntil: payload.pausedUntil
        ? new Date(payload.pausedUntil)
        : legacyClosedForToday
          ? nextOpeningAfterToday(openingHours)
          : null,
      comingSoon: payload.comingSoon,
      draft: payload.draft ?? false,
      rating: payload.rating !== undefined ? Number(payload.rating) : undefined,
      ratingCount: payload.ratingCount !== undefined ? Number(payload.ratingCount) : undefined,
      deliveryFee: payload.deliveryFeeOre !== undefined
        ? parseOre(payload.deliveryFeeOre, 'deliveryFeeOre')
        : kr(Number(payload.deliveryFee ?? 0)),
      minOrderAmount: payload.minOrderAmountOre !== undefined
        ? parseOre(payload.minOrderAmountOre, 'minOrderAmountOre')
        : kr(Number(payload.minOrderAmount ?? 0)),
      tags: JSON.stringify(selectedTags ? selectedTags.map((tag) => tag.name) : payload.tags ?? []),
      tagAssignments: selectedTags
        ? {
            create: selectedTags.map((tag) => ({ tagId: tag.id, position: tag.position })),
          }
        : undefined,
      openingHours,
      internalInfo: payload.internalInfo,
      selfDelivery: payload.selfDelivery,
      commissionPctOverride: payload.commissionPctOverride == null
        ? payload.commissionPctOverride
        : payload.commissionPctOverride,
      tierGoldFeeOverride: payload.tierGoldFeeOverride !== undefined
        ? tierOverrideToOre(payload.tierGoldFeeOverride, 'tierGoldFeeOverride')
        : undefined,
      tierSilverFeeOverride: payload.tierSilverFeeOverride !== undefined
        ? tierOverrideToOre(payload.tierSilverFeeOverride, 'tierSilverFeeOverride')
        : undefined,
      tierStandardFeeOverride: payload.tierStandardFeeOverride !== undefined
        ? tierOverrideToOre(payload.tierStandardFeeOverride, 'tierStandardFeeOverride')
        : undefined,
    };
    if (payload.latitude !== undefined) data.latitude = payload.latitude === null ? null : Number(payload.latitude);
    if (payload.longitude !== undefined) data.longitude = payload.longitude === null ? null : Number(payload.longitude);
    if (payload.placeId !== undefined) data.placeId = payload.placeId || null;
    if (payload.freeDeliveryAboveOre !== undefined) {
      data.freeDeliveryAbove = payload.freeDeliveryAboveOre === null
        ? null
        : parseOre(payload.freeDeliveryAboveOre, 'freeDeliveryAboveOre');
    } else if (payload.freeDeliveryAbove !== undefined) {
      // Legacy restaurant form sends this particular field in SEK.
      data.freeDeliveryAbove = payload.freeDeliveryAbove === null || payload.freeDeliveryAbove === ''
        ? null
        : sekToOre(Number(payload.freeDeliveryAbove), 'freeDeliveryAbove');
    }
    if (payload.deliveryZones !== undefined) {
      const zonesRaw = safeParseAnyJson<any[]>(payload.deliveryZones, []);
      data.deliveryZones = JSON.stringify(normalizeDeliveryZones(zonesRaw, { strict: true }));
    }

    // Auto-resolve cityId från Google Places-stadnamn. Om payload.city kommer
    // från autocomplete (locality) → upsert City + bind via cityId. Hanterar
    // alias + parent-hierarki: "Arlöv" → returnerar Malmö-id om merged.
    if (payload.city) {
      try {
        const resolved = await resolveOrCreateCity(payload.city, {
          centerLat: data.latitude,
          centerLng: data.longitude,
        });
        data.cityId = resolved.id;
      } catch (e) {
        console.warn('[restaurants POST] cityResolver failed:', (e as Error).message);
      }
    }

    const createdRaw = await prisma.restaurant.create({
      data: {
        ...data,
      },
    });
    bustRestaurantCaches(createdRaw.slug); // new restaurant appears immediately

    // Create admin user for the new restaurant if password provided
    let adminCreated = false;
    if (payload.adminPassword && payload.adminPassword.trim().length > 0) {
      try {
        const hashedPassword = await bcrypt.hash(payload.adminPassword.trim(), 10);
        const adminEmail = (createdRaw.adminEmail || createdRaw.slug).toLowerCase();

        const adminUser = await upsertRestaurantAdminAccount({
          restaurantId: createdRaw.id,
          restaurantName: createdRaw.name,
          email: adminEmail,
          passwordHash: hashedPassword,
        });
        adminCreated = true;
        console.log(`✅ Admin account created/updated for restaurant "${createdRaw.name}" (login: ${adminEmail}, id: ${adminUser.id})`);
      } catch (adminErr: any) {
        console.error(`❌ Failed to create admin account for restaurant "${createdRaw.name}":`, adminErr.message);
      }
    } else {
      console.warn(`⚠️  Restaurant "${createdRaw.name}" created WITHOUT an admin password. No login account was created.`);
    }

    // Re-fetch med includes — samma mönster som PATCH, garanterar att svaret
    // har parsed JSON-fält och orders-relation för activeOrdersCount.
    const restaurant = await prisma.restaurant.findUniqueOrThrow({
      where: { id: createdRaw.id },
      include: {
        tagAssignments: {
          where: { tag: { isActive: true } },
          orderBy: { position: 'asc' },
          include: { tag: true },
        },
        orders: {
          where: { status: { in: ['PENDING', 'ACCEPTED', 'COOKING', 'DELIVERING'] } },
          select: { id: true },
        },
        city_relation: {
          select: { ordersPaused: true, ordersPausedUntil: true, ordersPauseReason: true },
        },
      },
    });
    const platformSettings = await prisma.restaurantSettings.findUnique({ where: { id: 'settings' } });
    res.status(201).json({
      ...formatRestaurant(restaurant, false, undefined, {
        city: restaurant.city_relation,
        platform: platformSettings,
      }),
      adminCreated,
    });
  } catch (err: any) {
    console.error('[restaurants POST] Error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id: paramId } = req.params;
    
    // Find the ACTUAL restaurant first to support slug OR id in the URL
    const existingRestaurant = await prisma.restaurant.findFirst({
      where: {
        archivedAt: null,
        OR: [
          { id: paramId },
          { slug: paramId }
        ]
      }
    });

    if (!existingRestaurant) {
      return res.status(404).json({ error: 'Restaurang hittades inte' });
    }

    const id = existingRestaurant.id;
    const requestedDraftChange = Object.prototype.hasOwnProperty.call(req.body || {}, 'draft')
      || Object.prototype.hasOwnProperty.call(req.body || {}, 'editing');

    if (req.admin?.role === 'MENU_AGENT') {
      // Menyagenten får starta editing-läge, och därefter ändra restaurangen.
      // Publicering/avslut av editing är superadmin-exklusivt.
      const wantsEditing = req.body?.editing === true || req.body?.draft === true;
      if (requestedDraftChange && !wantsEditing) {
        res.status(403).json({ error: 'Endast super-admin kan publicera eller avsluta editing.' });
        return;
      }
      if (!(existingRestaurant as any).draft && !wantsEditing) {
        res.status(403).json({ error: 'Menyagenten kan bara ändra restauranger i editing. Skicka editing=true först.' });
        return;
      }
    } else if (req.admin?.role !== 'SUPER_ADMIN') {
      if (requestedDraftChange) {
        res.status(403).json({ error: 'Endast super-admin kan ändra utkast/publicerad.' });
        return;
      }
      const rid = req.admin?.restaurantId;
      if (!rid || rid !== id) {
        res.status(403).json({ error: 'Du kan bara uppdatera din egen restaurang' });
        return;
      }
    }

    const payload = restaurantSchema.partial().parse(req.body);
    const canManageCatalogTags = req.admin?.role === 'SUPER_ADMIN' || req.admin?.role === 'MENU_AGENT';
    if (payload.tagIds !== undefined && !canManageCatalogTags) {
      res.status(403).json({ error: 'Endast plattformsadmin kan ändra restaurangtaggar' });
      return;
    }
    const hasBoostChange = payload.homeBoost !== undefined
      || payload.homeBoostStartsAt !== undefined
      || payload.homeBoostEndsAt !== undefined;
    if (hasBoostChange && req.admin?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Endast super-admin kan ändra hemskärmsboost' });
      return;
    }
    const selectedTags = payload.tagIds === undefined ? null : await resolveTagSelection(payload.tagIds);
    if (hasBoostChange) {
      const nextBoost = payload.homeBoost ?? existingRestaurant.homeBoost ?? 0;
      const nextStart = payload.homeBoostStartsAt === undefined
        ? existingRestaurant.homeBoostStartsAt?.toISOString() ?? null
        : payload.homeBoostStartsAt;
      const nextEnd = payload.homeBoostEndsAt === undefined
        ? existingRestaurant.homeBoostEndsAt?.toISOString() ?? null
        : payload.homeBoostEndsAt;
      validateHomeBoostWindow(nextStart, nextEnd, nextBoost);
    }
    if (req.admin?.role === 'MENU_AGENT') {
      // Agenten kan starta editing, men varken publicera (draft=false) eller skapa login-konton.
      if ((payload as any).editing === true) payload.draft = true;
      payload.draft = undefined;
      payload.adminPassword = undefined;
    }
    
    // Build update payload explicitly to avoid accidentally passing unsupported keys.
    const data: any = {};
    if (payload.name !== undefined) data.name = payload.name;
    if (payload.slug !== undefined) data.slug = slugify(payload.slug);
    if (payload.description !== undefined) data.description = payload.description;
    if (payload.cuisine !== undefined) data.cuisine = payload.cuisine;
    if (payload.address !== undefined) data.address = payload.address;
    if (payload.city !== undefined) data.city = payload.city;
    if (payload.zip !== undefined) data.zip = payload.zip;
    if (payload.phone !== undefined) data.phone = payload.phone;
    if ((payload as any).email !== undefined) data.email = (payload as any).email ? String((payload as any).email).trim().toLowerCase() : null;
    if ((payload as any).legalName !== undefined) data.legalName = (payload as any).legalName ? String((payload as any).legalName).trim() : null;
    if ((payload as any).organizationNumber !== undefined) data.organizationNumber = (payload as any).organizationNumber ? String((payload as any).organizationNumber).trim() : null;
    if (payload.adminEmail !== undefined) data.adminEmail = payload.adminEmail ? payload.adminEmail.trim().toLowerCase() : null;
    
    // Pictures
    if (payload.imageUrl !== undefined) data.imageUrl = payload.imageUrl;
    if (payload.heroImageUrl !== undefined) data.heroImageUrl = payload.heroImageUrl;
    if (payload.offersImageUrl !== undefined) data.offersImageUrl = payload.offersImageUrl || null;
    
    // Numbers - with safety against NaN
    const toSafeNum = (v: any) => {
      const n = Number(v);
      return isNaN(n) ? undefined : n;
    };
    const toRequiredNum = (v: unknown, field: string) => {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new TypeError(`${field} måste vara ett giltigt tal`);
      return n;
    };
    const safeStringify = (val: any) => {
      if (typeof val === 'string') return val;
      return JSON.stringify(val ?? {});
    };

    if (payload.etaMinutes !== undefined) data.etaMinutes = toSafeNum(payload.etaMinutes);
    // Manuell override: number = sätt nytt värde (clampat 25–55), null = rensa override
    if (payload.etaOverrideMinutes !== undefined) {
      if (payload.etaOverrideMinutes === null || payload.etaOverrideMinutes === '' || payload.etaOverrideMinutes === 0) {
        data.etaOverrideMinutes = null;
      } else {
        const n = toSafeNum(payload.etaOverrideMinutes);
        data.etaOverrideMinutes = n != null ? Math.max(25, Math.min(60, Math.round(n))) : null;
      }
    }
    if (payload.featuredClass !== undefined) {
      const featuredClass = toSafeNum(payload.featuredClass);
      data.featuredClass = featuredClass == null ? undefined : Math.max(0, Math.min(3, Math.round(featuredClass)));
    }
    if (payload.homeBoost !== undefined) data.homeBoost = Math.max(0, Math.min(100, payload.homeBoost));
    if (payload.homeBoostStartsAt !== undefined) {
      data.homeBoostStartsAt = payload.homeBoostStartsAt ? new Date(payload.homeBoostStartsAt) : null;
    }
    if (payload.homeBoostEndsAt !== undefined) {
      data.homeBoostEndsAt = payload.homeBoostEndsAt ? new Date(payload.homeBoostEndsAt) : null;
    }

    // Explicit mode is canonical. Legacy terminal `isOpen=false` means
    // "closed for today", not a permanent manual override. It returns to the
    // opening-hours schedule at the next configured opening.
    if (payload.acceptingOrdersMode !== undefined) {
      data.acceptingOrdersMode = payload.acceptingOrdersMode;
      data.isOpen = payload.acceptingOrdersMode !== 'FORCE_CLOSED';
    } else if (payload.isOpen !== undefined) {
      if (payload.isOpen === false) {
        // "Stäng för idag" är en stängning, inte en paus. Den skrivs därför som
        // ett tidsbegränsat FORCE_CLOSED som löper ut vid nästa öppning — då
        // öppnar restaurangen av sig själv igen. `pausedUntil` är reserverat för
        // korta avbrott mitt i öppettiden, som kunden ser som "Pausad".
        data.acceptingOrdersMode = 'FORCE_CLOSED';
        data.acceptingOrdersOverrideUntil = nextOpeningAfterToday(
          payload.openingHours !== undefined ? safeStringify(payload.openingHours) : existingRestaurant.openingHours,
        );
        data.acceptingOrdersOverrideReason = 'CLOSED_UNTIL_NEXT_OPENING';
        data.isOpen = false;
        data.pausedUntil = null;
      } else {
        data.acceptingOrdersMode = 'SCHEDULED';
        data.acceptingOrdersOverrideUntil = null;
        data.acceptingOrdersOverrideReason = null;
        data.isOpen = true;
        data.pausedUntil = null;
      }
    }
    if (payload.acceptingOrdersOverrideUntil !== undefined) {
      data.acceptingOrdersOverrideUntil = payload.acceptingOrdersOverrideUntil
        ? new Date(payload.acceptingOrdersOverrideUntil)
        : null;
    }
    if (payload.acceptingOrdersOverrideReason !== undefined) {
      data.acceptingOrdersOverrideReason = payload.acceptingOrdersOverrideReason?.trim() || null;
    }
    if (payload.comingSoon !== undefined) data.comingSoon = payload.comingSoon;
    if (req.admin?.role === 'MENU_AGENT' && (req.body?.editing === true || req.body?.draft === true)) {
      data.draft = true;
    }
    // Publicera/avpublicera editing är super admin-exklusivt.
    if (payload.draft !== undefined && req.admin?.role === 'SUPER_ADMIN') data.draft = payload.draft;
    if ((payload as any).editing !== undefined && req.admin?.role === 'SUPER_ADMIN') data.draft = Boolean((payload as any).editing);
    if (payload.rating !== undefined) data.rating = toSafeNum(payload.rating);
    if (payload.ratingCount !== undefined) data.ratingCount = toSafeNum(payload.ratingCount);
    
    if (payload.deliveryFeeOre !== undefined) {
      data.deliveryFee = parseOre(payload.deliveryFeeOre, 'deliveryFeeOre');
    } else if (payload.deliveryFee !== undefined) {
      data.deliveryFee = sekToOre(toRequiredNum(payload.deliveryFee, 'deliveryFee'), 'deliveryFee');
    }
    if (payload.minOrderAmountOre !== undefined) {
      data.minOrderAmount = parseOre(payload.minOrderAmountOre, 'minOrderAmountOre');
    } else if (payload.minOrderAmount !== undefined) {
      data.minOrderAmount = sekToOre(toRequiredNum(payload.minOrderAmount, 'minOrderAmount'), 'minOrderAmount');
    }
    
    // JSON fields - ensure they aren't double-stringified
    if (selectedTags) {
      data.tags = JSON.stringify(selectedTags.map((tag) => tag.name));
      data.tagAssignments = {
        deleteMany: {},
        create: selectedTags.map((tag) => ({ tagId: tag.id, position: tag.position })),
      };
    } else if (payload.tags !== undefined) {
      // Legacy-klienter får fortsätta skriva den gamla projektionen. Nya
      // adminpanelen skickar alltid tagIds och går genom katalogvalideringen.
      data.tags = safeStringify(payload.tags);
    }
    if (payload.openingHours !== undefined) data.openingHours = safeStringify(payload.openingHours);
    if (payload.internalInfo !== undefined) data.internalInfo = payload.internalInfo;
    
    if (payload.latitude !== undefined) data.latitude = payload.latitude === null ? null : toSafeNum(payload.latitude);
    if (payload.longitude !== undefined) data.longitude = payload.longitude === null ? null : toSafeNum(payload.longitude);
    if (payload.placeId !== undefined) data.placeId = payload.placeId || null;
    // Auto-resolve cityId vid PATCH samma sätt som POST. Sker bara om
    // payload.city skickas (admin ändrade adress via Google Places).
    if (payload.city) {
      try {
        const resolved = await resolveOrCreateCity(payload.city, {
          centerLat: toSafeNum(payload.latitude) ?? existingRestaurant.latitude ?? undefined,
          centerLng: toSafeNum(payload.longitude) ?? existingRestaurant.longitude ?? undefined,
        });
        data.cityId = resolved.id;
      } catch (e) {
        console.warn('[restaurants PATCH] cityResolver failed:', (e as Error).message);
      }
    }
    if (payload.deliveryRadius !== undefined) data.deliveryRadius = toSafeNum(payload.deliveryRadius);
    
    if (payload.freeDeliveryAboveOre !== undefined) {
      data.freeDeliveryAbove = payload.freeDeliveryAboveOre === null
        ? null
        : parseOre(payload.freeDeliveryAboveOre, 'freeDeliveryAboveOre');
    } else if (payload.freeDeliveryAbove !== undefined) {
      data.freeDeliveryAbove = payload.freeDeliveryAbove === null || payload.freeDeliveryAbove === ''
        ? null
        : sekToOre(toRequiredNum(payload.freeDeliveryAbove, 'freeDeliveryAbove'), 'freeDeliveryAbove');
    }

    if (payload.logoutCode !== undefined) data.logoutCode = payload.logoutCode || null;
    if (payload.announcementText !== undefined) data.announcementText = payload.announcementText || null;
    if (payload.vatPercent !== undefined) data.vatPercent = payload.vatPercent ?? null;
    if ((payload as any).selfDelivery !== undefined) data.selfDelivery = Boolean((payload as any).selfDelivery);
    if ((payload as any).commissionPctOverride !== undefined) {
      const v = (payload as any).commissionPctOverride;
      data.commissionPctOverride = v === null ? null : Number(v);
    }
    if ((payload as any).tierGoldFeeOverride !== undefined) {
      data.tierGoldFeeOverride = tierOverrideToOre((payload as any).tierGoldFeeOverride, 'tierGoldFeeOverride');
    }
    if ((payload as any).tierSilverFeeOverride !== undefined) {
      data.tierSilverFeeOverride = tierOverrideToOre((payload as any).tierSilverFeeOverride, 'tierSilverFeeOverride');
    }
    if ((payload as any).tierStandardFeeOverride !== undefined) {
      data.tierStandardFeeOverride = tierOverrideToOre((payload as any).tierStandardFeeOverride, 'tierStandardFeeOverride');
    }

    // Pause: pausedUntil = ISO datum eller null. Avbruten pause = null.
    if (payload.pausedUntil !== undefined) {
      data.pausedUntil = payload.pausedUntil ? new Date(payload.pausedUntil) : null;
    }

    if (payload.deliveryZones !== undefined) {
      const incomingZones = safeParseAnyJson<any[]>(payload.deliveryZones, []);
      // Merge: behåll calculatedEtaMinutes + etaSampleCount från DB:n så
      // admin's spara INTE resettar auto-räkningen. Admin styr bara geometri,
      // fee, minOrder, etaMinutes (manuell kickstart), isActive, name, color.
      // Allt annat ärvs från befintlig data per zon-id.
      const existingZonesRaw = safeParseAnyJson<any[]>(existingRestaurant.deliveryZones, []);
      const existingById = new Map<string, any>();
      for (const ez of existingZonesRaw) {
        if (ez && typeof ez === 'object' && ez.id) existingById.set(String(ez.id), ez);
      }
      const merged = incomingZones.map((z: any) => {
        const prior = z && z.id ? existingById.get(String(z.id)) : null;
        if (!prior) return z;
        return {
          ...z,
          calculatedEtaMinutes: prior.calculatedEtaMinutes ?? null,
          etaSampleCount: prior.etaSampleCount ?? 0,
        };
      });
      data.deliveryZones = JSON.stringify(normalizeDeliveryZones(merged, { strict: true }));
    }

    // Watchdog owns scheduledOpenNow, but updating opening hours should expose
    // the new projection immediately without touching a manual override.
    if (payload.openingHours !== undefined) {
      data.scheduledOpenNow = isRestaurantOpen(data.openingHours as string);
    }

    const previousAdminLogin =
      (existingRestaurant.adminEmail || existingRestaurant.slug).toLowerCase();

    await prisma.restaurant.update({
      where: { id },
      data,
    });

    // R2/DB-synk vid slug- eller stadsbyte. Object keys byggs på
    // `{stad}/{restaurang}/…` och de fulla URL:erna cachas i DB. Utan detta
    // blir bilderna orphans på gamla pathen (och en ny uppladdning hamnar på
    // nya → två uppsättningar bilder i R2). Flytta objekten + skriv om varje
    // sparad URL. Best-effort, aldrig blockerande, körs före re-fetchen nedan
    // så svaret bär de nya URL:erna.
    const slugChanged = typeof data.slug === 'string' && data.slug !== existingRestaurant.slug;
    const cityChanged = typeof data.cityId === 'string' && data.cityId !== existingRestaurant.cityId;
    if (slugChanged || cityChanged) {
      try {
        const resolveCitySlug = async (cityId: string | null, legacyCity: string | null): Promise<string> => {
          const city = cityId
            ? await prisma.city.findUnique({ where: { id: cityId }, select: { slug: true, name: true } })
            : null;
          return city?.slug || slugifyPathSegment(city?.name || legacyCity || 'global');
        };
        const oldCitySlug = await resolveCitySlug(existingRestaurant.cityId, existingRestaurant.city);
        const newCityId = (data.cityId as string | undefined) ?? existingRestaurant.cityId;
        const newSlug = (data.slug as string | undefined) ?? existingRestaurant.slug;
        const newCitySlug = await resolveCitySlug(newCityId, (data.city as string | undefined) ?? existingRestaurant.city);
        const oldPrefix = `${oldCitySlug}/${existingRestaurant.slug}/`;
        const newPrefix = `${newCitySlug}/${newSlug}/`;
        const sync = await syncRestaurantImagePrefix({ restaurantId: id, oldPrefix, newPrefix });
        if (sync.ran) {
          console.log(`[restaurants PATCH] R2-prefix synk ${oldPrefix} → ${newPrefix}: ${sync.objectsMoved} objekt flyttade, ${sync.urlsRewritten} URL:er omskrivna${sync.objectsFailed ? `, ${sync.objectsFailed} misslyckades` : ''}`);
          menuCacheBust(id);
        }
      } catch (e: any) {
        console.warn('[restaurants PATCH] R2-prefix-synk misslyckades:', e?.message || e);
      }
    }

    // Hermes/WhatsApp: notifiera när restaurangen pausar / förlänger pausen.
    // Bara när pausedUntil faktiskt sätts till ett framtida datum (inte vid
    // avbruten paus eller oförändrat värde). Best-effort, aldrig blockerande.
    if (payload.pausedUntil !== undefined && data.pausedUntil instanceof Date) {
      const newPaused = data.pausedUntil as Date;
      const oldPaused = existingRestaurant.pausedUntil ? new Date(existingRestaurant.pausedUntil) : null;
      const changed = !oldPaused || oldPaused.getTime() !== newPaused.getTime();
      if (newPaused.getTime() > Date.now() && changed) {
        void import('../lib/restaurantWatch')
          .then(({ alertRestaurantPause }) =>
            alertRestaurantPause({
              restaurantId: id,
              restaurantName: existingRestaurant.name,
              previousPausedUntil: oldPaused,
              newPausedUntil: newPaused,
            }),
          )
          .catch((err) => console.warn('[restaurants PATCH] pause alert failed:', err?.message ?? err));
      }
    }

    // Re-fetch med includes så svaret har EXAKT samma format som GET /:slug.
    // Tidigare använde vi rå-resultatet från update() — det saknade relations
    // (orders) och hade JSON-fält som strängar, vilket fick admin-formens
    // parseHoursFromDetail att falla tillbaka till "11:00"-default.
    const restaurant = await prisma.restaurant.findUniqueOrThrow({
      where: { id },
      include: {
        tagAssignments: {
          where: { tag: { isActive: true } },
          orderBy: { position: 'asc' },
          include: { tag: true },
        },
        orders: {
          where: { status: { in: ['PENDING', 'ACCEPTED', 'COOKING', 'DELIVERING'] } },
          select: { id: true },
        },
        city_relation: {
          select: { ordersPaused: true, ordersPausedUntil: true, ordersPauseReason: true },
        },
      },
    });

    // Purga kund-webbens SSR-cache så ny hero/profilbild/profil syns direkt på
    // restaurang-info-sidan (annars stale i upp till 1h pga revalidate: 3600).
    void revalidateWebRestaurant(restaurant.slug);

    const nextAdminLogin = (restaurant.adminEmail || restaurant.slug).toLowerCase();

    if (previousAdminLogin !== nextAdminLogin) {
      try {
        await prisma.adminUser.updateMany({
          where: {
            ...(existingRestaurant.adminUserId
              ? { id: existingRestaurant.adminUserId }
              : { email: previousAdminLogin }),
            role: { in: ['ADMIN', 'RESTAURANT_ADMIN', 'STAFF'] },
          },
          data: {
            email: nextAdminLogin,
            name: `${restaurant.name} Admin`,
          },
        });
      } catch (adminSyncError: any) {
        console.error(`[restaurants PATCH] Failed to sync admin alias for ${restaurant.name}:`, adminSyncError.message);
      }
    }

    // Handle admin password update if provided
    if (payload.adminPassword && payload.adminPassword.trim().length > 0) {
      try {
        const hashedPassword = await bcrypt.hash(payload.adminPassword.trim(), 10);
        const adminEmail = (restaurant.adminEmail || restaurant.slug).toLowerCase();
        const adminUser = await upsertRestaurantAdminAccount({
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          email: adminEmail,
          passwordHash: hashedPassword,
        });
        console.log(`✅ Admin password updated for "${restaurant.name}" (login: ${adminEmail}, id: ${adminUser.id})`);
      } catch (adminErr: any) {
        console.error(`❌ Failed to update admin password for "${restaurant.name}":`, adminErr.message);
      }
    }

    const platformSettings = await prisma.restaurantSettings.findUnique({ where: { id: 'settings' } });
    const availability = resolveRestaurantAvailability(restaurant, {
      city: restaurant.city_relation,
      platform: platformSettings,
    });

    // Legacy pause fields remain in the event payload for old web/Swift builds.
    const pausedUntilDate = restaurant.pausedUntil
      ? new Date(restaurant.pausedUntil)
      : null;
    const isPaused = availability.restaurantPaused;

    // Emit per-restaurant socket event + global event (for Hero/Navbar)
    getIO().emit('settings:updated', {
      restaurantId: restaurant.id,
      slug: restaurant.slug,
      isOpen: availability.isOpen,
      manualIsOpen: availability.legacyManualIsOpen,
      scheduledOpenNow: availability.scheduledOpenNow,
      acceptingOrdersMode: availability.configuredMode,
      availabilityReason: availability.reason,
      pausedUntil: pausedUntilDate?.toISOString() ?? null,
      isPaused,
      deliveryFee: fromOre(restaurant.deliveryFee),
      minOrderAmount: fromOre(restaurant.minOrderAmount),
      etaMinutes: restaurant.etaMinutes,
      // Levereras maten av plattformen eller restaurangen själv? Flutter-
      // order-appen byter förvald tillagningstid + knapp-etikett LIVE på detta.
      selfDelivery: restaurant.selfDelivery ?? false,
    });

    // Edit shows immediately: bust the API caches that embed this restaurant
    // (list, detail, zone-check, cities). Open customer pages also update live
    // via the settings:updated socket above.
    bustRestaurantCaches(restaurant.slug);
    // The detail route (GET /:slug) caches under whatever identifier the client
    // passed — admin fetches by id, customers by slug. bustRestaurantCaches only
    // clears the slug key, so also drop the id-keyed entries (both the canonical
    // id and the raw param) or the admin form re-reads stale data within the 15s
    // TTL and can silently overwrite fresh fields (e.g. legalName) back to null.
    bustCache('rest:detail', restaurant.id);
    bustCache('rest:detail', paramId);
    // Meny-cachen (in-memory, /menu/categories) bakar in restaurangens
    // offersImageUrl i den virtuella "Erbjudanden"-tilen → busta den så en ny
    // erbjudande-bild syns direkt i stället för efter TTL:en.
    try { menuCacheBust(restaurant.id); } catch { /* noop */ }

    // Returnera via formatRestaurant — JSON-strängifierade fält (openingHours,
    // deliveryZones, tags) blir parsade objekt så admin-form kan repopulera
    // utan glitch. Tidigare gick raw Prisma-objekt direkt vilket gjorde att
    // dropdown-tider defaultade till "11:00".
    res.json(formatRestaurant(restaurant, false, undefined, {
      city: restaurant.city_relation,
      platform: platformSettings,
    }));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/permanent-delete', authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.admin?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Kräver super admin-behörighet' });
      return;
    }

    const restaurantId = req.params.id;
    const confirmationName = typeof req.body?.confirmationName === 'string' ? req.body.confirmationName : '';
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        slug: true,
        city: true,
        imageUrl: true,
        heroImageUrl: true,
        offersImageUrl: true,
        adminUserId: true,
        city_relation: { select: { slug: true, name: true } },
      },
    });

    if (!restaurant) {
      res.status(404).json({ error: 'Restaurang hittades inte' });
      return;
    }
    if (confirmationName !== restaurant.name) {
      res.status(400).json({ error: `Skriv restaurangens namn exakt: ${restaurant.name}` });
      return;
    }

    const [orderCount, payoutCount] = await Promise.all([
      prisma.order.count({ where: { restaurantId } }),
      prisma.restaurantPayout.count({ where: { restaurantId } }),
    ]);
    if (orderCount > 0 || payoutCount > 0) {
      res.status(409).json({
        error: 'Restaurangen har order- eller utbetalningshistorik och kan inte hårdraderas utan att förstöra ekonomiunderlag. Arkivera den istället.',
        blockers: { orders: orderCount, payouts: payoutCount },
      });
      return;
    }

    const r2Configured = r2Enabled();
    const citySlug = slugifyPathSegment(restaurant.city_relation?.slug || restaurant.city_relation?.name || restaurant.city || 'global') || 'global';
    const restaurantSlug = slugifyPathSegment(restaurant.slug || restaurant.name || restaurant.id) || restaurant.id;
    const r2Prefix = `${citySlug}/${restaurantSlug}/`;
    const explicitR2Keys = new Set<string>();
    const addR2Url = (url: string | null | undefined) => {
      if (!r2Configured || !url) return;
      const key = r2UrlToKey(url);
      if (key) explicitR2Keys.add(key);
    };

    if (r2Configured) {
      addR2Url(restaurant.imageUrl);
      addR2Url(restaurant.heroImageUrl);
      addR2Url(restaurant.offersImageUrl);
      const [categories, products, extras, deals] = await Promise.all([
        prisma.category.findMany({ where: { restaurantId }, select: { imageUrl: true } }),
        prisma.product.findMany({
          where: { category: { restaurantId } },
          select: { imageUrl: true, discountImageUrl: true },
        }),
        prisma.extra.findMany({
          where: { extraGroup: { restaurantId } },
          select: { imageUrl: true },
        }),
        prisma.deal.findMany({ where: { restaurantId }, select: { imageUrl: true } }),
      ]);
      for (const category of categories) addR2Url(category.imageUrl);
      for (const product of products) {
        addR2Url(product.imageUrl);
        addR2Url(product.discountImageUrl);
      }
      for (const extra of extras) addR2Url(extra.imageUrl);
      for (const deal of deals) addR2Url(deal.imageUrl);
    }

    const database = await prisma.$transaction(async (tx) => {
      const categoryRows = await tx.category.findMany({ where: { restaurantId }, select: { id: true } });
      const categoryIds = categoryRows.map((category) => category.id);
      const productRows = categoryIds.length
        ? await tx.product.findMany({ where: { categoryId: { in: categoryIds } }, select: { id: true } })
        : [];
      const productIds = productRows.map((product) => product.id);
      const extraGroupRows = await tx.extraGroup.findMany({ where: { restaurantId }, select: { id: true } });
      const extraGroupIds = extraGroupRows.map((group) => group.id);
      const extraRows = extraGroupIds.length
        ? await tx.extra.findMany({ where: { extraGroupId: { in: extraGroupIds } }, select: { id: true } })
        : [];
      const directDealRows = await tx.deal.findMany({ where: { restaurantId }, select: { id: true } });
      const directDealIds = directDealRows.map((deal) => deal.id);
      const directDealIdSet = new Set(directDealIds);

      const scopedDeals = await tx.deal.findMany({
        where: { applicableRestaurantIds: { contains: restaurantId } },
        select: { id: true, restaurantId: true, applicableRestaurantIds: true },
      });
      let dealReferencesRemoved = 0;
      for (const deal of scopedDeals) {
        if (deal.restaurantId === restaurantId) continue;
        const next = removeStringFromJsonArray(deal.applicableRestaurantIds, restaurantId);
        if (!next.removed) continue;
        await tx.deal.update({ where: { id: deal.id }, data: { applicableRestaurantIds: next.json } });
        dealReferencesRemoved += 1;
      }

      const discountCodes = await tx.discountCode.findMany({
        where: { applicableRestaurantIds: { contains: restaurantId } },
        select: { id: true, restaurantId: true, applicableRestaurantIds: true },
      });
      let discountCodeReferencesRemoved = 0;
      for (const discountCode of discountCodes) {
        if (discountCode.restaurantId === restaurantId) continue;
        const next = removeStringFromJsonArray(discountCode.applicableRestaurantIds, restaurantId);
        if (!next.removed) continue;
        await tx.discountCode.update({ where: { id: discountCode.id }, data: { applicableRestaurantIds: next.json } });
        discountCodeReferencesRemoved += 1;
      }

      const homeSections = await tx.homeCategorySection.findMany({
        where: { manualRestaurantIds: { contains: restaurantId } },
        select: { id: true, manualRestaurantIds: true },
      });
      let homeSectionsDetached = 0;
      for (const section of homeSections) {
        const next = removeStringFromJsonArray(section.manualRestaurantIds, restaurantId);
        if (!next.removed) continue;
        await tx.homeCategorySection.update({ where: { id: section.id }, data: { manualRestaurantIds: next.json } });
        homeSectionsDetached += 1;
      }

      let settingsDealReferencesCleared = 0;
      if (directDealIds.length) {
        const settingsRows = await tx.restaurantSettings.findMany({
          select: {
            id: true,
            welcomeDealId: true,
            referralDealId: true,
            referralInviteeDealId: true,
            referralInviterDealId: true,
          },
        });
        for (const settings of settingsRows) {
          const patch: any = {};
          for (const field of ['welcomeDealId', 'referralDealId', 'referralInviteeDealId', 'referralInviterDealId'] as const) {
            const current = settings[field];
            if (current && directDealIdSet.has(current)) {
              patch[field] = null;
              settingsDealReferencesCleared += 1;
            }
          }
          if (Object.keys(patch).length > 0) {
            await tx.restaurantSettings.update({ where: { id: settings.id }, data: patch });
          }
        }
      }

      const orderDrafts = await tx.orderDraft.deleteMany({ where: { data: { contains: restaurantId } } });
      const notes = await tx.note.deleteMany({ where: { restaurantId } });
      const pairingCodes = await tx.devicePairingCode.deleteMany({ where: { restaurantId } });
      const devices = await tx.restaurantDevice.deleteMany({ where: { restaurantId } });
      const terminalBenchmarks = await (tx as any).terminalDeviceBenchmark?.deleteMany?.({ where: { restaurantId } }) ?? { count: 0 };
      const printers = await tx.restaurantPrinter.deleteMany({ where: { restaurantId } });
      const groupOrders = await tx.groupOrder.deleteMany({ where: { restaurantId } });
      const dealCampaignsDetached = await tx.dealCampaign.updateMany({ where: { restaurantId }, data: { restaurantId: null } });
      const brandMastersDetached = await tx.brand.updateMany({ where: { masterRestaurantId: restaurantId }, data: { masterRestaurantId: null } });
      const discountCodesDeleted = await tx.discountCode.deleteMany({ where: { restaurantId } });

      let productExtraLinks = 0;
      const productExtraGroupFilters = [
        ...(productIds.length ? [{ productId: { in: productIds } }] : []),
        ...(extraGroupIds.length ? [{ extraGroupId: { in: extraGroupIds } }] : []),
      ];
      if (productExtraGroupFilters.length > 0) {
        const deleted = await tx.productExtraGroup.deleteMany({ where: { OR: productExtraGroupFilters } });
        productExtraLinks = deleted.count;
      }

      const extrasDeleted = extraGroupIds.length
        ? await tx.extra.deleteMany({ where: { extraGroupId: { in: extraGroupIds } } })
        : { count: 0 };
      const extraGroupsDeleted = await tx.extraGroup.deleteMany({ where: { restaurantId } });
      const productsDeleted = productIds.length
        ? await tx.product.deleteMany({ where: { id: { in: productIds } } })
        : { count: 0 };
      const categoriesDeleted = await tx.category.deleteMany({ where: { restaurantId } });
      const dealsDeleted = await tx.deal.deleteMany({ where: { restaurantId } });
      const adminUsersDeleted = restaurant.adminUserId
        ? await tx.adminUser.deleteMany({
            where: { id: restaurant.adminUserId, role: { in: ['ADMIN', 'RESTAURANT_ADMIN', 'STAFF'] } },
          })
        : { count: 0 };

      await tx.restaurant.delete({ where: { id: restaurantId } });

      return {
        categories: categoriesDeleted.count,
        products: productsDeleted.count,
        extraGroups: extraGroupsDeleted.count,
        extras: extrasDeleted.count,
        productExtraLinks,
        deals: dealsDeleted.count,
        dealReferencesRemoved,
        discountCodes: discountCodesDeleted.count,
        discountCodeReferencesRemoved,
        dealCampaignsDetached: dealCampaignsDetached.count,
        homeSectionsDetached,
        brandMastersDetached: brandMastersDetached.count,
        groupOrders: groupOrders.count,
        orderDrafts: orderDrafts.count,
        notes: notes.count,
        devices: devices.count,
        terminalBenchmarks: terminalBenchmarks.count,
        pairingCodes: pairingCodes.count,
        printers: printers.count,
        adminUsers: adminUsersDeleted.count,
        settingsDealReferencesCleared,
      };
    });

    const r2 = {
      configured: r2Configured,
      prefix: r2Prefix,
      deleted: 0,
      failed: [] as Array<{ key: string; error: string }>,
      skipped: !r2Configured,
    };

    if (r2Configured) {
      const r2Keys = new Set(explicitR2Keys);
      try {
        const prefixedObjects = await listR2(r2Prefix, 5000);
        for (const object of prefixedObjects) r2Keys.add(object.key);
      } catch (error: any) {
        r2.failed.push({ key: `${r2Prefix}*`, error: error?.message || String(error) });
      }
      for (const key of r2Keys) {
        try {
          await deleteFromR2(key);
          r2.deleted += 1;
        } catch (error: any) {
          r2.failed.push({ key, error: error?.message || String(error) });
        }
      }
    }

    await audit(req, 'RESTAURANT_PERMANENT_DELETE', {
      resourceType: 'Restaurant',
      resourceId: restaurantId,
      changes: {
        name: restaurant.name,
        slug: restaurant.slug,
        database,
        r2: { configured: r2.configured, prefix: r2.prefix, deleted: r2.deleted, failed: r2.failed.length },
      },
    });

    bustRestaurantCaches(restaurant.slug);
    bustCache('rest:detail', restaurant.id);
    try { menuCacheBust(restaurantId); } catch { /* noop */ }
    void revalidateWebRestaurant(restaurant.slug);
    getIO().emit('settings:updated', {
      restaurantId,
      slug: restaurant.slug,
      deleted: true,
      draft: true,
      archived: true,
      availabilityReason: 'DELETED',
    });

    res.json({ success: true, deleted: true, restaurantId, database, r2 });
  } catch (err) {
    console.error('[restaurants permanent-delete] failed:', err);
    res.status(500).json({ error: 'Kunde inte radera restaurang permanent' });
  }
});

router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.admin?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Kräver super admin-behörighet' });
      return;
    }

    const restaurantId = req.params.id;
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, slug: true, archivedAt: true, adminUserId: true },
    });
    if (!restaurant) {
      res.status(404).json({ error: 'Restaurang hittades inte' });
      return;
    }
    if (restaurant.archivedAt) {
      res.json({ success: true, archived: true });
      return;
    }

    // Do not hide a restaurant while a paid or potentially completing order
    // is live. AWAITING_PAYMENT is included because a delayed PSP webhook can
    // still promote it to a paid order.
    const activeOrderStatuses = [
      'AWAITING_PAYMENT', 'PENDING', 'ACCEPTED', 'PREPARING', 'COOKING',
      'READY', 'DELIVERING', 'OUT_FOR_DELIVERY',
    ];
    const activeOrders = await prisma.order.count({
      where: { restaurantId, status: { in: activeOrderStatuses } },
    });
    if (activeOrders > 0) {
      res.status(409).json({
        error: `Restaurangen har ${activeOrders} pågående order. Avsluta eller avbryt dem innan arkivering.`,
        activeOrders,
      });
      return;
    }

    const archivedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.restaurant.update({
        where: { id: restaurantId },
        data: {
          archivedAt,
          draft: true,
          comingSoon: false,
          acceptingOrdersMode: 'FORCE_CLOSED',
          acceptingOrdersOverrideUntil: null,
          acceptingOrdersOverrideReason: 'Restaurangen är arkiverad',
          scheduledOpenNow: false,
          isOpen: false,
          pausedUntil: null,
        },
      });
      await tx.deal.updateMany({ where: { restaurantId }, data: { isActive: false } });
      await tx.restaurantDevice.updateMany({
        where: { restaurantId },
        data: { revoked: true, refreshTokenHash: null, pushToken: null },
      });
      await tx.devicePairingCode.deleteMany({ where: { restaurantId } });
      await tx.groupOrder.updateMany({
        where: { restaurantId, status: { in: ['OPEN', 'LOCKED'] } },
        data: { status: 'CANCELLED' },
      });
      if (restaurant.adminUserId) {
        await tx.adminUser.updateMany({
          where: { id: restaurant.adminUserId, role: { in: ['ADMIN', 'RESTAURANT_ADMIN', 'STAFF'] } },
          data: { isActive: false, tokenVersion: { increment: 1 } },
        });
      }
    });

    await audit(req, 'RESTAURANT_ARCHIVE', {
      resourceType: 'Restaurant',
      resourceId: restaurantId,
      changes: { name: restaurant.name, slug: restaurant.slug, archivedAt: archivedAt.toISOString() },
    });
    bustRestaurantCaches(restaurant.slug);
    try { menuCacheBust(restaurantId); } catch { /* noop */ }
    void revalidateWebRestaurant(restaurant.slug);
    getIO().emit('settings:updated', {
      restaurantId,
      slug: restaurant.slug,
      isOpen: false,
      draft: true,
      archived: true,
      availabilityReason: 'ARCHIVED',
    });
    res.json({ success: true, archived: true });
  } catch (err) {
    console.error('[restaurants DELETE] archive failed:', err);
    res.status(500).json({ error: 'Kunde inte arkivera restaurang' });
  }
});

// Category/Item management (Admin)
router.post('/:restaurantId/categories', authenticate, async (req: AuthRequest, res) => {
  try {
    const { name, description } = req.body;
    const { restaurantId } = req.params;
    if (req.admin?.role !== 'SUPER_ADMIN') {
      const rid = req.admin?.restaurantId;
      if (!rid || rid !== restaurantId) {
        res.status(403).json({ error: 'Du kan bara skapa kategorier för din egen restaurang' });
        return;
      }
    }
    const category = await prisma.category.create({
      data: {
        name,
        description,
        slug: slugify(name) + '-' + Math.random().toString(36).substring(7),
        restaurantId,
      },
    });
    res.status(201).json(category);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:restaurantId/items', authenticate, async (req: AuthRequest, res) => {
  try {
    const { categoryId, name, description, price } = req.body;
    const { restaurantId } = req.params;

    if (req.admin?.role !== 'SUPER_ADMIN') {
      const rid = req.admin?.restaurantId;
      if (!rid || rid !== restaurantId) {
        res.status(403).json({ error: 'Du kan bara skapa produkter för din egen restaurang' });
        return;
      }
    }

    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, restaurantId: true },
    });

    if (!category || category.restaurantId !== restaurantId) {
      res.status(400).json({ error: 'Ogiltig kategori för vald restaurang' });
      return;
    }

    const item = await prisma.product.create({
      data: {
        categoryId,
        name,
        description,
        slug: slugify(name) + '-' + Math.random().toString(36).substring(7),
        price: kr(price),
      },
    });
    res.status(201).json(item);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Public: restaurant detail
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    // Resolve admin auth before choosing the cache path. Invalid arbitrary
    // Bearer headers must not become a way to bypass the public read cache.
    const authHeader = req.headers.authorization;
    const cookieToken = (req as any).cookies?.admin_token as string | undefined;
    const token = cookieToken
      || (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);
    let adminSession: Awaited<ReturnType<typeof resolveAdminSessionFromToken>> | null = null;
    if (token) {
      try {
        adminSession = await resolveAdminSessionFromToken(token);
      } catch {
        adminSession = null;
      }
    }

    // Cache the expensive part (restaurant + deep category/product/extras include
    // + formatRestaurant) 15s per slug. This is the same heavy query as the menu
    // route and the checkout flow hits it per request — caching collapses the herd.
    // The admin-only fields are kept in the cached object but only EXPOSED below
    // after the per-request auth check, so caching never leaks them.
    const loadRestaurantDetail = async () => {
      const [restaurant, platformSettings] = await Promise.all([prisma.restaurant.findFirst({
        where: {
          archivedAt: null,
          OR: [
            { slug },
            { id: slug }
          ]
        },
        include: {
          tagAssignments: {
            where: { tag: { isActive: true } },
            orderBy: { position: 'asc' },
            include: { tag: true },
          },
          city_relation: {
            select: { ordersPaused: true, ordersPausedUntil: true, ordersPauseReason: true },
          },
        },
      }), prisma.restaurantSettings.findUnique({ where: { id: 'settings' } })]);

      if (!restaurant) return null;

      // Explicitly fetch categories using the same unified logic as the admin/app
      const categories = await prisma.category.findMany({
        where: { restaurantId: restaurant.id, isActive: true },
        orderBy: { position: 'asc' },
        include: {
          products: {
            where: { isActive: true },
            orderBy: { position: 'asc' },
            include: {
              extraGroups: {
                where: { extraGroup: { restaurantId: restaurant.id } },
                include: {
                  extraGroup: {
                    include: {
                      extras: {
                        where: { isActive: true },
                        orderBy: { position: 'asc' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const restaurantWithMenu = { ...restaurant, categories };
      return {
        formatted: formatRestaurant(restaurantWithMenu, true, undefined, {
          city: restaurant.city_relation,
          platform: platformSettings,
        }),
        restaurantId: restaurant.id,
        adminEmail: restaurant.adminEmail ?? null,
        logoutCode: restaurant.logoutCode ?? null,
        homeBoost: restaurant.homeBoost ?? 0,
        homeBoostStartsAt: restaurant.homeBoostStartsAt?.toISOString() ?? null,
        homeBoostEndsAt: restaurant.homeBoostEndsAt?.toISOString() ?? null,
      };
    };

    // The public detail stays cached for speed; authenticated admin reads are
    // fresh so a just-saved draft/public state can never be overwritten by a
    // stale response from another API replica.
    const data = adminSession
      ? await loadRestaurantDetail()
      : await cached('rest:detail', slug, 15_000, loadRestaurantDetail);

    if (!data) {
      return res.status(404).json({ error: 'Restaurang hittades inte' });
    }

    const isAdminSession = Boolean(adminSession);
    const canViewSensitiveAdminFields = Boolean(
      adminSession && (adminSession.role === 'SUPER_ADMIN' || adminSession.restaurantId === data.restaurantId)
    );

    // Utkast är osynliga för alla utom inloggade admins (inkl. menyagenten
    // som behöver läsa tillbaka sitt eget bygge).
    if ((data.formatted as any)?.draft && !isAdminSession) {
      return res.status(404).json({ error: 'Restaurang hittades inte' });
    }

    return res.json(
      canViewSensitiveAdminFields
        ? {
            ...data.formatted,
            adminEmail: data.adminEmail,
            logoutCode: data.logoutCode,
            homeBoost: data.homeBoost,
            homeBoostStartsAt: data.homeBoostStartsAt,
            homeBoostEndsAt: data.homeBoostEndsAt,
          }
        : data.formatted
    );
  } catch (error) {
    console.error('Error fetching restaurant', error);
    res.status(500).json({ error: 'Kunde inte hämta restaurang' });
  }
});

// GET /api/restaurants/:slug/reviews
// Public list of customer reviews for a restaurant. Drives the in-app
// reviews modal so users can read what others wrote before ordering.
// Filters out flagged reviews + entries without a written comment so the
// list reads like real reviews, not "anonymous gave 4 stars".
router.get('/:slug/reviews', async (req, res) => {
  try {
    const { slug } = req.params;
    // sort=top (default) | recent | low. minRating=N filtrerar bort allt under.
    const sortMode = String(req.query.sort || 'top');
    const minRating = Math.max(1, Math.min(5, parseInt(String(req.query.minRating || '1'), 10) || 1));

    const restaurant = await prisma.restaurant.findFirst({
      where: { archivedAt: null, OR: [{ slug }, { id: slug }] },
      select: { id: true },
    });
    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurang hittades inte' });
    }

    // Sortering. "top" = bästa först (rating desc, sen senast). "recent" = nyast
    // först. "low" = sämsta först (för transparens).
    const orderBy =
      sortMode === 'recent'
        ? [{ reviewedAt: 'desc' as const }, { createdAt: 'desc' as const }]
        : sortMode === 'low'
          ? [{ rating: 'asc' as const }, { reviewedAt: 'desc' as const }]
          : [{ rating: 'desc' as const }, { reviewedAt: 'desc' as const }];

    const reviews = await prisma.order.findMany({
      where: {
        restaurantId: restaurant.id,
        rating: { not: null, gte: minRating },
        NOT: { reviewFlagged: true },
      },
      select: {
        id: true,
        customerName: true,
        rating: true,
        review: true,
        reviewReply: true,
        reviewedAt: true,
        createdAt: true,
        likedItemIds: true,
        items: {
          select: { productId: true, productName: true },
        },
      },
      orderBy,
      take: 200,
    });

    // Bygg en likedItems-array med faktiska namn baserat på orderns items.
    // likedItemIds är en JSON-array av productId — vi mappar dem till namn
    // från den ordern så reviewen visar exakt vad kunden gillade.
    const formatted = reviews.map((r) => {
      let likedIds: string[] = [];
      try {
        const parsed = JSON.parse(r.likedItemIds || '[]');
        if (Array.isArray(parsed)) likedIds = parsed.filter((v): v is string => typeof v === 'string');
      } catch { /* tolerate bad JSON */ }
      const itemMap = new Map((r.items || []).map((i) => [i.productId, i.productName]));
      const likedItems = likedIds
        .map((id) => itemMap.get(id))
        .filter((name): name is string => Boolean(name));

      return {
        id: r.id,
        customerName: formatReviewerName(r.customerName),
        rating: r.rating,
        comment: (r.review || '').trim(),
        reply: (r.reviewReply || '').trim(),
        likedItems,
        createdAt: (r.reviewedAt || r.createdAt).toISOString(),
      };
    });

    // Summary baserat på ALLA reviews (inte bara filtrerade) så snittet är ärligt.
    const allReviewsForSummary = await prisma.order.findMany({
      where: { restaurantId: restaurant.id, rating: { not: null }, NOT: { reviewFlagged: true } },
      select: { rating: true },
    });
    const summary = allReviewsForSummary.reduce(
      (acc, r) => {
        acc.count += 1;
        acc.sum += r.rating ?? 0;
        const star = r.rating ?? 0;
        if (star >= 1 && star <= 5) acc.distribution[star] = (acc.distribution[star] || 0) + 1;
        return acc;
      },
      { count: 0, sum: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number> },
    );

    res.json({
      averageRating: summary.count ? summary.sum / summary.count : 0,
      totalCount: summary.count,
      distribution: summary.distribution,
      sort: sortMode,
      reviews: formatted,
    });
  } catch (error) {
    console.error('Error fetching restaurant reviews', error);
    res.status(500).json({ error: 'Kunde inte hämta recensioner' });
  }
});

function formatReviewerName(raw: string | null | undefined): string {
  const name = (raw || '').trim();
  if (!name) return 'Anonym';
  const parts = name.split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

export default router;
