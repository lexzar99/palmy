import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin } from '../middleware/auth';

const router = Router();

// GET /api/customers - List all users with order summary
router.get('/', authenticate, requireSuperAdmin, async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        _count: {
          select: { orders: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte hämta kunder' });
  }
});

// GET /api/customers/:id - Single customer details
router.get('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        orders: {
          include: { restaurant: { select: { name: true } } },
          orderBy: { createdAt: 'desc' }
        },
        deals: {
          include: { campaign: true }
        }
      }
    });
    if (!user) return res.status(404).json({ error: 'Kunden hittades inte' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte hämta kunddetaljer' });
  }
});

// PATCH /api/customers/:id - Update customer (Super Admin)
router.patch('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { name, phone, email, address, city, zip, isActive, isVerified } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { name, phone, email, address, city, zip, isActive, isVerified }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte uppdatera kunden' });
  }
});

// DELETE /api/customers/:id - Delete customer
router.delete('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte ta bort kunden' });
  }
});

// Granular Deal Management
router.delete('/:id/deals/:dealId', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    await prisma.customerDeal.delete({
      where: { id: req.params.dealId }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte radera erbjudandet' });
  }
});

router.patch('/:id/deals/:dealId', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { isUsed, usageCount } = req.body;
    const deal = await prisma.customerDeal.update({
      where: { id: req.params.dealId },
      data: { isUsed, usageCount: Number(usageCount) }
    });
    res.json(deal);
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte uppdatera erbjudandet' });
  }
});

export default router;
