import { apiGet, apiPost } from "@/shared/api/client";

export interface FinanceQueueRow {
  restaurantId: string;
  name: string;
  city?: string | null;
  featuredClass: number;
  featuredLabel: string;
  grossSales: number;
  orderCount: number;
  commission: number;
  subscription: number;
  payout: number;
  readiness: "ready" | "action";
}

export interface FinanceControlCenter {
  payoutQueue: FinanceQueueRow[];
}

export interface PayoutRecord {
  id: string;
  restaurantId: string;
  restaurant: { id: string; name: string; city?: string | null; featuredClass: number };
  periodStart: string;
  periodEnd: string;
  grossSales: number;
  orderCount: number;
  commissionAmount: number;
  subscriptionAmount: number;
  adjustmentAmount: number;
  payoutAmount: number;
  status: string;
  notes?: string | null;
  payoutReference?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  paidAt?: string | null;
  paidBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RestaurantReport {
  restaurant: {
    id: string;
    name: string;
    slug: string;
    featuredClass: number;
  };
  period: { from: string; to: string };
  summary: {
    totalOrders: number;
    totalRevenue: number;
    avgOrderValue: number;
    pickupOrders: number;
    deliveryOrders: number;
    newCustomers: number;
  };
  topProducts: Array<{ name: string; count: number; revenue: number }>;
  dailyData: Array<{ date: string; revenue: number; orders: number }>;
}

export const financeQueueQueryKey = ["finance", "queue"] as const;
export const financePayoutsQueryKey = ["finance", "payouts"] as const;
export const financeReportQueryKey = (restaurantId: string | null, from: string, to: string) => ["finance", "report", restaurantId, from, to] as const;

export const getFinanceQueue = async () => {
  const response = await apiGet<FinanceControlCenter>("/admin/control-center");
  return response.payoutQueue;
};

export const getPayouts = () => apiGet<PayoutRecord[]>("/admin/payouts");

export const getRestaurantReport = (restaurantId: string, from: string, to: string) =>
  apiGet<RestaurantReport>(`/admin/reports/restaurant/${restaurantId}?from=${from}&to=${to}`);

export const upsertPayout = (payload: {
  restaurantId: string;
  periodStart: string;
  periodEnd: string;
  grossSales: number;
  orderCount: number;
  commissionAmount: number;
  subscriptionAmount: number;
  adjustmentAmount: number;
  payoutAmount: number;
  status: string;
  notes?: string | null;
  payoutReference?: string | null;
}) => apiPost<PayoutRecord>("/admin/payouts", payload);
