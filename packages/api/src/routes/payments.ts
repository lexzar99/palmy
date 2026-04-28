import { Router } from 'express';
import Stripe from 'stripe';
import prisma from '../lib/prisma';
import { getIO } from '../lib/socket';

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

// POST /api/payments/create-intent
// Skapar en Stripe PaymentIntent för checkout
router.post('/create-intent', async (req, res) => {
  try {
    const { amount, currency = 'sek', metadata } = req.body;
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

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(safeAmount * 100), // kr till ören
      currency,
      metadata: normalizedMetadata,
      automatic_payment_methods: { enabled: true },
    });



    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: 'Kunde inte initiera betalning' });
  }
});

// POST /api/payments/refund
// Refundar en PaymentIntent — anropas automatiskt av appen om orderSkapandet misslyckas efter betalning
router.post('/refund', async (req, res) => {
  const { paymentIntentId } = req.body;

  if (!paymentIntentId || typeof paymentIntentId !== 'string') {
    res.status(400).json({ error: 'paymentIntentId saknas' });
    return;
  }

  try {
    const refund = await stripe.refunds.create({ payment_intent: paymentIntentId });

    // Mark the order as refunded if one exists with this intent
    await prisma.order.updateMany({
      where: { stripePaymentIntentId: paymentIntentId },
      data: { paymentStatus: 'REFUNDED' },
    });

    console.log(`💸 Refund created: ${refund.id} for intent ${paymentIntentId}`);
    res.json({ success: true, refundId: refund.id });
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
      
      // Uppdatera order med betalningsstatus
      const order = await prisma.order.findFirst({
        where: { stripePaymentIntentId: paymentIntent.id },
      });

      if (order) {
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: 'PAID' },
        });

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
      
      await prisma.order.updateMany({
        where: { stripePaymentIntentId: paymentIntent.id },
        data: { paymentStatus: 'FAILED' },
      });
      break;
    }
  }

  res.json({ received: true });
});

export default router;
