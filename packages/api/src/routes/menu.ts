import { Router } from 'express';
import prisma from '../lib/prisma';
import { getDealScopeType, isDealAvailableNow, parseApplicableRestaurantIds, parseDealTargetIds, resolveDisplayPromotionForProduct } from '../lib/deals';
import { predictedProductUrl, predictedMainCategoryUrl, predictedHeroUrl, slugifyPathSegment } from '../lib/r2';

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
const cacheKey = (rid: string | null) => `r:${rid ?? '_global'}`;
export function menuCacheBust(restaurantId: string | null = null) {
  if (restaurantId === null) {
    menuCache.clear();
    return;
  }
  menuCache.delete(cacheKey(restaurantId));
  menuCache.delete(cacheKey(null));
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
    const ck = cacheKey(hasRestaurantScope ? (resolvedRestaurantId ?? null) : null);
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
          OR: [
            { restaurantId: rid },
            { restaurantId: null }
          ],
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

    const queryMainCategories = async (rid: string | null) => {
      if (!rid) return [];
      return prisma.mainCategory.findMany({
        where: { restaurantId: rid, isActive: true },
        orderBy: { position: 'asc' },
        select: { id: true, name: true, imageUrl: true, position: true },
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
    const [categories, mainCategories, popularity] = await Promise.all([
      queryActiveMenuByRestaurantId(primaryRestaurantId),
      queryMainCategories(primaryRestaurantId),
      queryProductPopularity(primaryRestaurantId),
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

    // Formatera kategorier
    const formattedCategories = categories.map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      imageUrl: cat.imageUrl,
      mainCategoryId: cat.mainCategoryId || null,
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
        // Dpoints: rewardable = köpbar med poäng. Klienten visar då poäng-pris
        // (price × valuePerKr) + "köp med poäng". Default false.
        rewardable: !!prod.rewardable,
        extraGroups: prod.extraGroups.map((peg: any) => ({
          id: peg.extraGroup.id,
          name: peg.extraGroup.name,
          description: peg.extraGroup.description,
          type: peg.extraGroup.type,
          required: peg.extraGroup.required,
          minSelections: peg.extraGroup.minSelections,
          maxSelections: peg.extraGroup.maxSelections,
          extras: peg.extraGroup.extras.map((e: any) => ({
            id: e.id,
            name: e.name,
            priceAddon: e.priceAddon / 100,
            isDefault: e.isDefault,
          })),
          position: peg.extraGroup.position || 0,
        })),
        });
      }),
    }));

    // Bygg topplagret. Huvudkategorier som har minst en kategori dyker upp som
    // tiles i kund-UI:t. Kategorier som ännu inte tilldelats samlas i en virtuell
    // "Övrigt"-tile så ingen meny går sönder under övergångsfasen.
    const categoriesByMain = new Map<string, typeof formattedCategories>();
    const orphanCategories: typeof formattedCategories = [];
    for (const cat of formattedCategories) {
      if (cat.mainCategoryId) {
        const arr = categoriesByMain.get(cat.mainCategoryId) || [];
        arr.push(cat);
        categoriesByMain.set(cat.mainCategoryId, arr);
      } else {
        orphanCategories.push(cat);
      }
    }

    // Plockar 6 produkter per huvudkategori för "Populärt"-raden.
     // - Kategorier med <10 totala produkter: tom lista (sektionen göms på
     //   klienten) — annars blir raden redundant.
     // - Med order-historik senaste 30d: rangordna efter OrderItem-counts +
     //   1.2x bild-boost.
     // - Utan historik (ny restaurang): random per request med 1.5x bild-vikt.
    // Returnerar både id-listan OCH om rankingen är order-baserad. fromOrders
    // styr cache-hit-pathen: order-baserad ranking ska INTE shufflas om per
    // request (den ska vara stabil = "mest beställda"); bara random-fallbacken
    // (ny restaurang utan historik) shufflas för discovery-känsla.
    const POPULAR_MIN_PRICE_KR = 50; // inga drycker/billiga tillbehör i "Populärt"
    const popularProductIdsFor = (cats: typeof formattedCategories): { ids: string[]; fromOrders: boolean } => {
      const allProducts = cats.flatMap((c) => c.products);
      if (allProducts.length < 10) return { ids: [], fromOrders: false };

      // Bara rätter ≥ 50 kr räknas i "Populärt" (filtrerar bort läsk, sides,
      // plastbestick osv). price är i kronor här.
      const all = allProducts.filter((p) => (p.price ?? 0) >= POPULAR_MIN_PRICE_KR);
      if (all.length === 0) return { ids: [], fromOrders: false };

      const hasOrders = all.some((p) => (popularity.get(p.id) || 0) > 0);
      const scored = all.map((p) => {
        if (hasOrders) {
          const base = popularity.get(p.id) || 0;
          return { id: p.id, score: p.imageUrl ? base * 1.2 + 0.001 : base };
        }
        const r = Math.random();
        return { id: p.id, score: p.imageUrl ? r * 1.5 : r };
      });
      return { ids: scored.sort((a, b) => b.score - a.score).slice(0, 6).map((p) => p.id), fromOrders: hasOrders };
    };

    const mainCategoriesPayload = mainCategories
      .map((mc) => {
        const cats = categoriesByMain.get(mc.id) || [];
        const mcPredicted = predictedMainCategoryUrl({
          city: citySlugForR2,
          restaurant: restSlugForR2,
          category: slugifyPathSegment(mc.name),
        });
        const popular = popularProductIdsFor(cats);
        return {
          id: mc.id,
          name: mc.name,
          imageUrl: mc.imageUrl || mcPredicted,
          position: mc.position,
          isVirtual: false,
          categories: cats,
          popularProductIds: popular.ids,
          popularFromOrders: popular.fromOrders,
        };
      })
      .filter((mc) => mc.categories.length > 0);

    if (orphanCategories.length > 0) {
      mainCategoriesPayload.push({
        id: '__uncategorized__',
        name: 'Övrigt',
        imageUrl: null,
        position: 9999,
        isVirtual: true,
        categories: orphanCategories,
        popularProductIds: popularProductIdsFor(orphanCategories).ids,
        popularFromOrders: false,
      });
    }

    // Virtuell "Erbjudanden"-tile — samlar produkter med aktiv display-rabatt
    // i en egen sektion istället för att lyfta dem till toppen av menyn.
    const discountedProducts = formattedCategories.flatMap((cat) =>
      cat.products.filter((p) => p.discountActive).map((p) => ({ cat, product: p })),
    );
    if (discountedProducts.length > 0) {
      const offerCategory = {
        id: '__offers__',
        name: 'Erbjudanden',
        slug: '__offers__',
        description: null,
        imageUrl: null,
        mainCategoryId: '__offers_main__',
        products: discountedProducts.map(({ product }) => product),
      };
      mainCategoriesPayload.unshift({
        id: '__offers_main__',
        name: 'Erbjudanden',
        imageUrl: resolvedRestaurant?.offersImageUrl || null,
        position: -1,
        isVirtual: true,
        categories: [offerCategory as any],
        popularProductIds: [],
        popularFromOrders: false,
      });
    }

    const payload = {
      mainCategories: mainCategoriesPayload,
      categories: formattedCategories,
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
        extras: peg.extraGroup.extras.map((e) => ({
          id: e.id,
          name: e.name,
          priceAddon: e.priceAddon / 100,
          isDefault: e.isDefault,
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
