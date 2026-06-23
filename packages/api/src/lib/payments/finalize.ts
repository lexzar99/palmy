/**
 * Provider-neutral money-truth.
 *
 * Detta är den ENDA finaliseringspunkten för en betald order, oavsett PSP.
 * Stripe-versionen (`stripeReconcile.applyPaymentSuccess`) ligger kvar men är
 * vilande medan Stripe är bortkommenterat. Mollie (och senare Adyen) kallar
 * hit istället för att duplicera order-livscykeln.
 *
 * Allt här är idempotent — webhook, reconcile-poller och en ev. klient-driven
 * statuskoll kan alla landa här utan dubbelräkning (race-guards på
 * status/RESERVED/discountUsageCounted/pointsAwarded).
 */
import prisma from '../prisma';
import { getIO } from '../socket';
import { incrementDiscountUsageIfNotCounted } from '../discountUsage';

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

/** Skriver PSP-referensen till rätt kolumn beroende på provider. */
function refColumn(provider: PaymentProviderName, ref: string) {
  if (provider === 'mollie') return { molliePaymentId: ref };
  if (provider === 'stripe') return { stripePaymentIntentId: ref };
  return {}; // adyen: pspReference-kolumn läggs till när vi bygger Adyen
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

  // Redan PAID? Skipa — idempotent.
  if (order.paymentStatus === 'PAID' && !isAwaitingPayment) {
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
    await prisma.order.update({
      where: { id: order.id }, data: { paymentStatus: 'NEEDS_REVIEW' },
    }).catch((e: any) => console.error('[finalize] could not flag order for review:', e?.message));
    getIO().to('admin-room').emit('order:amount_mismatch', {
      orderId: order.id, orderNumber: order.orderNumber, expectedAmount, receivedAmount,
    });
    return { ok: false, mismatch: true, status: order.status, paymentStatus: 'NEEDS_REVIEW' };
  }

  const updatedOrder = await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: 'PAID',
      paymentProvider: input.provider,
      ...refColumn(input.provider, input.ref),
      ...(isAwaitingPayment ? { status: 'PENDING', paymentMethod: 'ONLINE' } : {}),
    },
    include: { restaurant: { select: { name: true } }, items: true },
  });

  // Referral-reward — invitee:s första betalda order. Fail-safe.
  try {
    const { maybeTriggerReferralReward } = await import('../../routes/referrals');
    await maybeTriggerReferralReward(order.id);
  } catch (e: any) {
    console.error('[finalize] referral-reward-trigger error:', e?.message);
  }

  // Dpoints — intjäning. Idempotent (Order.pointsAwarded), fail-safe.
  try {
    const { awardOrderPointsIfNotAwarded } = await import('../dpoints');
    await awardOrderPointsIfNotAwarded(order.id);
  } catch (e: any) {
    console.error('[finalize] dpoints-earn error:', e?.message);
  }

  // UserDeal: reserverad welcome/referral-kupong → USED. Race-guard på RESERVED.
  if ((order as any).userDealId) {
    await prisma.userDeal.updateMany({
      where: { id: (order as any).userDealId, status: 'RESERVED', usedOnOrderId: order.id },
      data: { status: 'USED', usedAt: new Date() },
    }).catch((e: any) => console.error('[finalize] userDeal mark-USED failed:', e?.message));
  }

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
    }
    // Discount/deal usage-increment — idempotent på order-nivå.
    await incrementDiscountUsageIfNotCounted(order.id);
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
  if (failedOrder?.paymentStatus === 'PAID' || failedOrder?.paymentStatus === 'REFUNDED') return;

  await prisma.order.updateMany({
    where: { id: orderId },
    data: { paymentStatus: 'FAILED' },
  });

  if (failedOrder?.userDealId) {
    await prisma.userDeal.updateMany({
      where: { id: failedOrder.userDealId, status: 'RESERVED', usedOnOrderId: orderId },
      data: { status: 'ACTIVE', usedOnOrderId: null },
    }).catch((e: any) => console.error('[finalize] userDeal revert failed:', e?.message));
  }

  // Dpoints: återför poäng som reserverades vid order-skapande. Idempotent.
  try {
    const { revertOrderPointsForRefund } = await import('../dpoints');
    await revertOrderPointsForRefund(orderId);
  } catch (e: any) {
    console.error('[finalize] dpoints revert failed:', e?.message);
  }

  console.log(`[finalize] ❌ Order ${orderId} FAILED via ${input.provider}${input.reason ? ` (${input.reason})` : ''}`);
}
