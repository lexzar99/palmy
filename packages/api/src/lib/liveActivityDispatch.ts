/**
 * Single source of truth for "push the current order state into the iOS
 * Live Activity". Reads the order from the DB, mirrors the same
 * status/etaEndsAt mapping the customer-facing GET /api/orders/:id uses,
 * and dispatches the APNs push.
 *
 * Called from:
 *   - PATCH /api/admin/orders/:id/status         (admin status flow)
 *   - PATCH /api/admin/orders/:id                (general order edit, can flip status)
 *   - POST  /api/orders/:id/live-activity-token  (catch-up after token finally arrives)
 *   - POST  /api/orders/:id/live-activity-push   (dedicated trigger, debug + cron)
 *
 * Centralising the dispatch is what stops the LA from getting stuck on
 * "Mottagen": every code path that mutates an order's customer-visible
 * status now goes through here, so we can never accidentally update the
 * DB + emit a socket event but forget the APNs push.
 */
import prisma from './prisma';
import {
  pushOrderStatusUpdate,
  ApnsError,
} from './liveActivityPush';
import { computeDeliveryWindowMs } from './deliveryWindow';

export interface DispatchOptions {
  /**
   * Override the server status used to drive the LA. When omitted we read
   * it from the DB and apply the DELIVERED→DELIVERING window. Pass an
   * explicit status when the caller already knows the target step (e.g.
   * the admin status route, where we want to push DELIVERING even though
   * the row was just stored as DELIVERED).
   */
  serverStatus?: string;
  alertBody?: string;
}

export async function pushLiveActivityForOrder(
  orderId: string,
  options: DispatchOptions = {},
): Promise<{ ok: boolean; reason: string; status?: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      type: true,
      estimatedTime: true,
      preparingAt: true,
      deliveringAt: true,
      liveActivityToken: true,
    },
  });
  if (!order) {
    console.warn(`[la-dispatch] order=${orderId} not found`);
    return { ok: false, reason: 'order-not-found' };
  }
  if (!order.liveActivityToken) {
    console.log(`[la-dispatch] order=${orderId} has no LA token yet — skipping push`);
    return { ok: false, reason: 'no-token' };
  }

  // Mirror GET /api/orders/:id: while deliveringAt is fresh (<20 min), the
  // customer-facing status is DELIVERING even though the DB row has already
  // flipped to DELIVERED. Use the same view here so the LA matches the
  // in-app banner step exactly.
  let customerStatus = options.serverStatus ?? order.status;
  if (
    !options.serverStatus &&
    order.status === 'DELIVERED' &&
    order.deliveringAt
  ) {
    const minutesSinceDelivering =
      (Date.now() - new Date(order.deliveringAt).getTime()) / 60000;
    if (minutesSinceDelivering < 20) customerStatus = 'DELIVERING';
  }

  let etaEndsAt: Date | null = null;
  if (customerStatus === 'PREPARING' && order.preparingAt && order.estimatedTime) {
    etaEndsAt = new Date(
      new Date(order.preparingAt).getTime() + order.estimatedTime * 60_000,
    );
  } else if (customerStatus === 'DELIVERING' && order.deliveringAt) {
    const deliveringAtDate = new Date(order.deliveringAt);
    const windowMs = computeDeliveryWindowMs(deliveringAtDate, order.id);
    etaEndsAt = new Date(deliveringAtDate.getTime() + windowMs);
  }

  console.log(
    `[la-dispatch] order=${orderId} customerStatus=${customerStatus} etaEndsAt=${etaEndsAt?.toISOString() ?? 'null'} token=${order.liveActivityToken.slice(0, 12)}…`,
  );

  try {
    await pushOrderStatusUpdate({
      token: order.liveActivityToken,
      serverStatus: customerStatus,
      orderType: order.type,
      etaMinutes: order.estimatedTime ?? null,
      etaEndsAt,
      alertBody: options.alertBody,
    });
    console.log(`[la-dispatch] ✅ order=${orderId} status=${customerStatus} delivered`);
    return { ok: true, reason: 'pushed', status: customerStatus };
  } catch (e: any) {
    console.warn(
      `[la-dispatch] ❌ order=${orderId} push failed:`,
      e?.message,
      e instanceof ApnsError ? `reason=${e.reason} apnsStatus=${e.status}` : '',
    );
    if (e instanceof ApnsError && e.invalidToken) {
      await prisma.order
        .updateMany({
          where: { id: orderId },
          data: { liveActivityToken: null },
        })
        .catch(() => null);
      return { ok: false, reason: `invalid-token:${e.reason}` };
    }
    return { ok: false, reason: e?.message ?? 'unknown-error' };
  }
}
