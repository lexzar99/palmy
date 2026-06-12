"use client";

// Offline orderhistorik: senast hämtade order + kvitto och orderlistan cachas
// i localStorage så /orders och /order/[id] kan visas även helt utan nät
// (app-skalet serveras redan offline av service workern — detta ger det
// INNEHÅLL som tidigare saknades).

const LAST_ORDER_KEY = "offline_last_order";
const ORDERS_LIST_KEY = "offline_orders_list";

type CachedOrder = { savedAt: number; order: any };
type CachedList = { savedAt: number; orders: any[] };

export function cacheOrderDetail(order: any): void {
  if (!order?.id) return;
  try {
    localStorage.setItem(LAST_ORDER_KEY, JSON.stringify({ savedAt: Date.now(), order } satisfies CachedOrder));
  } catch { /* quota/private mode — offline-cachen är best effort */ }
}

export function getCachedOrderDetail(orderId?: string): { order: any; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(LAST_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedOrder;
    if (!parsed?.order) return null;
    if (orderId && parsed.order.id !== orderId) return null;
    return { order: parsed.order, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function cacheOrdersList(orders: any[]): void {
  try {
    localStorage.setItem(ORDERS_LIST_KEY, JSON.stringify({ savedAt: Date.now(), orders } satisfies CachedList));
  } catch { /* noop */ }
}

export function getCachedOrdersList(): { orders: any[]; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(ORDERS_LIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedList;
    if (!Array.isArray(parsed?.orders)) return null;
    return { orders: parsed.orders, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}
