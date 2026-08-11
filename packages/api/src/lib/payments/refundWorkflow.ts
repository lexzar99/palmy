import prisma from '../prisma';
import {
  persistRefundOutcome,
  syncRemoteRefundOutcome,
} from './refundPersistence';
import {
  recordRefundProviderResponse,
  recordRefundRequest,
} from './refundLedger';
import {
  hasActiveRemoteRefund,
  paymentStatusAfterRefund,
  refundAttemptIdempotencyKey,
  refundLifecycleAction,
  resolveRefundPayment,
} from './refunds';

const NON_REFUNDABLE_REFS = new Set(['TEST_PAYMENT', 'FREE_PROMO', 'BYPASS']);

export class RefundWorkflowError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'RefundWorkflowError';
  }
}

export type RefundWorkflowOptions = {
  requestedAmountOre?: number | null;
  actorAdminId?: string | null;
  /** Undefined means global; a value is included in every read/CAS. */
  restaurantIdScope?: string;
  /** Used by paid REJECTED/CANCELLED transitions to claim status + refund atomically. */
  terminalStatus?: 'REJECTED' | 'CANCELLED';
  expectedOrderStatus?: string;
  announce?: boolean;
};

type RefundWorkflowDependencies = {
  prisma: any;
  resolveRefundPayment: typeof resolveRefundPayment;
  persistRefundOutcome: typeof persistRefundOutcome;
  syncRemoteRefundOutcome: typeof syncRemoteRefundOutcome;
  recordRefundRequest: typeof recordRefundRequest;
  recordRefundProviderResponse: typeof recordRefundProviderResponse;
  announceFullRefund: (
    orderId: string,
    restaurantId: string | null,
    orderStatus?: 'CANCELLED' | 'REJECTED',
  ) => Promise<void>;
};

const defaultDependencies: RefundWorkflowDependencies = {
  prisma,
  resolveRefundPayment,
  persistRefundOutcome,
  syncRemoteRefundOutcome,
  recordRefundRequest,
  recordRefundProviderResponse,
  announceFullRefund: async (orderId, restaurantId, orderStatus) => {
    const { announceFullRefund } = await import('./refundNotifications');
    await announceFullRefund(orderId, restaurantId, orderStatus);
  },
};

function scopedWhere(orderId: string, restaurantIdScope?: string) {
  return {
    id: orderId,
    ...(restaurantIdScope ? { restaurantId: restaurantIdScope } : {}),
  };
}

/**
 * Initiate one refund under a DB compare-and-swap lock. For Mollie, accepted
 * async refunds remain REFUNDING until webhook/poll reconciliation proves a
 * `refunded`, `failed`, or `canceled` outcome.
 */
export async function refundOrderForAdmin(
  orderId: string,
  reason: string,
  options: RefundWorkflowOptions = {},
  dependencies: Partial<RefundWorkflowDependencies> = {},
) {
  const deps = { ...defaultDependencies, ...dependencies };
  const where = scopedWhere(orderId, options.restaurantIdScope);
  let order = await deps.prisma.order.findFirst({ where });
  if (!order) throw new RefundWorkflowError('not_found', 'Ordern hittades inte');

  if (order.paymentStatus === 'REFUNDED') {
    return {
      status: 'already_refunded' as const,
      refundedAmountOre: 0,
      cumulativeRefundOre: Math.max(0, order.refundAmount ?? order.total),
      restaurantId: order.restaurantId,
      orderStatus: order.status,
    };
  }
  if (order.paymentStatus === 'REFUNDING') {
    return {
      status: 'refund_pending' as const,
      refundedAmountOre: 0,
      cumulativeRefundOre: Math.max(0, order.refundAmount ?? 0),
      restaurantId: order.restaurantId,
      orderStatus: order.status,
      refundStatus: 'pending' as const,
    };
  }
  if (!['PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus)) {
    throw new RefundWorkflowError('not_paid', 'Ordern har ingen slutförd betalning att återbetala');
  }
  if (options.terminalStatus && options.requestedAmountOre != null) {
    throw new RefundWorkflowError('terminal_refund_must_be_full', 'En avslutad betald order måste återbetalas fullt');
  }

  const payment = deps.resolveRefundPayment(order);
  if (!payment || NON_REFUNDABLE_REFS.has(payment.ref)) {
    throw new RefundWorkflowError(
      'no_unambiguous_payment_provider',
      'Betalningsleverantör eller referens saknas',
    );
  }
  const { provider, ref: paymentRef } = payment;

  // Mollie, direct Swish and Stripe all expose an authoritative async refund
  // lifecycle. Adyen remains legacy/read-only until it has equivalent polling.
  if (provider.name !== 'mollie' && provider.name !== 'swish' && provider.name !== 'stripe') {
    throw new RefundWorkflowError(
      'legacy_provider_refund_disabled',
      `Refund via ${provider.name} är avstängd. Hantera legacybetalningen enligt den manuella PSP-runbooken.`,
    );
  }

  let remoteStatus: Awaited<ReturnType<typeof provider.getRemoteStatus>>;
  try {
    remoteStatus = await provider.getRemoteStatus(paymentRef);
  } catch (error: any) {
    throw new RefundWorkflowError(
      `${provider.name}_retrieve`,
      error?.message || 'PSP-status kunde inte hämtas',
    );
  }
  if (remoteStatus.state !== 'paid') {
    throw new RefundWorkflowError(
      `payment_status_${remoteStatus.state}`,
      `Betalstatus hos ${provider.name}: ${remoteStatus.state}`,
    );
  }

  const paidAmountOre = remoteStatus.amountReceivedOre ?? order.total;
  const localRefundedOre = Math.max(0, order.refundAmount ?? 0);
  const remoteRefundedOre = Math.max(0, remoteStatus.amountRefundedOre ?? 0);

  // Recover a dashboard refund or a previous response-loss before calculating
  // a new amount. This closes the last double-refund window.
  if (remoteRefundedOre > localRefundedOre || (remoteStatus.refunds?.length ?? 0) > 0) {
    const synced = await deps.syncRemoteRefundOutcome({
      orderId: order.id,
      paymentRef,
      paidAmountOre,
      cumulativeRefundOre: remoteRefundedOre,
      provider: provider.name,
      source: 'PAYMENT_STATUS',
      refunds: remoteStatus.refunds,
    }, {
      prisma: deps.prisma,
      persistRefundOutcome: deps.persistRefundOutcome,
    });
    if (synced.changed && synced.fullRefund && options.announce !== false) {
      await deps.announceFullRefund(
        order.id,
        synced.restaurantId,
        synced.orderStatus === 'REJECTED' ? 'REJECTED' : 'CANCELLED',
      );
    }
    order = await deps.prisma.order.findFirst({ where });
    if (!order || order.paymentStatus === 'REFUNDED') {
      return {
        status: 'already_refunded' as const,
        refundedAmountOre: 0,
        cumulativeRefundOre: remoteRefundedOre,
        restaurantId: order?.restaurantId ?? null,
        orderStatus: order?.status ?? synced.orderStatus,
      };
    }
  }

  // A queued/processing PSP refund is already money in motion. Adopt it under
  // the local lock instead of creating a second refund.
  if (hasActiveRemoteRefund(remoteStatus.refunds)) {
    const adopted = await deps.prisma.order.updateMany({
      where: {
        ...where,
        paymentStatus: order.paymentStatus,
        ...(options.expectedOrderStatus ? { status: options.expectedOrderStatus } : {}),
      },
      data: {
        paymentStatus: 'REFUNDING',
        ...(options.terminalStatus ? { status: options.terminalStatus } : {}),
      },
    });
    if (adopted.count !== 1) {
      throw new RefundWorkflowError('refund_in_progress', 'En annan återbetalning behandlas redan');
    }
    return {
      status: 'refund_pending' as const,
      refundedAmountOre: 0,
      cumulativeRefundOre: Math.max(localRefundedOre, remoteRefundedOre),
      restaurantId: order.restaurantId,
      orderStatus: options.terminalStatus ?? order.status,
      provider: provider.name,
      refundStatus: 'pending' as const,
    };
  }

  const alreadyRefundedOre = Math.max(localRefundedOre, remoteRefundedOre);
  const remainingRefundableOre = Math.max(0, paidAmountOre - alreadyRefundedOre);
  const refundAmountOre = options.requestedAmountOre ?? remainingRefundableOre;
  if (!Number.isInteger(refundAmountOre) || refundAmountOre <= 0) {
    throw new RefundWorkflowError('nothing_remaining', 'Inget belopp återstår att återbetala');
  }
  if (refundAmountOre > remainingRefundableOre) {
    throw new RefundWorkflowError(
      'amount_exceeds_remaining',
      `Återbetalningsbeloppet överskrider återstående belopp (${remainingRefundableOre / 100} kr)`,
    );
  }

  const cumulativeRefundOre = alreadyRefundedOre + refundAmountOre;
  let terminalAttemptCount = 0;
  try {
    terminalAttemptCount = await deps.prisma.paymentRefund.count({
      where: {
        orderId: order.id,
        provider: provider.name,
        cumulativeAmount: cumulativeRefundOre,
        status: { in: ['FAILED', 'CANCELED'] },
      },
    });
  } catch (error: any) {
    throw new RefundWorkflowError(
      'refund_ledger_unavailable',
      error?.message || 'Refund-ledgern kunde inte läsas',
    );
  }
  const idempotencyKey = refundAttemptIdempotencyKey(
    order.id,
    cumulativeRefundOre,
    terminalAttemptCount,
  );
  const previousPaymentStatus = order.paymentStatus;
  const previousOrderStatus = order.status;
  const restoreLock = async () => {
    await deps.prisma.order.updateMany({
      where: {
        ...where,
        paymentStatus: 'REFUNDING',
        ...(options.terminalStatus ? { status: options.terminalStatus } : {}),
      },
      data: {
        paymentStatus: previousPaymentStatus,
        ...(options.terminalStatus ? { status: previousOrderStatus } : {}),
      },
    });
  };

  let ledger: any;
  try {
    ledger = await deps.prisma.$transaction(async (tx: any) => {
      const lock = await tx.order.updateMany({
        where: {
          ...where,
          paymentStatus: previousPaymentStatus,
          ...(options.expectedOrderStatus ? { status: options.expectedOrderStatus } : {}),
        },
        data: {
          paymentStatus: 'REFUNDING',
          ...(options.terminalStatus ? { status: options.terminalStatus } : {}),
        },
      });
      if (lock.count !== 1) {
        throw new RefundWorkflowError('refund_in_progress', 'En annan återbetalning behandlas redan');
      }
      return deps.recordRefundRequest({
        orderId: order.id,
        provider: provider.name,
        paymentRef,
        idempotencyKey,
        amountOre: refundAmountOre,
        cumulativeAmountOre: cumulativeRefundOre,
        actorAdminId: options.actorAdminId,
        reason,
      }, tx);
    });
  } catch (error: any) {
    if (error instanceof RefundWorkflowError) throw error;
    throw new RefundWorkflowError(
      'refund_ledger_unavailable',
      error?.message || 'Refund-ledgern kunde inte skrivas',
    );
  }

  let refund: Awaited<ReturnType<typeof provider.refund>>;
  try {
    refund = await provider.refund(
      paymentRef,
      refundAmountOre,
      idempotencyKey,
    );
  } catch (error) {
    // The stable key makes an immediate same-cumulative retry safe after an
    // ambiguous network failure.
    try {
      await deps.recordRefundProviderResponse({
        idempotencyKey,
        provider: provider.name,
        status: 'unknown',
      }, deps.prisma);
    } catch (ledgerError) {
      console.error('[refund] kunde inte markera tvetydigt PSP-svar i ledgern:', ledgerError);
    }
    await restoreLock();
    throw error;
  }

  // Persist PSP evidence before releasing or completing the local order lock.
  // If this write fails, REFUNDING stays fail-closed and reconciliation heals
  // the order without risking a second economic refund.
  ledger = await deps.recordRefundProviderResponse({
    idempotencyKey,
    provider: provider.name,
    refundRef: refund.refundRef,
    status: refund.status,
  }, deps.prisma);

  const lifecycle = refundLifecycleAction(provider.name, refund.status);
  if (lifecycle === 'release') {
    await restoreLock();
    throw new RefundWorkflowError(
      `refund_${refund.status}`,
      `Återbetalningen ${refund.status === 'canceled' ? 'avbröts' : 'misslyckades'} hos ${provider.name}`,
    );
  }
  if (lifecycle === 'wait') {
    return {
      status: 'refund_pending' as const,
      refundedAmountOre: refundAmountOre,
      cumulativeRefundOre,
      refundRef: refund.refundRef,
      refundStatus: refund.status ?? 'unknown',
      provider: provider.name,
      ledgerId: ledger.id,
      restaurantId: order.restaurantId,
      orderStatus: options.terminalStatus ?? order.status,
    };
  }

  const nextPaymentStatus = paymentStatusAfterRefund(paidAmountOre, cumulativeRefundOre);
  const localOutcome = await deps.persistRefundOutcome({
    orderId: order.id,
    expectedPaymentStatus: 'REFUNDING',
    nextPaymentStatus,
    cumulativeRefundOre,
    reason,
    actorAdminId: options.actorAdminId,
  });
  if (localOutcome.fullRefund && options.announce !== false) {
    await deps.announceFullRefund(
      order.id,
      order.restaurantId,
      localOutcome.orderStatus === 'REJECTED' ? 'REJECTED' : 'CANCELLED',
    );
  }

  return {
    status: 'refunded' as const,
    refundedAmountOre: refundAmountOre,
    cumulativeRefundOre,
    refundRef: refund.refundRef,
    refundStatus: refund.status ?? 'refunded',
    provider: provider.name,
    ledgerId: ledger.id,
    restaurantId: order.restaurantId,
    ...localOutcome,
  };
}
