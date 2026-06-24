import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { normalizeMoneyToOre } from '../utils/deliveryZones';
import supabaseAdmin from '../lib/supabase';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normPhone = (p?: string | null) => (p || '').replace(/[^\d]/g, '');

// Radera även Supabase-auth-användaren när admin tar bort en kund — annars blir
// det en orphan (Google- eller telefon-användare) som blockerar framtida signup
// med samma nummer/e-post ("user with this number already exists"). Best-effort.
async function deleteSupabaseAuthUser(u: { id: string; email: string | null; phone: string | null; oauthId: string | null }) {
  if (!supabaseAdmin) return;
  try {
    // Radera ALLA Supabase-auth-användare som matchar kontot — primär (vår
    // User.id eller oauthId) OCH separata användare med samma e-post/telefon
    // (t.ex. en telefon-OTP-användare vid sidan av Google-användaren). Annars
    // blir numret kvar som "upptaget" i Supabase och blockerar nästa verifiering.
    const ids = new Set<string>();
    if (UUID_RE.test(u.id)) ids.add(u.id);
    if (u.oauthId && UUID_RE.test(u.oauthId)) ids.add(u.oauthId);
    if (u.email || u.phone) {
      const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      for (const su of ((data?.users as any[]) || [])) {
        const emailMatch = u.email && su.email?.toLowerCase() === u.email.toLowerCase();
        const phoneMatch = u.phone && su.phone && normPhone(su.phone) === normPhone(u.phone);
        if (emailMatch || phoneMatch) ids.add(su.id);
      }
    }
    for (const sid of ids) {
      await supabaseAdmin.auth.admin.deleteUser(sid).catch((e: any) =>
        console.error('[delete customer] Supabase delete', sid, e?.message),
      );
    }
  } catch (e: any) {
    console.error('[delete customer] Supabase cascade failed:', e?.message);
  }
}

// GET /api/customers - List all users with order summary + fraud signals
router.get('/', authenticate, requireSuperAdmin, async (_req, res) => {
  try {
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [users, aggregates, refundsRecent, addressesRecent, paymentsToday] = await Promise.all([
      (prisma as any).user.findMany({
        where: { deletedAt: null },
        include: { _count: { select: { orders: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.groupBy({
        by: ['userId'],
        where: { userId: { not: null } },
        _sum: { total: true },
        _max: { createdAt: true },
        _count: { _all: true },
      }),
      // Refunds in last 30 days
      prisma.order.groupBy({
        by: ['userId'],
        where: { userId: { not: null }, refundedAt: { gte: since30, not: null } },
        _count: { _all: true },
      }),
      // Distinct delivery addresses in last 90 days
      prisma.order.findMany({
        where: { userId: { not: null }, createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
        select: { userId: true, deliveryStreet: true, deliveryZip: true },
      }),
      // Orders with failed/awaiting payment in last 24h (velocity check)
      prisma.order.groupBy({
        by: ['userId'],
        where: { userId: { not: null }, createdAt: { gte: since24h }, paymentStatus: { in: ['FAILED', 'AWAITING_PAYMENT'] } as any },
        _count: { _all: true },
      }),
    ]);

    const aggMap = new Map(
      aggregates.map((a: any) => [a.userId, {
        totalSpent: a._sum.total ?? 0,
        lastOrder: a._max.createdAt ?? null,
        orderCount: a._count?._all ?? 0,
      }])
    );
    const refundMap = new Map(refundsRecent.map((r: any) => [r.userId, r._count._all]));
    const failMap = new Map(paymentsToday.map((r: any) => [r.userId, r._count._all]));
    // Distinct address sets per user
    const addrMap = new Map<string, Set<string>>();
    for (const row of addressesRecent) {
      if (!row.userId) continue;
      const key = `${(row.deliveryStreet || '').toLowerCase().trim()}|${(row.deliveryZip || '').trim()}`;
      if (!addrMap.has(row.userId)) addrMap.set(row.userId, new Set());
      addrMap.get(row.userId)!.add(key);
    }

    res.json(users.map((u: any) => {
      const agg = aggMap.get(u.id) as { totalSpent: number; lastOrder: string | null; orderCount: number } | undefined;
      const refundCount30d = (refundMap.get(u.id) as number | undefined) ?? 0;
      const failedPayments24h = (failMap.get(u.id) as number | undefined) ?? 0;
      const distinctAddresses90d = addrMap.get(u.id)?.size ?? 0;
      const orderCount = agg?.orderCount ?? 0;
      const refundRate = orderCount > 0 ? refundCount30d / orderCount : 0;
      const accountAgeDays = Math.max(0, Math.floor((Date.now() - new Date(u.createdAt).getTime()) / (24 * 60 * 60 * 1000)));

      // Compose a list of fraud-signal flags. UI shows badges; ops decides what to do.
      const fraudFlags: string[] = [];
      if (refundCount30d >= 5) fraudFlags.push('HIGH_REFUNDS_30D');
      if (orderCount >= 3 && refundRate >= 0.5) fraudFlags.push('HIGH_REFUND_RATE');
      if (distinctAddresses90d >= 10) fraudFlags.push('ADDRESS_VELOCITY');
      if (failedPayments24h >= 3) fraudFlags.push('PAYMENT_FAILURE_VELOCITY');
      if (accountAgeDays <= 1 && (agg?.totalSpent ?? 0) >= 80_000) fraudFlags.push('NEW_ACCOUNT_LARGE_SPEND'); // 800kr

      return {
        ...u,
        totalSpent: agg ? agg.totalSpent / 100 : 0,
        lastOrder: agg?.lastOrder ?? null,
        // A12 — fraud signals
        refundCount30d,
        failedPayments24h,
        distinctAddresses90d,
        refundRate: Number(refundRate.toFixed(3)),
        accountAgeDays,
        fraudFlags,
      };
    }));
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
        }
      }
    });
    if (!user) return res.status(404).json({ error: 'Kunden hittades inte' });

    const personalDeals = await prisma.customerDeal.findMany({
      where: {
        OR: [
          { userId: user.id },
          ...(user.phone ? [{ phone: user.phone }] : []),
        ],
      },
      include: { campaign: true },
      orderBy: { createdAt: 'desc' },
    });

    const dedupedDeals = Array.from(new Map(personalDeals.map((deal) => [deal.id, deal])).values());

    res.json({
      ...user,
      deals: dedupedDeals,
    });
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte hämta kunddetaljer' });
  }
});

// PATCH /api/customers/:id - Update customer (Super Admin)
router.patch('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { name, phone, email, address, city, zip, isActive, isVerified, internalInfo } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { name, phone, email, address, city, zip, isActive, isVerified, internalInfo }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte uppdatera kunden' });
  }
});

// DELETE /api/customers/:id - Soft-delete customer
//
// Hard-deleting wouldn't stick: the customer's Supabase JWT (Apple / Google)
// stays valid, so the next authenticated API call would silently re-create
// the same row via authenticateUser's upsert and they'd appear "logged in
// again". Instead we mark deletedAt + scrub identifying columns; the auth
// middleware checks deletedAt and rejects with 401, the mobile axios
// interceptor catches that and clears the local token, forcing re-login.
router.delete('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    // Cascade: radera Supabase-auth-användaren först (frigör nummer/e-post) så
    // ingen orphan blockerar framtida signup. Hämta identifierare innan vi nullar.
    const before = await (prisma as any).user.findUnique({
      where: { id },
      select: { id: true, email: true, phone: true, oauthId: true },
    });
    if (before) await deleteSupabaseAuthUser(before);
    // Cast to any because Railway's Docker build can sometimes serve a stale
    // Prisma client where the freshly-added `deletedAt` field hasn't been
    // re-generated into the typings yet — the SQL `prisma db push` on start
    // applies the column regardless, so the runtime write is fine.
    await (prisma as any).user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        // Free up unique slots så framtida signup med samma email/phone
        // inte blockas av soft-deleted-raden.
        email: null,
        phone: null,
        pushToken: null,
        apnsDeviceToken: null,
        // VIKTIGT: nulla också OAuth-koppling + referralCode. Annars
        // matchar nästa Google/Apple-login fortfarande denna rad via
        // (oauthProvider, oauthId) och "reactiverar" usern → samma
        // userId, samma referralCode, samma order-historik. Det var
        // exakt buggen som dök upp efter att admin raderat customers
        // och loggat in igen med samma Google-konto.
        oauthProvider: null,
        oauthId: null,
        referralCode: null,
        referredByCode: null,
        // NOTE: isActive stays true. Admin-"delete" är en RESET — rensar
        // datan och låter usern registrera sig fräsch nästa gång de
        // signar in. Använd isActive=false separat för permanent ban.
      },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Soft-delete customer failed:', error);
    res.status(500).json({ error: 'Kunde inte ta bort kunden' });
  }
});

// Granular Deal Management
router.delete('/:id/deals/:dealId', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const customer = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, phone: true },
    });

    if (!customer) {
      return res.status(404).json({ error: 'Kunden hittades inte' });
    }

    const existing = await prisma.customerDeal.findFirst({
      where: {
        id: req.params.dealId,
        OR: [
          { userId: customer.id },
          ...(customer.phone ? [{ phone: customer.phone }] : []),
        ],
      },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Erbjudandet hittades inte för kunden' });
    }

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

    const customer = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, phone: true },
    });

    if (!customer) {
      return res.status(404).json({ error: 'Kunden hittades inte' });
    }

    const existing = await prisma.customerDeal.findFirst({
      where: {
        id: req.params.dealId,
        OR: [
          { userId: customer.id },
          ...(customer.phone ? [{ phone: customer.phone }] : []),
        ],
      },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Erbjudandet hittades inte för kunden' });
    }

    const deal = await prisma.customerDeal.update({
      where: { id: req.params.dealId },
      data: { isUsed, usageCount: Number(usageCount) }
    });
    res.json(deal);
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte uppdatera erbjudandet' });
  }
});

router.post('/:id/deals', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { title, code, discountType, discountValue, maxUsages, validUntil } = req.body;

    if (!title || !code || discountValue === undefined || discountValue === null) {
      return res.status(400).json({ error: 'Titel, kod och rabattvärde krävs' });
    }

    const customer = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, phone: true },
    });

    if (!customer || !customer.phone) {
      return res.status(404).json({ error: 'Kunden hittades inte eller saknar telefonnummer' });
    }

    const normalizedCode = String(code).trim().toUpperCase();
    const normalizedType = discountType === 'FIXED' ? 'FIXED' : 'PERCENTAGE';
    const normalizedValue = normalizedType === 'FIXED'
      ? normalizeMoneyToOre(Number(discountValue || 0))
      : Math.round(Number(discountValue || 0));

    const deal = await prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.create({
        data: {
          title: String(title).trim(),
          description: 'Personligt kunddeal från adminpanelen',
          discountType: normalizedType,
          discountValue: normalizedValue,
          maxUsagesPerCustomer: Math.max(1, Number(maxUsages || 1)),
          validUntil: validUntil ? new Date(validUntil) : null,
        },
      });

      return tx.customerDeal.create({
        data: {
          campaignId: campaign.id,
          userId: customer.id,
          phone: customer.phone,
          code: normalizedCode,
          maxUsages: Math.max(1, Number(maxUsages || 1)),
        },
        include: {
          campaign: true,
          user: { select: { name: true, phone: true } },
        },
      });
    });

    res.status(201).json(deal);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(400).json({ error: 'Denna kod används redan' });
    }

    res.status(500).json({ error: 'Kunde inte skapa personlig deal' });
  }
});

// GET /api/customers/:id/push-history
router.get('/:id/push-history', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, email: true, phone: true },
    });
    if (!user) return res.status(404).json({ error: 'Kunden hittades inte' });

    const identifiers = [user.id, user.email, user.phone].filter(Boolean) as string[];

    const logs = await (prisma as any).pushLog.findMany({
      where: { target: 'user', identifier: { in: identifiers } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte hämta push-historik' });
  }
});

export default router;
