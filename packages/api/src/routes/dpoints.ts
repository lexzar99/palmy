/**
 * Dpoints — kund-vända endpoints.
 *  GET  /api/dpoints/sponsor-card   publik — aktivt sponsor-kort (utloggade)
 *  GET  /api/dpoints/rewards        publik — inlösenskatalog
 *  GET  /api/dpoints/me             inloggad — saldo + historik
 *  POST /api/dpoints/redeem         inloggad — lös in → personlig kod
 */
import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateUser } from './auth';
import { getDpointsSettings, redeemReward, RedeemError } from '../lib/dpoints';

const router = Router();

function formatReward(r: any) {
  const isPct = r.discountType === 'PERCENTAGE';
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    pointsCost: r.pointsCost,
    discountType: r.discountType,
    discountKr: isPct ? null : Math.round((r.discountValue ?? 0) / 100),
    discountPercent: isPct ? r.discountValue ?? 0 : null,
    minOrderKr: r.minOrderKr,
    validDays: r.validDays,
    imageUrl: r.imageUrl ?? null,
  };
}

const ACTIVE_WINDOW = (now: Date) => ({
  isActive: true,
  AND: [
    { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
    { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
  ],
});

// Publik — aktivt sponsor-kort. Visas för utloggade besökare.
router.get('/sponsor-card', async (_req, res) => {
  try {
    const settings = await getDpointsSettings();
    if (!settings.dpointsEnabled) return res.json({ card: null });
    const card = await prisma.sponsorCard.findFirst({
      where: ACTIVE_WINDOW(new Date()),
      orderBy: { createdAt: 'desc' },
    });
    if (!card) return res.json({ card: null });
    res.json({
      card: {
        id: card.id,
        title: card.title,
        sponsorName: card.sponsorName,
        description: card.description,
        imageUrl: card.imageUrl,
        bonusPoints: card.bonusPoints,
        ctaLabel: card.ctaLabel,
      },
    });
  } catch (e: any) {
    console.error('[dpoints sponsor-card] error:', e?.message);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// Publik — inlösenskatalog (aktiva belöningar).
router.get('/rewards', async (_req, res) => {
  try {
    const settings = await getDpointsSettings();
    if (!settings.dpointsEnabled) return res.json({ enabled: false, valuePerKr: settings.dpointsValuePerKr, rewards: [] });
    const rewards = await prisma.dpointsReward.findMany({
      where: { isActive: true },
      orderBy: { pointsCost: 'asc' },
    });
    res.json({ enabled: true, valuePerKr: settings.dpointsValuePerKr, rewards: rewards.map(formatReward) });
  } catch (e: any) {
    console.error('[dpoints rewards] error:', e?.message);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// Inloggad — saldo + senaste historik.
router.get('/me', authenticateUser, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Ej inloggad' });
    const settings = await getDpointsSettings();
    const [user, txs] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { pointsBalance: true } }),
      prisma.pointsTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    res.json({
      enabled: settings.dpointsEnabled,
      balance: user?.pointsBalance ?? 0,
      valuePerKr: settings.dpointsValuePerKr,
      transactions: txs.map((t) => ({
        id: t.id,
        amount: t.amount,
        type: t.type,
        reason: t.reason,
        balanceAfter: t.balanceAfter,
        createdAt: t.createdAt,
      })),
    });
  } catch (e: any) {
    console.error('[dpoints me] error:', e?.message);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// Inloggad — lös in en belöning → personlig kod (låst till kontot).
router.post('/redeem', authenticateUser, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Ej inloggad' });
    const settings = await getDpointsSettings();
    if (!settings.dpointsEnabled) return res.status(400).json({ error: 'Dpoints är inte aktiverat' });
    const rewardId = (req.body || {}).rewardId;
    if (!rewardId) return res.status(400).json({ error: 'rewardId krävs' });

    const result = await redeemReward(userId, String(rewardId));
    res.json({
      ok: true,
      code: result.code,
      balanceAfter: result.balanceAfter,
      reward: formatReward(result.reward),
    });
  } catch (e: any) {
    if (e instanceof RedeemError) return res.status(400).json({ error: e.message, code: e.code });
    console.error('[dpoints redeem] error:', e?.message);
    res.status(500).json({ error: 'Serverfel' });
  }
});

export default router;
