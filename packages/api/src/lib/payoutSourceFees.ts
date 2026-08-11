import { exactMollieFeeSnapshot, getMollieFinanceReport } from './mollieFinance';

export type PayoutSourceFeeOrder = {
  id: string;
  orderNumber: string;
  paymentStatus: string;
  paymentProvider: string | null;
  molliePaymentId: string | null;
  swishPaymentId?: string | null;
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
      | 'PAYOUT_SOURCE_MOLLIE_FEES_NOT_RECONCILED'
      | 'PAYOUT_SOURCE_PROVIDER_NOT_AUDITABLE'
      | 'PAYOUT_SOURCE_SWISH_PAYMENT_ID_MISSING'
      | 'PAYOUT_SOURCE_SWISH_PAYMENT_ID_DUPLICATED'
      | 'PAYOUT_SOURCE_MIXED_PROVIDER_FEES_FROZEN',
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
export async function resolveCurrentPayoutSourceFeeAmount(input: {
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

  const unsupported = input.orders.find((order) =>
    !['mollie', 'swish'].includes(String(order.paymentProvider || '').trim().toLowerCase()),
  );
  if (unsupported) {
    throw new PayoutSourceFeeError(
      'PAYOUT_SOURCE_PROVIDER_NOT_AUDITABLE',
      'En sen återbetalning tillhör en betalningsprovider som inte kan avgiftsrevideras.',
    );
  }

  const mollieOrders = input.orders.filter(
    (order) => String(order.paymentProvider || '').trim().toLowerCase() === 'mollie',
  );
  const swishOrders = input.orders.filter(
    (order) => String(order.paymentProvider || '').trim().toLowerCase() === 'swish',
  );
  const missingSwishPaymentId = swishOrders.find(
    (order) => !String(order.swishPaymentId || '').trim(),
  );
  if (missingSwishPaymentId) {
    throw new PayoutSourceFeeError(
      'PAYOUT_SOURCE_SWISH_PAYMENT_ID_MISSING',
      'En sen återbetalning saknar en verifierbar Swish-betalning.',
    );
  }
  const swishIds = swishOrders.map((order) => String(order.swishPaymentId || '').trim());
  if (new Set(swishIds).size !== swishIds.length) {
    throw new PayoutSourceFeeError(
      'PAYOUT_SOURCE_SWISH_PAYMENT_ID_DUPLICATED',
      'Samma Swish payment request ID finns på flera order i en betald källperiod.',
    );
  }
  if (swishOrders.length > 0) {
    if (mollieOrders.length === 0) {
      // Swish har inget fee-reporting API. Den avgift som godkändes och frös
      // när källperioden betalades ut är därför fortsatt sanningskällan; en
      // senare env-/prisändring får aldrig skriva om historisk settlement.
      return Math.max(0, Math.round(Number(input.source.mollieFeeAmount || 0)));
    }
    // Det äldre fältet lagrar bara en kombinerad PSP-summa och saknar provider-
    // split. Efter en sen refund kan vi därför inte säkert skilja fryst Swish-
    // avgift från Mollies nya refundavgift. Blockera tills en hållbar split finns.
    throw new PayoutSourceFeeError(
      'PAYOUT_SOURCE_MIXED_PROVIDER_FEES_FROZEN',
      'En betald källperiod med både Mollie och Swish saknar fryst providersplit och måste granskas manuellt efter en sen återbetalning.',
    );
  }

  const missingPaymentId = mollieOrders.find(
    (order) => !String(order.molliePaymentId || '').trim(),
  );
  if (missingPaymentId) {
    throw new PayoutSourceFeeError(
      'PAYOUT_SOURCE_MOLLIE_PAYMENT_ID_MISSING',
      'En sen återbetalning saknar en verifierbar Mollie-betalning. Källperioden måste stämmas av innan nästa utbetalning.',
    );
  }

  const paymentIds = mollieOrders.map((order) => String(order.molliePaymentId || '').trim());
  if (new Set(paymentIds).size !== paymentIds.length) {
    throw new PayoutSourceFeeError(
      'PAYOUT_SOURCE_MOLLIE_PAYMENT_ID_DUPLICATED',
      'Samma Mollie payment ID finns på flera order i en betald källperiod.',
    );
  }
  const refundedPaymentIds = mollieOrders
    .filter((order) =>
      Number(order.refundAmount || 0) > 0 || String(order.paymentStatus).toUpperCase() === 'REFUNDED')
    .map((order) => String(order.molliePaymentId || '').trim());
  const refundedIds = new Set(refundedPaymentIds);
  let mollieFees = 0;
  if (mollieOrders.length > 0) {
    const report = await getMollieFinanceReport({
      from: input.source.periodStart,
      to: input.source.periodEnd,
      paymentIds,
      refundedPaymentIds,
      bypassCache: input.bypassCache,
      orderReferences: mollieOrders.map((order) => ({
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
    mollieFees = fees.totalFees;
  }

  return mollieFees;
}

/** @deprecated Use the provider-neutral name. */
export const resolveCurrentPayoutSourceMollieFeeAmount = resolveCurrentPayoutSourceFeeAmount;
