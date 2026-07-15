/**
 * Provider-neutral money-truth.
 *
 * Detta är den ENDA finaliseringspunkten för en betald order, oavsett PSP.
 * Mollie, Stripe och Adyen kallar hit i stället för att duplicera
 * order-livscykeln.
 *
 * Allt här är idempotent — webhook, reconcile-poller och en ev. klient-driven
 * statuskoll kan alla landa här utan dubbelräkning (race-guards på
 * status/RESERVED/discountUsageCounted).
 */
import prisma from '../prisma';
import { getIO } from '../socket';
import { incrementDiscountUsageIfNotCounted } from '../discountUsage';
import { notifyPartnerDevicesOfNewOrder } from '../partnerFcm';

export type PaymentProviderName = 'mollie' | 'stripe' | 'adyen';

export type FinalizeResult = {
  ok: boolean;
  status?: string;
  paymentStatus?: string;
  mismatch?: boolean;
};

export type FinalizeSuccessInput = {
  provider: PaymentProviderName;
  /** PSP-betalningens ID (Mollie tr_…, Stripe pi_…). */
  ref: string;
  /** Vad PSP:n faktiskt drog, i öre. Verifieras mot order.total. */
  amountReceivedOre: number;
};

/**
 * Durable, retryable economic side effects after PAID. Every child operation
 * is idempotent; the marker is written only after all of them succeeded.
 */
export async function repairPaymentBusinessEffects(orderId: string): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      paymentStatus: true,
      paymentEffectsCompletedAt: true,
      userDealId: true,
    },
  });
  if (!order || order.paymentStatus !== 'PAID') return false;
  if (order.paymentEffectsCompletedAt) return true;

  try {
    const { maybeTriggerReferralReward } = await import('../../routes/referrals');
    await maybeTriggerReferralReward(order.id, { throwOnError: true });

    if (order.userDealId) {
      await prisma.userDeal.updateMany({
        where: { id: order.userDealId, status: 'RESERVED', usedOnOrderId: order.id },
        data: { status: 'USED', usedAt: new Date() },
      });
    }

    await incrementDiscountUsageIfNotCounted(order.id);
    await prisma.order.updateMany({
      where: { id: order.id, paymentStatus: 'PAID', paymentEffectsCompletedAt: null },
      data: { paymentEffectsCompletedAt: new Date() },
    });
    return true;
  } catch (error: any) {
    console.error('[finalize] payment side-effect repair failed:', {
      orderId,
      error: error?.message || String(error),
    });
    return false;
  }
}

/** Skriver PSP-referensen till rätt kolumn beroende på provider. */
function refColumn(provider: PaymentProviderName, ref: string) {
  if (provider === 'mollie') return { molliePaymentId: ref };
  if (provider === 'stripe') return { stripePaymentIntentId: ref };
  if (provider === 'adyen') return { adyenPspReference: ref }; // pspReference (för refund)
  return {};
}

/**
 * Markera order som betald + broadcasta till restaurang. Provider-neutral
 * motsvarighet till webhookens `succeeded`-case.
 */
export async function finalizePaymentSuccess(
  orderId: string,
  input: FinalizeSuccessInput,
): Promise<FinalizeResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { restaurant: { select: { name: true } }, items: true },
  });
  if (!order) return { ok: false };

  const isAwaitingPayment = order.status === 'AWAITING_PAYMENT';

  // A PSP success is valid only for the provider already frozen on the order.
  // Never let a late legacy webhook overwrite a Mollie binding (or vice versa):
  // the customer may have been charged twice and the row needs human review.
  const providerMatches = order.paymentProvider === input.provider;
  const mollieRefMatches = input.provider !== 'mollie' || order.molliePaymentId === input.ref;
  if (!providerMatches || !mollieRefMatches) {
    console.error('[finalize] provider/ref binding mismatch — order flagged for review', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      storedProvider: order.paymentProvider,
      receivedProvider: input.provider,
    });
    await prisma.order.updateMany({
      where: { id: order.id, paymentStatus: order.paymentStatus },
      data: { paymentStatus: 'NEEDS_REVIEW' },
    });
    getIO().to('admin-room').emit('order:payment_binding_mismatch', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      storedProvider: order.paymentProvider,
      receivedProvider: input.provider,
    });
    return { ok: false, mismatch: true, status: order.status, paymentStatus: 'NEEDS_REVIEW' };
  }

  // Redan återbetald? Skipa — en sen success-webhook får aldrig återöppna en
  // helt eller delvis återbetald order eller dubbelköra reward/usage-logik.
  if (
    order.paymentStatus === 'REFUNDED' ||
    order.paymentStatus === 'PARTIALLY_REFUNDED' ||
    order.paymentStatus === 'REFUNDING'
  ) {
    return { ok: true, status: order.status, paymentStatus: order.paymentStatus };
  }
  if (order.paymentStatus === 'PAID' && !isAwaitingPayment) {
    await repairPaymentBusinessEffects(order.id);
    return { ok: true, status: order.status, paymentStatus: order.paymentStatus };
  }

  // BELOPPS-VERIFIKATION: jämför vad PSP:n faktiskt drog mot orderns total så
  // ingen kan betala mindre än totalen. Tolerans 1 öre för float-rounding.
  // På mismatch: flagga NEEDS_REVIEW och flippa INTE PAID/PENDING.
  const expectedAmount = (order as any).total; // öre
  const receivedAmount = input.amountReceivedOre;
  if (Math.abs(receivedAmount - expectedAmount) > 1) {
    console.error('[finalize] amount mismatch — order NOT marked PAID', {
      orderId: order.id, orderNumber: order.orderNumber, provider: input.provider, expectedAmount, receivedAmount,
    });
    await prisma.order.updateMany({
      where: {
        id: order.id,
        status: order.status,
        paymentStatus: order.paymentStatus,
      },
      data: { paymentStatus: 'NEEDS_REVIEW' },
    }).catch((e: any) => console.error('[finalize] could not flag order for review:', e?.message));
    getIO().to('admin-room').emit('order:amount_mismatch', {
      orderId: order.id, orderNumber: order.orderNumber, expectedAmount, receivedAmount,
    });
    return { ok: false, mismatch: true, status: order.status, paymentStatus: 'NEEDS_REVIEW' };
  }

  // Webhook, return-URL, status-poll and reconcile can all observe PAID at the
  // same time. Exact old-state CAS gives exactly one winner for every visible
  // side effect (terminal alert, printer notification, usage counters).
  const claimed = await prisma.order.updateMany({
    where: {
      id: order.id,
      status: order.status,
      paymentStatus: order.paymentStatus,
    },
    data: {
      paymentStatus: 'PAID',
      paymentProvider: input.provider,
      ...refColumn(input.provider, input.ref),
      ...(isAwaitingPayment ? { status: 'PENDING', paymentMethod: 'ONLINE' } : {}),
    },
  });
  if (claimed.count !== 1) {
    const latest = await prisma.order.findUnique({
      where: { id: order.id },
      select: { status: true, paymentStatus: true },
    });
    return {
      ok: latest?.paymentStatus === 'PAID',
      status: latest?.status,
      paymentStatus: latest?.paymentStatus,
    };
  }

  const updatedOrder = await prisma.order.findUnique({
    where: { id: order.id },
    include: { restaurant: { select: { name: true } }, items: true },
  });
  if (!updatedOrder) return { ok: false };

  await repairPaymentBusinessEffects(order.id);

  // Pending-payment-order: nu bekräftad → broadcasta till restaurang.
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
      void notifyPartnerDevicesOfNewOrder({
        restaurantId: updatedOrder.restaurantId,
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
      });
    }
    // Notifiera kundens order-rum så LiveOrderBanner dyker upp DIREKT när
    // ordern flippar AWAITING_PAYMENT → PENDING (annars väntar bannern på sin
    // 15s-poll innan den syns). Bannern lyssnar på 'order:status' i order:{id}.
    getIO().to(`order:${order.id}`).emit('order:status', { orderId: order.id, status: updatedOrder.status });
  }

  getIO().to('admin-room').emit('order:paid', { orderId: order.id, orderNumber: order.orderNumber });

  console.log(`[finalize] ✅ Order ${order.orderNumber} PAID via ${input.provider} (${input.ref})`);
  return { ok: true, status: updatedOrder.status, paymentStatus: 'PAID' };
}

/** Markera order som FAILED + revert:a reservationer. Provider-neutral. */
export async function finalizePaymentFailed(
  orderId: string,
  input: { provider: PaymentProviderName; ref?: string; reason?: string },
): Promise<void> {
  const failedOrder = await prisma.order.findUnique({
    where: { id: orderId },
    select: { userDealId: true, paymentStatus: true },
  });
  // Redan betald? Rör inte (en sen FAILED-webhook får aldrig nolla en PAID order).
  if (
    failedOrder?.paymentStatus === 'PAID' ||
    failedOrder?.paymentStatus === 'REFUNDED' ||
    failedOrder?.paymentStatus === 'PARTIALLY_REFUNDED' ||
    failedOrder?.paymentStatus === 'REFUNDING'
  ) return;

  const failed = await prisma.order.updateMany({
    where: {
      id: orderId,
      paymentStatus: { notIn: ['PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'REFUNDING'] },
    },
    data: { paymentStatus: 'FAILED' },
  });
  if (failed.count === 0) return;

  if (failedOrder?.userDealId) {
    await prisma.userDeal.updateMany({
      where: { id: failedOrder.userDealId, status: 'RESERVED', usedOnOrderId: orderId },
      data: { status: 'ACTIVE', usedOnOrderId: null },
    }).catch((e: any) => console.error('[finalize] userDeal revert failed:', e?.message));
  }

  console.log(`[finalize] ❌ Order ${orderId} FAILED via ${input.provider}${input.reason ? ` (${input.reason})` : ''}`);
}
