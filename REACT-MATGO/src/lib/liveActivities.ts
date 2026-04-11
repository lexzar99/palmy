/**
 * Live Activities / Dynamic Island — JavaScript wrapper
 *
 * Maps human-readable order statuses to:
 *  - statusText (Swedish, shown in Dynamic Island)
 *  - progressStep (0-4, drives the progress capsules)
 *
 * All functions are no-ops on Android and on iOS < 16.2.
 */

import { NativeModulesProxy } from "expo-modules-core";
import { Platform } from "react-native";

const LA = NativeModulesProxy.LiveActivities as {
  isSupported(): boolean;
  startOrderActivity(params: Record<string, unknown>): Promise<string>;
  updateOrderActivity(orderId: string, params: Record<string, unknown>): Promise<void>;
  endOrderActivity(orderId: string): Promise<void>;
  endAllActivities(): Promise<void>;
} | null;

const supported = Platform.OS === "ios" && !!LA;

// ── Status helpers ─────────────────────────────────────────────────────────────
type OrderStatus = "accepted" | "preparing" | "on_the_way" | "arrived" | "delivered" | "cancelled";

interface StatusMeta {
  statusText: string;
  progressStep: number;
}

const STATUS_META: Record<string, StatusMeta> = {
  accepted:    { statusText: "Restaurangen har accepterat din order",  progressStep: 0 },
  preparing:   { statusText: "Din mat förbereds just nu",              progressStep: 1 },
  on_the_way:  { statusText: "Din order är på väg!",                  progressStep: 2 },
  arrived:     { statusText: "Föraren är framme!",                    progressStep: 3 },
  delivered:   { statusText: "Levererad — smaklig måltid! 🎉",        progressStep: 4 },
  cancelled:   { statusText: "Ordern avbruten",                       progressStep: 0 },
};

function meta(status: string): StatusMeta {
  return STATUS_META[status] ?? { statusText: status, progressStep: 0 };
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
  options?: { etaMinutes?: number; driverName?: string }
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
