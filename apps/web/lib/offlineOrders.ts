"use client";

// Offline orderhistorik: senast hämtade order + kvitto och orderlistan cachas
// i localStorage så /orders och /order/[id] kan visas även helt utan nät
// (app-skalet serveras redan offline av service workern — detta ger det
// INNEHÅLL som tidigare saknades).

const LAST_ORDER_KEY = "offline_last_order";
const ORDERS_LIST_KEY = "offline_orders_list";

/** Opak order-payload — cachen bryr sig bara om `id`, resten passas igenom. */
export type OfflineOrderPayload = { id?: string } & Record<string, unknown>;

type CachedOrder = { savedAt: number; order: OfflineOrderPayload };
type CachedList = { savedAt: number; orders: OfflineOrderPayload[] };

export function cacheOrderDetail(order: OfflineOrderPayload | null | undefined): void {
  if (!order?.id) return;
  try {
    localStorage.setItem(LAST_ORDER_KEY, JSON.stringify({ savedAt: Date.now(), order } satisfies CachedOrder));
  } catch { /* quota/private mode — offline-cachen är best effort */ }
}

export function getCachedOrderDetail<T = OfflineOrderPayload>(
  orderId?: string,
): { order: T; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(LAST_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedOrder;
    if (!parsed?.order) return null;
    if (orderId && parsed.order.id !== orderId) return null;
    return { order: parsed.order as T, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function cacheOrdersList(orders: OfflineOrderPayload[]): void {
  try {
    localStorage.setItem(ORDERS_LIST_KEY, JSON.stringify({ savedAt: Date.now(), orders } satisfies CachedList));
  } catch { /* noop */ }
}

export function getCachedOrdersList<T = OfflineOrderPayload>(): { orders: T[]; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(ORDERS_LIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedList;
    if (!Array.isArray(parsed?.orders)) return null;
    return { orders: parsed.orders as T[], savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}
