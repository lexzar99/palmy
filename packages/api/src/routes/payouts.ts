import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import { audit } from '../lib/auditLog';
import { economyFromSettings } from '../lib/financeCalc';
import {
  buildPayoutMoneySnapshot,
  buildPayoutFinanceFingerprint,
  assertPayoutProviderAuditFingerprint,
  canAdminMarkPayoutPaid,
  canTransitionPayout,
  effectiveRefundAmountOre,
  isPayoutRefundWindowClosed,
  isPayoutOrderRefundWindowClosed,
  isPayoutSettlementBlockingOrder,
  PAYOUT_NON_PAYABLE_FINAL_PAYMENT_STATUSES,
  PAYOUT_NON_TEST_ORDER_FILTER,
  FINANCE_REAL_PAYMENT_STATUSES,
  PAYOUT_ORDER_STATUSES,
  payoutRefundWindowClosesAt,
  payoutRefundWindowHours,
  PayoutProviderAuditError,
  PayoutProviderAuditBlockedError,
  recomputePayoutFromEconomicSnapshot,
  sameRecoveryAllocations,
  samePayoutMoneySnapshot,
} from '../lib/payoutPolicy';
import {
  applyRecoveryReservations,
  calculateLateRefundRecoveryPlan,
  getReservedRecoveryAllocations,
  PayoutRecoveryError,
  releaseRecoveryReservations,
  syncRecoveryReservations,
} from '../lib/payoutRecovery';
import { reconcileMollieRefundsForPayout } from '../lib/payments/reconcile';
import { exactMollieFeeSnapshot, getMollieFinanceReport } from '../lib/mollieFinance';
import {
  PayoutSourceFeeError,
  resolveCurrentPayoutSourceMollieFeeAmount,
} from '../lib/payoutSourceFees';
import {
  isFinanceCalendarMonthPeriod,
  subscriptionAppliesToFinancePeriod,
} from '../lib/financePeriod';

const router = Router();
router.use(authenticate, requireSuperAdmin);

const toOre = (amount: number) => Math.round(Number(amount || 0) * 100);
const fromOre = (amount?: number | null) => Number(amount || 0) / 100;

const parseDate = (value: unknown) => {
  const date = value ? new Date(String(value)) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
};

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

type FinanceSnapshotFingerprintOrder = Record<string, any> & {
  total: number;
  paymentStatus: string;
  refundAmount?: number | null;
};

const financeSnapshotOrderFingerprint = (orders: readonly FinanceSnapshotFingerprintOrder[]) =>
  JSON.stringify(
    [...orders]
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .map((order) => ({
        id: order.id,
        status: order.status,
        paymentStatus: order.paymentStatus,
        paymentProvider: order.paymentProvider,
        molliePaymentId: order.molliePaymentId,
        total: order.total,
        deliveryFee: order.deliveryFee,
        tipAmount: order.tipAmount,
        discountAmount: order.discountAmount,
        foodDiscountAmount: order.foodDiscountAmount,
        deliveryDiscountAmount: order.deliveryDiscountAmount,
        platformFundedFoodDiscountAmount: order.platformFundedFoodDiscountAmount,
        platformFundedDeliveryDiscountAmount: order.platformFundedDeliveryDiscountAmount,
        smallOrderFee: order.smallOrderFee,
        refundAmount: effectiveRefundAmountOre(order),
        updatedAt: order.updatedAt instanceof Date
          ? order.updatedAt.toISOString()
          : String(order.updatedAt || ''),
      })),
  );

class PayoutRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PayoutRequestError';
  }
}

const payoutSnapshotValues = (payout: any) => ({
  periodStart: payout.periodStart,
  periodEnd: payout.periodEnd,
  grossSales: payout.grossSales,
  orderCount: payout.orderCount,
  commissionAmount: payout.commissionAmount,
  subscriptionAmount: payout.subscriptionAmount,
  manualAdjustmentAmount: payout.manualAdjustmentAmount,
  lateRefundAdjustmentAmount: payout.lateRefundAdjustmentAmount,
  payoutAmount: payout.payoutAmount,
  foodVatAmount: payout.foodVatAmount,
  platformTipAmount: payout.platformTipAmount,
  mollieFeeAmount: payout.mollieFeeAmount,
  commissionPctSnapshot: payout.commissionPctSnapshot,
  feeVatPctSnapshot: payout.feeVatPctSnapshot,
  foodVatPctSnapshot: payout.foodVatPctSnapshot,
  selfDeliverySnapshot: payout.selfDeliverySnapshot,
  status: payout.status,
  notes: payout.notes,
  payoutReference: payout.payoutReference,
  approvedAt: payout.approvedAt,
  approvedBy: payout.approvedBy,
});

async function recordPayoutSnapshot(
  tx: any,
  payout: any,
  req: AuthRequest,
  reason: 'LOCK' | 'OVERRIDE' | 'LEGACY_UNLOCK_CAPTURE',
  financeMetrics?: {
    grossTotal: number;
    refunds: number;
    realPaymentCount: number;
    mollieFees: number | null;
    refundTransactionFees: number | null;
    refundProcessingFees: number | null;
    platformFundedDiscountAmount: number;
    mollieFeeStatus: string;
  },
) {
  const existingSnapshots = await tx.auditLog.count({
    where: {
      action: 'PAYOUT_REPORT_SNAPSHOT',
      resourceType: 'RestaurantPayout',
      resourceId: payout.id,
    },
  });
  await tx.auditLog.create({
    data: {
      adminId: req.admin?.id ?? null,
      adminEmail: req.admin?.email ?? null,
      action: 'PAYOUT_REPORT_SNAPSHOT',
      resourceType: 'RestaurantPayout',
      resourceId: payout.id,
      changes: JSON.stringify({
        revision: existingSnapshots + 1,
        original: existingSnapshots === 0,
        reason,
        snapshot: {
          ...payoutSnapshotValues(payout),
          ...financeMetrics,
        },
      }),
      ipAddress: (req.ip || req.headers['x-forwarded-for'] as string || null) as string | null,
      userAgent: (req.headers['user-agent'] || null) as string | null,
    },
  });
}

const serializePayout = (payout: any) => ({
  id: payout.id,
  restaurantId: payout.restaurantId,
  restaurant: payout.restaurant,
  periodStart: payout.periodStart,
  periodEnd: payout.periodEnd,
  grossSales: fromOre(payout.grossSales),
  orderCount: payout.orderCount,
  commissionAmount: fromOre(payout.commissionAmount),
  subscriptionAmount: fromOre(payout.subscriptionAmount),
  manualAdjustmentAmount: fromOre(payout.manualAdjustmentAmount),
  lateRefundAdjustmentAmount: fromOre(payout.lateRefundAdjustmentAmount),
  foodVatAmount: payout.foodVatAmount == null ? null : fromOre(payout.foodVatAmount),
  platformTipAmount: payout.platformTipAmount == null ? null : fromOre(payout.platformTipAmount),
  payoutAmount: fromOre(payout.payoutAmount),
  commissionPctSnapshot: payout.commissionPctSnapshot,
  feeVatPctSnapshot: payout.feeVatPctSnapshot,
  foodVatPctSnapshot: payout.foodVatPctSnapshot,
  selfDeliverySnapshot: payout.selfDeliverySnapshot,
  status: payout.status,
  notes: payout.notes,
  payoutReference: payout.payoutReference,
  approvedAt: payout.approvedAt,
  approvedBy: payout.approvedBy,
  paidAt: payout.paidAt,
  paidBy: payout.paidBy,
  createdAt: payout.createdAt,
  updatedAt: payout.updatedAt,
});

async function attachExactLateRefundFees(
  restaurantId: string,
  sources: readonly { payoutId: string; fingerprint: string[] }[],
) {
  if (sources.length === 0) return [...sources];
  const sourceRows = await prisma.restaurantPayout.findMany({
    where: { restaurantId, id: { in: sources.map((source) => source.payoutId) }, status: 'PAID' },
    select: {
      id: true,
      periodStart: true,
      periodEnd: true,
      paidAt: true,
      mollieFeeAmount: true,
    },
  });
  const sourceById = new Map(sourceRows.map((source) => [source.id, source]));

  const enriched = [];
  for (const proof of sources) {
    const source = sourceById.get(proof.payoutId);
    if (!source) {
      throw new PayoutRequestError(
        409,
        'PAYOUT_SOURCE_REFUND_AUDIT_STALE',
        `Betald källperiod ${proof.payoutId} ändrades efter PSP-revisionen. Försök igen.`,
      );
    }
    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: { gte: source.periodStart, lte: source.periodEnd },
        paymentStatus: { in: [...FINANCE_REAL_PAYMENT_STATUSES] },
        ...PAYOUT_NON_TEST_ORDER_FILTER,
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        paymentProvider: true,
        molliePaymentId: true,
        total: true,
        deliveryFee: true,
        tipAmount: true,
        discountAmount: true,
        foodDiscountAmount: true,
        deliveryDiscountAmount: true,
        platformFundedFoodDiscountAmount: true,
        platformFundedDeliveryDiscountAmount: true,
        smallOrderFee: true,
        refundAmount: true,
        updatedAt: true,
      },
    });
    const financeFingerprint = buildPayoutFinanceFingerprint(orders);
    try {
      const mollieFeeAmount = await resolveCurrentPayoutSourceMollieFeeAmount({
        source,
        orders,
        bypassCache: true,
      });
      enriched.push({ ...proof, financeFingerprint, mollieFeeAmount });
    } catch (error) {
      if (error instanceof PayoutSourceFeeError) {
        throw new PayoutRequestError(409, error.code, error.message);
      }
      throw error;
    }
  }
  return enriched;
}

router.get('/', async (req, res) => {
  try {
    const { restaurantId } = req.query;
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);

    const payouts = await prisma.restaurantPayout.findMany({
      where: {
        ...(restaurantId ? { restaurantId: String(restaurantId) } : {}),
        ...(from && to ? { periodStart: from, periodEnd: to } : {}),
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            city: true,
            featuredClass: true,
          },
        },
      },
      orderBy: [{ periodStart: 'desc' }, { updatedAt: 'desc' }],
    });

    res.json(payouts.map(serializePayout));
  } catch (error) {
    console.error('List payouts error:', error);
    res.status(500).json({ error: 'Kunde inte hämta utbetalningar' });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const {
      restaurantId,
      periodStart,
      periodEnd,
      manualAdjustmentAmount,
      adjustmentAmount: legacyAdjustmentAmount,
      status,
      notes,
      payoutReference,
      saveMode: rawSaveMode,
    } = req.body;

    if (!restaurantId || !periodStart || !periodEnd) {
      return res.status(400).json({ error: 'Restaurang och period krävs' });
    }

    const start = parseDate(periodStart);
    const end = parseDate(periodEnd);
    if (!start || !end) {
      return res.status(400).json({ error: 'Ogiltig period' });
    }
    if (start.getTime() >= end.getTime()) {
      return res.status(400).json({ error: 'Periodens slut måste vara efter start' });
    }
    if (!isFinanceCalendarMonthPeriod(start, end)) {
      return res.status(400).json({
        error: 'Avräkningen måste omfatta en hel kalendermånad i Europe/Stockholm',
        code: 'PAYOUT_PERIOD_MUST_BE_CALENDAR_MONTH',
      });
    }

    const saveMode = String(rawSaveMode || '').trim().toUpperCase();
    if (saveMode && !['DRAFT', 'OVERRIDE', 'PAID'].includes(saveMode)) {
      return res.status(400).json({ error: 'Ogiltigt sparläge' });
    }
    const saveAsDraft = saveMode === 'DRAFT';
    const overrideOriginal = saveMode === 'OVERRIDE';
    let nextStatus = saveAsDraft
      ? 'DRAFT'
      : overrideOriginal
        ? 'APPROVED'
        : saveMode === 'PAID'
          ? 'PAID'
          : String(status || 'DRAFT').toUpperCase();
    if (!['DRAFT', 'APPROVED', 'PAID', 'HOLD'].includes(nextStatus)) {
      return res.status(400).json({ error: 'Ogiltig utbetalningsstatus' });
    }

    // Temporary compatibility alias for an already-open admin tab during the
    // deploy. Both names are server-calculated as a manual adjustment only;
    // the automatic recovery amount is never client-controlled.
    const adjustmentKr = Number(manualAdjustmentAmount ?? legacyAdjustmentAmount ?? 0);
    if (!Number.isFinite(adjustmentKr)) {
      return res.status(400).json({ error: 'Justeringen måste vara ett giltigt belopp' });
    }
    const requestedAdjustmentOre = toOre(adjustmentKr);
    if (!Number.isSafeInteger(requestedAdjustmentOre)) {
      return res.status(400).json({ error: 'Justeringen är för stor' });
    }

    const normalizedReference = payoutReference ? String(payoutReference).trim() : null;
    const normalizedNotes = notes ? String(notes).trim() : null;
    if (requestedAdjustmentOre !== 0 && !normalizedNotes) {
      return res.status(400).json({ error: 'Ange en orsak till den manuella justeringen' });
    }
    const restaurantKey = String(restaurantId);
    const refundWindowHours = payoutRefundWindowHours();

    let payoutAudit: Awaited<ReturnType<typeof reconcileMollieRefundsForPayout>> | undefined;
    const savesOriginal = overrideOriginal || nextStatus === 'APPROVED';
    let overrideAwaitingMollie = false;
    let financeSnapshotFingerprint: string | undefined;
    let financeSnapshotMetrics: {
      grossTotal: number;
      refunds: number;
      realPaymentCount: number;
      mollieFees: number | null;
      refundTransactionFees: number | null;
      refundProcessingFees: number | null;
      platformFundedDiscountAmount: number;
      mollieFeeStatus: string;
    } | undefined;
    if (savesOriginal || nextStatus === 'PAID') {
      try {
        payoutAudit = await reconcileMollieRefundsForPayout({
          restaurantId: restaurantKey,
          targetPeriodStart: start,
          targetPeriodEnd: end,
        });
        payoutAudit.sources = await attachExactLateRefundFees(
          restaurantKey,
          payoutAudit.sources,
        );
      } catch (error: any) {
        if (error instanceof PayoutRequestError) throw error;
        if (error instanceof PayoutProviderAuditBlockedError) {
          throw new PayoutRequestError(409, error.code, error.message);
        }
        throw new PayoutRequestError(
          503,
          'PAYOUT_REFUND_AUDIT_FAILED',
          error?.message || 'Mollie-refunds kunde inte stämmas av. Utbetalningen är blockerad.',
        );
      }
    }
    if (savesOriginal) {
      const financialOrders = await prisma.order.findMany({
        where: {
          restaurantId: restaurantKey,
          createdAt: { gte: start, lte: end },
          paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
          ...PAYOUT_NON_TEST_ORDER_FILTER,
        },
        select: {
          id: true,
          orderNumber: true,
          total: true,
          deliveryFee: true,
          tipAmount: true,
          discountAmount: true,
          foodDiscountAmount: true,
          deliveryDiscountAmount: true,
          platformFundedFoodDiscountAmount: true,
          platformFundedDeliveryDiscountAmount: true,
          smallOrderFee: true,
          refundAmount: true,
          paymentStatus: true,
          status: true,
          paymentProvider: true,
          molliePaymentId: true,
          updatedAt: true,
        },
      });
      financeSnapshotFingerprint = financeSnapshotOrderFingerprint(financialOrders);
      const mollieOrders = financialOrders
        .filter((order) => String(order.paymentProvider || '').toLowerCase() === 'mollie');
      const storedPaymentIds = mollieOrders
        .map((order) => String(order.molliePaymentId || '').trim())
        .filter(Boolean);
      const mollieFinance = await getMollieFinanceReport({
        from: start,
        to: end,
        paymentIds: [...new Set(storedPaymentIds)],
        bypassCache: true,
        refundedPaymentIds: mollieOrders
          .filter((order) =>
            Number(order.refundAmount || 0) > 0 ||
            String(order.paymentStatus || '').toUpperCase() === 'REFUNDED')
          .map((order) => String(order.molliePaymentId || '').trim())
          .filter(Boolean),
        orderReferences: mollieOrders.map((order) => ({
          id: String(order.id || ''),
          orderNumber: String(order.orderNumber || ''),
          refunded: Number(order.refundAmount || 0) > 0 ||
            String(order.paymentStatus || '').toUpperCase() === 'REFUNDED',
        })),
      });
      const rawPaymentIds = mollieOrders.map((order) =>
        String(order.molliePaymentId || '').trim() ||
        mollieFinance.paymentIdByOrderId.get(String(order.id || '')) ||
        mollieFinance.paymentIdByOrderNumber.get(String(order.orderNumber || '')) ||
        '',
      );
      if (rawPaymentIds.some((id) => !id)) {
        throw new PayoutRequestError(
          409,
          'PAYOUT_MOLLIE_PAYMENT_ID_MISSING',
          'En eller flera betalda Mollie-ordrar saknar payment ID. Rapporten kan inte låsas innan de har stämts av.',
        );
      }
      const paymentIds = [...new Set(rawPaymentIds)];
      if (paymentIds.length !== rawPaymentIds.length) {
        throw new PayoutRequestError(
          409,
          'PAYOUT_MOLLIE_PAYMENT_ID_DUPLICATED',
          'Samma Mollie payment ID finns på flera ordrar. Rapporten kan inte låsas innan dubbelkopplingen har rättats.',
        );
      }
      const refundedIds = new Set(financialOrders
        .filter((order) =>
          Number(order.refundAmount || 0) > 0 ||
          String(order.paymentStatus || '').toUpperCase() === 'REFUNDED'
        )
        .map((order) =>
          String(order.molliePaymentId || '').trim() ||
          mollieFinance.paymentIdByOrderId.get(String(order.id || '')) ||
          mollieFinance.paymentIdByOrderNumber.get(String(order.orderNumber || '')) ||
          '',
        )
        .filter(Boolean));
      const exactFeeSnapshot = exactMollieFeeSnapshot({
        paymentIds,
        refundedPaymentIds: [...refundedIds],
        paymentFeeByPaymentId: mollieFinance.paymentFeeByPaymentId,
        refundFeeByPaymentId: mollieFinance.refundFeeByPaymentId,
      });
      const exactFeesComplete = paymentIds.length === 0 || (
        mollieFinance.feeStatus !== 'unavailable' &&
        exactFeeSnapshot != null
      );
      const displayFeesComplete = paymentIds.length === 0 || (
        mollieFinance.feeStatus !== 'unavailable' &&
        paymentIds.every((id) => mollieFinance.displayFeeByPaymentId.has(id))
      );
      const feesCompleteForSave = overrideOriginal ? displayFeesComplete : exactFeesComplete;
      if (!feesCompleteForSave) {
        throw new PayoutRequestError(
          409,
          'PAYOUT_MOLLIE_FEES_NOT_RECONCILED',
          mollieFinance.feeError ||
            'Alla faktiska transaktionsavgifter måste vara bokförda hos Mollie innan månadsrapporten kan sparas som original.',
        );
      }
      financeSnapshotMetrics = {
        grossTotal: financialOrders.reduce((sum, order) => sum + Math.max(0, Number(order.total || 0)), 0),
        refunds: financialOrders.reduce(
          (sum, order) => sum + effectiveRefundAmountOre(order),
          0,
        ),
        realPaymentCount: financialOrders.length,
        // Set from the server-calculated period breakdown inside the serializable
        // transaction, where the period's restaurant delivery model is frozen.
        platformFundedDiscountAmount: 0,
        mollieFees: feesCompleteForSave
          ? overrideOriginal
            ? paymentIds.reduce(
                (sum, id) => sum + (mollieFinance.displayFeeByPaymentId.get(id) || 0),
                0,
              )
            : exactFeeSnapshot?.totalFees ?? 0
          : null,
        refundTransactionFees: feesCompleteForSave
          ? [...refundedIds].reduce((sum, id) => sum + (
              overrideOriginal
                ? Math.max(
                    0,
                    (mollieFinance.displayFeeByPaymentId.get(id) || 0) -
                      (mollieFinance.displayRefundFeeByPaymentId.get(id) || 0),
                  )
                : mollieFinance.paymentFeeByPaymentId.get(id) || 0
            ), 0)
          : null,
        refundProcessingFees: feesCompleteForSave
          ? overrideOriginal
            ? [...refundedIds].reduce(
                (sum, id) => sum + (mollieFinance.displayRefundFeeByPaymentId.get(id) || 0),
                0,
              )
            : exactFeeSnapshot?.refundProcessingFees ?? 0
          : null,
        mollieFeeStatus: exactFeesComplete ? 'available' : mollieFinance.feeStatus,
      };
      overrideAwaitingMollie = overrideOriginal && (
        !exactFeesComplete ||
        !isPayoutRefundWindowClosed(end, new Date(), refundWindowHours)
      );
      if (overrideAwaitingMollie) nextStatus = 'HOLD';
    }

    const payout = await prisma.$transaction(async (tx) => {
      const existing = await tx.restaurantPayout.findUnique({
        where: {
          restaurantId_periodStart_periodEnd: {
            restaurantId: restaurantKey,
            periodStart: start,
            periodEnd: end,
          },
        },
      });

      const currentStatus = String(existing?.status || 'NEW').toUpperCase();
      const explicitEditTransition = currentStatus !== 'PAID' && (
        (saveAsDraft && currentStatus === 'APPROVED') ||
        (overrideOriginal && ['NEW', 'DRAFT', 'HOLD', 'APPROVED'].includes(currentStatus))
      );
      if (!canTransitionPayout(currentStatus, nextStatus) && !explicitEditTransition) {
        throw new PayoutRequestError(
          409,
          'INVALID_PAYOUT_TRANSITION',
          `Utbetalningen kan inte gå från ${currentStatus} till ${nextStatus}`,
        );
      }

      // Older approved rows predate explicit revision snapshots. Capture their
      // immutable state before an unlock can replace the working copy.
      if (
        existing &&
        currentStatus === 'APPROVED' &&
        (nextStatus === 'HOLD' || saveAsDraft || overrideOriginal)
      ) {
        const snapshotCount = await tx.auditLog.count({
          where: {
            action: 'PAYOUT_REPORT_SNAPSHOT',
            resourceType: 'RestaurantPayout',
            resourceId: existing.id,
          },
        });
        if (snapshotCount === 0) {
          await recordPayoutSnapshot(tx, existing, req, 'LEGACY_UNLOCK_CAPTURE');
        }
      }

      // PAID snapshots are immutable. A repeated PAID request after a client
      // timeout is idempotent and returns the exact stored settlement.
      if (currentStatus === 'PAID' && nextStatus === 'PAID') {
        return tx.restaurantPayout.findUniqueOrThrow({
          where: { id: existing!.id },
          include: {
            restaurant: { select: { id: true, name: true, city: true, featuredClass: true } },
          },
        });
      }

      if (
        (nextStatus === 'APPROVED' || nextStatus === 'PAID') &&
        !isPayoutRefundWindowClosed(end, new Date(), refundWindowHours)
      ) {
        const closesAt = payoutRefundWindowClosesAt(end, refundWindowHours);
        throw new PayoutRequestError(
          409,
          'PAYOUT_REFUND_WINDOW_OPEN',
          `Utbetalningen kan godkännas först ${closesAt.toISOString()} när refundfönstret på ${refundWindowHours} timmar har stängt`,
        );
      }

      const restaurant = await tx.restaurant.findUnique({
        where: { id: restaurantKey },
        select: {
          id: true,
          selfDelivery: true,
          commissionPctOverride: true,
          featuredClass: true,
          tierGoldFeeOverride: true,
          tierSilverFeeOverride: true,
          tierStandardFeeOverride: true,
          createdAt: true,
          archivedAt: true,
        },
      });
      if (!restaurant) {
        throw new PayoutRequestError(404, 'RESTAURANT_NOT_FOUND', 'Restaurang hittades inte');
      }

      const [settingsRow, settlementRows, financeSnapshotRows] = await Promise.all([
        tx.restaurantSettings.findUnique({ where: { id: 'settings' } }),
        tx.order.findMany({
          where: {
            restaurantId: restaurantKey,
            paymentStatus: { notIn: [...PAYOUT_NON_PAYABLE_FINAL_PAYMENT_STATUSES] },
            createdAt: { gte: start, lte: end },
            ...PAYOUT_NON_TEST_ORDER_FILTER,
          },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            paymentStatus: true,
            paymentProvider: true,
            molliePaymentId: true,
            total: true,
            deliveryFee: true,
            tipAmount: true,
            discountAmount: true,
            foodDiscountAmount: true,
            deliveryDiscountAmount: true,
            platformFundedFoodDiscountAmount: true,
            platformFundedDeliveryDiscountAmount: true,
            smallOrderFee: true,
            refundAmount: true,
            updatedAt: true,
          },
        }),
        savesOriginal
          ? tx.order.findMany({
              where: {
                restaurantId: restaurantKey,
                createdAt: { gte: start, lte: end },
                paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
                ...PAYOUT_NON_TEST_ORDER_FILTER,
              },
              select: {
                id: true,
                total: true,
                deliveryFee: true,
                tipAmount: true,
                discountAmount: true,
                foodDiscountAmount: true,
                deliveryDiscountAmount: true,
                platformFundedFoodDiscountAmount: true,
                platformFundedDeliveryDiscountAmount: true,
                smallOrderFee: true,
                refundAmount: true,
                paymentStatus: true,
                status: true,
                paymentProvider: true,
                molliePaymentId: true,
                updatedAt: true,
              },
            })
          : Promise.resolve([]),
      ]);

      if (
        savesOriginal &&
        (!financeSnapshotFingerprint ||
          financeSnapshotOrderFingerprint(financeSnapshotRows) !== financeSnapshotFingerprint)
      ) {
        throw new PayoutRequestError(
          409,
          'PAYOUT_FINANCE_SNAPSHOT_STALE',
          'Order- eller refundunderlaget ändrades medan rapporten låstes. Ladda om och kontrollera perioden igen.',
        );
      }

      if (savesOriginal || nextStatus === 'PAID') {
        if (!payoutAudit) {
          throw new PayoutRequestError(
            409,
            'PAYOUT_PROVIDER_AUDIT_STALE',
            'PSP-revision saknas för utbetalningsunderlaget. Kör utbetalningen igen.',
          );
        }
        assertPayoutProviderAuditFingerprint(
          settlementRows,
          payoutAudit.targetFingerprint,
          `målperiod ${start.toISOString()}–${end.toISOString()}`,
        );
      }

      const unsettledOrderCount = settlementRows.filter(isPayoutSettlementBlockingOrder).length;
      if ((nextStatus === 'APPROVED' || nextStatus === 'PAID') && unsettledOrderCount > 0) {
        throw new PayoutRequestError(
          409,
          'PAYOUT_PERIOD_NOT_SETTLED',
          `Perioden har ${unsettledOrderCount} order vars betalning eller leverans inte är slutligt avstämd`,
        );
      }

      if (nextStatus === 'APPROVED' || nextStatus === 'PAID') {
        const immatureTerminalOrders = settlementRows.filter((row: any) =>
          ['DELIVERED', 'COMPLETED'].includes(String(row.status || '').toUpperCase()) &&
          !isPayoutOrderRefundWindowClosed(row, new Date(), refundWindowHours),
        ).length;
        if (immatureTerminalOrders > 0) {
          throw new PayoutRequestError(
            409,
            'PAYOUT_ORDER_REFUND_WINDOW_OPEN',
            `${immatureTerminalOrders} slutförda order har ännu inte haft ${refundWindowHours} timmar sedan senaste status-/ekonomiändring`,
          );
        }
      }

      if (nextStatus === 'PAID') {
        if (!existing || currentStatus !== 'APPROVED') {
          throw new PayoutRequestError(
            409,
            'PAYOUT_NOT_APPROVED',
            'Utbetalningen måste godkännas innan den markeras som betald',
          );
        }
        if (!canAdminMarkPayoutPaid(existing.approvedBy, req.admin?.id, req.admin?.email)) {
          throw new PayoutRequestError(
            409,
            'PAYOUT_SECOND_ADMIN_REQUIRED',
            existing.approvedBy
              ? 'En annan superadmin än den som godkände underlaget måste markera utbetalningen som betald'
              : 'Utbetalningen saknar identifierad godkännare och måste pausas och godkännas på nytt',
          );
        }
        if (!normalizedReference && !existing.payoutReference) {
          throw new PayoutRequestError(
            400,
            'PAYOUT_REFERENCE_REQUIRED',
            'Betalningsreferens krävs när utbetalningen markeras som betald',
          );
        }

        let calculated;
        try {
          calculated = recomputePayoutFromEconomicSnapshot(settlementRows, existing);
        } catch {
          throw new PayoutRequestError(
            409,
            'PAYOUT_ECONOMIC_SNAPSHOT_MISSING',
            'Utbetalningen saknar ekonomisnapshot och måste pausas och godkännas på nytt.',
          );
        }
        const targetBase = recomputePayoutFromEconomicSnapshot(settlementRows, {
          ...existing,
          lateRefundAdjustmentAmount: 0,
        });
        const expectedRecovery = await calculateLateRefundRecoveryPlan(tx, {
          restaurantId: restaurantKey,
          targetPayoutId: existing.id,
          targetPeriodStart: start,
          targetCapacityAmount: targetBase.payoutAmount,
          auditedSourcePayouts: payoutAudit?.sources,
        });
        const reservedRecovery = await getReservedRecoveryAllocations(tx, existing.id);
        if (
          existing.lateRefundAdjustmentAmount !== expectedRecovery.totalAmount ||
          !sameRecoveryAllocations(reservedRecovery, expectedRecovery.allocations)
        ) {
          throw new PayoutRequestError(
            409,
            'PAYOUT_CHANGED_REAPPROVAL_REQUIRED',
            'En sen refund har ändrat recovery-underlaget efter godkännandet. Pausa och godkänn utbetalningen på nytt.',
          );
        }
        if (!samePayoutMoneySnapshot(existing, calculated)) {
          throw new PayoutRequestError(
            409,
            'PAYOUT_CHANGED_REAPPROVAL_REQUIRED',
            'Order- eller refundunderlaget har ändrats efter godkännandet. Pausa och godkänn utbetalningen på nytt.',
          );
        }

        const paid = await tx.restaurantPayout.update({
          where: { id: existing.id },
          data: {
            status: 'PAID',
            notes: normalizedNotes ?? existing.notes,
            payoutReference: normalizedReference || existing.payoutReference,
            paidAt: existing.paidAt || new Date(),
            paidBy: existing.paidBy || req.admin?.id || null,
          },
          include: {
            restaurant: { select: { id: true, name: true, city: true, featuredClass: true } },
          },
        });
        await applyRecoveryReservations(tx, existing.id);
        return paid;
      }

      if (savesOriginal) {
        const overlapping = await tx.restaurantPayout.findFirst({
          where: {
            restaurantId: restaurantKey,
            status: { in: ['APPROVED', 'PAID'] },
            periodStart: { lte: end },
            periodEnd: { gte: start },
            ...(existing ? { id: { not: existing.id } } : {}),
          },
          select: { id: true, periodStart: true, periodEnd: true, status: true },
        });
        if (overlapping) {
          throw new PayoutRequestError(
            409,
            'OVERLAPPING_PAYOUT_PERIOD',
            'Perioden överlappar en redan godkänd eller betald utbetalning',
          );
        }
      }

      // APPROVED is an immutable money snapshot. A repeated approval request is
      // idempotent; changes require HOLD -> DRAFT -> APPROVED.
      if (currentStatus === 'APPROVED' && nextStatus === 'APPROVED' && !overrideOriginal) {
        return tx.restaurantPayout.findUniqueOrThrow({
          where: { id: existing!.id },
          include: {
            restaurant: { select: { id: true, name: true, city: true, featuredClass: true } },
          },
        });
      }

      const periodRestaurant = restaurantTermsForPeriod(restaurant, start, end);
      const baseCalculation = buildPayoutMoneySnapshot(
        settlementRows,
        periodRestaurant,
        economyFromSettings(settingsRow),
        requestedAdjustmentOre,
        0,
        financeSnapshotMetrics?.mollieFees || 0,
      );
      if (financeSnapshotMetrics) {
        financeSnapshotMetrics.platformFundedDiscountAmount =
          baseCalculation.breakdown.restaurantPlatformFundedDiscountTotal;
      }
      const recoveryPlan = savesOriginal
        ? await calculateLateRefundRecoveryPlan(tx, {
            restaurantId: restaurantKey,
            targetPayoutId: existing?.id,
            targetPeriodStart: start,
            targetCapacityAmount: baseCalculation.snapshot.payoutAmount,
            auditedSourcePayouts: payoutAudit?.sources,
          })
        : { allocations: [], totalAmount: 0, remainingAmount: 0, sources: [] };
      const { snapshot: calculated, economicSnapshot } = buildPayoutMoneySnapshot(
        settlementRows,
        periodRestaurant,
        economyFromSettings(settingsRow),
        requestedAdjustmentOre,
        recoveryPlan.totalAmount,
        financeSnapshotMetrics?.mollieFees || 0,
      );
      const updateData = {
        ...calculated,
        ...economicSnapshot,
        status: nextStatus,
        notes: normalizedNotes,
        payoutReference: normalizedReference,
        approvedAt: nextStatus === 'APPROVED' ? new Date() : null,
        approvedBy: nextStatus === 'APPROVED' ? req.admin?.id || null : null,
        paidAt: null,
        paidBy: null,
      };

      const saved = await tx.restaurantPayout.upsert({
        where: {
          restaurantId_periodStart_periodEnd: {
            restaurantId: restaurantKey,
            periodStart: start,
            periodEnd: end,
          },
        },
        update: updateData,
        create: {
          restaurantId: restaurantKey,
          periodStart: start,
          periodEnd: end,
          ...updateData,
        },
        include: {
          restaurant: { select: { id: true, name: true, city: true, featuredClass: true } },
        },
      });
      if (overrideOriginal) {
        // There is normally only one row because of the unique period key.
        // This also clears legacy duplicate working copies without touching
        // another restaurant's draft for the same month.
        await tx.restaurantPayout.deleteMany({
          where: {
            restaurantId: restaurantKey,
            periodStart: start,
            periodEnd: end,
            status: { in: ['DRAFT', 'HOLD'] },
            id: { not: saved.id },
          },
        });
      }
      if (savesOriginal) {
        await syncRecoveryReservations(tx, saved.id, recoveryPlan.allocations);
        await recordPayoutSnapshot(tx, saved, req, overrideOriginal ? 'OVERRIDE' : 'LOCK', financeSnapshotMetrics);
      } else if (existing) {
        await releaseRecoveryReservations(tx, saved.id, `PAYOUT_${nextStatus}`);
      }
      return saved;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await audit(req, 'PAYOUT_UPSERT', {
      resourceType: 'RestaurantPayout',
      resourceId: payout.id,
      changes: {
        restaurantId: restaurantKey,
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        status: payout.status,
        payoutAmountOre: payout.payoutAmount,
        manualAdjustmentAmountOre: payout.manualAdjustmentAmount,
        lateRefundAdjustmentAmountOre: payout.lateRefundAdjustmentAmount,
        serverCalculated: true,
        saveMode: saveMode || 'LEGACY',
        awaitingMollie: overrideAwaitingMollie,
      },
    });

    res.json(serializePayout(payout));
  } catch (error) {
    if (error instanceof PayoutRequestError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    if (error instanceof PayoutRecoveryError) {
      return res.status(409).json({ error: error.message, code: error.code });
    }
    if (error instanceof PayoutProviderAuditError) {
      return res.status(409).json({ error: error.message, code: error.code });
    }
    if ((error as { code?: string })?.code === 'P2034') {
      return res.status(409).json({
        error: 'Utbetalningsunderlaget ändrades samtidigt av en annan admin. Ladda om och kontrollera det igen.',
        code: 'PAYOUT_CONCURRENT_UPDATE',
      });
    }
    console.error('Upsert payout error:', error);
    res.status(500).json({ error: 'Kunde inte spara utbetalningen' });
  }
});

export default router;
