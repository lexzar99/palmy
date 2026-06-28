/**
 * Dpoints — admin-endpoints (monteras under /api/admin/dpoints).
 * All läsning kräver inloggad admin (authenticate); all mutation kräver
 * requireSuperAdmin + skrivs till AuditLog.
 *
 *  GET   /config                       Dpoints-inställningar
 *  PATCH /config                       uppdatera cashback, saldo-tak och Dpoints-kurirfallback
 *  GET   /overview                     nyckeltal för sidan
 *  GET   /sponsor-cards   POST/PATCH/DELETE /sponsor-cards[/:id]
 *  GET   /campaigns       POST/PATCH/DELETE /campaigns[/:id]
 *  GET   /customers?search=            kunder + saldo
 *  GET   /customers/:id                kund + historik
 *  POST  /customers/:id/adjust         manuell justering (+/-) med anledning
 *  GET   /redemptions                  utfärdade inlösen-koder (vem/vad/kod)
 */
import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import { audit } from '../lib/auditLog';
import { recordPointsTx, parseEarnRules } from '../lib/dpoints';

const router = Router();
router.use(authenticate);

const toDate = (v: any): Date | null => (v ? new Date(v) : null);
const num = (v: any, d = 0): number => (Number.isFinite(Number(v)) ? Number(v) : d);

// ── Config ────────────────────────────────────────────────────────────────
router.get('/config', async (_req, res) => {
  const row: any = (await prisma.restaurantSettings.findUnique({ where: { id: 'settings' } })) || {};
  res.json({
    dpointsEnabled: row.dpointsEnabled ?? false,
    dpointsPerKr: row.dpointsPerKr ?? 0.1,
    dpointsValuePerKr: row.dpointsValuePerKr ?? 10,
    dpointsCardOnHome: row.dpointsCardOnHome ?? true,
    dpointsMaxBalance: row.dpointsMaxBalance ?? 2500,
    dpointsCourierCost: row.dpointsCourierCost ?? 0,
    dpointsCourierTiers: row.dpointsCourierTiers ?? '[]',
    dpointsEarnRules: parseEarnRules(row.dpointsEarnRules),
    dpointsStreakTarget: Math.max(2, Math.round(row.dpointsStreakTarget ?? 3)),
  });
});

router.patch('/config', requireSuperAdmin, async (req, res) => {
  try {
    const { dpointsEnabled, dpointsPerKr, dpointsValuePerKr } = req.body || {};
    const data: any = {};
    if (dpointsEnabled !== undefined) data.dpointsEnabled = !!dpointsEnabled;
    if (dpointsPerKr !== undefined) data.dpointsPerKr = Math.max(0, Number(dpointsPerKr) || 0);
    if (dpointsValuePerKr !== undefined) data.dpointsValuePerKr = Math.max(1, Math.round(Number(dpointsValuePerKr) || 10));
    if (req.body?.dpointsCardOnHome !== undefined) data.dpointsCardOnHome = !!req.body.dpointsCardOnHome;
    if (req.body?.dpointsMaxBalance !== undefined) data.dpointsMaxBalance = Math.max(0, Math.round(Number(req.body.dpointsMaxBalance) || 0));
    if (req.body?.dpointsCourierCost !== undefined) data.dpointsCourierCost = Math.max(0, Math.round(Number(req.body.dpointsCourierCost) || 0));
    // Km-baserad budkostnad-tariff: sanera + sortera innan lagring (JSON-sträng).
    if (req.body?.dpointsCourierTiers !== undefined) {
      try {
        const raw = typeof req.body.dpointsCourierTiers === 'string'
          ? JSON.parse(req.body.dpointsCourierTiers)
          : req.body.dpointsCourierTiers;
        const clean = Array.isArray(raw)
          ? raw
              .map((t: any) => ({ maxKm: Number(t?.maxKm), feeKr: Number(t?.feeKr) }))
              .filter((t: any) => Number.isFinite(t.maxKm) && t.maxKm > 0 && Number.isFinite(t.feeKr) && t.feeKr >= 0)
              .sort((a: any, b: any) => a.maxKm - b.maxKm)
          : [];
        data.dpointsCourierTiers = JSON.stringify(clean);
      } catch { /* ogiltig JSON ignoreras */ }
    }
    // Intjänings-regler (toggle + poäng per handling). Normaliseras mot default-
    // uppsättningen så bara kända nycklar + giltiga värden lagras.
    if (req.body?.dpointsEarnRules !== undefined) {
      data.dpointsEarnRules = JSON.stringify(parseEarnRules(req.body.dpointsEarnRules));
    }
    // Streak-mål: antal betalda ordrar inom 7 dagar (minst 2).
    if (req.body?.dpointsStreakTarget !== undefined) {
      data.dpointsStreakTarget = Math.max(2, Math.round(Number(req.body.dpointsStreakTarget) || 3));
    }

    const updated = await prisma.restaurantSettings.upsert({
      where: { id: 'settings' },
      create: { id: 'settings', ...data },
      update: data,
    });
    await audit(req as AuthRequest, 'DPOINTS_CONFIG_UPDATE', { resourceType: 'RestaurantSettings', resourceId: 'settings', changes: data });
    res.json({
      dpointsEnabled: (updated as any).dpointsEnabled,
      dpointsPerKr: (updated as any).dpointsPerKr,
      dpointsValuePerKr: (updated as any).dpointsValuePerKr,
      dpointsCardOnHome: (updated as any).dpointsCardOnHome,
      dpointsMaxBalance: (updated as any).dpointsMaxBalance,
      dpointsCourierCost: (updated as any).dpointsCourierCost,
      dpointsCourierTiers: (updated as any).dpointsCourierTiers,
      dpointsEarnRules: parseEarnRules((updated as any).dpointsEarnRules),
      dpointsStreakTarget: Math.max(2, Math.round((updated as any).dpointsStreakTarget ?? 3)),
    });
  } catch (e: any) {
    console.error('[dpoints config] error:', e?.message);
    res.status(500).json({ error: 'Kunde inte spara inställningar' });
  }
});

// ── Overview (nyckeltal) ────────────────────────────────────────────────────
router.get('/overview', async (_req, res) => {
  try {
    const [outstanding, earned, redeemed, holders] = await Promise.all([
      prisma.user.aggregate({ _sum: { pointsBalance: true } }),
      prisma.pointsTransaction.aggregate({ _sum: { amount: true }, where: { amount: { gt: 0 } } }),
      prisma.pointsTransaction.aggregate({ _sum: { amount: true }, where: { type: 'REDEEM' } }),
      prisma.user.count({ where: { pointsBalance: { gt: 0 } } }),
    ]);
    res.json({
      outstanding: outstanding._sum.pointsBalance ?? 0,
      totalEarned: earned._sum.amount ?? 0,
      totalRedeemed: Math.abs(redeemed._sum.amount ?? 0),
      holders,
    });
  } catch (e: any) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// ── Sponsor-kort ────────────────────────────────────────────────────────────
router.get('/sponsor-cards', async (_req, res) => {
  const cards = await prisma.sponsorCard.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ cards });
});

router.post('/sponsor-cards', requireSuperAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.title) return res.status(400).json({ error: 'Titel krävs' });
    const card = await prisma.sponsorCard.create({
      data: {
        title: String(b.title),
        sponsorName: b.sponsorName || null,
        description: b.description || null,
        imageUrl: b.imageUrl || null,
        bonusPoints: Math.max(0, num(b.bonusPoints, 100)),
        ctaLabel: b.ctaLabel || null,
        isActive: b.isActive !== undefined ? !!b.isActive : true,
        startsAt: toDate(b.startsAt),
        endsAt: toDate(b.endsAt),
      },
    });
    await audit(req as AuthRequest, 'DPOINTS_SPONSOR_CREATE', { resourceType: 'SponsorCard', resourceId: card.id, changes: { title: card.title, bonusPoints: card.bonusPoints } });
    res.status(201).json(card);
  } catch (e: any) {
    console.error('[dpoints sponsor create] error:', e?.message);
    res.status(500).json({ error: 'Kunde inte skapa sponsor-kort' });
  }
});

router.patch('/sponsor-cards/:id', requireSuperAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const data: any = {};
    for (const k of ['title', 'sponsorName', 'description', 'imageUrl', 'ctaLabel']) if (b[k] !== undefined) data[k] = b[k] || null;
    if (b.bonusPoints !== undefined) data.bonusPoints = Math.max(0, num(b.bonusPoints));
    if (b.isActive !== undefined) data.isActive = !!b.isActive;
    if (b.startsAt !== undefined) data.startsAt = toDate(b.startsAt);
    if (b.endsAt !== undefined) data.endsAt = toDate(b.endsAt);
    const card = await prisma.sponsorCard.update({ where: { id: req.params.id }, data });
    await audit(req as AuthRequest, 'DPOINTS_SPONSOR_UPDATE', { resourceType: 'SponsorCard', resourceId: card.id, changes: data });
    res.json(card);
  } catch (e: any) {
    res.status(500).json({ error: 'Kunde inte uppdatera sponsor-kort' });
  }
});

router.delete('/sponsor-cards/:id', requireSuperAdmin, async (req, res) => {
  try {
    await prisma.sponsorCard.delete({ where: { id: req.params.id } });
    await audit(req as AuthRequest, 'DPOINTS_SPONSOR_DELETE', { resourceType: 'SponsorCard', resourceId: req.params.id });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: 'Kunde inte ta bort sponsor-kort' });
  }
});

// ── Inlösen-belöningar (RETIRERAD) ───────────────────────────────────────────
// Den gamla inlösenskatalogen (DpointsReward CRUD) är borttagen. Spendering sker
// nu via "köp med poäng" på rewardable varor i Meny/kassan. Modellen behålls för
// historik (gamla REDEEM-poster), men admin hanterar inte längre någon katalog.

// ── Kampanjer / utmaningar ──────────────────────────────────────────────────
function campaignWriteData(b: any) {
  const data: any = {};
  if (b.name !== undefined) data.name = String(b.name);
  if (b.description !== undefined) data.description = b.description || null;
  if (b.type !== undefined) data.type = ['MULTIPLIER', 'STREAK_DAILY', 'STREAK_WEEKLY'].includes(b.type) ? b.type : 'MULTIPLIER';
  if (b.isActive !== undefined) data.isActive = !!b.isActive;
  if (b.startsAt !== undefined) data.startsAt = toDate(b.startsAt);
  if (b.endsAt !== undefined) data.endsAt = toDate(b.endsAt);
  if (b.minOrderKr !== undefined) data.minOrderKr = Math.max(0, num(b.minOrderKr));
  if (b.multiplier !== undefined) data.multiplier = b.multiplier === null ? null : Math.max(1, Number(b.multiplier) || 1);
  if (b.rewardPoints !== undefined) data.rewardPoints = b.rewardPoints === null ? null : Math.max(0, num(b.rewardPoints));
  if (b.targetCount !== undefined) data.targetCount = b.targetCount === null ? null : Math.max(1, num(b.targetCount, 1));
  if (b.repeatable !== undefined) data.repeatable = !!b.repeatable;
  return data;
}

router.get('/campaigns', async (_req, res) => {
  const campaigns = await prisma.pointsCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { progress: true } } },
  });
  res.json({ campaigns });
});

router.post('/campaigns', requireSuperAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ error: 'Namn krävs' });
    const data = campaignWriteData(b);
    if (!data.type) data.type = 'MULTIPLIER';
    const campaign = await prisma.pointsCampaign.create({ data });
    await audit(req as AuthRequest, 'DPOINTS_CAMPAIGN_CREATE', { resourceType: 'PointsCampaign', resourceId: campaign.id, changes: data });
    res.status(201).json(campaign);
  } catch (e: any) {
    console.error('[dpoints campaign create] error:', e?.message);
    res.status(500).json({ error: 'Kunde inte skapa kampanj' });
  }
});

router.patch('/campaigns/:id', requireSuperAdmin, async (req, res) => {
  try {
    const data = campaignWriteData(req.body || {});
    const campaign = await prisma.pointsCampaign.update({ where: { id: req.params.id }, data });
    await audit(req as AuthRequest, 'DPOINTS_CAMPAIGN_UPDATE', { resourceType: 'PointsCampaign', resourceId: campaign.id, changes: data });
    res.json(campaign);
  } catch (e: any) {
    res.status(500).json({ error: 'Kunde inte uppdatera kampanj' });
  }
});

router.delete('/campaigns/:id', requireSuperAdmin, async (req, res) => {
  try {
    await prisma.pointsCampaign.delete({ where: { id: req.params.id } });
    await audit(req as AuthRequest, 'DPOINTS_CAMPAIGN_DELETE', { resourceType: 'PointsCampaign', resourceId: req.params.id });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: 'Kunde inte ta bort kampanj' });
  }
});

// ── Kunder + saldo ──────────────────────────────────────────────────────────
router.get('/customers', async (req, res) => {
  try {
    const search = String((req.query.search as string) || '').trim();
    const where: any = search
      ? { OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
        ] }
      : { pointsBalance: { gt: 0 } };
    const users = await prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, phone: true, pointsBalance: true },
      orderBy: { pointsBalance: 'desc' },
      take: 50,
    });
    res.json({ customers: users });
  } catch (e: any) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

router.get('/customers/:id', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, email: true, phone: true, pointsBalance: true },
    });
    if (!user) return res.status(404).json({ error: 'Kunden hittades inte' });
    const transactions = await prisma.pointsTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ customer: user, transactions });
  } catch (e: any) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

router.post('/customers/:id/adjust', requireSuperAdmin, async (req, res) => {
  try {
    const amount = Math.round(Number((req.body || {}).amount));
    const reason = String((req.body || {}).reason || '').trim();
    if (!Number.isFinite(amount) || amount === 0) return res.status(400).json({ error: 'Ange ett antal poäng (≠ 0)' });
    if (!reason) return res.status(400).json({ error: 'Ange en anledning' });

    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, pointsBalance: true } });
    if (!user) return res.status(404).json({ error: 'Kunden hittades inte' });
    if (amount < 0 && user.pointsBalance + amount < 0) {
      return res.status(400).json({ error: `Kunden har bara ${user.pointsBalance} poäng` });
    }

    const balanceAfter = await recordPointsTx({
      userId: user.id,
      amount,
      type: amount > 0 ? 'ADMIN_ADJUST' : 'REVERSAL',
      reason,
      adminId: (req as AuthRequest).admin?.id ?? null,
    });
    await audit(req as AuthRequest, 'DPOINTS_ADMIN_ADJUST', { resourceType: 'User', resourceId: user.id, changes: { amount, reason, balanceAfter } });
    res.json({ ok: true, balanceAfter });
  } catch (e: any) {
    console.error('[dpoints adjust] error:', e?.message);
    res.status(500).json({ error: 'Kunde inte justera poäng' });
  }
});

// ── Utfärdade inlösen-koder ─────────────────────────────────────────────────
router.get('/redemptions', async (_req, res) => {
  try {
    const txs = await prisma.pointsTransaction.findMany({
      where: { type: 'REDEEM' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { name: true, phone: true } } },
    });
    res.json({
      redemptions: txs.map((t) => ({
        id: t.id,
        userName: t.user?.name ?? null,
        userPhone: t.user?.phone ?? null,
        pointsSpent: Math.abs(t.amount),
        reason: t.reason,
        code: (t.metadata as any)?.code ?? null,
        createdAt: t.createdAt,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

export default router;
