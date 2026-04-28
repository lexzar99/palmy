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

// Step semantics:
//   DELIVERY (4 steps): 0=Mottagen, 1=Tillagas, 2=På väg, 3=Levererad
//   PICKUP   (3 steps): 0=Mottagen, 1=Tillagas, 2=Redo att hämtas
const STATUS_META: Record<string, StatusMeta> = {
  accepted:        { statusText: "Restaurangen har accepterat din order", progressStep: 0 },
  preparing:       { statusText: "Din mat tillagas just nu",              progressStep: 1 },
  ready_delivery:  { statusText: "Maten är redo — väntar på bud",         progressStep: 1 },
  ready_pickup:    { statusText: "Din mat är klar att hämtas! 🛍️",        progressStep: 2 },
  on_the_way:      { statusText: "Din order är på väg!",                  progressStep: 2 },
  arrived:         { statusText: "Föraren är framme!",                    progressStep: 2 },
  delivered:       { statusText: "Levererad — smaklig måltid! 🎉",        progressStep: 3 },
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
 * The activity auto-fades after ~8 seconds in the Dynamic Island.
 */
export async function endOrderActivity(orderId: string): Promise<void> {
  if (!supported) return;
  try {
    await LA!.endOrderActivity(orderId);
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
