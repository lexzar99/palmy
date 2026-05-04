import { Router } from 'express';
import prisma from '../lib/prisma';
import { formatDealForClient, isBasketDeal, isDealAvailableNow, parseDealProductIds } from '../lib/deals';

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

    const formatted = formatDealForClient(deal, {
      restaurant: deal.restaurant
        ? { id: deal.restaurant.id, name: deal.restaurant.name, slug: deal.restaurant.slug }
        : null,
      applicableRestaurantIds: applicable,
    });

    res.json({
      deal: formatted,
      restaurants: restaurants.map((r) => ({
        ...r,
        deliveryFee: (r.deliveryFee || 0) / 100,
      })),
    });
  } catch (error) {
    console.error('Deal restaurants error:', error);
    res.status(500).json({ error: 'Kunde inte hämta deal-restauranger' });
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

export default router;
