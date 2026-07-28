import prisma from './prisma';
import { deleteFromR2 } from './r2';
import { getPaymentProviderByName } from './payments';
import { finalizePaymentFailed, finalizePaymentSuccess } from './payments/finalize';
import type { PaymentProviderName } from './payments/finalize';

/**
 * Radera leveransbevis-bilder vars TTL gått ut (≈ 2 dygn). Bilden tas bort
 * permanent från R2 och fälten nollas på leveransen — själva leveransraden
 * och kurirens order-Note ligger kvar (historiken bevaras, bara fotot rensas).
 */
export async function cleanupExpiredDeliveryProofs(): Promise<void> {
  const now = new Date();
  try {
    const expired = await prisma.delivery.findMany({
      where: { proofExpiresAt: { lt: now }, proofPhotoKey: { not: null } },
      select: { id: true, proofPhotoKey: true },
      take: 500,
    });
    if (expired.length === 0) return;
    for (const d of expired) {
      try {
        if (d.proofPhotoKey) await deleteFromR2(d.proofPhotoKey);
      } catch (e) {
        console.warn('[cleanup] kunde inte radera leveransbild från R2:', (e as Error)?.message);
        // Fortsätt ändå nolla fälten så vi inte fastnar i en loop på samma rad.
      }
      await prisma.delivery
        .update({ where: { id: d.id }, data: { proofPhotoUrl: null, proofPhotoKey: null, proofExpiresAt: null } })
        .catch(() => null);
    }
    console.log(`🧹 Raderade ${expired.length} utgångna leveransbevis-bilder.`);
  } catch (error) {
    console.error('❌ cleanupExpiredDeliveryProofs failed:', error);
  }
}

/**
 * Daily cleanup job to remove expired or stale data.
 * Keeps the database lean and prevents buildup of transient records.
 */
export async function runDailyCleanup(): Promise<void> {
  console.log('🧹 Starting daily database cleanup...');
  const now = new Date();

  try {
    // 1. Cleanup expired verification codes
    const deletedCodes = await prisma.verificationCode.deleteMany({
      where: { expiresAt: { lt: now } }
    });
    if (deletedCodes.count > 0) {
      console.log(`✅ Deleted ${deletedCodes.count} expired verification codes.`);
    }

    // 2. Cleanup expired order drafts
    const deletedDrafts = await prisma.orderDraft.deleteMany({
      where: { expiresAt: { lt: now } }
    });
    if (deletedDrafts.count > 0) {
      console.log(`✅ Deleted ${deletedDrafts.count} expired order drafts.`);
    }

    // 3. Cleanup old abandoned group orders (OPEN after 48h)
    const staleThreshold = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const deletedGroups = await (prisma as any).groupOrder.deleteMany({
      where: {
        status: 'OPEN',
        createdAt: { lt: staleThreshold }
      }
    });
    if (deletedGroups.count > 0) {
      console.log(`✅ Deleted ${deletedGroups.count} abandoned group orders.`);
    }

    // 4. Radera utgångna leveransbevis-bilder (≈2 dygn TTL).
    await cleanupExpiredDeliveryProofs();

    console.log('✨ Cleanup complete.');
  } catch (error) {
    console.error('❌ Cleanup job failed:', error);
  }
}

export const AWAITING_PAYMENT_TIMEOUT_MINUTES = 15;

async function markAwaitingPaymentExpired(
  orderId: string,
  provider: PaymentProviderName,
  ref: string | undefined,
  reason: string,
) {
  await finalizePaymentFailed(orderId, { provider, ref, reason });
  // Försvinner från alla aktiva orderflöden, men själva revisionsraden behålls.
  // Hard-delete vore osäkert om en sen PSP-webhook behöver utredas.
  await prisma.order.updateMany({
    where: {
      id: orderId,
      status: 'AWAITING_PAYMENT',
      paymentStatus: 'FAILED',
    },
    data: { status: 'CANCELLED' },
  });
}

/**
 * Stäm av AWAITING_PAYMENT efter 15 minuter. Betald vinner alltid. En öppen
 * Mollie-betalning avbryts först hos Mollie och flyttas därefter atomiskt bort
 * från aktiva ordrar. Underlaget hard-delete:as aldrig, så en PSP-avvikelse kan
 * spåras och en betald order kan aldrig råka raderas.
 */
export async function expireAbandonedAwaitingPayment(): Promise<void> {
  const cutoff = new Date(
    Date.now() - AWAITING_PAYMENT_TIMEOUT_MINUTES * 60 * 1000,
  );
  try {
    const abandoned = await prisma.order.findMany({
      where: {
        status: 'AWAITING_PAYMENT',
        paymentStatus: 'PENDING',
        createdAt: { lt: cutoff },
      },
      select: {
        id: true,
        orderNumber: true,
        paymentProvider: true,
        molliePaymentId: true,
        stripePaymentIntentId: true,
        adyenSessionId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    if (abandoned.length === 0) return;

    for (const order of abandoned) {
      if (!['mollie', 'stripe', 'adyen'].includes(order.paymentProvider)) {
        await markAwaitingPaymentExpired(
          order.id,
          'stripe',
          undefined,
          'unknown-provider-timeout',
        );
        continue;
      }
      const provider = getPaymentProviderByName(order.paymentProvider as PaymentProviderName);
      const ref =
        provider.name === 'mollie'
          ? order.molliePaymentId
          : provider.name === 'stripe'
            ? order.stripePaymentIntentId
            : order.adyenSessionId;
      if (!ref) {
        await markAwaitingPaymentExpired(
          order.id,
          provider.name,
          undefined,
          'no-payment-reference-timeout',
        );
        continue;
      }
      try {
        let remote = await provider.getRemoteStatus(ref);
        if (remote.state === 'paid') {
          await finalizePaymentSuccess(order.id, {
            provider: provider.name,
            ref: remote.paymentIntentId || ref,
            amountReceivedOre: remote.amountReceivedOre ?? 0,
          });
          continue;
        }
        if (
          (remote.state === 'open' || remote.state === 'pending') &&
          provider.cancelPayment
        ) {
          remote = await provider.cancelPayment(ref);
          if (remote.state === 'paid') {
            await finalizePaymentSuccess(order.id, {
              provider: provider.name,
              ref: remote.paymentIntentId || ref,
              amountReceivedOre: remote.amountReceivedOre ?? 0,
              method: remote.method,
            });
            continue;
          }
        }
        if (['failed', 'canceled', 'expired'].includes(remote.state)) {
          await markAwaitingPaymentExpired(
            order.id,
            provider.name,
            ref,
            `awaiting-payment-timeout:${remote.state}`,
          );
        }
      } catch (error) {
        console.error(
          `[cleanup] PSP-status misslyckades för ${order.orderNumber}:`,
          (error as Error)?.message,
        );
      }
    }
  } catch (error) {
    console.error('❌ expireAbandonedAwaitingPayment failed:', error);
  }
}
