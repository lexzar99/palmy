import {
  buildLateRefundRecoveryPlan,
  assertPayoutProviderAuditFingerprint,
  buildPayoutProviderAuditFingerprint,
  hasCompletePayoutEconomicSnapshot,
  PAYOUT_NON_PAYABLE_FINAL_PAYMENT_STATUSES,
  PAYOUT_NON_TEST_ORDER_FILTER,
  recomputePayoutFromEconomicSnapshot,
  requiredLateRefundRecoveryAmount,
  type RecoveryPlanAllocation,
  type RecoveryPlanSource,
} from './payoutPolicy';

export class PayoutRecoveryError extends Error {
  constructor(
    public readonly code:
      | 'LEGACY_PAID_PAYOUT_SNAPSHOT_MISSING'
      | 'INVALID_RECOVERY_ALLOCATION_STATE'
      | 'PAYOUT_SOURCE_REFUND_AUDIT_STALE',
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
    }[];
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
    ? new Map(input.auditedSourcePayouts.map((source) => [source.payoutId, source.fingerprint]))
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
        paymentStatus: { notIn: [...PAYOUT_NON_PAYABLE_FINAL_PAYMENT_STATUSES] },
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
        total: true,
        deliveryFee: true,
        tipAmount: true,
        refundAmount: true,
        updatedAt: true,
      },
    });
    if (auditedSources) {
      assertPayoutProviderAuditFingerprint(
        orders,
        auditedSources.get(source.id)!,
        `betald källperiod ${source.id}`,
      );
    } else {
      // Read-only previews still fail closed for unaudited legacy/unknown
      // provider rows even when no PSP preflight proof was supplied.
      buildPayoutProviderAuditFingerprint(orders);
    }
    const recomputed = recomputePayoutFromEconomicSnapshot(orders, source);
    const paidAmount = Math.max(0, Math.round(Number(source.payoutAmount) || 0));
    const requiredRecoveryAmount = requiredLateRefundRecoveryAmount(
      paidAmount,
      recomputed.payoutAmount,
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
      recomputedAmount: recomputed.payoutAmount,
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
