import assert from 'node:assert/strict';
import {
  paymentStatusAfterRefund,
  refundAttemptIdempotencyKey,
  refundLifecycleAction,
  refundRestaurantScope,
  refundIdempotencyKey,
  resolveRefundPayment,
  type RefundPaymentOrder,
} from '../lib/payments/refunds';

function order(overrides: Partial<RefundPaymentOrder> = {}): RefundPaymentOrder {
  return {
    id: 'order-1',
    paymentProvider: 'mollie',
    molliePaymentId: 'tr_123',
    stripePaymentIntentId: null,
    adyenPspReference: null,
    ...overrides,
  };
}

assert.equal(resolveRefundPayment(order())?.provider.name, 'mollie');
assert.equal(resolveRefundPayment(order())?.ref, 'tr_123');

assert.equal(
  resolveRefundPayment(order({
    paymentProvider: null,
    molliePaymentId: null,
    stripePaymentIntentId: 'pi_123',
  }))?.provider.name,
  'stripe',
);

// Äldre tvetydig rad får aldrig refundas mot en gissad PSP.
assert.equal(resolveRefundPayment(order({
  paymentProvider: null,
  stripePaymentIntentId: 'pi_123',
})) , null);

assert.equal(paymentStatusAfterRefund(10_000, 2_500), 'PARTIALLY_REFUNDED');
assert.equal(paymentStatusAfterRefund(10_000, 10_000), 'REFUNDED');
assert.equal(paymentStatusAfterRefund(10_000, 10_001), 'REFUNDED');

const first = refundIdempotencyKey('order-1', 2_500);
assert.equal(first, refundIdempotencyKey('order-1', 2_500));
assert.notEqual(first, refundIdempotencyKey('order-1', 5_000));
assert.match(first, /^ve-ref-[a-f0-9]{48}$/);
assert.equal(refundAttemptIdempotencyKey('order-1', 2_500, 0), first);
assert.equal(refundAttemptIdempotencyKey('order-1', 2_500, 1), `${first}-retry-1`);
assert.equal(refundAttemptIdempotencyKey('order-1', 2_500, 2), `${first}-retry-2`);

assert.deepEqual(refundRestaurantScope({ role: 'SUPER_ADMIN' }), { allowed: true });
assert.deepEqual(
  refundRestaurantScope({ role: 'ADMIN', restaurantId: 'restaurant-a' }),
  { allowed: true, restaurantId: 'restaurant-a' },
);
assert.deepEqual(
  refundRestaurantScope({ role: 'RESTAURANT_ADMIN', restaurantId: 'restaurant-a' }),
  { allowed: true, restaurantId: 'restaurant-a' },
);
assert.deepEqual(refundRestaurantScope({ role: 'ADMIN', restaurantId: null }), { allowed: false });
assert.deepEqual(refundRestaurantScope({ role: 'STAFF', restaurantId: 'restaurant-a' }), { allowed: false });
assert.deepEqual(refundRestaurantScope({ role: 'GLOBAL_VIEWER' }), { allowed: false });

assert.equal(refundLifecycleAction('mollie', 'queued'), 'wait');
assert.equal(refundLifecycleAction('mollie', 'processing'), 'wait');
assert.equal(refundLifecycleAction('mollie', 'refunded'), 'complete');
assert.equal(refundLifecycleAction('mollie', 'failed'), 'release');
assert.equal(refundLifecycleAction('mollie', undefined), 'wait');
assert.equal(refundLifecycleAction('stripe', undefined), 'wait');

function mockRefundWorkflow(refundStatus: any, restaurantId = 'restaurant-a') {
  let current: any = {
    ...order(),
    restaurantId,
    status: 'PENDING',
    paymentStatus: 'PAID',
    refundAmount: null,
    total: 10_000,
  };
  let refundCalls = 0;
  let persistCalls = 0;
  let ledgerRequestCalls = 0;
  let ledgerResponseCalls = 0;
  const provider: any = {
    name: 'mollie',
    getRemoteStatus: async () => ({
      state: 'paid',
      amountReceivedOre: 10_000,
      amountRefundedOre: 0,
      refunds: [],
    }),
    refund: async () => {
      refundCalls += 1;
      return { refundRef: 're_1', status: refundStatus };
    },
  };
  const matches = (where: any) =>
    current &&
    (!where.id || current.id === where.id) &&
    (!where.restaurantId || current.restaurantId === where.restaurantId) &&
    (!where.paymentStatus || current.paymentStatus === where.paymentStatus) &&
    (!where.status || current.status === where.status);
  const db: any = {
    $transaction: async (run: (tx: any) => Promise<any>) => {
      const snapshot = current ? { ...current } : current;
      try {
        return await run(db);
      } catch (error) {
        current = snapshot;
        throw error;
      }
    },
    paymentRefund: {
      count: async () => 0,
    },
    order: {
      findFirst: async ({ where }: any) => matches(where) ? { ...current } : null,
      updateMany: async ({ where, data }: any) => {
        if (!matches(where)) return { count: 0 };
        current = { ...current, ...data };
        return { count: 1 };
      },
    },
  };
  const dependencies: any = {
    prisma: db,
    resolveRefundPayment: () => ({ provider, ref: 'tr_123' }),
    persistRefundOutcome: async (input: any) => {
      persistCalls += 1;
      assert.equal(input.expectedPaymentStatus, 'REFUNDING');
      current = {
        ...current,
        paymentStatus: input.nextPaymentStatus,
        refundAmount: input.cumulativeRefundOre,
      };
      return {
        fullRefund: input.nextPaymentStatus === 'REFUNDED',
        orderStatus: current.status,
        revertedReferrals: 0,
        expiredInviterRewards: 0,
        alreadyUsedInviterRewards: 0,
      };
    },
    syncRemoteRefundOutcome: async () => ({ changed: false, fullRefund: false, restaurantId }),
    recordRefundRequest: async () => {
      ledgerRequestCalls += 1;
      return { id: 'ledger-1', status: 'REQUESTED' };
    },
    recordRefundProviderResponse: async (input: any) => {
      ledgerResponseCalls += 1;
      return { id: 'ledger-1', status: input.status || 'UNKNOWN', refundRef: input.refundRef || null };
    },
    announceFullRefund: async () => undefined,
  };
  return {
    dependencies,
    get current() { return current; },
    get refundCalls() { return refundCalls; },
    get persistCalls() { return persistCalls; },
    get ledgerRequestCalls() { return ledgerRequestCalls; },
    get ledgerResponseCalls() { return ledgerResponseCalls; },
  };
}

async function runAsyncRefundContracts() {
  // Runtime imports keep production-only process guards out of this mock-only
  // contract test even when the caller happens to export NODE_ENV=production.
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET ||= 'refund-contract-test-secret-at-least-32-chars';
  const {
    refundOrderForAdmin,
    RefundWorkflowError,
  } = await import('../lib/payments/refundWorkflow');
  const { syncRemoteRefundOutcome } = await import('../lib/payments/refundPersistence');
  const {
    mergeRefundLedgerStatus,
    normalizeRefundLedgerStatus,
    remoteRefundIdempotencyKey,
    withCumulativeRefundAmounts,
  } = await import('../lib/payments/refundLedger');
  const { collectCompleteMollieRefunds } = await import('../lib/payments/mollie');

  // The paymentRefunds API is consumed to exhaustion: this synthetic stream
  // spans three maximum-size Mollie pages and must not stop at an embed/page
  // cap. Only completed rows contribute to amountRefunded.
  let yieldedRefunds = 0;
  async function* threeMolliePages() {
    for (let page = 0; page < 3; page += 1) {
      const pageSize = page < 2 ? 250 : 20;
      for (let index = 0; index < pageSize; index += 1) {
        yieldedRefunds += 1;
        yield {
          id: `re_${page}_${index}`,
          status: 'refunded',
          amount: { currency: 'SEK', value: '1.00' },
          createdAt: `2026-07-${String(page + 1).padStart(2, '0')}T10:00:00Z`,
        };
      }
    }
  }
  const completeMollieAudit = await collectCompleteMollieRefunds({
    paymentRef: 'tr_paginated',
    amountRefunded: { currency: 'SEK', value: '520.00' },
    refunds: threeMolliePages(),
  });
  assert.equal(yieldedRefunds, 520);
  assert.equal(completeMollieAudit.refunds?.length, 520);
  assert.equal(completeMollieAudit.amountRefundedOre, 52_000);

  // Mollie includes queued/pending money in payment.amountRefunded. It must
  // block a second refund, but it is not locally booked as completed yet.
  const queuedMollieAudit = await collectCompleteMollieRefunds({
    paymentRef: 'tr_queued',
    amountRefunded: { currency: 'SEK', value: '87.00' },
    refunds: [{
      id: 're_queued',
      status: 'queued',
      amount: { currency: 'SEK', value: '87.00' },
    }],
  });
  assert.equal(queuedMollieAudit.amountRefundedOre, 0);
  assert.equal(queuedMollieAudit.refunds?.[0]?.state, 'queued');

  await assert.rejects(
    collectCompleteMollieRefunds({
      paymentRef: 'tr_mismatch',
      amountRefunded: { currency: 'SEK', value: '2.00' },
      refunds: [{
        id: 're_only_detail',
        status: 'refunded',
        amount: { currency: 'SEK', value: '1.00' },
      }],
    }),
    /detaljer 100 öre, totalsumma 200 öre/,
  );

  assert.equal(normalizeRefundLedgerStatus('succeeded'), 'REFUNDED');
  assert.equal(mergeRefundLedgerStatus('REFUNDED', 'pending'), 'REFUNDED');
  assert.equal(mergeRefundLedgerStatus('UNKNOWN', 'processing'), 'PROCESSING');
  assert.equal(mergeRefundLedgerStatus('FAILED', 'pending'), 'FAILED');
  assert.equal(mergeRefundLedgerStatus('PENDING', 'unknown'), 'PENDING');
  assert.equal(mergeRefundLedgerStatus('PENDING', 'queued'), 'QUEUED');
  assert.equal(mergeRefundLedgerStatus('PROCESSING', 'pending'), 'PROCESSING');
  assert.deepEqual(
    withCumulativeRefundAmounts([
      { refundRef: 're_2', state: 'refunded', amountOre: 5_000, createdAt: '2026-07-02T10:00:00Z' },
      { refundRef: 're_1', state: 'refunded', amountOre: 5_000, createdAt: '2026-07-01T10:00:00Z' },
    ]).map((refund) => [refund.refundRef, refund.cumulativeAmountOre]),
    [['re_1', 5_000], ['re_2', 10_000]],
  );
  assert.equal(
    remoteRefundIdempotencyKey('mollie', 'order-1', 're_1'),
    remoteRefundIdempotencyKey('mollie', 'order-1', 're_1'),
  );
  assert.notEqual(
    remoteRefundIdempotencyKey('mollie', 'order-1', 're_1'),
    remoteRefundIdempotencyKey('mollie', 'order-1', 're_2'),
  );

  // Tenant mismatch is hidden as not_found before any PSP call.
  const outOfScope = mockRefundWorkflow('refunded', 'restaurant-b');
  await assert.rejects(
    refundOrderForAdmin('order-1', 'test', { restaurantIdScope: 'restaurant-a' }, outOfScope.dependencies),
    (error: any) => error instanceof RefundWorkflowError && error.code === 'not_found',
  );
  assert.equal(outOfScope.refundCalls, 0);

  // A paginated-detail/aggregate mismatch is rejected before the workflow can
  // write a lock/intent or call Mollie's irreversible refund endpoint.
  const inconsistentMollie = mockRefundWorkflow('refunded');
  const inconsistentProvider = inconsistentMollie.dependencies.resolveRefundPayment().provider;
  inconsistentProvider.getRemoteStatus = async () => {
    await collectCompleteMollieRefunds({
      paymentRef: 'tr_mismatch',
      amountRefunded: { currency: 'SEK', value: '2.00' },
      refunds: [{
        id: 're_only_detail',
        status: 'refunded',
        amount: { currency: 'SEK', value: '1.00' },
      }],
    });
    throw new Error('unreachable');
  };
  await assert.rejects(
    refundOrderForAdmin('order-1', 'mismatch', {}, inconsistentMollie.dependencies),
    /totalsumma 200 öre/,
  );
  assert.equal(inconsistentMollie.current.paymentStatus, 'PAID');
  assert.equal(inconsistentMollie.ledgerRequestCalls, 0);
  assert.equal(inconsistentMollie.refundCalls, 0);

  // Adyen remains accounting-only legacy support. Its incomplete async refund
  // path must fail before any PSP call or DB lock.
  const legacyProvider = mockRefundWorkflow('refunded');
  const mollieMock = legacyProvider.dependencies.resolveRefundPayment().provider;
  legacyProvider.dependencies.resolveRefundPayment = () => ({
    provider: { ...mollieMock, name: 'adyen' },
    ref: 'legacy-psp-reference',
  });
  await assert.rejects(
    refundOrderForAdmin('order-1', 'legacy', {}, legacyProvider.dependencies),
    (error: any) => error instanceof RefundWorkflowError && error.code === 'legacy_provider_refund_disabled',
  );
  assert.equal(legacyProvider.refundCalls, 0);

  // Direkt Swish har en härdad async-livscykel (deterministisk refund-referens
  // + server-till-server-status) och ska därför gå hela vägen igenom.
  const swishProviderMock = mockRefundWorkflow('refunded');
  const swishBase = swishProviderMock.dependencies.resolveRefundPayment().provider;
  swishProviderMock.dependencies.resolveRefundPayment = () => ({
    provider: { ...swishBase, name: 'swish' },
    ref: 'A1B2C3D4E5F60718293A4B5C6D7E8F90',
  });
  const swishOutcome = await refundOrderForAdmin(
    'order-1',
    'swish-refund',
    {},
    swishProviderMock.dependencies,
  );
  assert.equal(swishOutcome.status, 'refunded');
  assert.equal(swishProviderMock.refundCalls, 1);

  // Stripe exposes the same authoritative status/list lifecycle; a succeeded
  // provider response may complete while unknown/pending remains locked.
  const stripeProviderMock = mockRefundWorkflow('refunded');
  const stripeBase = stripeProviderMock.dependencies.resolveRefundPayment().provider;
  stripeProviderMock.dependencies.resolveRefundPayment = () => ({
    provider: { ...stripeBase, name: 'stripe' },
    ref: 'pi_bound_order_1',
  });
  const stripeOutcome = await refundOrderForAdmin(
    'order-1',
    'stripe-refund',
    {},
    stripeProviderMock.dependencies,
  );
  assert.equal(stripeOutcome.status, 'refunded');
  assert.equal(stripeProviderMock.refundCalls, 1);

  // Lock + durable intent share one DB transaction. If the ledger write
  // fails, the payment lock is rolled back before any irreversible PSP call.
  const ledgerUnavailable = mockRefundWorkflow('refunded');
  ledgerUnavailable.dependencies.recordRefundRequest = async () => {
    throw new Error('ledger unavailable');
  };
  await assert.rejects(
    refundOrderForAdmin('order-1', 'ledger-test', {}, ledgerUnavailable.dependencies),
    (error: any) => error instanceof RefundWorkflowError && error.code === 'refund_ledger_unavailable',
  );
  assert.equal(ledgerUnavailable.current.paymentStatus, 'PAID');
  assert.equal(ledgerUnavailable.refundCalls, 0);

  // Accepted async refund claims both status and payment lock. A retry adopts
  // REFUNDING and never calls Mollie a second time.
  const queued = mockRefundWorkflow('queued');
  const queuedResult = await refundOrderForAdmin('order-1', 'nekad', {
    restaurantIdScope: 'restaurant-a',
    terminalStatus: 'REJECTED',
    expectedOrderStatus: 'PENDING',
  }, queued.dependencies);
  assert.equal(queuedResult.status, 'refund_pending');
  assert.equal(queued.current.status, 'REJECTED');
  assert.equal(queued.current.paymentStatus, 'REFUNDING');
  assert.equal(queued.refundCalls, 1);
  assert.equal(queued.persistCalls, 0);
  assert.equal(queued.ledgerRequestCalls, 1);
  assert.equal(queued.ledgerResponseCalls, 1);
  const retryResult = await refundOrderForAdmin('order-1', 'nekad', {
    restaurantIdScope: 'restaurant-a',
    terminalStatus: 'REJECTED',
    expectedOrderStatus: 'REJECTED',
  }, queued.dependencies);
  assert.equal(retryResult.status, 'refund_pending');
  assert.equal(queued.refundCalls, 1);

  // Immediate PSP failure releases both locks, so the order is not stranded
  // in a terminal paid state.
  const failed = mockRefundWorkflow('failed');
  await assert.rejects(
    refundOrderForAdmin('order-1', 'nekad', {
      restaurantIdScope: 'restaurant-a',
      terminalStatus: 'REJECTED',
      expectedOrderStatus: 'PENDING',
    }, failed.dependencies),
    (error: any) => error instanceof RefundWorkflowError && error.code === 'refund_failed',
  );
  assert.equal(failed.current.status, 'PENDING');
  assert.equal(failed.current.paymentStatus, 'PAID');
  assert.equal(failed.ledgerRequestCalls, 1);
  assert.equal(failed.ledgerResponseCalls, 1);

  const completed = mockRefundWorkflow('refunded');
  const completedResult = await refundOrderForAdmin('order-1', 'nekad', {
    restaurantIdScope: 'restaurant-a',
    terminalStatus: 'REJECTED',
    expectedOrderStatus: 'PENDING',
  }, completed.dependencies);
  assert.equal(completedResult.status, 'refunded');
  assert.equal(completed.current.status, 'REJECTED');
  assert.equal(completed.current.paymentStatus, 'REFUNDED');
  assert.equal(completed.persistCalls, 1);
  assert.equal(completed.ledgerRequestCalls, 1);
  assert.equal(completed.ledgerResponseCalls, 1);

  const queuedOrder: any = {
    status: 'REJECTED',
    paymentStatus: 'REFUNDING',
    refundAmount: null,
    restaurantId: 'restaurant-a',
  };
  let persistCalls = 0;
  const queuedSync = await syncRemoteRefundOutcome({
    orderId: 'order-1',
    paymentRef: 'tr_123',
    paidAmountOre: 10_000,
    cumulativeRefundOre: 0,
    provider: 'mollie',
    source: 'REFUND_RECONCILE',
    refunds: [{ refundRef: 're_1', state: 'queued', amountOre: 10_000 }],
  }, {
    prisma: {
      order: {
        findUnique: async () => ({ ...queuedOrder }),
        updateMany: async () => ({ count: 0 }),
      },
    },
    persistRefundOutcome: async () => {
      persistCalls += 1;
      throw new Error('must not persist queued refund');
    },
    recordKnownRemoteRefunds: async () => [],
  });
  assert.equal(queuedSync.pending, true);
  assert.equal(persistCalls, 0);

  let dashboardQueuedStatus: string | null = null;
  const dashboardQueued = await syncRemoteRefundOutcome({
    orderId: 'order-1',
    paymentRef: 'tr_123',
    paidAmountOre: 10_000,
    cumulativeRefundOre: 0,
    provider: 'mollie',
    source: 'PAYOUT_PREFLIGHT',
    refunds: [{ refundRef: 're_dashboard', state: 'processing', amountOre: 2_500 }],
  }, {
    prisma: {
      order: {
        findUnique: async () => ({
          ...queuedOrder,
          paymentStatus: 'PAID',
        }),
        updateMany: async ({ data }: any) => {
          dashboardQueuedStatus = data.paymentStatus;
          return { count: 1 };
        },
      },
    },
    recordKnownRemoteRefunds: async () => [],
  });
  assert.equal(dashboardQueued.pending, true);
  assert.equal(dashboardQueued.changed, true);
  assert.equal(dashboardQueuedStatus, 'REFUNDING');

  let releasedTo: string | null = null;
  let releasedStatus: string | undefined;
  const failedSync = await syncRemoteRefundOutcome({
    orderId: 'order-1',
    paymentRef: 'tr_123',
    paidAmountOre: 10_000,
    cumulativeRefundOre: 0,
    provider: 'mollie',
    source: 'REFUND_RECONCILE',
    refunds: [{ refundRef: 're_1', state: 'failed', amountOre: 10_000 }],
  }, {
    prisma: {
      order: {
        findUnique: async () => ({ ...queuedOrder }),
        updateMany: async ({ data }: any) => {
          releasedTo = data.paymentStatus;
          releasedStatus = data.status;
          return { count: 1 };
        },
      },
    },
    recordKnownRemoteRefunds: async () => [],
  });
  assert.equal(failedSync.released, true);
  assert.equal(releasedTo, 'PAID');
  assert.equal(releasedStatus, undefined);
  assert.equal(failedSync.orderStatus, 'REJECTED');

  let completedInput: any = null;
  const completedSync = await syncRemoteRefundOutcome({
    orderId: 'order-1',
    paymentRef: 'tr_123',
    paidAmountOre: 10_000,
    cumulativeRefundOre: 10_000,
    provider: 'mollie',
    source: 'WEBHOOK',
    refunds: [{ refundRef: 're_1', state: 'refunded', amountOre: 10_000 }],
  }, {
    prisma: {
      order: { findUnique: async () => ({ ...queuedOrder }) },
    },
    persistRefundOutcome: async (input: any) => {
      completedInput = input;
      return {
        fullRefund: true,
        orderStatus: 'REJECTED',
        revertedReferrals: 0,
        expiredInviterRewards: 0,
        alreadyUsedInviterRewards: 0,
      };
    },
    recordKnownRemoteRefunds: async () => [],
  });
  assert.equal(completedSync.changed, true);
  assert.equal(completedSync.fullRefund, true);
  assert.equal(completedSync.orderStatus, 'REJECTED');
  assert.equal(completedInput.expectedPaymentStatus, 'REFUNDING');
  assert.equal(completedInput.nextPaymentStatus, 'REFUNDED');

  console.log('Refund contracts: tenant scope, async lifecycle, recovery and no-double-refund OK');
}

void runAsyncRefundContracts().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
