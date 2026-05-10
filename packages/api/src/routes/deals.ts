import { Router } from 'express';
import prisma from '../lib/prisma';
import { evaluateDeal, formatDealForClient, isBasketDeal, isDealAvailableNow, parseDealProductIds, type CartItemForBogo } from '../lib/deals';

const router = Router();

const parseJsonArray = (raw: string | null | undefined) => {
  if (!raw) return [] as string[];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
};

// GET /api/deals/:id/restaurants
// Returnerar dealen + alla restauranger som matchar (för att kunna bygga
// en dedikerad /deals/[id]-sida i web/RN). Logik:
//   - isGlobal=true → alla aktiva restauranger
//   - applicableRestaurantIds satt → bara dessa
//   - restaurantId satt → bara den
router.get('/:id/restaurants', async (req, res) => {
  try {
    const deal = await prisma.deal.findUnique({
      where: { id: req.params.id },
      include: { restaurant: { select: { id: true, name: true, slug: true } } },
    });
    if (!deal) return res.status(404).json({ error: 'Deal hittades inte' });

    let applicable: string[] = [];
    try {
      const parsed = JSON.parse(deal.applicableRestaurantIds || '[]');
      if (Array.isArray(parsed)) applicable = parsed.filter((id: unknown): id is string => typeof id === 'string');
    } catch { /* bad JSON tolererad */ }

    const restaurantWhere: any = deal.isGlobal
      ? {}
      : applicable.length > 0
        ? { id: { in: applicable } }
        : deal.restaurantId
          ? { id: deal.restaurantId }
          : { id: '__none__' };

    const restaurants = await prisma.restaurant.findMany({
      where: restaurantWhere,
      select: {
        id: true, slug: true, name: true, cuisine: true, address: true, city: true,
        imageUrl: true, heroImageUrl: true, rating: true, ratingCount: true,
        deliveryFee: true, etaMinutes: true, isOpen: true, pausedUntil: true,
      },
      orderBy: [{ featuredClass: 'asc' }, { rating: 'desc' }],
    });

    // Beräkna värdet på den aktuella dealen för en restaurang (i procent
    // för PERCENTAGE, eller kr-belopp/100 för FIXED). Används för att
    // jämföra "högre deal vinner" — om en restaurang har en specifik deal
    // som ger BÄTTRE rabatt än den globala dealen vi tittar på, exkluderar
    // vi restaurangen ur listan eftersom den globala dealen inte gäller där.
    const dealMagnitude = (d: { discountType: string; discountValue: number }) => {
      if (d.discountType === 'PERCENTAGE') return Number(d.discountValue || 0);
      // FIXED är öre — normalisera till kronor så storleken är jämförbar
      // med procent-talet (rough heuristic — admin sätter sällan fixed >100kr
      // OCH percent på samma restaurang).
      return Number(d.discountValue || 0) / 100;
    };
    const currentMagnitude = dealMagnitude(deal);

    // Hämta alla aktiva deals (utöver den vi tittar på) som kan vara
    // konkurrenter — antingen specifika för restaurangen eller andra
    // globala. Vi filtrerar restauranger där en konkurrent ger högre värde.
    const otherDeals = await prisma.deal.findMany({
      where: {
        id: { not: deal.id },
        isActive: true,
        OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
      },
      select: { id: true, restaurantId: true, isGlobal: true, applicableRestaurantIds: true, discountType: true, discountValue: true },
    });

    const restaurantHasBetterDeal = (restaurantId: string): boolean => {
      for (const other of otherDeals) {
        if (dealMagnitude(other) <= currentMagnitude) continue;
        if (other.restaurantId === restaurantId) return true;
        if (other.isGlobal) return true;
        try {
          const list = JSON.parse(other.applicableRestaurantIds || '[]');
          if (Array.isArray(list) && list.includes(restaurantId)) return true;
        } catch { /* tolerera bad JSON */ }
      }
      return false;
    };

    const visibleRestaurants = restaurants.filter((r) => !restaurantHasBetterDeal(r.id));

    const formatted = formatDealForClient(deal, {
      restaurant: deal.restaurant
        ? { id: deal.restaurant.id, name: deal.restaurant.name, slug: deal.restaurant.slug }
        : null,
      applicableRestaurantIds: applicable,
    });

    res.json({
      deal: formatted,
      restaurants: visibleRestaurants.map((r) => ({
        ...r,
        deliveryFee: (r.deliveryFee || 0) / 100,
      })),
    });
  } catch (error) {
    console.error('Deal restaurants error:', error);
    res.status(500).json({ error: 'Kunde inte hämta deal-restauranger' });
  }
});

// GET /api/deals/banners?slug=xxx — aktiva banner-deals för en restaurangs sida
router.get('/banners', async (req, res) => {
  try {
    let targetRestaurantId = typeof req.query.restaurantId === 'string' ? req.query.restaurantId : null;

    if (!targetRestaurantId && typeof req.query.slug === 'string' && req.query.slug.trim()) {
      const restaurant = await prisma.restaurant.findUnique({
        where: { slug: req.query.slug.trim() },
        select: { id: true },
      });
      targetRestaurantId = restaurant?.id || null;
    }

    if (!targetRestaurantId) return res.json([]);

    const deals = await prisma.deal.findMany({
      where: {
        isActive: true,
        showAsBanner: true,
        OR: [
          { restaurantId: targetRestaurantId },
          { applicableRestaurantIds: { contains: `"${targetRestaurantId}"` } },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    res.json(
      deals
        .filter((deal) => isDealAvailableNow(deal))
        .map((deal) => formatDealForClient(deal)),
    );
  } catch (error) {
    console.error('Banner deals error:', error);
    res.status(500).json({ error: 'Kunde inte hämta banner-deals' });
  }
});

router.get('/', async (req, res) => {
  try {
    let targetRestaurantId = typeof req.query.restaurantId === 'string' ? req.query.restaurantId : null;

    if (!targetRestaurantId && typeof req.query.slug === 'string' && req.query.slug.trim()) {
      const restaurant = await prisma.restaurant.findUnique({
        where: { slug: req.query.slug.trim() },
        select: { id: true },
      });
      targetRestaurantId = restaurant?.id || null;
    }

    const deals = await prisma.deal.findMany({
      where: {
        showOnSite: true,
        isActive: true,
        ...(targetRestaurantId
          ? {
              OR: [
                { isGlobal: true },
                { restaurantId: targetRestaurantId },
                { applicableRestaurantIds: { contains: `"${targetRestaurantId}"` } },
              ],
            }
          : {}),
      },
      include: {
        restaurant: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: [
        { sortOrder: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    const comboProductIds = [...new Set(deals.flatMap((deal) => parseDealProductIds(deal.comboProductIds)))];
    const comboProducts = comboProductIds.length
      ? await prisma.product.findMany({
          where: { id: { in: comboProductIds } },
          select: { id: true, name: true },
        })
      : [];

    const productNameMap = new Map(comboProducts.map((product) => [product.id, product.name]));

    res.json(
      deals
        .filter((deal) => isDealAvailableNow(deal) && isBasketDeal(deal))
        .map((deal) =>
          formatDealForClient(deal, {
            comboProductNames: parseDealProductIds(deal.comboProductIds).map((productId) => productNameMap.get(productId) || 'Valfri vara'),
            restaurant: deal.restaurant
              ? {
                  id: deal.restaurant.id,
                  name: deal.restaurant.name,
                  slug: deal.restaurant.slug,
                }
              : null,
            applicableRestaurantIds: parseJsonArray(deal.applicableRestaurantIds),
          }),
        ),
    );
  } catch (error) {
    console.error('Public deals error:', error);
    res.status(500).json({ error: 'Kunde inte hämta deals' });
  }
});

// POST /api/deals/evaluate-cart — server-side BOGO preview for cart UI
// Body: { restaurantId: string, items: Array<{productId: string, quantity: number}> }
router.post('/evaluate-cart', async (req, res) => {
  try {
    const { restaurantId, items } = req.body as { restaurantId?: string; items?: Array<{ productId: string; quantity: number }> };
    if (!restaurantId || !Array.isArray(items) || items.length === 0) {
      return res.json({ discountAmountOre: 0, discountAmountKr: 0, message: null, dealTitle: null });
    }

    const productIds = items.map((i) => i.productId).filter(Boolean);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, price: true, categoryId: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const cartItems: CartItemForBogo[] = items.map((item) => {
      const prod = productMap.get(item.productId);
      return {
        productId: item.productId,
        categoryId: prod?.categoryId ?? '',
        basePriceOre: prod?.price ?? 0,
        quantity: item.quantity ?? 1,
      };
    });

    const subtotalOre = cartItems.reduce((sum, item) => sum + item.basePriceOre * item.quantity, 0);
    const productIdsFlat = cartItems.flatMap((item) => Array.from({ length: item.quantity }, () => item.productId));

    const now = new Date();
    const deals = await prisma.deal.findMany({
      where: {
        isActive: true,
        AND: [
          {
            OR: [
              { isGlobal: true },
              { restaurantId },
              { applicableRestaurantIds: { contains: `"${restaurantId}"` } },
            ],
          },
        ],
      },
    });

    let bestDeal: (typeof deals)[number] | null = null;
    let bestDiscount = 0;

    for (const deal of deals) {
      if (!isDealAvailableNow(deal, now)) continue;
      const evaluation = evaluateDeal(deal, {
        subtotalOre,
        productIds: productIdsFlat,
        cartItems,
      });
      if (evaluation.eligible && evaluation.discountAmountOre > bestDiscount) {
        bestDiscount = evaluation.discountAmountOre;
        bestDeal = deal;
      }
    }

    res.json({
      discountAmountOre: bestDiscount,
      discountAmountKr: bestDiscount / 100,
      dealTitle: bestDeal?.title ?? null,
    });
  } catch (error) {
    console.error('Cart evaluate error:', error);
    res.json({ discountAmountOre: 0, discountAmountKr: 0, dealTitle: null });
  }
});

export default router;
