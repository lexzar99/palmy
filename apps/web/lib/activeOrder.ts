export const ACTIVE_ORDER_KEY = "viaeats_active_order_id";
export const ACTIVE_ORDER_PHONE_KEY = "viaeats_active_order_phone";
export const ACTIVE_ORDERS_KEY = "viaeats_active_orders";

export const ACTIVE_ORDER_STATUSES = new Set([
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "DELIVERING",
  "OUT_FOR_DELIVERY",
  "ON_THE_WAY",
]);

export function isActiveOrderStatus(status: unknown) {
  return ACTIVE_ORDER_STATUSES.has(String(status || "").toUpperCase());
}

/** Store only order continuity metadata; the order proof stays HttpOnly. */
export function rememberActiveOrder(orderId: string, proof?: { phone?: string | null }) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_ORDER_KEY, orderId);
    localStorage.removeItem("viaeats_active_order_token");
    if (proof?.phone) localStorage.setItem(ACTIVE_ORDER_PHONE_KEY, proof.phone);
    else localStorage.removeItem(ACTIVE_ORDER_PHONE_KEY);
    const existing = JSON.parse(localStorage.getItem(ACTIVE_ORDERS_KEY) || "[]");
    const next = [
      { id: orderId, phone: proof?.phone || null },
      ...(Array.isArray(existing) ? existing : []).filter((order: any) => order?.id && String(order.id) !== orderId),
    ].slice(0, 3);
    localStorage.setItem(ACTIVE_ORDERS_KEY, JSON.stringify(next));
    window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_ORDER_KEY, newValue: orderId }));
    window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_ORDERS_KEY, newValue: JSON.stringify(next) }));
  } catch {
    /* private mode/quota — tracking can still recover from the account */
  }
}
