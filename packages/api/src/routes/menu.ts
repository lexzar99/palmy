import { Router } from 'express';
import prisma from '../lib/prisma';
import { getDealScopeType, isDealAvailableNow, parseApplicableRestaurantIds, parseDealTargetIds, resolveDisplayPromotionForProduct } from '../lib/deals';
import { predictedProductUrl, predictedHeroUrl, slugifyPathSegment } from '../lib/r2';

const router = Router();

// In-memory TTL cache for /menu/categories (deep nested Prisma include is slow
// enough to cause 12s axios timeouts on the customer web). Short TTL keeps
// "real-time menu" feel without hammering the DB on every customer.
// Bust with menuCacheBust(restaurantId | null) — wired into product/category
// mutation routes elsewhere.
// Kort TTL så "Populärt"-raden (random per request) faktiskt varierar synligt
// för kunder som öppnar restaurang-sidan igen efter några sekunder.
const MENU_CACHE_TTL_MS = 8_000;
type MenuCacheEntry = { payload: unknown; expiresAt: number };
const menuCache = new Map<string, MenuCacheEntry>();
// Format ingår i nyckeln: default- och normalized-svaren har olika form och
// får aldrig dela cache-rad.
const cacheKey = (rid: string | null, format: string = 'default') => `r:${rid ?? '_global'}:${format}`;
const MENU_FORMATS = ['default', 'normalized'] as const;
export function menuCacheBust(restaurantId: string | null = null) {
  if (restaurantId === null) {
    menuCache.clear();
    return;
  }
  for (const fmt of MENU_FORMATS) {
    menuCache.delete(cacheKey(restaurantId, fmt));
    menuCache.delete(cacheKey(null, fmt));
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
    // ?format=normalized → tillvalsgrupper skickas EN gång i en top-level
    // `extraGroups`-map och produkter bär bara `extraGroupIds`. Krymper en
    // kedjemeny 5–10× (en dryckesgrupp med 30 val dupliceras annars i varje
    // produkt). Default-formatet är oförändrat → Flutter/RN/äldre web opåverkade.
    const normalized = req.query.format === 'normalized';

    // Hämta restaurang inkl. slug + city så vi kan bygga R2 predicted URLs
    // för bilder som saknas i databasen (Auto-discovery vid manuell R2-upload).
    const resolvedRestaurant = await (async () => {
      const where = restaurantId
        ? { id: restaurantId as string }
        : slug
          ? { slug: slug as string }
          : null;
      if (!where) return null;
      return prisma.restaurant.findFirst({
        where,
        select: {
          id: true,
          slug: true,
          city: true,
          offersImageUrl: true,
          city_relation: { select: { slug: true, name: true } },
        },
      });
    })();
    const resolvedRestaurantId = resolvedRestaurant?.id ?? null;
    const restSlugForR2 = resolvedRestaurant?.slug ?? '';
    const citySlugForR2 = resolvedRestaurant
      ? (resolvedRestaurant.city_relation?.slug
          || slugifyPathSegment(resolvedRestaurant.city_relation?.name || resolvedRestaurant.city || 'global'))
      : '';

    // Cache hit? Vi shufflar populär-raden per request även vid HIT så
    // discovery-känslan inte tappas på cached svar.
    const ck = cacheKey(hasRestaurantScope ? (resolvedRestaurantId ?? null) : null, normalized ? 'normalized' : 'default');
    const cached = menuCache.get(ck);
    if (cached && cached.expiresAt > Date.now()) {
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

    const primaryRestaurantId = hasRestaurantScope ? (resolvedRestaurantId ?? null) : null;
    const [categories] = await Promise.all([
      queryActiveMenuByRestaurantId(primaryRestaurantId),
    ]);
    const activeDeals = primaryRestaurantId
      ? await prisma.deal.findMany({
          where: { isActive: true, showOnSite: true },
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
          extraGroupsField = { extraGroups: prod.extraGroups.map(buildGroup) };
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
        // Dpoints: rewardable = visas i Rewards. Poängpris är produktstyrt:
        // override om satt, annars ceil(priceKr × rewardPointsMultiplier).
        rewardable: !!prod.rewardable,
        rewardPointsMultiplier: (prod as any).rewardPointsMultiplier ?? 1.5,
        rewardPointsPrice: (prod as any).rewardPointsPrice ?? null,
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

    menuCache.set(ck, { payload, expiresAt: Date.now() + MENU_CACHE_TTL_MS });
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
      where: { id: req.params.id, isActive: true },
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
      extraGroups: product.extraGroups.map((peg) => ({
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
      where: { isActive: true, showOnSite: true },
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
            isOpen: true,
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
                city: true,
                cuisine: true,
              },
            },
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 200,
    });

    const formatted = products
      .filter((p) => p.category?.restaurant)
      .map((p) => {
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
          imageUrl: displayPromotion.imageUrl || p.imageUrl,
          restaurant: p.category.restaurant,
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
    const restaurants = await prisma.restaurant.findMany({
      where: {
        isOpen: true,
        draft: false,
        ...(cityId ? { cityId: cityId as string } : {}),
      },
      include: { city_relation: true },
      orderBy: [{ featuredClass: 'asc' }, { name: 'asc' }],
    });

    const out = restaurants
      .map((r) => {
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
