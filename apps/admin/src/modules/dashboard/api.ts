import { apiGet, apiPatch } from "@/shared/api/client";
import type {
  AcceptingOrdersMode,
  RestaurantAvailabilityReason,
  SekMoney,
} from "@/shared/contracts/restaurants";

export interface ControlCenterSummary {
  todayRevenue: number;
  todayOrders: number;
  liveOrders: number;
  openRestaurants: number;
  totalRestaurants: number;
  activeCustomers: number;
  monthlyPayoutExposure: number;
  periodRevenue: number;
  periodOrders: number;
  periodCommission: number;
  periodCommissionVat: number;
  periodCommissionInclVat: number;
  periodFeeVat: number;
  periodSubscription: number;
  periodPayoutExposure: number;
  periodMollieFees: number | null;
  mollieFeesChargedToRestaurants: number | null;
  mollieFeesDeductedFromPayouts: number;
  mollieFeesToInvoice: number | null;
  periodRefundAmount: number;
  periodRefundCount: number;
  pendingRefundAmount: number;
  pendingRefundCount: number;
  avgTicket: number;
  avgRating: number;
  incomeAfterFees: number | null;
  mollieFees: number | null;
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
  tierGoldFeeOverride?: number | null;
  tierSilverFeeOverride?: number | null;
  tierStandardFeeOverride?: number | null;
  isOpen: boolean;
  scheduledOpenNow: boolean;
  acceptingOrdersMode: AcceptingOrdersMode;
  availabilityReason: RestaurantAvailabilityReason;
  /** @deprecated använd acceptingOrdersMode. */
  manualIsOpen: boolean;
  // Utkast (agent-onboarding): syns inte för kunder förrän publicerad.
  draft?: boolean;
  adminEmail: string | null;
  hasHours: boolean;
  hasVisuals: boolean;
  // Image URLs so the restaurants list/dashboard card can render the actual
  // profile pic instead of falling back to an emoji.
  imageUrl?: string | null;
  heroImageUrl?: string | null;
  etaMinutes: number;
  deliveryFee: number;
  deliveryFeeOre: number;
  deliveryFeeMoney: SekMoney;
  minOrderAmount: number;
  minOrderAmountOre: number;
  minOrderAmountMoney: SekMoney;
  todayRevenue: number;
  todayOrders: number;
  monthRevenue: number;
  periodRevenue?: number;
  liveOrders: number;
  pendingOrders: number;
  avgOrderValue: number;
  reviewScore: number;
  reviewCount: number;
  payoutEstimate: number;
  commissionEstimate: number;
  commissionVatEstimate: number;
  commissionInclVatEstimate: number;
  subscriptionEstimate: number;
  mollieFees: number | null;
  payoutBeforeMollie: number;
  refundsLast30d: number;
  focus: string;
  updatedAt: string;
}

export interface ControlCenterData {
  scope: { restaurantId: string | null; isSuperAdmin: boolean };
  period: {
    key: DashboardPeriodKey;
    label: string;
    from: string;
    to: string;
    timeZone: string;
  };
  summary: ControlCenterSummary;
  mollie: {
    feeStatus: "available" | "partial" | "unavailable";
    feeError: string | null;
    totalBalance: number | null;
    availableBalance: number | null;
    pendingBalance: number | null;
    nextPayoutDate: string | null;
    transferFrequency: string | null;
  };
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

export interface ControlCenterParams {
  restaurantId?: string | null;
  period?: DashboardPeriodKey;
}

export type DashboardPeriodKey = "today" | "yesterday" | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth";

export interface DashboardOverviewAction {
  id: string;
  kind: "closed-with-live-orders" | "pending-orders" | "closed-during-hours" | "missing-hours";
  severity: "high" | "medium" | "info";
  restaurantId: string;
  title: string;
  detail: string;
  href: string;
}

export interface DashboardOverviewRestaurantStatus {
  id: string;
  name: string;
  slug: string;
  isOpen: boolean;
  scheduledOpenNow: boolean;
  availabilityReason: RestaurantAvailabilityReason;
  hasHours: boolean;
  liveOrders: number;
  pendingOrders: number;
  updatedAt: string;
}

export interface DashboardOverviewData {
  generatedAt: string;
  timeZone: string;
  scope: { restaurantId: string | null; isSuperAdmin: boolean };
  restaurantRefs: RestaurantRef[];
  today: {
    netSales: number;
    orders: number;
    liveOrders: number;
    pendingOrders: number;
  };
  restaurants: { open: number; total: number };
  trend7d: Array<{ date: string; label: string; netSales: number; orders: number }>;
  liveStatusCounts: Record<string, number>;
  actions: DashboardOverviewAction[];
  restaurantStatus: DashboardOverviewRestaurantStatus[];
}

export interface DashboardOverviewParams {
  restaurantId?: string | null;
}

export const overviewQueryKey = (params: DashboardOverviewParams = {}) =>
  ["dashboard", "overview", params.restaurantId ?? null] as const;

export const getDashboardOverview = (params: DashboardOverviewParams = {}) => {
  const search = new URLSearchParams();
  if (params.restaurantId) search.set("restaurantId", params.restaurantId);
  const qs = search.toString();
  return apiGet<DashboardOverviewData>(`/admin/overview${qs ? `?${qs}` : ""}`);
};

export const dashboardQueryKey = (params: ControlCenterParams = {}) =>
  ["dashboard", "control-center", params.restaurantId ?? null, params.period ?? "thisMonth"] as const;
export const healthQueryKey = ["dashboard", "health"] as const;

// Lättviktig restauranglista för scope-väljaren (samma endpoint som menyn).
export interface RestaurantRef { id: string; name: string }
export const restaurantRefsQueryKey = ["dashboard", "restaurant-refs"] as const;
export const getRestaurantRefs = () => apiGet<RestaurantRef[]>("/restaurants");

export const getControlCenter = (params: ControlCenterParams = {}) => {
  const search = new URLSearchParams();
  if (params.restaurantId) search.set("restaurantId", params.restaurantId);
  if (params.period && params.period !== "thisMonth") search.set("period", params.period);
  const qs = search.toString();
  return apiGet<ControlCenterData>(`/admin/control-center${qs ? `?${qs}` : ""}`);
};

export const getSystemHealth = () => apiGet<SystemHealth>("/admin/system/health");

export interface CustomerOverview {
  totalCustomers: number;
  registered: number;
  guests: number;
  convertedFromGuest: number;
  guestConversionRate: number;
  repeatGuests: number;
  repeatRegistered: number;
  newToday: number;
  newThisWeek: number;
  activeLast30Days: number;
}

export const customerOverviewQueryKey = ["dashboard", "customer-overview"] as const;
export const getCustomerOverview = () => apiGet<CustomerOverview>("/admin/customers/overview");

export interface LaunchCampaignData {
  days: 7 | 30 | 90;
  from: string;
  to: string;
  totals: {
    leads: number;
    leadsInPeriod: number;
    couponsSent: number;
    couponsPending: number;
    averageDailyLeads: number;
  };
  daily: Array<{
    date: string;
    leads: number;
  }>;
  pageInfo: {
    limit: number;
    hasNextPage: boolean;
    nextCursor: string | null;
  };
  leads: Array<{
    id: string;
    name: string;
    email: string;
    couponCode: string;
    status: string;
    createdAt: string;
    couponSentAt: string | null;
  }>;
}

export interface LaunchCampaignParams {
  days: 7 | 30 | 90;
  cursor?: string | null;
  limit?: number;
}

export const launchCampaignQueryKey = ({ days, cursor = null, limit = 50 }: LaunchCampaignParams) =>
  ["launch-campaign", days, cursor, limit] as const;

export const getLaunchCampaign = ({ days, cursor, limit = 50 }: LaunchCampaignParams) => {
  const search = new URLSearchParams({ days: String(days), limit: String(limit) });
  if (cursor) search.set("cursor", cursor);
  return apiGet<LaunchCampaignData>(`/admin/launch-campaign?${search.toString()}`);
};
export const setLaunchCouponManualStatus = (leadId: string, sent: boolean) =>
  apiPatch<{ id: string; status: string; couponSentAt: string | null }>(
    `/admin/launch-campaign/${leadId}/coupon-status`,
    { sent },
  );

export const updateRestaurantLiveState = (restaurantId: string, acceptingOrdersMode: AcceptingOrdersMode) =>
  apiPatch(`/restaurants/${restaurantId}`, {
    acceptingOrdersMode,
    // Snabbval är ett nytt, permanent beslut. Rensa en eventuell utgången
    // tidsgräns så det valda läget faktiskt träder i kraft.
    acceptingOrdersOverrideUntil: null,
    acceptingOrdersOverrideReason: acceptingOrdersMode === "SCHEDULED"
      ? null
      : "Ändrad från operationsöversikten",
  });

// ── Leveranstider (internt underlag, visas inte för kund) ───────────────────
export interface DeliveryTimingRestaurantRow {
  restaurantId: string;
  name: string;
  slug: string;
  selfDelivery: boolean;
  samples: number;
  promisedAvgMin: number | null;
  actualP50Min: number | null;
  actualP95Min: number | null;
  acceptToOnWayP50Min: number | null;
  onWayToDeliveredP50Min: number | null;
  activeOrders: number;
  pressure: "LOW" | "MEDIUM" | "HIGH";
  highLoad: boolean;
}

export const deliveryTimingQueryKey = ["dashboard", "delivery-timing"] as const;
export const getDeliveryTiming = () =>
  apiGet<{ restaurants: DeliveryTimingRestaurantRow[] }>("/admin/timing-stats/restaurants");

export interface TimingOverviewBucket {
  dayOfWeek: number;
  dayName: string;
  hourOfDay: number;
  orders: number;
  totalMinP50: number | null;
  totalMinP95: number | null;
  acceptToOnWayMinAvg: number | null;
  onWayToDeliveredMinAvg: number | null;
  avgPressAtOnWay: number | null;
}

export const timingOverviewQueryKey = ["dashboard", "timing-overview"] as const;
export const getTimingOverview = () =>
  apiGet<{ totalRows: number; byDayHour: TimingOverviewBucket[] }>("/admin/timing-stats");
