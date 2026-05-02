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
import {
  ApnsError,
  mapServerStatusToActivity,
  pushLiveActivityUpdate,
  sendApnsSilentWake,
} from './liveActivityPush';
import { computeDeliveryWindowMs } from './deliveryWindow';

const STATUS_TEXT: Record<string, { text: string; step: number }> = {
  accepted:        { text: 'Restaurangen har accepterat din order', step: 0 },
  preparing:       { text: 'Din mat tillagas just nu',              step: 1 },
  ready_delivery:  { text: 'Maten är redo — väntar på bud',         step: 1 },
  ready_pickup:    { text: 'Din mat är klar att hämtas! 🛍️',        step: 2 },
  on_the_way:      { text: 'Din order är på väg!',                  step: 2 },
};

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

/**
 * Heartbeat: re-push the current state to every active LA on a fixed cadence.
 *
 * Why this exists: iOS throttles LA-topic pushes per app, and any single push
 * can be silently dropped — especially when the host app is killed and the
 * widget process is the only thing iOS will deliver to. By re-pushing the
 * current state every minute (priority 5, throttle-friendly) we get N
 * chances for the widget to catch the latest status, instead of betting it
 * all on the one push that fired the moment admin clicked the button.
 *
 * `apns-collapse-id` is implicit via the LA push semantics — iOS only ever
 * shows the most recent state, so duplicates don't stack visually.
 */
async function pushHeartbeatToActiveLiveActivities(): Promise<void> {
  const orders = await prisma.order.findMany({
    where: {
      status: { notIn: ['DELIVERED', 'CANCELLED', 'REJECTED', 'DELIVERY_FAILED'] },
      liveActivityToken: { not: null },
    },
    select: {
      id: true,
      type: true,
      status: true,
      estimatedTime: true,
      preparingAt: true,
      deliveringAt: true,
      liveActivityToken: true,
    },
  });

  for (const order of orders) {
    const token = order.liveActivityToken!;
    const mapped = mapServerStatusToActivity(order.status, order.type);
    if (!mapped || mapped.ends) continue;
    const meta = STATUS_TEXT[mapped.activityStatus];
    if (!meta) continue;

    let etaEndsAtSec: number | null = null;
    if (order.status === 'PREPARING' && order.preparingAt && order.estimatedTime) {
      etaEndsAtSec = Math.floor(
        (new Date(order.preparingAt).getTime() + order.estimatedTime * 60_000) / 1000,
      );
    } else if (order.status === 'DELIVERING' && order.deliveringAt) {
      const windowMs = computeDeliveryWindowMs(new Date(order.deliveringAt), order.id);
      etaEndsAtSec = Math.floor(
        (new Date(order.deliveringAt).getTime() + windowMs) / 1000,
      );
    }

    try {
      await pushLiveActivityUpdate({
        token,
        event: 'update',
        priority: '5',                  // throttle-friendly — heartbeat shouldn't hog the budget
        staleAfterSeconds: 5 * 60,      // fade visually within 5 min if heartbeats stop
        state: {
          status: mapped.activityStatus,
          statusText: meta.text,
          progressStep: meta.step,
          etaMinutes: order.estimatedTime ?? null,
          driverName: null,
          orderType: order.type,
          etaEndsAt: etaEndsAtSec,
        },
      });
    } catch (e) {
      if (e instanceof ApnsError && e.invalidToken) {
        await prisma.order
          .update({ where: { id: order.id }, data: { liveActivityToken: null } })
          .catch(() => null);
      }
    }
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let heartbeatHandle: ReturnType<typeof setInterval> | null = null;

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

  // Heartbeat tick — keeps active LAs fresh across iOS push throttling and
  // host-app kills. 60 s cadence stays well under Apple's per-app LA push
  // budget (~1/min) and uses priority 5 so it's the kind of routine update
  // iOS prefers to deliver in the long run.
  heartbeatHandle = setInterval(() => {
    pushHeartbeatToActiveLiveActivities().catch((e) =>
      console.error('[liveActivityFinalize] heartbeat error:', e),
    );
  }, 60 * 1000);
}
