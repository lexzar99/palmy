import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticateUser } from './auth';
import { normalizeMoneyToOre } from '../utils/deliveryZones';

const router = Router();

// GET /api/profile
// Helper: build a full name from first + last (or fallback to existing).
function joinFullName(first: string | null | undefined, last: string | null | undefined): string {
  return [first, last].filter(Boolean).join(' ').trim();
}

router.get('/', authenticateUser, async (req: any, res: any) => {
  try {
    const user = await (prisma as any).user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, firstName: true, lastName: true, phone: true, email: true, address: true, city: true, zip: true, isVerified: true, image: true, oauthProvider: true }
    });
    if (!user) return res.status(404).json({ error: 'Hittades inte' });
    // OAuth-only users must complete phone linking before they can use the
    // app. Surface the flag so the client can route them to the gate UI.
    const needsPhone = !!user.oauthProvider && (!user.phone || !user.isVerified);
    res.json({ ...user, needsPhone });
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// GET /api/profile/orders
router.get('/orders', authenticateUser, async (req: any, res: any) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      include: { restaurant: { select: { id: true, name: true, slug: true } }, items: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

const profileUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  firstName: z.string().max(60).optional(),
  lastName: z.string().max(60).optional(),
  email: z.string().email().optional().nullable(),
  address: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  zip: z.string().max(10).optional(),
});

// PATCH /api/profile
router.patch('/', authenticateUser, async (req: any, res: any) => {
  try {
    const data = profileUpdateSchema.parse(req.body);

    // Check email uniqueness if changing
    if (data.email) {
      const existing = await (prisma as any).user.findFirst({
        where: { email: data.email, id: { not: req.user.id } }
      });
      if (existing) {
        return res.status(400).json({ error: 'E-postadressen används redan' });
      }
    }

    // If firstName/lastName were sent (Apple Sign-In flow), ALSO synthesise
    // the legacy `name` column so any place that still reads `name` shows
    // the right thing. The reverse isn't done — a manually-edited `name`
    // doesn't overwrite the structured first/last fields.
    const update: Record<string, any> = { ...data };
    if ((data.firstName !== undefined || data.lastName !== undefined) && data.name === undefined) {
      const existing = await (prisma as any).user.findUnique({
        where: { id: req.user.id },
        select: { firstName: true, lastName: true },
      });
      const nextFirst = data.firstName ?? existing?.firstName ?? '';
      const nextLast = data.lastName ?? existing?.lastName ?? '';
      const joined = joinFullName(nextFirst, nextLast);
      if (joined) update.name = joined;
    }

    await (prisma as any).user.update({
      where: { id: req.user.id },
      data: update,
    });
    res.json({ success: true });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Ogiltiga uppgifter', details: error.errors });
    }
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

    const allDeals = await (prisma as any).customerDeal.findMany({
      where: {
        OR: [
          { userId: req.user.id },
          { phone: user.phone }
        ],
        isUsed: false,
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

    // Application-level filter: only return deals where usageCount < maxUsages
    const activDeals = allDeals.filter((d: any) => d.usageCount < (d.maxUsages || 1));

    // NOTE: Client expects kr. Some older rows may have been stored in kr instead of öre.
    const formatted = activDeals.map((deal: any) => {
      const campaign = deal.campaign;
      const discountType = campaign?.discountType;
      const discountValueRaw = campaign?.discountValue ?? 0;
      const minOrderOre = normalizeMoneyToOre(campaign?.minOrder ?? 0);
      const fixedDiscountOre = normalizeMoneyToOre(discountValueRaw);

      return {
        ...deal,
        campaign: campaign
          ? {
              ...campaign,
              // FIXED discountValue is stored in öre; PERCENTAGE is stored as percent.
              discountValue: discountType === 'FIXED' ? fixedDiscountOre / 100 : discountValueRaw,
              minOrder: minOrderOre / 100,
            }
          : campaign,
      };
    });

    res.json(formatted);
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

// GET /api/profile/previously-ordered/:restaurantId
// Returnerar den senaste ordern (med items) från just den restaurangen så att en användare
// kan återbeställa direkt från restaurangsidan.
router.get('/previously-ordered/:restaurantId', authenticateUser, async (req: any, res: any) => {
  try {
    const { restaurantId } = req.params;
    const lastOrder = await prisma.order.findFirst({
      where: {
        userId: req.user.id,
        restaurantId,
        status: { in: ['DELIVERED', 'READY', 'COMPLETED', 'PICKED_UP', 'DELIVERING'] },
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!lastOrder) return res.json({ hasHistory: false });
    res.json({
      hasHistory: true,
      orderId: lastOrder.id,
      orderNumber: lastOrder.orderNumber,
      createdAt: lastOrder.createdAt,
      itemCount: lastOrder.items.reduce((sum: number, it: any) => sum + it.quantity, 0),
      total: lastOrder.total / 100,
      items: lastOrder.items.map((it: any) => ({
        productId: it.productId,
        name: it.productName,
        quantity: it.quantity,
      })),
    });
  } catch (error) {
    console.error('Previously ordered error:', error);
    res.status(500).json({ error: 'Kunde inte hämta tidigare beställning' });
  }
});

// DELETE /api/profile - GDPR: Delete account
router.delete('/', authenticateUser, async (req: any, res: any) => {
  try {
    // 1. Identify user
    const userId = req.user.id;
    
    // 2. We don't delete orders (business record), but we disconnect them
    // and anonymize the data in the order records if they were tied specifically to this user
    await prisma.order.updateMany({
      where: { userId },
      data: { 
        userId: null,
        // Optional: Anonymize the order's PII fields if needed
        // customerName: 'Anonymiserad kund',
        // customerPhone: '0000000000',
        // customerEmail: null,
      }
    });

    // 3. Delete the user (SavedAddresses and CustomerDeals will be cascaded)
    await prisma.user.delete({
      where: { id: userId }
    });

    res.json({ success: true, message: 'Ditt konto och all tillhörande data har raderats.' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Kunde inte radera kontot. Kontakta support om problemet kvarstår.' });
  }
});

export default router;
