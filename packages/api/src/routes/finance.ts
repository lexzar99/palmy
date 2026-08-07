import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import {
  computePayout,
  economyFromSettings,
  hasCommissionOverride,
  type OrderEcon,
} from '../lib/financeCalc';
import {
  FINANCE_ACCOUNTING_ORDER_FILTER,
  FINANCE_REAL_PAYMENT_STATUSES,
  applySettlementAdjustments,
  isFinanceRealPaymentOrder,
  isPayoutOrderRefundWindowClosed,
  isPayoutRefundWindowClosed,
  isPayoutSettlementBlockingOrder,
  netPayoutOrder,
  PAYOUT_NON_PAYABLE_FINAL_PAYMENT_STATUSES,
  PAYOUT_NON_TEST_ORDER_FILTER,
  PAYOUT_ORDER_STATUSES,
  payoutRefundWindowClosesAt,
  payoutRefundWindowHours,
  sameRecoveryAllocations,
} from '../lib/payoutPolicy';
import {
  calculateLateRefundRecoveryPlan,
  getReservedRecoveryAllocations,
  PayoutRecoveryError,
} from '../lib/payoutRecovery';
import {
  activeFinanceSummarySnapshot,
  reconcileRestaurantFundingOre,
  selectFinanceSummaryEconomicValues,
  sumFinanceSummaryRows,
} from '../lib/financeSummary';
import { getMollieFinanceReport, type MollieFinanceReport } from '../lib/mollieFinance';
import {
  reconcileFinanceOrders,
  type FinanceDeviation,
} from '../lib/financeReconciliation';
import {
  FinancePeriodError,
  isFinanceCalendarMonthPeriod,
  resolveFinancePeriod,
  subscriptionAppliesToFinancePeriod,
} from '../lib/financePeriod';
import { financeRevisionAmounts } from '../lib/financeRevision';
import { resolveCurrentPayoutSourceMollieFeeAmount } from '../lib/payoutSourceFees';

const router = Router();
router.use(authenticate, requireSuperAdmin);

const fromOre = (n?: number | null) => Number(n || 0) / 100;

const restaurantTermsForPeriod = <T extends {
  createdAt: Date;
  archivedAt?: Date | null;
  tierGoldFeeOverride?: number | null;
  tierSilverFeeOverride?: number | null;
  tierStandardFeeOverride?: number | null;
}>(restaurant: T, start: Date, end: Date): T =>
  subscriptionAppliesToFinancePeriod(restaurant.createdAt, restaurant.archivedAt ?? null, start, end)
    ? restaurant
    : {
        ...restaurant,
        tierGoldFeeOverride: 0,
        tierSilverFeeOverride: 0,
        tierStandardFeeOverride: 0,
      };

const isMollieCandidateOrder = (order: { paymentProvider?: string | null }) => {
  const provider = String(order.paymentProvider || '').trim().toLowerCase();
  return provider === '' || provider === 'mollie';
};

const resolvedMolliePaymentId = (
  report: MollieFinanceReport,
  order: { id?: string | null; orderNumber?: string | null; molliePaymentId?: string | null },
) => String(order.molliePaymentId || '').trim() ||
  (order.id ? report.paymentIdByOrderId.get(String(order.id)) : '') ||
  (order.orderNumber ? report.paymentIdByOrderNumber.get(String(order.orderNumber)) : '') ||
  '';

const mollieOrderReferences = (orders: ReadonlyArray<{
  id: string;
  orderNumber: string;
  paymentProvider?: string | null;
  paymentStatus?: string | null;
  refundAmount?: number | null;
}>) => orders
  .filter(isMollieCandidateOrder)
  .map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    refunded: Math.max(0, Number(order.refundAmount || 0)) > 0 ||
      String(order.paymentStatus || '').toUpperCase() === 'REFUNDED',
  }));

const clampedRefundOre = (order: {
  total: number;
  refundAmount?: number | null;
  paymentStatus?: string | null;
}) => {
  const total = Math.max(0, Number(order.total || 0));
  const recorded = Math.max(0, Number(order.refundAmount || 0));
  // PSP-status REFUNDED är auktoritativ. Ett fördröjt/legacy refundAmount=0
  // får aldrig göra en full återbetalning till försäljning igen.
  const effective = String(order.paymentStatus || '').toUpperCase() === 'REFUNDED'
    ? total
    : recorded;
  return Math.min(total, effective);
};

const orderAtAmount = (order: {
  total: number;
  deliveryFee: number;
  tipAmount: number;
  discountAmount?: number | null;
  foodDiscountAmount?: number | null;
  deliveryDiscountAmount?: number | null;
  platformFundedFoodDiscountAmount?: number | null;
  platformFundedDeliveryDiscountAmount?: number | null;
  smallOrderFee?: number | null;
  foodVatPercent: number | null;
}, amountOre: number): OrderEcon | null => {
  const originalOre = Math.max(0, Number(order.total || 0));
  const normalizedOre = Math.min(originalOre, Math.max(0, Math.round(amountOre)));
  if (originalOre <= 0 || normalizedOre <= 0) return null;
  const scale = (value: number | null | undefined) =>
    Math.round(Math.max(0, Number(value || 0)) * normalizedOre / originalOre);
  return {
    total: normalizedOre,
    deliveryFee: scale(order.deliveryFee),
    tipAmount: scale(order.tipAmount),
    discountAmount: scale(order.discountAmount),
    foodDiscountAmount: scale(order.foodDiscountAmount),
    deliveryDiscountAmount: scale(order.deliveryDiscountAmount),
    platformFundedFoodDiscountAmount: scale(order.platformFundedFoodDiscountAmount),
    platformFundedDeliveryDiscountAmount: scale(order.platformFundedDeliveryDiscountAmount),
    smallOrderFee: scale(order.smallOrderFee),
    foodVatPercent: order.foodVatPercent,
  };
};

// GET /api/admin/finance/summary?from=&to= — utbetalningskö för perioden (nya modellen)
router.get('/summary', async (req, res) => {
  try {
    const { start, end } = resolveFinancePeriod(req.query.from, req.query.to);

    const [
      settingsRow,
      restaurants,
      orders,
      excludedOrders,
      persisted,
      completedHistoricalRefunds,
      legacyHistoricalRefundOrders,
    ] = await Promise.all([
      prisma.restaurantSettings.findUnique({ where: { id: 'settings' } }),
      prisma.restaurant.findMany({
        where: {
          OR: [
            {
              // Every restaurant whose lifecycle overlaps the month needs a
              // row, even with zero orders, so the full monthly subscription
              // can become a clear invoice/owed amount.
              createdAt: { lte: end },
              OR: [
                { archivedAt: null },
                { archivedAt: { gte: start } },
              ],
            },
            { orders: { some: { createdAt: { gte: start, lte: end } } } },
            {
              orders: {
                some: {
                  paymentRefunds: {
                    some: {
                      provider: 'mollie',
                      status: 'REFUNDED',
                      OR: [
                        { completedAt: { gte: start, lte: end } },
                        {
                          // Mollie's event timestamp owns the accounting
                          // period even when our completion sync runs later.
                          providerCreatedAt: { gte: start, lte: end },
                        },
                        {
                          completedAt: null,
                          providerCreatedAt: null,
                          lastSeenAt: { gte: start, lte: end },
                        },
                      ],
                    },
                  },
                },
              },
            },
            {
              // Legacy refunds predating the durable PaymentRefund ledger are
              // still period activity. Keep an archived restaurant visible so
              // the row can be reconciled and recovered instead of disappearing.
              orders: {
                some: {
                  createdAt: { lt: start },
                  refundedAt: { gte: start, lte: end },
                  paymentProvider: 'mollie',
                  paymentStatus: { in: ['REFUNDED', 'PARTIALLY_REFUNDED'] },
                  ...PAYOUT_NON_TEST_ORDER_FILTER,
                },
              },
            },
            { payouts: { some: { periodStart: start, periodEnd: end } } },
          ],
        },
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
          featuredClass: true,
          vatPercent: true,
          selfDelivery: true,
          commissionPctOverride: true,
          tierGoldFeeOverride: true,
          tierSilverFeeOverride: true,
          tierStandardFeeOverride: true,
          archivedAt: true,
          createdAt: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.order.findMany({
        where: {
          createdAt: { gte: start, lte: end },
          ...PAYOUT_NON_TEST_ORDER_FILTER,
        },
        select: {
          id: true,
          orderNumber: true,
          restaurantId: true,
          molliePaymentId: true,
          paymentProvider: true,
          status: true,
          paymentStatus: true,
          total: true,
          deliveryFee: true,
          tipAmount: true,
          discountAmount: true,
          foodDiscountAmount: true,
          deliveryDiscountAmount: true,
          platformFundedFoodDiscountAmount: true,
          platformFundedDeliveryDiscountAmount: true,
          smallOrderFee: true,
          foodVatPercent: true,
          refundAmount: true,
        },
      }),
      prisma.order.findMany({
        where: {
          createdAt: { gte: start, lte: end },
          accountingExcluded: true,
          paymentStatus: { in: [...FINANCE_REAL_PAYMENT_STATUSES] },
        },
        select: {
          id: true,
          orderNumber: true,
          restaurantId: true,
          molliePaymentId: true,
          paymentProvider: true,
          status: true,
          paymentStatus: true,
          total: true,
          deliveryFee: true,
          tipAmount: true,
          discountAmount: true,
          foodDiscountAmount: true,
          deliveryDiscountAmount: true,
          platformFundedFoodDiscountAmount: true,
          platformFundedDeliveryDiscountAmount: true,
          smallOrderFee: true,
          foodVatPercent: true,
          refundAmount: true,
        },
      }),
      prisma.restaurantPayout.findMany({
        where: { periodStart: start, periodEnd: end },
        select: {
          id: true,
          restaurantId: true,
          status: true,
          payoutReference: true,
          updatedAt: true,
          grossSales: true,
          orderCount: true,
          commissionAmount: true,
          subscriptionAmount: true,
          manualAdjustmentAmount: true,
          lateRefundAdjustmentAmount: true,
          payoutAmount: true,
          mollieFeeAmount: true,
          foodVatAmount: true,
          platformTipAmount: true,
          commissionPctSnapshot: true,
          feeVatPctSnapshot: true,
          foodVatPctSnapshot: true,
          selfDeliverySnapshot: true,
          notes: true,
        },
      }),
      prisma.paymentRefund.findMany({
        where: {
          provider: 'mollie',
          status: 'REFUNDED',
          OR: [
            { completedAt: { gte: start, lte: end } },
            {
              // Mollie's event timestamp owns the accounting period even
              // when completedAt is populated in a later local period.
              providerCreatedAt: { gte: start, lte: end },
            },
            {
              completedAt: null,
              providerCreatedAt: null,
              lastSeenAt: { gte: start, lte: end },
            },
          ],
          order: {
            is: {
              createdAt: { lt: start },
              ...PAYOUT_NON_TEST_ORDER_FILTER,
            },
          },
        },
        select: {
          paymentRef: true,
          order: {
            select: {
              id: true,
              orderNumber: true,
              restaurantId: true,
              molliePaymentId: true,
              paymentProvider: true,
              status: true,
              paymentStatus: true,
              total: true,
              refundAmount: true,
            },
          },
        },
      }),
      prisma.order.findMany({
        where: {
          createdAt: { lt: start },
          refundedAt: { gte: start, lte: end },
          paymentProvider: 'mollie',
          paymentStatus: { in: ['REFUNDED', 'PARTIALLY_REFUNDED'] },
          ...PAYOUT_NON_TEST_ORDER_FILTER,
        },
        select: {
          id: true,
          orderNumber: true,
          restaurantId: true,
          molliePaymentId: true,
          paymentProvider: true,
          status: true,
          paymentStatus: true,
          total: true,
          refundAmount: true,
        },
      }),
    ]);

    const economy = economyFromSettings(settingsRow);
    const persistedMap = new Map(persisted.map((p) => [p.restaurantId, p]));
    const reportOrders = orders.filter(isFinanceRealPaymentOrder);
    const reportMollieOrders = reportOrders
      .filter(isMollieCandidateOrder);
    const historicalRefundOrders = [
      ...completedHistoricalRefunds.map(({ paymentRef, order }) => ({
        ...order,
        molliePaymentId: String(paymentRef || order.molliePaymentId || '').trim() || null,
      })),
      ...legacyHistoricalRefundOrders,
    ].filter((order, index, rows) =>
      rows.findIndex((candidate) => candidate.id === order.id) === index,
    );
    const linkedMollieOrders = [...reportMollieOrders, ...historicalRefundOrders];
    const mollieReport = await getMollieFinanceReport({
      from: start,
      to: end,
      paymentIds: linkedMollieOrders.map((order) => String(order.molliePaymentId || '')),
      refundedPaymentIds: linkedMollieOrders
        .filter((order) =>
          Math.max(0, Number(order.refundAmount || 0)) > 0 ||
          String(order.paymentStatus || '').toUpperCase() === 'REFUNDED'
        )
        .map((order) => String(order.molliePaymentId || '')),
      orderReferences: mollieOrderReferences([...reportOrders, ...historicalRefundOrders]),
    });
    const excludedMollieOrders = excludedOrders
      .filter(isMollieCandidateOrder);
    const excludedMollieReport = await getMollieFinanceReport({
      from: start,
      to: end,
      paymentIds: excludedMollieOrders.map((order) => String(order.molliePaymentId || '')),
      refundedPaymentIds: excludedMollieOrders
        .filter((order) =>
          Math.max(0, Number(order.refundAmount || 0)) > 0 ||
          String(order.paymentStatus || '').toUpperCase() === 'REFUNDED'
        )
        .map((order) => String(order.molliePaymentId || '')),
      orderReferences: mollieOrderReferences(excludedOrders),
    });
    const frozenPayoutIds = persisted.map((row) => row.id);
    const frozenSnapshotLogs = frozenPayoutIds.length
      ? await prisma.auditLog.findMany({
          where: {
            action: 'PAYOUT_REPORT_SNAPSHOT',
            resourceType: 'RestaurantPayout',
            resourceId: { in: frozenPayoutIds },
          },
          select: { resourceId: true, changes: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const frozenMetricSnapshots = new Map<string, Record<string, any>>();
    for (const log of frozenSnapshotLogs) {
      if (!log.resourceId || frozenMetricSnapshots.has(log.resourceId)) continue;
      try {
        const snapshot = JSON.parse(log.changes || '{}')?.snapshot;
        if (snapshot && typeof snapshot === 'object') {
          frozenMetricSnapshots.set(log.resourceId, snapshot);
        }
      } catch {
        // An older malformed audit row must never break the finance overview.
      }
    }

    const ordersByRestaurant = new Map<string, OrderEcon[]>();
    for (const o of orders) {
      if (!o.restaurantId) continue;
      const netOrder = netPayoutOrder(o);
      if (!netOrder) continue;
      const list = ordersByRestaurant.get(o.restaurantId) || [];
      list.push(netOrder);
      ordersByRestaurant.set(o.restaurantId, list);
    }

    let rows = restaurants
      .map((r) => {
        const b = computePayout(
          ordersByRestaurant.get(r.id) || [],
          restaurantTermsForPeriod(r, start, end),
          economy,
        );
        const p = persistedMap.get(r.id) || null;
        const latestRevisionMetrics = p ? frozenMetricSnapshots.get(p.id) : null;
        const frozenMetrics = String(p?.status || '').toUpperCase() === 'DRAFT'
          ? null
          : latestRevisionMetrics;
        const livePlatformFundedDiscountOre = b.restaurantPlatformFundedDiscountTotal;
        const platformFundedDiscountOre = Number.isFinite(Number(frozenMetrics?.platformFundedDiscountAmount))
          ? Math.max(0, Math.round(Number(frozenMetrics?.platformFundedDiscountAmount)))
          : livePlatformFundedDiscountOre;
        const activePersisted = activeFinanceSummarySnapshot(p, latestRevisionMetrics as any);
        const restaurantReportOrders = reportOrders.filter((order) => order.restaurantId === r.id);
        const liveGrossTotalOre = restaurantReportOrders.reduce(
          (sum, order) => sum + Math.max(0, Number(order.total || 0)),
          0,
        );
        const liveRefundTotalOre = restaurantReportOrders.reduce(
          (sum, order) => sum + clampedRefundOre(order),
          0,
        );
        const grossTotalOre = Number.isFinite(Number(frozenMetrics?.grossTotal))
          ? Math.max(0, Math.round(Number(frozenMetrics?.grossTotal)))
          : liveGrossTotalOre;
        const refundTotalOre = Number.isFinite(Number(frozenMetrics?.refunds))
          ? Math.max(0, Math.round(Number(frozenMetrics?.refunds)))
          : liveRefundTotalOre;
        const rowMolliePaymentIds = [...new Set(
          restaurantReportOrders
            .filter(isMollieCandidateOrder)
            .map((order) => resolvedMolliePaymentId(mollieReport, order))
            .filter(Boolean),
        )];
        const rowMollieOrderCount = restaurantReportOrders.filter(isMollieCandidateOrder).length;
        const rowFeesComplete = mollieReport.feeStatus !== 'unavailable' &&
          rowMolliePaymentIds.length === rowMollieOrderCount &&
          rowMolliePaymentIds.every((id) => mollieReport.feeByPaymentId.has(id));
        const rowFeesDisplayable = mollieReport.feeStatus !== 'unavailable' &&
          rowMolliePaymentIds.length === rowMollieOrderCount &&
          rowMolliePaymentIds.every((id) => mollieReport.displayFeeByPaymentId.has(id));
        const liveMollieFeesOre = !rowFeesDisplayable
          ? null
          : rowMolliePaymentIds.reduce(
              (sum, id) => sum + (mollieReport.displayFeeByPaymentId.get(id) || 0),
              0,
            );
        const waitingForMollieConfirmation =
          String(p?.status || '').toUpperCase() === 'HOLD' &&
          frozenMetrics?.mollieFeeStatus &&
          frozenMetrics.mollieFeeStatus !== 'available';
        const mollieConfirmationReady = Boolean(
          waitingForMollieConfirmation &&
          rowFeesComplete &&
          mollieReport.periodLedgerStatus === 'exact',
        );
        const refundedPaymentIds = new Set(
          restaurantReportOrders
            .filter((order) =>
              Math.max(0, Number(order.refundAmount || 0)) > 0 ||
              String(order.paymentStatus || '').toUpperCase() === 'REFUNDED'
            )
            .map((order) => resolvedMolliePaymentId(mollieReport, order))
            .filter(Boolean),
        );
        const missingRefundFeeCount = [...refundedPaymentIds]
          .filter((id) => !mollieReport.displayRefundFeeByPaymentId.has(id))
          .length;
        const refundProcessingFeesDisplayable = mollieReport.feeStatus !== 'unavailable' &&
          missingRefundFeeCount === 0;
        const liveRefundProcessingFeesOre = !refundProcessingFeesDisplayable
          ? null
          : [...refundedPaymentIds].reduce(
              (sum, id) => sum + (mollieReport.displayRefundFeeByPaymentId.get(id) || 0),
              0,
            );
        const refundFeesDisplayable = mollieReport.feeStatus !== 'unavailable' &&
          [...refundedPaymentIds].every((id) => mollieReport.displayFeeByPaymentId.has(id)) &&
          refundProcessingFeesDisplayable;
        const liveRefundTransactionFeesOre = !refundFeesDisplayable
          ? null
          : [...refundedPaymentIds].reduce(
              (sum, id) => sum + Math.max(
                0,
                (mollieReport.displayFeeByPaymentId.get(id) || 0) -
                  (mollieReport.displayRefundFeeByPaymentId.get(id) || 0),
              ),
              0,
            );
        const mollieFeesOre = frozenMetrics && Object.prototype.hasOwnProperty.call(frozenMetrics, 'mollieFees')
          ? (frozenMetrics.mollieFees == null ? null : Math.round(Number(frozenMetrics.mollieFees)))
          : liveMollieFeesOre;
        const refundTransactionFeesOre = frozenMetrics && Object.prototype.hasOwnProperty.call(frozenMetrics, 'refundTransactionFees')
          ? (frozenMetrics.refundTransactionFees == null
              ? null
              : Math.round(Number(frozenMetrics.refundTransactionFees)))
          : liveRefundTransactionFeesOre;
        const refundProcessingFeesOre = frozenMetrics && Object.prototype.hasOwnProperty.call(frozenMetrics, 'refundProcessingFees')
          ? (frozenMetrics.refundProcessingFees == null
              ? null
              : Math.round(Number(frozenMetrics.refundProcessingFees)))
          : liveRefundProcessingFeesOre;
        const economic = selectFinanceSummaryEconomicValues({
          orderCount: b.orderCount,
          grossSales: b.restaurantGrossOre,
          commission: b.commissionOre,
          subscription: b.subscriptionOre,
          feeVat: b.feeVatOre,
          foodVat: b.foodVatOre,
          foodVatPct: b.foodVatPct,
          platformTip: b.platformTipOre,
          payout: b.payoutOre,
          owed: b.owedOre,
          commissionPct: b.commissionPct,
          selfDelivery: r.selfDelivery,
        }, activePersisted);
        const frozenMollieFeeSnapshot = frozenMetrics && Object.prototype.hasOwnProperty.call(frozenMetrics, 'mollieFees')
          ? (frozenMetrics.mollieFees == null ? 0 : Math.max(0, Math.round(Number(frozenMetrics.mollieFees))))
          : Math.max(0, Math.round(Number(p?.mollieFeeAmount || 0)));
        const restaurantMollieFeeOre = economic.usesFrozenSnapshot
          ? frozenMollieFeeSnapshot
          : mollieFeesOre;
        const manualAdjustmentOre = Math.round(Number(activePersisted?.manualAdjustmentAmount || 0));
        const liveSettlement = economic.usesFrozenSnapshot
          ? { payoutAmount: economic.payout, owedAmount: economic.owed }
          : applySettlementAdjustments({
              payoutAmount: economic.payout,
              owedAmount: economic.owed,
              mollieFeeAmount: restaurantMollieFeeOre ?? 0,
              manualAdjustmentAmount: manualAdjustmentOre,
              // Recovery is recalculated below from its original capacity and
              // then applied exactly once. A stored working-copy amount must
              // never shrink the capacity before the fresh plan is built.
              lateRefundAdjustmentAmount: 0,
            });
        const commissionVatPct = economic.usesFrozenSnapshot && activePersisted?.feeVatPctSnapshot != null
          ? Number(activePersisted.feeVatPctSnapshot)
          : economy.vatPlatformFeePct;
        const realPaymentCount = frozenMetrics && Number.isFinite(Number(frozenMetrics.realPaymentCount))
          ? Math.max(0, Math.round(Number(frozenMetrics.realPaymentCount)))
          : restaurantReportOrders.length;
        return {
          restaurantId: r.id,
          name: r.name,
          slug: r.slug,
          city: r.city,
          archived: r.archivedAt != null,
          featuredClass: r.featuredClass ?? 3,
          tierLabel: b.tierLabel,
          selfDelivery: economic.selfDelivery,
          commissionPct: economic.commissionPct,
          rateSource: economic.usesFrozenSnapshot
            ? 'snapshot'
            : hasCommissionOverride(r.commissionPctOverride)
              ? 'override'
              : r.selfDelivery
                ? 'global-self'
                : 'global-platform',
          grossTotal: fromOre(grossTotalOre),
          netSales: fromOre(Math.max(0, grossTotalOre - refundTotalOre)),
          orderCount: realPaymentCount,
          payoutOrderCount: economic.orderCount,
          periodOrderCount: realPaymentCount,
          grossSales: fromOre(economic.grossSales),
          refunds: fromOre(refundTotalOre),
          foodBase: fromOre(b.foodBase),
          platformFundedDiscount: fromOre(platformFundedDiscountOre),
          deliveryFee: fromOre(b.deliveryFeeTotal),
          tip: fromOre(b.tipTotal),
          restaurantTip: fromOre(b.restaurantTipOre),
          platformTip: fromOre(economic.platformTip),
          commission: fromOre(economic.commission),
          commissionVat: fromOre(Math.round(
            (economic.commission * commissionVatPct) / 100,
          )),
          commissionInclVat: fromOre(
            economic.commission + Math.round(
              (economic.commission * commissionVatPct) / 100,
            ),
          ),
          mollieFees: mollieFeesOre == null ? null : fromOre(mollieFeesOre),
          refundTransactionFees: refundTransactionFeesOre == null
            ? null
            : fromOre(refundTransactionFeesOre),
          refundProcessingFees: refundProcessingFeesOre == null
            ? null
            : fromOre(refundProcessingFeesOre),
          restaurantMollieFee: restaurantMollieFeeOre == null ? null : fromOre(restaurantMollieFeeOre),
          companyRevenueExVat: fromOre(economic.commission + economic.subscription),
          // Legacyfältet behålls för klientkompatibilitet men följer nu den
          // nya policyn: Mollie-kortavgiften faktureras restaurangen och
          // minskar därför inte ViaEats intäkt.
          commissionAfterMollieFees: fromOre(economic.commission + economic.subscription),
          mollieFeeStatus: frozenMetrics?.mollieFeeStatus || (rowFeesComplete && missingRefundFeeCount === 0
            ? 'available'
            : mollieReport.feeStatus === 'unavailable'
              ? 'unavailable'
              : 'partial'),
          waitingForMollieConfirmation: Boolean(waitingForMollieConfirmation),
          mollieConfirmationReady,
          subscription: fromOre(economic.subscription),
          feeVat: fromOre(economic.feeVat),
          foodVatPct: economic.foodVatPct,
          foodVat: fromOre(economic.foodVat),
          manualAdjustment: fromOre(manualAdjustmentOre),
          adjustmentNote: manualAdjustmentOre === 0
            ? null
            : String((activePersisted as any)?.notes || p?.notes || '').trim() || null,
          lateRefundRecovery: 0,
          lateRefundRecoveryRemaining: 0,
          recoveryBlocked: false,
          recoveryRequiresAction: false,
          payout: fromOre(liveSettlement.payoutAmount),
          owed: fromOre(liveSettlement.owedAmount),
          usesFrozenSnapshot: economic.usesFrozenSnapshot,
          status: p?.status ?? null,
          payoutReference: p?.payoutReference ?? null,
        };
      });

    // Only restaurants with an actual post-payment refund need a recovery
    // preview. This keeps the overview accurate without running historical
    // payout audits for every restaurant on every request.
    const priorPaidPayouts = restaurants.length === 0
      ? []
      : await prisma.restaurantPayout.findMany({
          where: {
            restaurantId: { in: restaurants.map((restaurant) => restaurant.id) },
            status: 'PAID',
            periodEnd: { lt: start },
          },
          select: {
            id: true,
            restaurantId: true,
            periodStart: true,
            periodEnd: true,
            paidAt: true,
            updatedAt: true,
          },
        });
    if (priorPaidPayouts.length > 0) {
      const earliestPaidAt = priorPaidPayouts.reduce(
        (earliest, payout) => {
          const paidAt = payout.paidAt || payout.updatedAt;
          return paidAt < earliest ? paidAt : earliest;
        },
        priorPaidPayouts[0].paidAt || priorPaidPayouts[0].updatedAt,
      );
      const refundedHistoricalOrders = await prisma.order.findMany({
        where: {
          restaurantId: { in: [...new Set(priorPaidPayouts.map((payout) => payout.restaurantId))] },
          createdAt: { lt: start },
          updatedAt: { gt: earliestPaidAt },
          OR: [
            { refundAmount: { gt: 0 } },
            { paymentStatus: { in: ['REFUNDED', 'PARTIALLY_REFUNDED'] } },
          ],
          ...PAYOUT_NON_TEST_ORDER_FILTER,
        },
        select: { restaurantId: true, createdAt: true, updatedAt: true },
      });
      const recoveryRestaurantIds = new Set(
        refundedHistoricalOrders.flatMap((order) => {
          const source = priorPaidPayouts.find((payout) =>
            payout.restaurantId === order.restaurantId &&
            order.createdAt >= payout.periodStart &&
            order.createdAt <= payout.periodEnd &&
            order.updatedAt > (payout.paidAt || payout.updatedAt)
          );
          return source && order.restaurantId ? [order.restaurantId] : [];
        }),
      );
      type SummaryRecoveryPreview = {
        recovery: Awaited<ReturnType<typeof calculateLateRefundRecoveryPlan>> | null;
        blocked: boolean;
        recoveryRequiresAction: boolean;
      } | null;
      const recoveryPreviews = new Map<string, SummaryRecoveryPreview>(await Promise.all(
        [...recoveryRestaurantIds].map(async (restaurantId): Promise<readonly [string, SummaryRecoveryPreview]> => {
          const row = rows.find((item) => item.restaurantId === restaurantId);
          const target = persistedMap.get(restaurantId) || null;
          if (!row || String(target?.status || '').toUpperCase() === 'PAID') {
            return [restaurantId, null] as const;
          }
          try {
            const commercialPositionOre =
              Math.round(row.grossSales * 100) -
              Math.round(row.commission * 100) -
              Math.round(row.subscription * 100) -
              Math.round(row.feeVat * 100);
            const recoveryCapacity = applySettlementAdjustments({
              payoutAmount: Math.max(0, commercialPositionOre),
              owedAmount: Math.max(0, -commercialPositionOre),
              mollieFeeAmount: Math.max(0, Math.round(Number(row.restaurantMollieFee || 0) * 100)),
              manualAdjustmentAmount: Math.round(Number(row.manualAdjustment || 0) * 100),
              lateRefundAdjustmentAmount: 0,
            });
            const recovery = await calculateLateRefundRecoveryPlan(prisma, {
              restaurantId,
              targetPayoutId: target?.id,
              targetPeriodStart: start,
              targetCapacityAmount: recoveryCapacity.payoutAmount,
              resolveSourceMollieFeeAmount: ({ source, orders }) =>
                resolveCurrentPayoutSourceMollieFeeAmount({ source, orders }),
            });
            const targetStatus = String(target?.status || '').toUpperCase();
            const reservedRecovery = target && targetStatus === 'APPROVED'
              ? await getReservedRecoveryAllocations(prisma, target.id)
              : [];
            const matchesSavedApprovedRecovery = Boolean(
              target &&
              targetStatus === 'APPROVED' &&
              Math.max(0, Math.round(Number(target.lateRefundAdjustmentAmount || 0))) === recovery.totalAmount &&
              sameRecoveryAllocations(reservedRecovery, recovery.allocations),
            );
            return [restaurantId, {
              recovery,
              blocked: false,
              recoveryRequiresAction: targetStatus === 'APPROVED'
                ? !matchesSavedApprovedRecovery
                : recovery.totalAmount > 0 || recovery.remainingAmount > 0,
            }] as const;
          } catch (error) {
            if (!(error instanceof PayoutRecoveryError)) throw error;
            return [restaurantId, {
              recovery: null,
              blocked: true,
              recoveryRequiresAction: true,
            }] as const;
          }
        }),
      ));
      rows = rows.map((row) => {
        const preview = recoveryPreviews.get(row.restaurantId);
        if (!preview) return row;
        if (preview.blocked || !preview.recovery) {
          return {
            ...row,
            payout: 0,
            recoveryBlocked: true,
            recoveryRequiresAction: true,
          };
        }
        const recovery = fromOre(preview.recovery.totalAmount);
        const remaining = fromOre(preview.recovery.remainingAmount);
        return {
          ...row,
          payout: row.usesFrozenSnapshot ? row.payout : Math.max(0, row.payout - recovery),
          lateRefundRecovery: recovery,
          lateRefundRecoveryRemaining: remaining,
          recoveryRequiresAction: preview.recoveryRequiresAction,
        };
      });
    }

    const totals = sumFinanceSummaryRows(rows);
    const nullableSum = (
      field: 'mollieFees' | 'refundTransactionFees' | 'refundProcessingFees' | 'restaurantMollieFee' | 'companyRevenueExVat' | 'commissionAfterMollieFees',
    ) => rows.every((row) => row[field] != null)
      ? rows.reduce((sum, row) => sum + Number(row[field]), 0)
      : null;
    const toRoundedOre = (value: number | null | undefined) => Math.round(Number(value || 0) * 100);
    const periodGrossOre = mollieReport.periodGrossOre;
    const periodRefundsOre = mollieReport.periodRefundsOre;
    const periodFeesOre = mollieReport.periodFeesOre;
    const externalFeesOre = mollieReport.unlinkedFeesOre;
    const historicalPaymentIds = [...new Set(
      historicalRefundOrders
        .map((order) => resolvedMolliePaymentId(mollieReport, order))
        .filter(Boolean),
    )];
    const historicalRefundPrincipalOre = historicalPaymentIds.reduce(
      (sum, paymentId) => sum + (mollieReport.periodRefundByPaymentId.get(paymentId) || 0),
      0,
    );
    const historicalRefundFeesOre = historicalPaymentIds.reduce(
      (sum, paymentId) => sum + (mollieReport.periodFeeByPaymentId.get(paymentId) || 0),
      0,
    );
    const lateRefundRecoveryOre = rows.reduce(
      (sum, row) => sum + toRoundedOre(row.lateRefundRecovery),
      0,
    );
    const fundingReconciliation = reconcileRestaurantFundingOre({
      periodGross: periodGrossOre,
      periodRefunds: periodRefundsOre,
      periodFees: periodFeesOre,
      externalGross: mollieReport.unlinkedGrossOre,
      externalRefunds: mollieReport.unlinkedRefundsOre,
      externalFees: externalFeesOre,
      historicalRefundPrincipal: historicalRefundPrincipalOre,
      historicalRefundFees: historicalRefundFeesOre,
      lateRefundRecovery: lateRefundRecoveryOre,
      rows: rows.map((row) => ({
        grossTotal: toRoundedOre(row.grossTotal),
        refunds: toRoundedOre(row.refunds),
        mollieFee: row.restaurantMollieFee == null ? null : toRoundedOre(row.restaurantMollieFee),
        payout: toRoundedOre(row.payout),
        owed: toRoundedOre(row.owed),
        commission: toRoundedOre(row.commission),
        subscription: toRoundedOre(row.subscription),
        feeVat: toRoundedOre(row.feeVat),
        deliveryFee: toRoundedOre(row.deliveryFee),
        tip: toRoundedOre(row.tip),
        selfDelivery: row.selfDelivery,
        manualAdjustment: toRoundedOre(row.manualAdjustment),
        platformFundedDiscount: toRoundedOre(row.platformFundedDiscount),
      })),
    });
    const restaurantNameById = new Map(restaurants.map((restaurant) => [restaurant.id, restaurant.name]));
    const deviations: Array<FinanceDeviation & { restaurantName: string | null }> =
      reconcileFinanceOrders({
        orders,
        feeStatus: mollieReport.feeStatus,
      }).map((deviation) => ({
        ...deviation,
        restaurantName: deviation.restaurantId
          ? restaurantNameById.get(deviation.restaurantId) || 'Okänd restaurang'
          : null,
      }));
    if (mollieReport.unlinkedPaymentCount > 0) {
      deviations.push({
        id: 'unlinked-mollie-payments',
        code: 'UNLINKED_MOLLIE_PAYMENT',
        severity: 'info',
        restaurantId: null,
        restaurantName: null,
        orderId: null,
        orderNumber: null,
        paymentId: null,
        title: `${mollieReport.unlinkedPaymentCount} Mollie-betalningar saknar restaurangorder`,
        detail: `${fromOre(mollieReport.unlinkedGrossOre).toFixed(2)} kr är fristående betalningar och hålls utanför restaurangernas ekonomi.`,
        amountOre: mollieReport.unlinkedGrossOre,
        affectedOrderCount: mollieReport.unlinkedPaymentCount,
        confirmedLoss: false,
      });
    }
    if (mollieReport.periodDifferenceOre != null && mollieReport.periodDifferenceOre !== 0) {
      deviations.push({
        id: 'mollie-ledger-difference',
        code: 'MOLLIE_LEDGER_DIFFERENCE',
        severity: Math.abs(mollieReport.periodDifferenceOre) >= 100 ? 'critical' : 'warning',
        restaurantId: null,
        restaurantName: null,
        orderId: null,
        orderNumber: null,
        paymentId: null,
        title: 'Mollies balansbok har en oförklarad differens',
        detail: `${Math.abs(mollieReport.periodDifferenceOre)} öre återstår efter öppningssaldo, betalningar, återbetalningar, avgifter och övriga balansrörelser.`,
        amountOre: Math.abs(mollieReport.periodDifferenceOre),
        affectedOrderCount: 0,
        confirmedLoss: false,
      });
    }
    const deviationSeverityRank = { critical: 3, warning: 2, info: 1 } as const;
    deviations.sort((a, b) =>
      deviationSeverityRank[b.severity] - deviationSeverityRank[a.severity] ||
      Number(b.amountOre || 0) - Number(a.amountOre || 0) ||
      a.id.localeCompare(b.id)
    );
    const confirmedLossOre = deviations
      .filter((deviation) => deviation.confirmedLoss)
      .reduce((sum, deviation) => sum + Math.max(0, Number(deviation.amountOre || 0)), 0);
    const amountToReviewOre = deviations
      .filter((deviation) => !deviation.confirmedLoss && deviation.severity === 'critical')
      .reduce((sum, deviation) => sum + Math.max(0, Number(deviation.amountOre || 0)), 0);
    const currentMollieFeesOre = nullableSum('mollieFees') == null
      ? null
      : Math.round(Number(nullableSum('mollieFees')) * 100);
    const currentRefundProcessingFeesOre = nullableSum('refundProcessingFees') == null
      ? null
      : Math.round(Number(nullableSum('refundProcessingFees')) * 100);
    const restoredScenario = (keptRefundOrderId: string | null) => {
      const scenarioOrdersByRestaurant = new Map<string, OrderEcon[]>();
      for (const order of reportOrders) {
        if (!order.restaurantId) continue;
        const refundOre = clampedRefundOre(order);
        const keepThisRefund = keptRefundOrderId === order.id;
        const scenarioOrder = refundOre > 0 && !keepThisRefund
          ? orderAtAmount(order, Number(order.total || 0))
          : netPayoutOrder(order);
        if (!scenarioOrder) continue;
        const list = scenarioOrdersByRestaurant.get(order.restaurantId) || [];
        list.push(scenarioOrder);
        scenarioOrdersByRestaurant.set(order.restaurantId, list);
      }
      const breakdowns = restaurants.map((restaurant) =>
        computePayout(
          scenarioOrdersByRestaurant.get(restaurant.id) || [],
          restaurantTermsForPeriod(restaurant, start, end),
          economy,
        )
      );
      return {
        commissionOre: breakdowns.reduce((sum, row) => sum + row.commissionOre, 0),
        subscriptionOre: breakdowns.reduce((sum, row) => sum + row.subscriptionOre, 0),
        commissionVatOre: breakdowns.reduce((sum, row) => sum + row.feeVatOre, 0),
        payoutOre: breakdowns.reduce((sum, row) => sum + row.payoutOre, 0),
      };
    };
    const refundedOrders = reportOrders.filter((order) => clampedRefundOre(order) > 0);
    const largestRefundOrder = [...refundedOrders]
      .sort((a, b) => clampedRefundOre(b) - clampedRefundOre(a))[0] || null;
    const noRefundScenario = restoredScenario(null);
    const oneRefundScenario = largestRefundOrder
      ? restoredScenario(largestRefundOrder.id)
      : noRefundScenario;
    const paymentFeesWithoutRefundProcessingOre = currentMollieFeesOre == null ||
      currentRefundProcessingFeesOre == null
      ? null
      : Math.max(0, currentMollieFeesOre - currentRefundProcessingFeesOre);
    const largestRefundProcessingFeeOre = largestRefundOrder
      ? (
          mollieReport.refundFeeByPaymentId.get(String(largestRefundOrder.molliePaymentId || '')) ??
          ([...mollieReport.refundFeeByPaymentId.values()][0] ?? null)
      )
      : 0;
    const internalTestGrossOre = excludedOrders.reduce(
      (sum, order) => sum + Math.max(0, Number(order.total || 0)),
      0,
    );
    const internalTestRefundOre = excludedOrders.reduce(
      (sum, order) => sum + clampedRefundOre(order),
      0,
    );
    const excludedFeesComplete = excludedMollieReport.feeStatus !== 'unavailable' &&
      excludedMollieOrders.length === excludedOrders.filter(isMollieCandidateOrder).length &&
      excludedMollieOrders.every((order) => {
        const paymentId = resolvedMolliePaymentId(excludedMollieReport, order);
        return Boolean(paymentId) && excludedMollieReport.displayFeeByPaymentId.has(paymentId);
      });
    const internalTestMollieFeesOre = !excludedFeesComplete
      ? null
      : excludedMollieOrders.reduce(
          (sum, order) => sum + (
            excludedMollieReport.displayFeeByPaymentId.get(resolvedMolliePaymentId(excludedMollieReport, order)) || 0
          ),
          0,
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
      totals: {
        ...totals,
        grossTotal: rows.reduce((sum, row) => sum + row.grossTotal, 0),
        netSales: rows.reduce((sum, row) => sum + row.netSales, 0),
        commissionVat: rows.reduce((sum, row) => sum + row.commissionVat, 0),
        commissionInclVat: rows.reduce((sum, row) => sum + row.commissionInclVat, 0),
        mollieFees: nullableSum('mollieFees'),
        refundTransactionFees: nullableSum('refundTransactionFees'),
        refundProcessingFees: nullableSum('refundProcessingFees'),
        restaurantMollieFee: nullableSum('restaurantMollieFee'),
        companyRevenueExVat: nullableSum('companyRevenueExVat'),
        commissionAfterMollieFees: nullableSum('commissionAfterMollieFees'),
        manualAdjustment: rows.reduce((sum, row) => sum + row.manualAdjustment, 0),
        platformFundedDiscount: rows.reduce((sum, row) => sum + row.platformFundedDiscount, 0),
      },
      fundingReconciliation: {
        status: fundingReconciliation.difference === 0 ? 'exact' : fundingReconciliation.difference == null ? 'unavailable' : 'difference',
        mollieRestaurantNet: fundingReconciliation.mollieRestaurantNet == null ? null : fromOre(fundingReconciliation.mollieRestaurantNet),
        calculatedRestaurantNet: fromOre(fundingReconciliation.calculatedRestaurantNet),
        difference: fundingReconciliation.difference == null ? null : fromOre(fundingReconciliation.difference),
        salesDifference: fundingReconciliation.salesDifference == null ? null : fromOre(fundingReconciliation.salesDifference),
        feeDifference: fundingReconciliation.feeDifference == null ? null : fromOre(fundingReconciliation.feeDifference),
        adjustmentNet: fromOre(fundingReconciliation.adjustmentNet),
        invoiceTotal: fromOre(fundingReconciliation.invoiceTotal),
        externalPayments: {
          count: mollieReport.unlinkedPaymentCount,
          gross: fromOre(mollieReport.unlinkedGrossOre),
          refunds: fromOre(mollieReport.unlinkedRefundsOre),
          fees: externalFeesOre == null ? null : fromOre(externalFeesOre),
          net: fundingReconciliation.externalNet == null ? null : fromOre(fundingReconciliation.externalNet),
        },
      },
      refundImpact: {
        refundCount: refundedOrders.length,
        refundedAmount: fromOre(refundedOrders.reduce(
          (sum, order) => sum + clampedRefundOre(order),
          0,
        )),
        balanceImpact: currentRefundProcessingFeesOre == null
          ? null
          : fromOre(
              refundedOrders.reduce((sum, order) => sum + clampedRefundOre(order), 0) +
              currentRefundProcessingFeesOre,
            ),
        withoutRefunds: {
          commission: fromOre(noRefundScenario.commissionOre),
          commissionVat: fromOre(noRefundScenario.commissionVatOre),
          mollieFees: paymentFeesWithoutRefundProcessingOre == null
            ? null
            : fromOre(paymentFeesWithoutRefundProcessingOre),
          resultExVat: paymentFeesWithoutRefundProcessingOre == null
            ? null
            : fromOre(noRefundScenario.commissionOre + noRefundScenario.subscriptionOre),
          restaurantPayout: fromOre(noRefundScenario.payoutOre),
        },
        withOneRefund: {
          refundedAmount: largestRefundOrder ? fromOre(clampedRefundOre(largestRefundOrder)) : 0,
          commission: fromOre(oneRefundScenario.commissionOre),
          commissionVat: fromOre(oneRefundScenario.commissionVatOre),
          mollieFees: paymentFeesWithoutRefundProcessingOre == null ||
            largestRefundProcessingFeeOre == null
            ? null
            : fromOre(paymentFeesWithoutRefundProcessingOre + largestRefundProcessingFeeOre),
          resultExVat: paymentFeesWithoutRefundProcessingOre == null ||
            largestRefundProcessingFeeOre == null
            ? null
            : fromOre(
                oneRefundScenario.commissionOre + oneRefundScenario.subscriptionOre,
              ),
          restaurantPayout: fromOre(oneRefundScenario.payoutOre),
        },
      },
      internalTestCosts: {
        orderCount: excludedOrders.length,
        gross: fromOre(internalTestGrossOre),
        refunds: fromOre(internalTestRefundOre),
        mollieFees: internalTestMollieFeesOre == null ? null : fromOre(internalTestMollieFeesOre),
        netLoss: internalTestMollieFeesOre == null
          ? null
          : fromOre(Math.max(0, internalTestRefundOre + internalTestMollieFeesOre - internalTestGrossOre)),
      },
      mollie: {
        feeStatus: mollieReport.feeStatus,
        feeError: mollieReport.feeError,
        matchedPaymentCount: mollieReport.matchedPaymentCount,
        estimatedPaymentCount: mollieReport.estimatedPaymentCount,
        requestedPaymentCount: mollieReport.requestedPaymentCount,
        availableBalance: mollieReport.availableBalanceOre == null
          ? null
          : fromOre(mollieReport.availableBalanceOre),
        pendingBalance: mollieReport.pendingBalanceOre == null
          ? null
          : fromOre(mollieReport.pendingBalanceOre),
        totalBalance: mollieReport.totalBalanceOre == null
          ? null
          : fromOre(mollieReport.totalBalanceOre),
        nextPayoutDate: mollieReport.nextPayoutDate,
        nextPayoutDateSource: mollieReport.nextPayoutDateSource,
        transferFrequency: mollieReport.transferFrequency,
        nextSettlementAmount: mollieReport.nextSettlementAmountOre == null
          ? null
          : fromOre(mollieReport.nextSettlementAmountOre),
        nextSettlementStatus: mollieReport.nextSettlementStatus,
        latestPayoutAmount: mollieReport.latestPayoutAmountOre == null
          ? null
          : fromOre(mollieReport.latestPayoutAmountOre),
        latestPayoutStatus: mollieReport.latestPayoutStatus,
        latestPayoutCreatedAt: mollieReport.latestPayoutCreatedAt,
        periodLedgerStatus: mollieReport.periodLedgerStatus,
        periodReportUntil: mollieReport.periodReportUntil,
        periodGross: mollieReport.periodGrossOre == null ? null : fromOre(mollieReport.periodGrossOre),
        periodRefunds: mollieReport.periodRefundsOre == null ? null : fromOre(mollieReport.periodRefundsOre),
        periodFees: mollieReport.periodFeesOre == null ? null : fromOre(mollieReport.periodFeesOre),
        periodOtherMovements: mollieReport.periodOtherMovementsOre == null
          ? null
          : fromOre(mollieReport.periodOtherMovementsOre),
        periodDifference: mollieReport.periodDifferenceOre == null
          ? null
          : fromOre(mollieReport.periodDifferenceOre),
        periodOpeningBalance: mollieReport.periodOpeningBalanceOre == null
          ? null
          : fromOre(mollieReport.periodOpeningBalanceOre),
        periodClosingBalance: mollieReport.periodClosingBalanceOre == null
          ? null
          : fromOre(mollieReport.periodClosingBalanceOre),
        unlinkedPaymentCount: mollieReport.unlinkedPaymentCount,
        unlinkedGross: fromOre(mollieReport.unlinkedGrossOre),
        unlinkedRefunds: fromOre(mollieReport.unlinkedRefundsOre),
        unlinkedFees: mollieReport.unlinkedFeesOre == null
          ? null
          : fromOre(mollieReport.unlinkedFeesOre),
        unlinkedNet: mollieReport.unlinkedNetOre == null
          ? null
          : fromOre(mollieReport.unlinkedNetOre),
        feeCalibration: mollieReport.feeCalibrationOre == null
          ? null
          : fromOre(mollieReport.feeCalibrationOre),
      },
      reconciliation: {
        status: deviations.some((deviation) => deviation.severity === 'critical')
          ? 'critical'
          : deviations.some((deviation) => deviation.severity === 'warning')
            ? 'attention'
            : 'ok',
        checkedOrderCount: orders.length,
        realPaymentCount: reportOrders.length,
        excludedPaymentCount: orders.length - reportOrders.length,
        molliePaymentCount: mollieReport.requestedPaymentCount,
        matchedFeeCount: mollieReport.matchedPaymentCount,
        deviationCount: deviations.length,
        criticalCount: deviations.filter((deviation) => deviation.severity === 'critical').length,
        confirmedLoss: fromOre(confirmedLossOre),
        amountToReview: fromOre(amountToReviewOre),
        deviations: deviations.map((deviation) => ({
          ...deviation,
          amount: deviation.amountOre == null ? null : fromOre(deviation.amountOre),
          amountOre: undefined,
        })),
      },
      rows,
    });
  } catch (error) {
    if (error instanceof FinancePeriodError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('Finance summary error:', error);
    res.status(500).json({ error: 'Kunde inte beräkna ekonomi-översikten' });
  }
});

// GET /api/admin/finance/payout/:restaurantId?from=&to= — full utbetalningsspec
router.get('/payout/:restaurantId', async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { start, end } = resolveFinancePeriod(req.query.from, req.query.to);

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
          vatPercent: true,
          selfDelivery: true,
          commissionPctOverride: true,
          tierGoldFeeOverride: true,
          tierSilverFeeOverride: true,
          tierStandardFeeOverride: true,
          createdAt: true,
          archivedAt: true,
        },
      }),
      prisma.order.findMany({
        where: {
          restaurantId,
          createdAt: { gte: start, lte: end },
          // Keep unsettled rows visible here: the detail endpoint must expose
          // the same lock blockers as the payout POST, not only accounting rows.
          ...PAYOUT_NON_TEST_ORDER_FILTER,
        },
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          updatedAt: true,
          status: true,
          paymentStatus: true,
          total: true,
          deliveryFee: true,
          tipAmount: true,
          discountAmount: true,
          foodDiscountAmount: true,
          deliveryDiscountAmount: true,
          platformFundedFoodDiscountAmount: true,
          platformFundedDeliveryDiscountAmount: true,
          smallOrderFee: true,
          foodVatPercent: true,
          refundAmount: true,
          paymentProvider: true,
          molliePaymentId: true,
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

    const revisionLogs = persisted
      ? await prisma.auditLog.findMany({
          where: {
            action: 'PAYOUT_REPORT_SNAPSHOT',
            resourceType: 'RestaurantPayout',
            resourceId: persisted.id,
          },
          select: {
            id: true,
            adminEmail: true,
            changes: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const revisions = revisionLogs.flatMap((log) => {
      try {
        const parsed = JSON.parse(log.changes || '{}');
        const snapshot = parsed.snapshot || {};
        const revisionAmounts = financeRevisionAmounts(snapshot);
        return [{
          id: log.id,
          revision: Number(parsed.revision || 0),
          original: Boolean(parsed.original),
          reason: String(parsed.reason || 'LOCK'),
          createdAt: log.createdAt,
          createdBy: log.adminEmail,
          commissionPct: snapshot.commissionPctSnapshot == null
            ? null
            : Number(snapshot.commissionPctSnapshot),
          commissionExVat: fromOre(revisionAmounts.commissionExVatOre),
          subscriptionExVat: fromOre(revisionAmounts.subscriptionExVatOre),
          viaEatsExVat: fromOre(revisionAmounts.viaEatsExVatOre),
          vat: fromOre(revisionAmounts.vatOre),
          payout: fromOre(snapshot.payoutAmount),
          manualAdjustment: fromOre(snapshot.manualAdjustmentAmount),
          platformFundedDiscountAmount: fromOre(snapshot.platformFundedDiscountAmount),
        }];
      } catch {
        return [];
      }
    });
    const latestFrozenMetrics = [...revisionLogs].reverse().reduce<Record<string, any> | null>((value, log) => {
      if (value) return value;
      try {
        const snapshot = JSON.parse(log.changes || '{}')?.snapshot;
        return snapshot && typeof snapshot === 'object' ? snapshot : null;
      } catch {
        return null;
      }
    }, null);

    const economy = economyFromSettings(settingsRow);
    const eligibleOrders = orders.flatMap((order) => {
      const net = netPayoutOrder(order);
      return net ? [{ order, net }] : [];
    });
    const financialOrders = orders.filter(isFinanceRealPaymentOrder);
    const b = computePayout(
      eligibleOrders.map(({ net }) => net),
      restaurantTermsForPeriod(restaurant, start, end),
      economy,
    );
    const livePlatformFundedDiscountOre = b.restaurantPlatformFundedDiscountTotal;
    const activePlatformFundedDiscountSnapshot = String(persisted?.status || '').toUpperCase() === 'DRAFT'
      ? null
      : latestFrozenMetrics?.platformFundedDiscountAmount;
    const platformFundedDiscountOre = activePlatformFundedDiscountSnapshot != null &&
      Number.isFinite(Number(activePlatformFundedDiscountSnapshot))
      ? Math.max(0, Math.round(Number(activePlatformFundedDiscountSnapshot)))
      : livePlatformFundedDiscountOre;
    const mollieOrders = financialOrders.filter(isMollieCandidateOrder);
    const storedMolliePaymentIds = [...new Set(mollieOrders.map((order) => String(order.molliePaymentId || '').trim()).filter(Boolean))];
    const detailMollieReport = await getMollieFinanceReport({
      from: start,
      to: end,
      paymentIds: storedMolliePaymentIds,
      refundedPaymentIds: mollieOrders
        .filter((order) => Number(order.refundAmount || 0) > 0 || String(order.paymentStatus || '').toUpperCase() === 'REFUNDED')
        .map((order) => String(order.molliePaymentId || '').trim())
        .filter(Boolean),
      orderReferences: mollieOrderReferences(mollieOrders),
    });
    const molliePaymentIds = [...new Set(
      mollieOrders.map((order) => resolvedMolliePaymentId(detailMollieReport, order)).filter(Boolean),
    )];
    const detailFeesComplete = detailMollieReport.feeStatus !== 'unavailable' &&
      molliePaymentIds.length === mollieOrders.length &&
      molliePaymentIds.every((id) => detailMollieReport.feeByPaymentId.has(id));
    const detailRefundedPaymentIds = mollieOrders
      .filter((order) =>
        Number(order.refundAmount || 0) > 0 ||
        String(order.paymentStatus || '').toUpperCase() === 'REFUNDED')
      .map((order) => resolvedMolliePaymentId(detailMollieReport, order))
      .filter(Boolean);
    const detailRefundFeesComplete = detailRefundedPaymentIds.every((id) =>
      detailMollieReport.refundFeeByPaymentId.has(id),
    );
    const detailMollieFeesOre = !detailFeesComplete
      ? null
      : molliePaymentIds.reduce((sum, id) => sum + (detailMollieReport.feeByPaymentId.get(id) || 0), 0);
    const detailRefundProcessingFeesOre = !detailFeesComplete || !detailRefundFeesComplete
      ? null
      : detailRefundedPaymentIds.reduce(
          (sum, id) => sum + (detailMollieReport.refundFeeByPaymentId.get(id) || 0),
          0,
        );
    const detailPaymentFeesOre = detailMollieFeesOre == null || detailRefundProcessingFeesOre == null
      ? null
      : Math.max(0, detailMollieFeesOre - detailRefundProcessingFeesOre);
    // Approved reports remain editable through the explicit override flow, so
    // show the current calculation for preview. Only a paid report is final.
    const lockedMollieFeesOre = persisted && String(persisted.status || '').toUpperCase() === 'PAID'
      ? Math.max(0, Number(persisted.mollieFeeAmount || 0))
      : detailMollieFeesOre;
    const adjustedPayoutOre = lockedMollieFeesOre == null
      ? b.payoutOre
      : Math.max(0, b.payoutOre - lockedMollieFeesOre);
    const adjustedOwedOre = lockedMollieFeesOre == null
      ? b.owedOre
      : Math.max(0, b.owedOre + Math.max(0, lockedMollieFeesOre - b.payoutOre));
    const originalGrossTotal = financialOrders.reduce(
      (sum, order) => sum + Math.max(0, Number(order.total || 0)),
      0,
    );
    const refundTotal = financialOrders.reduce(
      (sum, order) => sum + clampedRefundOre(order),
      0,
    );
    const refundWindowHours = payoutRefundWindowHours();
    const refundWindowClosesAt = payoutRefundWindowClosesAt(end, refundWindowHours);
    const s = (settingsRow as any) || {};
    const manualAdjustmentAmount = Number(persisted?.manualAdjustmentAmount || 0);
    const recoveryCapacity = applySettlementAdjustments({
      payoutAmount: adjustedPayoutOre,
      owedAmount: adjustedOwedOre,
      manualAdjustmentAmount,
      lateRefundAdjustmentAmount: 0,
    });
    const persistedOwedAmount = persisted
      ? applySettlementAdjustments({
          payoutAmount: Math.max(
            0,
            Number(persisted.grossSales || 0) -
              Number(persisted.commissionAmount || 0) -
              Number(persisted.subscriptionAmount || 0) -
              Math.round(
                ((Number(persisted.commissionAmount || 0) + Number(persisted.subscriptionAmount || 0)) *
                  Number(persisted.feeVatPctSnapshot || 0)) / 100,
              ),
          ),
          owedAmount: Math.max(
            0,
            Number(persisted.commissionAmount || 0) +
              Number(persisted.subscriptionAmount || 0) +
              Math.round(
                ((Number(persisted.commissionAmount || 0) + Number(persisted.subscriptionAmount || 0)) *
                  Number(persisted.feeVatPctSnapshot || 0)) / 100,
              ) -
              Number(persisted.grossSales || 0),
          ),
          mollieFeeAmount: Number(persisted.mollieFeeAmount || 0),
          manualAdjustmentAmount: Number(persisted.manualAdjustmentAmount || 0),
          lateRefundAdjustmentAmount: Number(persisted.lateRefundAdjustmentAmount || 0),
        }).owedAmount
      : 0;
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
        targetCapacityAmount: persisted?.status === 'PAID'
          ? 0
          : recoveryCapacity.payoutAmount,
        resolveSourceMollieFeeAmount: ({ source, orders }) =>
          resolveCurrentPayoutSourceMollieFeeAmount({
            source,
            orders,
            bypassCache: true,
          }),
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

    const readinessNow = new Date();
    const settlementReadinessOrders = orders.filter((order) =>
      !(PAYOUT_NON_PAYABLE_FINAL_PAYMENT_STATUSES as readonly string[])
        .includes(String(order.paymentStatus || '').toUpperCase()),
    );
    const blockingOrderCount = settlementReadinessOrders
      .filter(isPayoutSettlementBlockingOrder)
      .length;
    const immatureOrderCount = settlementReadinessOrders.filter((order) =>
      (PAYOUT_ORDER_STATUSES as readonly string[]).includes(String(order.status || '').toUpperCase()) &&
      !isPayoutOrderRefundWindowClosed(order, readinessNow, refundWindowHours),
    ).length;
    const periodIsCalendarMonth = isFinanceCalendarMonthPeriod(start, end);
    const refundWindowClosed = isPayoutRefundWindowClosed(end, readinessNow, refundWindowHours);
    const providerBlockerCount = financialOrders.filter((order) =>
      String(order.paymentProvider || '').trim().toLowerCase() !== 'mollie' ||
      !resolvedMolliePaymentId(detailMollieReport, order),
    ).length;
    const providerAuditReady = providerBlockerCount === 0;
    const exactFeesReady = mollieOrders.length === 0 || (detailFeesComplete && detailRefundFeesComplete);
    const alreadyPaid = String(persisted?.status || '').toUpperCase() === 'PAID';
    const readinessBlocker = !periodIsCalendarMonth
      ? {
          code: 'PAYOUT_PERIOD_MUST_BE_CALENDAR_MONTH',
          reason: 'Avräkningen måste omfatta en hel kalendermånad.',
        }
      : alreadyPaid
        ? { code: 'PAYOUT_ALREADY_PAID', reason: 'Avräkningen är redan betald.' }
        : !refundWindowClosed
          ? {
              code: 'PAYOUT_REFUND_WINDOW_OPEN',
              reason: `Återbetalningsfönstret stänger ${refundWindowClosesAt.toISOString()}.`,
            }
          : blockingOrderCount > 0
            ? {
                code: 'PAYOUT_PERIOD_NOT_SETTLED',
                reason: `${blockingOrderCount} order är inte slutligt avstämda.`,
              }
            : immatureOrderCount > 0
              ? {
                  code: 'PAYOUT_ORDER_REFUND_WINDOW_OPEN',
                  reason: `${immatureOrderCount} order har fortfarande öppet återbetalningsfönster.`,
                }
              : !providerAuditReady
                ? {
                    code: 'PAYOUT_PROVIDER_AUDIT_BLOCKED',
                    reason: `${providerBlockerCount} betalningar saknar verifierbar Mollie-koppling.`,
                  }
                : !exactFeesReady
                ? {
                    code: 'PAYOUT_MOLLIE_FEES_NOT_RECONCILED',
                    reason: 'Exakta kort- och återbetalningsavgifter saknas.',
                  }
                : recoveryPreview.blocked
                  ? {
                      code: 'PAYOUT_RECOVERY_BLOCKED',
                      reason: recoveryPreview.error || 'Sen återbetalningsrecovery kunde inte verifieras.',
                    }
                  : null;

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
        vatPercent: restaurant.vatPercent,
        tierGoldFeeOverride: restaurant.tierGoldFeeOverride == null ? null : fromOre(restaurant.tierGoldFeeOverride),
        tierSilverFeeOverride: restaurant.tierSilverFeeOverride == null ? null : fromOre(restaurant.tierSilverFeeOverride),
        tierStandardFeeOverride: restaurant.tierStandardFeeOverride == null ? null : fromOre(restaurant.tierStandardFeeOverride),
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
      settlementReadiness: {
        canLock: readinessBlocker == null,
        code: readinessBlocker?.code || null,
        reason: readinessBlocker?.reason || null,
        periodIsCalendarMonth,
        refundWindowClosed,
        providerAuditReady,
        providerBlockerCount,
        exactFeesReady,
        recoveryBlocked: recoveryPreview.blocked,
        blockingOrderCount,
        immatureOrderCount,
      },
      breakdown: {
        orderCount: b.orderCount,
        periodOrderCount: financialOrders.length,
        originalGrossTotal: fromOre(originalGrossTotal),
        refunds: fromOre(refundTotal),
        grossTotal: fromOre(b.grossTotal),
        foodBase: fromOre(b.foodBase),
        platformFundedDiscount: fromOre(platformFundedDiscountOre),
        deliveryFee: fromOre(b.deliveryFeeTotal),
        tip: fromOre(b.tipTotal),
        restaurantTip: fromOre(b.restaurantTipOre),
        platformTip: fromOre(b.platformTipOre),
        tierLabel: b.tierLabel,
        commissionPct: b.commissionPct,
        commission: fromOre(b.commissionOre),
        subscription: fromOre(b.subscriptionOre),
        feeVatPct: b.feeVatPct,
        feeVat: fromOre(b.feeVatOre),
        restaurantGross: fromOre(b.restaurantGrossOre),
        payout: fromOre(adjustedPayoutOre),
        owed: fromOre(adjustedOwedOre),
        mollieFees: lockedMollieFeesOre == null ? null : fromOre(lockedMollieFeesOre),
        mollieFeeStatus: persisted && String(persisted.status || '').toUpperCase() === 'PAID'
          ? 'available'
          : detailFeesComplete && detailRefundFeesComplete
            ? 'available'
            : detailMollieReport.feeStatus === 'unavailable'
              ? 'unavailable'
              : 'partial',
        paymentFees: detailPaymentFeesOre == null ? null : fromOre(detailPaymentFeesOre),
        refundProcessingFees: detailRefundProcessingFeesOre == null ? null : fromOre(detailRefundProcessingFeesOre),
        foodVatPct: b.foodVatPct,
        foodVat: fromOre(b.foodVatOre),
      },
      orders: orders.map((order) => {
        const net = netPayoutOrder(order);
        return {
          orderNumber: order.orderNumber,
          createdAt: order.createdAt,
          type: order.type,
          status: order.status,
          paymentStatus: order.paymentStatus,
          includedInPayout: Boolean(net),
          originalTotal: fromOre(net?.originalTotal ?? order.total),
          refundAmount: fromOre(net?.refundAmount ?? clampedRefundOre(order)),
          total: fromOre(net?.total ?? order.total),
          deliveryFee: fromOre(net?.deliveryFee ?? order.deliveryFee),
          tip: fromOre(net?.tipAmount ?? order.tipAmount),
        };
      }),
      persisted: persisted
        ? {
            status: persisted.status,
            grossSales: fromOre(persisted.grossSales),
            originalGrossTotal: latestFrozenMetrics?.grossTotal == null
              ? fromOre(persisted.grossSales)
              : fromOre(latestFrozenMetrics.grossTotal),
            refunds: latestFrozenMetrics?.refunds == null ? 0 : fromOre(latestFrozenMetrics.refunds),
            platformFundedDiscountAmount: fromOre(platformFundedDiscountOre),
            orderCount: persisted.orderCount,
            periodOrderCount: latestFrozenMetrics?.realPaymentCount == null
              ? persisted.orderCount
              : Math.max(0, Math.round(Number(latestFrozenMetrics.realPaymentCount))),
            commissionAmount: fromOre(persisted.commissionAmount),
            subscriptionAmount: fromOre(persisted.subscriptionAmount),
            manualAdjustmentAmount: fromOre(persisted.manualAdjustmentAmount),
            lateRefundAdjustmentAmount: fromOre(persisted.lateRefundAdjustmentAmount),
            mollieFeeAmount: fromOre(persisted.mollieFeeAmount),
            mollieFeeStatus: String(latestFrozenMetrics?.mollieFeeStatus || 'unavailable'),
            paymentFeeAmount: latestFrozenMetrics?.mollieFees == null
              ? fromOre(persisted.mollieFeeAmount)
              : fromOre(Math.max(
                  0,
                  Number(latestFrozenMetrics.mollieFees || 0) -
                    Number(latestFrozenMetrics.refundProcessingFees || 0),
                )),
            refundProcessingFeeAmount: latestFrozenMetrics?.refundProcessingFees == null
              ? 0
              : fromOre(latestFrozenMetrics.refundProcessingFees),
            payoutAmount: fromOre(persisted.payoutAmount),
            owedAmount: fromOre(persistedOwedAmount),
            foodVatAmount: persisted.foodVatAmount == null ? null : fromOre(persisted.foodVatAmount),
            platformTipAmount: persisted.platformTipAmount == null ? null : fromOre(persisted.platformTipAmount),
            commissionPctSnapshot: persisted.commissionPctSnapshot,
            feeVatPctSnapshot: persisted.feeVatPctSnapshot,
            foodVatPctSnapshot: persisted.foodVatPctSnapshot,
            selfDeliverySnapshot: persisted.selfDeliverySnapshot,
            notes: persisted.notes,
            payoutReference: persisted.payoutReference,
            approvedAt: persisted.approvedAt,
            approvedBy: persisted.approvedBy,
            paidAt: persisted.paidAt,
            paidBy: persisted.paidBy,
            updatedAt: persisted.updatedAt,
            revisions,
          }
        : null,
    });
  } catch (error) {
    if (error instanceof FinancePeriodError) {
      res.status(400).json({ error: error.message });
      return;
    }
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
