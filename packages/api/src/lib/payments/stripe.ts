/**
 * Stripe-provider via Checkout Sessions.
 *
 * Webben använder hosted Checkout så Stripe får sköta Swish, Klarna, Apple Pay,
 * 3DS, device eligibility och redirect-flöden. Med `STRIPE_PAYMENT_METHOD_TYPES`
 * kan vi kräva en explicit lista (t.ex. card,klarna,swish); utan den används
 * Stripes dynamiska betalmetoder från Dashboard.
 */
import Stripe from 'stripe';
import type {
  CreatePaymentArgs,
  CreatePaymentResult,
  OrderForPayment,
  PaymentProvider,
  RemotePaymentState,
  RemotePaymentStatus,
} from './types';

const CURRENCY = 'sek';
const API_VERSION: Stripe.StripeConfig['apiVersion'] = '2025-02-24.acacia';

let client: Stripe | null = null;
function stripe(): Stripe {
  if (!client) {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) throw new Error('STRIPE_SECRET_KEY saknas');
    client = new Stripe(apiKey, { apiVersion: API_VERSION });
  }
  return client;
}

function configuredPaymentMethodTypes():
  | Stripe.Checkout.SessionCreateParams.PaymentMethodType[]
  | undefined {
  const raw = process.env.STRIPE_PAYMENT_METHOD_TYPES;
  if (!raw?.trim()) return undefined;
  const values = raw
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  return values.length
    ? (values as Stripe.Checkout.SessionCreateParams.PaymentMethodType[])
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
  const rawItemSum =
    order.items.reduce((acc, it) => acc + it.subtotal, 0) +
    order.deliveryFee +
    order.tipAmount;
  if (
    order.discountAmount > 0 ||
    rawItemSum !== order.total ||
    order.items.some((it) => it.subtotal <= 0)
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

  const items: Stripe.Checkout.SessionCreateParams.LineItem[] = order.items.map((it) => ({
    quantity: 1,
    price_data: {
      currency: CURRENCY,
      unit_amount: Math.max(0, it.subtotal),
      product_data: {
        name: safeName(it.quantity > 1 ? `${it.productName} x${it.quantity}` : it.productName, 'Artikel'),
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

  const sum = items.reduce((acc, item) => acc + Number(item.price_data?.unit_amount || 0) * Number(item.quantity || 1), 0);
  const diff = order.total - sum;
  if (diff !== 0) {
    items.push({
      quantity: 1,
      price_data: { currency: CURRENCY, unit_amount: diff, product_data: { name: 'Justering' } },
    });
  }

  return items;
}

function metadataFor(order: OrderForPayment): Stripe.MetadataParam {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    viaeatsUserId: order.userId || '',
    customerPhone: order.customerPhone || '',
    restaurantName: order.restaurantName || '',
  };
}

function isPaymentMethodConfigurationError(err: any): boolean {
  const message = String(err?.message || '').toLowerCase();
  return message.includes('payment method type') || message.includes('payment_method_types');
}

function sessionState(session: Stripe.Checkout.Session): RemotePaymentState {
  if (session.payment_status === 'paid') return 'paid';
  if (session.status === 'expired') return 'expired';
  if (session.payment_status === 'unpaid' && session.status === 'open') return 'open';
  return 'pending';
}

export async function retrieveStripeCheckoutStatus(paymentRef: string): Promise<RemotePaymentStatus> {
  if (paymentRef.startsWith('pi_')) {
    const intent = await stripe().paymentIntents.retrieve(paymentRef);
    if (intent.status === 'succeeded') {
      return {
        state: 'paid',
        amountReceivedOre: intent.amount_received ?? intent.amount,
        paymentIntentId: intent.id,
      };
    }
    if (intent.status === 'canceled' || (intent.status === 'requires_payment_method' && intent.last_payment_error)) {
      return { state: 'failed', paymentIntentId: intent.id };
    }
    return { state: 'pending', paymentIntentId: intent.id };
  }

  const session = await stripe().checkout.sessions.retrieve(paymentRef, {
    expand: ['payment_intent'],
  });
  const paymentIntent = session.payment_intent;
  const intent =
    typeof paymentIntent === 'string'
      ? null
      : paymentIntent;
  const intentId =
    typeof paymentIntent === 'string'
      ? paymentIntent
      : paymentIntent?.id;

  return {
    state: sessionState(session),
    amountReceivedOre: session.payment_status === 'paid'
      ? (intent?.amount_received ?? session.amount_total ?? undefined)
      : undefined,
    paymentIntentId: intentId,
  };
}

export function constructStripeWebhookEvent(body: Buffer, signature: string | undefined): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    throw new Error('STRIPE_WEBHOOK_SECRET saknas eller är ogiltig');
  }
  return stripe().webhooks.constructEvent(body, signature || '', secret);
}

async function resolveRefundPaymentIntent(paymentRef: string): Promise<string> {
  if (paymentRef.startsWith('pi_')) return paymentRef;
  const status = await retrieveStripeCheckoutStatus(paymentRef);
  if (!status.paymentIntentId) throw new Error('Stripe-betalningen saknar PaymentIntent');
  return status.paymentIntentId;
}

/**
 * Native appen (iOS/Android) vill ha en betalning inuti appen (Stripe
 * PaymentSheet), inte en webb-redirect. Vi skapar en PaymentIntent direkt
 * (ingen Checkout Session, ingen `url`) och skickar med `allow_redirects:
 * 'never'` så bara icke-redirect-metoder (kort, Apple Pay) dyker upp i
 * sheeten — appen har ingen webView att fånga en redirect-retur i.
 */
async function createNativePaymentIntent(order: OrderForPayment): Promise<CreatePaymentResult> {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) throw new Error('STRIPE_PUBLISHABLE_KEY saknas');

  const metadata = metadataFor(order);
  const intent = await stripe().paymentIntents.create({
    amount: order.total,
    currency: CURRENCY,
    metadata,
    description: `${order.orderNumber}${order.restaurantName ? ` - ${order.restaurantName}` : ''}`,
    receipt_email: order.customerEmail || undefined,
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
  });

  if (!intent.client_secret) throw new Error('Stripe PaymentIntent saknade client_secret');
  return {
    paymentRef: intent.id,
    clientSecret: intent.client_secret,
    publishableKey,
  };
}

export const stripeProvider: PaymentProvider = {
  name: 'stripe',

  async createPayment({ order, returnUrl, channel }: CreatePaymentArgs): Promise<CreatePaymentResult> {
    if (channel === 'iOS' || channel === 'Android') {
      return createNativePaymentIntent(order);
    }

    const methodTypes = configuredPaymentMethodTypes();
    const metadata = metadataFor(order);
    const baseParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      locale: 'sv',
      client_reference_id: order.id,
      customer_email: order.customerEmail || undefined,
      billing_address_collection: 'auto',
      phone_number_collection: { enabled: true },
      line_items: buildLineItems(order),
      success_url: appendQuery(returnUrl, 'stripe_session_id', '{CHECKOUT_SESSION_ID}'),
      cancel_url: appendQuery(returnUrl, 'payment_cancelled', '1'),
      metadata,
      payment_intent_data: {
        metadata,
        description: `${order.orderNumber}${order.restaurantName ? ` - ${order.restaurantName}` : ''}`,
        receipt_email: order.customerEmail || undefined,
      },
    };

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe().checkout.sessions.create({
        ...baseParams,
        ...(methodTypes
          ? { payment_method_types: methodTypes }
          : {}),
      } as Stripe.Checkout.SessionCreateParams);
    } catch (err: any) {
      const strictMethods = process.env.STRIPE_STRICT_PAYMENT_METHODS === 'true';
      if (!methodTypes || strictMethods || !isPaymentMethodConfigurationError(err)) throw err;
      console.error('[stripe] configured payment methods rejected by Stripe; retrying with dynamic payment methods', {
        configured: methodTypes,
        error: err?.message,
      });
      session = await stripe().checkout.sessions.create({
        ...baseParams,
      } as Stripe.Checkout.SessionCreateParams);
    }

    if (!session.url) throw new Error('Stripe Checkout saknade redirect-URL');
    return { paymentRef: session.id, checkoutUrl: session.url };
  },

  async getRemoteStatus(paymentRef: string): Promise<RemotePaymentStatus> {
    return retrieveStripeCheckoutStatus(paymentRef);
  },

  async refund(paymentRef: string, amountOre?: number): Promise<{ refundRef: string }> {
    const paymentIntent = await resolveRefundPaymentIntent(paymentRef);
    const refund = await stripe().refunds.create({
      payment_intent: paymentIntent,
      ...(amountOre != null ? { amount: amountOre } : {}),
    });
    return { refundRef: refund.id };
  },
};
