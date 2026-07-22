import { apiGet, apiPatch, apiPost } from "@/shared/api/client";

// Alla belopp i KR (kronor) om inget annat anges.

export interface EconomyRates {
  commissionSelfPct: number;
  commissionPlatformPct: number;
  vatCustomerPct: number;
  vatPlatformFeePct: number;
  tierGoldFee: number; // kr/mån
  tierSilverFee: number; // kr/mån
  tierStandardFee: number; // kr/mån
}

export interface FinanceRow {
  restaurantId: string;
  name: string;
  slug: string;
  city?: string | null;
  featuredClass: number;
  tierLabel: string;
  selfDelivery: boolean;
  commissionPct: number;
  orderCount: number;
  payoutOrderCount: number;
  periodOrderCount: number;
  grossSales: number; // restaurangens intäkt (self: allt, platform: matvärde)
  foodBase: number;
  deliveryFee: number;
  tip: number;
  commission: number;
  subscription: number;
  feeVat: number;
  payout: number; // netto att betala ut (≥ 0)
  owed: number; // restaurangen är skyldig oss (faktureras) — > 0 ersätter payout
  refunds: number;
  usesFrozenSnapshot: boolean;
  status: string | null;
  payoutReference: string | null;
}

export interface FinanceSummary {
  period: { from: string; to: string };
  economy: EconomyRates;
  totals: {
    grossSales: number;
    commission: number;
    subscription: number;
    feeVat: number;
    payout: number;
    owed: number;
    refunds: number;
    orderCount: number;
  };
  rows: FinanceRow[];
}

export interface PayoutSpecOrder {
  orderNumber: string;
  createdAt: string;
  type: string;
  status: string;
  paymentStatus: string;
  includedInPayout: boolean;
  originalTotal: number;
  refundAmount: number;
  total: number;
  deliveryFee: number;
  tip: number;
}

export interface PayoutSpec {
  restaurant: {
    id: string;
    name: string;
    slug: string;
    city?: string | null;
    address?: string | null;
    legalName?: string | null;
    organizationNumber?: string | null;
    featuredClass: number;
    selfDelivery: boolean;
    commissionPctOverride: number | null;
    tierGoldFeeOverride: number | null;
    tierSilverFeeOverride: number | null;
    tierStandardFeeOverride: number | null;
  };
  company: { name: string | null; organizationNumber: string | null; address: string | null };
  period: { from: string; to: string };
  refundWindow: { hours: number; closesAt: string; closed: boolean };
  lateRefundRecovery: {
    blocked: boolean;
    error: string | null;
    reserved: number;
    remaining: number;
    sourceCount: number;
  };
  breakdown: {
    orderCount: number;
    originalGrossTotal: number;
    refunds: number;
    grossTotal: number;
    foodBase: number;
    deliveryFee: number;
    tip: number;
    tierLabel: string;
    commissionPct: number;
    commission: number;
    subscription: number;
    feeVatPct: number;
    feeVat: number;
    restaurantGross: number;
    payout: number;
    owed: number;
    foodVatPct: number;
    foodVat: number;
  };
  orders: PayoutSpecOrder[];
  persisted: {
    status: string;
    grossSales: number;
    orderCount: number;
    commissionAmount: number;
    subscriptionAmount: number;
    manualAdjustmentAmount: number;
    lateRefundAdjustmentAmount: number;
    payoutAmount: number;
    commissionPctSnapshot: number | null;
    feeVatPctSnapshot: number | null;
    selfDeliverySnapshot: boolean | null;
    notes: string | null;
    payoutReference: string | null;
    approvedAt: string | null;
    approvedBy: string | null;
    paidAt: string | null;
    paidBy: string | null;
    updatedAt: string;
  } | null;
}

export interface PayoutRecord {
  id: string;
  restaurantId: string;
  status: string;
  payoutAmount: number;
  updatedAt: string;
}

export const financeSummaryQueryKey = (from: string, to: string) =>
  ["finance", "summary", from, to] as const;
export const payoutSpecQueryKey = (restaurantId: string | null, from: string, to: string) =>
  ["finance", "spec", restaurantId, from, to] as const;

export const getFinanceSummary = (from: string, to: string) =>
  apiGet<FinanceSummary>(`/admin/finance/summary?from=${from}&to=${to}`);

export const getPayoutSpec = (restaurantId: string, from: string, to: string) =>
  apiGet<PayoutSpec>(`/admin/finance/payout/${restaurantId}?from=${from}&to=${to}`);

export const upsertPayout = (payload: {
  restaurantId: string;
  periodStart: string;
  periodEnd: string;
  manualAdjustmentAmount: number;
  status: string;
  notes?: string | null;
  payoutReference?: string | null;
}) => apiPost<PayoutRecord>("/admin/payouts", payload);

export const economyQueryKey = ["finance", "economy"] as const;
export const getEconomy = () => apiGet<EconomyRates>("/admin/finance/economy");

export const updateEconomyRates = (payload: Partial<EconomyRates>) =>
  apiPatch<unknown>("/settings", payload);

export const setRestaurantDelivery = (
  restaurantId: string,
  payload: {
    selfDelivery?: boolean;
    commissionPctOverride?: number | null;
    tierGoldFeeOverride?: number | null;
    tierSilverFeeOverride?: number | null;
    tierStandardFeeOverride?: number | null;
  },
) => apiPatch<unknown>(`/restaurants/${restaurantId}`, payload);
