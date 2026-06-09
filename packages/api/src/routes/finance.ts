import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { computePayout, economyFromSettings, type OrderEcon } from '../lib/financeCalc';

const router = Router();
router.use(authenticate, requireSuperAdmin);

const fromOre = (n?: number | null) => Number(n || 0) / 100;

const parseDate = (value: unknown): Date | null => {
  const d = value ? new Date(String(value)) : null;
  return d && Number.isFinite(d.getTime()) ? d : null;
};

// Test-/auto-ordrar ska aldrig in i utbetalningar (samma filter som reports.ts).
const excludeTestOrders = {
  AND: [
    { discountCode: { notIn: ['test', 'testa', 'TEST', 'TESTA'] } },
    { stripePaymentIntentId: { not: 'TEST_PAYMENT' } },
    { customerName: { not: 'AUTOTEST' } },
  ],
};

/** Periodgränser: default = innevarande månad → nu. Slut görs inklusive (dygnsslut). */
function resolvePeriod(fromRaw: unknown, toRaw: unknown) {
  const now = new Date();
  const start = parseDate(fromRaw) ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const end = parseDate(toRaw) ?? now;
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// GET /api/admin/finance/summary?from=&to= — utbetalningskö för perioden (nya modellen)
router.get('/summary', async (req, res) => {
  try {
    const { start, end } = resolvePeriod(req.query.from, req.query.to);

    const [settingsRow, restaurants, orders, persisted] = await Promise.all([
      prisma.restaurantSettings.findUnique({ where: { id: 'settings' } }),
      prisma.restaurant.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
          featuredClass: true,
          selfDelivery: true,
          commissionPctOverride: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.order.findMany({
        where: {
          status: { notIn: ['CANCELLED', 'REJECTED'] as any },
          createdAt: { gte: start, lte: end },
          ...excludeTestOrders,
        },
        select: { restaurantId: true, total: true, deliveryFee: true, tipAmount: true },
      }),
      prisma.restaurantPayout.findMany({
        where: { periodStart: start, periodEnd: end },
        select: { restaurantId: true, status: true, payoutReference: true, updatedAt: true },
      }),
    ]);

    const economy = economyFromSettings(settingsRow);
    const persistedMap = new Map(persisted.map((p) => [p.restaurantId, p]));

    const ordersByRestaurant = new Map<string, OrderEcon[]>();
    for (const o of orders) {
      if (!o.restaurantId) continue;
      const list = ordersByRestaurant.get(o.restaurantId) || [];
      list.push({ total: o.total, deliveryFee: o.deliveryFee, tipAmount: o.tipAmount });
      ordersByRestaurant.set(o.restaurantId, list);
    }

    const rows = restaurants
      .map((r) => {
        const b = computePayout(ordersByRestaurant.get(r.id) || [], r, economy);
        const p = persistedMap.get(r.id) || null;
        return {
          restaurantId: r.id,
          name: r.name,
          slug: r.slug,
          city: r.city,
          featuredClass: r.featuredClass ?? 3,
          tierLabel: b.tierLabel,
          selfDelivery: r.selfDelivery,
          commissionPct: b.commissionPct,
          orderCount: b.orderCount,
          grossSales: fromOre(b.restaurantGrossOre),
          foodBase: fromOre(b.foodBase),
          deliveryFee: fromOre(b.deliveryFeeTotal),
          tip: fromOre(b.tipTotal),
          commission: fromOre(b.commissionOre),
          subscription: fromOre(b.subscriptionOre),
          feeVat: fromOre(b.feeVatOre),
          payout: fromOre(b.payoutOre),
          status: p?.status ?? null,
          payoutReference: p?.payoutReference ?? null,
        };
      })
      // Tomma restauranger utan abonnemang är inte intressanta i kön.
      .filter((row) => row.orderCount > 0 || row.subscription > 0);

    const totals = rows.reduce(
      (acc, r) => {
        acc.grossSales += r.grossSales;
        acc.commission += r.commission;
        acc.subscription += r.subscription;
        acc.feeVat += r.feeVat;
        acc.payout += r.payout;
        acc.orderCount += r.orderCount;
        return acc;
      },
      { grossSales: 0, commission: 0, subscription: 0, feeVat: 0, payout: 0, orderCount: 0 },
    );

    res.json({
      period: { from: start.toISOString(), to: end.toISOString() },
      economy: {
        commissionSelfPct: economy.commissionSelfPct,
        commissionPlatformPct: economy.commissionPlatformPct,
        vatCustomerPct: economy.vatCustomerPct,
        vatPlatformFeePct: economy.vatPlatformFeePct,
        tierGoldFee: fromOre(economy.tierGoldFee),
        tierSilverFee: fromOre(economy.tierSilverFee),
        tierStandardFee: fromOre(economy.tierStandardFee),
      },
      totals,
      rows: rows.sort((a, b) => b.payout - a.payout),
    });
  } catch (error) {
    console.error('Finance summary error:', error);
    res.status(500).json({ error: 'Kunde inte beräkna ekonomi-översikten' });
  }
});

// GET /api/admin/finance/payout/:restaurantId?from=&to= — full utbetalningsspec
router.get('/payout/:restaurantId', async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { start, end } = resolvePeriod(req.query.from, req.query.to);

    const [settingsRow, restaurant, orders, persisted] = await Promise.all([
      prisma.restaurantSettings.findUnique({ where: { id: 'settings' } }),
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
          address: true,
          legalName: true,
          organizationNumber: true,
          featuredClass: true,
          selfDelivery: true,
          commissionPctOverride: true,
        },
      }),
      prisma.order.findMany({
        where: {
          restaurantId,
          status: { notIn: ['CANCELLED', 'REJECTED'] as any },
          createdAt: { gte: start, lte: end },
          ...excludeTestOrders,
        },
        select: {
          orderNumber: true,
          createdAt: true,
          total: true,
          deliveryFee: true,
          tipAmount: true,
          type: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.restaurantPayout.findUnique({
        where: {
          restaurantId_periodStart_periodEnd: { restaurantId, periodStart: start, periodEnd: end },
        },
      }),
    ]);

    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurang hittades inte' });
    }

    const economy = economyFromSettings(settingsRow);
    const b = computePayout(
      orders.map((o) => ({ total: o.total, deliveryFee: o.deliveryFee, tipAmount: o.tipAmount })),
      restaurant,
      economy,
    );
    const s = (settingsRow as any) || {};

    res.json({
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        city: restaurant.city,
        address: restaurant.address,
        legalName: restaurant.legalName,
        organizationNumber: restaurant.organizationNumber,
        featuredClass: restaurant.featuredClass ?? 3,
        selfDelivery: restaurant.selfDelivery,
        commissionPctOverride: restaurant.commissionPctOverride,
      },
      company: {
        name: s.companyName || null,
        organizationNumber: s.organizationNumber || null,
        address: s.companyAddress || null,
      },
      period: { from: start.toISOString(), to: end.toISOString() },
      breakdown: {
        orderCount: b.orderCount,
        grossTotal: fromOre(b.grossTotal),
        foodBase: fromOre(b.foodBase),
        deliveryFee: fromOre(b.deliveryFeeTotal),
        tip: fromOre(b.tipTotal),
        tierLabel: b.tierLabel,
        commissionPct: b.commissionPct,
        commission: fromOre(b.commissionOre),
        subscription: fromOre(b.subscriptionOre),
        feeVatPct: b.feeVatPct,
        feeVat: fromOre(b.feeVatOre),
        restaurantGross: fromOre(b.restaurantGrossOre),
        payout: fromOre(b.payoutOre),
        foodVatPct: b.foodVatPct,
        foodVat: fromOre(b.foodVatOre),
      },
      orders: orders.map((o) => ({
        orderNumber: o.orderNumber,
        createdAt: o.createdAt,
        type: o.type,
        total: fromOre(o.total),
        deliveryFee: fromOre(o.deliveryFee),
        tip: fromOre(o.tipAmount),
      })),
      persisted: persisted
        ? {
            status: persisted.status,
            adjustmentAmount: fromOre(persisted.adjustmentAmount),
            payoutAmount: fromOre(persisted.payoutAmount),
            notes: persisted.notes,
            payoutReference: persisted.payoutReference,
            approvedAt: persisted.approvedAt,
            paidAt: persisted.paidAt,
            updatedAt: persisted.updatedAt,
          }
        : null,
    });
  } catch (error) {
    console.error('Finance payout detail error:', error);
    res.status(500).json({ error: 'Kunde inte hämta utbetalningsspecen' });
  }
});

export default router;
