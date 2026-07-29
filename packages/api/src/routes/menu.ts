import { Router } from 'express';
import prisma from '../lib/prisma';
import { getDealScopeType, isDealAvailableNow, parseApplicableRestaurantIds, parseDealTargetIds, resolveDisplayPromotionForProduct, PARTNER_DEAL_MARKER } from '../lib/deals';
import { predictedProductUrl, predictedHeroUrl, slugifyPathSegment } from '../lib/r2';
import { resolveRestaurantAvailability } from '../lib/restaurantAvailability';

const router = Router();

// In-memory TTL/LRU cache for /menu/categories (deep nested Prisma include is
// slow enough to cause customer timeouts). Both entry count and approximate
// serialized bytes are bounded so restaurant growth cannot grow heap forever.
// Bust with menuCacheBust(restaurantId | null) — wired into product/category
// mutation routes elsewhere.
function positiveEnvInt(name: string, fallback: number, minimum: number): number {
  const configured = Number(process.env[name]);
  return Number.isFinite(configured) && configured >= minimum
    ? Math.round(configured)
    : fallback;
}

const MENU_CACHE_TTL_MS = positiveEnvInt('MENU_CACHE_TTL_MS', 30_000, 1_000);
const MENU_CACHE_MAX_ENTRIES = positiveEnvInt('MENU_CACHE_MAX_ENTRIES', 200, 1);
const MENU_CACHE_MAX_BYTES = positiveEnvInt('MENU_CACHE_MAX_BYTES', 32 * 1024 * 1024, 1024 * 1024);
type MenuCacheEntry = { payload: unknown; expiresAt: number; bytes: number };
const menuCache = new Map<string, MenuCacheEntry>();
let menuCacheBytes = 0;
// Format ingår i nyckeln: default- och normalized-svaren har olika form och
// får aldrig dela cache-rad.
const cacheKey = (rid: string | null, format: string = 'default') => `r:${rid ?? '_global'}:${format}`;
const MENU_FORMATS = ['default', 'normalized'] as const;

function deleteMenuCacheEntry(key: string): void {
  const existing = menuCache.get(key);
  if (!existing) return;
  menuCacheBytes = Math.max(0, menuCacheBytes - existing.bytes);
  menuCache.delete(key);
}

function pruneMenuCache(now: number): void {
  for (const [key, entry] of menuCache) {
    if (entry.expiresAt <= now) deleteMenuCacheEntry(key);
  }
  while (menuCache.size > MENU_CACHE_MAX_ENTRIES || menuCacheBytes > MENU_CACHE_MAX_BYTES) {
    const oldestKey = menuCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    deleteMenuCacheEntry(oldestKey);
  }
}

function writeMenuCache(key: string, payload: unknown): void {
  let bytes: number;
  try {
    bytes = Buffer.byteLength(JSON.stringify(payload));
  } catch {
    return;
  }
  deleteMenuCacheEntry(key);
  if (bytes > MENU_CACHE_MAX_BYTES) return;
  menuCache.set(key, { payload, bytes, expiresAt: Date.now() + MENU_CACHE_TTL_MS });
  menuCacheBytes += bytes;
  pruneMenuCache(Date.now());
}

export function menuCacheBust(restaurantId: string | null = null) {
  if (restaurantId === null) {
    menuCache.clear();
    menuCacheBytes = 0;
    return;
  }
  for (const fmt of MENU_FORMATS) {
    deleteMenuCacheEntry(cacheKey(restaurantId, fmt));
    deleteMenuCacheEntry(cacheKey(null, fmt));
  }
}

const dealMatchesRestaurant = (deal: {
  restaurantId?: string | null;
  isGlobal?: boolean | null;
  applicableRestaurantIds?: string | null;
}, restaurantId: string | null) => {
  if (!restaurantId) return false;
  if (deal.isGlobal) return true;
  if (deal.restaurantId === restaurantId) return true;
  return parseApplicableRestaurantIds(deal.applicableRestaurantIds).includes(restaurantId);
};

const toDisplayDiscount = (product: any, categoryId: string, restaurantId: string | null, deals: any[]) => {
  const promotion = resolveDisplayPromotionForProduct({
    product,
    categoryId,
    restaurantId,
    deals: deals.filter((deal) => dealMatchesRestaurant(deal, restaurantId) && isDealAvailableNow(deal)),
  });

  return {
    discountActive: Boolean(promotion),
    discountScope: promotion?.scope ?? null,
    discountPercent: promotion?.discountPercent ?? null,
    discountPrice: promotion ? promotion.salePriceOre / 100 : null,
    discountImageUrl: promotion?.imageUrl ?? null,
    discountLabel: promotion?.discountLabel ?? null,
  };
};

// GET /api/menu/categories - Alla aktiva kategorier med produkter för en specifik restaurang
router.get('/categories', async (req, res) => {
  try {
    // Allow short browser/CDN caching too. Server-side TTL cache below is the
    // main mechanism but a short shared cache shaves cold-start latency further.
    // Ingen browser-cache: "Populärt"-raden använder Math.random per request
     // och måste verkligen variera när kunden öppnar sidan igen.
    res.set('Cache-Control', 'no-store');
    const { restaurantId, slug } = req.query;
    const hasRestaurantScope = Boolean(restaurantId || slug);
    if (!hasRestaurantScope) {
      res.status(400).json({ error: 'restaurantId eller slug krävs' });
      return;
    }
    // ?format=normalized → tillvalsgrupper skickas EN gång i en top-level
    // `extraGroups`-map och produkter bär bara `extraGroupIds`. Krymper en
    // kedjemeny 5–10× (en dryckesgrupp med 30 val dupliceras annars i varje
    // produkt). Default-formatet är oförändrat → Flutter/RN/äldre web opåverkade.
    const normalized = req.query.format === 'normalized';

    // Hämta restaurang inkl. slug + city så vi kan bygga R2 predicted URLs
    // för bilder som saknas i databasen (Auto-discovery vid manuell R2-upload).
    const resolvedRestaurant = await (async () => {
      const where = restaurantId
        ? { id: restaurantId as string, archivedAt: null }
        : slug
          ? { slug: slug as string, archivedAt: null }
          : null;
      if (!where) return null;
      return prisma.restaurant.findFirst({
        where,
        select: {
          id: true,
          slug: true,
          city: true,
          draft: true,
          offersImageUrl: true,
          city_relation: { select: { slug: true, name: true } },
        },
      });
    })();
    const resolvedRestaurantId = resolvedRestaurant?.id ?? null;

    // The admin editor intentionally reads draft menus through /admin/*.
    // Customer clients (web, Swift and older app builds) must never receive
    // the same data while a restaurant is still being edited. Keep this gate
    // before the menu cache and before any category query so a draft response
    // can never be cached under a public restaurant key.
    if (hasRestaurantScope && (!resolvedRestaurant || resolvedRestaurant.draft)) {
      res.status(404).json({ error: 'Restaurang hittades inte' });
      return;
    }

    const restSlugForR2 = resolvedRestaurant?.slug ?? '';
    const citySlugForR2 = resolvedRestaurant
      ? (resolvedRestaurant.city_relation?.slug
          || slugifyPathSegment(resolvedRestaurant.city_relation?.name || resolvedRestaurant.city || 'global'))
      : '';

    // Cache hit? Vi shufflar populär-raden per request även vid HIT så
    // discovery-känslan inte tappas på cached svar.
    const ck = cacheKey(hasRestaurantScope ? (resolvedRestaurantId ?? null) : null, normalized ? 'normalized' : 'default');
    const now = Date.now();
    pruneMenuCache(now);
    const cached = menuCache.get(ck);
    if (cached && cached.expiresAt > now) {
      // Touch on read: Map insertion order is the LRU order.
      menuCache.delete(ck);
      menuCache.set(ck, cached);
      const payload: any = cached.payload;
      const mains: any[] = payload?.mainCategories || [];
      const reshuffled = mains.map((m) => {
        if (m.isVirtual) return m;
        // Order-baserad ranking är stabil "mest beställda" — behåll den som den
        // är. Bara random-fallbacken (restaurang utan order-historik) shufflas
        // om per request för discovery-känsla.
        if (m.popularFromOrders) return m;
        const allProducts: any[] = (m.categories || []).flatMap((c: any) => c.products || []);
        if (allProducts.length < 10) return { ...m, popularProductIds: [] };
        // Samma ≥50 kr-filter som vid färsk beräkning (inga drycker/billiga sides).
        const all = allProducts.filter((p: any) => (p.price ?? 0) >= 50);
        const scored = all.map((p) => {
          const r = Math.random();
          return { id: p.id, score: p.imageUrl ? r * 1.5 : r };
        });
        return { ...m, popularProductIds: scored.sort((a, b) => b.score - a.score).slice(0, 6).map((p) => p.id) };
      });
      res.set('X-Cache', 'HIT');
      res.json({ ...payload, mainCategories: reshuffled });
      return;
    }

    const queryActiveMenuByRestaurantId = async (rid: string | null) => {
      return prisma.category.findMany({
        where: {
          restaurantId: rid,
          isActive: true,
        },
        orderBy: { position: 'asc' },
        include: {
          products: {
            where: { isActive: true },
            orderBy: { position: 'asc' },
            include: {
              extraGroups: {
                where: { extraGroup: { restaurantId: rid } },
                orderBy: { position: 'asc' },
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
    };

    // Populärt-poäng per produkt senaste 30 dagar. HYBRID som mäter genuin
    // efterfrågan utan att en enda bulk-order ("60 calzone till festen") kan
    // kapa hela listan:
    //   poäng = antal DISTINKTA ordrar × 5  +  cappad volym (max 10 st/orderrad)
    // → många separata ordrar väger tyngst (riktig popularitet), men volym ger
    //   en mild bonus. Returns Map: productId → poäng.
    const ORDER_WEIGHT = 5;
    const UNIT_CAP_PER_LINE = 10;
    const queryProductPopularity = async (rid: string | null): Promise<Map<string, number>> => {
      if (!rid) return new Map();
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const items = await prisma.orderItem.findMany({
        where: { order: { restaurantId: rid, createdAt: { gte: since } } },
        select: { productId: true, orderId: true, quantity: true },
      });
      const orderSets = new Map<string, Set<string>>(); // distinkta ordrar per produkt
      const cappedUnits = new Map<string, number>();      // cappad volym per produkt
      for (const item of items) {
        if (!item.productId) continue;
        let set = orderSets.get(item.productId);
        if (!set) { set = new Set(); orderSets.set(item.productId, set); }
        set.add(item.orderId);
        cappedUnits.set(
          item.productId,
          (cappedUnits.get(item.productId) || 0) + Math.min(item.quantity || 1, UNIT_CAP_PER_LINE),
        );
      }
      const counts = new Map<string, number>();
      for (const [pid, set] of orderSets) {
        counts.set(pid, set.size * ORDER_WEIGHT + (cappedUnits.get(pid) || 0));
      }
      return counts;
    };

    const primaryRestaurantId = resolvedRestaurantId!;
    const [categories, productPopularity] = await Promise.all([
      queryActiveMenuByRestaurantId(primaryRestaurantId),
      queryProductPopularity(primaryRestaurantId),
    ]);
    const activeDeals = primaryRestaurantId
      ? await prisma.deal.findMany({
          where: {
            isActive: true,
            OR: [{ showOnSite: true }, { appCtaTarget: PARTNER_DEAL_MARKER }],
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        })
      : [];

    // Fallback logic if no categories found (e.g. invalid restaurantId)
    if (hasRestaurantScope && categories.length === 0) {
      console.info(`[menu] No active menu found for restaurant: ${slug || restaurantId}`);
    }

    // Normalized-läge: dedupe-map för tillvalsgrupper (id → grupp en gång).
    // Bygg ETT gruppobjekt per peg och återanvänd det — samma form oavsett läge.
    const sharedGroups = new Map<string, any>();
    const buildGroup = (peg: any) => ({
      id: peg.extraGroup.id,
      name: peg.extraGroup.name,
      description: peg.extraGroup.description,
      type: peg.extraGroup.type,
      required: peg.extraGroup.required,
      minSelections: peg.extraGroup.minSelections,
      maxSelections: peg.extraGroup.maxSelections,
      displayStyle: peg.extraGroup.displayStyle,
      allowQuantity: peg.extraGroup.allowQuantity,
      extras: peg.extraGroup.extras.map((e: any) => ({
        id: e.id,
        name: e.name,
        priceAddon: e.priceAddon / 100,
        isDefault: e.isDefault,
        imageUrl: e.imageUrl,
      })),
      position: peg.extraGroup.position || 0,
    });

    // Formatera kategorier
    const formattedCategories = categories.map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      imageUrl: cat.imageUrl,
      products: cat.products.map((prod: any) => {
        // Predicted R2 URL — om DB.imageUrl är null testar klienten denna.
        // Om filen finns i R2 (på kanonisk slug-path) visas den direkt.
        // Om inte → onError-fallback triggas och text-only kort visas.
        const catSlug = cat.slug || slugifyPathSegment(cat.name);
        const prodSlug = prod.slug || slugifyPathSegment(prod.name);
        const predicted = predictedProductUrl({
          city: citySlugForR2,
          restaurant: restSlugForR2,
          category: catSlug,
          product: prodSlug,
        });
        // Sortera grupperna på position (peg.extraGroup.position) — samma
        // ordning som det inbäddade läget hade.
        const sortedPegs = [...prod.extraGroups].sort(
          (a: any, b: any) => (a.extraGroup.position || 0) - (b.extraGroup.position || 0),
        );
        // I normalized-läget bär produkten bara id:n och grupperna läggs i
        // den delade mappen; i default-läget bäddas hela grupperna in (oförändrat).
        let extraGroupsField: Record<string, any>;
        if (normalized) {
          for (const peg of sortedPegs) {
            if (!sharedGroups.has(peg.extraGroup.id)) sharedGroups.set(peg.extraGroup.id, buildGroup(peg));
          }
          extraGroupsField = { extraGroupIds: sortedPegs.map((peg: any) => peg.extraGroup.id) };
        } else {
          extraGroupsField = { extraGroups: sortedPegs.map(buildGroup) };
        }
        return ({
        ...toDisplayDiscount(prod, cat.id, primaryRestaurantId, activeDeals),
        id: prod.id,
        name: prod.name,
        slug: prod.slug,
        description: prod.description,
        price: prod.price / 100, // konvertera ören till kr
        imageUrl: prod.imageUrl || predicted,
        isVegan: prod.isVegan,
        isVegetarian: prod.isVegetarian,
        isGlutenFree: prod.isGlutenFree,
        // Visningsläge för menykortet (FULL = 1-per-rad, COMPACT = 2-per-rad)
        displayMode: prod.displayMode || "FULL",
        hideDescription: prod.hideDescription || false,
        // Popularitet (distinkta ordrar × 5 + cappad volym, 30 dagar). Klienten
        // använder detta för "mest beställda tillgängliga"-fallbacken när en
        // borttagen favorit inte längre finns i menyn.
        orderScore: productPopularity.get(prod.id) ?? 0,
        // Admin-notering som visas längst ner i produktmodalen (valfri).
        note: (prod as any).note ?? null,
        ...extraGroupsField,
        });
      }),
    }));

    // Platt meny: hela restaurangens kategorier (med produkter) returneras
    // direkt — inget MainCategory-topplager längre. `mainCategories: []` behålls
    // i svaret för bakåtkompatibilitet (klienter faller tillbaka på platt lista
    // när den är tom).
    const payload = {
      mainCategories: [] as any[],
      categories: formattedCategories,
      // Normalized: delad ordbok id → tillvalsgrupp (skickas EN gång).
      ...(normalized ? { extraGroups: Object.fromEntries(sharedGroups) } : {}),
    };

    writeMenuCache(ck, payload);
    res.set('X-Cache', 'MISS');
    res.json(payload);
  } catch (error) {
    console.error('Error fetching menu:', error);
    res.status(500).json({ error: 'Kunde inte hämta menyn' });
  }
});

// GET /api/menu/products/:id - En produkt med extras
router.get('/products/:id', async (req, res) => {
  try {
    const product = await prisma.product.findFirst({
      where: {
        id: req.params.id,
        isActive: true,
        category: {
          isActive: true,
          restaurant: { draft: false },
        },
      },
      include: {
        category: true,
        extraGroups: {
          orderBy: { position: 'asc' },
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
    });

    if (!product) {
      res.status(404).json({ error: 'Produkt inte hittad' });
      return;
    }

    res.json({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price / 100,
      imageUrl: product.imageUrl,
      category: product.category.name,
      extraGroups: product.extraGroups
        .filter((peg) => peg.extraGroup.restaurantId === product.category.restaurantId)
        .map((peg) => ({
        id: peg.extraGroup.id,
        name: peg.extraGroup.name,
        type: peg.extraGroup.type,
        required: peg.extraGroup.required,
        minSelections: peg.extraGroup.minSelections,
        maxSelections: peg.extraGroup.maxSelections,
        displayStyle: (peg.extraGroup as any).displayStyle,
        allowQuantity: (peg.extraGroup as any).allowQuantity,
        extras: peg.extraGroup.extras.map((e) => ({
          id: e.id,
          name: e.name,
          priceAddon: e.priceAddon / 100,
          isDefault: e.isDefault,
          imageUrl: (e as any).imageUrl,
        })),
        position: (peg.extraGroup as any).position || 0,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// GET /api/menu/discounted - Produktspecifika rabatter över alla restauranger.
// Används av "Rea & rabatterat"-sektionen på hemskärmen i web + RN appen.
router.get('/discounted', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const { cityId } = req.query;

    const activeDeals = await prisma.deal.findMany({
      where: {
        isActive: true,
        OR: [{ showOnSite: true }, { appCtaTarget: PARTNER_DEAL_MARKER }],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    const productDealProductIds = Array.from(
      new Set(
        activeDeals
          .filter((deal) => isDealAvailableNow(deal) && getDealScopeType(deal) === 'PRODUCT')
          .flatMap((deal) => parseDealTargetIds(deal.comboProductIds)),
      ),
    );

    const products: any[] = await prisma.product.findMany({
      where: {
        isActive: true,
        ...(productDealProductIds.length > 0
          ? {
              OR: [
                { discountActive: true },
                { id: { in: productDealProductIds } },
              ],
            }
          : { discountActive: true }),
        category: {
          isActive: true,
          restaurant: {
            archivedAt: null,
            draft: false,
            ...(cityId ? { cityId: cityId as string } : {}),
          },
        },
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            restaurant: {
              select: {
                id: true,
                slug: true,
                name: true,
                imageUrl: true,
                heroImageUrl: true,
                city: true,
                cuisine: true,
                openingHours: true,
                scheduledOpenNow: true,
                acceptingOrdersMode: true,
                acceptingOrdersOverrideUntil: true,
                acceptingOrdersOverrideReason: true,
                pausedUntil: true,
                draft: true,
                comingSoon: true,
                isOpen: true,
                city_relation: true,
              },
            },
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 200,
    });

    const platformSettings = await prisma.restaurantSettings.findUnique({ where: { id: 'settings' } });
    const formatted = products
      .filter((p) => p.category?.restaurant)
      .map((p) => {
        const restaurant = p.category.restaurant;
        const availability = resolveRestaurantAvailability(restaurant, {
          city: restaurant.city_relation,
          platform: platformSettings,
        });
        if (!availability.isOpen) return null;
        const priceKr = p.price / 100;
        const displayPromotion = resolveDisplayPromotionForProduct({
          product: p,
          categoryId: p.category.id,
          restaurantId: p.category.restaurant?.id || null,
          deals: activeDeals.filter((deal) => dealMatchesRestaurant(deal, p.category.restaurant?.id || null)),
        });

        // "Rea & rabatter" should only contain individually discounted products.
        if (!displayPromotion || displayPromotion.scope !== 'PRODUCT') return null;

        return {
          id: p.id,
          name: p.name,
          description: p.description,
          originalPrice: priceKr,
          discountPrice: displayPromotion.salePriceOre / 100,
          discountScope: displayPromotion.scope,
          discountPercent: displayPromotion.discountPercent,
          discountLabel: displayPromotion.discountLabel,
          // Deals-tabens kategori-chips (Pizza/Burgare/…) filtrerar på denna.
          category: p.category?.name ?? null,
          imageUrl: displayPromotion.imageUrl || p.imageUrl,
          restaurant: {
            ...restaurant,
            isOpen: availability.isOpen,
            scheduledOpenNow: availability.scheduledOpenNow,
            acceptingOrdersMode: availability.configuredMode,
            availabilityReason: availability.reason,
            city_relation: undefined,
          },
        };
      });

    res.json(formatted.filter(Boolean).slice(0, 30));
  } catch (error) {
    console.error('Error fetching discounted products:', error);
    res.status(500).json({ error: 'Kunde inte hämta rabatterade produkter' });
  }
});

// GET /api/menu/free-delivery - Restauranger som har gratis leverans (antingen ett zon-fee = 0 eller freeDeliveryAbove)
router.get('/free-delivery', async (req, res) => {
  try {
    const { cityId } = req.query;
    const [restaurants, platformSettings] = await Promise.all([prisma.restaurant.findMany({
      where: {
        archivedAt: null,
        draft: false,
        ...(cityId ? { cityId: cityId as string } : {}),
      },
      include: { city_relation: true },
      orderBy: [{ featuredClass: 'asc' }, { name: 'asc' }],
    }), prisma.restaurantSettings.findUnique({ where: { id: 'settings' } })]);

    const out = restaurants
      .map((r) => {
        const availability = resolveRestaurantAvailability(r, {
          city: r.city_relation,
          platform: platformSettings,
        });
        if (!availability.isOpen) return null;
        // Parse zones - if any zone has deliveryFee === 0 while isActive, it's "free delivery"
        let zoneFree = false;
        try {
          const zones = JSON.parse(r.deliveryZones || '[]');
          if (Array.isArray(zones) && zones.some((z: any) => z?.isActive !== false && Number(z?.deliveryFee ?? z?.fee ?? -1) === 0)) {
            zoneFree = true;
          }
        } catch {}
        const fee = r.deliveryFee ?? 0;
        const minOrder = r.minOrderAmount ?? 0;
        const freeDeliveryAbove = r.freeDeliveryAbove ?? r.city_relation?.freeDeliveryAbove ?? null;
        const hasFreeDelivery = zoneFree || fee === 0 || (freeDeliveryAbove != null && freeDeliveryAbove > 0);
        return hasFreeDelivery
          ? {
              id: r.id,
              slug: r.slug,
              name: r.name,
              imageUrl: r.imageUrl,
              heroImageUrl: r.heroImageUrl,
              cuisine: r.cuisine,
              city: r.city,
              rating: r.rating,
              etaMinutes: r.etaMinutes,
              isOpen: availability.isOpen,
              scheduledOpenNow: availability.scheduledOpenNow,
              acceptingOrdersMode: availability.configuredMode,
              availabilityReason: availability.reason,
              isFullyFree: zoneFree || fee === 0,
              freeDeliveryAbove: freeDeliveryAbove != null ? freeDeliveryAbove / 100 : null,
              minOrder: minOrder / 100,
            }
          : null;
      })
      .filter(Boolean);

    res.json(out);
  } catch (error) {
    console.error('Error fetching free delivery restaurants:', error);
    res.status(500).json({ error: 'Kunde inte hämta restauranger' });
  }
});

export default router;
