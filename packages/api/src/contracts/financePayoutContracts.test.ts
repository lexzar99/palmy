import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computePayout, DEFAULT_ECONOMY } from '../lib/financeCalc';
import {
  buildPayoutMoneySnapshot,
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
  requiredLateRefundRecoveryAmount,
  sameRecoveryAllocations,
  samePayoutMoneySnapshot,
  type PayoutOrder,
} from '../lib/payoutPolicy';
import {
  calculateLateRefundRecoveryPlan,
  PayoutRecoveryError,
} from '../lib/payoutRecovery';
import {
  selectFinanceSummaryEconomicValues,
  sumFinanceSummaryRows,
} from '../lib/financeSummary';
import {
  estimateMollieFeeFromObservations,
  estimateNextMolliePayoutDate,
  mollieFeeBreakdownFromTransactions,
  molliePaymentFeesFromTransactions,
} from '../lib/mollieFinance';
import { reconcileFinanceOrders } from '../lib/financeReconciliation';

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
  deliveryFee: 800,
  tipAmount: 400,
});

// A corrupt "partial" row refunded down to zero must fail closed.
assert.equal(netPayoutOrder({ ...paidDelivered, paymentStatus: 'PARTIALLY_REFUNDED', refundAmount: 10_000 }), null);
assert.equal(netPayoutOrder({ ...paidDelivered, paymentStatus: 'PARTIALLY_REFUNDED', refundAmount: 50_000 }), null);
assert.equal(netPayoutOrder({ ...paidDelivered, paymentStatus: 'PARTIALLY_REFUNDED', refundAmount: null }), null);

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
assert.equal(platformPayout.foodBase, 6_800);
assert.equal(platformPayout.restaurantGrossOre, 6_800);
assert.equal(platformPayout.commissionOre, 1_360);
assert.equal(platformPayout.feeVatOre, 340);
assert.equal(platformPayout.foodVatOre, 385);
assert.equal(platformPayout.foodVatPct, 6);
assert.equal(platformPayout.restaurantTipOre, 0);
assert.equal(platformPayout.platformTipOre, 400);
assert.equal(platformPayout.payoutOre, 5_100);

const selfDeliveryPayout = computePayout(
  [partial!],
  { selfDelivery: true, commissionPctOverride: null, featuredClass: 3 },
  DEFAULT_ECONOMY,
);
assert.equal(selfDeliveryPayout.restaurantGrossOre, 8_000);
assert.equal(selfDeliveryPayout.commissionOre, 680);
assert.equal(selfDeliveryPayout.feeVatOre, 170);
assert.equal(selfDeliveryPayout.foodVatOre, 385);
assert.equal(selfDeliveryPayout.foodVatPct, 6);
assert.equal(selfDeliveryPayout.restaurantTipOre, 400);
assert.equal(selfDeliveryPayout.platformTipOre, 0);
assert.equal(selfDeliveryPayout.payoutOre, 7_150);

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
  grossSales: 6_800,
  orderCount: 1,
  commissionAmount: 1_360,
  subscriptionAmount: 0,
  manualAdjustmentAmount: 100,
  lateRefundAdjustmentAmount: 0,
  foodVatAmount: 385,
  platformTipAmount: 400,
  payoutAmount: 5_000,
  mollieFeeAmount: 0,
});
assert.deepEqual(settlement.economicSnapshot, {
  commissionPctSnapshot: 20,
  feeVatPctSnapshot: 25,
  foodVatPctSnapshot: 6,
  selfDeliverySnapshot: false,
  mollieFeeAmount: 0,
});

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
// restaurant settings. The recovery is capped by what was actually paid.
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
    grossSales: 5_100,
    orderCount: 1,
    commissionAmount: 1_020,
    subscriptionAmount: 0,
    manualAdjustmentAmount: 100,
    lateRefundAdjustmentAmount: 0,
    foodVatAmount: 289,
    platformTipAmount: 300,
    payoutAmount: 3_725,
    mollieFeeAmount: 0,
  },
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
}

void runPayoutSourceAuditContracts()
  .then(() => {
    console.log('finance payout eligibility, source audit + cumulative refund contracts: ok');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
