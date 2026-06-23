/**
 * Provider-neutral reconcile-poller — skyddsnät om en webhook missas, och
 * PRIMÄR finaliseringskälla i lokal dev (där Mollie inte kan nå localhost-
 * webhooken). Pollar AWAITING_PAYMENT-orders mot PSP:n och finaliserar.
 *
 * Mirror av den gamla Stripe-reconcilen, men via det neutrala interfacet.
 */
import prisma from '../prisma';
import { getPaymentProvider } from './index';
import { finalizePaymentSuccess, finalizePaymentFailed } from './finalize';

/** PSP-referensen för en order beror på providern. */
function refOf(
  order: { molliePaymentId: string | null; stripePaymentIntentId: string | null; adyenSessionId: string | null },
  providerName: string,
) {
  if (providerName === 'mollie') return order.molliePaymentId;
  if (providerName === 'stripe') return order.stripePaymentIntentId;
  if (providerName === 'adyen') return order.adyenSessionId; // Adyen finaliserar via webhook; getRemoteStatus = 'pending'
  return null;
}

export async function reconcilePendingPayments(): Promise<void> {
  const provider = getPaymentProvider();
  const now = Date.now();
  const minAge = new Date(now - 30_000); // minst 30s gammal (hinner inte race:a checkouten)
  const maxAge = new Date(now - 24 * 3600_000); // äldre = övergivet

  const pending = await prisma.order.findMany({
    where: {
      status: 'AWAITING_PAYMENT',
      paymentProvider: provider.name,
      createdAt: { lt: minAge, gt: maxAge },
    },
    select: { id: true, orderNumber: true, molliePaymentId: true, stripePaymentIntentId: true, adyenSessionId: true },
    take: 50,
  });
  if (pending.length === 0) return;

  for (const order of pending) {
    const ref = refOf(order, provider.name);
    if (!ref) continue;
    try {
      const status = await provider.getRemoteStatus(ref);
      if (status.state === 'paid') {
        await finalizePaymentSuccess(order.id, {
          provider: provider.name,
          ref,
          amountReceivedOre: status.amountReceivedOre ?? 0,
        });
      } else if (status.state === 'failed' || status.state === 'canceled' || status.state === 'expired') {
        await finalizePaymentFailed(order.id, { provider: provider.name, ref, reason: status.state });
      }
      // 'open' / 'pending' → låt kunden slutföra; nästa poll fångar det.
    } catch (err: any) {
      console.error(`[reconcile] kunde inte hämta status för ${ref}:`, err?.message);
    }
  }
}

export function startPaymentReconciliation(): void {
  const provider = getPaymentProvider();
  console.log(`[reconcile] startar för provider "${provider.name}" (poll var 15s)`);
  setInterval(() => {
    reconcilePendingPayments().catch((err) => console.error('[reconcile] error:', err));
  }, 15_000);
}
