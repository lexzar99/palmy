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

export default router;
