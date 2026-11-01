import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { OFFER_VISIT_ENGINE, OfferVisitSchema, summarizeOfferVisits, type OfferVisit } from '../lib/offerVisits';

/** Publik mätpunkt för /erbjudande. Monteras på /api/offer-stats, adminvyn på /api/admin/offer-stats. */
const router = Router();

/** Sidan skickar besökets läge flera gånger. Samma id skriver över, så ett besök alltid är en rad. */
router.post('/', async (req, res) => {
  const parsed = OfferVisitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Ogiltig mätning' });
  const { id, ...meta } = parsed.data;
  const rowId = `offervisit_${id}`;
  try {
    await prisma.engineEvent.upsert({
      where: { id: rowId },
      create: { id: rowId, engine: OFFER_VISIT_ENGINE, message: 'visit', meta },
      update: { meta },
    });
    return res.status(204).end();
  } catch (error) {
    console.error('[offer-stats] error:', (error as Error)?.message ?? error);
    return res.status(500).json({ error: 'Kunde inte spara mätningen' });
  }
});

export const offerStatsAdminRouter = Router();
offerStatsAdminRouter.use(authenticate, requireSuperAdmin);

const MAX_DAYS = 90;
const DAY = 24 * 60 * 60 * 1000;

/** GET /api/admin/offer-stats?days=7 — sammanställning. Besök äldre än 90 dagar tas bort här. */
offerStatsAdminRouter.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const days = Math.min(MAX_DAYS, Math.max(1, Number(req.query.days) || 7));
  try {
    await prisma.engineEvent.deleteMany({ where: { engine: OFFER_VISIT_ENGINE, createdAt: { lt: new Date(Date.now() - MAX_DAYS * DAY) } } });
    const rows = await prisma.engineEvent.findMany({
      where: { engine: OFFER_VISIT_ENGINE, createdAt: { gte: new Date(Date.now() - days * DAY) } },
      orderBy: { createdAt: 'desc' },
      take: 50000,
      select: { meta: true },
    });
    const visits = rows.map((row) => row.meta as OfferVisit | null).filter((meta): meta is OfferVisit => Boolean(meta?.stage));
    return res.json({ days, ...summarizeOfferVisits(visits) });
  } catch (error) {
    console.error('[admin/offer-stats] error:', (error as Error)?.message ?? error);
    return res.status(500).json({ error: 'Kunde inte hämta statistiken' });
  }
});

export default router;
