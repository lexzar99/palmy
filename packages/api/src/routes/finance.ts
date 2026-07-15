import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { computePayout, economyFromSettings, type OrderEcon } from '../lib/financeCalc';
import {
  netPayoutOrder,
  PAYOUT_ORDER_STATUSES,
  PAYOUT_PAYMENT_STATUSES,
  PAYOUT_TEST_ORDER_EXCLUSIONS,
  payoutRefundWindowClosesAt,
  payoutRefundWindowHours,
} from '../lib/payoutPolicy';
import { calculateLateRefundRecoveryPlan, PayoutRecoveryError } from '../lib/payoutRecovery';
import {
  selectFinanceSummaryEconomicValues,
  sumFinanceSummaryRows,
} from '../lib/financeSummary';

const router = Router();
router.use(authenticate, requireSuperAdmin);

const fromOre = (n?: number | null) => Number(n || 0) / 100;

const parseDate = (value: unknown): Date | null => {
  const d = value ? new Date(String(value)) : null;
  return d && Number.isFinite(d.getTime()) ? d : null;
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
          status: { in: [...PAYOUT_ORDER_STATUSES] },
          paymentStatus: { in: [...PAYOUT_PAYMENT_STATUSES] },
          createdAt: { gte: start, lte: end },
          NOT: [...PAYOUT_TEST_ORDER_EXCLUSIONS],
        },
        select: {
          restaurantId: true,
          status: true,
          paymentStatus: true,
          total: true,
          deliveryFee: true,
          tipAmount: true,
          refundAmount: true,
        },
      }),
      prisma.restaurantPayout.findMany({
        where: { periodStart: start, periodEnd: end },
        select: {
          restaurantId: true,
          status: true,
          payoutReference: true,
          updatedAt: true,
          grossSales: true,
          orderCount: true,
          commissionAmount: true,
          subscriptionAmount: true,
          payoutAmount: true,
          commissionPctSnapshot: true,
          feeVatPctSnapshot: true,
          selfDeliverySnapshot: true,
        },
      }),
    ]);

    const economy = economyFromSettings(settingsRow);
    const persistedMap = new Map(persisted.map((p) => [p.restaurantId, p]));

    const ordersByRestaurant = new Map<string, OrderEcon[]>();
    const refundsByRestaurant = new Map<string, number>();
    for (const o of orders) {
      if (!o.restaurantId) continue;
      const netOrder = netPayoutOrder(o);
      if (!netOrder) continue;
      const list = ordersByRestaurant.get(o.restaurantId) || [];
      list.push(netOrder);
      ordersByRestaurant.set(o.restaurantId, list);
      refundsByRestaurant.set(
        o.restaurantId,
        (refundsByRestaurant.get(o.restaurantId) || 0) + netOrder.refundAmount,
      );
    }

    const rows = restaurants
      .map((r) => {
        const b = computePayout(ordersByRestaurant.get(r.id) || [], r, economy);
        const p = persistedMap.get(r.id) || null;
        const economic = selectFinanceSummaryEconomicValues({
          orderCount: b.orderCount,
          grossSales: b.restaurantGrossOre,
          commission: b.commissionOre,
          subscription: b.subscriptionOre,
          feeVat: b.feeVatOre,
          payout: b.payoutOre,
          owed: b.owedOre,
          commissionPct: b.commissionPct,
          selfDelivery: r.selfDelivery,
        }, p);
        return {
          restaurantId: r.id,
          name: r.name,
          slug: r.slug,
          city: r.city,
          featuredClass: r.featuredClass ?? 3,
          tierLabel: b.tierLabel,
          selfDelivery: economic.selfDelivery,
          commissionPct: economic.commissionPct,
          orderCount: economic.orderCount,
          grossSales: fromOre(economic.grossSales),
          refunds: fromOre(refundsByRestaurant.get(r.id)),
          foodBase: fromOre(b.foodBase),
          deliveryFee: fromOre(b.deliveryFeeTotal),
          tip: fromOre(b.tipTotal),
          commission: fromOre(economic.commission),
          subscription: fromOre(economic.subscription),
          feeVat: fromOre(economic.feeVat),
          payout: fromOre(economic.payout),
          owed: fromOre(economic.owed),
          usesFrozenSnapshot: economic.usesFrozenSnapshot,
          status: p?.status ?? null,
          payoutReference: p?.payoutReference ?? null,
        };
      })
      // Tomma restauranger utan abonnemang är inte intressanta i kön.
      .filter((row) => row.usesFrozenSnapshot || row.orderCount > 0 || row.subscription > 0);

    const totals = sumFinanceSummaryRows(rows);

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
          status: { in: [...PAYOUT_ORDER_STATUSES] },
          paymentStatus: { in: [...PAYOUT_PAYMENT_STATUSES] },
          createdAt: { gte: start, lte: end },
          NOT: [...PAYOUT_TEST_ORDER_EXCLUSIONS],
        },
        select: {
          orderNumber: true,
          createdAt: true,
          status: true,
          paymentStatus: true,
          total: true,
          deliveryFee: true,
          tipAmount: true,
          refundAmount: true,
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
    const eligibleOrders = orders.flatMap((order) => {
      const net = netPayoutOrder(order);
      return net ? [{ order, net }] : [];
    });
    const b = computePayout(
      eligibleOrders.map(({ net }) => net),
      restaurant,
      economy,
    );
    const originalGrossTotal = eligibleOrders.reduce((sum, { net }) => sum + net.originalTotal, 0);
    const refundTotal = eligibleOrders.reduce((sum, { net }) => sum + net.refundAmount, 0);
    const refundWindowHours = payoutRefundWindowHours();
    const refundWindowClosesAt = payoutRefundWindowClosesAt(end, refundWindowHours);
    const s = (settingsRow as any) || {};
    const manualAdjustmentAmount = Number(persisted?.manualAdjustmentAmount || 0);
    let recoveryPreview: {
      blocked: boolean;
      error: string | null;
      reserved: number;
      remaining: number;
      sourceCount: number;
    };
    try {
      const recovery = await calculateLateRefundRecoveryPlan(prisma, {
        restaurantId,
        targetPayoutId: persisted?.id,
        targetPeriodStart: start,
        // A PAID target cannot absorb more recovery. Capacity zero makes the
        // response expose the exact carry remainder for the next period.
        targetCapacityAmount: persisted?.status === 'PAID' || b.owedOre > 0
          ? 0
          : Math.max(0, b.payoutOre - manualAdjustmentAmount),
      });
      recoveryPreview = {
        blocked: false,
        error: null,
        reserved: fromOre(recovery.totalAmount),
        remaining: fromOre(recovery.remainingAmount),
        sourceCount: recovery.sources.filter((source) => source.requiredRecoveryAmount > 0).length,
      };
    } catch (error) {
      if (!(error instanceof PayoutRecoveryError)) throw error;
      recoveryPreview = {
        blocked: true,
        error: error.message,
        reserved: 0,
        remaining: 0,
        sourceCount: 0,
      };
    }

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
      refundWindow: {
        hours: refundWindowHours,
        closesAt: refundWindowClosesAt.toISOString(),
        closed: new Date().getTime() >= refundWindowClosesAt.getTime(),
      },
      lateRefundRecovery: recoveryPreview,
      breakdown: {
        orderCount: b.orderCount,
        originalGrossTotal: fromOre(originalGrossTotal),
        refunds: fromOre(refundTotal),
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
        owed: fromOre(b.owedOre),
        foodVatPct: b.foodVatPct,
        foodVat: fromOre(b.foodVatOre),
      },
      orders: eligibleOrders.map(({ order, net }) => ({
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        type: order.type,
        originalTotal: fromOre(net.originalTotal),
        refundAmount: fromOre(net.refundAmount),
        total: fromOre(net.total),
        deliveryFee: fromOre(net.deliveryFee),
        tip: fromOre(net.tipAmount),
      })),
      persisted: persisted
        ? {
            status: persisted.status,
            grossSales: fromOre(persisted.grossSales),
            orderCount: persisted.orderCount,
            commissionAmount: fromOre(persisted.commissionAmount),
            subscriptionAmount: fromOre(persisted.subscriptionAmount),
            manualAdjustmentAmount: fromOre(persisted.manualAdjustmentAmount),
            lateRefundAdjustmentAmount: fromOre(persisted.lateRefundAdjustmentAmount),
            payoutAmount: fromOre(persisted.payoutAmount),
            commissionPctSnapshot: persisted.commissionPctSnapshot,
            feeVatPctSnapshot: persisted.feeVatPctSnapshot,
            selfDeliverySnapshot: persisted.selfDeliverySnapshot,
            notes: persisted.notes,
            payoutReference: persisted.payoutReference,
            approvedAt: persisted.approvedAt,
            approvedBy: persisted.approvedBy,
            paidAt: persisted.paidAt,
            paidBy: persisted.paidBy,
            updatedAt: persisted.updatedAt,
          }
        : null,
    });
  } catch (error) {
    console.error('Finance payout detail error:', error);
    res.status(500).json({ error: 'Kunde inte hämta utbetalningsspecen' });
  }
});

// GET /api/admin/finance/economy — globala satser för inställningssidan
router.get('/economy', async (_req, res) => {
  try {
    const e = economyFromSettings(await prisma.restaurantSettings.findUnique({ where: { id: 'settings' } }));
    res.json({
      commissionSelfPct: e.commissionSelfPct,
      commissionPlatformPct: e.commissionPlatformPct,
      vatCustomerPct: e.vatCustomerPct,
      vatPlatformFeePct: e.vatPlatformFeePct,
      tierGoldFee: fromOre(e.tierGoldFee),
      tierSilverFee: fromOre(e.tierSilverFee),
      tierStandardFee: fromOre(e.tierStandardFee),
    });
  } catch (error) {
    console.error('Finance economy error:', error);
    res.status(500).json({ error: 'Kunde inte hämta satserna' });
  }
});

export default router;
