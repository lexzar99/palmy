import {
  computePayout,
  financeOrderComponents,
  type EconomySettings,
  type OrderEcon,
  type PayoutBreakdown,
  type RestaurantEcon,
} from './financeCalc';
import type { Prisma } from '@prisma/client';

/**
 * A restaurant payout is earned only after the order has reached a successful
 * terminal state and the PSP-backed payment is known to be settled. Pending,
 * failed, cancelled, rejected, fully refunded and in-flight refund rows are
 * deliberately excluded (fail closed).
 */
export const PAYOUT_ORDER_STATUSES = ['DELIVERED', 'COMPLETED'] as const;
export const PAYOUT_PAYMENT_STATUSES = ['PAID', 'PARTIALLY_REFUNDED'] as const;
export const FINANCE_REAL_PAYMENT_STATUSES = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;
export const PAYOUT_NON_PAYABLE_FINAL_PAYMENT_STATUSES = ['FAILED', 'REFUNDED'] as const;
export const DEFAULT_PAYOUT_REFUND_WINDOW_HOURS = 72;
const MAX_PAYOUT_REFUND_WINDOW_HOURS = 24 * 30;

export const PAYOUT_TEST_DISCOUNT_CODES = ['test', 'testa', 'TEST', 'TESTA'] as const;
export const PAYOUT_TEST_PAYMENT_INTENT_ID = 'TEST_PAYMENT';
export const PAYOUT_TEST_CUSTOMER_NAME = 'AUTOTEST';
export const PAYOUT_PENDING_REFUND_PAYMENT_STATUSES = ['REFUNDING'] as const;
export const FINANCE_NON_ACCOUNTING_PAYMENT_STATUSES = ['REFUNDING', 'PENDING', 'NEEDS_REVIEW'] as const;

export const PAYOUT_TEST_ORDER_EXCLUSIONS: Prisma.OrderWhereInput[] = [
  { discountCode: { in: [...PAYOUT_TEST_DISCOUNT_CODES] } },
  { stripePaymentIntentId: PAYOUT_TEST_PAYMENT_INTENT_ID },
  { customerName: PAYOUT_TEST_CUSTOMER_NAME },
];

// Prisma/SQL `NOT field = value` filters out NULL rows too. Finance and
// payout queries need NULL payment references to remain visible/payable.
export const PAYOUT_NON_TEST_ORDER_FILTER: Prisma.OrderWhereInput = {
  AND: [
    { accountingExcluded: false },
    {
      OR: [
        { discountCode: null },
        { discountCode: { notIn: [...PAYOUT_TEST_DISCOUNT_CODES] } },
      ],
    },
    {
      OR: [
        { stripePaymentIntentId: null },
        { stripePaymentIntentId: { not: PAYOUT_TEST_PAYMENT_INTENT_ID } },
      ],
    },
    { customerName: { not: PAYOUT_TEST_CUSTOMER_NAME } },
  ],
};

// Finance display/economics only shows settled accounting rows. Payout
// approval still reads pending payment/refund rows separately as blockers.
export const FINANCE_ACCOUNTING_ORDER_FILTER: Prisma.OrderWhereInput = {
  ...PAYOUT_NON_TEST_ORDER_FILTER,
  paymentStatus: { notIn: [...FINANCE_NON_ACCOUNTING_PAYMENT_STATUSES] },
};

export type PayoutOrder = {
  status: string;
  paymentStatus: string;
  total: number;
  deliveryFee: number;
  tipAmount: number;
  discountAmount?: number | null;
  foodDiscountAmount?: number | null;
  deliveryDiscountAmount?: number | null;
  platformFundedFoodDiscountAmount?: number | null;
  platformFundedDeliveryDiscountAmount?: number | null;
  smallOrderFee?: number | null;
  foodVatPercent?: number | null;
  refundAmount?: number | null;
};

export type PayoutProviderAuditOrder = Pick<PayoutOrder, 'status' | 'paymentStatus'> & {
  id: string;
  orderNumber: string;
  paymentProvider: string | null;
  molliePaymentId: string | null;
  refundAmount?: number | null;
  updatedAt: Date | string;
};

export type PayoutFinanceAuditOrder = PayoutProviderAuditOrder &
  Pick<PayoutOrder, 'total'> &
  Partial<Pick<PayoutOrder,
    'deliveryFee' | 'tipAmount' | 'discountAmount' |
    'foodDiscountAmount' | 'deliveryDiscountAmount' |
    'platformFundedFoodDiscountAmount' | 'platformFundedDeliveryDiscountAmount' |
    'smallOrderFee'>>;

export class PayoutProviderAuditError extends Error {
  constructor(
    public readonly code: 'PAYOUT_PROVIDER_AUDIT_BLOCKED' | 'PAYOUT_PROVIDER_AUDIT_STALE',
    message: string,
  ) {
    super(message);
    this.name = 'PayoutProviderAuditError';
  }
}

export class PayoutProviderAuditBlockedError extends PayoutProviderAuditError {
  constructor(order: PayoutProviderAuditOrder) {
    const rawProvider = String(order.paymentProvider || '').trim();
    const provider = rawProvider.toLowerCase();
    const reason = !provider
      ? 'betalningsprovider saknas'
      : rawProvider === 'mollie' && !String(order.molliePaymentId || '').trim()
        ? 'Mollie-betalningsreferens saknas'
        : ['stripe', 'adyen'].includes(provider)
          ? `${provider} är en avstängd legacy-provider vid launch`
          : `betalningsprovider ${rawProvider} kan inte PSP-revideras`;
    super(
      'PAYOUT_PROVIDER_AUDIT_BLOCKED',
      `Utbetalningen är blockerad: order ${order.orderNumber || order.id} ` +
      `är utbetalningsbar men ${reason}. Verifiera ordern manuellt och håll perioden pausad.`,
    );
    this.name = 'PayoutProviderAuditBlockedError';
  }
}

export class PayoutProviderAuditStaleError extends PayoutProviderAuditError {
  constructor(context: string) {
    super(
      'PAYOUT_PROVIDER_AUDIT_STALE',
      `Utbetalningsunderlaget för ${context} ändrades efter PSP-revisionen. ` +
      'Ingen utbetalning har sparats; kör revisionen igen.',
    );
    this.name = 'PayoutProviderAuditStaleError';
  }
}

/**
 * Stable proof of exactly which payable orders/payment references were PSP-
 * audited. Callers already exclude test rows before building the proof.
 */
export function buildPayoutProviderAuditFingerprint(
  orders: readonly PayoutProviderAuditOrder[],
): string[] {
  return orders
    .filter(isPayoutEligibleOrder)
    .map((order) => {
      if (
        order.paymentProvider !== 'mollie' ||
        !String(order.molliePaymentId || '').trim()
      ) {
        throw new PayoutProviderAuditBlockedError(order);
      }
      const updatedAt = new Date(order.updatedAt);
      if (!Number.isFinite(updatedAt.getTime())) {
        throw new PayoutProviderAuditStaleError(`order ${order.orderNumber || order.id}`);
      }
      return [
        order.id,
        order.paymentProvider,
        order.molliePaymentId,
        String(order.status || '').toUpperCase(),
        String(order.paymentStatus || '').toUpperCase(),
        String(order.refundAmount ?? 0),
        updatedAt.toISOString(),
      ].join('\u0000');
    })
    .sort();
}

export function assertPayoutProviderAuditFingerprint(
  current: readonly PayoutProviderAuditOrder[],
  auditedFingerprint: readonly string[],
  context: string,
): void {
  const currentFingerprint = buildPayoutProviderAuditFingerprint(current);
  if (
    currentFingerprint.length !== auditedFingerprint.length ||
    currentFingerprint.some((value, index) => value !== auditedFingerprint[index])
  ) {
    throw new PayoutProviderAuditStaleError(context);
  }
}

/** Stable proof for all settled payment rows, including fully refunded rows. */
export function buildPayoutFinanceFingerprint(
  orders: readonly PayoutFinanceAuditOrder[],
): string {
  return JSON.stringify(
    [...orders]
      .filter(isFinanceRealPaymentOrder)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .map((order) => ({
        id: order.id,
        status: String(order.status || '').toUpperCase(),
        paymentStatus: String(order.paymentStatus || '').toUpperCase(),
        paymentProvider: String(order.paymentProvider || '').toLowerCase(),
        molliePaymentId: String(order.molliePaymentId || ''),
        total: nonNegativeOre(order.total),
        deliveryFee: nonNegativeOre(order.deliveryFee),
        tipAmount: nonNegativeOre(order.tipAmount),
        discountAmount: nonNegativeOre(order.discountAmount),
        foodDiscountAmount: nonNegativeOre(order.foodDiscountAmount),
        deliveryDiscountAmount: nonNegativeOre(order.deliveryDiscountAmount),
        platformFundedFoodDiscountAmount: nonNegativeOre(order.platformFundedFoodDiscountAmount),
        platformFundedDeliveryDiscountAmount: nonNegativeOre(order.platformFundedDeliveryDiscountAmount),
        smallOrderFee: nonNegativeOre(order.smallOrderFee),
        refundAmount: effectiveRefundAmountOre(order),
        updatedAt: order.updatedAt instanceof Date
          ? order.updatedAt.toISOString()
          : String(order.updatedAt || ''),
      })),
  );
}

export type NetPayoutOrder = OrderEcon & {
  originalTotal: number;
  refundAmount: number;
};

export function payoutRefundWindowHours(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = String(env.PAYOUT_REFUND_WINDOW_HOURS || '').trim();
  if (!raw) return DEFAULT_PAYOUT_REFUND_WINDOW_HOURS;
  const hours = Number(raw);
  if (!Number.isInteger(hours) || hours < 1 || hours > MAX_PAYOUT_REFUND_WINDOW_HOURS) {
    throw new Error(
      `PAYOUT_REFUND_WINDOW_HOURS måste vara ett heltal mellan 1 och ${MAX_PAYOUT_REFUND_WINDOW_HOURS}`,
    );
  }
  return hours;
}

export function payoutRefundWindowClosesAt(
  periodEnd: Date,
  hours = payoutRefundWindowHours(),
): Date {
  const closesAt = new Date(periodEnd.getTime() + hours * 60 * 60 * 1000);
  if (!Number.isFinite(closesAt.getTime())) {
    throw new Error('Ogiltigt periodslut för payout-refundfönster');
  }
  return closesAt;
}

export function isPayoutRefundWindowClosed(
  periodEnd: Date,
  now = new Date(),
  hours = payoutRefundWindowHours(),
): boolean {
  return now.getTime() >= payoutRefundWindowClosesAt(periodEnd, hours).getTime();
}

/**
 * Per-order safety window. `updatedAt` is intentionally conservative: the
 * terminal status transition sets it, and any later refund/economic change
 * restarts the clock instead of allowing a scheduled order through early.
 */
export function isPayoutOrderRefundWindowClosed(
  order: { status: string; updatedAt: Date | string },
  now = new Date(),
  hours = payoutRefundWindowHours(),
): boolean {
  if (!(PAYOUT_ORDER_STATUSES as readonly string[]).includes(String(order.status || '').toUpperCase())) {
    return false;
  }
  const changedAt = new Date(order.updatedAt);
  if (!Number.isFinite(changedAt.getTime())) return false;
  return now.getTime() >= changedAt.getTime() + hours * 60 * 60 * 1000;
}

/**
 * The person who approves the immutable snapshot must not be the person who
 * marks it paid. Email comparison keeps older rows (which stored email rather
 * than admin id) fail-safe during the transition.
 */
export function canAdminMarkPayoutPaid(
  approvedBy: string | null | undefined,
  currentAdminId: string | null | undefined,
  currentAdminEmail?: string | null,
): boolean {
  const approver = String(approvedBy || '').trim().toLowerCase();
  const adminId = String(currentAdminId || '').trim().toLowerCase();
  const adminEmail = String(currentAdminEmail || '').trim().toLowerCase();
  if (!approver || !adminId) return false;
  return approver !== adminId && (!adminEmail || approver !== adminEmail);
}

export function isPayoutEligibleOrder(
  order: Pick<PayoutOrder, 'status' | 'paymentStatus'>,
): boolean {
  return (
    (PAYOUT_ORDER_STATUSES as readonly string[]).includes(String(order.status || '').toUpperCase()) &&
    (PAYOUT_PAYMENT_STATUSES as readonly string[]).includes(String(order.paymentStatus || '').toUpperCase())
  );
}

/**
 * The cash report follows the PSP-backed payment rather than fulfilment.
 * A paid order remains real gross turnover even when it is later canceled and
 * refunded; the refund is then deducted separately. Fulfilment still controls
 * restaurant payout eligibility through `isPayoutEligibleOrder`.
 */
export function isFinanceRealPaymentOrder(
  order: Pick<PayoutOrder, 'status' | 'paymentStatus'>,
): boolean {
  return (FINANCE_REAL_PAYMENT_STATUSES as readonly string[]).includes(
    String(order.paymentStatus || '').toUpperCase(),
  );
}

/**
 * REFUNDED is authoritative even for legacy rows whose cumulative amount was
 * left at zero (or below the full total). Partial refunds keep the clamped PSP
 * amount. This one rule is shared by fingerprints and saved finance snapshots.
 */
export function effectiveRefundAmountOre(
  order: Pick<PayoutOrder, 'total' | 'refundAmount' | 'paymentStatus'>,
): number {
  const total = nonNegativeOre(order.total);
  if (String(order.paymentStatus || '').toUpperCase() === 'REFUNDED') return total;
  return Math.min(total, nonNegativeOre(order.refundAmount));
}

/**
 * A period must not be approved while money or fulfilment can still change.
 * FAILED and fully REFUNDED rows are final without a payout; every other
 * non-eligible combination remains a settlement blocker.
 */
export function isPayoutSettlementBlockingOrder(
  order: Pick<PayoutOrder, 'status' | 'paymentStatus'> &
    Partial<Pick<PayoutOrder, 'total' | 'refundAmount'>>,
): boolean {
  if (isPayoutEligibleOrder(order)) {
    if (String(order.paymentStatus || '').toUpperCase() !== 'PARTIALLY_REFUNDED') return false;
    const total = Number(order.total);
    const refundAmount = Number(order.refundAmount);
    return !Number.isFinite(total) || !Number.isFinite(refundAmount) ||
      total <= 0 || refundAmount <= 0 || refundAmount >= total;
  }
  return !(PAYOUT_NON_PAYABLE_FINAL_PAYMENT_STATUSES as readonly string[])
    .includes(String(order.paymentStatus || '').toUpperCase());
}

const nonNegativeOre = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

/**
 * Convert the immutable monetary snapshots on an Order into the amount that
 * is still paid after the PSP's cumulative refund amount.
 *
 * Refunds currently have no per-line allocation snapshot. The conservative
 * settlement rule is therefore FOOD-FIRST: restaurant food bears the refund
 * before customer-paid delivery and tip are reduced. ViaEats-funded discounts
 * remain frozen support on a partial customer refund; a full refund excludes
 * the complete order.
 */
export function netPayoutOrder(order: PayoutOrder): NetPayoutOrder | null {
  if (!isPayoutEligibleOrder(order)) return null;

  const originalTotal = nonNegativeOre(order.total);
  if (originalTotal <= 0) return null;

  const refundAmount = effectiveRefundAmountOre(order);
  if (String(order.paymentStatus).toUpperCase() === 'PARTIALLY_REFUNDED' && refundAmount <= 0) {
    return null;
  }
  const netTotal = originalTotal - refundAmount;

  // A row marked PARTIALLY_REFUNDED but refunded down to zero is inconsistent;
  // fail closed rather than accidentally paying the restaurant.
  if (netTotal <= 0) return null;

  const originalComponents = financeOrderComponents(order);
  const originalNetDelivery = Math.min(originalTotal, originalComponents.netDeliveryFee);
  const originalTip = Math.min(
    originalTotal - originalNetDelivery,
    originalComponents.tipAmount,
  );
  const originalCustomerFood = originalTotal - originalNetDelivery - originalTip;

  let refundRemaining = refundAmount;
  const foodRefund = Math.min(originalCustomerFood, refundRemaining);
  refundRemaining -= foodRefund;
  const deliveryRefund = Math.min(originalNetDelivery, refundRemaining);
  refundRemaining -= deliveryRefund;
  const tipRefund = Math.min(originalTip, refundRemaining);
  refundRemaining -= tipRefund;
  if (refundRemaining !== 0) return null;

  const remainingCustomerFood = originalCustomerFood - foodRefund;
  const remainingNetDelivery = originalNetDelivery - deliveryRefund;
  const tipAmount = originalTip - tipRefund;
  const originalSmallOrderFee = Math.min(originalCustomerFood, originalComponents.smallOrderFee);
  const smallOrderFee = Math.min(originalSmallOrderFee, remainingCustomerFood);
  const deliveryDiscountAmount = originalComponents.deliveryDiscountAmount;
  const deliveryFee = remainingNetDelivery + deliveryDiscountAmount;

  const net: NetPayoutOrder = {
    total: netTotal,
    deliveryFee,
    tipAmount,
    discountAmount: originalComponents.discountAmount,
    foodDiscountAmount: originalComponents.foodDiscountAmount,
    deliveryDiscountAmount,
    platformFundedFoodDiscountAmount: originalComponents.platformFundedFoodDiscountAmount,
    platformFundedDeliveryDiscountAmount: originalComponents.platformFundedDeliveryDiscountAmount,
    smallOrderFee,
    originalTotal,
    refundAmount,
  };
  if (order.foodVatPercent != null) {
    net.foodVatPercent = order.foodVatPercent;
  }
  return net;
}

export function payoutOrders(orders: PayoutOrder[]): NetPayoutOrder[] {
  return orders.flatMap((order) => {
    const net = netPayoutOrder(order);
    return net ? [net] : [];
  });
}

export type PayoutMoneySnapshot = {
  grossSales: number;
  orderCount: number;
  commissionAmount: number;
  subscriptionAmount: number;
  manualAdjustmentAmount: number;
  lateRefundAdjustmentAmount: number;
  payoutAmount: number;
  mollieFeeAmount: number;
  foodVatAmount?: number | null;
  platformTipAmount?: number | null;
};

export type PayoutEconomicSnapshot = {
  commissionPctSnapshot: number | null | undefined;
  feeVatPctSnapshot: number | null | undefined;
  foodVatPctSnapshot?: number | null | undefined;
  selfDeliverySnapshot: boolean | null | undefined;
  subscriptionAmount: number;
  manualAdjustmentAmount: number;
  lateRefundAdjustmentAmount: number;
  mollieFeeAmount?: number | null | undefined;
};

export type SettlementAmounts = {
  payoutAmount: number;
  owedAmount: number;
};

/**
 * Apply fees and signed adjustments to one restaurant's settlement position.
 * Positive manual adjustments charge the restaurant; negative adjustments
 * credit it. The result is always represented on exactly one side.
 */
export function applySettlementAdjustments({
  payoutAmount,
  owedAmount,
  mollieFeeAmount = 0,
  manualAdjustmentAmount = 0,
  lateRefundAdjustmentAmount = 0,
}: {
  payoutAmount: number;
  owedAmount: number;
  mollieFeeAmount?: number;
  manualAdjustmentAmount?: number;
  lateRefundAdjustmentAmount?: number;
}): SettlementAmounts {
  const position =
    Math.max(0, Math.round(Number(payoutAmount) || 0)) -
    Math.max(0, Math.round(Number(owedAmount) || 0)) -
    Math.max(0, Math.round(Number(mollieFeeAmount) || 0)) -
    (Number.isFinite(manualAdjustmentAmount) ? Math.round(manualAdjustmentAmount) : 0) -
    Math.max(0, Math.round(Number(lateRefundAdjustmentAmount) || 0));

  return position >= 0
    ? { payoutAmount: position, owedAmount: 0 }
    : { payoutAmount: 0, owedAmount: -position };
}

export type RecoveryPlanSource = {
  sourcePayoutId: string;
  requiredRecoveryAmount: number;
  appliedAmount: number;
  reservedElsewhereAmount: number;
};

export type RecoveryPlanAllocation = {
  sourcePayoutId: string;
  amount: number;
};

/**
 * Alla övergångar är tillåtna i båda riktningarna. Det finns inget
 * ångerfönster, ingen tidslåsning och inget läge som fryser beloppet —
 * underlaget får ändras även efter att posten markerats som betald, och en
 * felaktig status ska gå att rulla tillbaka utan att skapa en ny post.
 *
 * Spärren ligger i stället på behörighet: bara superadmin når rutten alls, och
 * varje ändring skriver en revision som aldrig raderas. En avvikelse är
 * information, inte en blockerare.
 */
const PAYOUT_RECORD_STATUSES = ['DRAFT', 'HOLD', 'APPROVED', 'PAID'] as const;

const PAYOUT_RECORD_TRANSITIONS: Record<string, readonly string[]> = {
  NEW: PAYOUT_RECORD_STATUSES,
  DRAFT: PAYOUT_RECORD_STATUSES,
  HOLD: PAYOUT_RECORD_STATUSES,
  APPROVED: PAYOUT_RECORD_STATUSES,
  PAID: PAYOUT_RECORD_STATUSES,
};

export function canTransitionPayout(current: string | null | undefined, next: string): boolean {
  const from = String(current || 'NEW').toUpperCase();
  return (PAYOUT_RECORD_TRANSITIONS[from] || []).includes(String(next || '').toUpperCase());
}

export function samePayoutMoneySnapshot(
  left: PayoutMoneySnapshot,
  right: PayoutMoneySnapshot,
): boolean {
  return left.grossSales === right.grossSales &&
    left.orderCount === right.orderCount &&
    left.commissionAmount === right.commissionAmount &&
    left.subscriptionAmount === right.subscriptionAmount &&
    left.manualAdjustmentAmount === right.manualAdjustmentAmount &&
    left.lateRefundAdjustmentAmount === right.lateRefundAdjustmentAmount &&
    left.payoutAmount === right.payoutAmount &&
    left.mollieFeeAmount === right.mollieFeeAmount &&
    (left.foodVatAmount == null || right.foodVatAmount == null || left.foodVatAmount === right.foodVatAmount) &&
    (left.platformTipAmount == null || right.platformTipAmount == null || left.platformTipAmount === right.platformTipAmount);
}

/** Build every persisted monetary field from server-owned order snapshots. */
export function buildPayoutMoneySnapshot(
  orders: PayoutOrder[],
  restaurant: RestaurantEcon,
  economy: EconomySettings,
  manualAdjustmentAmount: number,
  lateRefundAdjustmentAmount = 0,
  mollieFeeAmount = 0,
): {
  breakdown: PayoutBreakdown;
  snapshot: PayoutMoneySnapshot;
  economicSnapshot: Required<Pick<PayoutEconomicSnapshot,
    'commissionPctSnapshot' | 'feeVatPctSnapshot' | 'foodVatPctSnapshot' | 'selfDeliverySnapshot' | 'mollieFeeAmount'>>;
} {
  const breakdown = computePayout(payoutOrders(orders), restaurant, economy);
  const manualAdjustmentOre = Number.isFinite(manualAdjustmentAmount)
    ? Math.round(manualAdjustmentAmount)
    : 0;
  const lateRefundAdjustmentOre = Number.isFinite(lateRefundAdjustmentAmount)
    ? Math.max(0, Math.round(lateRefundAdjustmentAmount))
    : 0;
  const mollieFeeOre = Math.max(0, Math.round(Number(mollieFeeAmount) || 0));
  const settlement = applySettlementAdjustments({
    payoutAmount: breakdown.payoutOre,
    owedAmount: breakdown.owedOre,
    mollieFeeAmount: mollieFeeOre,
    manualAdjustmentAmount: manualAdjustmentOre,
    lateRefundAdjustmentAmount: lateRefundAdjustmentOre,
  });
  return {
    breakdown,
    snapshot: {
      grossSales: breakdown.restaurantGrossOre,
      orderCount: breakdown.orderCount,
      commissionAmount: breakdown.commissionOre,
      subscriptionAmount: breakdown.subscriptionOre,
      manualAdjustmentAmount: manualAdjustmentOre,
      lateRefundAdjustmentAmount: lateRefundAdjustmentOre,
      payoutAmount: settlement.payoutAmount,
      mollieFeeAmount: mollieFeeOre,
      foodVatAmount: breakdown.foodVatOre,
      platformTipAmount: breakdown.platformTipOre,
    },
    economicSnapshot: {
      commissionPctSnapshot: breakdown.commissionPct,
      feeVatPctSnapshot: breakdown.feeVatPct,
      foodVatPctSnapshot: breakdown.foodVatPct,
      selfDeliverySnapshot: restaurant.selfDelivery,
      mollieFeeAmount: mollieFeeOre,
    },
  };
}

export function hasCompletePayoutEconomicSnapshot(
  snapshot: PayoutEconomicSnapshot,
): boolean {
  return Number.isFinite(snapshot.commissionPctSnapshot) &&
    Number(snapshot.commissionPctSnapshot) >= 0 &&
    Number.isFinite(snapshot.feeVatPctSnapshot) &&
    Number(snapshot.feeVatPctSnapshot) >= 0 &&
    typeof snapshot.selfDeliverySnapshot === 'boolean';
}

/**
 * Recompute a paid period with its frozen commercial terms and the orders'
 * current cumulative refund amounts. This deliberately does not read today's
 * restaurant/settings rows: changing a commission rate must never rewrite a
 * settlement that has already been paid.
 */
export function recomputePayoutSettlementFromEconomicSnapshot(
  orders: PayoutOrder[],
  source: PayoutEconomicSnapshot,
): { snapshot: PayoutMoneySnapshot; owedAmount: number } {
  if (!hasCompletePayoutEconomicSnapshot(source)) {
    throw new Error('PAYOUT_ECONOMIC_SNAPSHOT_MISSING');
  }

  const eligible = payoutOrders(orders);
  const components = eligible.map(financeOrderComponents);
  const grossTotal = eligible.reduce((sum, order) => sum + order.total, 0);
  const deliveryFeeTotal = components.reduce((sum, row) => sum + row.netDeliveryFee, 0);
  const tipTotal = components.reduce((sum, row) => sum + row.tipAmount, 0);
  const customerFoodBase = components.reduce(
    (sum, row) => sum + Math.max(0, row.total - row.netDeliveryFee - row.tipAmount),
    0,
  );
  const platformFundedFoodDiscountTotal = components.reduce(
    (sum, row) => sum + row.platformFundedFoodDiscountAmount,
    0,
  );
  const platformFundedDeliveryDiscountTotal = components.reduce(
    (sum, row) => sum + row.platformFundedDeliveryDiscountAmount,
    0,
  );
  const foodBase = customerFoodBase + platformFundedFoodDiscountTotal;
  const foodVatRates = eligible.map((order) => order.foodVatPercent ?? source.foodVatPctSnapshot ?? 0);
  const foodVatAmount = eligible.reduce((sum, order, index) => {
    const component = components[index];
    const orderFoodBase = Math.max(
      0,
      component.total - component.netDeliveryFee - component.tipAmount,
    ) + component.platformFundedFoodDiscountAmount;
    const rate = Math.max(0, Number(foodVatRates[index] ?? 0));
    const v = rate / 100;
    return sum + (v > 0 ? Math.round(orderFoodBase - orderFoodBase / (1 + v)) : 0);
  }, 0);
  const commissionAmount = Math.round(
    (foodBase * Number(source.commissionPctSnapshot)) / 100,
  );
  const subscriptionAmount = nonNegativeOre(source.subscriptionAmount);
  const feeVatAmount = Math.round(
    ((commissionAmount + subscriptionAmount) * Number(source.feeVatPctSnapshot)) / 100,
  );
  const grossSales = source.selfDeliverySnapshot
    ? grossTotal + platformFundedFoodDiscountTotal + platformFundedDeliveryDiscountTotal
    : foodBase;
  const mollieFeeAmount = nonNegativeOre(source.mollieFeeAmount);
  const commercialPosition = grossSales - commissionAmount - subscriptionAmount - feeVatAmount;
  const manualAdjustmentAmount = Number.isFinite(source.manualAdjustmentAmount)
    ? Math.round(source.manualAdjustmentAmount)
    : 0;
  const lateRefundAdjustmentAmount = nonNegativeOre(source.lateRefundAdjustmentAmount);

  const settlement = applySettlementAdjustments({
    payoutAmount: Math.max(0, commercialPosition),
    owedAmount: Math.max(0, -commercialPosition),
    mollieFeeAmount,
    manualAdjustmentAmount,
    lateRefundAdjustmentAmount,
  });

  return {
    snapshot: {
      grossSales,
      orderCount: eligible.length,
      commissionAmount,
      subscriptionAmount,
      manualAdjustmentAmount,
      lateRefundAdjustmentAmount,
      mollieFeeAmount,
      foodVatAmount,
      platformTipAmount: source.selfDeliverySnapshot ? 0 : tipTotal,
      payoutAmount: settlement.payoutAmount,
    },
    owedAmount: settlement.owedAmount,
  };
}

export function recomputePayoutFromEconomicSnapshot(
  orders: PayoutOrder[],
  source: PayoutEconomicSnapshot,
): PayoutMoneySnapshot {
  return recomputePayoutSettlementFromEconomicSnapshot(orders, source).snapshot;
}

/** Allocate oldest outstanding recoveries first and retain any remainder. */
export function buildLateRefundRecoveryPlan(
  sources: readonly RecoveryPlanSource[],
  targetCapacityAmount: number,
): { allocations: RecoveryPlanAllocation[]; totalAmount: number; remainingAmount: number } {
  let capacity = Math.max(0, Math.round(Number(targetCapacityAmount) || 0));
  let totalOutstanding = 0;
  const allocations: RecoveryPlanAllocation[] = [];

  for (const source of sources) {
    const outstanding = Math.max(
      0,
      Math.round(Number(source.requiredRecoveryAmount) || 0) -
        Math.max(0, Math.round(Number(source.appliedAmount) || 0)) -
        Math.max(0, Math.round(Number(source.reservedElsewhereAmount) || 0)),
    );
    totalOutstanding += outstanding;
    if (outstanding <= 0 || capacity <= 0) continue;
    const amount = Math.min(outstanding, capacity);
    allocations.push({ sourcePayoutId: source.sourcePayoutId, amount });
    capacity -= amount;
  }

  const totalAmount = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  return {
    allocations,
    totalAmount,
    remainingAmount: Math.max(0, totalOutstanding - totalAmount),
  };
}

/** Never recover more than the source payout actually transferred. */
export function requiredLateRefundRecoveryAmount(
  sourcePaidAmount: number,
  recomputedSourceAmount: number,
): number {
  const paid = Math.max(0, Math.round(Number(sourcePaidAmount) || 0));
  const recomputed = Math.max(0, Math.round(Number(recomputedSourceAmount) || 0));
  return Math.min(paid, Math.max(0, paid - recomputed));
}

/**
 * Recovery must retain the negative side of the recalculated settlement.
 * Otherwise a full late refund stops at the old payout and silently drops the
 * original payment fee and the newly booked refund processing fee.
 */
export function requiredLateRefundRecoverySettlementAmount(
  sourcePaidAmount: number,
  recomputedSourceAmount: number,
  recomputedOwedAmount: number,
): number {
  return requiredLateRefundRecoveryAmount(sourcePaidAmount, recomputedSourceAmount) +
    Math.max(0, Math.round(Number(recomputedOwedAmount) || 0));
}

export function sameRecoveryAllocations(
  left: readonly RecoveryPlanAllocation[],
  right: readonly RecoveryPlanAllocation[],
): boolean {
  const normalize = (entries: readonly RecoveryPlanAllocation[]) => [...entries]
    .map((entry) => ({ sourcePayoutId: entry.sourcePayoutId, amount: Math.round(entry.amount) }))
    .sort((a, b) => a.sourcePayoutId.localeCompare(b.sourcePayoutId));
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}
