/**
 * Provider-neutralt betal-API (aktiv provider via env).
 *
 *   POST /api/payments/create           skapa betalning → { checkoutUrl, paymentRef }
 *   POST /api/payments/webhooks/:provider async-notis → finalisera (sanningskälla)
 *   GET  /api/payments/return           app/webb-retur efter hosted checkout
 *   GET  /api/payments/status/:orderId  klient-polling efter redirect-retur
 *
 * Klienten (web + app) öppnar checkoutUrl, returneras via returnUrl, och
 * POLLAR status tills PAID. Klienten flippar ALDRIG order-status själv —
 * bara webhooken/reconcilen (som litar på PSP:n) gör det.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createHash } from 'crypto';
import prisma from '../lib/prisma';
import { authenticateUserOptional } from './auth';
import {
  getPaymentProvider,
  getPaymentProviderByName,
  type OrderForPayment,
} from '../lib/payments';
import { finalizePaymentSuccess, finalizePaymentFailed } from '../lib/payments/finalize';
import type { PaymentProviderName } from '../lib/payments/finalize';
import { verifyAdyenHmac } from '../lib/payments/adyen';
import {
  constructStripeWebhookEvent,
  retrieveStripeCheckoutStatus,
} from '../lib/payments/stripe';
import { getAllowedOrigins } from '../lib/config';
import { getPublicApiBaseUrl } from '../lib/launchReadiness';
import { syncRemoteRefundOutcome } from '../lib/payments/refundPersistence';
import { recordKnownRemoteRefunds } from '../lib/payments/refundLedger';
import { announceFullRefund } from '../lib/payments/refundNotifications';
import {
  ORDER_HTTP_SESSION_HEADER,
  ownsOrderWithActiveRawSecret,
  verifyOrderHttpSession,
} from '../lib/orderAccess';
import { KIOSK_ACCESS_HEADER, validKioskAccessProof } from '../lib/kioskAccess';

const router = Router();

const createLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'För många betalningsförsök. Vänta en stund och försök igen.' },
});

const statusLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'För många statuskontroller. Vänta en stund.' },
});

/** Publik https-webhook-URL, eller undefined i lokal dev (PSP:n når ej localhost). */
function publicWebhookUrl(providerName: string): string | undefined {
  const base = getPublicApiBaseUrl();
  if (!base || !/^https:\/\//i.test(base) || /localhost|127\.0\.0\.1/.test(base)) return undefined;
  if (providerName === 'stripe') return `${base.replace(/\/$/, '')}/api/payments/webhooks/stripe`;
  if (providerName === 'adyen') return `${base.replace(/\/$/, '')}/api/payments/webhooks/adyen`;
  return `${base.replace(/\/$/, '')}/api/payments/webhooks/mollie`;
}

function toOrderForPayment(order: any): OrderForPayment {
  return {
    id: order.id,
    userId: order.userId ?? null,
    orderNumber: order.orderNumber,
    total: order.total,
    deliveryFee: order.deliveryFee,
    discountAmount: order.discountAmount,
    foodDiscountAmount: order.foodDiscountAmount,
    deliveryDiscountAmount: order.deliveryDiscountAmount,
    smallOrderFee: order.smallOrderFee,
    foodVatPercent: order.foodVatPercent,
    deliveryVatPercent: order.deliveryVatPercent,
    tipAmount: order.tipAmount,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    deliveryStreet: order.deliveryStreet,
    deliveryCity: order.deliveryCity,
    deliveryZip: order.deliveryZip,
    items: (order.items || []).map((i: any) => ({
      productName: i.productName,
      quantity: i.quantity,
      subtotal: i.subtotal,
      vatPercent: i.vatPercent,
    })),
    restaurantName: order.restaurant?.name ?? null,
  };
}

function paymentRefForOrder(order: {
  paymentProvider: string | null;
  molliePaymentId: string | null;
  stripePaymentIntentId: string | null;
  adyenSessionId: string | null;
}) {
  if (order.paymentProvider === 'mollie') return order.molliePaymentId;
  if (order.paymentProvider === 'stripe') return order.stripePaymentIntentId;
  if (order.paymentProvider === 'adyen') return order.adyenSessionId;
  return null;
}

function ownsPaymentOrder(
  req: any,
  order: { id: string; userId: string | null; accessToken: string | null; createdAt: Date; restaurant?: { slug?: string | null } | null },
  accessToken: unknown,
): boolean {
  if (req.user?.id && order.userId && req.user.id === order.userId) return true;
  if (verifyOrderHttpSession(req.headers?.[ORDER_HTTP_SESSION_HEADER], order.id)) return true;
  const kioskSlug = validKioskAccessProof(req.headers?.[KIOSK_ACCESS_HEADER]);
  const kioskAllowedRestaurants = new Set(
    String(process.env.KIOSK_RESTAURANT_SLUGS || 'palmyra-pizzeria-lund')
      .split(',')
      .map((slug) => slug.trim())
      .filter(Boolean),
  );
  // Embedded browsers may block the per-order HttpOnly cookie. The kiosk
  // proof is accepted only when it is valid, configured, and bound to the
  // restaurant that owns this order.
  if (
    req.headers?.['x-client-type'] === 'web' &&
    kioskSlug &&
    kioskAllowedRestaurants.has(kioskSlug) &&
    order.restaurant?.slug === kioskSlug
  ) return true;
  return ownsOrderWithActiveRawSecret(order, accessToken);
}

function parseOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * PSP:n får bara skicka kunden tillbaka till våra egna origins. En godtycklig
 * returnUrl skulle annars göra betal-endpointen till en trovärdig open redirect.
 */
function safePaymentReturnUrl(
  raw: unknown,
  channel: 'Web' | 'iOS' | 'Android',
): string | null {
  if (typeof raw !== 'string' || raw.length < 1 || raw.length > 2_048) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.username || parsed.password || parsed.hash) return null;

  const isLocalDev =
    process.env.NODE_ENV !== 'production' &&
    parsed.protocol === 'http:' &&
    ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !isLocalDev) return null;

  const allowedOrigins = new Set(
    [
      ...getAllowedOrigins(),
      getPublicApiBaseUrl(),
      process.env.FRONTEND_URL,
    ]
      .map(parseOrigin)
      .filter((origin): origin is string => Boolean(origin)),
  );
  if (!isLocalDev && !allowedOrigins.has(parsed.origin)) return null;

  // Native-apparna återvänder alltid via den neutrala API-bryggan, som i sin
  // tur öppnar viaeats://. Acceptera inte andra sidor bara för att domänen är vår.
  if (channel !== 'Web') {
    const nativeApiOrigins = new Set([
      'https://api.viaeats.se',
      parseOrigin(getPublicApiBaseUrl()),
    ].filter((origin): origin is string => Boolean(origin)));
    if (
      !nativeApiOrigins.has(parsed.origin) ||
      parsed.pathname !== '/api/payments/return' ||
      parsed.searchParams.get('app') !== 'viaeats'
    ) {
      return null;
    }
  }

  return parsed.toString();
}

function paymentIdempotencyKey(provider: string, orderId: string): string {
  const digest = createHash('sha256')
    .update(`viaeats-payment-v1\0${provider}\0${orderId}`, 'utf8')
    .digest('hex');
  return `ve-pay-${digest.slice(0, 48)}`;
}

function providerForStoredName(name: string | null | undefined) {
  if (name === 'mollie' || name === 'stripe' || name === 'adyen') {
    return getPaymentProviderByName(name as PaymentProviderName);
  }
  return null;
}

// POST /api/payments/create
router.post('/create', createLimiter, authenticateUserOptional, async (req: any, res) => {
  try {
    const { orderId, returnUrl, channel, storePaymentMethod, accessToken } = req.body || {};
    if (!orderId || typeof orderId !== 'string') {
      res.status(400).json({ error: 'orderId krävs' });
      return;
    }
    // Adyen-kanal från klienten: native appen skickar 'iOS'/'Android', webben
    // utelämnar (→ 'Web'). Måste matcha SDK:n annars failar /sessions/setup.
    const adyenChannel: 'Web' | 'iOS' | 'Android' =
      channel === 'iOS' || channel === 'Android' ? channel : 'Web';
    const verifiedReturnUrl = safePaymentReturnUrl(returnUrl, adyenChannel);
    if (!verifiedReturnUrl) {
      res.status(400).json({ error: 'Ogiltig returadress för betalningen' });
      return;
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { restaurant: { select: { name: true, slug: true } }, items: true },
    });
    if (!order) {
      res.status(404).json({ error: 'Order hittades inte' });
      return;
    }
    if (!ownsPaymentOrder(req, order, accessToken)) {
      // Samma svar som för ett okänt id — avslöja inte att ordern finns.
      res.status(404).json({ error: 'Order hittades inte' });
      return;
    }
    if (storePaymentMethod && (!req.user?.id || req.user.id !== order.userId)) {
      res.status(403).json({ error: 'Du måste vara inloggad på orderns konto för att spara kort.' });
      return;
    }
    if (order.paymentStatus === 'PAID') {
      res.json({ alreadyPaid: true, paymentStatus: 'PAID' });
      return;
    }
    if (order.status !== 'AWAITING_PAYMENT') {
      res.status(409).json({ error: 'Ordern väntar inte längre på betalning' });
      return;
    }
    if (['FAILED', 'REFUNDED', 'NEEDS_REVIEW'].includes(order.paymentStatus)) {
      res.status(409).json({ error: 'Betalningsförsöket är avslutat. Starta en ny beställning.' });
      return;
    }
    if (!Number.isFinite(order.total) || order.total < 1) {
      res.status(400).json({ error: 'Ogiltigt belopp på ordern' });
      return;
    }

    const provider = getPaymentProvider();
    const storedRefs = {
      mollie: order.molliePaymentId,
      stripe: order.stripePaymentIntentId,
      adyen: order.adyenSessionId || order.adyenPspReference,
    } as const;
    const foreignProviderRef = Object.entries(storedRefs)
      .some(([name, ref]) => name !== provider.name && Boolean(ref));
    if (order.paymentProvider !== provider.name || foreignProviderRef) {
      res.status(409).json({
        error: 'Ordern är redan bunden till ett annat betalningsförsök. Starta en ny beställning.',
        code: 'PAYMENT_PROVIDER_CONFLICT',
      });
      return;
    }
    const result = await provider.createPayment({
      order: toOrderForPayment(order),
      idempotencyKey: paymentIdempotencyKey(provider.name, order.id),
      returnUrl: verifiedReturnUrl,
      webhookUrl: publicWebhookUrl(provider.name),
      channel: adyenChannel,
      storePaymentMethod: !!storePaymentMethod,
    });

    // Länka PSP-referensen på ordern (provider-specifik kolumn) så webhook/reconcile hittar den.
    const refData =
      provider.name === 'adyen'
        ? { adyenSessionId: result.paymentRef }
        : provider.name === 'mollie'
          ? { molliePaymentId: result.paymentRef }
          : provider.name === 'stripe'
            ? { stripePaymentIntentId: result.paymentRef }
          : {};
    // DB-länkningen är obligatorisk: utan den kan Mollie-webhooken inte hitta
    // ordern. PSP-anropet är idempotent, så ett DB-fel kan tryggt retry:as.
    const linked = await prisma.order.updateMany({
      where: {
        id: order.id,
        status: 'AWAITING_PAYMENT',
        paymentStatus: order.paymentStatus,
        paymentProvider: provider.name,
        molliePaymentId: order.molliePaymentId,
        stripePaymentIntentId: order.stripePaymentIntentId,
        adyenSessionId: order.adyenSessionId,
        adyenPspReference: order.adyenPspReference,
      },
      data: { paymentProvider: provider.name, ...refData },
    });
    if (linked.count !== 1) {
      res.status(409).json({
        error: 'Betalningsbindningen ändrades samtidigt. Ingen ny betalning får startas för ordern.',
        code: 'PAYMENT_BINDING_CHANGED',
      });
      return;
    }

    res.json({
      provider: provider.name,
      paymentRef: result.paymentRef,
      checkoutUrl: result.checkoutUrl, // Hosted providers: redirect-URL
      session: result.session, // Adyen: { id, sessionData } för Drop-in
      clientSecret: result.clientSecret, // Stripe native: PaymentSheet
      publishableKey: result.publishableKey, // Stripe native: PaymentSheet
      total: order.total / 100,
      discountAmount: (order.discountAmount ?? 0) / 100,
    });
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error('[payments/create] error:', msg);
    // Surfacea felmeddelandet under uppsättning (test) så env-/konfig-problem syns
    // direkt i klienten (t.ex. "ADYEN_API_KEY saknas", "Invalid Merchant Account").
    res.status(500).json({
      error: 'Kunde inte initiera betalning',
      ...(process.env.NODE_ENV !== 'production' ? { details: msg } : {}),
    });
  }
});

// POST /api/payments/webhooks/stripe — Stripe Checkout/PaymentIntent events.
router.post('/webhooks/stripe', async (req, res) => {
  let event;
  try {
    event = constructStripeWebhookEvent(req.body, req.headers['stripe-signature'] as string | undefined);
  } catch (err: any) {
    console.error('[stripe webhook] signature/config error:', err?.message || err);
    res.status(400).json({ error: 'Stripe webhook verification failed' });
    return;
  }

  try {
    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const session = event.data.object as any;
      const orderId = session.metadata?.orderId || session.client_reference_id;
      if (orderId && session.id) {
        const remote = await retrieveStripeCheckoutStatus(session.id);
        if (remote.state === 'paid') {
          await finalizePaymentSuccess(orderId, {
            provider: 'stripe',
            ref: remote.paymentIntentId || session.id,
            amountReceivedOre: remote.amountReceivedOre ?? 0,
          });
        }
      }
    } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      const session = event.data.object as any;
      const orderId = session.metadata?.orderId || session.client_reference_id;
      if (orderId) {
        await finalizePaymentFailed(orderId, { provider: 'stripe', ref: session.id, reason: event.type });
      }
    } else if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object as any;
      const orderId = intent.metadata?.orderId;
      if (orderId) {
        await finalizePaymentSuccess(orderId, {
          provider: 'stripe',
          ref: intent.id,
          amountReceivedOre: intent.amount_received ?? intent.amount ?? 0,
        });
      }
    } else if (event.type === 'payment_intent.payment_failed' || event.type === 'payment_intent.canceled') {
      const intent = event.data.object as any;
      const orderId = intent.metadata?.orderId;
      if (orderId) {
        await finalizePaymentFailed(orderId, { provider: 'stripe', ref: intent.id, reason: event.type });
      }
    } else if (event.type === 'charge.refunded') {
      const charge = event.data.object as any;
      const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
      if (intentId) {
        const refundedOre = Number(charge.amount_refunded ?? 0);
        const chargedOre = Number(charge.amount ?? 0);
        const order = await prisma.order.findFirst({
          where: { stripePaymentIntentId: intentId },
          select: { id: true },
        });
        if (order) {
          const sync = await syncRemoteRefundOutcome({
            orderId: order.id,
            paymentRef: intentId,
            paidAmountOre: chargedOre,
            cumulativeRefundOre: refundedOre,
            provider: 'stripe',
            source: 'WEBHOOK',
            refunds: charge.refunds?.data?.map((refund: any) => ({
              refundRef: String(refund.id),
              state: refund.status === 'succeeded'
                ? 'refunded' as const
                : refund.status === 'pending'
                  ? 'pending' as const
                  : refund.status === 'failed'
                    ? 'failed' as const
                    : 'unknown' as const,
              amountOre: Number(refund.amount || 0),
              createdAt: refund.created ? new Date(refund.created * 1000) : null,
            })),
          });
          if (sync.changed && sync.fullRefund) {
            await announceFullRefund(
              order.id,
              sync.restaurantId,
              sync.orderStatus === 'REJECTED' ? 'REJECTED' : 'CANCELLED',
            );
          }
        }
      }
    }
  } catch (err: any) {
    console.error('[stripe webhook] handler error:', err?.message || err);
    // Stripe retry:ar 5xx. Att svara 200 här skulle permanent tappa eventet
    // vid ett tillfälligt databas- eller nätverksfel.
    res.status(500).json({ error: 'Webhook kunde inte behandlas' });
    return;
  }

  res.status(200).json({ received: true });
});

// Pensionerad klientfinalisering. Adyens webhook finns kvar för att stämma av
// historiska betalningar, men en klient får aldrig använda ett sessionResult
// för att göra en ny order betald. Launch-checkout är Mollie-only.
router.post('/adyen/verify', (_req, res) => {
  res.status(410).json({
    error: 'Adyen-klientverifiering är avstängd. Starta en ny Mollie-betalning.',
    code: 'LEGACY_PAYMENT_VERIFICATION_DISABLED',
  });
});

// POST /api/payments/webhooks/mollie — Mollie POSTar { id } form-encoded.
router.post('/webhooks/mollie', async (req, res) => {
  const paymentId = typeof req.body?.id === 'string' ? req.body.id : null;
  if (!paymentId) {
    res.status(400).json({ error: 'payment id saknas' });
    return;
  }
  try {
    const order = await prisma.order.findFirst({
      where: { molliePaymentId: paymentId },
      select: { id: true },
    });
    if (order) {
      const provider = getPaymentProviderByName('mollie');
      const status = await provider.getRemoteStatus(paymentId);
      if (status.state === 'paid') {
        await finalizePaymentSuccess(order.id, { provider: provider.name, ref: paymentId, amountReceivedOre: status.amountReceivedOre ?? 0 });
      } else if (status.state === 'failed' || status.state === 'canceled' || status.state === 'expired') {
        await finalizePaymentFailed(order.id, { provider: provider.name, ref: paymentId, reason: status.state });
      }
      if ((status.amountRefundedOre ?? 0) > 0 || (status.refunds?.length ?? 0) > 0) {
        const sync = await syncRemoteRefundOutcome({
          orderId: order.id,
          paymentRef: paymentId,
          paidAmountOre: status.amountReceivedOre ?? 0,
          cumulativeRefundOre: status.amountRefundedOre ?? 0,
          provider: 'mollie',
          source: 'WEBHOOK',
          refunds: status.refunds,
        });
        if (sync.changed && sync.fullRefund) {
          await announceFullRefund(
            order.id,
            sync.restaurantId,
            sync.orderStatus === 'REJECTED' ? 'REJECTED' : 'CANCELLED',
          );
        }
      }
    }
  } catch (err: any) {
    console.error('[payments/webhook mollie] error:', err?.message || err);
    // Låt Mollie retry:a ett verifierat event när vår DB/PSP tillfälligt är nere.
    res.status(500).json({ error: 'Webhook kunde inte behandlas' });
    return;
  }
  res.status(200).json({ received: true });
});

// GET /api/payments/return — Mollie redirectUrl för native/web.
// Vi litar fortfarande bara på PSP-status: om Mollie säger paid finaliserar vi
// direkt här som snabb backup till webhook/reconcile, sedan skickas appen tillbaka
// via URL scheme. Webben får en enkel stäng-sida.
router.get('/return', statusLimiter, async (req, res) => {
  const orderId = typeof req.query.orderId === 'string' ? req.query.orderId.slice(0, 100) : '';
  const app = typeof req.query.app === 'string' ? req.query.app : '';
  let paymentStatus = 'UNKNOWN';

  if (orderId) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, paymentStatus: true, paymentProvider: true, molliePaymentId: true },
      });
      if (order) {
        paymentStatus = order.paymentStatus || paymentStatus;
        const provider = providerForStoredName(order.paymentProvider);
        if (
          provider &&
          order.paymentStatus !== 'PAID' &&
          provider.name === 'mollie' &&
          order.molliePaymentId
        ) {
          const remote = await provider.getRemoteStatus(order.molliePaymentId);
          if (remote.state === 'paid') {
            const finalized = await finalizePaymentSuccess(order.id, {
              provider: provider.name,
              ref: order.molliePaymentId,
              amountReceivedOre: remote.amountReceivedOre ?? 0,
            });
            paymentStatus = finalized.paymentStatus || 'PAID';
          } else if (remote.state === 'failed' || remote.state === 'canceled' || remote.state === 'expired') {
            await finalizePaymentFailed(order.id, { provider: provider.name, ref: order.molliePaymentId, reason: remote.state });
            paymentStatus = 'FAILED';
          } else {
            paymentStatus = order.paymentStatus || 'PENDING';
          }
        }
      }
    } catch (err: any) {
      console.error('[payments/return] error:', err?.message || err);
    }
  }

  const appUrl = `viaeats://payment/return?orderId=${encodeURIComponent(orderId)}&paymentStatus=${encodeURIComponent(paymentStatus)}`;
  if (app === 'viaeats') {
    res.type('html').send(`<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Betalning klar</title>
  <meta http-equiv="refresh" content="0;url=${appUrl}">
  <script>window.location.replace(${JSON.stringify(appUrl)});</script>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px">
  <p>Betalningen kontrolleras. Du kan återgå till appen.</p>
  <p><a href="${appUrl}">Öppna appen</a></p>
</body>
</html>`);
    return;
  }

  res.type('html').send(`<!doctype html>
<html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Betalning klar</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px">
  <p>Betalningen kontrolleras. Du kan stänga fönstret.</p>
</body></html>`);
});

// POST /api/payments/webhooks/adyen — Adyen standard-webhook (HMAC-signerad JSON).
// Sanningskällan för Adyen. Rå body monteras i index.ts före express.json.
router.post('/webhooks/adyen', async (req, res) => {
  let body: any;
  try {
    body = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf8')) : req.body;
  } catch {
    res.status(400).send('invalid json');
    return;
  }
  const items = body?.notificationItems;
  if (!Array.isArray(items)) {
    res.status(400).send('invalid notification');
    return;
  }

  const notifications = items
    .map((wrap: any) => wrap?.NotificationRequestItem)
    .filter(Boolean);
  if (notifications.length !== items.length || notifications.some((item: any) => !verifyAdyenHmac(item))) {
    console.warn('[adyen webhook] ogiltig payload eller HMAC');
    res.status(401).send('invalid hmac');
    return;
  }

  try {
    for (const item of notifications) {
      const isRefundEvent = item.eventCode === 'REFUND' || item.eventCode === 'REFUND_FAILED';
      const originalReference = typeof item.originalReference === 'string' && item.originalReference
        ? item.originalReference
        : null;
      const merchantReference = typeof item.merchantReference === 'string' && item.merchantReference
        ? item.merchantReference
        : null;
      if (isRefundEvent && !originalReference) {
        throw new Error(`Adyen-refund ${String(item.pspReference || '')} saknar originalReference`);
      }
      if (!isRefundEvent && !merchantReference) continue;
      const order = await prisma.order.findFirst({
        where: isRefundEvent
          ? { paymentProvider: 'adyen', adyenPspReference: originalReference! }
          : { paymentProvider: 'adyen', orderNumber: merchantReference! },
        select: { id: true, total: true, refundAmount: true, adyenPspReference: true },
      });
      if (!order) {
        if (isRefundEvent) {
          throw new Error(`Adyen-refund ${String(item.pspReference || '')} kan inte kopplas till en order`);
        }
        continue;
      }
      const success = item.success === 'true' || item.success === true;
      const psp = item.pspReference as string;
      const amountOre = Number(item?.amount?.value ?? 0);
      if (!Number.isSafeInteger(amountOre) || amountOre < 0 || !psp) {
        throw new Error(`Ogiltigt Adyen-event ${String(item.eventCode || '')}`);
      }
      if (item.eventCode === 'AUTHORISATION') {
        if (success) {
          // ref=psp → finalize skriver adyenPspReference (för framtida refund).
          await finalizePaymentSuccess(order.id, { provider: 'adyen', ref: psp, amountReceivedOre: amountOre });
        } else {
          await finalizePaymentFailed(order.id, { provider: 'adyen', ref: psp, reason: 'refused' });
        }
      } else if (item.eventCode === 'CANCELLATION' || item.eventCode === 'EXPIRE') {
        await finalizePaymentFailed(order.id, { provider: 'adyen', ref: psp, reason: String(item.eventCode).toLowerCase() });
      } else if (isRefundEvent) {
        const paymentRef = originalReference || order.adyenPspReference;
        if (!paymentRef) throw new Error(`Adyen-refund ${psp} saknar originalReference`);
        const refundState = item.eventCode === 'REFUND' && success ? 'refunded' as const : 'failed' as const;
        const [knownRefund, completedBefore] = await Promise.all([
          prisma.paymentRefund.findFirst({
            where: { provider: 'adyen', refundRef: psp },
            select: { status: true },
          }),
          prisma.paymentRefund.aggregate({
            where: { orderId: order.id, provider: 'adyen', status: 'REFUNDED' },
            _sum: { amount: true },
          }),
        ]);
        const completedBeforeOre = completedBefore._sum.amount ?? 0;
        const cumulativeRefundOre = refundState === 'refunded' && knownRefund?.status !== 'REFUNDED'
          ? completedBeforeOre + amountOre
          : Math.max(completedBeforeOre, amountOre);
        const refunds = [{
          refundRef: psp,
          state: refundState,
          amountOre,
          cumulativeAmountOre: cumulativeRefundOre,
          createdAt: item.eventDate ? String(item.eventDate) : null,
        }];
        await recordKnownRemoteRefunds({
          orderId: order.id,
          provider: 'adyen',
          paymentRef,
          cumulativeRefundOre,
          refunds,
          source: 'ADYEN_WEBHOOK',
        });
        if (refundState === 'refunded') {
          const completed = await prisma.paymentRefund.aggregate({
            where: { orderId: order.id, provider: 'adyen', status: 'REFUNDED' },
            _sum: { amount: true },
          });
          const sync = await syncRemoteRefundOutcome({
            orderId: order.id,
            paymentRef,
            paidAmountOre: order.total,
            cumulativeRefundOre: completed._sum.amount ?? 0,
            provider: 'adyen',
            source: 'ADYEN_WEBHOOK',
            refunds,
          });
          if (sync.changed && sync.fullRefund) {
            await announceFullRefund(
              order.id,
              sync.restaurantId,
              sync.orderStatus === 'REJECTED' ? 'REJECTED' : 'CANCELLED',
            );
          }
        }
      }
    }
  } catch (e: any) {
    console.error('[adyen webhook] processing error:', e?.message || e);
    // Utan polling-by-pspReference är Adyen-webhooken kritisk. 5xx gör att
    // Adyen skickar om eventet i stället för att vi tappar en betald order.
    res.status(500).send('processing failed');
    return;
  }
  // Adyen kräver EXAKT detta svar, annars retryas webhooken.
  res.status(200).send('[accepted]');
});

// GET /api/payments/status/:orderId — klient pollar efter redirect.
router.get('/status/:orderId', statusLimiter, authenticateUserOptional, async (req: any, res) => {
  let order = await prisma.order.findUnique({
    where: { id: req.params.orderId },
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      paymentProvider: true,
      molliePaymentId: true,
      stripePaymentIntentId: true,
      adyenSessionId: true,
      userId: true,
      accessToken: true,
      createdAt: true,
      restaurant: { select: { slug: true } },
    },
  });
  if (!order) {
    res.status(404).json({ error: 'Order hittades inte' });
    return;
  }
  // URL query strings are routinely retained in browser/CDN history and may
  // never carry the raw order bearer. Web uses its HttpOnly order session;
  // active account ownership is supplied by authenticateUserOptional.
  if (!ownsPaymentOrder(req, order, null)) {
    res.status(404).json({ error: 'Order hittades inte' });
    return;
  }

  const provider = providerForStoredName(order.paymentProvider);
  const ref = paymentRefForOrder(order);
  if (provider && order.paymentStatus !== 'PAID' && ref) {
    try {
      const remote = await provider.getRemoteStatus(ref);
      if (remote.state === 'paid') {
        await finalizePaymentSuccess(order.id, {
          provider: provider.name,
          ref: remote.paymentIntentId || ref,
          amountReceivedOre: remote.amountReceivedOre ?? 0,
        });
      } else if (remote.state === 'failed' || remote.state === 'canceled' || remote.state === 'expired') {
        await finalizePaymentFailed(order.id, { provider: provider.name, ref, reason: remote.state });
      }
      if ((remote.amountRefundedOre ?? 0) > 0 || (remote.refunds?.length ?? 0) > 0) {
        const sync = await syncRemoteRefundOutcome({
          orderId: order.id,
          paymentRef: ref,
          paidAmountOre: remote.amountReceivedOre ?? 0,
          cumulativeRefundOre: remote.amountRefundedOre ?? 0,
          provider: provider.name,
          source: 'PAYMENT_STATUS',
          refunds: remote.refunds,
        });
        if (sync.changed && sync.fullRefund) {
          await announceFullRefund(
            order.id,
            sync.restaurantId,
            sync.orderStatus === 'REJECTED' ? 'REJECTED' : 'CANCELLED',
          );
        }
      }
      order = await prisma.order.findUnique({
        where: { id: req.params.orderId },
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          paymentProvider: true,
          molliePaymentId: true,
          stripePaymentIntentId: true,
          adyenSessionId: true,
          userId: true,
          accessToken: true,
          createdAt: true,
          restaurant: { select: { slug: true } },
        },
      });
    } catch (err: any) {
      console.error('[payments/status] remote status error:', err?.message || err);
    }
  }

  if (!order) {
    res.status(404).json({ error: 'Order hittades inte' });
    return;
  }
  res.json({ status: order.status, paymentStatus: order.paymentStatus });
});

export default router;
