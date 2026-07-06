/**
 * GET /api/admin/ops — lätt driftsnapshot för vakt-cron (Falken/systemvakten).
 *
 * Till skillnad från /api/admin/api-health gör den INGA testanrop mot externa
 * tjänster (kan pollas var 5:e minut utan att bränna kvoter): bara interna
 * counters (429/5xx/slow), DB-ping och betalnings-/orderhälsa ur databasen.
 */
import { Router } from 'express';
import { authenticate, requireOpsViewer } from '../middleware/auth';
import { getOpsMetrics } from '../lib/opsMetrics';
import prisma from '../lib/prisma';

const router = Router();

router.get('/', authenticate, requireOpsViewer, async (_req, res) => {
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbPingMs = Date.now() - dbStart;

    // Betalningshälsa: ordrar som fastnat före betalning är det kunderna
    // faktiskt drabbas av (stängd Mollie-flik, avbruten Swish osv).
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [stuckAwaitingPayment, failedPayments24h, cancelled24h] = await Promise.all([
      prisma.order.count({
        where: { status: 'AWAITING_PAYMENT', createdAt: { lt: thirtyMinAgo, gt: dayAgo } },
      }),
      prisma.order.count({
        where: { paymentStatus: 'FAILED', createdAt: { gt: dayAgo } },
      }),
      prisma.order.count({
        where: { status: 'CANCELLED', createdAt: { gt: dayAgo } },
      }),
    ]);

    res.json({
      ...getOpsMetrics(),
      dbPingMs,
      payments: { stuckAwaitingPayment, failedPayments24h, cancelled24h },
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[admin/ops] error:', e?.message);
    res.status(500).json({ error: 'Kunde inte hämta driftmetrik' });
  }
});

export default router;
