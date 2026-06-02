/**
 * Stripe-reconciliation utan webhook.
 *
 * Standard webhook-flow: Stripe POSTar `payment_intent.succeeded` till vår
 * webhook → vi markerar order som PAID. Det är instant och säkert.
 *
 * Utan webhook (vi väntar på Stripe-access): vi pollar Stripe från vår
 * backend för orders som är i AWAITING_PAYMENT-state. Om Stripe säger
 * att betalningen lyckats, kör vi exakt samma logik som webhook skulle.
 *
 * Trade-off: 1-2 min fördröjning istället för instant. Helt OK för
 * lansering — vi fixar webhook senare.
 *
 * Reconciliation körs i två loopar:
 *   - markPendingOrders: var 60 sek, kollar AWAITING_PAYMENT-orders
 *   - syncRefunds: var 10 min, listar Stripe-refunds och syncar status
 */

import Stripe from 'stripe';
import prisma from './prisma';
import { getIO } from './socket';
import { incrementDiscountUsageIfNotCounted } from './discountUsage';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-02-24.acacia',
});

export type ApplyPaymentResult = {
  ok: boolean;
  status?: string;
  paymentStatus?: string;
  mismatch?: boolean;
};

/**
 * Markera order som betald + broadcast till restaurang. Identisk logik som
 * webhook-handlerns `payment_intent.succeeded`-case.
 *
 * Exporterad så att den snabba klient-drivna confirm-endpointen
 * (POST /api/payments/confirm) kan köra EXAKT samma logik direkt efter att
 * kortbetalningen lyckats — istället för att vänta på webhook/reconcile-loopen.
 * Idempotent: webhook, reconcile och confirm kan alla landa här utan
 * dubbelräkning (race-guards på status/RESERVED/discountUsageCounted).
 */
export async function applyPaymentSuccess(orderId: string, paymentIntent: Stripe.PaymentIntent): Promise<ApplyPaymentResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { restaurant: { select: { name: true } }, items: true },
  });
  if (!order) return { ok: false };

  const isAwaitingPayment = order.status === 'AWAITING_PAYMENT';

  // Redan PAID? Skipa — idempotent.
  if (order.paymentStatus === 'PAID' && !isAwaitingPayment) {
    return { ok: true, status: order.status, paymentStatus: order.paymentStatus };
  }

  // BELOPPS-VERIFIKATION: samma skydd som webhook-handlern. Jämför vad Stripe
  // faktiskt drog mot orderns total så ingen kan betala mindre än totalen.
  // Tolerans 1 öre för float-rounding. På mismatch: flagga NEEDS_REVIEW och
  // flippa INTE PAID/PENDING (ordern når aldrig restaurangen).
  const expectedAmount = (order as any).total; // öre
  const receivedAmount = paymentIntent.amount_received ?? paymentIntent.amount;
  if (Math.abs(receivedAmount - expectedAmount) > 1) {
    console.error('[stripe] amount mismatch — order NOT marked PAID', {
      orderId: order.id, orderNumber: order.orderNumber, expectedAmount, receivedAmount,
    });
    await prisma.order.update({
      where: { id: order.id }, data: { paymentStatus: 'NEEDS_REVIEW' },
    }).catch((e: any) => console.error('[stripe] could not flag order for review:', e?.message));
    getIO().to('admin-room').emit('order:amount_mismatch', {
      orderId: order.id, orderNumber: order.orderNumber, expectedAmount, receivedAmount,
    });
    return { ok: false, mismatch: true, status: order.status, paymentStatus: 'NEEDS_REVIEW' };
  }

  const updatedOrder = await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: 'PAID',
      stripePaymentIntentId: order.stripePaymentIntentId || paymentIntent.id,
      ...(isAwaitingPayment ? { status: 'PENDING', paymentMethod: 'ONLINE' } : {}),
    },
    include: { restaurant: { select: { name: true } }, items: true },
  });

  // Referral-reward — kollar om detta är invitee:s första betalda order
  // och triggar 50/50-rewarden om så. Fail-safe: kastar aldrig.
  try {
    const { maybeTriggerReferralReward } = await import('../routes/referrals');
    await maybeTriggerReferralReward(order.id);
  } catch (e: any) {
    console.error('[stripeReconcile] referral-reward-trigger error:', e?.message);
  }

  // UserDeal: markera reserverad welcome/referral-kupong som USED.
  // Race-guard på status='RESERVED' → idempotent med webhook-pathen.
  if ((order as any).userDealId) {
    await prisma.userDeal.updateMany({
      where: { id: (order as any).userDealId, status: 'RESERVED', usedOnOrderId: order.id },
      data: { status: 'USED', usedAt: new Date() },
    }).catch((e: any) => console.error('[stripeReconcile] userDeal mark-USED failed:', e?.message));
  }

  // Pending-payment orders: nu när betalning är bekräftad, broadcasta till restaurang
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

    // Discount/deal usage-increment — idempotent på order-nivå.
    // Webhook-path:en kör samma helper — race-guard säkrar single-counting.
    await incrementDiscountUsageIfNotCounted(order.id);
  }

  // Notifiera admin (matchar webhook-beteendet)
  getIO().to('admin-room').emit('order:paid', {
    orderId: order.id,
    orderNumber: order.orderNumber,
  });

  console.log(`[stripe] ✅ Markerade order ${order.orderNumber} som PAID (intent ${paymentIntent.id})`);
  return { ok: true, status: updatedOrder.status, paymentStatus: 'PAID' };
}

/**
 * Markera order som FAILED. Samma logik som webhook 'payment_intent.payment_failed'.
 */
export async function applyPaymentFailed(orderId: string, paymentIntent: Stripe.PaymentIntent) {
  // Hämta order först så vi kan revert:a UserDeal-reservationen.
  const failedOrder = await prisma.order.findUnique({
    where: { id: orderId },
    select: { userDealId: true },
  });

  await prisma.order.updateMany({
    where: { id: orderId },
    data: { paymentStatus: 'FAILED' },
  });

  if (failedOrder?.userDealId) {
    await prisma.userDeal.updateMany({
      where: { id: failedOrder.userDealId, status: 'RESERVED', usedOnOrderId: orderId },
      data: { status: 'ACTIVE', usedOnOrderId: null },
    }).catch((e: any) => console.error('[stripe-reconcile] userDeal revert failed:', e?.message));
  }

  console.log(`[stripe-reconcile] ❌ Markerade order ${orderId} som FAILED (intent ${paymentIntent.id}, reason: ${paymentIntent.last_payment_error?.message || 'unknown'})`);
}

/**
 * Pollar Stripe för orders som är AWAITING_PAYMENT och äldre än 60 sek.
 * Om Stripe bekräftar betalning → kör webhook-logiken. Om Stripe säger
 * canceled/failed → markera ordern.
 *
 * Skipa orders utan stripePaymentIntentId — vi har ingen länk till Stripe.
 * Skipa orders äldre än 24h — antagligen abandoned cart.
 */
export async function reconcilePendingPayments(): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) return;

  const now = Date.now();
  const minAge = new Date(now - 60_000);
  const maxAge = new Date(now - 24 * 3600_000);

  const pending = await prisma.order.findMany({
    where: {
      status: 'AWAITING_PAYMENT',
      stripePaymentIntentId: { not: null },
      createdAt: { lt: minAge, gt: maxAge },
    },
    select: { id: true, stripePaymentIntentId: true, orderNumber: true },
    take: 50,
  });

  if (pending.length === 0) return;

  console.log(`[stripe-reconcile] Pollar ${pending.length} pending order(s)…`);

  for (const order of pending) {
    if (!order.stripePaymentIntentId) continue;

    try {
      const intent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);

      if (intent.status === 'succeeded') {
        await applyPaymentSuccess(order.id, intent);
      } else if (
        intent.status === 'canceled' ||
        (intent.status === 'requires_payment_method' && intent.last_payment_error)
      ) {
        await applyPaymentFailed(order.id, intent);
      }
      // Annars: 'requires_action', 'processing' osv — låt frontend försöka klart
    } catch (err) {
      console.error(`[stripe-reconcile] Failed to retrieve intent ${order.stripePaymentIntentId}:`, err);
    }
  }
}

/**
 * Listar Stripe-refunds från senaste 24h och syncar till orders som inte
 * redan är markerade som REFUNDED. Fångar manuella refunds från
 * Stripe Dashboard som annars inte syncas till vår DB.
 */
export async function syncRefunds(): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) return;

  try {
    const since = Math.floor((Date.now() - 24 * 3600_000) / 1000);
    const refunds = await stripe.refunds.list({
      limit: 100,
      created: { gte: since },
    });

    if (refunds.data.length === 0) return;

    let synced = 0;
    for (const refund of refunds.data) {
      const intentId =
        typeof refund.payment_intent === 'string'
          ? refund.payment_intent
          : refund.payment_intent?.id;
      if (!intentId) continue;

      const order = await prisma.order.findFirst({
        where: { stripePaymentIntentId: intentId },
        select: { id: true, paymentStatus: true, orderNumber: true },
      });

      if (!order || order.paymentStatus === 'REFUNDED') continue;

      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'REFUNDED',
          refundAmount: refund.amount,
          refundedAt: new Date(refund.created * 1000),
        },
      });
      synced++;
      console.log(`[stripe-reconcile] 💸 Synkade refund för order ${order.orderNumber} (${refund.amount / 100} kr)`);
    }

    if (synced > 0) {
      console.log(`[stripe-reconcile] Synkade ${synced} refund(s) från Stripe`);
    }
  } catch (err) {
    console.error('[stripe-reconcile] syncRefunds failed:', err);
  }
}

/**
 * Startar båda loopar. Kallas en gång vid server-start.
 */
export function startStripeReconciliation(): void {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.log('[stripe-reconcile] STRIPE_SECRET_KEY saknas — skipar reconciliation');
    return;
  }
  if (process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')) {
    console.log('[stripe-reconcile] Webhook verkar konfigurerad — reconciliation körs som backup-säkerhet');
  } else {
    console.log('[stripe-reconcile] Ingen webhook konfigurerad — reconciliation är PRIMARY för payment-sync');
  }

  // Kolla pending payments varje 60 sek
  setInterval(() => {
    reconcilePendingPayments().catch((err) =>
      console.error('[stripe-reconcile] reconcilePendingPayments error:', err),
    );
  }, 60_000);

  // Refund-sync varje 10 min
  setInterval(() => {
    syncRefunds().catch((err) =>
      console.error('[stripe-reconcile] syncRefunds error:', err),
    );
  }, 10 * 60_000);

  console.log('[stripe-reconcile] Reconciliation-loopar startade (pending: 60s, refunds: 10min)');
}
