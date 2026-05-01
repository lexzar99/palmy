/**
 * Auto-finalisation for Live Activities.
 *
 * After the admin marks an order as DELIVERING, the customer-facing UI
 * (Live Activity + order screen) should:
 *   1. Show "På väg" for 15 minutes.
 *   2. Auto-flip to "Levererad" at the 15-min mark.
 *   3. Stay on "Levererad" for ~3 minutes, then dismiss the LA banner.
 *
 * Previously the LA stuck on "På väg" until the user dismissed it manually,
 * because nothing pushed a final state once the human admin had moved on.
 *
 * Strategy: a setInterval (1-minute tick) scans the DB for orders that are
 *   - status = 'DELIVERED'   (DB stores DELIVERED immediately on DELIVERING; see admin.ts)
 *   - deliveringAt is set    (so we know when the 15-min window started)
 *   - liveActivityToken set  (so we have somewhere to push)
 *
 * For each, depending on elapsed time since deliveringAt:
 *   - 15..18 min  → push 'update' with status='delivered' (idempotent in-memory)
 *   - 18+ min     → push 'end' with dismissalDate ~3 min out, then clear token
 *
 * Once the token is cleared the order falls out of the query, so this is
 * naturally self-terminating.
 */

import prisma from './prisma';
import { ApnsError, pushLiveActivityUpdate, sendApnsSilentWake } from './liveActivityPush';
import { computeDeliveryWindowMs } from './deliveryWindow';

// In-memory dedupe: orders that have already received the "delivered" state
// push during this process's lifetime. After a server restart this is empty,
// so a single duplicate push may go out — iOS treats it as a no-op state
// update so the cost is negligible. Once the LA is ended (token cleared) the
// order leaves the query and we drop its id below.
const deliveredPushed = new Set<string>();

const DELIVERED_STATE = {
  status: 'delivered',
  statusText: 'Levererad',
  progressStep: 2,
  etaMinutes: null,
  driverName: null,
  etaEndsAt: null,
};

export async function finalizeStaleLiveActivities(): Promise<void> {
  const orders = await prisma.order.findMany({
    where: {
      status: 'DELIVERED',
      deliveringAt: { not: null },
      liveActivityToken: { not: null },
    },
    select: {
      id: true,
      type: true,
      userId: true,
      customerPhone: true,
      deliveringAt: true,
      liveActivityToken: true,
    },
  });

  const now = Date.now();
  for (const order of orders) {
    const deliveringAtDate = new Date(order.deliveringAt!);
    const elapsed = now - deliveringAtDate.getTime();
    const windowMs = computeDeliveryWindowMs(deliveringAtDate, order.id);
    const token = order.liveActivityToken!;
    const orderType = order.type;

    if (elapsed >= windowMs && !deliveredPushed.has(order.id)) {
      // Fire the JS-wake path FIRST (in parallel with the LA-topic push
      // below). The LA-topic push gets throttled by iOS once the per-app
      // budget is spent, so we can't rely on it as the sole dismiss
      // mechanism. The wake triggers the mobile background task which
      // calls endOrderActivity locally — independent delivery channel.
      void sendSilentWake(order.id, order.userId, order.customerPhone);

      try {
        // Same short dismissal window the admin path uses — iOS removes
        // the LA ~8 s after the push.
        await pushLiveActivityUpdate({
          token,
          event: 'end',
          state: { ...DELIVERED_STATE, orderType },
          dismissalDate: Math.floor(now / 1000) + 8,
        });
        deliveredPushed.add(order.id);
        console.log(`[liveActivityFinalize] ✅ end push sent for order ${order.id}`);
      } catch (e) {
        if (e instanceof ApnsError && e.invalidToken) {
          console.warn('[liveActivityFinalize] invalid token, clearing for', order.id);
        } else {
          console.warn('[liveActivityFinalize] end push failed for', order.id, ':', (e as Error)?.message);
          continue; // retry next tick
        }
      }
      // Clear token — order is done
      await prisma.order
        .update({ where: { id: order.id }, data: { liveActivityToken: null } })
        .catch(() => null);
      deliveredPushed.delete(order.id);
    }
  }
}

async function sendSilentWake(
  orderId: string,
  userId: string | null,
  customerPhone: string,
): Promise<void> {
  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          ...(userId ? [{ id: userId }] : []),
          { phone: customerPhone },
        ],
      },
      select: { apnsDeviceToken: true },
    });
    if (!user?.apnsDeviceToken) return;
    await sendApnsSilentWake({
      token: user.apnsDeviceToken,
      data: { orderId, kind: 'la-wake' },
      collapseId: `order-${orderId}-wake`,
    });
  } catch (e) {
    console.warn('[liveActivityFinalize] silent wake failed for', orderId, ':', (e as Error)?.message);
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startLiveActivityFinalizer(): void {
  if (intervalHandle) return;
  // Run immediately on startup so a server restart that landed mid-window
  // catches up without waiting a minute.
  finalizeStaleLiveActivities().catch((e) =>
    console.error('[liveActivityFinalize] initial run error:', e),
  );
  // ⚠️ TEMP TESTING — 5 s tick (was 60 s) so the auto-DELIVERED finaliser
  // catches the new 20 s deliveryWindow promptly. Revert to 60 * 1000 when
  // the temp window in deliveryWindow.ts is restored.
  intervalHandle = setInterval(() => {
    finalizeStaleLiveActivities().catch((e) =>
      console.error('[liveActivityFinalize] tick error:', e),
    );
  }, 5 * 1000);
}
