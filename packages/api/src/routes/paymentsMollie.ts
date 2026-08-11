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
import { createHash, randomBytes } from 'crypto';
import prisma from '../lib/prisma';
import { authenticateUserOptional } from './auth';
import {
  getCheckoutPaymentProvider,
  configuredCheckoutProviderNames,
  getPaymentProviderByName,
  type OrderForPayment,
} from '../lib/payments';
import { finalizePaymentSuccess, finalizePaymentFailed } from '../lib/payments/finalize';
import type { PaymentProviderName } from '../lib/payments/finalize';
import { verifyAdyenHmac } from '../lib/payments/adyen';
import {
  assertStripePaymentReferenceBinding,
  constructStripeWebhookEvent,
} from '../lib/payments/stripe';
import { getAllowedOrigins } from '../lib/config';
import { getPublicApiBaseUrl } from '../lib/launchReadiness';
import { syncRemoteRefundOutcome } from '../lib/payments/refundPersistence';
import { recordKnownRemoteRefunds } from '../lib/payments/refundLedger';
import { announceFullRefund } from '../lib/payments/refundNotifications';
import {
  ORDER_HTTP_SESSION_HEADER,
  ORDER_NATIVE_SESSION_HEADER,
  issueOrderPaymentResumeProof,
  ownsOrderWithActiveRawSecret,
  verifyOrderHttpSession,
  verifyOrderNativeSession,
} from '../lib/orderAccess';
import { KIOSK_ACCESS_HEADER, validKioskAccessProof } from '../lib/kioskAccess';
import { validateFrozenOrderPricing } from '../lib/checkoutIntegrity';
import { validSwishCallbackIdentifier, swishRefundInstructionId } from '../lib/payments/swish';
import {
  inspectSwishTlsConfiguration,
  swishCallbackSecretIssue,
} from '../lib/payments/swishTls';

const router = Router();

router.get('/methods', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60');
  const providers = configuredCheckoutProviderNames();
  const swishReady = !providers.includes('swish') || (
    inspectSwishTlsConfiguration().ok && !swishCallbackSecretIssue()
  );
  res.json({
    methods: [
      ...(providers.includes('swish') && swishReady ? [{ id: 'swish', label: 'Swish', direct: true }] : []),
      ...(providers.includes('mollie') ? [{ id: 'mollie', label: 'Kort, Klarna och fler', direct: false }] : []),
      ...(providers.includes('stripe') ? [{ id: 'stripe', label: 'Kort och Klarna', direct: false }] : []),
      ...(providers.includes('adyen') ? [{ id: 'adyen', label: 'Kort, Klarna och wallets', direct: false }] : []),
    ],
  });
});

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
  if (providerName === 'swish') return `${base.replace(/\/$/, '')}/api/payments/webhooks/swish`;
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
  swishPaymentId: string | null;
  stripePaymentIntentId: string | null;
  adyenSessionId: string | null;
}) {
  if (order.paymentProvider === 'mollie') return order.molliePaymentId;
  if (order.paymentProvider === 'swish') return order.swishPaymentId;
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
  const clientType = String(req.headers?.['x-client-type'] || '').toLowerCase();
  if (
    (clientType === 'ios' || clientType === 'android') &&
    verifyOrderNativeSession(req.headers?.[ORDER_NATIVE_SESSION_HEADER], order.id)
  ) return true;
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
  if (name === 'mollie' || name === 'stripe' || name === 'adyen' || name === 'swish') {
    return getPaymentProviderByName(name as PaymentProviderName);
  }
  return null;
}

// POST /api/payments/create
router.post('/create', createLimiter, authenticateUserOptional, async (req: any, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const {
      orderId,
      returnUrl,
      channel,
      storePaymentMethod,
      accessToken,
      checkoutExperience,
      checkoutMethod,
    } = req.body || {};
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
    const pricingIntegrity = validateFrozenOrderPricing(order);
    if (!pricingIntegrity.valid) {
      console.error('[payments/create] frozen order pricing mismatch; PSP call blocked', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        storedTotalOre: order.total,
        expectedTotalOre: pricingIntegrity.expectedTotalOre,
        reason: pricingIntegrity.reason,
      });
      res.status(409).json({
        error: 'Orderbeloppet kunde inte verifieras. Gå tillbaka till kassan och försök igen.',
        code: 'ORDER_TOTAL_INTEGRITY_FAILED',
      });
      return;
    }

    const provider = getCheckoutPaymentProvider(order.paymentProvider);
    if (provider.name === 'stripe' && adyenChannel === 'Web') {
      if (checkoutExperience !== 'embedded' && checkoutExperience !== 'hosted') {
        res.status(400).json({ error: 'checkoutExperience måste vara embedded eller hosted för Stripe' });
        return;
      }
      if (!['klarna', 'apple_pay', 'google_pay', 'card'].includes(String(checkoutMethod || ''))) {
        res.status(400).json({ error: 'Ogiltig eller saknad checkoutMethod för Stripe' });
        return;
      }
    }
    const storedRefs = {
      mollie: order.molliePaymentId,
      swish: order.swishPaymentId,
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
    if (provider.name === 'stripe' && order.stripePaymentIntentId) {
      const remote = await provider.getRemoteStatus(order.stripePaymentIntentId);
      if (remote.state === 'paid') {
        const finalized = await finalizePaymentSuccess(order.id, {
          provider: 'stripe',
          ref: order.stripePaymentIntentId,
          amountReceivedOre: remote.amountReceivedOre ?? 0,
          method: remote.method,
        });
        if (finalized.ok) {
          res.json({ alreadyPaid: true, paymentStatus: 'PAID', provider: 'stripe' });
        } else {
          res.status(409).json({
            error: 'Stripe-betalningen kräver manuell kontroll innan ordern kan fortsätta.',
            code: 'STRIPE_PAYMENT_REVIEW_REQUIRED',
          });
        }
        return;
      }
      if (remote.state === 'canceled' || remote.state === 'expired' || remote.state === 'failed') {
        await finalizePaymentFailed(order.id, {
          provider: 'stripe',
          ref: order.stripePaymentIntentId,
          reason: remote.state,
        });
        res.status(409).json({
          error: 'Stripe-betalningsförsöket är avslutat. Starta en ny beställning.',
          code: 'STRIPE_PAYMENT_TERMINAL',
        });
        return;
      }
      if (remote.state === 'pending') {
        res.status(409).json({
          error: 'Stripe-betalningen behandlas fortfarande. Vänta på bekräftelse.',
          code: 'STRIPE_PAYMENT_STILL_PENDING',
        });
        return;
      }
    }
    let reservedSwishPaymentRef: string | undefined;
    if (provider.name === 'swish') {
      const previousRef = String(order.swishPaymentId || '').trim().toUpperCase();
      let reusableRef = previousRef || null;
      if (previousRef) {
        let remote: Awaited<ReturnType<typeof provider.getRemoteStatus>> | null = null;
        try {
          remote = await provider.getRemoteStatus(previousRef);
        } catch (error: any) {
          // A pre-reserved UUID whose PUT never reached Swish is safe to reuse.
          // Any other transport/auth failure fails closed: never create a
          // second request while the first one's state is unknown.
          if (Number(error?.response?.status) !== 404) throw error;
        }
        if (remote?.state === 'paid') {
          const finalized = await finalizePaymentSuccess(order.id, {
            provider: 'swish',
            ref: previousRef,
            amountReceivedOre: remote.amountReceivedOre ?? 0,
            method: 'swish',
          });
          if (finalized.ok) {
            res.json({ alreadyPaid: true, paymentStatus: 'PAID', provider: 'swish' });
          } else {
            res.status(409).json({
              error: 'Swish-betalningen kräver manuell kontroll innan ordern kan fortsätta.',
              code: 'SWISH_PAYMENT_REVIEW_REQUIRED',
            });
          }
          return;
        }
        if (remote?.state === 'open' || remote?.state === 'pending') {
          if (!provider.cancelPayment) {
            res.status(409).json({
              error: 'En Swish-betalning väntar redan på svar.',
              code: 'SWISH_PAYMENT_STILL_PENDING',
            });
            return;
          }
          const canceled = await provider.cancelPayment(previousRef);
          if (canceled.state === 'paid') {
            const finalized = await finalizePaymentSuccess(order.id, {
              provider: 'swish',
              ref: previousRef,
              amountReceivedOre: canceled.amountReceivedOre ?? 0,
              method: 'swish',
            });
            if (finalized.ok) {
              res.json({ alreadyPaid: true, paymentStatus: 'PAID', provider: 'swish' });
            } else {
              res.status(409).json({
                error: 'Swish-betalningen kräver manuell kontroll innan ordern kan fortsätta.',
                code: 'SWISH_PAYMENT_REVIEW_REQUIRED',
              });
            }
            return;
          }
          if (!['canceled', 'failed', 'expired'].includes(canceled.state)) {
            res.status(409).json({
              error: 'Den tidigare Swish-betalningen verifieras fortfarande. Försök igen om en stund.',
              code: 'SWISH_PAYMENT_STILL_PENDING',
            });
            return;
          }
          reusableRef = null;
        } else if (remote) {
          // A terminal declined/error/cancelled request has already consumed
          // its instruction UUID. Reserve a fresh one for the new app token.
          reusableRef = null;
        }
      }
      if (!reusableRef) {
        reusableRef = randomBytes(16).toString('hex').toUpperCase();
        const reserved = await prisma.order.updateMany({
          where: {
            id: order.id,
            status: 'AWAITING_PAYMENT',
            paymentStatus: order.paymentStatus,
            paymentProvider: 'swish',
            swishPaymentId: order.swishPaymentId,
          },
          data: { swishPaymentId: reusableRef },
        });
        if (reserved.count !== 1) {
          res.status(409).json({
            error: 'Ett annat Swish-försök startades samtidigt. Försök igen.',
            code: 'SWISH_PAYMENT_RESERVATION_CHANGED',
          });
          return;
        }
        order.swishPaymentId = reusableRef;
      }
      reservedSwishPaymentRef = reusableRef;
    }
    let providerReturnUrl = verifiedReturnUrl;
    if (provider.name === 'swish') {
      const swishReturnUrl = new URL(verifiedReturnUrl);
      swishReturnUrl.searchParams.set('payment_provider', 'swish');
      if (order.accessToken) {
        swishReturnUrl.searchParams.set(
          'payment_resume',
          issueOrderPaymentResumeProof(order.id, order.accessToken),
        );
      }
      providerReturnUrl = swishReturnUrl.toString();
    }
    const result = await provider.createPayment({
      order: toOrderForPayment(order),
      idempotencyKey: paymentIdempotencyKey(provider.name, order.id),
      paymentReference: provider.name === 'stripe'
        ? order.stripePaymentIntentId || undefined
        : reservedSwishPaymentRef,
      returnUrl: providerReturnUrl,
      webhookUrl: publicWebhookUrl(provider.name),
      channel: adyenChannel,
      checkoutExperience,
      checkoutMethod,
      storePaymentMethod: !!storePaymentMethod,
    });

    // Länka PSP-referensen på ordern (provider-specifik kolumn) så webhook/reconcile hittar den.
    const refData =
      provider.name === 'adyen'
        ? { adyenSessionId: result.paymentRef }
        : provider.name === 'mollie'
          ? { molliePaymentId: result.paymentRef }
          : provider.name === 'swish'
            ? { swishPaymentId: result.paymentRef }
          : provider.name === 'stripe'
            ? { stripePaymentIntentId: result.paymentRef }
          : {};
    // DB-länkningen är obligatorisk: utan den kan providerwebhooken inte hitta
    // ordern. PSP-anropet är idempotent, så ett DB-fel kan tryggt retry:as.
    const linked = await prisma.order.updateMany({
      where: {
        id: order.id,
        status: 'AWAITING_PAYMENT',
        paymentStatus: order.paymentStatus,
        paymentProvider: provider.name,
        molliePaymentId: order.molliePaymentId,
        swishPaymentId: order.swishPaymentId,
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
      swishToken: result.swishToken,
      swishUrl: result.swishUrl,
      swishQrCode: result.swishQrCode,
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

// POST /api/payments/webhooks/swish — Swish callbackar ett Payment Request-objekt.
// Callbacken är bara en väcksignal: identifieraren verifieras och aktuell status
// hämtas därefter med vårt mTLS-certifikat innan ordern muteras.
router.post('/webhooks/swish', async (req, res) => {
  const paymentId = typeof req.body?.id === 'string' ? req.body.id.trim().toUpperCase() : '';
  const callbackIdentifier = req.headers.callbackidentifier;
  if (!/^[0-9A-F]{32}$/.test(paymentId) || !validSwishCallbackIdentifier(paymentId, callbackIdentifier)) {
    res.status(401).json({ error: 'Ogiltig Swish-callback' });
    return;
  }
  try {
    const order = await prisma.order.findFirst({
      where: { paymentProvider: 'swish', swishPaymentId: paymentId },
      select: { id: true },
    });
    if (order) {
      const provider = getPaymentProviderByName('swish');
      const status = await provider.getRemoteStatus(paymentId);
      if (status.state === 'paid') {
        await finalizePaymentSuccess(order.id, {
          provider: 'swish',
          ref: paymentId,
          amountReceivedOre: status.amountReceivedOre ?? 0,
          method: 'swish',
        });
      } else if (status.state === 'failed' || status.state === 'canceled' || status.state === 'expired') {
        await finalizePaymentFailed(order.id, { provider: 'swish', ref: paymentId, reason: status.state });
      }
      await syncSwishRefunds(order.id, paymentId, status);
    }
    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('[payments/webhook swish] error:', err?.message || err);
    res.status(500).json({ error: 'Webhook kunde inte behandlas' });
  }
});

/** Bokför Swish-refunds som PSP:n redan bekräftat. Delas av båda callbackarna. */
async function syncSwishRefunds(
  orderId: string,
  paymentRef: string,
  status: { amountReceivedOre?: number; amountRefundedOre?: number; refunds?: any[] },
) {
  if ((status.amountRefundedOre ?? 0) <= 0 && (status.refunds?.length ?? 0) === 0) return;
  const sync = await syncRemoteRefundOutcome({
    orderId,
    paymentRef,
    paidAmountOre: status.amountReceivedOre ?? 0,
    cumulativeRefundOre: status.amountRefundedOre ?? 0,
    provider: 'swish',
    source: 'WEBHOOK',
    refunds: status.refunds,
  });
  if (sync.changed && sync.fullRefund) {
    await announceFullRefund(
      orderId,
      sync.restaurantId,
      sync.orderStatus === 'REJECTED' ? 'REJECTED' : 'CANCELLED',
    );
  }
}

// POST /api/payments/webhooks/swish-refund — Swish callbackar ett Refund-objekt.
// Precis som betal-callbacken är den bara en väcksignal: identifieraren
// verifieras och hela betalningens refundbild hämtas därefter med certifikatet.
router.post('/webhooks/swish-refund', async (req, res) => {
  const refundId = typeof req.body?.id === 'string' ? req.body.id.trim().toUpperCase() : '';
  const callbackIdentifier = req.headers.callbackidentifier;
  if (!/^[0-9A-F]{32}$/.test(refundId) || !validSwishCallbackIdentifier(refundId, callbackIdentifier)) {
    res.status(401).json({ error: 'Ogiltig Swish-callback' });
    return;
  }
  try {
    let row = await prisma.paymentRefund.findFirst({
      where: { provider: 'swish', refundRef: refundId },
      select: { orderId: true, paymentRef: true },
    });
    if (!row) {
      // PUT:en gick igenom men svaret tappades innan refundRef hann sparas.
      // Instruktions-ID:t är härlett ur idempotency-nyckeln, så raden går
      // fortfarande att återfinna i stället för att callbacken tappas.
      const pending = await prisma.paymentRefund.findMany({
        where: { provider: 'swish', refundRef: null },
        select: { orderId: true, paymentRef: true, idempotencyKey: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      row = pending.find(
        (candidate) => swishRefundInstructionId(candidate.idempotencyKey) === refundId,
      ) ?? null;
    }
    if (row) {
      const provider = getPaymentProviderByName('swish');
      const status = await provider.getRemoteStatus(row.paymentRef);
      await syncSwishRefunds(row.orderId, row.paymentRef, status);
    }
    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('[payments/webhook swish-refund] error:', err?.message || err);
    res.status(500).json({ error: 'Webhook kunde inte behandlas' });
  }
});

type StripeWebhookBinding = {
  orderId: string | null;
  sessionRef: string | null;
  paymentIntentRef: string | null;
};

function stripeWebhookBinding(event: any): StripeWebhookBinding {
  const object: any = event?.data?.object || {};
  if (String(event?.type || '').startsWith('checkout.session.')) {
    return {
      orderId: object.metadata?.orderId || object.client_reference_id || null,
      sessionRef: typeof object.id === 'string' ? object.id : null,
      paymentIntentRef: typeof object.payment_intent === 'string'
        ? object.payment_intent
        : object.payment_intent?.id || null,
    };
  }
  if (String(event?.type || '').startsWith('payment_intent.')) {
    return {
      orderId: object.metadata?.orderId || null,
      sessionRef: null,
      paymentIntentRef: typeof object.id === 'string' ? object.id : null,
    };
  }
  const paymentIntentRef = typeof object.payment_intent === 'string'
    ? object.payment_intent
    : object.payment_intent?.id || null;
  return {
    orderId: object.metadata?.orderId || null,
    sessionRef: null,
    paymentIntentRef,
  };
}

async function canonicalStripeWebhookOrder(event: any) {
  if (process.env.NODE_ENV === 'production' && event.livemode !== true) {
    throw new Error('Stripe testevent blockerades i produktion');
  }
  const binding = stripeWebhookBinding(event);
  let order = binding.orderId
    ? await prisma.order.findUnique({
        where: { id: binding.orderId },
        select: {
          id: true,
          orderNumber: true,
          total: true,
          paymentProvider: true,
          stripePaymentIntentId: true,
        },
      })
    : null;
  if (!order) {
    const directRef = binding.sessionRef || binding.paymentIntentRef;
    if (directRef) {
      const candidates = await prisma.order.findMany({
        where: { paymentProvider: 'stripe', stripePaymentIntentId: directRef },
        select: {
          id: true,
          orderNumber: true,
          total: true,
          paymentProvider: true,
          stripePaymentIntentId: true,
        },
        take: 2,
      });
      if (candidates.length === 1) order = candidates[0];
      if (candidates.length > 1) throw new Error('Flera order delar samma Stripe-referens');
    }
  }
  if (!order) return null;
  if (order.paymentProvider !== 'stripe' || !order.stripePaymentIntentId) {
    throw new Error('Stripe-eventets order har ingen exakt Stripe-bindning');
  }
  if (binding.orderId && binding.orderId !== order.id) {
    throw new Error('Stripe-eventets metadata pekar på fel order');
  }

  const storedRef = order.stripePaymentIntentId;
  const proof = await assertStripePaymentReferenceBinding(storedRef, order);
  if (binding.sessionRef && binding.sessionRef !== storedRef) {
    throw new Error('Stripe-eventets Checkout Session matchar inte lagrad referens');
  }
  if (binding.paymentIntentRef && binding.paymentIntentRef !== proof.paymentIntentId) {
    throw new Error('Stripe-eventets PaymentIntent matchar inte lagrad referens');
  }

  const provider = getPaymentProviderByName('stripe');
  const remote = await provider.getRemoteStatus(storedRef);
  return { order, storedRef, remote };
}

// POST /api/payments/webhooks/stripe — signed events are wake-up signals only;
// the exact stored pi_/cs_ is refreshed from Stripe before local state changes.
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
    const refreshable =
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded' ||
      event.type === 'checkout.session.async_payment_failed' ||
      event.type === 'checkout.session.expired' ||
      event.type === 'payment_intent.succeeded' ||
      event.type === 'payment_intent.payment_failed' ||
      event.type === 'payment_intent.canceled' ||
      event.type === 'charge.refunded' ||
      event.type === 'refund.created' ||
      event.type === 'refund.updated' ||
      event.type === 'refund.failed';
    if (refreshable) {
      const refreshed = await canonicalStripeWebhookOrder(event);
      if (refreshed) {
        const { order, storedRef, remote } = refreshed;
        if (remote.state === 'paid') {
          await finalizePaymentSuccess(order.id, {
            provider: 'stripe',
            ref: storedRef,
            amountReceivedOre: remote.amountReceivedOre ?? 0,
            method: remote.method,
          });
        } else if (
          remote.state === 'canceled' ||
          remote.state === 'expired' ||
          event.type === 'checkout.session.async_payment_failed'
        ) {
          await finalizePaymentFailed(order.id, {
            provider: 'stripe',
            ref: storedRef,
            reason: event.type,
          });
        }
        // payment_intent.payment_failed/requires_payment_method is retryable.
        if ((remote.amountRefundedOre ?? 0) > 0 || (remote.refunds?.length ?? 0) > 0) {
          const sync = await syncRemoteRefundOutcome({
            orderId: order.id,
            paymentRef: storedRef,
            paidAmountOre: remote.amountReceivedOre ?? order.total,
            cumulativeRefundOre: remote.amountRefundedOre ?? 0,
            provider: 'stripe',
            source: 'WEBHOOK',
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
// för att göra en ny order betald. Nya betalningar startas från providerflödet.
router.post('/adyen/verify', (_req, res) => {
  res.status(410).json({
    error: 'Adyen-klientverifiering är avstängd. Starta en ny betalning från kassan.',
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
        await finalizePaymentSuccess(order.id, { provider: provider.name, ref: paymentId, amountReceivedOre: status.amountReceivedOre ?? 0, method: status.method });
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
// via en riktig HTTP-redirect till URL-schemat. En HTML-sida med inline-script
// fungerar inte här: API:ets CSP blockerar scriptet och iOS blir kvar på en vit
// sida i stället för att ASWebAuthenticationSession ska få callbacken.
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
              method: remote.method,
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
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, appUrl);
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
  res.setHeader('Cache-Control', 'no-store');
  let order = await prisma.order.findUnique({
    where: { id: req.params.orderId },
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      paymentProvider: true,
      molliePaymentId: true,
      swishPaymentId: true,
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
          method: remote.method,
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
          swishPaymentId: true,
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
