import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { normalizeMoneyToOre } from '../utils/deliveryZones';
import { deleteSupabaseAuthUser } from '../lib/supabaseUserDelete';
import { invalidateCachedCustomerIdentity } from '../lib/customerIdentityCache';

const router = Router();

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
        _min: { createdAt: true },
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
        firstOrder: a._min.createdAt ?? null,
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
      const agg = aggMap.get(u.id) as { totalSpent: number; lastOrder: string | null; firstOrder: string | null; orderCount: number } | undefined;
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
        firstOrderAt: agg?.firstOrder ?? null,
        isGuest: Boolean(u.isGuest),
        convertedFromGuestAt: u.convertedFromGuestAt ?? null,
        conversionSource: u.conversionSource ?? null,
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

// GET /api/customers/analytics - Conversion, repeat-order and guest-funnel
// statistics for the admin customer tabs.
// Must be declared before /:id so "analytics" is not treated as a user id.
router.get('/analytics', authenticate, requireSuperAdmin, async (_req, res) => {
  try {
    const [users, aggregates] = await Promise.all([
      (prisma as any).user.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          isGuest: true,
          createdAt: true,
          convertedFromGuestAt: true,
          conversionSource: true,
        },
        orderBy: { convertedFromGuestAt: 'desc' },
      }),
      prisma.order.groupBy({
        by: ['userId'],
        where: { userId: { not: null }, status: { notIn: ['CANCELLED', 'REJECTED'] } },
        _sum: { total: true },
        _min: { createdAt: true },
        _max: { createdAt: true },
        _count: { _all: true },
      }),
    ]);

    const orderMap = new Map<string, { count: number; totalSpent: number; firstOrderAt: Date | null; lastOrderAt: Date | null }>();
    for (const row of aggregates as any[]) {
      if (!row.userId) continue;
      orderMap.set(row.userId, {
        count: row._count?._all ?? 0,
        totalSpent: row._sum?.total ?? 0,
        firstOrderAt: row._min?.createdAt ?? null,
        lastOrderAt: row._max?.createdAt ?? null,
      });
    }

    const guestUsers = users.filter((user: any) => user.isGuest);
    const registeredUsers = users.filter((user: any) => !user.isGuest);
    const convertedUsers = registeredUsers.filter((user: any) => user.convertedFromGuestAt);
    const guestsWithOrders = guestUsers.filter((user: any) => (orderMap.get(user.id)?.count ?? 0) > 0);
    const repeatGuests = guestUsers.filter((user: any) => (orderMap.get(user.id)?.count ?? 0) >= 2);
    const repeatRegistered = registeredUsers.filter((user: any) => (orderMap.get(user.id)?.count ?? 0) >= 2);
    const funnelBase = guestUsers.length + convertedUsers.length;

    const conversions = convertedUsers.map((user: any) => {
      const stats = orderMap.get(user.id);
      return {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        convertedAt: user.convertedFromGuestAt,
        source: user.conversionSource || 'GUEST_ORDER',
        orderCount: stats?.count ?? 0,
        totalSpent: (stats?.totalSpent ?? 0) / 100,
        firstOrderAt: stats?.firstOrderAt ?? null,
        lastOrderAt: stats?.lastOrderAt ?? null,
        reordered: (stats?.count ?? 0) >= 2,
      };
    });

    res.json({
      guests: guestUsers.length,
      registered: registeredUsers.length,
      convertedFromGuest: convertedUsers.length,
      conversionRate: funnelBase > 0 ? Number((convertedUsers.length / funnelBase).toFixed(4)) : 0,
      guestsWithOrders: guestsWithOrders.length,
      repeatGuests: repeatGuests.length,
      repeatRegistered: repeatRegistered.length,
      convertedAndReordered: conversions.filter((row) => row.reordered).length,
      ordersFromGuests: Array.from(orderMap.entries()).filter(([id]) => guestUsers.some((user: any) => user.id === id)).reduce((sum, [, stats]) => sum + stats.count, 0),
      ordersFromRegistered: Array.from(orderMap.entries()).filter(([id]) => registeredUsers.some((user: any) => user.id === id)).reduce((sum, [, stats]) => sum + stats.count, 0),
      conversions,
    });
  } catch (error) {
    console.error('[customers/analytics] error:', error);
    res.status(500).json({ error: 'Kunde inte hämta kundstatistik' });
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
    // Hämta identifierare innan vi nullar. Den lokala anonymiseringen görs
    // atomiskt först; därefter frigörs Supabase-identiteten.
    const before = await (prisma as any).user.findUnique({
      where: { id },
      select: { id: true, email: true, phone: true, oauthId: true },
    });
    if (!before) return res.status(404).json({ error: 'Kunden hittades inte' });

    const deletedAt = new Date();
    await prisma.$transaction(async (tx) => {
      // Order- och betalningshistorik bevaras som anonymiserade affärsposter.
      await tx.order.updateMany({ where: { userId: id }, data: { userId: null } });
      await tx.savedAddress.deleteMany({ where: { userId: id } });
      await tx.deviceInstallation.updateMany({
        where: { userId: id },
        data: {
          active: false,
          revokedAt: deletedAt,
          tokenHash: null,
          tokenCiphertext: null,
          revokedReason: 'account_deleted_by_admin',
        },
      });

      await tx.user.update({
        where: { id },
        data: {
          deletedAt,
          email: null,
          phone: null,
          name: '',
          firstName: null,
          lastName: null,
          address: null,
          city: null,
          zip: null,
          image: null,
          pushToken: null,
          apnsDeviceToken: null,
          oauthProvider: null,
          oauthId: null,
          referralCode: null,
          referredByCode: null,
          isVerified: false,
          claimedDealIds: '[]',
          deviceFingerprint: null,
          lastSeenIp: null,
          internalInfo: null,
          allergens: '[]',
          convertedFromGuestAt: null,
          conversionSource: null,
        },
      });
    });

    invalidateCachedCustomerIdentity(id);
    await deleteSupabaseAuthUser(before);
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
