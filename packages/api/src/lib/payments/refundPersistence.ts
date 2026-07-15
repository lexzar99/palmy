import prisma from '../prisma';
import { reviewPushId } from '../notificationIds';
import type { RemoteRefundStatus } from './types';
import {
  recordKnownRemoteRefunds,
  type RefundLedgerProvider,
  type RefundLedgerSource,
} from './refundLedger';
import {
  hasActiveRemoteRefund,
  hasFailedRemoteRefund,
  paymentStatusBeforePendingRefund,
} from './refunds';

export class RefundPersistenceConflict extends Error {
  constructor(message = 'Refund-statusen ändrades av en annan process') {
    super(message);
    this.name = 'RefundPersistenceConflict';
  }
}

export type PersistRefundOutcomeInput = {
  orderId: string;
  expectedPaymentStatus: string;
  nextPaymentStatus: 'PARTIALLY_REFUNDED' | 'REFUNDED';
  cumulativeRefundOre: number;
  reason: string;
  actorAdminId?: string | null;
};

export type PersistRefundOutcomeResult = {
  fullRefund: boolean;
  orderStatus: string;
  revertedReferrals: number;
  expiredInviterRewards: number;
  alreadyUsedInviterRewards: number;
};

export type SyncRemoteRefundResult = {
  changed: boolean;
  fullRefund: boolean;
  restaurantId: string | null;
  orderStatus?: string;
  pending?: boolean;
  released?: boolean;
  /** Legacy callers may still branch on this; convergence no longer asks PSPs to retry. */
  needsRetry?: boolean;
};

/**
 * Persist every local side effect of a successful PSP refund atomically.
 * The PSP call happens before this function; the expected-status CAS makes
 * retries and concurrent admin clicks unable to decrement counters twice.
 */
export async function persistRefundOutcome(
  input: PersistRefundOutcomeInput,
): Promise<PersistRefundOutcomeResult> {
  return (prisma as any).$transaction(async (tx: any) => {
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      select: {
        id: true,
        status: true,
        discountCode: true,
        appliedDealId: true,
        userDealId: true,
      },
    });
    if (!order) throw new RefundPersistenceConflict('Ordern finns inte längre');

    const fullRefund = input.nextPaymentStatus === 'REFUNDED';
    // A restaurant rejection/cancellation that initiated the refund already
    // owns the customer-visible terminal status. Dashboard/admin refunds use
    // CANCELLED as the safe default.
    const orderStatus =
      fullRefund && (order.status === 'REJECTED' || order.status === 'CANCELLED')
        ? order.status
        : fullRefund
          ? 'CANCELLED'
          : order.status;
    const changed = await tx.order.updateMany({
      where: { id: input.orderId, paymentStatus: input.expectedPaymentStatus },
      data: {
        paymentStatus: input.nextPaymentStatus,
        refundAmount: input.cumulativeRefundOre,
        refundReason: input.reason,
        refundedAt: new Date(),
        ...(fullRefund
          ? { status: orderStatus, discountUsageCounted: false }
          : {}),
      },
    });
    if (changed.count !== 1) throw new RefundPersistenceConflict();

    let revertedReferrals = 0;
    let expiredInviterRewards = 0;
    let alreadyUsedInviterRewards = 0;

    if (fullRefund) {
      await tx.scheduledPush.updateMany({
        where: { id: reviewPushId(order.id), sentAt: null, cancelledAt: null },
        data: { cancelledAt: new Date() },
      });

      // A full refund returns every one-time benefit and its usage slot.
      // updateMany+gt:0 is safe for legacy orders whose counters were never
      // incremented, and the payment-status CAS means this runs at most once.
      if (order.discountCode && !['test', 'testa'].includes(String(order.discountCode).toLowerCase())) {
        await tx.discountCode.updateMany({
          where: { code: String(order.discountCode).toUpperCase(), usageCount: { gt: 0 } },
          data: { usageCount: { decrement: 1 } },
        });
        const personal = await tx.customerDeal.findUnique({
          where: { code: order.discountCode },
          select: { id: true, usageCount: true, maxUsages: true },
        });
        if (personal?.usageCount > 0) {
          const nextUsage = personal.usageCount - 1;
          await tx.customerDeal.update({
            where: { id: personal.id },
            data: { usageCount: nextUsage, isUsed: nextUsage >= (personal.maxUsages || 1) },
          });
        }
      }

      if (order.appliedDealId) {
        await tx.deal.updateMany({
          where: { id: order.appliedDealId, usageCount: { gt: 0 } },
          data: { usageCount: { decrement: 1 } },
        });
      }

      if (order.userDealId) {
        await tx.userDeal.updateMany({
          where: {
            id: order.userDealId,
            usedOnOrderId: order.id,
            status: { in: ['USED', 'RESERVED'] },
          },
          data: { status: 'ACTIVE', usedOnOrderId: null, usedAt: null },
        });
      }

      // If this order earned the inviter reward, a full refund invalidates
      // that reward. Already-consumed rewards are retained for accounting,
      // but the referral itself is marked REVERTED and becomes visible in
      // admin instead of silently counting as a successful conversion.
      const referrals = await tx.referral.findMany({
        where: { inviteeOrderId: order.id, status: 'ORDERED' },
        select: { id: true },
      });
      for (const referral of referrals) {
        const reverted = await tx.referral.updateMany({
          where: { id: referral.id, status: 'ORDERED' },
          data: {
            status: 'REVERTED',
            revertedAt: new Date(),
            revertedBy: input.actorAdminId || null,
            revertReason: 'Automatiskt återkallad efter full återbetalning av värvningsordern',
          },
        });
        if (reverted.count !== 1) continue;
        revertedReferrals += 1;

        const expired = await tx.userDeal.updateMany({
          where: {
            type: 'REFERRAL_INVITER',
            status: 'ACTIVE',
            metadata: { path: ['referralId'], equals: referral.id },
          },
          data: { status: 'EXPIRED' },
        });
        expiredInviterRewards += expired.count;
        alreadyUsedInviterRewards += await tx.userDeal.count({
          where: {
            type: 'REFERRAL_INVITER',
            status: 'USED',
            metadata: { path: ['referralId'], equals: referral.id },
          },
        });
      }
    }

    return {
      fullRefund,
      orderStatus,
      revertedReferrals,
      expiredInviterRewards,
      alreadyUsedInviterRewards,
    };
  });
}

/**
 * Reconcile a refund created directly in the PSP dashboard. Admin-initiated
 * refunds already pass through persistRefundOutcome; this closes the other
 * direction so coupons, referral rewards and order status cannot drift.
 */
export async function syncRemoteRefundOutcome(input: {
  orderId: string;
  paymentRef: string;
  paidAmountOre: number;
  cumulativeRefundOre: number;
  provider: RefundLedgerProvider;
  source: RefundLedgerSource;
  refunds?: RemoteRefundStatus[];
}, dependencies: {
  prisma?: any;
  persistRefundOutcome?: typeof persistRefundOutcome;
  recordKnownRemoteRefunds?: typeof recordKnownRemoteRefunds;
} = {}): Promise<SyncRemoteRefundResult> {
  const db = dependencies.prisma ?? prisma;
  const persist = dependencies.persistRefundOutcome ?? persistRefundOutcome;
  const recordKnown = dependencies.recordKnownRemoteRefunds ?? recordKnownRemoteRefunds;
  const paidAmountOre = Math.max(0, Math.round(input.paidAmountOre));
  const cumulativeRefundOre = Math.min(paidAmountOre, Math.max(0, Math.round(input.cumulativeRefundOre)));
  let ledgerRecorded = false;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const order = await db.order.findUnique({
      where: { id: input.orderId },
      select: { status: true, paymentStatus: true, refundAmount: true, restaurantId: true },
    });
    if (!order) {
      return { changed: false, fullRefund: false, restaurantId: order?.restaurantId ?? null };
    }
    if (!ledgerRecorded) {
      await recordKnown({
        orderId: input.orderId,
        provider: input.provider,
        paymentRef: input.paymentRef,
        cumulativeRefundOre: input.cumulativeRefundOre,
        refunds: input.refunds,
        source: input.source,
      }, db);
      ledgerRecorded = true;
    }
    if (paidAmountOre <= 0) {
      return { changed: false, fullRefund: false, restaurantId: order.restaurantId };
    }
    const activeRemoteRefund = hasActiveRemoteRefund(input.refunds);
    if (activeRemoteRefund && cumulativeRefundOre <= (order.refundAmount ?? 0)) {
      const claimed = ['PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus)
        ? await db.order.updateMany({
            where: { id: input.orderId, paymentStatus: order.paymentStatus },
            data: { paymentStatus: 'REFUNDING' },
          })
        : { count: 0 };
      return {
        changed: claimed.count === 1,
        fullRefund: cumulativeRefundOre >= paidAmountOre,
        restaurantId: order.restaurantId,
        orderStatus: order.status,
        pending: true,
      };
    }
    if (cumulativeRefundOre <= 0 && order.paymentStatus !== 'REFUNDING') {
      return { changed: false, fullRefund: false, restaurantId: order.restaurantId };
    }

    const fullRefund = cumulativeRefundOre >= paidAmountOre;
    if ((order.refundAmount ?? 0) >= cumulativeRefundOre) {
      if (order.paymentStatus === 'REFUNDING') {
        if (activeRemoteRefund) {
          return {
            changed: false,
            fullRefund,
            restaurantId: order.restaurantId,
            orderStatus: order.status,
            pending: true,
          };
        }
        if (hasFailedRemoteRefund(input.refunds)) {
          // Pengarna är fortfarande dragna, men en nekad/avbruten order får
          // aldrig återuppstå som PENDING och råka tillagas. Behåll terminal
          // status, släpp endast refund-låset till PAID/PARTIALLY_REFUNDED så
          // adminens nästa försök kan initiera en ny säker återbetalning.
          const releasedOrderStatus = order.status;
          const released = await db.order.updateMany({
            where: { id: input.orderId, paymentStatus: 'REFUNDING' },
            data: {
              paymentStatus: paymentStatusBeforePendingRefund(order.refundAmount ?? 0),
            },
          });
          return {
            changed: released.count === 1,
            fullRefund: false,
            restaurantId: order.restaurantId,
            orderStatus: releasedOrderStatus,
            released: released.count === 1,
          };
        }
        // Unknown/no lifecycle evidence is fail-closed: keep the lock and let
        // the next webhook/poll prove success or failure.
        return {
          changed: false,
          fullRefund,
          restaurantId: order.restaurantId,
          orderStatus: order.status,
          pending: true,
        };
      }
      return {
        changed: false,
        fullRefund,
        restaurantId: order.restaurantId,
        orderStatus: order.status,
      };
    }
    if (!['PAID', 'PARTIALLY_REFUNDED', 'REFUNDING'].includes(order.paymentStatus)) {
      return { changed: false, fullRefund, restaurantId: order.restaurantId };
    }

    try {
      const persisted = await persist({
        orderId: input.orderId,
        expectedPaymentStatus: order.paymentStatus,
        nextPaymentStatus: fullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        cumulativeRefundOre,
        reason: `Synkroniserad återbetalning från ${input.provider}`,
        actorAdminId: null,
      });
      if (!fullRefund && activeRemoteRefund) {
        // One refund completed while another is still money in motion. Keep
        // the completed cumulative amount, but reclaim the lock so neither a
        // second refund nor a payout can race the outstanding PSP operation.
        await db.order.updateMany({
          where: { id: input.orderId, paymentStatus: 'PARTIALLY_REFUNDED' },
          data: { paymentStatus: 'REFUNDING' },
        });
      }
      return {
        changed: true,
        fullRefund,
        restaurantId: order.restaurantId,
        orderStatus: persisted.orderStatus,
        pending: !fullRefund && activeRemoteRefund,
      };
    } catch (error) {
      if (!(error instanceof RefundPersistenceConflict) || attempt === 1) throw error;
    }
  }

  return { changed: false, fullRefund: false, restaurantId: null };
}
