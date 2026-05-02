/**
 * Live Activities / Dynamic Island — JavaScript wrapper
 *
 * Maps human-readable order statuses to:
 *  - statusText (Swedish, shown in Dynamic Island)
 *  - progressStep (0-2, drives the 3 progress capsules)
 *  - showsTimer (whether the active step should render a countdown)
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
  endOrderActivity(orderId: string): Promise<void>;
  endAllActivities(): Promise<void>;
  addListener(event: "onPushTokenUpdate", cb: (e: { orderId: string; token: string }) => void): { remove: () => void };
};

const LA = Platform.OS === "ios"
  ? (requireOptionalNativeModule("LiveActivities") as LiveActivitiesNative | null)
  : null;

const supported = Platform.OS === "ios" && !!LA && (() => {
  try { return LA!.isSupported(); } catch { return false; }
})();

// ── Push token reporting ─────────────────────────────────────────────────────
// Push tokens are unique per Activity. We only want to POST a given token to
// the backend once per success. On failure we *don't* mark the token as sent
// so the next pushTokenUpdate event re-tries; we also schedule a backoff retry
// straight away so we don't have to wait for iOS to rotate the token.
const reportedTokens = new Map<string, string>();
const pendingRetries = new Map<string, ReturnType<typeof setTimeout>>();
// Module-level guard so Fast Refresh doesn't double-subscribe in dev.
let listenerAttached = false;
let listenerSubscription: { remove: () => void } | null = null;

async function reportToken(orderId: string, token: string, attempt = 0): Promise<void> {
  console.log(`[LA] POST /live-activity-token for order=${orderId}, token=${token.slice(0, 16)}… attempt=${attempt}`);
  try {
    const res = await api.post(`/api/orders/${orderId}/live-activity-token`, { token });
    console.log(`[LA] ✅ token registered for order=${orderId}, status=${res.status}`);
    reportedTokens.set(orderId, token);
    const pending = pendingRetries.get(orderId);
    if (pending) {
      clearTimeout(pending);
      pendingRetries.delete(orderId);
    }
  } catch (e: any) {
    console.warn(`[LA] ❌ token POST failed (attempt ${attempt}) for order=${orderId}:`, e?.response?.status, e?.response?.data, e?.message);
    if (attempt >= 4) return;
    const delay = Math.min(2000 * Math.pow(2, attempt), 16000);
    const handle = setTimeout(() => { reportToken(orderId, token, attempt + 1); }, delay);
    pendingRetries.set(orderId, handle);
  }
}

console.log(`[LA] module loaded — supported=${supported}, LA=${!!LA}`);

if (supported && LA && !listenerAttached) {
  try {
    listenerSubscription = LA.addListener("onPushTokenUpdate", ({ orderId, token }) => {
      console.log(`[LA] 📨 onPushTokenUpdate event received for order=${orderId}, token=${token?.slice(0, 16)}…`);
      if (!orderId || !token) return;
      if (reportedTokens.get(orderId) === token) {
        console.log(`[LA] token already reported for order=${orderId}, skipping`);
        return;
      }
      const pending = pendingRetries.get(orderId);
      if (pending) {
        clearTimeout(pending);
        pendingRetries.delete(orderId);
      }
      reportToken(orderId, token);
    });
    listenerAttached = true;
    console.log(`[LA] ✅ onPushTokenUpdate listener attached`);
  } catch (e) {
    console.warn("[LA] ❌ could not subscribe to token updates:", e);
  }
} else {
  console.warn(`[LA] listener NOT attached — supported=${supported}, LA=${!!LA}, listenerAttached=${listenerAttached}`);
}

// ── Status helpers ─────────────────────────────────────────────────────────────
type OrderStatus =
  | "accepted"
  | "preparing"
  | "ready_delivery"
  | "ready_pickup"
  | "on_the_way"
  | "delivered"
  | "cancelled";

interface StatusMeta {
  statusText: string;
  progressStep: number;
  /** When false, the active step's countdown is suppressed regardless of etaEndsAt. */
  showsTimer: boolean;
}

// Step semantics (both DELIVERY and PICKUP are 3 steps):
//   DELIVERY: 0=Mottagen, 1=Tillagas, 2=På väg
//   PICKUP:   0=Mottagen, 1=Tillagas, 2=Redo att hämtas
// `delivered` and `cancelled` never render — the LA is dismissed the moment
// the order hits a terminal status. progressStep is left at 2 so any
// in-flight render before dismissal stays on the last visible step.
//
// `ready_delivery` keeps step=1 (so the bubble doesn't appear to regress
// once the rider eventually picks the order up) but suppresses the cooking
// countdown — the food is done, no timer should be ticking.
const STATUS_META: Record<string, StatusMeta> = {
  accepted:        { statusText: "Restaurangen har accepterat din order", progressStep: 0, showsTimer: false },
  preparing:       { statusText: "Din mat tillagas just nu",              progressStep: 1, showsTimer: true  },
  ready_delivery:  { statusText: "Maten är redo — väntar på bud",         progressStep: 1, showsTimer: false },
  ready_pickup:    { statusText: "Din mat är klar att hämtas! 🛍️",        progressStep: 2, showsTimer: false },
  on_the_way:      { statusText: "Din order är på väg!",                  progressStep: 2, showsTimer: true  },
  delivered:       { statusText: "Levererad",                             progressStep: 2, showsTimer: false },
  cancelled:       { statusText: "Ordern avbruten",                       progressStep: 0, showsTimer: false },
};

function meta(status: string): StatusMeta {
  return STATUS_META[status] ?? { statusText: status, progressStep: 0, showsTimer: false };
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
 *
 * Pass `etaEndsAt` (Unix seconds) so the Dynamic Island countdown starts ticking
 * from second 1 instead of waiting for the first server-side push to arrive.
 */
export async function startOrderActivity(params: {
  orderId: string;
  restaurantName: string;
  orderTotal: number;   // in kr
  etaMinutes?: number;
  etaEndsAt?: number;   // Unix epoch seconds
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
      etaEndsAt:      params.etaEndsAt ?? null,
    });
    return id;
  } catch (e) {
    console.warn("[LiveActivities] startOrderActivity failed:", e);
    return null;
  }
}

/**
 * Call whenever the order status changes.
 *
 * `etaEndsAt` is force-cleared when the active step shouldn't show a
 * countdown (e.g. `ready_delivery`) — otherwise the food-is-done state would
 * keep showing a "Tillagas: 03:21" timer that no longer makes sense.
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
    const safeEndsAt = m.showsTimer ? (options?.etaEndsAt ?? null) : null;
    await LA!.updateOrderActivity(orderId, {
      status,
      statusText:   m.statusText,
      progressStep: m.progressStep,
      etaMinutes:   options?.etaMinutes ?? null,
      driverName:   options?.driverName ?? null,
      orderType:    options?.orderType ?? null,
      etaEndsAt:    safeEndsAt,
    });
  } catch (e) {
    console.warn("[LiveActivities] updateOrderActivity failed:", e);
  }
}

/**
 * Call when the order is delivered or cancelled to dismiss the Live Activity.
 * iOS removes the activity ~8 seconds after the call.
 */
export async function endOrderActivity(orderId: string): Promise<void> {
  if (!supported) return;
  // Drop any pending token retry for this order — the activity is going away.
  const pending = pendingRetries.get(orderId);
  if (pending) {
    clearTimeout(pending);
    pendingRetries.delete(orderId);
  }
  reportedTokens.delete(orderId);
  try {
    await LA!.endOrderActivity(orderId);
  } catch (e) {
    console.warn("[LiveActivities] endOrderActivity failed:", e);
  }
}

/** End all active MatGo Live Activities (e.g. on app reset). */
export async function endAllOrderActivities(): Promise<void> {
  if (!supported) return;
  for (const handle of pendingRetries.values()) clearTimeout(handle);
  pendingRetries.clear();
  reportedTokens.clear();
  try {
    await LA!.endAllActivities();
  } catch (e) {
    console.warn("[LiveActivities] endAllActivities failed:", e);
  }
}

/**
 * Deprecated — no-op kept for backwards compatibility with bg-task imports.
 *
 * The Live Activity is owned exclusively by the backend over the APNs
 * `liveactivity` topic plus the native scheduled auto-end Task in Swift.
 * JS no longer participates in update or end — coupling them caused the
 * "banner stops, LA stops" symptom. JS only calls startOrderActivity once
 * at order placement; everything after is push-driven.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function syncOrderActivityFromServer(_orderId: string): Promise<void> {
  return;
}
