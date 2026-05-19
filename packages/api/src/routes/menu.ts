import { Router } from 'express';
import prisma from '../lib/prisma';
import { getDealScopeType, isDealAvailableNow, parseApplicableRestaurantIds, parseDealTargetIds, resolveDisplayPromotionForProduct } from '../lib/deals';

const router = Router();

// In-memory TTL cache for /menu/categories (deep nested Prisma include is slow
// enough to cause 12s axios timeouts on the customer web). Short TTL keeps
// "real-time menu" feel without hammering the DB on every customer.
// Bust with menuCacheBust(restaurantId | null) — wired into product/category
// mutation routes elsewhere.
const MENU_CACHE_TTL_MS = 30_000;
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
    res.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
    const { restaurantId, slug } = req.query;
    const hasRestaurantScope = Boolean(restaurantId || slug);

    const resolvedRestaurantId = await (async () => {
      if (restaurantId) return restaurantId as string;
      if (!slug) return null;
      const restaurant = await prisma.restaurant.findFirst({
        where: { slug: slug as string },
        select: { id: true },
      });
      return restaurant?.id ?? null;
    })();

    // Cache hit?
    const ck = cacheKey(hasRestaurantScope ? (resolvedRestaurantId ?? null) : null);
    const cached = menuCache.get(ck);
    if (cached && cached.expiresAt > Date.now()) {
      res.set('X-Cache', 'HIT');
      res.json(cached.payload);
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

    // Räknar OrderItem-rader per produkt senaste 30 dagar — bas för
     // "Populärt"-raden. Returns Map: productId → count.
    const queryProductPopularity = async (rid: string | null): Promise<Map<string, number>> => {
      if (!rid) return new Map();
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const items = await prisma.orderItem.findMany({
        where: { order: { restaurantId: rid, createdAt: { gte: since } } },
        select: { productId: true },
      });
      const counts = new Map<string, number>();
      for (const item of items) {
        if (!item.productId) continue;
        counts.set(item.productId, (counts.get(item.productId) || 0) + 1);
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
      products: cat.products.map((prod: any) => ({
        ...toDisplayDiscount(prod, cat.id, primaryRestaurantId, activeDeals),
        id: prod.id,
        name: prod.name,
        slug: prod.slug,
        description: prod.description,
        price: prod.price / 100, // konvertera ören till kr
        imageUrl: prod.imageUrl,
        isVegan: prod.isVegan,
        isVegetarian: prod.isVegetarian,
        isGlutenFree: prod.isGlutenFree,
        // Visningsläge för menykortet (FULL = 1-per-rad, COMPACT = 2-per-rad)
        displayMode: prod.displayMode || "FULL",
        hideDescription: prod.hideDescription || false,
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
      })),
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
    const popularProductIdsFor = (cats: typeof formattedCategories): string[] => {
      const all = cats.flatMap((c) => c.products);
      if (all.length < 10) return [];

      const hasOrders = all.some((p) => (popularity.get(p.id) || 0) > 0);
      const scored = all.map((p) => {
        if (hasOrders) {
          const base = popularity.get(p.id) || 0;
          return { id: p.id, score: p.imageUrl ? base * 1.2 + 0.001 : base };
        }
        const r = Math.random();
        return { id: p.id, score: p.imageUrl ? r * 1.5 : r };
      });
      return scored.sort((a, b) => b.score - a.score).slice(0, 6).map((p) => p.id);
    };

    const mainCategoriesPayload = mainCategories
      .map((mc) => {
        const cats = categoriesByMain.get(mc.id) || [];
        return {
          id: mc.id,
          name: mc.name,
          imageUrl: mc.imageUrl,
          position: mc.position,
          isVirtual: false,
          categories: cats,
          popularProductIds: popularProductIdsFor(cats),
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
        popularProductIds: popularProductIdsFor(orphanCategories),
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
        imageUrl: null,
        position: -1,
        isVirtual: true,
        categories: [offerCategory as any],
        popularProductIds: [],
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
