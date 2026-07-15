import { apiGet } from "@/shared/api/client";
import type { AdminOrder } from "@/modules/orders/api";

export interface OrderHistoryFilters {
  restaurantId?: string;
  from?: string; // ISO datetime, e.g. "2026-05-01T11:00:00Z"
  to?: string;
  status?: string;
  // Pagination — page är 0-indexerad. pageSize default 200.
  page?: number;
  pageSize?: number;
}

export interface OrderHistoryResponse {
  orders: AdminOrder[];
  total: number;
}

export const ORDER_HISTORY_PAGE_SIZE = 200;

export const orderHistoryQueryKey = (filters: OrderHistoryFilters) =>
  ["order-history", filters] as const;

export function buildOrderHistoryQuery(filters: OrderHistoryFilters): string {
  const params = new URLSearchParams();
  const pageSize = filters.pageSize ?? ORDER_HISTORY_PAGE_SIZE;
  const page = filters.page ?? 0;
  params.set("limit", String(pageSize));
  params.set("offset", String(page * pageSize));
  if (filters.restaurantId) params.set("restaurantId", filters.restaurantId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.status && filters.status !== "ALL") params.set("status", filters.status);
  return params.toString();
}

export const getOrderHistory = (filters: OrderHistoryFilters) =>
  apiGet<OrderHistoryResponse>(`/admin/orders?${buildOrderHistoryQuery(filters)}`);
