import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseStripeCheckoutMethod,
  stripePaymentIntentState,
  stripePaymentMethodType,
  stripeRefundState,
} from '../lib/payments/stripe';
import { cancelPaymentWithCanonicalRetry } from '../lib/payments';
import type { PaymentProvider, RemotePaymentStatus } from '../lib/payments/types';

assert.equal(parseStripeCheckoutMethod('klarna'), 'klarna');
assert.equal(parseStripeCheckoutMethod('APPLE_PAY'), 'apple_pay');
assert.equal(parseStripeCheckoutMethod('google_pay'), 'google_pay');
assert.equal(parseStripeCheckoutMethod('card'), 'card');
assert.equal(parseStripeCheckoutMethod('swish'), null);
assert.equal(stripePaymentMethodType('klarna'), 'klarna');
assert.equal(stripePaymentMethodType('apple_pay'), 'card');
assert.equal(stripePaymentMethodType('google_pay'), 'card');
assert.equal(stripePaymentMethodType('card'), 'card');

assert.equal(stripePaymentIntentState('succeeded'), 'paid');
assert.equal(stripePaymentIntentState('canceled'), 'canceled');
assert.equal(stripePaymentIntentState('processing'), 'pending');
assert.equal(stripePaymentIntentState('requires_payment_method'), 'open');
assert.equal(stripePaymentIntentState('requires_action'), 'open');
assert.equal(stripeRefundState('succeeded'), 'refunded');
assert.equal(stripeRefundState('pending'), 'pending');
assert.equal(stripeRefundState('requires_action'), 'pending');
assert.equal(stripeRefundState('failed'), 'failed');
assert.equal(stripeRefundState('canceled'), 'canceled');
assert.equal(stripeRefundState(undefined), 'unknown');

const stripeSource = readFileSync(resolve(__dirname, '../lib/payments/stripe.ts'), 'utf8');
const paymentRouteSource = readFileSync(resolve(__dirname, '../routes/paymentsMollie.ts'), 'utf8');
const finalizeSource = readFileSync(resolve(__dirname, '../lib/payments/finalize.ts'), 'utf8');

assert.match(stripeSource, /for await \(const refund of stripe\(\)\.refunds\.list/,
  'Stripe refund status must auto-paginate the complete provider list');
assert.match(stripeSource, /paymentIntentId: _canonicalIntentId, \.\.\.sessionBoundRemote/,
  'historical cs_ status must retain the stored session binding instead of leaking pi_ as finalization ref');
assert.match(stripeSource, /checkout\.sessions\.expire/,
  'hosted Checkout abandonment must expire the remote session');
assert.doesNotMatch(stripeSource, /phone_number_collection/,
  'hosted Checkout must not ask for the phone number already collected by ViaEats');
assert.match(stripeSource, /checkout\.sessions\.list\(\{[\s\S]*payment_intent: paymentIntentId/,
  'hosted refund webhooks must resolve their cs_ binding from the canonical pi_');
assert.match(paymentRouteSource, /resolveStripeCheckoutSessionRef\(binding\.paymentIntentRef\)[\s\S]*stripeOrderByStoredRef\(canonicalSessionRef\)/,
  'metadata-empty refund events must map pi_ back to the stored hosted session');
assert.match(stripeSource, /paymentIntents\.cancel/,
  'inline PaymentIntent abandonment must cancel the remote intent');
assert.match(paymentRouteSource, /paymentReference: provider\.name === 'stripe'[\s\S]*order\.stripePaymentIntentId/,
  'create retries must pass the exact stored Stripe reference back to the provider');
assert.match(paymentRouteSource, /payment_intent\.payment_failed[\s\S]*retryable/,
  'declines must remain retryable and preserve reservations');
assert.match(paymentRouteSource, /\^pk_\(\?:live\|test\)_[\s\S]*stripePublishableKey/,
  'methods endpoint may preload Stripe only with an explicitly publishable pk_ key');
assert.doesNotMatch(paymentRouteSource, /stripeSecretKey[\s\S]*res\.json/,
  'methods endpoint must never expose Stripe secret material');
assert.match(finalizeSource, /stripeRefMatches[\s\S]*order\.stripePaymentIntentId === input\.ref/,
  'Stripe success finalization must require the exact stored reference');

function providerStub(overrides: Partial<PaymentProvider>): PaymentProvider {
  return {
    name: 'stripe',
    createPayment: async () => ({ paymentRef: 'pi_contract' }),
    getRemoteStatus: async () => ({ state: 'open' }),
    refund: async () => ({ refundRef: 're_contract' }),
    ...overrides,
  };
}

async function assertBoundedCanonicalCancel(): Promise<void> {
  let paidReads = 0;
  let paidCancels = 0;
  const paidAfterTransientRead = providerStub({
    getRemoteStatus: async () => {
      paidReads += 1;
      if (paidReads === 1) throw new Error('transient status timeout');
      return { state: 'paid', amountReceivedOre: 1_500 };
    },
    cancelPayment: async () => {
      paidCancels += 1;
      throw new Error('already completed');
    },
  });
  const paid = await cancelPaymentWithCanonicalRetry(paidAfterTransientRead, 'pi_paid', 3);
  assert.equal(paid.state, 'paid', 'canonical PAID must win after transient read/cancel errors');
  assert.equal(paidCancels, 1);
  assert.equal(paidReads, 2);

  let openReads = 0;
  let openCancels = 0;
  const neverTerminal = providerStub({
    getRemoteStatus: async (): Promise<RemotePaymentStatus> => {
      openReads += 1;
      if (openReads % 2 === 0) throw new Error('transient reread timeout');
      return { state: 'open' };
    },
    cancelPayment: async () => {
      openCancels += 1;
      return { state: 'open' };
    },
  });
  const open = await cancelPaymentWithCanonicalRetry(neverTerminal, 'pi_open', 99);
  assert.equal(open.state, 'open', 'non-terminal status must be preserved after bounded retries');
  assert.equal(openCancels, 3, 'cancel attempts must be capped at three');
  assert.equal(openReads, 6, 'each attempt must perform a canonical read and reread');

  let terminalCancels = 0;
  const alreadyPaid = providerStub({
    getRemoteStatus: async () => ({ state: 'paid', amountReceivedOre: 2_000 }),
    cancelPayment: async () => {
      terminalCancels += 1;
      return { state: 'canceled' };
    },
  });
  assert.equal((await cancelPaymentWithCanonicalRetry(alreadyPaid, 'pi_already_paid')).state, 'paid');
  assert.equal(terminalCancels, 0, 'already-paid payments must never be canceled');

  let unreadableCalls = 0;
  const unreadable = providerStub({
    getRemoteStatus: async () => {
      unreadableCalls += 1;
      throw new Error('PSP unavailable');
    },
    cancelPayment: async () => {
      unreadableCalls += 1;
      throw new Error('PSP unavailable');
    },
  });
  await assert.rejects(
    cancelPaymentWithCanonicalRetry(unreadable, 'pi_unknown', 2),
    /PSP unavailable/,
    'unknown state must throw so the order route preserves it as pending',
  );
  assert.equal(unreadableCalls, 6);
}

void assertBoundedCanonicalCancel()
  .then(() => console.log('stripe payment contracts: ok'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
