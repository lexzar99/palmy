import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate, requireSuperAdmin);

const toOre = (amount: number) => Math.round(Number(amount || 0) * 100);
const fromOre = (amount?: number | null) => Number(amount || 0) / 100;

const parseDate = (value: unknown) => {
  const date = value ? new Date(String(value)) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
};

router.get('/', async (req, res) => {
  try {
    const { restaurantId } = req.query;
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);

    const payouts = await prisma.restaurantPayout.findMany({
      where: {
        ...(restaurantId ? { restaurantId: String(restaurantId) } : {}),
        ...(from && to ? { periodStart: from, periodEnd: to } : {}),
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            city: true,
            featuredClass: true,
          },
        },
      },
      orderBy: [{ periodStart: 'desc' }, { updatedAt: 'desc' }],
    });

    res.json(payouts.map((payout) => ({
      id: payout.id,
      restaurantId: payout.restaurantId,
      restaurant: payout.restaurant,
      periodStart: payout.periodStart,
      periodEnd: payout.periodEnd,
      grossSales: fromOre(payout.grossSales),
      orderCount: payout.orderCount,
      commissionAmount: fromOre(payout.commissionAmount),
      subscriptionAmount: fromOre(payout.subscriptionAmount),
      adjustmentAmount: fromOre(payout.adjustmentAmount),
      payoutAmount: fromOre(payout.payoutAmount),
      status: payout.status,
      notes: payout.notes,
      payoutReference: payout.payoutReference,
      approvedAt: payout.approvedAt,
      approvedBy: payout.approvedBy,
      paidAt: payout.paidAt,
      paidBy: payout.paidBy,
      createdAt: payout.createdAt,
      updatedAt: payout.updatedAt,
    })));
  } catch (error) {
    console.error('List payouts error:', error);
    res.status(500).json({ error: 'Kunde inte hämta utbetalningar' });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const {
      restaurantId,
      periodStart,
      periodEnd,
      grossSales,
      orderCount,
      commissionAmount,
      subscriptionAmount,
      adjustmentAmount,
      payoutAmount,
      status,
      notes,
      payoutReference,
    } = req.body;

    if (!restaurantId || !periodStart || !periodEnd) {
      return res.status(400).json({ error: 'Restaurang och period krävs' });
    }

    const start = parseDate(periodStart);
    const end = parseDate(periodEnd);
    if (!start || !end) {
      return res.status(400).json({ error: 'Ogiltig period' });
    }

    const nextStatus = ['DRAFT', 'APPROVED', 'PAID', 'HOLD'].includes(String(status || '').toUpperCase())
      ? String(status).toUpperCase()
      : 'DRAFT';

    const existing = await prisma.restaurantPayout.findUnique({
      where: {
        restaurantId_periodStart_periodEnd: {
          restaurantId: String(restaurantId),
          periodStart: start,
          periodEnd: end,
        },
      },
      select: {
        id: true,
        approvedAt: true,
        approvedBy: true,
        paidAt: true,
        paidBy: true,
      },
    });

    const updateData: any = {
      grossSales: toOre(Number(grossSales || 0)),
      orderCount: Math.max(0, Number(orderCount || 0)),
      commissionAmount: toOre(Number(commissionAmount || 0)),
      subscriptionAmount: toOre(Number(subscriptionAmount || 0)),
      adjustmentAmount: toOre(Number(adjustmentAmount || 0)),
      payoutAmount: toOre(Number(payoutAmount || 0)),
      status: nextStatus,
      notes: notes ? String(notes) : null,
      payoutReference: payoutReference ? String(payoutReference) : null,
      approvedAt: existing?.approvedAt || null,
      approvedBy: existing?.approvedBy || null,
      paidAt: existing?.paidAt || null,
      paidBy: existing?.paidBy || null,
    };

    if (nextStatus === 'APPROVED' && !existing?.approvedAt) {
      updateData.approvedAt = new Date();
      updateData.approvedBy = req.admin?.email || null;
      updateData.paidAt = null;
      updateData.paidBy = null;
    }

    if (nextStatus === 'PAID') {
      updateData.approvedAt = existing?.approvedAt || new Date();
      updateData.approvedBy = existing?.approvedBy || req.admin?.email || null;
      updateData.paidAt = existing?.paidAt || new Date();
      updateData.paidBy = existing?.paidBy || req.admin?.email || null;
    }

    if (nextStatus === 'DRAFT') {
      updateData.approvedAt = null;
      updateData.approvedBy = null;
      updateData.paidAt = null;
      updateData.paidBy = null;
    }

    if (nextStatus === 'HOLD') {
      updateData.paidAt = null;
      updateData.paidBy = null;
    }

    const payout = await prisma.restaurantPayout.upsert({
      where: {
        restaurantId_periodStart_periodEnd: {
          restaurantId: String(restaurantId),
          periodStart: start,
          periodEnd: end,
        },
      },
      update: updateData,
      create: {
        restaurantId: String(restaurantId),
        periodStart: start,
        periodEnd: end,
        ...updateData,
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            city: true,
            featuredClass: true,
          },
        },
      },
    });

    res.json({
      id: payout.id,
      restaurantId: payout.restaurantId,
      restaurant: payout.restaurant,
      periodStart: payout.periodStart,
      periodEnd: payout.periodEnd,
      grossSales: fromOre(payout.grossSales),
      orderCount: payout.orderCount,
      commissionAmount: fromOre(payout.commissionAmount),
      subscriptionAmount: fromOre(payout.subscriptionAmount),
      adjustmentAmount: fromOre(payout.adjustmentAmount),
      payoutAmount: fromOre(payout.payoutAmount),
      status: payout.status,
      notes: payout.notes,
      payoutReference: payout.payoutReference,
      approvedAt: payout.approvedAt,
      approvedBy: payout.approvedBy,
      paidAt: payout.paidAt,
      paidBy: payout.paidBy,
      createdAt: payout.createdAt,
      updatedAt: payout.updatedAt,
    });
  } catch (error) {
    console.error('Upsert payout error:', error);
    res.status(500).json({ error: 'Kunde inte spara utbetalningen' });
  }
});

export default router;
