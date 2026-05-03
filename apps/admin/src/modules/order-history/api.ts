import { apiGet, apiPost } from "@/shared/api/client";
import type { AdminOrder } from "@/modules/orders/api";

export interface OrderHistoryFilters {
  restaurantId?: string;
  from?: string; // ISO datetime, e.g. "2026-05-01T11:00:00Z"
  to?: string;
  status?: string;
}

export interface OrderHistoryResponse {
  orders: AdminOrder[];
  total: number;
}

export const orderHistoryQueryKey = (filters: OrderHistoryFilters) =>
  ["order-history", filters] as const;

export function buildOrderHistoryQuery(filters: OrderHistoryFilters): string {
  const params = new URLSearchParams();
  // Tar upp till 1000 rader per anrop — räcker för en månads historik på alla
  // demonstrationsrestauranger. Skala upp via offset om behovet växer.
  params.set("limit", "1000");
  if (filters.restaurantId) params.set("restaurantId", filters.restaurantId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.status && filters.status !== "ALL") params.set("status", filters.status);
  return params.toString();
}

export const getOrderHistory = (filters: OrderHistoryFilters) =>
  apiGet<OrderHistoryResponse>(`/admin/orders?${buildOrderHistoryQuery(filters)}`);

export const wipeOrders = (restaurantId?: string) =>
  apiPost<{ success: boolean; deleted: number; before: number; after: number; scope: string }>(
    "/admin/orders/wipe",
    { confirm: "WIPE_ALL_ORDERS", restaurantId },
  );
