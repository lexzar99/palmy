import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computePayout, DEFAULT_ECONOMY, hasCommissionOverride } from '../lib/financeCalc';
import {
  applySettlementAdjustments,
  buildPayoutMoneySnapshot,
  buildPayoutFinanceFingerprint,
  buildLateRefundRecoveryPlan,
  assertPayoutProviderAuditFingerprint,
  buildPayoutProviderAuditFingerprint,
  canAdminMarkPayoutPaid,
  canTransitionPayout,
  isPayoutRefundWindowClosed,
  isPayoutOrderRefundWindowClosed,
  isFinanceRealPaymentOrder,
  isPayoutEligibleOrder,
  isPayoutSettlementBlockingOrder,
  effectiveRefundAmountOre,
  netPayoutOrder,
  payoutOrders,
  payoutRefundWindowClosesAt,
  payoutRefundWindowHours,
  FINANCE_ACCOUNTING_ORDER_FILTER,
  PAYOUT_NON_TEST_ORDER_FILTER,
  PAYOUT_PENDING_REFUND_PAYMENT_STATUSES,
  FINANCE_NON_ACCOUNTING_PAYMENT_STATUSES,
  PAYOUT_TEST_CUSTOMER_NAME,
  PAYOUT_TEST_DISCOUNT_CODES,
  PAYOUT_TEST_PAYMENT_INTENT_ID,
  PayoutProviderAuditBlockedError,
  PayoutProviderAuditStaleError,
  recomputePayoutFromEconomicSnapshot,
  recomputePayoutSettlementFromEconomicSnapshot,
  requiredLateRefundRecoveryAmount,
  requiredLateRefundRecoverySettlementAmount,
  sameRecoveryAllocations,
  samePayoutMoneySnapshot,
  type PayoutOrder,
} from '../lib/payoutPolicy';
import {
  calculateLateRefundRecoveryPlan,
  PayoutRecoveryError,
} from '../lib/payoutRecovery';
import {
  activeFinanceSummarySnapshot,
  reconcileRestaurantFundingOre,
  selectFinanceSummaryEconomicValues,
  sumFinanceSummaryRows,
} from '../lib/financeSummary';
import {
  allocateExactFeeTotal,
  exactMollieFeeSnapshot,
  estimateMollieFeeFromObservations,
  estimateMollieFeeFromSwedishPricing,
  estimateNextMolliePayoutDate,
  mollieFeeBreakdownFromTransactions,
  mollieFeesFromTransactionsInPeriod,
  mollieBalanceReportUntil,
  mollieRefundFeeForDisplay,
  molliePaymentOrderReference,
  molliePaymentFeesFromTransactions,
  molliePaymentsFromTransactionsInPeriod,
  mollieRefundsFromTransactionsInPeriod,
  mollieUnlinkedPaymentsFromTransactionsInPeriod,
  mollieUnlinkedRefundsFromTransactionsInPeriod,
} from '../lib/mollieFinance';
import { reconcileFinanceOrders } from '../lib/financeReconciliation';
import {
  isFinanceCalendarMonthPeriod,
  resolveFinancePeriod,
  subscriptionAppliesToFinancePeriod,
} from '../lib/financePeriod';

const paidDelivered = {
  status: 'DELIVERED',
  paymentStatus: 'PAID',
  total: 10_000,
  deliveryFee: 1_000,
  tipAmount: 500,
  refundAmount: null,
} satisfies PayoutOrder;

assert.deepEqual(PAYOUT_NON_TEST_ORDER_FILTER, {
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
});
assert.deepEqual(FINANCE_ACCOUNTING_ORDER_FILTER, {
  ...PAYOUT_NON_TEST_ORDER_FILTER,
  paymentStatus: { notIn: [...FINANCE_NON_ACCOUNTING_PAYMENT_STATUSES] },
});
assert.deepEqual(FINANCE_NON_ACCOUNTING_PAYMENT_STATUSES, [
  ...PAYOUT_PENDING_REFUND_PAYMENT_STATUSES,
  'PENDING',
  'NEEDS_REVIEW',
]);

assert.equal(isPayoutEligibleOrder(paidDelivered), true);
assert.equal(isPayoutEligibleOrder({ ...paidDelivered, status: 'COMPLETED' }), true);
assert.equal(isPayoutEligibleOrder({ ...paidDelivered, status: 'PREPARING' }), false);
assert.equal(isPayoutEligibleOrder({ ...paidDelivered, status: 'CANCELLED' }), false);
assert.equal(isPayoutEligibleOrder({ ...paidDelivered, status: 'REJECTED' }), false);
assert.equal(isPayoutEligibleOrder({ ...paidDelivered, paymentStatus: 'PENDING' }), false);
assert.equal(isPayoutEligibleOrder({ ...paidDelivered, paymentStatus: 'FAILED' }), false);
assert.equal(isPayoutEligibleOrder({ ...paidDelivered, paymentStatus: 'REFUNDING' }), false);
assert.equal(isPayoutEligibleOrder({ ...paidDelivered, paymentStatus: 'REFUNDED' }), false);
assert.equal(isPayoutEligibleOrder({ ...paidDelivered, paymentStatus: 'PARTIALLY_REFUNDED' }), true);
assert.equal(isFinanceRealPaymentOrder(paidDelivered), true);
assert.equal(isFinanceRealPaymentOrder({ ...paidDelivered, paymentStatus: 'PARTIALLY_REFUNDED' }), true);
assert.equal(isFinanceRealPaymentOrder({ ...paidDelivered, paymentStatus: 'REFUNDED' }), true);
assert.equal(isFinanceRealPaymentOrder({ ...paidDelivered, paymentStatus: 'PENDING' }), false);
assert.equal(isFinanceRealPaymentOrder({ ...paidDelivered, paymentStatus: 'FAILED' }), false);
assert.equal(isFinanceRealPaymentOrder({ ...paidDelivered, paymentStatus: 'REFUNDING' }), false);
assert.equal(isFinanceRealPaymentOrder({ ...paidDelivered, status: 'AWAITING_PAYMENT' }), true);
assert.equal(
  isFinanceRealPaymentOrder({ ...paidDelivered, status: 'CANCELLED', paymentStatus: 'REFUNDED' }),
  true,
);
assert.equal(isPayoutSettlementBlockingOrder(paidDelivered), false);
assert.equal(isPayoutSettlementBlockingOrder({ ...paidDelivered, status: 'PREPARING' }), true);
assert.equal(isPayoutSettlementBlockingOrder({ ...paidDelivered, paymentStatus: 'PENDING' }), true);
assert.equal(isPayoutSettlementBlockingOrder({ ...paidDelivered, paymentStatus: 'REFUNDING' }), true);
assert.equal(isPayoutSettlementBlockingOrder({ ...paidDelivered, paymentStatus: 'NEEDS_REVIEW' }), true);
assert.equal(isPayoutSettlementBlockingOrder({ ...paidDelivered, paymentStatus: 'FAILED' }), false);
assert.equal(isPayoutSettlementBlockingOrder({ ...paidDelivered, paymentStatus: 'REFUNDED' }), false);
assert.equal(isPayoutSettlementBlockingOrder({ ...paidDelivered, paymentStatus: 'PARTIALLY_REFUNDED', refundAmount: 2_000 }), false);
assert.equal(isPayoutSettlementBlockingOrder({ ...paidDelivered, paymentStatus: 'PARTIALLY_REFUNDED', refundAmount: null }), true);
assert.equal(isPayoutSettlementBlockingOrder({ ...paidDelivered, paymentStatus: 'PARTIALLY_REFUNDED', refundAmount: 10_000 }), true);

const partial = netPayoutOrder({
  ...paidDelivered,
  paymentStatus: 'PARTIALLY_REFUNDED',
  refundAmount: 2_000,
});
assert.deepEqual(partial, {
  originalTotal: 10_000,
  refundAmount: 2_000,
  total: 8_000,
  deliveryFee: 1_000,
  tipAmount: 500,
  discountAmount: 0,
  foodDiscountAmount: 0,
  deliveryDiscountAmount: 0,
  platformFundedFoodDiscountAmount: 0,
  platformFundedDeliveryDiscountAmount: 0,
  smallOrderFee: 0,
});

const foodFirstRefund = netPayoutOrder({
  ...paidDelivered,
  total: 12_000,
  deliveryFee: 2_000,
  tipAmount: 0,
  paymentStatus: 'PARTIALLY_REFUNDED',
  refundAmount: 2_000,
});
assert.equal(foodFirstRefund?.total, 10_000);
assert.equal(foodFirstRefund?.deliveryFee, 2_000);
assert.equal(foodFirstRefund?.tipAmount, 0);
const foodFirstBreakdown = computePayout(
  [foodFirstRefund!],
  { selfDelivery: false, commissionPctOverride: 20, featuredClass: 3 },
  DEFAULT_ECONOMY,
);
assert.equal(foodFirstBreakdown.foodBase, 8_000);
assert.equal(foodFirstBreakdown.deliveryFeeTotal, 2_000);

// A corrupt "partial" row refunded down to zero must fail closed.
assert.equal(netPayoutOrder({ ...paidDelivered, paymentStatus: 'PARTIALLY_REFUNDED', refundAmount: 10_000 }), null);
assert.equal(netPayoutOrder({ ...paidDelivered, paymentStatus: 'PARTIALLY_REFUNDED', refundAmount: 50_000 }), null);
assert.equal(netPayoutOrder({ ...paidDelivered, paymentStatus: 'PARTIALLY_REFUNDED', refundAmount: null }), null);
assert.equal(
  effectiveRefundAmountOre({ ...paidDelivered, paymentStatus: 'REFUNDED', refundAmount: 0 }),
  paidDelivered.total,
  'REFUNDED is a full refund even when a legacy cumulative amount is zero',
);
assert.equal(
  effectiveRefundAmountOre({ ...paidDelivered, paymentStatus: 'REFUNDED', refundAmount: 1_000 }),
  paidDelivered.total,
  'REFUNDED is a full refund even when a legacy cumulative amount is incomplete',
);

const fullyRefundedAuditOrder = {
  ...paidDelivered,
  id: 'full-refund-audit',
  orderNumber: 'VE-FULL',
  paymentStatus: 'REFUNDED',
  paymentProvider: 'mollie',
  molliePaymentId: 'tr_full',
  updatedAt: new Date('2026-08-05T10:00:00.000Z'),
};
assert.equal(
  buildPayoutFinanceFingerprint([{ ...fullyRefundedAuditOrder, refundAmount: 0 }]),
  buildPayoutFinanceFingerprint([{ ...fullyRefundedAuditOrder, refundAmount: paidDelivered.total }]),
  'finance snapshots normalize every fully refunded row to its full total',
);
assert.notEqual(
  buildPayoutFinanceFingerprint([{
    ...fullyRefundedAuditOrder,
    foodDiscountAmount: 1_000,
    platformFundedFoodDiscountAmount: 0,
  }]),
  buildPayoutFinanceFingerprint([{
    ...fullyRefundedAuditOrder,
    foodDiscountAmount: 1_000,
    platformFundedFoodDiscountAmount: 1_000,
  }]),
  'changing only the frozen discount funder invalidates the finance snapshot',
);

const eligible = payoutOrders([
  paidDelivered,
  { ...paidDelivered, paymentStatus: 'PARTIALLY_REFUNDED', refundAmount: 2_000 },
  { ...paidDelivered, status: 'CANCELLED' },
  { ...paidDelivered, paymentStatus: 'PENDING' },
]);
assert.equal(eligible.length, 2);
assert.equal(eligible.reduce((sum, order) => sum + order.total, 0), 18_000);
assert.equal(eligible.reduce((sum, order) => sum + order.refundAmount, 0), 2_000);

const reconciliation = reconcileFinanceOrders({
  feeStatus: 'partial',
  orders: [
    {
      id: 'paid',
      orderNumber: '1001',
      restaurantId: 'restaurant-1',
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      paymentProvider: 'mollie',
      molliePaymentId: 'tr_paid',
      total: 10_000,
      refundAmount: null,
    },
    {
      id: 'failed',
      orderNumber: '1002',
      restaurantId: 'restaurant-1',
      status: 'DELIVERED',
      paymentStatus: 'FAILED',
      paymentProvider: 'mollie',
      molliePaymentId: 'tr_failed',
      total: 8_000,
      refundAmount: null,
    },
    {
      id: 'missing-fee',
      orderNumber: '1003',
      restaurantId: 'restaurant-1',
      status: 'COMPLETED',
      paymentStatus: 'REFUNDED',
      paymentProvider: 'mollie',
      molliePaymentId: 'tr_refunded',
      total: 5_000,
      refundAmount: 5_000,
    },
  ],
});
assert.equal(
  reconciliation.some((item) => item.code === 'DELIVERED_WITHOUT_SETTLED_PAYMENT' && item.amountOre === 8_000),
  true,
);
assert.equal(reconciliation.some((item) => item.id.startsWith('missing-fee:')), false);
assert.equal(reconciliation.some((item) => item.orderId === 'paid'), false);

const platformPayout = computePayout(
  [partial!],
  { selfDelivery: false, commissionPctOverride: null, featuredClass: 3 },
  DEFAULT_ECONOMY,
);
assert.equal(platformPayout.grossTotal, 8_000);
assert.equal(platformPayout.foodBase, 6_500);
assert.equal(platformPayout.restaurantGrossOre, 6_500);
assert.equal(platformPayout.commissionOre, 1_300);
assert.equal(platformPayout.feeVatOre, 325);
assert.equal(platformPayout.foodVatOre, 368);
assert.equal(platformPayout.foodVatPct, 6);
assert.equal(platformPayout.restaurantTipOre, 0);
assert.equal(platformPayout.platformTipOre, 500);
assert.equal(platformPayout.payoutOre, 4_875);

const selfDeliveryPayout = computePayout(
  [partial!],
  { selfDelivery: true, commissionPctOverride: null, featuredClass: 3 },
  DEFAULT_ECONOMY,
);
assert.equal(selfDeliveryPayout.restaurantGrossOre, 8_000);
assert.equal(selfDeliveryPayout.commissionOre, 650);
assert.equal(selfDeliveryPayout.feeVatOre, 163);
assert.equal(selfDeliveryPayout.foodVatOre, 368);
assert.equal(selfDeliveryPayout.foodVatPct, 6);
assert.equal(selfDeliveryPayout.restaurantTipOre, 500);
assert.equal(selfDeliveryPayout.platformTipOre, 0);
assert.equal(selfDeliveryPayout.payoutOre, 7_187);

// null alone means global. An explicit 0 is a real, provisionsfritt avtal and
// must survive every calculation unchanged.
const zeroCommissionPayout = computePayout(
  [partial!],
  { selfDelivery: true, commissionPctOverride: 0, featuredClass: 3 },
  DEFAULT_ECONOMY,
);
assert.equal(zeroCommissionPayout.commissionPct, 0);
assert.equal(zeroCommissionPayout.commissionOre, 0);
assert.equal(zeroCommissionPayout.feeVatOre, 0);
assert.equal(zeroCommissionPayout.payoutOre, 8_000);
assert.equal(hasCommissionOverride(null), false);
assert.equal(hasCommissionOverride(0), true);
assert.equal(hasCommissionOverride(5), true);
assert.equal(hasCommissionOverride(-1), false);
assert.equal(hasCommissionOverride(101), false);

const customCommissionPayout = computePayout(
  [partial!],
  { selfDelivery: true, commissionPctOverride: 5, featuredClass: 3 },
  DEFAULT_ECONOMY,
);
assert.equal(customCommissionPayout.commissionPct, 5);
assert.equal(customCommissionPayout.commissionOre, 325);

const globalCommissionPayout = computePayout(
  [partial!],
  { selfDelivery: true, commissionPctOverride: null, featuredClass: 3 },
  DEFAULT_ECONOMY,
);
assert.equal(globalCommissionPayout.commissionPct, DEFAULT_ECONOMY.commissionSelfPct);

// A delivery discount removes only the delivery component. Food discounts
// reduce the commission base, while the minimum-order top-up remains revenue
// for the restaurant.
const discountedPayout = computePayout(
  [{
    ...paidDelivered,
    total: 9_500,
    deliveryFee: 2_000,
    tipAmount: 0,
    discountAmount: 3_000,
    foodDiscountAmount: 1_000,
    deliveryDiscountAmount: 2_000,
    smallOrderFee: 500,
  }],
  { selfDelivery: false, commissionPctOverride: 20, featuredClass: 3 },
  DEFAULT_ECONOMY,
);
assert.equal(discountedPayout.deliveryFeeTotal, 0);
assert.equal(discountedPayout.deliveryDiscountTotal, 2_000);
assert.equal(discountedPayout.smallOrderFeeTotal, 500);
assert.equal(discountedPayout.foodBase, 9_500);
assert.equal(discountedPayout.commissionOre, 1_900);
assert.equal(discountedPayout.payoutOre, 7_125);

const platformFundedDiscountOrder = {
  ...paidDelivered,
  total: 9_500,
  deliveryFee: 2_000,
  tipAmount: 0,
  discountAmount: 3_000,
  foodDiscountAmount: 1_000,
  deliveryDiscountAmount: 2_000,
  platformFundedFoodDiscountAmount: 1_000,
  platformFundedDeliveryDiscountAmount: 2_000,
  smallOrderFee: 500,
  paymentStatus: 'PARTIALLY_REFUNDED',
  refundAmount: 2_000,
} satisfies PayoutOrder;
const platformFundedPartial = netPayoutOrder(platformFundedDiscountOrder)!;
assert.equal(platformFundedPartial.total, 7_500);
assert.equal(platformFundedPartial.deliveryFee, 2_000, 'free delivery remains fully discounted');
assert.equal(platformFundedPartial.deliveryDiscountAmount, 2_000);
assert.equal(platformFundedPartial.smallOrderFee, 500, 'food refund consumes menu value before top-up');
assert.equal(platformFundedPartial.platformFundedFoodDiscountAmount, 1_000);
assert.equal(platformFundedPartial.platformFundedDeliveryDiscountAmount, 2_000);

const platformFundedPlatformDelivery = computePayout(
  [platformFundedPartial],
  { selfDelivery: false, commissionPctOverride: 20, featuredClass: 3 },
  DEFAULT_ECONOMY,
);
assert.equal(platformFundedPlatformDelivery.grossTotal, 7_500);
assert.equal(platformFundedPlatformDelivery.foodBase, 8_500);
assert.equal(platformFundedPlatformDelivery.restaurantGrossOre, 8_500);
assert.equal(platformFundedPlatformDelivery.platformFundedFoodDiscountTotal, 1_000);
assert.equal(platformFundedPlatformDelivery.platformFundedDeliveryDiscountTotal, 2_000);
assert.equal(platformFundedPlatformDelivery.restaurantPlatformFundedDiscountTotal, 1_000);

const platformFundedSelfDelivery = computePayout(
  [platformFundedPartial],
  { selfDelivery: true, commissionPctOverride: 20, featuredClass: 3 },
  DEFAULT_ECONOMY,
);
assert.equal(platformFundedSelfDelivery.foodBase, 8_500);
assert.equal(platformFundedSelfDelivery.restaurantPlatformFundedDiscountTotal, 3_000);
assert.equal(
  platformFundedSelfDelivery.restaurantGrossOre,
  10_500,
  'self-delivery receives both ViaEats-funded food and delivery discount',
);

const customTierPayout = computePayout(
  [],
  {
    selfDelivery: false,
    commissionPctOverride: null,
    featuredClass: 1,
    tierGoldFeeOverride: 12_345,
  },
  DEFAULT_ECONOMY,
);
assert.equal(customTierPayout.tierLabel, 'Guld');
assert.equal(customTierPayout.subscriptionOre, 12_345);
assert.equal(customTierPayout.feeVatOre, 3_086);
assert.equal(customTierPayout.owedOre, 15_431);

// Settlement rows are derived from the authoritative orders and the manual
// adjustment only; client-provided gross/commission/payout values have no role.
const settlement = buildPayoutMoneySnapshot(
  [
    { ...paidDelivered, paymentStatus: 'PARTIALLY_REFUNDED', refundAmount: 2_000 },
    { ...paidDelivered, status: 'CANCELLED' },
    { ...paidDelivered, paymentStatus: 'FAILED' },
  ],
  { selfDelivery: false, commissionPctOverride: null, featuredClass: 3 },
  DEFAULT_ECONOMY,
  100,
);
assert.deepEqual(settlement.snapshot, {
  grossSales: 6_500,
  orderCount: 1,
  commissionAmount: 1_300,
  subscriptionAmount: 0,
  manualAdjustmentAmount: 100,
  lateRefundAdjustmentAmount: 0,
  foodVatAmount: 368,
  platformTipAmount: 500,
  payoutAmount: 4_775,
  mollieFeeAmount: 0,
});
assert.deepEqual(settlement.economicSnapshot, {
  commissionPctSnapshot: 20,
  feeVatPctSnapshot: 25,
  foodVatPctSnapshot: 6,
  selfDeliverySnapshot: false,
  mollieFeeAmount: 0,
});

const billingStartMonth = resolveFinancePeriod(
  '2026-03-01',
  '2026-03-31',
  new Date('2026-03-20T12:00:00.000Z'),
);
const historicalMonth = resolveFinancePeriod(
  '2026-02-01',
  '2026-02-28',
  new Date('2026-03-20T12:00:00.000Z'),
);
const partialBillingMonth = resolveFinancePeriod(
  '2026-03-15',
  '2026-03-31',
  new Date('2026-03-20T12:00:00.000Z'),
);
const restaurantCreatedAt = new Date('2026-03-20T12:00:00.000Z');
assert.equal(isFinanceCalendarMonthPeriod(billingStartMonth.start, billingStartMonth.end), true);
assert.equal(isFinanceCalendarMonthPeriod(partialBillingMonth.start, partialBillingMonth.end), false);
assert.equal(
  subscriptionAppliesToFinancePeriod(restaurantCreatedAt, null, historicalMonth.start, historicalMonth.end),
  false,
  'a restaurant is never billed before its createdAt month',
);
assert.equal(
  subscriptionAppliesToFinancePeriod(restaurantCreatedAt, null, billingStartMonth.start, billingStartMonth.end),
  true,
  'the exact restaurant start month carries one full monthly subscription',
);
assert.equal(
  subscriptionAppliesToFinancePeriod(restaurantCreatedAt, null, partialBillingMonth.start, partialBillingMonth.end),
  false,
  'a partial period cannot create a duplicate subscription charge',
);

const archiveMonth = resolveFinancePeriod(
  '2026-05-01',
  '2026-05-31',
  new Date('2026-05-15T12:00:00.000Z'),
);
const postArchiveMonth = resolveFinancePeriod(
  '2026-06-01',
  '2026-06-30',
  new Date('2026-06-15T12:00:00.000Z'),
);
const restaurantArchivedAt = new Date('2026-05-07T10:00:00.000Z');
assert.equal(
  subscriptionAppliesToFinancePeriod(restaurantCreatedAt, restaurantArchivedAt, archiveMonth.start, archiveMonth.end),
  true,
  'the exact archive month carries the final full monthly subscription',
);
assert.equal(
  subscriptionAppliesToFinancePeriod(restaurantCreatedAt, restaurantArchivedAt, postArchiveMonth.start, postArchiveMonth.end),
  false,
  'subscription stops for the first month beginning after archivedAt',
);

// Manual transfers are signed and exact to the öre. A paired transfer moves
// the Burger King cost to Palmyra without changing the period total.
assert.deepEqual(applySettlementAdjustments({
  payoutAmount: 301_300,
  owedAmount: 0,
  manualAdjustmentAmount: 5_553,
}), { payoutAmount: 295_747, owedAmount: 0 });
assert.deepEqual(applySettlementAdjustments({
  payoutAmount: 0,
  owedAmount: 5_553,
  manualAdjustmentAmount: -5_553,
}), { payoutAmount: 0, owedAmount: 0 });
assert.deepEqual(applySettlementAdjustments({
  payoutAmount: 0,
  owedAmount: 5_553,
  manualAdjustmentAmount: -6_000,
}), { payoutAmount: 447, owedAmount: 0 });
const creditedRecoveryCapacity = applySettlementAdjustments({
  payoutAmount: 0,
  owedAmount: 5_553,
  manualAdjustmentAmount: -6_000,
  lateRefundAdjustmentAmount: 0,
});
assert.deepEqual(
  buildLateRefundRecoveryPlan([{
    sourcePayoutId: 'late-refund-after-credit',
    requiredRecoveryAmount: 1_000,
    appliedAmount: 0,
    reservedElsewhereAmount: 0,
  }], creditedRecoveryCapacity.payoutAmount),
  {
    allocations: [{ sourcePayoutId: 'late-refund-after-credit', amount: 447 }],
    totalAmount: 447,
    remainingAmount: 553,
  },
  'preview recovery capacity applies a manual credit after existing debt, exactly like payout save',
);

const freshRecoveryCapacity = 10_000;
const recoveryFromOriginalCapacity = buildLateRefundRecoveryPlan([{
  sourcePayoutId: 'already-reserved-target',
  requiredRecoveryAmount: 9_000,
  appliedAmount: 0,
  reservedElsewhereAmount: 0,
}], freshRecoveryCapacity);
assert.equal(recoveryFromOriginalCapacity.totalAmount, 9_000);
assert.equal(
  freshRecoveryCapacity - recoveryFromOriginalCapacity.totalAmount,
  1_000,
  'a stored recovery must not reduce the target capacity before the fresh plan is recalculated',
);
assert.equal(
  applySettlementAdjustments({ payoutAmount: 301_300, owedAmount: 0, manualAdjustmentAmount: 5_553 }).payoutAmount -
    applySettlementAdjustments({ payoutAmount: 0, owedAmount: 5_553, manualAdjustmentAmount: -5_553 }).owedAmount,
  295_747,
);

assert.equal(canTransitionPayout(null, 'PAID'), false);
assert.equal(canTransitionPayout(null, 'APPROVED'), true);
assert.equal(canTransitionPayout('DRAFT', 'PAID'), false);
assert.equal(canTransitionPayout('APPROVED', 'PAID'), true);
assert.equal(canTransitionPayout('PAID', 'DRAFT'), false);
assert.equal(canTransitionPayout('PAID', 'PAID'), true);
assert.equal(samePayoutMoneySnapshot(settlement.snapshot, { ...settlement.snapshot }), true);
assert.equal(
  samePayoutMoneySnapshot(settlement.snapshot, { ...settlement.snapshot, payoutAmount: 5_001 }),
  false,
);

// A source payout is always recomputed with its frozen terms, not today's
// restaurant settings.
const lateRefundSource = {
  ...settlement.economicSnapshot,
  subscriptionAmount: 0,
  manualAdjustmentAmount: 100,
  lateRefundAdjustmentAmount: 0,
};
assert.deepEqual(
  recomputePayoutFromEconomicSnapshot([
    { ...paidDelivered, paymentStatus: 'PARTIALLY_REFUNDED', refundAmount: 4_000 },
  ], lateRefundSource),
  {
    grossSales: 4_500,
    orderCount: 1,
    commissionAmount: 900,
    subscriptionAmount: 0,
    manualAdjustmentAmount: 100,
    lateRefundAdjustmentAmount: 0,
    foodVatAmount: 255,
    platformTipAmount: 500,
    payoutAmount: 3_275,
    mollieFeeAmount: 0,
  },
);

// A full late refund has no remaining payout, but the restaurant still owns
// both the original payment fee and Mollie's separately booked refund fee.
const fullyRefundedSettlement = recomputePayoutSettlementFromEconomicSnapshot([
  { ...paidDelivered, paymentStatus: 'REFUNDED', refundAmount: paidDelivered.total },
], {
  ...lateRefundSource,
  manualAdjustmentAmount: 0,
  mollieFeeAmount: 500,
});
assert.equal(fullyRefundedSettlement.snapshot.payoutAmount, 0);
assert.equal(fullyRefundedSettlement.owedAmount, 500);
assert.equal(
  requiredLateRefundRecoverySettlementAmount(6_075, 0, fullyRefundedSettlement.owedAmount),
  6_575,
  'late recovery retains the provider-fee debt beyond the old paid amount',
);

const recoveryPlan = buildLateRefundRecoveryPlan([
  {
    sourcePayoutId: 'oldest',
    requiredRecoveryAmount: 4_000,
    appliedAmount: 1_000,
    reservedElsewhereAmount: 500,
  },
  {
    sourcePayoutId: 'newer',
    requiredRecoveryAmount: 3_000,
    appliedAmount: 0,
    reservedElsewhereAmount: 0,
  },
], 4_000);
assert.deepEqual(recoveryPlan, {
  allocations: [
    { sourcePayoutId: 'oldest', amount: 2_500 },
    { sourcePayoutId: 'newer', amount: 1_500 },
  ],
  totalAmount: 4_000,
  remainingAmount: 1_500,
});
assert.equal(sameRecoveryAllocations(recoveryPlan.allocations, [...recoveryPlan.allocations].reverse()), true);
assert.equal(sameRecoveryAllocations(recoveryPlan.allocations, [
  { sourcePayoutId: 'oldest', amount: 2_499 },
  { sourcePayoutId: 'newer', amount: 1_501 },
]), false);
const approvedRecoveryRequiresAction = (
  savedAmount: number,
  currentAmount: number,
  savedAllocations: typeof recoveryPlan.allocations,
  currentAllocations: typeof recoveryPlan.allocations,
) => savedAmount !== currentAmount || !sameRecoveryAllocations(savedAllocations, currentAllocations);
assert.equal(
  approvedRecoveryRequiresAction(
    recoveryPlan.totalAmount,
    recoveryPlan.totalAmount,
    recoveryPlan.allocations,
    [...recoveryPlan.allocations].reverse(),
  ),
  false,
  'an unchanged approved recovery snapshot remains locked',
);
assert.equal(
  approvedRecoveryRequiresAction(
    recoveryPlan.totalAmount,
    recoveryPlan.totalAmount,
    recoveryPlan.allocations,
    [{ sourcePayoutId: 'replacement-source', amount: recoveryPlan.totalAmount }],
  ),
  true,
  'a changed recovery source requires a new locked version even when the total is unchanged',
);
assert.equal(
  approvedRecoveryRequiresAction(
    recoveryPlan.totalAmount,
    recoveryPlan.totalAmount + 1,
    recoveryPlan.allocations,
    recoveryPlan.allocations,
  ),
  true,
  'a changed recovery amount requires action',
);
assert.equal(requiredLateRefundRecoveryAmount(5_000, 3_725), 1_275);
assert.equal(requiredLateRefundRecoveryAmount(5_000, 0), 5_000);
assert.equal(requiredLateRefundRecoveryAmount(5_000, 5_500), 0);

assert.equal(payoutRefundWindowHours({}), 72);
assert.equal(payoutRefundWindowHours({ PAYOUT_REFUND_WINDOW_HOURS: '96' }), 96);
assert.throws(
  () => payoutRefundWindowHours({ PAYOUT_REFUND_WINDOW_HOURS: '0' }),
  /mellan 1 och 720/,
);
assert.throws(
  () => payoutRefundWindowHours({ PAYOUT_REFUND_WINDOW_HOURS: '72.5' }),
  /mellan 1 och 720/,
);

const payoutPeriodEnd = new Date('2026-07-10T12:00:00.000Z');
assert.equal(
  payoutRefundWindowClosesAt(payoutPeriodEnd, 72).toISOString(),
  '2026-07-13T12:00:00.000Z',
);
assert.equal(
  isPayoutRefundWindowClosed(payoutPeriodEnd, new Date('2026-07-13T11:59:59.999Z'), 72),
  false,
);
assert.equal(
  isPayoutRefundWindowClosed(payoutPeriodEnd, new Date('2026-07-13T12:00:00.000Z'), 72),
  true,
);

// A scheduled order created in an old period must wait 72 hours from its
// actual terminal/last-economic update, not merely from periodEnd.
const terminalUpdate = new Date('2026-07-20T12:00:00.000Z');
assert.equal(
  isPayoutOrderRefundWindowClosed(
    { status: 'DELIVERED', updatedAt: terminalUpdate },
    new Date('2026-07-23T11:59:59.999Z'),
    72,
  ),
  false,
);
assert.equal(
  isPayoutOrderRefundWindowClosed(
    { status: 'COMPLETED', updatedAt: terminalUpdate },
    new Date('2026-07-23T12:00:00.000Z'),
    72,
  ),
  true,
);
assert.equal(
  isPayoutOrderRefundWindowClosed(
    { status: 'PREPARING', updatedAt: new Date('2026-07-01T00:00:00.000Z') },
    new Date('2026-08-01T00:00:00.000Z'),
    72,
  ),
  false,
);

assert.equal(canAdminMarkPayoutPaid('admin-a', 'admin-b', 'b@viaeats.se'), true);
assert.equal(canAdminMarkPayoutPaid('admin-a', 'admin-a', 'a@viaeats.se'), false);
assert.equal(canAdminMarkPayoutPaid('a@viaeats.se', 'legacy-id-a', 'A@viaeats.se'), false);
assert.equal(canAdminMarkPayoutPaid(null, 'admin-b', 'b@viaeats.se'), false);

// Changing live orders, rates or delivery mode after approval must not rewrite
const workingDraft = {
  status: 'DRAFT',
  orderCount: 4,
  grossSales: 10_000,
  commissionAmount: 2_000,
  subscriptionAmount: 500,
  manualAdjustmentAmount: 5_553,
  payoutAmount: 1_222,
  commissionPctSnapshot: 20,
  feeVatPctSnapshot: 25,
  selfDeliverySnapshot: true,
};
assert.deepEqual(
  activeFinanceSummarySnapshot(workingDraft, null),
  workingDraft,
  'a saved draft must update the visible working calculation',
);
assert.deepEqual(
  activeFinanceSummarySnapshot({ ...workingDraft, status: 'HOLD' }, { ...workingDraft, status: 'APPROVED', manualAdjustmentAmount: 0 }),
  { ...workingDraft, status: 'APPROVED', manualAdjustmentAmount: 0 },
  'a provisional replacement keeps its saved active revision while waiting for Mollie',
);

// the finance overview row (and therefore cannot rewrite its reduced totals).
const frozenOverview = selectFinanceSummaryEconomicValues({
  orderCount: 99,
  grossSales: 999_999,
  commission: 444_444,
  subscription: 333_333,
  feeVat: 222_222,
  payout: 111_111,
  owed: 55_555,
  foodVat: 12_345,
  foodVatPct: 12,
  platformTip: 9_876,
  commissionPct: 44,
  selfDelivery: true,
}, {
  status: 'PAID',
  orderCount: 4,
  grossSales: 10_000,
  commissionAmount: 2_000,
  subscriptionAmount: 500,
  foodVatAmount: 345,
  platformTipAmount: 88,
  payoutAmount: 6_775,
  commissionPctSnapshot: 20,
  feeVatPctSnapshot: 25,
  foodVatPctSnapshot: 6,
  selfDeliverySnapshot: false,
});
assert.deepEqual(frozenOverview, {
  orderCount: 4,
  grossSales: 10_000,
  commission: 2_000,
  subscription: 500,
  feeVat: 625,
  foodVat: 345,
  foodVatPct: 6,
  platformTip: 88,
  payout: 6_775,
  owed: 0,
  commissionPct: 20,
  selfDelivery: false,
  usesFrozenSnapshot: true,
});
assert.deepEqual(sumFinanceSummaryRows([
  { ...frozenOverview, refunds: 500 },
  {
    orderCount: 1,
    grossSales: 1_000,
    refunds: 0,
    commission: 100,
    subscription: 0,
    feeVat: 25,
    foodVat: 59,
    platformTip: 0,
    payout: 875,
    owed: 0,
  },
]), {
  orderCount: 5,
  grossSales: 11_000,
  refunds: 500,
  commission: 2_100,
  subscription: 500,
  feeVat: 650,
  foodVat: 404,
  platformTip: 88,
  payout: 7_650,
  owed: 0,
});

const pairedRestaurantFunding = reconcileRestaurantFundingOre({
  periodGross: 312_900,
  periodRefunds: 0,
  periodFees: 16_165,
  externalGross: 1_000,
  externalRefunds: 0,
  externalFees: 12,
  rows: [
    {
      grossTotal: 311_900,
      refunds: 0,
      mollieFee: 10_600,
      payout: 295_747,
      owed: 0,
      commission: 0,
      subscription: 0,
      feeVat: 0,
      deliveryFee: 0,
      tip: 0,
      selfDelivery: true,
      manualAdjustment: 5_553,
      platformFundedDiscount: 0,
    },
    {
      grossTotal: 0,
      refunds: 0,
      mollieFee: 5_553,
      payout: 0,
      owed: 0,
      commission: 0,
      subscription: 0,
      feeVat: 0,
      deliveryFee: 0,
      tip: 0,
      selfDelivery: true,
      manualAdjustment: -5_553,
      platformFundedDiscount: 0,
    },
  ],
});
assert.deepEqual(pairedRestaurantFunding, {
  mollieRestaurantNet: 295_747,
  calculatedRestaurantNet: 295_747,
  difference: 0,
  salesDifference: 0,
  feeDifference: 0,
  adjustmentNet: 0,
  invoiceTotal: 0,
  externalNet: 988,
});

const invoiceRestaurantFunding = reconcileRestaurantFundingOre({
  periodGross: 312_900,
  periodRefunds: 0,
  periodFees: 16_165,
  externalGross: 1_000,
  externalRefunds: 0,
  externalFees: 12,
  rows: [{
    grossTotal: 311_900,
    refunds: 0,
    mollieFee: 16_153,
    payout: 0,
    owed: 5_553,
    commission: 301_300,
    subscription: 0,
    feeVat: 0,
    deliveryFee: 0,
    tip: 0,
    selfDelivery: true,
    manualAdjustment: 0,
    platformFundedDiscount: 0,
  }],
});
assert.equal(invoiceRestaurantFunding.calculatedRestaurantNet, 295_747);
assert.equal(invoiceRestaurantFunding.invoiceTotal, 5_553);
assert.equal(invoiceRestaurantFunding.difference, 0);

assert.deepEqual(applySettlementAdjustments({
  payoutAmount: 0,
  owedAmount: 8_750,
  mollieFeeAmount: 300,
}), { payoutAmount: 0, owedAmount: 9_050 });

const invoiceCashIdentity = reconcileRestaurantFundingOre({
  periodGross: 10_000,
  periodRefunds: 0,
  periodFees: 300,
  externalGross: 0,
  externalRefunds: 0,
  externalFees: 0,
  rows: [{
    grossTotal: 10_000,
    refunds: 0,
    mollieFee: 300,
    payout: 0,
    owed: 9_050,
    commission: 15_000,
    subscription: 3_000,
    feeVat: 750,
    deliveryFee: 0,
    tip: 0,
    selfDelivery: true,
    manualAdjustment: 0,
    platformFundedDiscount: 0,
  }],
});
assert.equal(invoiceCashIdentity.mollieRestaurantNet, 9_700);
assert.equal(invoiceCashIdentity.calculatedRestaurantNet, 9_700);
assert.equal(invoiceCashIdentity.invoiceTotal, 9_050);
assert.equal(invoiceCashIdentity.difference, 0);

assert.deepEqual(applySettlementAdjustments({
  payoutAmount: 9_000,
  owedAmount: 0,
  mollieFeeAmount: 300,
  manualAdjustmentAmount: -500,
}), { payoutAmount: 9_200, owedAmount: 0 });

const manualCreditCashIdentity = reconcileRestaurantFundingOre({
  periodGross: 10_000,
  periodRefunds: 0,
  periodFees: 300,
  externalGross: 0,
  externalRefunds: 0,
  externalFees: 0,
  rows: [{
    grossTotal: 10_000,
    refunds: 0,
    mollieFee: 300,
    payout: 9_200,
    owed: 0,
    commission: 1_000,
    subscription: 0,
    feeVat: 0,
    deliveryFee: 0,
    tip: 0,
    selfDelivery: true,
    // Negative is a credit: it increases payout, so the signed amount is
    // added back (and therefore subtracts 500) in the cash identity.
    manualAdjustment: -500,
    platformFundedDiscount: 0,
  }],
});
assert.equal(manualCreditCashIdentity.mollieRestaurantNet, 9_700);
assert.equal(manualCreditCashIdentity.calculatedRestaurantNet, 9_700);
assert.equal(manualCreditCashIdentity.adjustmentNet, -500);
assert.equal(manualCreditCashIdentity.difference, 0);

const positiveManualFunding = reconcileRestaurantFundingOre({
  periodGross: 312_900,
  periodRefunds: 0,
  periodFees: 16_165,
  externalGross: 1_000,
  externalRefunds: 0,
  externalFees: 12,
  rows: [{
    grossTotal: 311_900,
    refunds: 0,
    mollieFee: 16_153,
    payout: 290_194,
    owed: 0,
    commission: 0,
    subscription: 0,
    feeVat: 0,
    deliveryFee: 0,
    tip: 0,
    selfDelivery: true,
    manualAdjustment: 5_553,
    platformFundedDiscount: 0,
  }],
});
assert.equal(positiveManualFunding.difference, 0);
assert.equal(positiveManualFunding.calculatedRestaurantNet, 295_747);
assert.equal(positiveManualFunding.adjustmentNet, 5_553);
assert.equal(positiveManualFunding.invoiceTotal, 0);

const exactLateRefundFunding = reconcileRestaurantFundingOre({
  periodGross: 10_000,
  periodRefunds: 2_000,
  periodFees: 200,
  externalGross: 0,
  externalRefunds: 0,
  externalFees: 0,
  historicalRefundPrincipal: 2_000,
  historicalRefundFees: 200,
  lateRefundRecovery: 1_950,
  rows: [{
    grossTotal: 10_000,
    refunds: 0,
    mollieFee: 0,
    payout: 6_800,
    owed: 0,
    commission: 1_000,
    subscription: 0,
    feeVat: 250,
    deliveryFee: 0,
    tip: 0,
    selfDelivery: true,
    manualAdjustment: 0,
    platformFundedDiscount: 0,
  }],
});
assert.equal(exactLateRefundFunding.mollieRestaurantNet, 7_800);
assert.equal(exactLateRefundFunding.calculatedRestaurantNet, 7_800);
assert.equal(exactLateRefundFunding.difference, 0);
assert.equal(exactLateRefundFunding.salesDifference, 0);
assert.equal(exactLateRefundFunding.feeDifference, 0);

const carriedLateRefundFunding = reconcileRestaurantFundingOre({
  periodGross: 10_000,
  periodRefunds: 0,
  periodFees: 0,
  externalGross: 0,
  externalRefunds: 0,
  externalFees: 0,
  historicalRefundPrincipal: 0,
  historicalRefundFees: 0,
  lateRefundRecovery: 1_950,
  rows: [{
    grossTotal: 10_000,
    refunds: 0,
    mollieFee: 0,
    payout: 6_800,
    owed: 0,
    commission: 1_000,
    subscription: 0,
    feeVat: 250,
    deliveryFee: 0,
    tip: 0,
    selfDelivery: true,
    manualAdjustment: 0,
    platformFundedDiscount: 0,
  }],
});
assert.equal(carriedLateRefundFunding.calculatedRestaurantNet, 10_000);
assert.equal(carriedLateRefundFunding.difference, 0);
assert.equal(carriedLateRefundFunding.salesDifference, 0);
assert.equal(carriedLateRefundFunding.feeDifference, 0);

const platformFundedRestaurantFunding = reconcileRestaurantFundingOre({
  periodGross: 8_000,
  periodRefunds: 0,
  periodFees: 0,
  externalGross: 0,
  externalRefunds: 0,
  externalFees: 0,
  rows: [{
    grossTotal: 8_000,
    refunds: 0,
    mollieFee: 0,
    payout: 10_000,
    owed: 0,
    commission: 0,
    subscription: 0,
    feeVat: 0,
    deliveryFee: 0,
    tip: 0,
    selfDelivery: true,
    manualAdjustment: 0,
    platformFundedDiscount: 2_000,
  }],
});
assert.equal(platformFundedRestaurantFunding.mollieRestaurantNet, 8_000);
assert.equal(platformFundedRestaurantFunding.calculatedRestaurantNet, 8_000);
assert.equal(platformFundedRestaurantFunding.difference, 0);
assert.equal(platformFundedRestaurantFunding.salesDifference, 0);

const mollieFees = molliePaymentFeesFromTransactions([
  {
    id: 'bst_payment_a',
    type: 'payment',
    context: { paymentId: 'tr_a' },
    deductionDetails: { fees: { currency: 'SEK', value: '3.25' } },
  },
  {
    // Older separate fee representation for another payment.
    id: 'bst_fee_b',
    type: 'payment-fee',
    context: { 'payment-fee': { paymentId: 'tr_b' } },
    resultAmount: { currency: 'SEK', value: '-2.00' },
  },
  {
    // Do not double count a separate row when the detailed fee exists.
    id: 'bst_fee_a',
    type: 'payment-fee',
    context: { paymentId: 'tr_a' },
    resultAmount: { currency: 'SEK', value: '-3.25' },
  },
  {
    // Capital/reserve deductions are deliberately not transaction fees.
    id: 'bst_capital',
    type: 'payment',
    context: { paymentId: 'tr_c' },
    deductionDetails: { fees: { currency: 'EUR', value: '99.00' } },
  },
]);
assert.equal(mollieFees.get('tr_a'), 325);
assert.equal(mollieFees.get('tr_b'), 200);
assert.equal(mollieFees.has('tr_c'), false);
assert.deepEqual(molliePaymentOrderReference({
  id: 'tr_metadata',
  metadata: { orderId: 'order-1', orderNumber: 'VE-1001' },
  description: 'Ignoreras när metadata finns',
}), { orderId: 'order-1', orderNumber: 'VE-1001' });
assert.deepEqual(molliePaymentOrderReference({
  id: 'tr_description',
  description: 'VE-1002 – Palmyra',
}), { orderId: null, orderNumber: 'VE-1002' });
assert.equal(
  mollieBalanceReportUntil(
    new Date('2026-07-31T21:59:59.999Z'),
    new Date('2026-08-03T12:00:00.000Z'),
  ),
  '2026-08-01',
  'Mollie until is exclusive, so a completed July report ends on 1 August',
);
assert.equal(
  mollieBalanceReportUntil(
    new Date('2026-08-07T10:00:00.000Z'),
    new Date('2026-08-07T12:00:00.000Z'),
  ),
  '2026-08-08',
  'the current day is included by sending tomorrow as the exclusive boundary',
);
const refundFeeBreakdown = mollieFeeBreakdownFromTransactions([
  {
    id: 'bst_payment_refunded',
    type: 'payment',
    context: { paymentId: 'tr_refunded' },
    deductionDetails: { fees: { currency: 'SEK', value: '-2.92' } },
  },
  {
    id: 'bst_refund',
    type: 'refund',
    context: { paymentId: 'tr_refunded', refundId: 're_refunded' },
    deductionDetails: { fees: { currency: 'SEK', value: '-2.70' } },
  },
]);
assert.equal(refundFeeBreakdown.paymentByPaymentId.get('tr_refunded'), 292);
assert.equal(refundFeeBreakdown.refundByPaymentId.get('tr_refunded'), 270);
assert.equal(refundFeeBreakdown.totalByPaymentId.get('tr_refunded'), 562);
const augustLedgerTransactions = [
  {
    id: 'bst_original_payment',
    type: 'payment',
    createdAt: '2026-07-10T10:00:00.000Z',
    context: { paymentId: 'tr_late_refund' },
    initialAmount: { currency: 'SEK', value: '40.00' },
    deductionDetails: { fees: { currency: 'SEK', value: '-2.92' } },
  },
  {
    // Checkout can be created in July while the balance booking belongs to August.
    id: 'bst_august_payment',
    type: 'payment',
    createdAt: '2026-08-01T00:05:00.000Z',
    context: { paymentId: 'tr_booked_in_august' },
    initialAmount: { currency: 'SEK', value: '100.00' },
    resultAmount: { currency: 'SEK', value: '96.00' },
    deductionDetails: { fees: { currency: 'SEK', value: '-4.00' } },
  },
  {
    id: 'bst_late_refund',
    type: 'refund',
    createdAt: '2026-08-05T10:00:00.000Z',
    context: { paymentId: 'tr_late_refund', refundId: 're_late' },
    initialAmount: { currency: 'SEK', value: '-40.00' },
    resultAmount: { currency: 'SEK', value: '-42.70' },
    deductionDetails: { fees: { currency: 'SEK', value: '-2.70' } },
  },
  {
    // Pagination can repeat an edge row; the transaction id is authoritative.
    id: 'bst_late_refund',
    type: 'refund',
    createdAt: '2026-08-05T10:00:00.000Z',
    context: { paymentId: 'tr_late_refund', refundId: 're_late' },
    initialAmount: { currency: 'SEK', value: '-40.00' },
    resultAmount: { currency: 'SEK', value: '-42.70' },
    deductionDetails: { fees: { currency: 'SEK', value: '-2.70' } },
  },
] as const;
const julyStart = new Date('2026-07-01T00:00:00.000Z');
const julyEnd = new Date('2026-07-31T23:59:59.999Z');
const augustStart = new Date('2026-08-01T00:00:00.000Z');
const augustEnd = new Date('2026-08-31T23:59:59.999Z');
assert.equal(
  mollieRefundsFromTransactionsInPeriod(augustLedgerTransactions, julyStart, julyEnd),
  0,
  'a July payment does not make its August refund part of July',
);
assert.equal(
  mollieRefundsFromTransactionsInPeriod(augustLedgerTransactions, augustStart, augustEnd),
  4_000,
  'a late refund uses its August booking, deduplicates transaction id and excludes its fee from principal',
);
assert.equal(
  molliePaymentsFromTransactionsInPeriod(augustLedgerTransactions, julyStart, julyEnd),
  4_000,
  'period gross follows the July balance booking rather than a later cumulative payment object',
);
assert.equal(
  molliePaymentsFromTransactionsInPeriod(augustLedgerTransactions, augustStart, augustEnd),
  10_000,
  'a payment booked in August belongs to August and excludes its fee from principal',
);
assert.deepEqual(
  mollieUnlinkedPaymentsFromTransactionsInPeriod(
    augustLedgerTransactions,
    augustStart,
    augustEnd,
    new Set(['tr_booked_in_august']),
  ),
  { count: 0, grossOre: 0, paymentIds: [], hasUnknownPaymentId: false },
  'a known restaurant payment is not external merely because checkout was created earlier',
);
assert.deepEqual(
  mollieUnlinkedPaymentsFromTransactionsInPeriod(
    augustLedgerTransactions,
    augustStart,
    augustEnd,
    new Set(),
  ),
  {
    count: 1,
    grossOre: 10_000,
    paymentIds: ['tr_booked_in_august'],
    hasUnknownPaymentId: false,
  },
  'an unmatched balance-booked payment is external in its booking month',
);
assert.equal(
  mollieUnlinkedRefundsFromTransactionsInPeriod(
    augustLedgerTransactions,
    augustStart,
    augustEnd,
    new Set(['tr_late_refund']),
  ),
  0,
  'a refund whose payment belongs to a restaurant is not an external refund',
);
assert.equal(
  mollieUnlinkedRefundsFromTransactionsInPeriod(
    augustLedgerTransactions,
    augustStart,
    augustEnd,
    new Set(),
  ),
  4_000,
  'an unmatched late refund is periodized as external in its booking month',
);
assert.equal(
  mollieFeesFromTransactionsInPeriod(augustLedgerTransactions, augustStart, augustEnd),
  670,
  'the original July payment fee stays in July while the August payment and refund fees are booked in August',
);
assert.equal(
  mollieFeesFromTransactionsInPeriod([
    {
      id: 'unlinked_fee',
      type: 'payment-fee',
      createdAt: '2026-08-05T10:00:00.000Z',
      resultAmount: { currency: 'SEK', value: '-3.00' },
    },
  ], augustStart, augustEnd),
  null,
  'a provider fee without a payment reference is partial, never an exact zero',
);
assert.equal(
  mollieFeesFromTransactionsInPeriod([
    {
      id: 'invalid_fee',
      type: 'payment',
      createdAt: '2026-08-05T10:00:00.000Z',
      context: { paymentId: 'tr_invalid_fee' },
      deductionDetails: { fees: { currency: 'SEK', value: 'not-an-amount' } },
    },
  ], augustStart, augustEnd),
  null,
  'an unparseable fee is partial, never silently coerced to zero',
);
assert.equal(exactMollieFeeSnapshot({
  paymentIds: ['tr_refunded'],
  refundedPaymentIds: ['tr_refunded'],
  paymentFeeByPaymentId: refundFeeBreakdown.paymentByPaymentId,
  refundFeeByPaymentId: new Map(),
}), null, 'a payment fee alone must never lock a refunded transaction');
assert.deepEqual(exactMollieFeeSnapshot({
  paymentIds: ['tr_refunded'],
  refundedPaymentIds: ['tr_refunded'],
  paymentFeeByPaymentId: refundFeeBreakdown.paymentByPaymentId,
  refundFeeByPaymentId: refundFeeBreakdown.refundByPaymentId,
}), { paymentFees: 292, refundProcessingFees: 270, totalFees: 562 });
assert.equal(
  estimateMollieFeeFromObservations(35_500, [
    { amountOre: 15_000, feeOre: 435 },
    { amountOre: 27_000, feeOre: 543 },
    { amountOre: 62_500, feeOre: 863 },
  ]),
  620,
);
assert.equal(
  estimateMollieFeeFromObservations(25_500, [
    { amountOre: 10_000, feeOre: 405 },
    { amountOre: 20_000, feeOre: 530 },
  ]),
  599,
);
assert.equal(estimateMollieFeeFromSwedishPricing({
  amount: { currency: 'SEK', value: '500.00' },
  method: 'creditcard',
  details: { cardCountryCode: 'SE', cardAudience: 'consumer', cardLabel: 'Visa' },
}), 880, 'Swedish consumer cards use 1.20% + 2.80 SEK');
assert.equal(estimateMollieFeeFromSwedishPricing({
  amount: { currency: 'SEK', value: '500.00' },
  method: 'applepay',
  details: { cardCountryCode: 'DE', cardAudience: 'consumer', cardLabel: 'Mastercard' },
}), 1_180, 'Apple Pay follows the underlying EEA consumer card price');
assert.equal(estimateMollieFeeFromSwedishPricing({
  amount: { currency: 'SEK', value: '500.00' },
  method: 'creditcard',
  details: { cardCountryCode: 'SE', cardAudience: 'business', cardLabel: 'Visa' },
}), 1_730, 'EEA commercial cards use 2.90% + 2.80 SEK');
assert.equal(estimateMollieFeeFromSwedishPricing({
  amount: { currency: 'SEK', value: '500.00' },
  method: 'creditcard',
  details: { cardCountryCode: 'US', cardAudience: 'consumer', cardLabel: 'Visa' },
}), 1_905, 'non-EEA cards use 3.25% + 2.80 SEK');
assert.equal(estimateMollieFeeFromSwedishPricing({
  amount: { currency: 'SEK', value: '500.00' },
  method: 'swish',
}), 750, 'Swish uses 0.90% + 3.00 SEK');
assert.equal(mollieRefundFeeForDisplay({}), 0, 'no unverified refund fee is assumed');
assert.equal(mollieRefundFeeForDisplay({ bookedFeeOre: 125 }), 125, 'a booked Mollie refund fee is used exactly');
const calibratedFees = allocateExactFeeTotal(
  new Map([
    ['tr_booked_a', 7_179],
    ['tr_booked_b', 5_553],
  ]),
  new Map([
    ['tr_pending_a', 595],
    ['tr_pending_b', 448],
    ['tr_pending_c', 453],
    ['tr_pending_d', 558],
    ['tr_pending_e', 377],
  ]),
  15_138,
);
assert.equal([...calibratedFees.values()].reduce((sum, fee) => sum + fee, 0), 15_138);
assert.equal(
  ['tr_pending_a', 'tr_pending_b', 'tr_pending_c', 'tr_pending_d', 'tr_pending_e']
    .reduce((sum, id) => sum + Number(calibratedFees.get(id) || 0), 0),
  2_406,
);
assert.equal(
  estimateNextMolliePayoutDate('twice-a-week', new Date('2026-07-29T10:00:00.000Z')),
  '2026-07-31',
);
assert.equal(
  estimateNextMolliePayoutDate('every-monday', new Date('2026-07-29T10:00:00.000Z')),
  '2026-08-03',
);
assert.equal(estimateNextMolliePayoutDate('never'), null);

async function runPayoutSourceAuditContracts() {
  process.env.NODE_ENV = 'test';
  const {
    reconcileMollieRefundsForPayout,
    reconcileMollieRefundsForPayoutPeriod,
  } = await import('../lib/payments/reconcile');
  const targetStart = new Date('2026-07-01T00:00:00.000Z');
  const targetEnd = new Date('2026-07-31T23:59:59.999Z');
  const auditRevision = new Date('2026-07-10T12:00:00.000Z');

  let capturedProviderWhere: any = null;
  const blockedProviders = [
    {
      id: 'stripe-order',
      orderNumber: 'LEGACY-STRIPE',
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      paymentProvider: 'stripe',
      molliePaymentId: null,
      refundAmount: null,
      updatedAt: auditRevision,
      message: /stripe är en avstängd legacy-provider/,
    },
    {
      id: 'missing-mollie-ref',
      orderNumber: 'MOLLIE-NO-REF',
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      paymentProvider: 'mollie',
      molliePaymentId: null,
      refundAmount: null,
      updatedAt: auditRevision,
      message: /Mollie-betalningsreferens saknas/,
    },
    {
      id: 'unknown-provider',
      orderNumber: 'UNKNOWN-PSP',
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      paymentProvider: 'other-psp',
      molliePaymentId: null,
      refundAmount: null,
      updatedAt: auditRevision,
      message: /betalningsprovider other-psp kan inte PSP-revideras/,
    },
    {
      id: 'null-provider',
      orderNumber: 'NULL-PSP',
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      paymentProvider: null,
      molliePaymentId: null,
      refundAmount: null,
      updatedAt: auditRevision,
      message: /betalningsprovider saknas/,
    },
  ];
  for (const blocked of blockedProviders) {
    let mollieAuditCalls = 0;
    await assert.rejects(
      reconcileMollieRefundsForPayoutPeriod({
        restaurantId: 'restaurant-a',
        periodStart: targetStart,
        periodEnd: targetEnd,
      }, {
        db: {
          order: {
            findMany: async ({ where }: any) => {
              capturedProviderWhere = where;
              return [blocked];
            },
          },
        } as any,
        auditBatch: async () => {
          mollieAuditCalls += 1;
        },
      }),
      (error: any) => error instanceof PayoutProviderAuditBlockedError &&
        error.code === 'PAYOUT_PROVIDER_AUDIT_BLOCKED' && blocked.message.test(error.message),
    );
    assert.equal(mollieAuditCalls, 0);
  }
  assert.deepEqual(capturedProviderWhere.status.in, ['DELIVERED', 'COMPLETED']);
  assert.deepEqual(capturedProviderWhere.paymentStatus.in, ['PAID', 'PARTIALLY_REFUNDED']);
  assert.deepEqual(capturedProviderWhere.AND, PAYOUT_NON_TEST_ORDER_FILTER.AND);

  const auditedPayableOrder = {
    id: 'audited-order',
    orderNumber: 'AUDITED-1',
    status: 'DELIVERED',
    paymentStatus: 'PAID',
    paymentProvider: 'mollie',
    molliePaymentId: 'tr_original',
    refundAmount: null,
    updatedAt: auditRevision,
  };
  const targetFingerprint = buildPayoutProviderAuditFingerprint([auditedPayableOrder]);
  assert.throws(
    () => assertPayoutProviderAuditFingerprint(
      [{ ...auditedPayableOrder, molliePaymentId: 'tr_changed_after_audit' }],
      targetFingerprint,
      'målperiod',
    ),
    (error: any) => error instanceof PayoutProviderAuditStaleError &&
      error.code === 'PAYOUT_PROVIDER_AUDIT_STALE',
  );
  assert.throws(
    () => assertPayoutProviderAuditFingerprint(
      [{ ...auditedPayableOrder, updatedAt: new Date('2026-07-10T12:00:01.000Z') }],
      targetFingerprint,
      'målperiod',
    ),
    (error: any) => error instanceof PayoutProviderAuditStaleError &&
      error.code === 'PAYOUT_PROVIDER_AUDIT_STALE',
  );
  assert.throws(
    () => assertPayoutProviderAuditFingerprint(
      [{ ...auditedPayableOrder, paymentProvider: 'stripe', molliePaymentId: null }],
      targetFingerprint,
      'målperiod',
    ),
    (error: any) => error instanceof PayoutProviderAuditBlockedError &&
      error.code === 'PAYOUT_PROVIDER_AUDIT_BLOCKED',
  );
  const payoutRouteSource = readFileSync(join(__dirname, '..', 'routes', 'payouts.ts'), 'utf8');
  assert.match(
    payoutRouteSource,
    /assertPayoutProviderAuditFingerprint\(\s*settlementRows,\s*payoutAudit\.targetFingerprint/,
    'target fingerprint must be revalidated inside the serializable payout transaction',
  );
  assert.match(
    payoutRouteSource,
    /if \(!isFinanceCalendarMonthPeriod\(start, end\)\)[\s\S]*PAYOUT_PERIOD_MUST_BE_CALENDAR_MONTH/,
    'payout POST must reject partial and overlapping sub-month periods',
  );
  assert.match(
    payoutRouteSource,
    /periodRestaurant = restaurantTermsForPeriod\(restaurant, start, end\)[\s\S]*buildPayoutMoneySnapshot\([\s\S]*periodRestaurant/,
    'payout save must use the same restaurant lifecycle subscription rule as finance preview',
  );
  assert.match(
    payoutRouteSource,
    /platformFundedFoodDiscountAmount: order\.platformFundedFoodDiscountAmount[\s\S]*platformFundedDeliveryDiscountAmount: order\.platformFundedDeliveryDiscountAmount/,
    'the immutable payout fingerprint includes both discount funder snapshots',
  );
  assert.match(
    payoutRouteSource,
    /financeSnapshotMetrics\.platformFundedDiscountAmount\s*=\s*baseCalculation\.breakdown\.restaurantPlatformFundedDiscountTotal/,
    'the locked revision freezes only discount support that increases restaurant gross',
  );
  const financeRouteSource = readFileSync(join(__dirname, '..', 'routes', 'finance.ts'), 'utf8');
  assert.match(
    financeRouteSource,
    /createdAt: \{ lte: end \},[\s\S]*OR: \[[\s\S]*\{ archivedAt: null \},[\s\S]*\{ archivedAt: \{ gte: start \} \}/,
    'finance summary must include every restaurant whose lifecycle overlaps the selected month',
  );
  assert.match(
    financeRouteSource,
    /historicalRefundPrincipalOre = historicalPaymentIds\.reduce[\s\S]*periodRefundByPaymentId[\s\S]*historicalRefundFeesOre = historicalPaymentIds\.reduce[\s\S]*periodFeeByPaymentId[\s\S]*historicalRefundPrincipal: historicalRefundPrincipalOre[\s\S]*historicalRefundFees: historicalRefundFeesOre[\s\S]*lateRefundRecovery: lateRefundRecoveryOre/,
    'funding reconciliation must receive historical refund principal, historical provider fees and current recovery',
  );
  assert.match(
    financeRouteSource,
    /platformFundedDiscountAmount: fromOre\(snapshot\.platformFundedDiscountAmount\)/,
    'revision API exposes the frozen ViaEats-funded restaurant support',
  );
  assert.match(
    payoutRouteSource,
    /archivedAt: true[\s\S]*periodRestaurant = restaurantTermsForPeriod\(restaurant, start, end\)/,
    'payout save must include archivedAt when resolving the monthly subscription',
  );
  assert.match(
    financeRouteSource,
    /targetCapacityAmount: recoveryCapacity\.payoutAmount/,
    'detail preview must apply signed manual credit before calculating recovery capacity',
  );
  assert.match(
    financeRouteSource,
    /lateRefundAdjustmentAmount: 0,[\s\S]*targetCapacityAmount: recoveryCapacity\.payoutAmount/,
    'summary recovery must start from original capacity rather than an already reduced saved payout',
  );
  assert.match(
    financeRouteSource,
    /settlementReadiness:[\s\S]*blockingOrderCount[\s\S]*immatureOrderCount/,
    'detail preview must expose the same order-readiness blockers as payout save',
  );
  assert.match(
    financeRouteSource,
    /exactFeesReady = mollieOrders\.length === 0 \|\| \(detailFeesComplete && detailRefundFeesComplete\)/,
    'a zero-order subscription invoice is fee-ready without Mollie payment tokens',
  );
  assert.match(
    financeRouteSource,
    /providerBlockerCount = financialOrders\.filter[\s\S]*PAYOUT_PROVIDER_AUDIT_BLOCKED[\s\S]*providerAuditReady/,
    'detail readiness must fail closed for non-Mollie or unlinked real payments',
  );
  assert.match(
    financeRouteSource,
    /paymentRefund\.findMany[\s\S]*completedHistoricalRefunds[\s\S]*linkedMollieOrders[\s\S]*paymentIds: linkedMollieOrders/,
    'refund-month reconciliation must link historical restaurant payment IDs before classifying external movements',
  );
  assert.match(
    financeRouteSource,
    /matchesSavedApprovedRecovery[\s\S]*lateRefundAdjustmentAmount[\s\S]*sameRecoveryAllocations\(reservedRecovery, recovery\.allocations\)/,
    'summary recovery status must compare the live plan with the saved approved snapshot and reservations',
  );
  assert.match(
    financeRouteSource,
    /recoveryRequiresAction: targetStatus === 'APPROVED'[\s\S]*\? !matchesSavedApprovedRecovery/,
    'an unchanged approved recovery must remain locked while a changed recovery requires action',
  );
  assert.match(
    financeRouteSource,
    /paymentRefunds:[\s\S]{0,900}completedAt: \{ gte: start, lte: end \}[\s\S]{0,500}providerCreatedAt: \{ gte: start, lte: end \}/,
    'restaurant inclusion must use providerCreatedAt even when completedAt belongs to a later period',
  );
  assert.match(
    financeRouteSource,
    /paymentRefund\.findMany\([\s\S]{0,700}completedAt: \{ gte: start, lte: end \}[\s\S]{0,500}providerCreatedAt: \{ gte: start, lte: end \}/,
    'historical refund candidates must use providerCreatedAt even when completedAt belongs to a later period',
  );
  assert.equal(
    financeRouteSource.match(/providerCreatedAt: \{ gte: start, lte: end \}/g)?.length,
    2,
    'both historical PaymentRefund query locations carry the independent provider period branch',
  );
  assert.doesNotMatch(
    financeRouteSource,
    /completedAt: null,\s*providerCreatedAt: \{ gte: start, lte: end \}/,
    'providerCreatedAt must not depend on a null local completedAt',
  );
  assert.equal(
    financeRouteSource.match(/completedAt: null,\s*providerCreatedAt: null,\s*lastSeenAt: \{ gte: start, lte: end \}/g)?.length,
    2,
    'lastSeenAt remains a fallback only when completedAt and providerCreatedAt are both absent',
  );
  assert.match(
    financeRouteSource,
    /historicalPaymentIds = \[\.\.\.new Set\([\s\S]*historicalRefundOrders[\s\S]*\.filter\(Boolean\)[\s\S]*periodRefundByPaymentId\.get\(paymentId\)/,
    'historical refund accounting deduplicates payment IDs and takes each amount once from the period ledger',
  );
  assert.match(
    financeRouteSource,
    /Legacy refunds predating[\s\S]*createdAt: \{ lt: start \}[\s\S]*refundedAt: \{ gte: start, lte: end \}/,
    'an archived restaurant with only a legacy refundedAt event must remain in the period rows',
  );
  const financePageSource = readFileSync(
    join(__dirname, '..', '..', '..', '..', 'apps', 'admin', 'src', 'modules', 'finance', 'page.tsx'),
    'utf8',
  );
  assert.match(
    financePageSource,
    /hasDeviation \|\| row\.recoveryRequiresAction/,
    'the finance UI must not treat a saved recovery amount alone as a new action',
  );

  async function expectStaleWhenSweepChangesPayableSet(
    finalRows: Array<typeof auditedPayableOrder>,
  ) {
    const original = { ...auditedPayableOrder, id: 'zzz-original', orderNumber: 'ORIGINAL-1' };
    let providerPageCall = 0;
    let molliePageCall = 0;
    const auditedRefs: string[] = [];
    await assert.rejects(
      reconcileMollieRefundsForPayoutPeriod({
        restaurantId: 'restaurant-a',
        periodStart: targetStart,
        periodEnd: targetEnd,
      }, {
        db: {
          order: {
            findMany: async ({ where }: any) => {
              if (where.status) {
                providerPageCall += 1;
                if (providerPageCall === 1) return [original];
                if (providerPageCall === 2) return [];
                if (providerPageCall === 3) return finalRows;
                return [];
              }
              molliePageCall += 1;
              return molliePageCall === 1
                ? [{ id: original.id, molliePaymentId: original.molliePaymentId }]
                : [];
            },
          },
        } as any,
        auditBatch: async (orders) => {
          auditedRefs.push(...orders.map((order) => String(order.molliePaymentId)));
        },
      }),
      (error: any) => error instanceof PayoutProviderAuditStaleError &&
        error.code === 'PAYOUT_PROVIDER_AUDIT_STALE',
    );
    assert.deepEqual(auditedRefs, ['tr_original']);
    assert.equal(molliePageCall, 2);
    assert.equal(providerPageCall, 4);
  }

  // The order was audited under tr_original, then its ref changed before the
  // final proof read. Returning a proof for tr_replaced would be unsafe.
  await expectStaleWhenSweepChangesPayableSet([{
    ...auditedPayableOrder,
    id: 'zzz-original',
    orderNumber: 'ORIGINAL-1',
    molliePaymentId: 'tr_replaced_after_batch',
  }]);

  // A newly payable row whose id sorts behind the first keyset cursor is not
  // visited by that sweep. The fresh final scan must still detect it.
  await expectStaleWhenSweepChangesPayableSet([
    {
      ...auditedPayableOrder,
      id: 'aaa-inserted-behind-cursor',
      orderNumber: 'INSERTED-1',
      molliePaymentId: 'tr_inserted',
    },
    {
      ...auditedPayableOrder,
      id: 'zzz-original',
      orderNumber: 'ORIGINAL-1',
    },
  ]);

  const sources = Array.from({ length: 121 }, (_, index) => ({
    id: `source-${String(index).padStart(3, '0')}`,
    periodStart: new Date(`2025-${String((index % 12) + 1).padStart(2, '0')}-01T00:00:00.000Z`),
    periodEnd: new Date(`2025-${String((index % 12) + 1).padStart(2, '0')}-20T00:00:00.000Z`),
  }));
  const auditedPeriods: Array<{ periodStart: Date; periodEnd: Date }> = [];
  const auditedIds = await reconcileMollieRefundsForPayout({
    restaurantId: 'restaurant-a',
    targetPeriodStart: targetStart,
    targetPeriodEnd: targetEnd,
  }, {
    db: {
      restaurantPayout: {
        findMany: async ({ where, take }: any) => sources
          .filter((source) => !where.id || source.id > where.id.gt)
          .slice(0, take),
      },
    } as any,
    auditPeriod: async ({ periodStart, periodEnd }) => {
      auditedPeriods.push({ periodStart, periodEnd });
      return [`proof-${periodStart.toISOString()}`];
    },
  });

  // One target + every one of 121 historical PAID source periods. Crossing
  // two 50-row page boundaries must neither cap nor skip a source.
  assert.equal(auditedPeriods.length, 122);
  assert.equal(auditedIds.sources.length, 121);
  assert.deepEqual(auditedIds.sources.map((source) => source.payoutId), sources.map((source) => source.id));
  assert.deepEqual(auditedIds.targetFingerprint, [`proof-${targetStart.toISOString()}`]);
  assert.equal(auditedPeriods[0].periodStart, targetStart);
  assert.equal(auditedPeriods.at(-1)?.periodEnd, sources.at(-1)?.periodEnd);

  // The same period-level provider gate is invoked for prior PAID recovery
  // sources, before the function can return an audited source set.
  let periodAuditIndex = 0;
  await assert.rejects(
    reconcileMollieRefundsForPayout({
      restaurantId: 'restaurant-a',
      targetPeriodStart: targetStart,
      targetPeriodEnd: targetEnd,
    }, {
      db: {
        restaurantPayout: {
          findMany: async ({ where }: any) => where.id
            ? []
            : [sources[0]],
        },
      } as any,
      auditPeriod: async () => {
        periodAuditIndex += 1;
        if (periodAuditIndex === 2) {
          throw new PayoutProviderAuditBlockedError(blockedProviders[0]);
        }
        return [];
      },
    }),
    (error: any) => error instanceof PayoutProviderAuditBlockedError &&
      error.code === 'PAYOUT_PROVIDER_AUDIT_BLOCKED',
  );
  assert.equal(periodAuditIndex, 2);

  // If another PAID source appears after PSP audit but before the serializable
  // recovery calculation, the transaction fails closed and must be retried.
  await assert.rejects(
    calculateLateRefundRecoveryPlan({
      restaurantPayout: {
        findMany: async () => [{
          ...sources[0],
          restaurantId: 'restaurant-a',
          status: 'PAID',
          recoveryAsSource: [],
        }],
      },
      order: { findMany: async () => [] },
      payoutRecoveryAllocation: {},
    }, {
      restaurantId: 'restaurant-a',
      targetPeriodStart: targetStart,
      targetCapacityAmount: 10_000,
      auditedSourcePayouts: [],
    }),
    (error: any) => error instanceof PayoutRecoveryError &&
      error.code === 'PAYOUT_SOURCE_REFUND_AUDIT_STALE',
  );

  const sourceSnapshot = {
    ...sources[0],
    restaurantId: 'restaurant-a',
    status: 'PAID',
    payoutAmount: 5_000,
    commissionPctSnapshot: 20,
    feeVatPctSnapshot: 25,
    selfDeliverySnapshot: false,
    subscriptionAmount: 0,
    manualAdjustmentAmount: 0,
    lateRefundAdjustmentAmount: 0,
    recoveryAsSource: [],
  };
  const sourceOrder = {
    ...auditedPayableOrder,
    total: 10_000,
    deliveryFee: 1_000,
    tipAmount: 500,
    refundAmount: null,
  };
  await assert.rejects(
    calculateLateRefundRecoveryPlan({
      restaurantPayout: { findMany: async () => [sourceSnapshot] },
      order: {
        findMany: async () => [{ ...sourceOrder, molliePaymentId: 'tr_raced' }],
      },
      payoutRecoveryAllocation: {},
    }, {
      restaurantId: 'restaurant-a',
      targetPeriodStart: targetStart,
      targetCapacityAmount: 10_000,
      auditedSourcePayouts: [{
        payoutId: sourceSnapshot.id,
        fingerprint: buildPayoutProviderAuditFingerprint([sourceOrder]),
      }],
    }),
    (error: any) => error instanceof PayoutProviderAuditStaleError &&
      error.code === 'PAYOUT_PROVIDER_AUDIT_STALE',
  );

  const fullyRefundedSourceOrder = {
    ...sourceOrder,
    paymentStatus: 'REFUNDED',
    refundAmount: sourceOrder.total,
    updatedAt: new Date('2026-08-02T12:00:00.000Z'),
  };
  const exactLateFeePlan = await calculateLateRefundRecoveryPlan({
    restaurantPayout: {
      findMany: async () => [{
        ...sourceSnapshot,
        payoutAmount: 6_075,
        mollieFeeAmount: 300,
      }],
    },
    order: { findMany: async () => [fullyRefundedSourceOrder] },
    payoutRecoveryAllocation: {},
  }, {
    restaurantId: 'restaurant-a',
    targetPeriodStart: targetStart,
    targetCapacityAmount: 10_000,
    auditedSourcePayouts: [{
      payoutId: sourceSnapshot.id,
      fingerprint: buildPayoutProviderAuditFingerprint([fullyRefundedSourceOrder]),
      financeFingerprint: buildPayoutFinanceFingerprint([fullyRefundedSourceOrder]),
      mollieFeeAmount: 500,
    }],
  });
  assert.equal(exactLateFeePlan.sources[0].requiredRecoveryAmount, 6_575);
  assert.equal(exactLateFeePlan.totalAmount, 6_575);

  let previewFeeResolverCalls = 0;
  const previewLateFeePlan = await calculateLateRefundRecoveryPlan({
    restaurantPayout: {
      findMany: async () => [{
        ...sourceSnapshot,
        payoutAmount: 6_075,
        mollieFeeAmount: 300,
      }],
    },
    order: { findMany: async () => [fullyRefundedSourceOrder] },
    payoutRecoveryAllocation: {},
  }, {
    restaurantId: 'restaurant-a',
    targetPeriodStart: targetStart,
    targetCapacityAmount: 10_000,
    resolveSourceMollieFeeAmount: async ({ source, orders }) => {
      previewFeeResolverCalls += 1;
      assert.equal(source.id, sourceSnapshot.id);
      assert.deepEqual(orders, [fullyRefundedSourceOrder]);
      return 500;
    },
  });
  assert.equal(previewFeeResolverCalls, 1);
  assert.equal(previewLateFeePlan.sources[0].requiredRecoveryAmount, 6_575);
  assert.equal(previewLateFeePlan.totalAmount, 6_575);
}

void runPayoutSourceAuditContracts()
  .then(() => {
    console.log('finance payout eligibility, source audit + cumulative refund contracts: ok');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
