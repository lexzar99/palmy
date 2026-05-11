import { apiGet } from "@/shared/api/client";

export interface CustomerHit {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  createdAt: string;
  isActive?: boolean;
}

export interface CustomerOrder {
  id: string;
  orderNumber: string;
  status: string;
  type: string;
  total: number;
  restaurantName?: string | null;
  createdAt: string;
}

export const searchCustomers = (q: string) =>
  apiGet<{ users: CustomerHit[] }>(`/admin/customers/search?q=${encodeURIComponent(q)}`);

export const getCustomerOrders = (userId: string) =>
  apiGet<{ orders: CustomerOrder[] }>(`/admin/customers/${userId}/orders`);
