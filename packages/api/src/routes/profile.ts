import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateUser } from './auth';

const router = Router();

// GET /api/profile
router.get('/', authenticateUser, async (req: any, res: any) => {
  try {
    const user = await (prisma as any).user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, phone: true, email: true, address: true, city: true, zip: true, isVerified: true }
    });
    if (!user) return res.status(404).json({ error: 'Hittades inte' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// GET /api/profile/orders
router.get('/orders', authenticateUser, async (req: any, res: any) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      include: { restaurant: { select: { name: true } }, items: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// PATCH /api/profile
router.patch('/', authenticateUser, async (req: any, res: any) => {
  try {
    const { name, email, address, city, zip } = req.body;
    await (prisma as any).user.update({
      where: { id: req.user.id },
      data: { name, email, address, city, zip }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// GET /api/profile/deals - Fetch current user's deals
router.get('/deals', authenticateUser, async (req: any, res: any) => {
  try {
    const user = await (prisma as any).user.findUnique({
      where: { id: req.user.id },
      select: { phone: true }
    });

    if (!user?.phone) return res.json([]);

    const deals = await (prisma as any).customerDeal.findMany({
      where: {
        OR: [
          { userId: req.user.id },
          { phone: user.phone }
        ],
        isUsed: false,
        usageCount: { lt: (prisma as any).customerDeal.fields?.maxUsages ?? 1 },
        campaign: {
          isActive: true,
          OR: [
            { validUntil: null },
            { validUntil: { gte: new Date() } }
          ]
        }
      },
      include: { campaign: true }
    });

    res.json(deals);
  } catch (error) {
    console.error('Fetch deals error:', error);
    res.status(500).json({ error: 'Kunde inte hämta erbjudanden' });
  }
});

// ─── Saved Addresses ────────────────────────────────────────────────────────

// GET /api/profile/addresses
router.get('/addresses', authenticateUser, async (req: any, res: any) => {
  try {
    const addresses = await (prisma as any).savedAddress.findMany({
      where: { userId: req.user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
    });
    res.json(addresses);
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte hämta adresser' });
  }
});

// POST /api/profile/addresses
router.post('/addresses', authenticateUser, async (req: any, res: any) => {
  try {
    const { label, street, city, zip, note, isDefault } = req.body;
    if (!street || !city || !zip) {
      return res.status(400).json({ error: 'Adress, stad och postnummer krävs' });
    }
    if (isDefault) {
      await (prisma as any).savedAddress.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false }
      });
    }
    const address = await (prisma as any).savedAddress.create({
      data: { userId: req.user.id, label: label || 'Hem', street, city, zip, note, isDefault: isDefault || false }
    });
    res.status(201).json(address);
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte spara adress' });
  }
});

// PATCH /api/profile/addresses/:id
router.patch('/addresses/:id', authenticateUser, async (req: any, res: any) => {
  try {
    const { label, street, city, zip, note, isDefault } = req.body;
    const existing = await (prisma as any).savedAddress.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!existing) return res.status(404).json({ error: 'Adress hittades inte' });
    if (isDefault) {
      await (prisma as any).savedAddress.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false }
      });
    }
    const updated = await (prisma as any).savedAddress.update({
      where: { id: req.params.id },
      data: { label, street, city, zip, note, isDefault }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte uppdatera adress' });
  }
});

// DELETE /api/profile/addresses/:id
router.delete('/addresses/:id', authenticateUser, async (req: any, res: any) => {
  try {
    const existing = await (prisma as any).savedAddress.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!existing) return res.status(404).json({ error: 'Adress hittades inte' });
    await (prisma as any).savedAddress.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte radera adress' });
  }
});

// ─── Reviews & Ratings ──────────────────────────────────────────────────────

// POST /api/profile/orders/:id/review
router.post('/orders/:id/review', authenticateUser, async (req: any, res: any) => {
  try {
    const { rating, review } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Betyg måste vara mellan 1-5' });
    }
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!order) return res.status(404).json({ error: 'Order hittades inte' });
    if (!['DELIVERED', 'READY'].includes(order.status)) {
      return res.status(400).json({ error: 'Du kan bara betygsätta levererade ordrar' });
    }
    if (order.rating) {
      return res.status(400).json({ error: 'Du har redan betygsatt denna order' });
    }

    await prisma.order.update({
      where: { id: req.params.id },
      data: { rating, review: review || null, reviewedAt: new Date() }
    });

    // Update restaurant average rating from real data
    if (order.restaurantId) {
      const stats = await prisma.order.aggregate({
        where: { restaurantId: order.restaurantId, rating: { not: null } },
        _avg: { rating: true },
        _count: { rating: true }
      });
      if (stats._avg.rating != null) {
        await prisma.restaurant.update({
          where: { id: order.restaurantId },
          data: { rating: Math.round(stats._avg.rating * 10) / 10, ratingCount: stats._count.rating }
        });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Review error:', error);
    res.status(500).json({ error: 'Kunde inte spara recension' });
  }
});

// ─── Reorder ────────────────────────────────────────────────────────────────

// GET /api/profile/orders/:id/reorder
router.get('/orders/:id/reorder', authenticateUser, async (req: any, res: any) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { items: true, restaurant: { select: { id: true, slug: true, name: true, isOpen: true } } }
    });
    if (!order) return res.status(404).json({ error: 'Order hittades inte' });

    const productIds = order.items.map((i: any) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      include: {
        extraGroups: { include: { extraGroup: { include: { extras: { where: { isActive: true } } } } } }
      }
    });
    const productMap = new Map(products.map(p => [p.id, p]));

    const cartItems = order.items.map((item: any) => {
      const product = productMap.get(item.productId);
      if (!product) return null;
      const savedExtras = typeof item.selectedExtras === 'string' ? JSON.parse(item.selectedExtras) : (item.selectedExtras || []);
      const validExtras = savedExtras.filter((ex: any) =>
        product.extraGroups.some((peg: any) => peg.extraGroup.extras.some((e: any) => e.id === ex.extraId))
      );
      return {
        productId: product.id,
        name: product.name,
        price: product.price / 100,
        quantity: item.quantity,
        restaurantId: order.restaurantId,
        extras: validExtras.map((ex: any) => ({
          groupId: ex.groupId, groupName: ex.groupName, extraId: ex.extraId, name: ex.extraName, price: ex.priceAddon || 0,
        })),
        note: item.note
      };
    }).filter(Boolean);

    const unavailable = order.items.filter((i: any) => !productMap.has(i.productId)).map((i: any) => i.productName);

    res.json({
      restaurantId: order.restaurantId,
      restaurantSlug: (order as any).restaurant?.slug,
      restaurantName: (order as any).restaurant?.name,
      isOpen: (order as any).restaurant?.isOpen,
      items: cartItems,
      unavailableItems: unavailable,
      originalOrderNumber: order.orderNumber,
    });
  } catch (error) {
    console.error('Reorder error:', error);
    res.status(500).json({ error: 'Kunde inte förbereda ombeställning' });
  }
});

export default router;
