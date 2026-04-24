import { apiDelete, apiGet, apiPatch, apiPost } from "@/shared/api/client";

export interface OrderItem {
  id: string;
  productId?: string;
  productName: string;
  quantity: number;
  basePrice: number;
  subtotal: number;
  note?: string | null;
  selectedExtras?: string | Array<{ extraName?: string; name?: string }>;
}

export interface AdminOrder {
  id: string;
  orderNumber: string;
  status: string;
  type: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  deliveryStreet?: string | null;
  deliveryZip?: string | null;
  deliveryCity?: string | null;
  deliveryInstructions?: string | null;
  note?: string | null;
  total: number;
  deliveryFee?: number;
  discountAmount?: number;
  createdAt: string;
  estimatedTime?: number | null;
  restaurantName?: string;
  restaurantId?: string;
  items: OrderItem[];
  paymentMethod?: string | null;
  stripePaymentIntentId?: string | null;
  refundAmount?: number | null;
  refundedAt?: string | null;
  refundReason?: string | null;
  scheduledFor?: string | null;
}

export const ordersQueryKey = (status: string) => ["orders", status] as const;
export const orderDetailQueryKey = (orderId: string | null) => ["orders", "detail", orderId] as const;

export const getOrders = (status: string) =>
  apiGet<{ orders: AdminOrder[]; total: number }>(`/admin/orders?limit=160${status !== "ALL" ? `&status=${status}` : ""}`);

export const getOrder = (orderId: string) => apiGet<AdminOrder>(`/admin/orders/${orderId}`);

export const updateOrderStatus = (orderId: string, status: string, estimatedTime?: number | null) =>
  apiPatch<{ success: boolean; status: string }>(`/admin/orders/${orderId}/status`, {
    status,
    estimatedTime: estimatedTime ?? undefined,
  });

export const updateOrder = (orderId: string, payload: Partial<AdminOrder>) => apiPatch<AdminOrder>(`/admin/orders/${orderId}`, payload);

export const refundOrder = (orderId: string, amount?: number | null, reason?: string) =>
  apiPost<{ success: boolean; refundedAmount: number }>(`/admin/orders/${orderId}/refund`, {
    amount: amount ?? undefined,
    reason: reason || undefined,
  });

export const deleteOrder = (orderId: string) => apiDelete<{ success: boolean }>(`/admin/orders/${orderId}`);
