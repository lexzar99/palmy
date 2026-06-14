import prisma from './prisma';
import { deleteFromR2 } from './r2';

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

/**
 * Expire abandoned AWAITING_PAYMENT orders (payment never completed). Runs every
 * few minutes (much more often than the daily cleanup). After ~5 min an unpaid
 * order is a dead checkout — the Stripe reconcile loop (60s) would already have
 * flipped any real success to PENDING. We revert any reserved UserDeal, then
 * delete the order (OrderItems cascade) so abandoned orders don't pile up in the
 * DB AND so the customer's live-order banner stops being stuck forever (its poll
 * then 404s and self-clears).
 *
 * Safe against races: the deleteMany re-asserts status=AWAITING_PAYMENT and
 * paymentStatus != PAID, so an order that just got paid is never deleted.
 *
 * TTL var tidigare 30 min — nu 5 min. Cart-sidan abandonar normalt direkt
 * (POST /orders/:id/abandon vid Stripe-cancel + sendBeacon vid pagehide), så
 * cronen är bara en backup för edge-cases (kund stänger taben innan
 * pagehide-handlern hinner registreras, eller sendBeacon failade). Inom 5 min
 * är ordern garanterat borta, så "Pågående beställning" på hemskärmen
 * försvinner snabbt även när den primära cancel-vägen missar.
 */
export async function expireAbandonedAwaitingPayment(): Promise<void> {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000);
  try {
    const abandoned = await prisma.order.findMany({
      where: {
        status: 'AWAITING_PAYMENT',
        paymentStatus: { not: 'PAID' },
        createdAt: { lt: cutoff },
      },
      select: { id: true, orderNumber: true, userDealId: true },
      take: 200,
    });
    if (abandoned.length === 0) return;

    // Revert any reserved deal so it isn't left stuck on a deleted order.
    for (const o of abandoned) {
      if (o.userDealId) {
        await prisma.userDeal
          .updateMany({
            where: { id: o.userDealId, status: 'RESERVED', usedOnOrderId: o.id },
            data: { status: 'ACTIVE', usedOnOrderId: null },
          })
          .catch(() => {});
      }
      // Dpoints: ge tillbaka poäng som reserverades vid order-skapande (köp-med-
      // poäng) innan ordern raderas. Idempotent.
      try {
        const { revertOrderPointsForRefund } = await import('./dpoints');
        await revertOrderPointsForRefund(o.id);
      } catch {
        /* ignore */
      }
    }

    const deleted = await prisma.order.deleteMany({
      where: {
        id: { in: abandoned.map((o) => o.id) },
        status: 'AWAITING_PAYMENT',
        paymentStatus: { not: 'PAID' },
      },
    });
    if (deleted.count > 0) {
      console.log(`🧹 Raderade ${deleted.count} övergivna AWAITING_PAYMENT-order(s) äldre än 5 min.`);
    }
  } catch (error) {
    console.error('❌ expireAbandonedAwaitingPayment failed:', error);
  }
}
