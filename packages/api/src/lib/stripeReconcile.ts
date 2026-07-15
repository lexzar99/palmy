/**
 * Stripe-specifik refund-synk.
 *
 * Pending-betalningar hanteras enbart av den provider-neutrala pollern i
 * payments/reconcile. Här synkas manuella Stripe-refunds som kan ha gjorts
 * direkt i Dashboard och därför annars saknas i vår orderbok.
 */
import Stripe from 'stripe';
import prisma from './prisma';
import { syncRemoteRefundOutcome } from './payments/refundPersistence';
import { announceFullRefund } from './payments/refundNotifications';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-02-24.acacia',
});

export async function syncRefunds(): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) return;

  try {
    const since = Math.floor((Date.now() - 30 * 24 * 3600_000) / 1000);
    const refundsByCharge = new Map<string, Stripe.Refund[]>();

    // Stripe auto-paginerar iteratorn. Finance-sync får inte kapa listan:
    // ett tyst tak skulle uppdatera orderns kumulativa belopp utan att skriva
    // alla individuella ledgerposter.
    for await (const refund of stripe.refunds.list({
      limit: 100,
      created: { gte: since },
    })) {
      const chargeId =
        typeof refund.charge === 'string' ? refund.charge : refund.charge?.id;
      if (chargeId) {
        const known = refundsByCharge.get(chargeId) || [];
        known.push(refund);
        refundsByCharge.set(chargeId, known);
      }
    }

    let synced = 0;
    for (const [chargeId, chargeRefunds] of refundsByCharge) {
      const charge = await stripe.charges.retrieve(chargeId);
      const intentId =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id;
      if (!intentId || charge.amount_refunded <= 0) continue;

      const orders = await prisma.order.findMany({
        where: { stripePaymentIntentId: intentId },
        select: { id: true },
      });
      // Use the auto-paginated refund iterator above, not Charge.refunds.data:
      // the embedded list is capped and would silently omit later partials.
      const refunds = chargeRefunds.map((refund) => ({
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
      }));
      for (const order of orders) {
        const result = await syncRemoteRefundOutcome({
          orderId: order.id,
          paymentRef: intentId,
          paidAmountOre: charge.amount,
          cumulativeRefundOre: charge.amount_refunded,
          provider: 'stripe',
          source: 'STRIPE_SYNC',
          refunds,
        });
        if (result.changed) synced += 1;
        if (result.changed && result.fullRefund) {
          await announceFullRefund(
            order.id,
            result.restaurantId,
            result.orderStatus === 'REJECTED' ? 'REJECTED' : 'CANCELLED',
          );
        }
      }
    }

    if (synced > 0) {
      console.log(`[stripe-refunds] Synkade ${synced} orderrefund(s) från Stripe`);
    }
  } catch (err) {
    console.error('[stripe-refunds] sync failed:', err);
  }
}

export function startStripeRefundSync(): void {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.log('[stripe-refunds] STRIPE_SECRET_KEY saknas — skipar refund-sync');
    return;
  }

  void syncRefunds();
  setInterval(() => {
    void syncRefunds();
  }, 10 * 60_000);

  console.log('[stripe-refunds] Refund-sync startad (10 min)');
}
