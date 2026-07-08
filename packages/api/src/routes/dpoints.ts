/**
 * Vpoints — kund-vända endpoints.
 *  GET  /api/dpoints/sponsor-card   publik — aktivt sponsor-kort (utloggade)
 *  GET  /api/dpoints/rewards        publik — rewards-katalog + intjänings-regler
 *  GET  /api/dpoints/me             inloggad — saldo + historik
 *  POST /api/dpoints/redeem         inloggad — lös in reward till personlig deal
 */
import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateUser } from './auth';
import {
  RedeemError,
  claimSignupBonus,
  getDpointsEarnRules,
  getDpointsSettings,
  getSignupClaim,
  getStreakState,
  redeemReward,
} from '../lib/dpoints';

const router = Router();
const REWARD_PRODUCTS_CACHE_MS = 12_000;
let rewardProductsCache: { expiresAt: number; payload: any } | null = null;

// Hur ofta varje regel kan tjänas (enkel indikator i kundens "Tjäna Vpoints").
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

function rewardPointsPrice(product: { price: number; rewardPointsMultiplier?: number | null; rewardPointsPrice?: number | null }) {
  if (typeof product.rewardPointsPrice === 'number' && product.rewardPointsPrice > 0) return Math.ceil(product.rewardPointsPrice);
  const multiplier = Number(product.rewardPointsMultiplier ?? 1.5);
  return Math.ceil((product.price / 100) * (Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1.5));
}

function rewardTier(points: number) {
  if (points <= 50) return { key: 'quick', label: 'Snabba rewards', rank: 1 };
  if (points <= 150) return { key: 'popular', label: 'Populära rewards', rank: 2 };
  if (points <= 300) return { key: 'premium', label: 'Premium rewards', rank: 3 };
  return { key: 'limited', label: 'Limited rewards', rank: 4 };
}

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

// Publik — aktiva inlösningar + intjänings-regler (driver Vpoints-sidan).
router.get('/rewards', async (_req, res) => {
  try {
    const settings = await getDpointsSettings();
    if (!settings.dpointsEnabled) return res.json({ enabled: false, valuePerKr: settings.dpointsValuePerKr, rewards: [], earnRules: [], streakTarget: settings.dpointsStreakTarget });
    const [earnRules, rewards] = await Promise.all([
      getDpointsEarnRules(),
      prisma.dpointsReward.findMany({
        where: { isActive: true },
        orderBy: [{ pointsCost: 'asc' }, { createdAt: 'desc' }],
      }),
    ]);
    res.json({
      enabled: true,
      valuePerKr: settings.dpointsValuePerKr,
      rewards: rewards.map((reward) => ({
        id: reward.id,
        title: reward.title,
        description: reward.description,
        pointsCost: reward.pointsCost,
        discountType: reward.discountType,
        discountValue: reward.discountValue,
        minOrderKr: reward.minOrderKr,
        freeDelivery: reward.freeDelivery,
        validDays: reward.validDays,
        imageUrl: reward.imageUrl,
      })),
      earnRules: earnRules
        .filter((r) => r.enabled)
        .map((r) => ({ key: r.key, label: r.label, points: r.points, repeat: repeatLabel(r.key, settings.dpointsStreakTarget) })),
      streakTarget: settings.dpointsStreakTarget,
    });
  } catch (e: any) {
    console.error('[dpoints rewards] error:', e?.message);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// Publik — rewardable produkter. Driver Rewards-sidan som en discovery-yta:
// kunden ser vad som kan köpas med points och navigerar till restaurangen.
router.get('/reward-products', async (req, res) => {
  try {
    const nowMs = Date.now();
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    if (!forceRefresh && rewardProductsCache && rewardProductsCache.expiresAt > nowMs) {
      return res.json(rewardProductsCache.payload);
    }

    const settings = await getDpointsSettings();
    if (!settings.dpointsEnabled) {
      const payload = { enabled: false, earnRate: settings.dpointsPerKr, restaurants: [] };
      if (!forceRefresh) rewardProductsCache = { expiresAt: nowMs + REWARD_PRODUCTS_CACHE_MS, payload };
      return res.json(payload);
    }

    const products = await prisma.product.findMany({
      where: {
        rewardable: true,
        isActive: true,
        category: {
          isActive: true,
        },
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            restaurant: { select: { id: true, name: true, slug: true, cuisine: true, imageUrl: true, rating: true, ratingCount: true } },
          },
        },
      },
      orderBy: [{ price: 'desc' }, { updatedAt: 'desc' }],
      take: 160,
    });

    const byRestaurant = new Map<string, any>();
    for (const product of products as any[]) {
      const restaurant = product.category?.restaurant;
      if (!restaurant) continue;
      const pointsPrice = rewardPointsPrice(product);
      const tier = rewardTier(pointsPrice);
      const row = {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price / 100,
        imageUrl: product.imageUrl,
        categoryId: product.categoryId,
        categoryName: product.category?.name ?? null,
        pointsPrice,
        multiplier: product.rewardPointsMultiplier ?? 1.5,
        tier,
      };
      if (!byRestaurant.has(restaurant.id)) {
        byRestaurant.set(restaurant.id, {
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          cuisine: restaurant.cuisine,
          imageUrl: restaurant.imageUrl,
          logoUrl: null,
          rating: restaurant.rating,
          ratingCount: restaurant.ratingCount,
          bestTierRank: tier.rank,
          products: [],
        });
      }
      const group = byRestaurant.get(restaurant.id);
      group.bestTierRank = Math.max(group.bestTierRank, tier.rank);
      group.products.push(row);
    }

    const restaurants = Array.from(byRestaurant.values())
      .map((restaurant) => ({
        ...restaurant,
        products: restaurant.products.sort((a: any, b: any) => b.pointsPrice - a.pointsPrice),
      }))
      .sort((a, b) => b.bestTierRank - a.bestTierRank || b.products[0].pointsPrice - a.products[0].pointsPrice || a.name.localeCompare(b.name, 'sv'));

    const payload = { enabled: true, earnRate: settings.dpointsPerKr, restaurants };
    rewardProductsCache = { expiresAt: nowMs + REWARD_PRODUCTS_CACHE_MS, payload };
    res.json(payload);
  } catch (e: any) {
    console.error('[dpoints reward-products] error:', e?.message);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// Inloggad — lös in en aktiv DpointsReward till en personlig dealkod.
router.post('/redeem', authenticateUser, async (req: any, res) => {
  try {
    const settings = await getDpointsSettings();
    if (!settings.dpointsEnabled) return res.status(403).json({ error: 'Vpoints är avstängt', code: 'DISABLED' });
    const userId = req.user?.id;
    const rewardId = String(req.body?.rewardId || '').trim();
    if (!userId) return res.status(401).json({ error: 'Ej inloggad' });
    if (!rewardId) return res.status(400).json({ error: 'rewardId saknas', code: 'NO_REWARD_ID' });

    const result = await redeemReward(userId, rewardId);
    res.json({
      ok: true,
      code: result.code,
      balance: result.balanceAfter,
      reward: {
        id: result.reward.id,
        title: result.reward.title,
        description: result.reward.description,
        pointsCost: result.reward.pointsCost,
        discountType: result.reward.discountType,
        discountValue: result.reward.discountValue,
        minOrderKr: result.reward.minOrderKr,
        freeDelivery: result.reward.freeDelivery,
        validDays: result.reward.validDays,
        imageUrl: result.reward.imageUrl,
      },
    });
  } catch (e: any) {
    if (e instanceof RedeemError) {
      const status = e.code === 'INSUFFICIENT' || e.code === 'NO_REWARD' || e.code === 'NO_PHONE' ? 400 : 409;
      return res.status(status).json({ error: e.message, code: e.code });
    }
    console.error('[dpoints redeem] error:', e?.message);
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
