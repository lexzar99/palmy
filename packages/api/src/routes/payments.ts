/**
 * Kompatibilitetsrouter för den utfasade Stripe-klienten.
 *
 * Nya webben, Swift-appen och Kotlin-appen använder det provider-neutrala
 * API:t i paymentsMollie.ts. De gamla klient-endpointsen får därför inte
 * skapa eller mutera betalningar längre. Den gamla webhook-URL:en behålls
 * tills Stripe Dashboard säkert har flyttats till /webhooks/stripe.
 */
import { Router } from 'express';
import Stripe from 'stripe';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma';
import {
  finalizePaymentFailed,
  finalizePaymentSuccess,
} from '../lib/payments/finalize';
import { syncRemoteRefundOutcome } from '../lib/payments/refundPersistence';
import { announceFullRefund } from '../lib/payments/refundNotifications';

const router = Router();

const retiredClientLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'För många betalningsförsök. Vänta en stund.' },
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-02-24.acacia',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

function retiredClientEndpoint(_req: unknown, res: any) {
  res.status(410).json({
    error: 'Den här appversionens betalningsflöde stöds inte längre. Uppdatera appen och försök igen.',
    code: 'PAYMENT_CLIENT_UPGRADE_REQUIRED',
  });
}

// Dessa endpoints tillhörde den gamla PaymentIntent-klienten. Att låta dem
// leva parallellt med hosted checkout gav två konkurrerande state machines,
// osäkra self-refunds och risk för dubbla betalningsreferenser.
router.post('/create-intent', retiredClientLimiter, retiredClientEndpoint);
router.post('/confirm', retiredClientLimiter, retiredClientEndpoint);
router.post('/refund-orphan', retiredClientLimiter, retiredClientEndpoint);

function stripeIntentOrderId(intent: Stripe.PaymentIntent): string | null {
  const value = intent.metadata?.orderId;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Gammal webhook-URL, kvar som säker övergång. Den använder exakt samma
 * provider-neutrala finalisering som den nya URL:en och kan därför köras
 * samtidigt utan dubbelräkning.
 */
router.post('/webhook', async (req, res) => {
  const signature = req.headers['stripe-signature'];
  if (typeof signature !== 'string' || !webhookSecret) {
    res.status(400).json({ error: 'Stripe webhook är inte konfigurerad' });
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err: any) {
    console.error('[stripe legacy webhook] signature error:', err?.message || err);
    res.status(400).json({ error: 'Stripe webhook verification failed' });
    return;
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object as Stripe.PaymentIntent;
      const orderId = stripeIntentOrderId(intent);
      if (orderId) {
        await finalizePaymentSuccess(orderId, {
          provider: 'stripe',
          ref: intent.id,
          amountReceivedOre: intent.amount_received ?? intent.amount,
        });
      }
    } else if (
      event.type === 'payment_intent.payment_failed' ||
      event.type === 'payment_intent.canceled'
    ) {
      const intent = event.data.object as Stripe.PaymentIntent;
      const orderId = stripeIntentOrderId(intent);
      if (orderId) {
        await finalizePaymentFailed(orderId, {
          provider: 'stripe',
          ref: intent.id,
          reason: event.type,
        });
      }
    } else if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      const intentId =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id;
      if (intentId) {
        const order = await prisma.order.findFirst({
          where: { stripePaymentIntentId: intentId },
          select: { id: true },
        });
        if (order) {
          const sync = await syncRemoteRefundOutcome({
            orderId: order.id,
            paymentRef: intentId,
            paidAmountOre: charge.amount,
            cumulativeRefundOre: charge.amount_refunded,
            provider: 'stripe',
            source: 'WEBHOOK',
            refunds: charge.refunds?.data.map((refund) => ({
              refundRef: refund.id,
              state: refund.status === 'succeeded'
                ? 'refunded' as const
                : refund.status === 'pending'
                  ? 'pending' as const
                  : refund.status === 'failed'
                    ? 'failed' as const
                    : 'unknown' as const,
              amountOre: refund.amount,
              createdAt: new Date(refund.created * 1000),
            })),
          });
          if (sync.needsRetry) throw new Error('refund_in_progress');
          if (sync.changed && sync.fullRefund) await announceFullRefund(order.id, sync.restaurantId);
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (err: any) {
    // 5xx är avsiktligt: Stripe ska retry:a vid tillfälligt DB-/nätverksfel.
    console.error('[stripe legacy webhook] handler error:', err?.message || err);
    res.status(500).json({ error: 'Webhook kunde inte behandlas' });
  }
});

export default router;
