import { FINANCE_REAL_PAYMENT_STATUSES } from './payoutPolicy';

export type DirectSwishFinanceOrder = {
  paymentProvider?: string | null;
  paymentStatus?: string | null;
  swishPaymentId?: string | null;
};

export type DirectSwishFeeSnapshot = {
  status: 'available' | 'unavailable';
  policy: 'external' | 'fixed_per_payment' | null;
  paymentCount: number;
  feePerPaymentOre: number | null;
  totalFeesOre: number | null;
  error: string | null;
};

const isDirectSwish = (order: DirectSwishFinanceOrder) =>
  String(order.paymentProvider || '').trim().toLowerCase() === 'swish' &&
  (FINANCE_REAL_PAYMENT_STATUSES as readonly string[]).includes(
    String(order.paymentStatus || '').trim().toUpperCase(),
  );

/**
 * Direct Swish has no fee/reporting endpoint. The bank contract is therefore
 * the only authoritative source for settlement fees. We fail closed unless
 * finance explicitly selects one of two auditable policies:
 *
 * - external: ViaEats absorbs/accounts the bank cost outside restaurant payout
 *   and the exact order-level deduction is consequently zero.
 * - fixed_per_payment: SWISH_PAYOUT_FEE_ORE is the signed bank price for every
 *   completed incoming payment. A refunded payment still incurred that fee.
 *
 * Do not select fixed_per_payment if the bank contract has additional refund-
 * specific charges; keep the policy unset until those charges can be imported.
 */
export function directSwishFeeSnapshot(
  orders: readonly DirectSwishFinanceOrder[],
  env: NodeJS.ProcessEnv = process.env,
): DirectSwishFeeSnapshot {
  const swishOrders = orders.filter(isDirectSwish);
  if (swishOrders.length === 0) {
    return {
      status: 'available',
      policy: null,
      paymentCount: 0,
      feePerPaymentOre: 0,
      totalFeesOre: 0,
      error: null,
    };
  }

  if (String(env.SWISH_PAYOUTS_DISABLED || '').trim().toLowerCase() === 'true') {
    return {
      status: 'unavailable',
      policy: null,
      paymentCount: swishOrders.length,
      feePerPaymentOre: null,
      totalFeesOre: null,
      error: 'Restaurangutbetalningar med Swish är blockerade av SWISH_PAYOUTS_DISABLED.',
    };
  }

  const refs = swishOrders.map((order) => String(order.swishPaymentId || '').trim());
  if (refs.some((ref) => !ref) || new Set(refs).size !== refs.length) {
    return {
      status: 'unavailable',
      policy: null,
      paymentCount: swishOrders.length,
      feePerPaymentOre: null,
      totalFeesOre: null,
      error: 'Direkta Swish-betalningar saknar unika betalningsreferenser.',
    };
  }

  const policy = String(env.SWISH_PAYOUT_FEE_POLICY || '').trim().toLowerCase();
  if (policy === 'external') {
    return {
      status: 'available',
      policy: 'external',
      paymentCount: swishOrders.length,
      feePerPaymentOre: 0,
      totalFeesOre: 0,
      error: null,
    };
  }

  if (policy === 'fixed_per_payment') {
    const rawFee = String(env.SWISH_PAYOUT_FEE_ORE || '').trim();
    const feePerPaymentOre = Number(rawFee);
    if (!/^\d+$/.test(rawFee) || !Number.isSafeInteger(feePerPaymentOre)) {
      return {
        status: 'unavailable',
        policy: 'fixed_per_payment',
        paymentCount: swishOrders.length,
        feePerPaymentOre: null,
        totalFeesOre: null,
        error: 'SWISH_PAYOUT_FEE_ORE måste vara bankens exakta heltalsavgift i öre.',
      };
    }
    const totalFeesOre = feePerPaymentOre * swishOrders.length;
    if (!Number.isSafeInteger(totalFeesOre)) {
      return {
        status: 'unavailable',
        policy: 'fixed_per_payment',
        paymentCount: swishOrders.length,
        feePerPaymentOre,
        totalFeesOre: null,
        error: 'Swish-avgiften ryms inte i ett säkert heltal.',
      };
    }
    return {
      status: 'available',
      policy: 'fixed_per_payment',
      paymentCount: swishOrders.length,
      feePerPaymentOre,
      totalFeesOre,
      error: null,
    };
  }

  return {
    status: 'unavailable',
    policy: null,
    paymentCount: swishOrders.length,
    feePerPaymentOre: null,
    totalFeesOre: null,
    error: 'Sätt SWISH_PAYOUT_FEE_POLICY=external eller fixed_per_payment enligt bankavtalet.',
  };
}
