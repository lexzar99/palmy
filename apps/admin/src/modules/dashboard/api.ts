import { apiGet, apiPatch } from "@/shared/api/client";

export interface ControlCenterSummary {
  todayRevenue: number;
  todayOrders: number;
  liveOrders: number;
  openRestaurants: number;
  totalRestaurants: number;
  activeCustomers: number;
  monthlyPayoutExposure: number;
  avgTicket: number;
  avgRating: number;
  registeredCustomers?: number;
}

export interface ControlCenterRestaurantSnapshot {
  id: string;
  name: string;
  slug: string;
  city?: string | null;
  featuredClass: number;
  featuredLabel: string;
  selfDelivery: boolean;
  commissionPct: number;
  isOpen: boolean;
  manualIsOpen: boolean;
  adminEmail: string | null;
  hasHours: boolean;
  hasVisuals: boolean;
  // Image URLs so the restaurants list/dashboard card can render the actual
  // profile pic instead of falling back to an emoji.
  imageUrl?: string | null;
  heroImageUrl?: string | null;
  etaMinutes: number;
  deliveryFee: number;
  minOrderAmount: number;
  todayRevenue: number;
  todayOrders: number;
  monthRevenue: number;
  liveOrders: number;
  pendingOrders: number;
  avgOrderValue: number;
  reviewScore: number;
  reviewCount: number;
  payoutEstimate: number;
  commissionEstimate: number;
  subscriptionEstimate: number;
  refundsLast30d: number;
  focus: string;
  updatedAt: string;
}

export interface ControlCenterData {
  scope: { restaurantId: string | null; isSuperAdmin: boolean };
  summary: ControlCenterSummary;
  liveStatusCounts: Record<string, number>;
  trend: Array<{ label: string; revenue: number; orders: number }>;
  paymentMix: Array<{ method: string; count: number; revenue: number }>;
  topProducts: Array<{ name: string; count: number; revenue: number }>;
  recentReviews: Array<{
    id: string;
    restaurantName: string | null;
    customerName: string;
    rating: number;
    review: string;
    reviewedAt: string;
  }>;
  customerSignals: Array<{
    id: string;
    label: string;
    phone: string | null;
    totalSpent: number;
    orders: number;
    lastOrderAt: string;
    favoriteRestaurant: string | null;
    refundCount: number;
    verified: boolean;
  }>;
  restaurantSnapshots: ControlCenterRestaurantSnapshot[];
  payoutQueue: Array<{
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
  }>;
  alerts: Array<{
    id: string;
    severity: "high" | "medium" | "info";
    domain: "ops" | "finance" | "security" | "quality";
    title: string;
    description: string;
    restaurantId?: string;
  }>;
}

export interface SystemHealth {
  status: string;
  uptime: number;
  dbPingMs: number;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
  };
  operations: {
    restaurantCount: number;
    openRestaurantCount: number;
    userCount: number;
    pendingOrders: number;
    liveOrders: number;
    payoutInReview: number;
  };
  services: {
    auth: boolean;
    realtime: boolean;
    uploads: boolean;
  };
  alerts: Array<{ level: "info" | "warning"; message: string }>;
}

export const dashboardQueryKey = ["dashboard", "control-center"] as const;
export const healthQueryKey = ["dashboard", "health"] as const;

export const getControlCenter = () => apiGet<ControlCenterData>("/admin/control-center");

export const getSystemHealth = () => apiGet<SystemHealth>("/admin/system/health");

export const updateRestaurantLiveState = (restaurantId: string, isOpen: boolean) =>
  apiPatch(`/restaurants/${restaurantId}`, { isOpen });
