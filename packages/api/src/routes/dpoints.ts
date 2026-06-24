/**
 * Dpoints — kund-vända endpoints.
 *  GET  /api/dpoints/sponsor-card   publik — aktivt sponsor-kort (utloggade)
 *  GET  /api/dpoints/rewards        publik — intjänings-regler (Tjäna Dpoints)
 *  GET  /api/dpoints/me             inloggad — saldo + historik
 *
 * Spendering sker via "köp med poäng" på rewardable varor i kassan (se orders.ts),
 * inte via en inlösenskatalog. Den gamla redeem-vägen är borttagen.
 */
import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateUser } from './auth';
import { getDpointsSettings, getSignupClaim, claimSignupBonus, getDpointsEarnRules, getStreakState } from '../lib/dpoints';

const router = Router();

// Hur ofta varje regel kan tjänas (enkel indikator i kundens "Tjäna Dpoints").
const INVITE_CAP_30D = 5; // matchar DEFAULT_MAX_REWARDS_30D i invite.ts
function repeatLabel(key: string, streakTarget: number): string {
  switch (key) {
    case 'invite': return `Upp till ${INVITE_CAP_30D} per 30 dagar`;
    case 'review_rating':
    case 'review_text': return 'Varje recension';
    case 'new_restaurant': return 'Varje ny restaurang';
    case 'order_streak': return `${streakTarget} ordrar per 7 dagar`;
    default: return '';
  }
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

// Publik — aktiva intjänings-regler (driver kundens "Tjäna Dpoints"-lista).
// Inlösenskatalogen är borttagen; `rewards` behålls som tom array för bakåt-
// kompatibel responsform.
router.get('/rewards', async (_req, res) => {
  try {
    const settings = await getDpointsSettings();
    if (!settings.dpointsEnabled) return res.json({ enabled: false, valuePerKr: settings.dpointsValuePerKr, rewards: [], earnRules: [], streakTarget: settings.dpointsStreakTarget });
    const earnRules = (await getDpointsEarnRules())
      .filter((r) => r.enabled)
      .map((r) => ({ key: r.key, label: r.label, points: r.points, repeat: repeatLabel(r.key, settings.dpointsStreakTarget) }));
    res.json({ enabled: true, valuePerKr: settings.dpointsValuePerKr, rewards: [], earnRules, streakTarget: settings.dpointsStreakTarget });
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
    const [user, txs, streak] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { pointsBalance: true } }),
      prisma.pointsTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      getStreakState(userId),
    ]);
    const signup = await getSignupClaim(userId);
    res.json({
      enabled: settings.dpointsEnabled,
      balance: user?.pointsBalance ?? 0,
      valuePerKr: settings.dpointsValuePerKr,
      signup,
      streak,
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

// Inloggad — hämta (claima) välkomstbonusen. Funkar för alla signup-vägar
// (email/Google/Apple). Eligibility kollas server-side.
router.post('/claim-signup', authenticateUser, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Ej inloggad' });
    const result = await claimSignupBonus(userId);
    if ('error' in result) return res.status(400).json(result);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { pointsBalance: true } });
    res.json({ ok: true, points: result.points, balance: user?.pointsBalance ?? 0 });
  } catch (e: any) {
    console.error('[dpoints claim-signup] error:', e?.message);
    res.status(500).json({ error: 'Serverfel' });
  }
});

export default router;
