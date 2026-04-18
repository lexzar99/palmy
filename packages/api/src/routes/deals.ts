import { Router } from 'express';
import prisma from '../lib/prisma';
import { formatDealForClient, isDealAvailableNow, parseDealProductIds } from '../lib/deals';

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
        AND: [
          {
            OR: [
              { isGlobal: true },
              { restaurant: { isOpen: true } },
              { restaurantId: null } // Fallback for deals not bound to a specific restaurant
            ]
          },
          ...(targetRestaurantId
            ? [{
                OR: [
                  { isGlobal: true },
                  { restaurantId: targetRestaurantId },
                  { applicableRestaurantIds: { contains: `"${targetRestaurantId}"` } },
                ]
              }]
            : [])
        ]
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
        .filter((deal) => isDealAvailableNow(deal))
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
