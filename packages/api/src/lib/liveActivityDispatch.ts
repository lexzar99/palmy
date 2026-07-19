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
  isApnsConfigured,
} from './liveActivityPush';
import { customerStepEtaEndsAt } from './orderEta';

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
  // Hard-fail loudly when APNs isn't wired. Without these env vars on
  // Railway the killed-app path can never work — Apple's APNs HTTP/2 is
  // the ONLY transport that updates a Live Activity in a dead app. If
  // this fires in production, set APNS_KEY_ID / APNS_TEAM_ID /
  // APNS_BUNDLE_ID / APNS_KEY_P8 in Railway env and redeploy.
  if (!isApnsConfigured()) {
    console.error(
      `[la-dispatch] ❌ order=${orderId} APNs NOT CONFIGURED — killed-app LA push is dead. ` +
      `Set APNS_KEY_ID / APNS_TEAM_ID / APNS_BUNDLE_ID / APNS_KEY_P8 on Railway.`
    );
    return { ok: false, reason: 'apns-not-configured' };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      type: true,
      estimatedTime: true,
      preparingAt: true,
      deliveringAt: true,
      etaReadyAt: true,
      etaCustomerAt: true,
      etaCustomerMin: true,
      liveActivityToken: true,
      restaurant: { select: { selfDelivery: true } },
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

  // DB status is the source of truth. The lifecycle worker keeps self-delivery
  // in DELIVERING for 15 minutes and only then writes DELIVERED.
  const customerStatus = options.serverStatus ?? order.status;

  const etaEndsAt = customerStepEtaEndsAt(order, customerStatus);

  console.log(
    `[la-dispatch] order=${orderId} customerStatus=${customerStatus} etaEndsAt=${etaEndsAt?.toISOString() ?? 'null'} token=${order.liveActivityToken.slice(0, 12)}…`,
  );

  try {
    await pushOrderStatusUpdate({
      token: order.liveActivityToken,
      serverStatus: customerStatus,
      orderType: order.type,
      etaMinutes: customerStatus === 'DELIVERING'
        ? order.etaCustomerMin ?? order.estimatedTime ?? null
        : order.estimatedTime ?? null,
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
