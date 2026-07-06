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

export interface CustomerStats {
  orderCount: number;
  refundCount: number;
  firstOrderAt: string | null;
  refundRate: number;
}

export interface AdminOrder {
  id: string;
  orderNumber: string;
  status: string;
  type: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  userId?: string | null;
  deliveryStreet?: string | null;
  deliveryZip?: string | null;
  deliveryCity?: string | null;
  deliveryLatitude?: number | null;
  deliveryLongitude?: number | null;
  deliveryInstructions?: string | null;
  note?: string | null;
  total: number;
  deliveryFee?: number;
  discountAmount?: number;
  createdAt: string;
  updatedAt?: string;
  preparingAt?: string | null;
  deliveringAt?: string | null;
  estimatedTime?: number | null;
  restaurantName?: string;
  restaurantId?: string;
  restaurantAddress?: string | null;
  restaurantCity?: string | null;
  restaurantLat?: number | null;
  restaurantLng?: number | null;
  restaurantSelfDelivery?: boolean | null;
  items: OrderItem[];
  paymentMethod?: string | null;
  paymentProvider?: string | null;
  molliePaymentId?: string | null;
  adyenPspReference?: string | null;
  stripePaymentIntentId?: string | null;
  refundAmount?: number | null;
  refundedAt?: string | null;
  refundReason?: string | null;
  scheduledFor?: string | null;
  paymentStatus?: string | null;
  customerStats?: CustomerStats | null;
  pointsEarned?: number | null;
  pointsSpent?: number | null;
  pointsReverted?: boolean | null;
  // Tilldelad kurir + statusövergångs-tider (null = avhämtning/self/ej tilldelad)
  courier?: {
    id: string | null;
    name: string | null;
    phone: string | null;
    vehicle: string | null;
    currentLat?: number | null;
    currentLng?: number | null;
    lastSeenAt?: string | null;
    deliveryStatus: string;
    acceptedAt: string | null;
    pickedUpAt: string | null;
    deliveredAt: string | null;
    pickupMin: number | null;
    deliverMin: number | null;
    totalMin: number | null;
    // Leveransbevis: hur maten lämnades, kurirens notering, foto (TTL 2 dygn).
    proofMethod?: string | null; // HANDED | LEFT_AT_DOOR
    proofMessage?: string | null;
    proofPhotoUrl?: string | null;
  } | null;
}

export interface BulkRefundResult {
  total: number;
  refunded: number;
  skipped: number;
  failed: number;
  totalRefundedKr: number;
  results: Array<{ orderId: string; status: 'refunded' | 'skipped' | 'failed'; reason?: string; refundStatus?: string }>;
}

export const ordersQueryKey = (status: string, page: number = 1, pageSize: number = 50) =>
  ["orders", status, page, pageSize] as const;
export const orderDetailQueryKey = (orderId: string | null) => ["orders", "detail", orderId] as const;

export const ORDERS_PAGE_SIZE = 50;

export const getOrders = (status: string, page: number = 1, pageSize: number = ORDERS_PAGE_SIZE) => {
  const offset = (page - 1) * pageSize;
  const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
  if (status !== "ALL") params.set("status", status);
  return apiGet<{ orders: AdminOrder[]; total: number }>(`/admin/orders?${params.toString()}`);
};

export const getOrder = (orderId: string) => apiGet<AdminOrder>(`/admin/orders/${orderId}`);

export const updateOrderStatus = (orderId: string, status: string, estimatedTime?: number | null) =>
  apiPatch<{ success: boolean; status: string }>(`/admin/orders/${orderId}/status`, {
    status,
    estimatedTime: estimatedTime ?? undefined,
  });

export const updateOrder = (orderId: string, payload: Partial<AdminOrder>) => apiPatch<AdminOrder>(`/admin/orders/${orderId}`, payload);

export const refundOrder = (orderId: string, amount?: number | null, reason?: string) =>
  apiPost<{
    success: boolean;
    refundedAmount: number;
    refundId?: string;
    refundStatus?: string;
  }>(`/admin/orders/${orderId}/refund`, {
    amount: amount ?? undefined,
    reason: reason || undefined,
  });

export const deleteOrder = (orderId: string) => apiDelete<{ success: boolean }>(`/admin/orders/${orderId}`);

export const bulkRefundOrders = (orderIds: string[], reason?: string) =>
  apiPost<BulkRefundResult>(`/admin/orders/bulk-refund`, { orderIds, reason });

// Canned reasons for the refund modal — saves typing on common cases and
// makes refund-reason analytics possible later.
export const REFUND_REASONS: { value: string; label: string }[] = [
  { value: 'restaurant_cancelled', label: 'Restaurang avbröt order' },
  { value: 'restaurant_closed', label: 'Restaurang stängd / förhindrad' },
  { value: 'missing_item', label: 'Saknad artikel' },
  { value: 'wrong_item', label: 'Fel artikel levererad' },
  { value: 'cold_food', label: 'Maten var kall' },
  { value: 'quality_issue', label: 'Kvalitetsproblem' },
  { value: 'late_delivery', label: 'Sen leverans' },
  { value: 'customer_cancelled', label: 'Kund avbokade' },
  { value: 'goodwill', label: 'Goodwill / kundnöjdhet' },
  { value: 'other', label: 'Annat (fyll i nedan)' },
];
