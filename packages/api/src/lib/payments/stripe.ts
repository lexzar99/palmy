/**
 * Stripe provider.
 *
 * Normal web/native checkout uses one PaymentIntent that is bound to the order
 * before its client secret is returned. A trusted partner iframe can explicitly
 * request hosted Checkout; historical cs_ references remain readable,
 * cancellable and refundable.
 */
import { createHash } from 'crypto';
import Stripe from 'stripe';
import type {
  CreatePaymentArgs,
  CreatePaymentResult,
  OrderForPayment,
  PaymentProvider,
  RemotePaymentState,
  RemotePaymentStatus,
  RemoteRefundState,
  RemoteRefundStatus,
  StripeCheckoutMethod,
} from './types';

const CURRENCY = 'sek';
const API_VERSION: Stripe.StripeConfig['apiVersion'] = '2025-02-24.acacia';
export const STRIPE_CHECKOUT_METHODS: readonly StripeCheckoutMethod[] = [
  'klarna',
  'apple_pay',
  'google_pay',
  'card',
];

let client: Stripe | null = null;
function stripe(): Stripe {
  if (!client) {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) throw new Error('STRIPE_SECRET_KEY saknas');
    client = new Stripe(apiKey, { apiVersion: API_VERSION });
  }
  return client;
}

function stripePublishableKey(): string {
  const key = String(process.env.STRIPE_PUBLISHABLE_KEY || '').trim();
  if (!key) throw new Error('STRIPE_PUBLISHABLE_KEY saknas');
  return key;
}

export function parseStripeCheckoutMethod(value: unknown): StripeCheckoutMethod | null {
  const normalized = String(value || '').trim().toLowerCase();
  return STRIPE_CHECKOUT_METHODS.includes(normalized as StripeCheckoutMethod)
    ? normalized as StripeCheckoutMethod
    : null;
}

/** Apple Pay and Google Pay are card wallets in Stripe's API. */
export function stripePaymentMethodType(method: StripeCheckoutMethod): 'card' | 'klarna' {
  return method === 'klarna' ? 'klarna' : 'card';
}

function assertRequestedPaymentMethodEnabled(method: StripeCheckoutMethod): void {
  const allowed = configuredPaymentMethodTypes();
  const apiMethod = stripePaymentMethodType(method);
  if (allowed && !allowed.includes(apiMethod)) {
    throw new Error(`Stripe-betalmetoden ${method} är inte aktiverad av STRIPE_PAYMENT_METHOD_TYPES`);
  }
}

export function stripePaymentIntentState(status: Stripe.PaymentIntent.Status): RemotePaymentState {
  if (status === 'succeeded') return 'paid';
  if (status === 'canceled') return 'canceled';
  if (status === 'processing' || status === 'requires_capture') return 'pending';
  // A decline returns to requires_payment_method and is explicitly retryable.
  return 'open';
}

export function stripeRefundState(status: string | null | undefined): RemoteRefundState {
  if (status === 'succeeded') return 'refunded';
  if (status === 'failed') return 'failed';
  if (status === 'canceled') return 'canceled';
  if (status === 'pending' || status === 'requires_action') return 'pending';
  return 'unknown';
}

function configuredPaymentMethodTypes(): Stripe.Checkout.SessionCreateParams.PaymentMethodType[] | undefined {
  const raw = process.env.STRIPE_PAYMENT_METHOD_TYPES;
  if (!raw?.trim()) return undefined;
  const values = raw.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  return values.length
    ? values as Stripe.Checkout.SessionCreateParams.PaymentMethodType[]
    : undefined;
}

function appendQuery(url: string, key: string, value: string): string {
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}${encodeURIComponent(key)}=${value}`;
}

function safeName(value: string | null | undefined, fallback: string): string {
  const trimmed = String(value || '').trim();
  return trimmed.length > 0 ? trimmed.slice(0, 240) : fallback;
}

function buildLineItems(order: OrderForPayment): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const rawItemSum = order.items.reduce((sum, item) => sum + item.subtotal, 0) +
    order.deliveryFee + order.tipAmount;
  if (
    order.discountAmount > 0 ||
    rawItemSum !== order.total ||
    order.items.some((item) => item.subtotal <= 0)
  ) {
    return [{
      quantity: 1,
      price_data: {
        currency: CURRENCY,
        unit_amount: order.total,
        product_data: { name: safeName(order.restaurantName, 'Beställning') },
      },
    }];
  }

  const items: Stripe.Checkout.SessionCreateParams.LineItem[] = order.items.map((item) => ({
    quantity: 1,
    price_data: {
      currency: CURRENCY,
      unit_amount: item.subtotal,
      product_data: {
        name: safeName(item.quantity > 1 ? `${item.productName} x${item.quantity}` : item.productName, 'Artikel'),
      },
    },
  }));
  if (order.deliveryFee > 0) {
    items.push({
      quantity: 1,
      price_data: { currency: CURRENCY, unit_amount: order.deliveryFee, product_data: { name: 'Leverans' } },
    });
  }
  if (order.tipAmount > 0) {
    items.push({
      quantity: 1,
      price_data: { currency: CURRENCY, unit_amount: order.tipAmount, product_data: { name: 'Dricks' } },
    });
  }
  return items;
}

function metadataFor(
  order: OrderForPayment,
  channel?: 'Web' | 'iOS' | 'Android',
  checkoutMethod?: StripeCheckoutMethod,
): Stripe.MetadataParam {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    viaeatsUserId: order.userId || '',
    restaurantName: order.restaurantName || '',
    ...(channel ? { viaeatsChannel: channel } : {}),
    ...(checkoutMethod ? { viaeatsCheckoutMethod: checkoutMethod } : {}),
  };
}

function assertPaymentIntentBinding(intent: Stripe.PaymentIntent, order: OrderForPayment): void {
  if (
    (process.env.NODE_ENV === 'production' && !intent.livemode) ||
    intent.metadata?.orderId !== order.id ||
    intent.metadata?.orderNumber !== order.orderNumber ||
    intent.amount !== order.total ||
    intent.currency.toLowerCase() !== CURRENCY
  ) {
    throw new Error('Stripe PaymentIntent matchar inte den frysta orderbindningen');
  }
}

function assertCheckoutSessionBinding(session: Stripe.Checkout.Session, order: OrderForPayment): void {
  if (
    (process.env.NODE_ENV === 'production' && !session.livemode) ||
    session.metadata?.orderId !== order.id ||
    session.metadata?.orderNumber !== order.orderNumber ||
    session.client_reference_id !== order.id ||
    (session.amount_total != null && session.amount_total !== order.total) ||
    (session.currency && session.currency.toLowerCase() !== CURRENCY)
  ) {
    throw new Error('Stripe Checkout Session matchar inte den frysta orderbindningen');
  }
}

function isPaymentMethodConfigurationError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('payment method type') || message.includes('payment_method_types');
}

function stableOperationKey(operation: string, reference: string): string {
  const digest = createHash('sha256').update(`viaeats-stripe-${operation}\0${reference}`, 'utf8').digest('hex');
  return `ve-${operation}-${digest.slice(0, 48)}`;
}

async function listStripeRefunds(paymentIntentId: string): Promise<RemoteRefundStatus[]> {
  const refunds: RemoteRefundStatus[] = [];
  for await (const refund of stripe().refunds.list({ payment_intent: paymentIntentId, limit: 100 })) {
    refunds.push({
      refundRef: refund.id,
      state: stripeRefundState(refund.status),
      amountOre: refund.amount,
      createdAt: new Date(refund.created * 1_000),
    });
  }
  refunds.sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return aTime - bTime || a.refundRef.localeCompare(b.refundRef);
  });
  let cumulative = 0;
  return refunds.map((refund) => {
    if (refund.state === 'refunded') cumulative += refund.amountOre;
    return { ...refund, cumulativeAmountOre: cumulative };
  });
}

async function remoteStatusFromIntent(intent: Stripe.PaymentIntent): Promise<RemotePaymentStatus> {
  const state = stripePaymentIntentState(intent.status);
  const refunds = state === 'paid' ? await listStripeRefunds(intent.id) : [];
  const amountRefundedOre = refunds
    .filter((refund) => refund.state === 'refunded')
    .reduce((sum, refund) => sum + refund.amountOre, 0);
  const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge as Stripe.Charge : null;
  const details: any = charge?.payment_method_details;
  const method = details?.card?.wallet?.type || details?.type || null;
  return {
    state,
    amountReceivedOre: state === 'paid' ? (intent.amount_received ?? intent.amount) : undefined,
    amountRefundedOre,
    refunds,
    paymentIntentId: intent.id,
    method,
  };
}

async function retrievePaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
  const intent = await stripe().paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
  if (process.env.NODE_ENV === 'production' && !intent.livemode) {
    throw new Error('Stripe returnerade ett testläge-objekt i produktion');
  }
  return intent;
}

function sessionState(session: Stripe.Checkout.Session): RemotePaymentState {
  if (session.payment_status === 'paid') return 'paid';
  if (session.status === 'expired') return 'expired';
  if (session.status === 'open') return 'open';
  return 'pending';
}

export async function retrieveStripeCheckoutStatus(paymentRef: string): Promise<RemotePaymentStatus> {
  if (paymentRef.startsWith('pi_')) {
    return remoteStatusFromIntent(await retrievePaymentIntent(paymentRef));
  }
  if (!paymentRef.startsWith('cs_')) throw new Error('Ogiltig Stripe-betalningsreferens');

  const session = await stripe().checkout.sessions.retrieve(paymentRef, { expand: ['payment_intent'] });
  if (process.env.NODE_ENV === 'production' && !session.livemode) {
    throw new Error('Stripe returnerade en testläge-session i produktion');
  }
  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id;
  if (!paymentIntentId) return { state: sessionState(session) };

  const remote = await remoteStatusFromIntent(await retrievePaymentIntent(paymentIntentId));
  const { paymentIntentId: _canonicalIntentId, ...sessionBoundRemote } = remote;
  return {
    ...sessionBoundRemote,
    state: sessionState(session),
    amountReceivedOre: session.payment_status === 'paid'
      ? (remote.amountReceivedOre ?? session.amount_total ?? undefined)
      : undefined,
  };
}

export function constructStripeWebhookEvent(body: Buffer, signature: string | undefined): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    throw new Error('STRIPE_WEBHOOK_SECRET saknas eller är ogiltig');
  }
  return stripe().webhooks.constructEvent(body, signature || '', secret);
}

export async function resolveStripePaymentIntentId(paymentRef: string): Promise<string> {
  if (paymentRef.startsWith('pi_')) return paymentRef;
  if (!paymentRef.startsWith('cs_')) throw new Error('Ogiltig Stripe-betalningsreferens');
  const session = await stripe().checkout.sessions.retrieve(paymentRef);
  if (process.env.NODE_ENV === 'production' && !session.livemode) {
    throw new Error('Stripe returnerade en testläge-session i produktion');
  }
  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id;
  if (!paymentIntentId) throw new Error('Stripe-betalningen saknar PaymentIntent');
  return paymentIntentId;
}

/**
 * Resolve the hosted Checkout Session that owns a canonical PaymentIntent.
 * Refund and Charge webhook objects can omit the order metadata and expose
 * only `pi_`, while ViaEats intentionally stores the `cs_` session binding.
 */
export async function resolveStripeCheckoutSessionRef(
  paymentIntentId: string,
): Promise<string | null> {
  if (!paymentIntentId.startsWith('pi_')) {
    throw new Error('Ogiltig Stripe PaymentIntent-referens');
  }
  const sessions = await stripe().checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 2,
  });
  if (sessions.data.some((session) => process.env.NODE_ENV === 'production' && !session.livemode)) {
    throw new Error('Stripe returnerade en testläge-session i produktion');
  }
  if (sessions.data.length > 1) {
    throw new Error('Flera Stripe Checkout-sessioner delar samma PaymentIntent');
  }
  return sessions.data[0]?.id || null;
}

/** Server-side proof used by webhooks before any local order mutation. */
export async function assertStripePaymentReferenceBinding(
  paymentRef: string,
  expected: { id: string; orderNumber: string; total: number },
): Promise<{ paymentIntentId: string }> {
  if (paymentRef.startsWith('pi_')) {
    const intent = await retrievePaymentIntent(paymentRef);
    if (
      intent.metadata?.orderId !== expected.id ||
      intent.metadata?.orderNumber !== expected.orderNumber ||
      intent.amount !== expected.total ||
      intent.currency.toLowerCase() !== CURRENCY
    ) {
      throw new Error('Stripe PaymentIntent saknar exakt orderbindning');
    }
    return { paymentIntentId: intent.id };
  }
  if (!paymentRef.startsWith('cs_')) throw new Error('Ogiltig Stripe-betalningsreferens');
  const session = await stripe().checkout.sessions.retrieve(paymentRef);
  if (
    (process.env.NODE_ENV === 'production' && !session.livemode) ||
    session.metadata?.orderId !== expected.id ||
    session.metadata?.orderNumber !== expected.orderNumber ||
    session.client_reference_id !== expected.id ||
    (session.amount_total != null && session.amount_total !== expected.total) ||
    (session.currency && session.currency.toLowerCase() !== CURRENCY)
  ) {
    throw new Error('Stripe Checkout Session saknar exakt orderbindning');
  }
  return { paymentIntentId: await resolveStripePaymentIntentId(paymentRef) };
}

async function createInlinePaymentIntent(args: CreatePaymentArgs): Promise<CreatePaymentResult> {
  const { order, idempotencyKey } = args;
  const channel = args.channel || 'Web';
  const method = channel === 'Web' ? parseStripeCheckoutMethod(args.checkoutMethod) : null;
  if (channel === 'Web' && !method) throw new Error('Ogiltig eller saknad checkoutMethod för Stripe');
  if (method) assertRequestedPaymentMethodEnabled(method);
  const apiMethod = method ? stripePaymentMethodType(method) : null;
  let intent: Stripe.PaymentIntent;

  if (args.paymentReference) {
    if (!args.paymentReference.startsWith('pi_')) {
      throw new Error('Ordern är redan bunden till Stripe hosted Checkout');
    }
    intent = await retrievePaymentIntent(args.paymentReference);
    assertPaymentIntentBinding(intent, order);
    if (intent.status === 'canceled') throw new Error('Stripe-betalningen är avbruten; skapa en ny order');

    if (method && apiMethod) {
      const methodMatches = intent.payment_method_types.includes(apiMethod);
      const selectionMatches = intent.metadata?.viaeatsCheckoutMethod === method;
      if (!methodMatches || !selectionMatches) {
        if (intent.status !== 'requires_payment_method') {
          throw new Error('Stripe-betalmetoden kan inte bytas medan betalningen behandlas');
        }
        intent = await stripe().paymentIntents.update(
          intent.id,
          {
            payment_method_types: [apiMethod],
            metadata: metadataFor(order, channel, method),
          },
          { idempotencyKey: `${idempotencyKey}-${apiMethod}-${method}` },
        );
        assertPaymentIntentBinding(intent, order);
      }
    }
  } else {
    const metadata = metadataFor(order, channel, method || undefined);
    intent = await stripe().paymentIntents.create(
      {
        amount: order.total,
        currency: CURRENCY,
        metadata,
        description: `${order.orderNumber}${order.restaurantName ? ` - ${order.restaurantName}` : ''}`,
        receipt_email: order.customerEmail || undefined,
        ...(apiMethod
          ? { payment_method_types: [apiMethod] }
          : { automatic_payment_methods: { enabled: true, allow_redirects: 'never' } }),
      },
      { idempotencyKey },
    );
    assertPaymentIntentBinding(intent, order);
  }

  if (!intent.client_secret) throw new Error('Stripe PaymentIntent saknade client_secret');
  return {
    paymentRef: intent.id,
    clientSecret: intent.client_secret,
    publishableKey: stripePublishableKey(),
  };
}

async function createHostedCheckoutSession(args: CreatePaymentArgs): Promise<CreatePaymentResult> {
  const { order, returnUrl, idempotencyKey } = args;
  const method = parseStripeCheckoutMethod(args.checkoutMethod);
  // Utan explicit metod visar hosted Checkout hela den konfigurerade
  // uppsättningen (card + klarna) i EN session; Apple Pay/Google Pay följer
  // automatiskt med card på Stripes egen, alltid domänverifierade, sida.
  if (method) assertRequestedPaymentMethodEnabled(method);

  if (args.paymentReference) {
    if (!args.paymentReference.startsWith('cs_')) {
      throw new Error('Ordern är redan bunden till en inline Stripe-betalning');
    }
    const existing = await stripe().checkout.sessions.retrieve(args.paymentReference);
    assertCheckoutSessionBinding(existing, order);
    if (
      method &&
      existing.metadata?.viaeatsCheckoutMethod &&
      existing.metadata.viaeatsCheckoutMethod !== method
    ) {
      throw new Error('Stripe Checkout-sessionen är bunden till ett annat betalsätt');
    }
    if (existing.status === 'expired') throw new Error('Stripe Checkout-sessionen har gått ut; skapa en ny order');
    if (!existing.url) throw new Error('Stripe Checkout saknade redirect-URL');
    return { paymentRef: existing.id, checkoutUrl: existing.url };
  }

  const methodTypes: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] = method
    ? [stripePaymentMethodType(method)]
    : (configuredPaymentMethodTypes() ?? ['card', 'klarna']);
  const metadata = metadataFor(order, 'Web', method || undefined);
  const baseParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    locale: 'sv',
    client_reference_id: order.id,
    customer_email: order.customerEmail || undefined,
    billing_address_collection: 'auto',
    line_items: buildLineItems(order),
    success_url: appendQuery(returnUrl, 'stripe_session_id', '{CHECKOUT_SESSION_ID}'),
    cancel_url: appendQuery(returnUrl, 'payment_cancelled', '1'),
    metadata,
    payment_intent_data: {
      metadata,
      description: `${order.orderNumber}${order.restaurantName ? ` - ${order.restaurantName}` : ''}`,
      receipt_email: order.customerEmail || undefined,
    },
    payment_method_types: methodTypes,
  };

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe().checkout.sessions.create(baseParams, { idempotencyKey });
  } catch (error: any) {
    // Only old deployments without an explicit customer choice may use the
    // Dashboard fallback. A selected method must fail closed, never silently
    // turn into another method.
    if (method || process.env.STRIPE_STRICT_PAYMENT_METHODS === 'true' || !isPaymentMethodConfigurationError(error)) {
      throw error;
    }
    session = await stripe().checkout.sessions.create(
      { ...baseParams, payment_method_types: undefined },
      { idempotencyKey: `${idempotencyKey}-dynamic` },
    );
  }
  if (!session.url) throw new Error('Stripe Checkout saknade redirect-URL');
  return { paymentRef: session.id, checkoutUrl: session.url };
}

export const stripeProvider: PaymentProvider = {
  name: 'stripe',

  async createPayment(args: CreatePaymentArgs): Promise<CreatePaymentResult> {
    const channel = args.channel || 'Web';
    if (channel === 'Web') {
      if (args.checkoutExperience === 'hosted') return createHostedCheckoutSession(args);
      if (args.checkoutExperience !== 'embedded') {
        throw new Error('checkoutExperience måste vara embedded eller hosted för Stripe Web');
      }
    }
    return createInlinePaymentIntent(args);
  },

  async getRemoteStatus(paymentRef: string): Promise<RemotePaymentStatus> {
    return retrieveStripeCheckoutStatus(paymentRef);
  },

  async cancelPayment(paymentRef: string): Promise<RemotePaymentStatus> {
    const idempotencyKey = stableOperationKey('cancel', paymentRef);
    if (paymentRef.startsWith('cs_')) {
      let session = await stripe().checkout.sessions.retrieve(paymentRef);
      if (session.payment_status === 'paid' || session.status === 'expired') {
        return retrieveStripeCheckoutStatus(paymentRef);
      }
      if (session.status === 'open') {
        session = await stripe().checkout.sessions.expire(paymentRef, {}, { idempotencyKey });
      }
      return retrieveStripeCheckoutStatus(session.id);
    }
    if (!paymentRef.startsWith('pi_')) throw new Error('Ogiltig Stripe-betalningsreferens');

    let intent = await retrievePaymentIntent(paymentRef);
    if (intent.status === 'succeeded' || intent.status === 'canceled') {
      return remoteStatusFromIntent(intent);
    }
    if (!['requires_payment_method', 'requires_confirmation', 'requires_action', 'requires_capture'].includes(intent.status)) {
      return remoteStatusFromIntent(intent);
    }
    intent = await stripe().paymentIntents.cancel(paymentRef, {}, { idempotencyKey });
    return remoteStatusFromIntent(intent);
  },

  async refund(paymentRef: string, amountOre?: number, idempotencyKey?: string) {
    const paymentIntentId = await resolveStripePaymentIntentId(paymentRef);
    const intent = await retrievePaymentIntent(paymentIntentId);
    const refund = await stripe().refunds.create(
      {
        payment_intent: paymentIntentId,
        ...(amountOre != null ? { amount: amountOre } : {}),
        metadata: {
          orderId: intent.metadata?.orderId || '',
          orderNumber: intent.metadata?.orderNumber || '',
        },
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
    return { refundRef: refund.id, status: stripeRefundState(refund.status) };
  },
};
