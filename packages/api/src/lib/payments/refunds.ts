import { createHash } from 'crypto';
import { getPaymentProviderByName } from './index';
import type { PaymentProvider } from './types';
import type { RemoteRefundState, RemoteRefundStatus } from './types';
import type { PaymentProviderName } from './finalize';

export type RefundPaymentOrder = {
  id: string;
  paymentProvider: string | null;
  molliePaymentId: string | null;
  swishPaymentId?: string | null;
  stripePaymentIntentId: string | null;
  adyenPspReference: string | null;
};

function supportedProvider(value: unknown): PaymentProviderName | null {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'mollie' || normalized === 'stripe' || normalized === 'adyen' || normalized === 'swish'
    ? normalized
    : null;
}

function refForProvider(order: RefundPaymentOrder, provider: PaymentProviderName): string | null {
  if (provider === 'mollie') return order.molliePaymentId;
  if (provider === 'swish') return order.swishPaymentId;
  if (provider === 'stripe') return order.stripePaymentIntentId;
  return order.adyenPspReference;
}

/**
 * Välj PSP från orderraden, aldrig från dagens PAYMENT_PROVIDER. För äldre
 * rader utan paymentProvider tillåts inferens endast när exakt en PSP-ref finns.
 */
export function resolveRefundPayment(
  order: RefundPaymentOrder,
): { provider: PaymentProvider; ref: string } | null {
  const stored = supportedProvider(order.paymentProvider);
  if (stored) {
    const ref = refForProvider(order, stored);
    return ref ? { provider: getPaymentProviderByName(stored), ref } : null;
  }

  const candidates = (
    [
      ['mollie', order.molliePaymentId],
      ['swish', order.swishPaymentId],
      ['stripe', order.stripePaymentIntentId],
      ['adyen', order.adyenPspReference],
    ] as const
  ).filter((candidate): candidate is readonly [PaymentProviderName, string] => Boolean(candidate[1]));

  if (candidates.length !== 1) return null;
  return {
    provider: getPaymentProviderByName(candidates[0][0]),
    ref: candidates[0][1],
  };
}

/** Samma refund-försök får samma PSP-nyckel även efter timeout eller dubbelklick. */
export function refundIdempotencyKey(orderId: string, cumulativeRefundOre: number): string {
  const digest = createHash('sha256')
    .update(`viaeats-refund-v1\0${orderId}\0${cumulativeRefundOre}`, 'utf8')
    .digest('hex');
  return `ve-ref-${digest.slice(0, 48)}`;
}

/** A terminal failed/canceled PSP attempt gets a new stable retry key. */
export function refundAttemptIdempotencyKey(
  orderId: string,
  cumulativeRefundOre: number,
  terminalAttemptCount: number,
): string {
  const base = refundIdempotencyKey(orderId, cumulativeRefundOre);
  const retryNo = Math.max(0, Math.floor(terminalAttemptCount));
  return retryNo > 0 ? `${base}-retry-${retryNo}` : base;
}

export function paymentStatusAfterRefund(totalOre: number, cumulativeRefundOre: number) {
  return cumulativeRefundOre >= totalOre ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
}

export type RefundAdmin = {
  role?: string | null;
  restaurantId?: string | null;
};

/** Money operations are global only for SUPER_ADMIN; tenant admins stay in-tenant. */
export function refundRestaurantScope(admin: RefundAdmin | null | undefined): {
  allowed: boolean;
  restaurantId?: string;
} {
  if (admin?.role === 'SUPER_ADMIN') return { allowed: true };
  if (
    (admin?.role === 'ADMIN' || admin?.role === 'RESTAURANT_ADMIN') &&
    admin.restaurantId
  ) {
    return { allowed: true, restaurantId: admin.restaurantId };
  }
  return { allowed: false };
}

/** Namnet kunden/personalen känner igen. Aldrig hårdkodat i meddelandetexter. */
export function refundProviderLabel(provider: string | null | undefined): string {
  switch (String(provider || '').trim().toLowerCase()) {
    case 'swish': return 'Swish';
    case 'stripe': return 'Stripe';
    case 'mollie': return 'Mollie';
    case 'adyen': return 'Adyen';
    default: return 'betalleverantören';
  }
}

export type RefundLifecycleAction = 'complete' | 'wait' | 'release';

/** Unknown provider responses remain locked until reconciliation proves an outcome. */
export function refundLifecycleAction(
  provider: string,
  state: RemoteRefundState | undefined,
): RefundLifecycleAction {
  if (state === 'refunded') return 'complete';
  if (state === 'failed' || state === 'canceled') return 'release';
  if (state === 'queued' || state === 'pending' || state === 'processing') return 'wait';
  return 'wait';
}

export function hasActiveRemoteRefund(refunds: RemoteRefundStatus[] | undefined): boolean {
  return Boolean(refunds?.some((refund) =>
    refund.state === 'queued' || refund.state === 'pending' || refund.state === 'processing'));
}

export function hasFailedRemoteRefund(refunds: RemoteRefundStatus[] | undefined): boolean {
  return Boolean(refunds?.some((refund) =>
    refund.state === 'failed' || refund.state === 'canceled'));
}

export function paymentStatusBeforePendingRefund(cumulativeRefundOre: number) {
  return cumulativeRefundOre > 0 ? 'PARTIALLY_REFUNDED' : 'PAID';
}

export function isRefundRequiredTerminalStatus(status: string): status is 'REJECTED' | 'CANCELLED' {
  return status === 'REJECTED' || status === 'CANCELLED';
}
