/**
 * Provider-neutralt betal-API (aktiv provider = Mollie via env).
 *
 *   POST /api/payments/create           skapa betalning → { checkoutUrl, paymentRef }
 *   POST /api/payments/webhooks/mollie  Mollie async-notis → finalisera (sanningskälla)
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
import { getPaymentProvider, type OrderForPayment } from '../lib/payments';
import { finalizePaymentSuccess, finalizePaymentFailed } from '../lib/payments/finalize';
import { verifyAdyenHmac } from '../lib/payments/adyen';

const router = Router();

const createLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'För många betalningsförsök. Vänta en stund och försök igen.' },
});

/** Publik https-webhook-URL, eller undefined i lokal dev (Mollie når ej localhost). */
function publicWebhookUrl(): string | undefined {
  const base = process.env.API_PUBLIC_URL;
  if (!base || !/^https:\/\//i.test(base) || /localhost|127\.0\.0\.1/.test(base)) return undefined;
  return `${base.replace(/\/$/, '')}/api/payments/webhooks/mollie`;
}

function toOrderForPayment(order: any): OrderForPayment {
  return {
    id: order.id,
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

// POST /api/payments/create
router.post('/create', createLimiter, async (req, res) => {
  try {
    const { orderId, returnUrl } = req.body || {};
    if (!orderId || typeof orderId !== 'string') {
      res.status(400).json({ error: 'orderId krävs' });
      return;
    }
    if (!returnUrl || typeof returnUrl !== 'string') {
      res.status(400).json({ error: 'returnUrl krävs' });
      return;
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { restaurant: { select: { name: true } }, items: true },
    });
    if (!order) {
      res.status(404).json({ error: 'Order hittades inte' });
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
      webhookUrl: publicWebhookUrl(),
    });

    // Länka PSP-referensen på ordern (provider-specifik kolumn) så webhook/reconcile hittar den.
    const refData =
      provider.name === 'adyen'
        ? { adyenSessionId: result.paymentRef }
        : provider.name === 'mollie'
          ? { molliePaymentId: result.paymentRef }
          : {};
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentProvider: provider.name, ...refData },
    }).catch((e: any) => console.error('[payments/create] kunde inte länka order:', e?.message));

    res.json({
      provider: provider.name,
      paymentRef: result.paymentRef,
      checkoutUrl: result.checkoutUrl, // Mollie: redirect-URL
      session: result.session, // Adyen: { id, sessionData } för Drop-in
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
  const order = await prisma.order.findUnique({
    where: { id: req.params.orderId },
    select: { status: true, paymentStatus: true },
  });
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
      select: { id: true, molliePaymentId: true, adyenPspReference: true, total: true },
    });
    const provider = getPaymentProvider();
    const ref = provider.name === 'adyen' ? order?.adyenPspReference : order?.molliePaymentId;
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
