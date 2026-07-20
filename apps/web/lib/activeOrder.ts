export const ACTIVE_ORDER_KEY = "viaeats_active_order_id";
export const ACTIVE_ORDER_PHONE_KEY = "viaeats_active_order_phone";
export const ACTIVE_ORDERS_KEY = "viaeats_active_orders";

export type ActiveOrderRef = {
  id: string;
  phone: string | null;
};

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

export function readActiveOrderRefs(): ActiveOrderRef[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(ACTIVE_ORDERS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value): ActiveOrderRef[] => {
      if (!value || typeof value !== "object") return [];
      const order = value as Record<string, unknown>;
      if (typeof order.id !== "string" || order.id.length === 0) return [];
      return [{
        id: order.id,
        phone: typeof order.phone === "string" ? order.phone : null,
      }];
    });
  } catch {
    return [];
  }
}

/** Store only order continuity metadata; the order proof stays HttpOnly. */
export function rememberActiveOrder(orderId: string, proof?: { phone?: string | null }) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_ORDER_KEY, orderId);
    localStorage.removeItem("viaeats_active_order_token");
    if (proof?.phone) localStorage.setItem(ACTIVE_ORDER_PHONE_KEY, proof.phone);
    else localStorage.removeItem(ACTIVE_ORDER_PHONE_KEY);
    const existing: unknown = JSON.parse(localStorage.getItem(ACTIVE_ORDERS_KEY) || "[]");
    const next = [
      { id: orderId, phone: proof?.phone || null },
      ...(Array.isArray(existing) ? existing : []).filter((value) => {
        if (!value || typeof value !== "object") return false;
        const id = (value as Record<string, unknown>).id;
        return Boolean(id) && String(id) !== orderId;
      }),
    ].slice(0, 3);
    localStorage.setItem(ACTIVE_ORDERS_KEY, JSON.stringify(next));
    window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_ORDER_KEY, newValue: orderId }));
    window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_ORDERS_KEY, newValue: JSON.stringify(next) }));
  } catch {
    /* private mode/quota — tracking can still recover from the account */
  }
}

/** Remove a locally remembered order after the API definitively returns 404/410. */
export function forgetActiveOrder(orderId: string) {
  if (typeof window === "undefined") return;
  try {
    const existing: unknown = JSON.parse(localStorage.getItem(ACTIVE_ORDERS_KEY) || "[]");
    const next = (Array.isArray(existing) ? existing : [])
      .filter((value) => {
        if (!value || typeof value !== "object") return false;
        const id = (value as Record<string, unknown>).id;
        return Boolean(id) && String(id) !== orderId;
      });
    localStorage.setItem(ACTIVE_ORDERS_KEY, JSON.stringify(next));
    if (localStorage.getItem(ACTIVE_ORDER_KEY) === orderId) {
      localStorage.removeItem(ACTIVE_ORDER_KEY);
      localStorage.removeItem(ACTIVE_ORDER_PHONE_KEY);
      localStorage.removeItem("viaeats_active_order_token");
    }
    window.dispatchEvent(new StorageEvent("storage", {
      key: ACTIVE_ORDERS_KEY,
      newValue: JSON.stringify(next),
    }));
  } catch {
    /* local continuity metadata only */
  }
}
