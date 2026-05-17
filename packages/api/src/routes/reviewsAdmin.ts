import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const isSuperAdmin = (req: AuthRequest) => req.admin?.role === 'SUPER_ADMIN';

const requireRestaurantScope = (req: AuthRequest, res: any): string | null => {
  if (isSuperAdmin(req)) return null;
  const rid = req.admin?.restaurantId;
  if (!rid) {
    res.status(403).json({ error: 'Kontot är inte kopplat till en restaurang' });
    return null;
  }
  return rid;
};

const resolveReviewScope = async (req: AuthRequest, res: any) => {
  if (isSuperAdmin(req)) {
    return req.query.restaurantId ? String(req.query.restaurantId) : null;
  }

  return requireRestaurantScope(req, res);
};

const ensureReviewAccess = async (req: AuthRequest, res: any, orderId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, restaurantId: true },
  });

  if (!order) {
    res.status(404).json({ error: 'Recension hittades inte' });
    return null;
  }

  if (!isSuperAdmin(req)) {
    const scopedRestaurantId = req.admin?.restaurantId;
    if (!scopedRestaurantId || order.restaurantId !== scopedRestaurantId) {
      res.status(403).json({ error: 'Du kan bara hantera recensioner för din egen restaurang' });
      return null;
    }
  }

  return order;
};

router.get('/', async (req, res) => {
  try {
    const restaurantId = await resolveReviewScope(req as AuthRequest, res);
    if (!isSuperAdmin(req as AuthRequest) && !restaurantId) return;

    const reviews = await prisma.order.findMany({
      where: {
        ...(restaurantId ? { restaurantId } : {}),
        rating: { not: null },
      },
      select: {
        id: true,
        customerName: true,
        rating: true,
        review: true,
        reviewReply: true,
        reviewFlagged: true,
        reviewedAt: true,
        createdAt: true,
        restaurantId: true,
        restaurant: { select: { name: true } },
      },
      orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
      take: 250,
    });

    res.json(reviews.map((review) => ({
      id: review.id,
      customerName: review.customerName,
      restaurantName: review.restaurant?.name || 'FoodGo',
      restaurantId: review.restaurantId,
      rating: review.rating,
      comment: review.review || '',
      reply: review.reviewReply || '',
      flagged: review.reviewFlagged,
      createdAt: (review.reviewedAt || review.createdAt).toISOString(),
    })));
  } catch (error) {
    console.error('List reviews error:', error);
    res.status(500).json({ error: 'Kunde inte hämta recensioner' });
  }
});

router.post('/:id/reply', async (req, res) => {
  try {
    const reviewOrder = await ensureReviewAccess(req as AuthRequest, res, req.params.id);
    if (!reviewOrder) return;

    const reply = String(req.body?.reply || '').trim();
    if (!reply) {
      return res.status(400).json({ error: 'Svar får inte vara tomt' });
    }

    const updated = await prisma.order.update({
      where: { id: reviewOrder.id },
      data: {
        reviewReply: reply,
        reviewRepliedAt: new Date(),
      },
    });

    res.json({ success: true, reply: updated.reviewReply, reviewRepliedAt: updated.reviewRepliedAt });
  } catch (error) {
    console.error('Reply review error:', error);
    res.status(500).json({ error: 'Kunde inte spara svar' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const reviewOrder = await ensureReviewAccess(req as AuthRequest, res, req.params.id);
    if (!reviewOrder) return;

    const updated = await prisma.order.update({
      where: { id: reviewOrder.id },
      data: {
        ...(req.body.flagged !== undefined ? { reviewFlagged: Boolean(req.body.flagged) } : {}),
      },
      select: { id: true, reviewFlagged: true },
    });

    res.json(updated);
  } catch (error) {
    console.error('Patch review error:', error);
    res.status(500).json({ error: 'Kunde inte uppdatera recensionen' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const reviewOrder = await ensureReviewAccess(req as AuthRequest, res, req.params.id);
    if (!reviewOrder) return;

    await prisma.order.update({
      where: { id: reviewOrder.id },
      data: {
        rating: null,
        review: null,
        reviewedAt: null,
        reviewFlagged: false,
        reviewReply: null,
        reviewRepliedAt: null,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({ error: 'Kunde inte radera recensionen' });
  }
});

export default router;
