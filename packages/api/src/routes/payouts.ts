import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import { audit } from '../lib/auditLog';
import { economyFromSettings } from '../lib/financeCalc';
import {
  buildPayoutMoneySnapshot,
  assertPayoutProviderAuditFingerprint,
  canAdminMarkPayoutPaid,
  canTransitionPayout,
  isPayoutRefundWindowClosed,
  isPayoutOrderRefundWindowClosed,
  isPayoutSettlementBlockingOrder,
  PAYOUT_NON_PAYABLE_FINAL_PAYMENT_STATUSES,
  PAYOUT_NON_TEST_ORDER_FILTER,
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

const router = Router();
router.use(authenticate, requireSuperAdmin);

const toOre = (amount: number) => Math.round(Number(amount || 0) * 100);
const fromOre = (amount?: number | null) => Number(amount || 0) / 100;

const parseDate = (value: unknown) => {
  const date = value ? new Date(String(value)) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
};

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

    const nextStatus = String(status || 'DRAFT').toUpperCase();
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
    const restaurantKey = String(restaurantId);
    const refundWindowHours = payoutRefundWindowHours();

    let payoutAudit: Awaited<ReturnType<typeof reconcileMollieRefundsForPayout>> | undefined;
    if (nextStatus === 'APPROVED' || nextStatus === 'PAID') {
      try {
        payoutAudit = await reconcileMollieRefundsForPayout({
          restaurantId: restaurantKey,
          targetPeriodStart: start,
          targetPeriodEnd: end,
        });
      } catch (error: any) {
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
      if (!canTransitionPayout(currentStatus, nextStatus)) {
        throw new PayoutRequestError(
          409,
          'INVALID_PAYOUT_TRANSITION',
          `Utbetalningen kan inte gå från ${currentStatus} till ${nextStatus}`,
        );
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
        },
      });
      if (!restaurant) {
        throw new PayoutRequestError(404, 'RESTAURANT_NOT_FOUND', 'Restaurang hittades inte');
      }

      const [settingsRow, settlementRows] = await Promise.all([
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
            refundAmount: true,
            updatedAt: true,
          },
        }),
      ]);

      if (nextStatus === 'APPROVED' || nextStatus === 'PAID') {
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

      if (nextStatus === 'APPROVED') {
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
      if (currentStatus === 'APPROVED' && nextStatus === 'APPROVED') {
        return tx.restaurantPayout.findUniqueOrThrow({
          where: { id: existing!.id },
          include: {
            restaurant: { select: { id: true, name: true, city: true, featuredClass: true } },
          },
        });
      }

      const baseCalculation = buildPayoutMoneySnapshot(
        settlementRows,
        restaurant,
        economyFromSettings(settingsRow),
        requestedAdjustmentOre,
        0,
      );
      const recoveryPlan = nextStatus === 'APPROVED'
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
        restaurant,
        economyFromSettings(settingsRow),
        requestedAdjustmentOre,
        recoveryPlan.totalAmount,
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
      if (nextStatus === 'APPROVED') {
        await syncRecoveryReservations(tx, saved.id, recoveryPlan.allocations);
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
