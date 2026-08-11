import {
  buildLateRefundRecoveryPlan,
  buildPayoutFinanceFingerprint,
  assertPayoutProviderAuditFingerprint,
  buildPayoutProviderAuditFingerprint,
  FINANCE_REAL_PAYMENT_STATUSES,
  hasCompletePayoutEconomicSnapshot,
  PAYOUT_NON_TEST_ORDER_FILTER,
  recomputePayoutSettlementFromEconomicSnapshot,
  requiredLateRefundRecoverySettlementAmount,
  type RecoveryPlanAllocation,
  type RecoveryPlanSource,
} from './payoutPolicy';

export class PayoutRecoveryError extends Error {
  constructor(
    public readonly code:
      | 'LEGACY_PAID_PAYOUT_SNAPSHOT_MISSING'
      | 'INVALID_RECOVERY_ALLOCATION_STATE'
      | 'PAYOUT_SOURCE_REFUND_AUDIT_STALE'
      | 'PAYOUT_SOURCE_FEE_AUDIT_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'PayoutRecoveryError';
  }
}

type RecoveryDb = {
  restaurantPayout: any;
  order: any;
  payoutRecoveryAllocation: any;
};

export type LateRefundRecoveryPlan = {
  allocations: RecoveryPlanAllocation[];
  totalAmount: number;
  remainingAmount: number;
  sources: Array<RecoveryPlanSource & {
    periodStart: Date;
    periodEnd: Date;
    paidAmount: number;
    recomputedAmount: number;
  }>;
};

/**
 * Recalculate every earlier PAID period with its frozen commercial snapshot,
 * then reserve only the still-unrecovered delta against this future payout.
 */
export async function calculateLateRefundRecoveryPlan(
  db: RecoveryDb,
  input: {
    restaurantId: string;
    targetPayoutId?: string | null;
    targetPeriodStart: Date;
    targetCapacityAmount: number;
    /** Source periods + exact payable order/reference proof from PSP preflight. */
    auditedSourcePayouts?: readonly {
      payoutId: string;
      fingerprint: readonly string[];
      financeFingerprint?: string;
      mollieFeeAmount?: number;
    }[];
    resolveSourceMollieFeeAmount?: (input: {
      source: any;
      orders: any[];
    }) => Promise<number>;
  },
): Promise<LateRefundRecoveryPlan> {
  const paidSources = await db.restaurantPayout.findMany({
    where: {
      restaurantId: input.restaurantId,
      status: 'PAID',
      periodEnd: { lt: input.targetPeriodStart },
      ...(input.targetPayoutId ? { id: { not: input.targetPayoutId } } : {}),
    },
    include: {
      recoveryAsSource: {
        select: { targetPayoutId: true, amount: true, status: true },
      },
    },
    orderBy: [{ periodEnd: 'asc' }, { id: 'asc' }],
  });

  const auditedSources = input.auditedSourcePayouts
    ? new Map(input.auditedSourcePayouts.map((source) => [source.payoutId, source]))
    : null;
  if (auditedSources) {
    const unaudited = paidSources.find((source: any) => !auditedSources.has(source.id));
    if (unaudited) {
      throw new PayoutRecoveryError(
        'PAYOUT_SOURCE_REFUND_AUDIT_STALE',
        `Betald källperiod ${unaudited.id} tillkom efter PSP-revisionen. Försök igen så hela underlaget granskas.`,
      );
    }
  }

  const sources: LateRefundRecoveryPlan['sources'] = [];
  for (const source of paidSources) {
    if (!hasCompletePayoutEconomicSnapshot(source)) {
      throw new PayoutRecoveryError(
        'LEGACY_PAID_PAYOUT_SNAPSHOT_MISSING',
        `Betald utbetalning ${source.id} saknar ekonomisnapshot. Nästa utbetalning är blockerad tills den har granskats och backfillats.`,
      );
    }

    const orders = await db.order.findMany({
      where: {
        restaurantId: input.restaurantId,
        paymentStatus: { in: [...FINANCE_REAL_PAYMENT_STATUSES] },
        createdAt: { gte: source.periodStart, lte: source.periodEnd },
        ...PAYOUT_NON_TEST_ORDER_FILTER,
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        paymentProvider: true,
        molliePaymentId: true,
        swishPaymentId: true,
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
    if (auditedSources) {
      const auditedSource = auditedSources.get(source.id)!;
      assertPayoutProviderAuditFingerprint(
        orders,
        auditedSource.fingerprint,
        `betald källperiod ${source.id}`,
      );
      if (
        auditedSource.financeFingerprint != null &&
        buildPayoutFinanceFingerprint(orders) !== auditedSource.financeFingerprint
      ) {
        throw new PayoutRecoveryError(
          'PAYOUT_SOURCE_REFUND_AUDIT_STALE',
          `Order- eller avgiftsunderlaget i betald källperiod ${source.id} ändrades efter PSP-revisionen. Försök igen.`,
        );
      }
    } else {
      // Read-only previews still fail closed for unaudited legacy/unknown
      // provider rows even when no PSP preflight proof was supplied.
      buildPayoutProviderAuditFingerprint(orders);
    }
    const auditedMollieFeeAmount = auditedSources?.get(source.id)?.mollieFeeAmount;
    let currentMollieFeeAmount = auditedMollieFeeAmount;
    if (currentMollieFeeAmount == null && input.resolveSourceMollieFeeAmount) {
      try {
        currentMollieFeeAmount = await input.resolveSourceMollieFeeAmount({ source, orders });
      } catch (error) {
        throw new PayoutRecoveryError(
          'PAYOUT_SOURCE_FEE_AUDIT_FAILED',
          error instanceof Error ? error.message : 'Källperiodens Mollie-avgifter kunde inte stämmas av.',
        );
      }
    }
    const recomputed = recomputePayoutSettlementFromEconomicSnapshot(orders, {
      ...source,
      mollieFeeAmount: currentMollieFeeAmount == null
        ? source.mollieFeeAmount
        : currentMollieFeeAmount,
    });
    const paidAmount = Math.max(0, Math.round(Number(source.payoutAmount) || 0));
    const requiredRecoveryAmount = requiredLateRefundRecoverySettlementAmount(
      paidAmount,
      recomputed.snapshot.payoutAmount,
      recomputed.owedAmount,
    );
    const appliedAmount = source.recoveryAsSource
      .filter((allocation: any) => allocation.status === 'APPLIED')
      .reduce((sum: number, allocation: any) => sum + Math.max(0, allocation.amount), 0);
    const reservedElsewhereAmount = source.recoveryAsSource
      .filter((allocation: any) =>
        allocation.status === 'RESERVED' &&
        allocation.targetPayoutId !== input.targetPayoutId)
      .reduce((sum: number, allocation: any) => sum + Math.max(0, allocation.amount), 0);

    sources.push({
      sourcePayoutId: source.id,
      requiredRecoveryAmount,
      appliedAmount,
      reservedElsewhereAmount,
      periodStart: source.periodStart,
      periodEnd: source.periodEnd,
      paidAmount,
      recomputedAmount: recomputed.snapshot.payoutAmount,
    });
  }

  return {
    ...buildLateRefundRecoveryPlan(sources, input.targetCapacityAmount),
    sources,
  };
}

/** Make the target's RESERVED ledger exactly match a freshly calculated plan. */
export async function syncRecoveryReservations(
  db: RecoveryDb,
  targetPayoutId: string,
  allocations: readonly RecoveryPlanAllocation[],
): Promise<void> {
  const current = await db.payoutRecoveryAllocation.findMany({
    where: { targetPayoutId },
  });
  const desired = new Map(allocations.map((allocation) => [allocation.sourcePayoutId, allocation.amount]));
  const now = new Date();

  for (const allocation of current) {
    const amount = desired.get(allocation.sourcePayoutId);
    if (amount != null) {
      if (allocation.status === 'APPLIED') {
        throw new PayoutRecoveryError(
          'INVALID_RECOVERY_ALLOCATION_STATE',
          'En redan tillämpad sen-refund recovery kan inte reserveras på nytt.',
        );
      }
      await db.payoutRecoveryAllocation.update({
        where: { id: allocation.id },
        data: {
          amount,
          status: 'RESERVED',
          reservedAt: now,
          appliedAt: null,
          releasedAt: null,
          releaseReason: null,
        },
      });
      desired.delete(allocation.sourcePayoutId);
    } else if (allocation.status === 'RESERVED') {
      await db.payoutRecoveryAllocation.update({
        where: { id: allocation.id },
        data: {
          status: 'RELEASED',
          releasedAt: now,
          releaseReason: 'REAPPROVAL_RECALCULATION',
        },
      });
    }
  }

  for (const [sourcePayoutId, amount] of desired) {
    await db.payoutRecoveryAllocation.create({
      data: { sourcePayoutId, targetPayoutId, amount, status: 'RESERVED', reservedAt: now },
    });
  }
}

export async function releaseRecoveryReservations(
  db: RecoveryDb,
  targetPayoutId: string,
  reason: string,
): Promise<void> {
  await db.payoutRecoveryAllocation.updateMany({
    where: { targetPayoutId, status: 'RESERVED' },
    data: { status: 'RELEASED', releasedAt: new Date(), releaseReason: reason },
  });
}

export async function applyRecoveryReservations(
  db: RecoveryDb,
  targetPayoutId: string,
): Promise<void> {
  await db.payoutRecoveryAllocation.updateMany({
    where: { targetPayoutId, status: 'RESERVED' },
    data: { status: 'APPLIED', appliedAt: new Date(), releasedAt: null, releaseReason: null },
  });
}

export async function getReservedRecoveryAllocations(
  db: RecoveryDb,
  targetPayoutId: string,
): Promise<RecoveryPlanAllocation[]> {
  const allocations = await db.payoutRecoveryAllocation.findMany({
    where: { targetPayoutId, status: 'RESERVED' },
    select: { sourcePayoutId: true, amount: true },
  });
  return allocations;
}
