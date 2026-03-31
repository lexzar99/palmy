import { Router } from 'express';
import prisma from '../lib/prisma';
import { formatDealForClient, isDealAvailableNow, parseDealProductIds } from '../lib/deals';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const deals = await prisma.deal.findMany({
      where: {
        showOnSite: true,
        isActive: true,
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
          }),
        ),
    );
  } catch (error) {
    console.error('Public deals error:', error);
    res.status(500).json({ error: 'Kunde inte hämta deals' });
  }
});

export default router;
