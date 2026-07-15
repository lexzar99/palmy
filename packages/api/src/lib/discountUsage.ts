/**
 * Idempotent discount/deal usage-increment.
 *
 * Bakgrund: både Stripe-webhook (`payment_intent.succeeded`) och
 * `stripeReconcile.ts`-pollern triggar increment av `discountCode.usageCount`
 * och `deal.usageCount` när en order betalas. Utan guard kunde båda räkna
 * samma order = 2x increment.
 *
 * Lösning: Order.discountUsageCounted (Boolean default false). Vi gör en
 * atomisk update med `where: { id, discountUsageCounted: false }` och bara
 * den path som vinner racet incrementar koden/dealet. Andra path:en faller
 * tyst igenom (update träffar 0 rader, "id_discountUsageCounted not found"
 * fångas i .catch).
 */

import prisma from './prisma';

export async function incrementDiscountUsageIfNotCounted(orderId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        discountCode: true,
        appliedDealId: true,
        discountUsageCounted: true,
      },
    });
    if (!order || order.discountUsageCounted) return;

    // Claim + counters share one transaction. A process/DB failure can never
    // persist the guard while silently losing the economic counters.
    const result = await tx.order.updateMany({
      where: { id: order.id, discountUsageCounted: false },
      data: { discountUsageCounted: true },
    });
    if (result.count === 0) return;

    if (
      order.discountCode &&
      order.discountCode !== 'test' &&
      order.discountCode !== 'testa'
    ) {
      await tx.discountCode.updateMany({
        where: { code: order.discountCode.toUpperCase() },
        data: { usageCount: { increment: 1 } },
      });
    }

    if (order.appliedDealId) {
      await tx.deal.updateMany({
        where: { id: order.appliedDealId },
        data: { usageCount: { increment: 1 } },
      });
    }
  });
}
