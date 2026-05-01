/**
 * Local "did the food arrive?" notification.
 *
 * Fired when the client side decides the order is delivered — either because
 * the admin marked it DELIVERED or because the on-the-way + grace window has
 * elapsed. The notification is a no-op on platforms / states where the user
 * hasn't granted notification permission, so callers can fire-and-forget.
 *
 * Tapping the notification carries `{ orderId, action: "review" }` in
 * `data`, which `App.tsx`'s notification-tap handler routes straight to
 * `OrderScreen`. The order detail page already shows the review stars when
 * `order.status === "DELIVERED"`, so there's nothing extra to do on the
 * destination side.
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const fired = new Set<string>();

export async function scheduleReviewNotification(orderId: string, restaurantName?: string | null): Promise<void> {
  if (!orderId) return;
  // Fire at most once per order per session — the sync hook can call this
  // from multiple paths (socket DELIVERED, auto-complete timer, refetch).
  if (fired.has(orderId)) return;
  fired.add(orderId);

  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== "granted") return;

    const restaurant = restaurantName?.trim() || "FoodGo";
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Smakade det? 🍽️",
        body: `Vi har levererat din mat från ${restaurant}. Tryck för att lämna en recension.`,
        data: { orderId, action: "review" },
        sound: Platform.OS === "ios" ? "default" : undefined,
      },
      trigger: null, // immediate
    });
  } catch {
    // Best-effort; backend push usually arrives first.
  }
}

/** Reset the dedup cache (sign-out, dev reload). */
export function resetReviewNotificationCache(): void {
  fired.clear();
}
