import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { slugify } from '../lib/slug';
import { authenticate, AuthRequest, resolveAdminSessionFromToken } from '../middleware/auth';
import { getIO } from '../lib/socket';
import { isRestaurantOpen } from '../lib/openingHours';
import { normalizeDeliveryZones } from '../utils/deliveryZones';
import { moneyDto, nullableMoneyDto, oreToSek, parseOre, sekToOre } from '../utils/money';
import { getEffectiveEtaMinutes, ETA_DEFAULT_MINUTES } from '../lib/restaurantEta';
import {
  ACCEPTING_ORDERS_MODES,
  AcceptingOrdersMode,
  normalizeAcceptingOrdersMode,
  resolveRestaurantAvailability,
} from '../lib/restaurantAvailability';
import { resolveOrCreateCity } from '../lib/cityResolver';
import { cached, bustCache, bustRestaurantCaches } from '../lib/ttlCache';
import { revalidateWebRestaurant } from '../lib/revalidate';
import { menuCacheBust } from './menu';
import { isCustomerVisibleDeal, isDealAvailableNow, parseApplicableRestaurantIds, parseDealProductIds } from '../lib/deals';

const router = Router();

const kr = (amount: number) => sekToOre(amount, 'amountSek');
const fromOre = (amount?: number | null) => oreToSek(amount);
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
  featuredClass: z.any().optional(),
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
  vatPercent: z.number().nullable().optional(),
  // Leveransansvar: true = restaurangen levererar själv (10% default), false = plattformen (20%).
  selfDelivery: z.boolean().optional(),
  // Provisions-override i %. null = använd global self/platform-sats.
  commissionPctOverride: z.number().nullable().optional(),
  // ISO datetime sträng – när restaurangen ska öppna igen efter en paus.
  // null = ingen pause aktiv. Sätt till null för att avbryta pause.
  pausedUntil: z.string().datetime().nullable().optional(),
});

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
  },
  comingSoon: restaurant.comingSoon ?? false,
  draft: restaurant.draft ?? false,
  editing: restaurant.draft ?? false,
  manualIsOpen: availability.legacyManualIsOpen,
  pausedUntil: restaurant.pausedUntil
    ? new Date(restaurant.pausedUntil).toISOString()
    : null,
  featuredClass: restaurant.featuredClass ?? 3,
  tags: parseJson<string[]>(restaurant.tags, []),
  openingHours: parseJson<Record<string, any>>(restaurant.openingHours, {}),
  internalInfo: restaurant.internalInfo,
  announcementText: restaurant.announcementText ?? null,
  vatPercent: restaurant.vatPercent ?? null,
  selfDelivery: restaurant.selfDelivery ?? false,
  commissionPctOverride: restaurant.commissionPctOverride ?? null,
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
    const out = await cached('rest:list', `${withMenu === '1' ? 'menu' : 'lite'}|${(city as string) || ''}|d${includeDrafts ? 1 : 0}`, 20_000, async () => {
    const [restaurants, platformSettings] = await Promise.all([prisma.restaurant.findMany({
      where: {
        ...(city ? { city: city as string } : {}),
        ...(includeDrafts ? {} : { draft: false }),
      },
      include: {
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
    });

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
    const slug = slugify(payload.slug || payload.name);
    const acceptingOrdersMode: AcceptingOrdersMode = payload.acceptingOrdersMode
      ?? (payload.isOpen === false ? 'FORCE_CLOSED' : 'SCHEDULED');
    const openingHours = JSON.stringify(payload.openingHours ?? {});
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
      featuredClass: payload.featuredClass !== undefined ? Number(payload.featuredClass) : undefined,
      // isOpen remains a legacy projection only. New clients use the mode.
      isOpen: acceptingOrdersMode !== 'FORCE_CLOSED',
      scheduledOpenNow: isRestaurantOpen(openingHours),
      acceptingOrdersMode,
      acceptingOrdersOverrideUntil: payload.acceptingOrdersOverrideUntil
        ? new Date(payload.acceptingOrdersOverrideUntil)
        : null,
      acceptingOrdersOverrideReason: payload.acceptingOrdersOverrideReason ?? null,
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
      tags: JSON.stringify(payload.tags ?? []),
      openingHours,
      internalInfo: payload.internalInfo,
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

        const adminUser = await prisma.adminUser.upsert({
          where: { email: adminEmail },
          update: { password: hashedPassword, isActive: true, name: `${createdRaw.name} Admin` },
          create: {
            email: adminEmail,
            password: hashedPassword,
            name: `${createdRaw.name} Admin`,
            role: 'ADMIN',
            isActive: true,
          },
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

    if (req.admin?.role === 'MENU_AGENT') {
      // Menyagenten får starta editing-läge, och därefter ändra restaurangen.
      // Publicering/avslut av editing är superadmin-exklusivt.
      const wantsEditing = req.body?.editing === true || req.body?.draft === true;
      if (!(existingRestaurant as any).draft && !wantsEditing) {
        res.status(403).json({ error: 'Menyagenten kan bara ändra restauranger i editing. Skicka editing=true först.' });
        return;
      }
    } else if (req.admin?.role !== 'SUPER_ADMIN') {
      const rid = req.admin?.restaurantId;
      if (!rid || rid !== id) {
        res.status(403).json({ error: 'Du kan bara uppdatera din egen restaurang' });
        return;
      }
    }

    const payload = restaurantSchema.partial().parse(req.body);
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
    if (payload.featuredClass !== undefined) data.featuredClass = toSafeNum(payload.featuredClass);

    // Explicit mode is canonical. Legacy isOpen is accepted without turning a
    // full-form save into a hidden override: true restores SCHEDULED, false
    // means FORCE_CLOSED. FORCE_OPEN is only expressible through the new field.
    if (payload.acceptingOrdersMode !== undefined) {
      data.acceptingOrdersMode = payload.acceptingOrdersMode;
      data.isOpen = payload.acceptingOrdersMode !== 'FORCE_CLOSED';
    } else if (payload.isOpen !== undefined) {
      const currentLegacyToggle = normalizeAcceptingOrdersMode((existingRestaurant as any).acceptingOrdersMode) !== 'FORCE_CLOSED';
      if (payload.isOpen !== currentLegacyToggle) {
        data.acceptingOrdersMode = payload.isOpen ? 'SCHEDULED' : 'FORCE_CLOSED';
        data.isOpen = payload.isOpen;
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
    const safeStringify = (val: any) => {
      if (typeof val === 'string') return val;
      return JSON.stringify(val ?? {});
    };

    if (payload.tags !== undefined) data.tags = safeStringify(payload.tags);
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
      data.commissionPctOverride = v === null || v === '' ? null : Math.max(0, Math.min(100, Math.round(Number(v))));
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
            email: previousAdminLogin,
            role: { not: 'SUPER_ADMIN' },
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
        const adminUser = await prisma.adminUser.upsert({
          where: { email: adminEmail },
          update: { password: hashedPassword, isActive: true, name: `${restaurant.name} Admin` },
          create: {
            email: adminEmail,
            password: hashedPassword,
            name: `${restaurant.name} Admin`,
            role: 'ADMIN',
            isActive: true,
          },
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

router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.admin?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Kräver super admin-behörighet' });
      return;
    }

    const restaurantId = req.params.id;
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true },
    });
    if (!restaurant) {
      res.status(404).json({ error: 'Restaurang hittades inte' });
      return;
    }

    // Category/ExtraGroup/Deal.restaurantId är nullable eftersom plattformen
    // historiskt stödde globala mallar. Prisma sätter därför dessa FK:er till
    // NULL när restaurangen raderas. Det gör gammal restaurangdata global och
    // är exakt orsaken till att en borttagen meny senare blandas in hos andra.
    // Radera restaurangens tenant-data explicit i samma transaktion i stället.
    await prisma.$transaction(async (tx) => {
      const categories = await tx.category.findMany({
        where: { restaurantId },
        select: { id: true },
      });
      const categoryIds = categories.map((category) => category.id);

      if (categoryIds.length) {
        const products = await tx.product.findMany({
          where: { categoryId: { in: categoryIds } },
          select: { id: true },
        });
        const productIds = products.map((product) => product.id);
        if (productIds.length) {
          await tx.productExtraGroup.deleteMany({ where: { productId: { in: productIds } } });
          await tx.product.deleteMany({ where: { id: { in: productIds } } });
        }
        await tx.category.deleteMany({ where: { id: { in: categoryIds } } });
      }

      const extraGroups = await tx.extraGroup.findMany({
        where: { restaurantId },
        select: { id: true },
      });
      const extraGroupIds = extraGroups.map((group) => group.id);
      if (extraGroupIds.length) {
        // onDelete: Cascade removes extras and product links.
        await tx.extraGroup.deleteMany({ where: { id: { in: extraGroupIds } } });
      }

      // A restaurant deal must not become a global deal after deletion.
      await tx.deal.deleteMany({ where: { restaurantId } });
      await tx.restaurant.delete({ where: { id: restaurantId } });
    });
    bustRestaurantCaches(); // restaurant gone → clear list/detail/zone/cities
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'Kunde inte radera restaurang' });
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

    // Cache the expensive part (restaurant + deep category/product/extras include
    // + formatRestaurant) 15s per slug. This is the same heavy query as the menu
    // route and the checkout flow hits it per request — caching collapses the herd.
    // The admin-only fields are kept in the cached object but only EXPOSED below
    // after the per-request auth check, so caching never leaks them.
    const data = await cached('rest:detail', slug, 15_000, async () => {
      const [restaurant, platformSettings] = await Promise.all([prisma.restaurant.findFirst({
        where: {
          OR: [
            { slug },
            { id: slug }
          ]
        },
        include: {
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
      };
    });

    if (!data) {
      return res.status(404).json({ error: 'Restaurang hittades inte' });
    }

    // Cookie först (admin-panelens primära auth), Bearer som fallback.
    const authHeader = req.headers.authorization;
    const cookieToken = (req as any).cookies?.admin_token as string | undefined;
    const token = cookieToken
      || (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);
    let canViewSensitiveAdminFields = false;
    let isAdminSession = false;

    if (token) {
      try {
        const session = await resolveAdminSessionFromToken(token);
        isAdminSession = Boolean(session);
        canViewSensitiveAdminFields = Boolean(
          session && (session.role === 'SUPER_ADMIN' || session.restaurantId === data.restaurantId)
        );
      } catch {
        canViewSensitiveAdminFields = false;
      }
    }

    // Utkast är osynliga för alla utom inloggade admins (inkl. menyagenten
    // som behöver läsa tillbaka sitt eget bygge).
    if ((data.formatted as any)?.draft && !isAdminSession) {
      return res.status(404).json({ error: 'Restaurang hittades inte' });
    }

    return res.json(
      canViewSensitiveAdminFields
        ? { ...data.formatted, adminEmail: data.adminEmail, logoutCode: data.logoutCode }
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
      where: { OR: [{ slug }, { id: slug }] },
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
