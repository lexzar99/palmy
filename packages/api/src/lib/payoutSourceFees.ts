import { exactMollieFeeSnapshot, getMollieFinanceReport } from './mollieFinance';

export type PayoutSourceFeeOrder = {
  id: string;
  orderNumber: string;
  paymentStatus: string;
  paymentProvider: string | null;
  molliePaymentId: string | null;
  refundAmount?: number | null;
  updatedAt: Date | string;
};

export type PayoutSourceFeeSnapshot = {
  id: string;
  periodStart: Date;
  periodEnd: Date;
  paidAt?: Date | string | null;
  mollieFeeAmount?: number | null;
};

export class PayoutSourceFeeError extends Error {
  constructor(
    public readonly code:
      | 'PAYOUT_SOURCE_MOLLIE_PAYMENT_ID_MISSING'
      | 'PAYOUT_SOURCE_MOLLIE_PAYMENT_ID_DUPLICATED'
      | 'PAYOUT_SOURCE_MOLLIE_FEES_NOT_RECONCILED',
    message: string,
  ) {
    super(message);
    this.name = 'PayoutSourceFeeError';
  }
}

/**
 * Resolve the current provider cost of a previously paid period. With no
 * post-payment refund the immutable saved fee remains authoritative. After a
 * late refund, both the original payment fee and every currently booked
 * refund-processing fee are read fresh from Mollie.
 */
export async function resolveCurrentPayoutSourceMollieFeeAmount(input: {
  source: PayoutSourceFeeSnapshot;
  orders: readonly PayoutSourceFeeOrder[];
  bypassCache?: boolean;
}): Promise<number> {
  const paidAt = input.source.paidAt
    ? new Date(input.source.paidAt).getTime()
    : Number.NEGATIVE_INFINITY;
  const hasLateRefund = input.orders.some((order) =>
    (Number(order.refundAmount || 0) > 0 || String(order.paymentStatus).toUpperCase() === 'REFUNDED') &&
    new Date(order.updatedAt).getTime() > paidAt,
  );
  if (!hasLateRefund) {
    return Math.max(0, Math.round(Number(input.source.mollieFeeAmount || 0)));
  }

  const nonMollie = input.orders.find(
    (order) => String(order.paymentProvider || '').toLowerCase() !== 'mollie',
  );
  const missingPaymentId = input.orders.find(
    (order) => !String(order.molliePaymentId || '').trim(),
  );
  if (nonMollie || missingPaymentId) {
    throw new PayoutSourceFeeError(
      'PAYOUT_SOURCE_MOLLIE_PAYMENT_ID_MISSING',
      'En sen återbetalning saknar en verifierbar Mollie-betalning. Källperioden måste stämmas av innan nästa utbetalning.',
    );
  }

  const paymentIds = input.orders.map((order) => String(order.molliePaymentId || '').trim());
  if (new Set(paymentIds).size !== paymentIds.length) {
    throw new PayoutSourceFeeError(
      'PAYOUT_SOURCE_MOLLIE_PAYMENT_ID_DUPLICATED',
      'Samma Mollie payment ID finns på flera order i en betald källperiod.',
    );
  }
  const refundedPaymentIds = input.orders
    .filter((order) =>
      Number(order.refundAmount || 0) > 0 || String(order.paymentStatus).toUpperCase() === 'REFUNDED')
    .map((order) => String(order.molliePaymentId || '').trim());
  const refundedIds = new Set(refundedPaymentIds);
  const report = await getMollieFinanceReport({
    from: input.source.periodStart,
    to: input.source.periodEnd,
    paymentIds,
    refundedPaymentIds,
    bypassCache: input.bypassCache,
    orderReferences: input.orders.map((order) => ({
      id: String(order.id),
      orderNumber: String(order.orderNumber || ''),
      refunded: refundedIds.has(String(order.molliePaymentId || '').trim()),
    })),
  });
  const fees = exactMollieFeeSnapshot({
    paymentIds,
    refundedPaymentIds,
    paymentFeeByPaymentId: report.paymentFeeByPaymentId,
    refundFeeByPaymentId: report.refundFeeByPaymentId,
  });
  if (!fees) {
    throw new PayoutSourceFeeError(
      'PAYOUT_SOURCE_MOLLIE_FEES_NOT_RECONCILED',
      'Den ursprungliga kortavgiften och den separata återbetalningsavgiften måste vara bokförda hos Mollie innan nästa utbetalning kan beräknas exakt.',
    );
  }
  return fees.totalFees;
}
