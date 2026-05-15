import { Router } from 'express';
import Stripe from 'stripe';
import prisma from '../lib/prisma';
import { getIO } from '../lib/socket';
import { cacheResponse, getCachedResponse, getIdempotencyKey } from '../lib/idempotency';
import { authenticate, requireSuperAdmin } from '../middleware/auth';

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-02-24.acacia',
});

// Debug: Verify key is loaded (Safely)
if (process.env.STRIPE_SECRET_KEY) {
  console.log(`🔐 Stripe initialized with key starting with: ${process.env.STRIPE_SECRET_KEY.substring(0, 7)}...`);
} else {
  console.error('❌ NO STRIPE_SECRET_KEY FOUND in environment!');
}


const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// Startup-validering: webhook-secret MÅSTE vara satt i prod, annars
// kan order-status (PAID/FAILED) inte uppdateras automatiskt — admin
// måste markera manuellt vilket är felbenäget.
if (process.env.NODE_ENV === 'production') {
  if (!WEBHOOK_SECRET || WEBHOOK_SECRET.includes('your_webhook_secret_here') || !WEBHOOK_SECRET.startsWith('whsec_')) {
    console.error(
      '❌ STRIPE_WEBHOOK_SECRET saknas eller är ogiltig i produktion. Webhook-signaturer kommer att rejectas. Hämta riktig secret från Stripe Dashboard → Webhooks.',
    );
  }
  if (process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
    console.warn('⚠️  STRIPE_SECRET_KEY är en test-nyckel (sk_test_) i NODE_ENV=production.');
  }
}

// POST /api/payments/create-intent
// Skapar en Stripe PaymentIntent för checkout
router.post('/create-intent', async (req, res) => {
  const idempotencyKey = getIdempotencyKey(req);
  if (idempotencyKey) {
    const cached = getCachedResponse(`create-intent:${idempotencyKey}`);
    if (cached) {
      return res.status(cached.status).json(cached.body);
    }
  }

  try {
    const { amount, currency = 'sek', metadata, orderId } = req.body;
    const parsedAmount = Number(amount);

    // Log the exact amount for debugging
    console.log(`📦 Creating payment intent: ${parsedAmount} ${currency} (${Math.round(parsedAmount * 100)} öre)`);

    // Stripe has a minimum charge of 5 SEK (500 öre)
    // For testing purposes, we ensure we always meet this minimum
    const safeAmount = Math.max(parsedAmount, 5);

    if (!Number.isFinite(parsedAmount) || safeAmount < 1) {
      res.status(400).json({ error: 'Ogiltigt belopp' });
      return;
    }

    const normalizedMetadata = Object.entries(metadata || {}).reduce<Record<string, string>>((acc, [key, value]) => {
      if (value === undefined || value === null) return acc;
      acc[key] = String(value);
      return acc;
    }, {});

    if (orderId && typeof orderId === 'string') {
      normalizedMetadata.orderId = orderId;
    }

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: Math.round(safeAmount * 100), // kr till ören
        currency,
        metadata: normalizedMetadata,
        // automatic_payment_methods: enabled = Stripe väljer alla godkända
        // metoder automatiskt (kort, Apple Pay, Google Pay, Klarna, Swish).
        // allow_redirects: 'always' = tillåter Klarna/Swish (de behöver redirect).
        // Apple Pay aktiveras OM:
        //   1. Domain verifierad i Stripe Dashboard (web)
        //   2. Apple Pay capability + merchant ID i app entitlements (RN)
        //   3. Apple Pay payment processing cert uppladdad i Stripe Dashboard
        // Om något saknas filtrerar Stripe bort knappen tyst.
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'always',
        },
      },
      idempotencyKey ? { idempotencyKey: `create-intent:${idempotencyKey}` } : undefined
    );

    // Link the pending order to this payment intent. Vi väljer att inte
    // returnera fel till klienten om DB-uppdateringen failar — Stripe har redan
    // skapat intent och kunden ska kunna betala. Men strukturerad error-log
    // krävs så vi kan upptäcka mismatched intents/orders i Sentry.
    if (orderId && typeof orderId === 'string') {
      await prisma.order.update({
        where: { id: orderId },
        data: { stripePaymentIntentId: paymentIntent.id },
      }).catch((e) => console.error('[payments] could not link order to intent', {
        orderId,
        paymentIntentId: paymentIntent.id,
        error: e?.message || String(e),
        // INTE PII — bara debug-flagga som hjälper hitta lost-pending-order
        // när kund kommer tillbaka och säger "jag betalade men ingen mat".
      }));
    }

    const responseBody = {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
    if (idempotencyKey) {
      cacheResponse(`create-intent:${idempotencyKey}`, 200, responseBody);
    }
    res.json(responseBody);
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: 'Kunde inte initiera betalning' });
  }
});

// POST /api/payments/refund
// Refundar en PaymentIntent. Kräver SUPER_ADMIN — utan auth kunde vem som
// helst med PaymentIntent-ID refundera order (t.ex. gissa från order-mail).
// Frontend (cart-flödet) använder INTE denna direkt — admin-panelens
// /admin/orders/:id/refund är primär refund-flow för admins.
router.post('/refund', authenticate, requireSuperAdmin, async (req, res) => {
  const idempotencyKey = getIdempotencyKey(req);
  if (idempotencyKey) {
    const cached = getCachedResponse(`refund:${idempotencyKey}`);
    if (cached) {
      return res.status(cached.status).json(cached.body);
    }
  }

  const { paymentIntentId } = req.body;

  if (!paymentIntentId || typeof paymentIntentId !== 'string') {
    res.status(400).json({ error: 'paymentIntentId saknas' });
    return;
  }

  try {
    const refund = await stripe.refunds.create(
      { payment_intent: paymentIntentId },
      idempotencyKey ? { idempotencyKey: `refund:${idempotencyKey}` } : undefined
    );

    // Mark the order as refunded if one exists with this intent
    await prisma.order.updateMany({
      where: { stripePaymentIntentId: paymentIntentId },
      data: { paymentStatus: 'REFUNDED' },
    });

    console.log(`💸 Refund created: ${refund.id} for intent ${paymentIntentId}`);
    const responseBody = { success: true, refundId: refund.id };
    if (idempotencyKey) {
      cacheResponse(`refund:${idempotencyKey}`, 200, responseBody);
    }
    res.json(responseBody);
  } catch (error: any) {
    console.error('Stripe refund error:', error);
    res.status(500).json({ error: error?.message || 'Återbetalning misslyckades' });
  }
});

// POST /api/payments/webhook - Stripe webhook
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err);
    res.status(400).json({ error: 'Webhook signature verification failed' });
    return;
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const metaOrderId = paymentIntent.metadata?.orderId;

      // Look up by orderId in metadata first (pending-payment flow), then by intentId
      const order = await prisma.order.findFirst({
        where: metaOrderId
          ? { OR: [{ id: metaOrderId }, { stripePaymentIntentId: paymentIntent.id }] }
          : { stripePaymentIntentId: paymentIntent.id },
        include: { restaurant: { select: { name: true } }, items: true },
      });

      if (order) {
        const isAwaitingPayment = order.status === 'AWAITING_PAYMENT';

        const updatedOrder = await prisma.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: 'PAID',
            stripePaymentIntentId: order.stripePaymentIntentId || paymentIntent.id,
            ...(isAwaitingPayment ? { status: 'PENDING', paymentMethod: 'ONLINE' } : {}),
          },
          include: { restaurant: { select: { name: true } }, items: true },
        });

        // Referral-reward — invitee:s första betalda order = trigger.
        try {
          const { maybeTriggerReferralReward } = await import('./referrals');
          await maybeTriggerReferralReward(order.id);
        } catch (e: any) {
          console.error('[payments webhook] referral-reward-trigger error:', e?.message);
        }

        // For pending-payment orders: now that payment is confirmed, broadcast to restaurant
        if (isAwaitingPayment) {
          const orderForSocket = {
            ...updatedOrder,
            total: (updatedOrder as any).total / 100,
            deliveryFee: (updatedOrder as any).deliveryFee / 100,
            discountAmount: (updatedOrder as any).discountAmount / 100,
            items: updatedOrder.items.map((i: any) => ({
              ...i,
              basePrice: i.basePrice / 100,
              subtotal: i.subtotal / 100,
            })),
            restaurantName: updatedOrder.restaurant?.name || 'Okänd restaurang',
          };
          getIO().to('admin-room').emit('order:new', orderForSocket);
          if (updatedOrder.restaurantId) {
            getIO().to(`admin-room:${updatedOrder.restaurantId}`).emit('order:new', orderForSocket);
          }

          // Apply discount code usage increment
          if (updatedOrder.discountCode && updatedOrder.discountCode !== 'test' && updatedOrder.discountCode !== 'testa') {
            await prisma.discountCode.updateMany({
              where: { code: updatedOrder.discountCode.toUpperCase() },
              data: { usageCount: { increment: 1 } },
            }).catch(() => {});
          }

          // Apply deal usage increment
          if ((updatedOrder as any).appliedDealId) {
            await prisma.deal.update({
              where: { id: (updatedOrder as any).appliedDealId },
              data: { usageCount: { increment: 1 } },
            }).catch(() => {});
          }
        }

        // Notifiera admin
        getIO().to('admin-room').emit('order:paid', {
          orderId: order.id,
          orderNumber: order.orderNumber,
        });
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const metaOrderId = paymentIntent.metadata?.orderId;

      if (metaOrderId) {
        await prisma.order.updateMany({
          where: { OR: [{ id: metaOrderId }, { stripePaymentIntentId: paymentIntent.id }] },
          data: { paymentStatus: 'FAILED' },
        });
      } else {
        await prisma.order.updateMany({
          where: { stripePaymentIntentId: paymentIntent.id },
          data: { paymentStatus: 'FAILED' },
        });
      }
      break;
    }
  }

  res.json({ received: true });
});

export default router;
