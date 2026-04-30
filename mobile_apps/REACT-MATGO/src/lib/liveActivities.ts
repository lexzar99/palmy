/**
 * Live Activities / Dynamic Island — JavaScript wrapper
 *
 * Maps human-readable order statuses to:
 *  - statusText (Swedish, shown in Dynamic Island)
 *  - progressStep (0-4, drives the progress capsules)
 *
 * All functions are no-ops on Android and on iOS < 16.2.
 */

import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";
import { api } from "./api";

type LiveActivitiesNative = {
  isSupported(): boolean;
  startOrderActivity(params: Record<string, unknown>): Promise<string>;
  updateOrderActivity(orderId: string, params: Record<string, unknown>): Promise<void>;
  endOrderActivity(orderId: string, options: Record<string, unknown>): Promise<void>;
  endAllActivities(): Promise<void>;
  addListener(event: "onPushTokenUpdate", cb: (e: { orderId: string; token: string }) => void): { remove: () => void };
};

const LA = Platform.OS === "ios"
  ? (requireOptionalNativeModule("LiveActivities") as LiveActivitiesNative | null)
  : null;

const supported = Platform.OS === "ios" && !!LA && (() => {
  try { return LA!.isSupported(); } catch { return false; }
})();

// Push tokens are unique per Activity. We only want to POST a given token to
// the backend once — subsequent identical events are ignored.
const reportedTokens = new Map<string, string>();

if (supported && LA) {
  try {
    LA.addListener("onPushTokenUpdate", ({ orderId, token }) => {
      if (!orderId || !token) return;
      if (reportedTokens.get(orderId) === token) return;
      reportedTokens.set(orderId, token);
      api.post(`/api/orders/${orderId}/live-activity-token`, { token })
        .catch((e) => console.warn("[LiveActivities] token POST failed:", e?.message));
    });
  } catch (e) {
    console.warn("[LiveActivities] could not subscribe to token updates:", e);
  }
}

// ── Status helpers ─────────────────────────────────────────────────────────────
type OrderStatus =
  | "accepted"
  | "preparing"
  | "ready_delivery"
  | "ready_pickup"
  | "on_the_way"
  | "arrived"
  | "delivered"
  | "cancelled";

interface StatusMeta {
  statusText: string;
  progressStep: number;
}

// Step semantics (both DELIVERY and PICKUP are 3 steps):
//   DELIVERY: 0=Mottagen, 1=Tillagas, 2=På väg
//   PICKUP:   0=Mottagen, 1=Tillagas, 2=Redo att hämtas
// `delivered` and `cancelled` never render — the LA is dismissed the moment
// the order hits a terminal status. progressStep is left at 2 so any
// in-flight render before dismissal stays on the last visible step.
const STATUS_META: Record<string, StatusMeta> = {
  accepted:        { statusText: "Restaurangen har accepterat din order", progressStep: 0 },
  preparing:       { statusText: "Din mat tillagas just nu",              progressStep: 1 },
  ready_delivery:  { statusText: "Maten är redo — väntar på bud",         progressStep: 1 },
  ready_pickup:    { statusText: "Din mat är klar att hämtas! 🛍️",        progressStep: 2 },
  on_the_way:      { statusText: "Din order är på väg!",                  progressStep: 2 },
  arrived:         { statusText: "Föraren är framme!",                    progressStep: 2 },
  delivered:       { statusText: "Levererad",                             progressStep: 2 },
  cancelled:       { statusText: "Ordern avbruten",                       progressStep: 0 },
};

function meta(status: string): StatusMeta {
  return STATUS_META[status] ?? { statusText: status, progressStep: 0 };
}

/**
 * Translate a server-side order status (ACCEPTED, PREPARING, READY, DELIVERING,
 * DELIVERED, REJECTED, CANCELLED, DELIVERY_FAILED) to the LiveActivity status
 * string. Returns null when the status should end the activity rather than
 * update it (delivered / cancelled / rejected / failed).
 */
export function mapServerStatusToActivity(
  serverStatus: string,
  orderType: "DELIVERY" | "PICKUP" | string | null | undefined
): { status: OrderStatus; ends: boolean } | null {
  const isPickup = orderType === "PICKUP";
  switch (serverStatus) {
    case "PENDING":
    case "ACCEPTED":
      return { status: "accepted", ends: false };
    case "PREPARING":
      return { status: "preparing", ends: false };
    case "READY":
      return isPickup
        ? { status: "ready_pickup", ends: false }
        : { status: "ready_delivery", ends: false };
    case "DELIVERING":
    case "OUT_FOR_DELIVERY":
      return { status: "on_the_way", ends: false };
    case "DELIVERED":
    case "COMPLETED":
      return { status: "delivered", ends: true };
    case "REJECTED":
    case "CANCELLED":
    case "DELIVERY_FAILED":
      return { status: "cancelled", ends: true };
    default:
      return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Call immediately after an order is placed successfully.
 * Returns the native activity ID (or null on unsupported platforms).
 */
export async function startOrderActivity(params: {
  orderId: string;
  restaurantName: string;
  orderTotal: number;   // in kr
  etaMinutes?: number;
  orderType?: "DELIVERY" | "PICKUP";
}): Promise<string | null> {
  if (!supported) return null;
  try {
    const m = meta("accepted");
    const id = await LA!.startOrderActivity({
      orderId:        params.orderId,
      restaurantName: params.restaurantName,
      orderTotal:     `${params.orderTotal} kr`,
      status:         "accepted",
      statusText:     m.statusText,
      progressStep:   m.progressStep,
      etaMinutes:     params.etaMinutes ?? null,
      orderType:      params.orderType ?? "DELIVERY",
      etaEndsAt:      null,
    });
    return id;
  } catch (e) {
    console.warn("[LiveActivities] startOrderActivity failed:", e);
    return null;
  }
}

/**
 * Call whenever the order status changes.
 * `status` must be one of: accepted | preparing | on_the_way | arrived | delivered | cancelled
 */
export async function updateOrderActivity(
  orderId: string,
  status: OrderStatus,
  options?: {
    etaMinutes?: number;
    driverName?: string;
    orderType?: "DELIVERY" | "PICKUP";
    etaEndsAt?: number | null; // Unix epoch *seconds*
  }
): Promise<void> {
  if (!supported) return;
  try {
    const m = meta(status);
    await LA!.updateOrderActivity(orderId, {
      status,
      statusText:   m.statusText,
      progressStep: m.progressStep,
      etaMinutes:   options?.etaMinutes ?? null,
      driverName:   options?.driverName ?? null,
      orderType:    options?.orderType ?? null,
      etaEndsAt:    options?.etaEndsAt ?? null,
    });
  } catch (e) {
    console.warn("[LiveActivities] updateOrderActivity failed:", e);
  }
}

/**
 * Call when the order is delivered or cancelled to dismiss the Live Activity.
 *
 * options.dismissalSeconds — how long iOS keeps the activity visible after
 *   the end signal. Default 8 (good for "cancelled" toasts). Pass 120 for
 *   "Levererad" so the user has time to read the final step before iOS
 *   removes it.
 * options.finalStatus — optional status to render during the dismissal
 *   window. When supplied, iOS displays this state even if a prior update
 *   was throttled by APNs (the LA "Levererad" fallback). Currently only
 *   "delivered" is wired up here; extend if other final states ever need it.
 */
export async function endOrderActivity(
  orderId: string,
  options?: {
    dismissalSeconds?: number;
    finalStatus?: OrderStatus;
    orderType?: "DELIVERY" | "PICKUP";
  }
): Promise<void> {
  if (!supported) return;
  try {
    const nativeOptions: Record<string, unknown> = {};
    if (typeof options?.dismissalSeconds === "number") {
      nativeOptions.dismissalSeconds = options.dismissalSeconds;
    }
    if (options?.finalStatus) {
      const m = meta(options.finalStatus);
      nativeOptions.state = {
        status:       options.finalStatus,
        statusText:   m.statusText,
        progressStep: m.progressStep,
        etaMinutes:   null,
        driverName:   null,
        orderType:    options.orderType ?? null,
        etaEndsAt:    null,
      };
    }
    await LA!.endOrderActivity(orderId, nativeOptions);
  } catch (e) {
    console.warn("[LiveActivities] endOrderActivity failed:", e);
  }
}

/** End all active MatGo Live Activities (e.g. on app reset). */
export async function endAllOrderActivities(): Promise<void> {
  if (!supported) return;
  try {
    await LA!.endAllActivities();
  } catch (e) {
    console.warn("[LiveActivities] endAllActivities failed:", e);
  }
}

/**
 * Force-resync a single order's LiveActivity from server state.
 *
 * Used as a fallback when the dedicated LA APNs push gets throttled (e.g. the
 * user hasn't enabled "Frequent Updates" in Settings → FoodGo → Live
 * Activities). The accompanying alert-style push that arrives at the same
 * moment carries `content-available: 1`, which iOS uses to briefly wake JS in
 * the background. From there we hit `/api/orders/:id` and call
 * `Activity.update()` directly, so the Dynamic Island catches up regardless of
 * whether the LA-topic push made it through.
 */
export async function syncOrderActivityFromServer(orderId: string): Promise<void> {
  if (!supported || !orderId) return;
  try {
    const res = await api.get(`/api/orders/${orderId}`);
    const data = res.data || {};
    const orderType: "DELIVERY" | "PICKUP" | undefined = data.orderType || data.type;
    const serverStatus: string | undefined = data.status;
    if (!serverStatus) return;
    const mapped = mapServerStatusToActivity(serverStatus, orderType);
    if (!mapped) return;

    const eta: number | null = data.estimatedTime ?? null;
    const etaEndsAt: number | null = data.etaEndsAt
      ? Math.floor(new Date(data.etaEndsAt).getTime() / 1000)
      : null;

    if (mapped.ends) {
      // No "Levererad" final step — iOS' frequent-updates throttle makes
      // late state changes during the dismissal window unreliable, so the
      // LA would get stuck on "På väg". Skip the update entirely and yank
      // the activity right away.
      await endOrderActivity(orderId, { dismissalSeconds: 0 });
      return;
    }

    await updateOrderActivity(orderId, mapped.status, {
      etaMinutes: eta ?? undefined,
      orderType,
      etaEndsAt,
    });
  } catch (e) {
    console.warn("[LiveActivities] syncOrderActivityFromServer failed:", e);
  }
}
