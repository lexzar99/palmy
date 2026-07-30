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
  foodVatPct: number | null;
  orderCount: number;
  payoutOrderCount: number;
  periodOrderCount: number;
  grossSales: number; // restaurangens utbetalningsgrund (legacy/detail)
  grossTotal: number; // kundbetalningar före återbetalningar
  netSales: number; // grossTotal − refunds
  foodBase: number;
  deliveryFee: number;
  tip: number;
  restaurantTip: number;
  platformTip: number;
  commission: number; // provision ex moms
  commissionVat: number;
  commissionInclVat: number;
  mollieFees: number | null;
  refundTransactionFees: number | null;
  refundProcessingFees: number | null;
  restaurantMollieFee: number | null;
  companyRevenueExVat: number | null;
  commissionAfterMollieFees: number | null;
  mollieFeeStatus: "available" | "partial" | "unavailable";
  subscription: number;
  feeVat: number;
  foodVat: number;
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
    grossTotal: number;
    netSales: number;
    commission: number;
    commissionVat: number;
    commissionInclVat: number;
    mollieFees: number | null;
    refundTransactionFees: number | null;
    refundProcessingFees: number | null;
    restaurantMollieFee: number | null;
    companyRevenueExVat: number | null;
    commissionAfterMollieFees: number | null;
    subscription: number;
    feeVat: number;
    foodVat: number;
    platformTip: number;
    payout: number;
    owed: number;
    refunds: number;
    orderCount: number;
  };
  refundImpact: {
    refundCount: number;
    refundedAmount: number;
    balanceImpact: number | null;
    withoutRefunds: {
      commission: number;
      commissionVat: number;
      mollieFees: number | null;
      resultExVat: number | null;
      restaurantPayout: number;
    };
    withOneRefund: {
      refundedAmount: number;
      commission: number;
      commissionVat: number;
      mollieFees: number | null;
      resultExVat: number | null;
      restaurantPayout: number;
    };
  };
  mollie: {
    feeStatus: "available" | "partial" | "unavailable";
    feeError: string | null;
    matchedPaymentCount: number;
    estimatedPaymentCount: number;
    requestedPaymentCount: number;
    availableBalance: number | null;
    pendingBalance: number | null;
    totalBalance: number | null;
    nextPayoutDate: string | null;
    nextPayoutDateSource: "settlement" | "schedule" | null;
    transferFrequency: string | null;
    nextSettlementAmount: number | null;
    nextSettlementStatus: string | null;
    latestPayoutAmount: number | null;
    latestPayoutStatus: string | null;
    latestPayoutCreatedAt: string | null;
    periodLedgerStatus: "exact" | "partial" | "unavailable";
    periodReportUntil: string | null;
    periodGross: number | null;
    periodRefunds: number | null;
    periodFees: number | null;
    periodOtherMovements: number | null;
    periodDifference: number | null;
    periodOpeningBalance: number | null;
    periodClosingBalance: number | null;
    unlinkedPaymentCount: number;
    unlinkedGross: number;
    unlinkedRefunds: number;
    unlinkedFees: number | null;
    unlinkedNet: number | null;
    feeCalibration: number | null;
  };
  reconciliation: {
    status: "ok" | "attention" | "critical";
    checkedOrderCount: number;
    realPaymentCount: number;
    excludedPaymentCount: number;
    molliePaymentCount: number;
    matchedFeeCount: number;
    deviationCount: number;
    criticalCount: number;
    confirmedLoss: number;
    amountToReview: number;
    deviations: Array<{
      id: string;
      code:
        | "DELIVERED_WITHOUT_SETTLED_PAYMENT"
        | "SETTLED_PAYMENT_OUTSIDE_ACCOUNTING"
        | "MOLLIE_PAYMENT_ID_MISSING"
        | "DUPLICATE_MOLLIE_PAYMENT_ID"
        | "REFUND_AMOUNT_INVALID"
        | "MOLLIE_REPORTING_UNAVAILABLE"
        | "UNLINKED_MOLLIE_PAYMENT"
        | "MOLLIE_LEDGER_DIFFERENCE";
      severity: "critical" | "warning" | "info";
      restaurantId: string | null;
      restaurantName: string | null;
      orderId: string | null;
      orderNumber: string | null;
      paymentId: string | null;
      title: string;
      detail: string;
      amount: number | null;
      affectedOrderCount: number;
      confirmedLoss: boolean;
    }>;
  };
  internalTestCosts: {
    orderCount: number;
    gross: number;
    refunds: number;
    mollieFees: number | null;
    netLoss: number | null;
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
    vatPercent: number | null;
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
    restaurantTip: number;
    platformTip: number;
    tierLabel: string;
    commissionPct: number;
    commission: number;
    subscription: number;
    feeVatPct: number;
    feeVat: number;
    mollieFees: number | null;
    paymentFees: number | null;
    refundProcessingFees: number | null;
    restaurantGross: number;
    payout: number;
    owed: number;
    foodVatPct: number | null;
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
    mollieFeeAmount: number;
    payoutAmount: number;
    foodVatAmount: number | null;
    platformTipAmount: number | null;
    commissionPctSnapshot: number | null;
    feeVatPctSnapshot: number | null;
    foodVatPctSnapshot: number | null;
    selfDeliverySnapshot: boolean | null;
    notes: string | null;
    payoutReference: string | null;
    approvedAt: string | null;
    approvedBy: string | null;
    paidAt: string | null;
    paidBy: string | null;
    updatedAt: string;
    revisions: Array<{
      id: string;
      revision: number;
      original: boolean;
      reason: string;
      createdAt: string;
      createdBy: string | null;
      commissionPct: number | null;
      commissionExVat: number;
      vat: number;
      payout: number;
      manualAdjustment: number;
    }>;
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
