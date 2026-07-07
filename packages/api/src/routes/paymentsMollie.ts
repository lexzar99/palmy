/**
 * Provider-neutralt betal-API (aktiv provider via env).
 *
 *   POST /api/payments/create           skapa betalning → { checkoutUrl, paymentRef }
 *   POST /api/payments/webhooks/:provider async-notis → finalisera (sanningskälla)
 *   GET  /api/payments/return           app/webb-retur efter hosted checkout
 *   GET  /api/payments/status/:orderId  klient-polling efter redirect-retur
 *   POST /api/payments/refund           admin-refund
 *
 * Klienten (web + app) öppnar checkoutUrl, returneras via returnUrl, och
 * POLLAR status tills PAID. Klienten flippar ALDRIG order-status själv —
 * bara webhooken/reconcilen (som litar på PSP:n) gör det.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { authenticateUserOptional } from './auth';
import { getPaymentProvider, type OrderForPayment } from '../lib/payments';
import { finalizePaymentSuccess, finalizePaymentFailed } from '../lib/payments/finalize';
import { verifyAdyenHmac, getAdyenSessionResult } from '../lib/payments/adyen';
import {
  constructStripeWebhookEvent,
  retrieveStripeCheckoutStatus,
} from '../lib/payments/stripe';

const router = Router();

const createLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'För många betalningsförsök. Vänta en stund och försök igen.' },
});

/** Publik https-webhook-URL, eller undefined i lokal dev (PSP:n når ej localhost). */
function publicWebhookUrl(providerName: string): string | undefined {
  const base = process.env.API_PUBLIC_URL;
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
    tipAmount: order.tipAmount,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    deliveryStreet: order.deliveryStreet,
    deliveryCity: order.deliveryCity,
    deliveryZip: order.deliveryZip,
    items: (order.items || []).map((i: any) => ({ productName: i.productName, quantity: i.quantity, subtotal: i.subtotal })),
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

// POST /api/payments/create
router.post('/create', createLimiter, authenticateUserOptional, async (req: any, res) => {
  try {
    const { orderId, returnUrl, channel, storePaymentMethod } = req.body || {};
    if (!orderId || typeof orderId !== 'string') {
      res.status(400).json({ error: 'orderId krävs' });
      return;
    }
    if (!returnUrl || typeof returnUrl !== 'string') {
      res.status(400).json({ error: 'returnUrl krävs' });
      return;
    }
    // Adyen-kanal från klienten: native appen skickar 'iOS'/'Android', webben
    // utelämnar (→ 'Web'). Måste matcha SDK:n annars failar /sessions/setup.
    const adyenChannel: 'Web' | 'iOS' | 'Android' =
      channel === 'iOS' || channel === 'Android' ? channel : 'Web';

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { restaurant: { select: { name: true } }, items: true },
    });
    if (!order) {
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
    if (!Number.isFinite(order.total) || order.total < 1) {
      res.status(400).json({ error: 'Ogiltigt belopp på ordern' });
      return;
    }

    const provider = getPaymentProvider();
    const result = await provider.createPayment({
      order: toOrderForPayment(order),
      returnUrl,
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
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentProvider: provider.name, ...refData },
    }).catch((e: any) => console.error('[payments/create] kunde inte länka order:', e?.message));

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
    res.status(500).json({ error: 'Kunde inte initiera betalning', details: msg });
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
        await prisma.order.updateMany({
          where: { stripePaymentIntentId: intentId },
          data: {
            paymentStatus: 'REFUNDED',
            refundAmount: charge.amount_refunded ?? undefined,
            refundedAt: new Date(),
          },
        });
      }
    }
  } catch (err: any) {
    console.error('[stripe webhook] handler error:', err?.message || err);
  }

  res.status(200).json({ received: true });
});

// POST /api/payments/adyen/verify — server-verifiera Drop-in-resultatet direkt
// vid onComplete (utan att vänta på webhooken). Klienten skickar orderId +
// sessionId + sessionResult; vi frågar Adyen (server-till-server) och finaliserar
// ordern om betalningen är klar. Idempotent: redan PAID → { paid: true } direkt.
router.post('/adyen/verify', authenticateUserOptional, async (req: any, res) => {
  try {
    const { orderId, sessionId, sessionResult } = req.body || {};
    if (!orderId || typeof orderId !== 'string') {
      res.status(400).json({ error: 'orderId krävs' });
      return;
    }
    if (!sessionId || !sessionResult) {
      res.status(400).json({ error: 'sessionId + sessionResult krävs' });
      return;
    }
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, total: true, paymentStatus: true, adyenSessionId: true },
    });
    if (!order) {
      res.status(404).json({ error: 'Order hittades inte' });
      return;
    }
    if (order.paymentStatus === 'PAID') {
      res.json({ paid: true, status: 'completed' });
      return;
    }
    // Sessionen måste tillhöra ordern (annars kan man verifiera mot en annan session).
    if (order.adyenSessionId && order.adyenSessionId !== sessionId) {
      res.status(400).json({ error: 'Sessionen matchar inte ordern' });
      return;
    }

    const { status } = await getAdyenSessionResult(String(sessionId), String(sessionResult));
    if (status === 'completed') {
      // ref=sessionId här (pspReference kommer via webhooken för refund senare).
      await finalizePaymentSuccess(order.id, { provider: 'adyen', ref: String(sessionId), amountReceivedOre: order.total });
      res.json({ paid: true, status });
      return;
    }
    if (['refused', 'canceled', 'cancelled', 'expired', 'error'].includes(status.toLowerCase())) {
      await finalizePaymentFailed(order.id, { provider: 'adyen', ref: String(sessionId), reason: status.toLowerCase() });
      res.json({ paid: false, failed: true, status });
      return;
    }
    // paymentPending (Klarna/Swish async) eller okänt → låt klienten polla vidare.
    res.json({ paid: false, pending: true, status });
  } catch (err: any) {
    console.error('[payments/adyen/verify] error:', err?.message || err);
    res.status(500).json({ error: 'Kunde inte verifiera betalningen', details: err?.message });
  }
});

// POST /api/payments/webhooks/mollie — Mollie POSTar { id } form-encoded.
router.post('/webhooks/mollie', async (req, res) => {
  // Svara alltid 200 snabbt — Mollie retry:ar annars. Fel loggas, kraschar ej.
  const paymentId = typeof req.body?.id === 'string' ? req.body.id : null;
  if (!paymentId) {
    res.status(200).json({ received: true });
    return;
  }
  try {
    const order = await prisma.order.findFirst({
      where: { molliePaymentId: paymentId },
      select: { id: true },
    });
    if (order) {
      const provider = getPaymentProvider();
      const status = await provider.getRemoteStatus(paymentId);
      if (status.state === 'paid') {
        await finalizePaymentSuccess(order.id, { provider: provider.name, ref: paymentId, amountReceivedOre: status.amountReceivedOre ?? 0 });
      } else if (status.state === 'failed' || status.state === 'canceled' || status.state === 'expired') {
        await finalizePaymentFailed(order.id, { provider: provider.name, ref: paymentId, reason: status.state });
      }
    }
  } catch (err: any) {
    console.error('[payments/webhook mollie] error:', err?.message || err);
  }
  res.status(200).json({ received: true });
});

// GET /api/payments/return — Mollie redirectUrl för native/web.
// Vi litar fortfarande bara på PSP-status: om Mollie säger paid finaliserar vi
// direkt här som snabb backup till webhook/reconcile, sedan skickas appen tillbaka
// via URL scheme. Webben får en enkel stäng-sida.
router.get('/return', async (req, res) => {
  const orderId = typeof req.query.orderId === 'string' ? req.query.orderId : '';
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
        const provider = getPaymentProvider();
        if (
          order.paymentStatus !== 'PAID' &&
          order.paymentProvider === provider.name &&
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
    res.status(200).send('[accepted]');
    return;
  }
  const items = body?.notificationItems;
  if (!Array.isArray(items)) {
    res.status(200).send('[accepted]');
    return;
  }
  for (const wrap of items) {
    const item = wrap?.NotificationRequestItem;
    if (!item) continue;
    // HMAC: avvisa förfalskade/manipulerade items (men svara ändå [accepted] på slutet).
    if (!verifyAdyenHmac(item)) {
      console.warn('[adyen webhook] HMAC-mismatch — hoppar item', item?.pspReference);
      continue;
    }
    try {
      const order = await prisma.order.findFirst({
        where: { orderNumber: item.merchantReference },
        select: { id: true },
      });
      if (!order) continue;
      const success = item.success === 'true' || item.success === true;
      const psp = item.pspReference as string;
      const amountOre = item?.amount?.value ?? 0;
      if (item.eventCode === 'AUTHORISATION') {
        if (success) {
          // ref=psp → finalize skriver adyenPspReference (för framtida refund).
          await finalizePaymentSuccess(order.id, { provider: 'adyen', ref: psp, amountReceivedOre: amountOre });
        } else {
          await finalizePaymentFailed(order.id, { provider: 'adyen', ref: psp, reason: 'refused' });
        }
      } else if (item.eventCode === 'CANCELLATION' || item.eventCode === 'EXPIRE') {
        await finalizePaymentFailed(order.id, { provider: 'adyen', ref: psp, reason: String(item.eventCode).toLowerCase() });
      }
      // REFUND / REFUND_FAILED: kan kopplas till refund-statusspårning senare.
    } catch (e: any) {
      console.error('[adyen webhook] item-fel:', e?.message);
    }
  }
  // Adyen kräver EXAKT detta svar, annars retryas webhooken.
  res.status(200).send('[accepted]');
});

// GET /api/payments/status/:orderId — klient pollar efter redirect.
router.get('/status/:orderId', async (req, res) => {
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
    },
  });
  if (!order) {
    res.status(404).json({ error: 'Order hittades inte' });
    return;
  }

  const provider = getPaymentProvider();
  const ref = paymentRefForOrder(order);
  if (order.paymentStatus !== 'PAID' && order.paymentProvider === provider.name && ref) {
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

// POST /api/payments/refund — admin.
router.post('/refund', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { orderId, amountOre } = req.body || {};
    if (!orderId || typeof orderId !== 'string') {
      res.status(400).json({ error: 'orderId krävs' });
      return;
    }
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, molliePaymentId: true, stripePaymentIntentId: true, adyenPspReference: true, total: true },
    });
    const provider = getPaymentProvider();
    const ref =
      provider.name === 'adyen'
        ? order?.adyenPspReference
        : provider.name === 'stripe'
          ? order?.stripePaymentIntentId
          : order?.molliePaymentId;
    if (!order || !ref) {
      res.status(404).json({ error: 'Order eller betalning hittades inte' });
      return;
    }
    const { refundRef } = await provider.refund(ref, typeof amountOre === 'number' ? amountOre : undefined);
    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: 'REFUNDED',
        refundAmount: typeof amountOre === 'number' ? amountOre : order.total,
        refundedAt: new Date(),
      },
    });
    res.json({ success: true, refundRef });
  } catch (err: any) {
    console.error('[payments/refund] error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Återbetalning misslyckades' });
  }
});

export default router;
