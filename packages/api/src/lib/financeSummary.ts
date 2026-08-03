export type FinanceSummaryEconomicValues = {
  orderCount: number;
  grossSales: number;
  commission: number;
  subscription: number;
  feeVat: number;
  foodVat: number;
  foodVatPct: number | null;
  platformTip: number;
  payout: number;
  owed: number;
  commissionPct: number;
  selfDelivery: boolean;
};

export type PersistedFinanceSummarySnapshot = {
  status: string;
  orderCount: number;
  grossSales: number;
  commissionAmount: number;
  subscriptionAmount: number;
  manualAdjustmentAmount?: number | null;
  lateRefundAdjustmentAmount?: number | null;
  mollieFeeAmount?: number | null;
  payoutAmount: number;
  foodVatAmount?: number | null;
  platformTipAmount?: number | null;
  commissionPctSnapshot: number | null;
  feeVatPctSnapshot: number | null;
  foodVatPctSnapshot?: number | null;
  selfDeliverySnapshot: boolean | null;
};

export function isFrozenFinanceSummaryStatus(status: unknown): boolean {
  return ['APPROVED', 'PAID'].includes(String(status || '').toUpperCase());
}

/**
 * A draft is a visible working calculation and therefore uses its saved
 * adjustment in the period overview. HOLD is different: an explicit
 * replacement saved with provisional Mollie fees uses its latest revision as
 * the active original while waiting for confirmation.
 */
export function activeFinanceSummarySnapshot(
  persisted: PersistedFinanceSummarySnapshot | null | undefined,
  latestRevision: PersistedFinanceSummarySnapshot | null | undefined,
): PersistedFinanceSummarySnapshot | null {
  if (!persisted) return null;
  const status = String(persisted.status || '').toUpperCase();
  if (status !== 'HOLD') return persisted;
  return latestRevision ? { ...latestRevision, status: 'APPROVED' } : persisted;
}

/**
 * APPROVED/PAID rows are accounting documents. Never rewrite their overview
 * with today's orders, restaurant mode or fee settings; derive every exposed
 * economic value that can be derived from the persisted immutable snapshot.
 */
export function selectFinanceSummaryEconomicValues(
  live: FinanceSummaryEconomicValues,
  persisted?: PersistedFinanceSummarySnapshot | null,
): FinanceSummaryEconomicValues & { usesFrozenSnapshot: boolean } {
  if (!persisted || !isFrozenFinanceSummaryStatus(persisted.status)) {
    return { ...live, usesFrozenSnapshot: false };
  }

  const commission = Math.round(Number(persisted.commissionAmount) || 0);
  const subscription = Math.round(Number(persisted.subscriptionAmount) || 0);
  const feeVatPct = Number.isFinite(persisted.feeVatPctSnapshot)
    ? Number(persisted.feeVatPctSnapshot)
    : 0;
  const feeVat = Math.round(((commission + subscription) * feeVatPct) / 100);
  const grossSales = Math.round(Number(persisted.grossSales) || 0);
  const manualAdjustment = Number.isFinite(persisted.manualAdjustmentAmount)
    ? Math.round(Number(persisted.manualAdjustmentAmount))
    : 0;
  const lateRefundAdjustment = Math.max(0, Math.round(Number(persisted.lateRefundAdjustmentAmount) || 0));
  const mollieFee = Math.max(0, Math.round(Number(persisted.mollieFeeAmount) || 0));
  const frozenPosition = grossSales - commission - subscription - feeVat - mollieFee - manualAdjustment - lateRefundAdjustment;

  return {
    orderCount: Math.max(0, Math.round(Number(persisted.orderCount) || 0)),
    grossSales,
    commission,
    subscription,
    feeVat,
    foodVat: Math.max(0, Math.round(Number(persisted.foodVatAmount ?? live.foodVat) || 0)),
    foodVatPct: persisted.foodVatPctSnapshot == null
      ? live.foodVatPct
      : Number(persisted.foodVatPctSnapshot),
    platformTip: Math.max(0, Math.round(Number(persisted.platformTipAmount ?? live.platformTip) || 0)),
    payout: Math.max(0, Math.round(Number(persisted.payoutAmount) || 0)),
    owed: Math.max(0, -frozenPosition),
    commissionPct: Number.isFinite(persisted.commissionPctSnapshot)
      ? Number(persisted.commissionPctSnapshot)
      : 0,
    selfDelivery: typeof persisted.selfDeliverySnapshot === 'boolean'
      ? persisted.selfDeliverySnapshot
      : false,
    usesFrozenSnapshot: true,
  };
}

export type FinanceSummaryTotalValues = {
  grossSales: number;
  refunds: number;
  commission: number;
  subscription: number;
  feeVat: number;
  foodVat: number;
  platformTip: number;
  payout: number;
  owed: number;
  orderCount: number;
};

export function sumFinanceSummaryRows(
  rows: readonly FinanceSummaryTotalValues[],
): FinanceSummaryTotalValues {
  return rows.reduce<FinanceSummaryTotalValues>(
    (totals, row) => ({
      grossSales: totals.grossSales + row.grossSales,
      refunds: totals.refunds + row.refunds,
      commission: totals.commission + row.commission,
      subscription: totals.subscription + row.subscription,
      feeVat: totals.feeVat + row.feeVat,
      foodVat: totals.foodVat + row.foodVat,
      platformTip: totals.platformTip + row.platformTip,
      payout: totals.payout + row.payout,
      owed: totals.owed + row.owed,
      orderCount: totals.orderCount + row.orderCount,
    }),
    {
      grossSales: 0,
      refunds: 0,
      commission: 0,
      subscription: 0,
      feeVat: 0,
      foodVat: 0,
      platformTip: 0,
      payout: 0,
      owed: 0,
      orderCount: 0,
    },
  );
}

export type FundingReconciliationOreRow = {
  grossTotal: number;
  refunds: number;
  mollieFee: number | null;
  payout: number;
  owed: number;
  commission: number;
  subscription: number;
  feeVat: number;
  deliveryFee: number;
  tip: number;
  selfDelivery: boolean;
  manualAdjustment: number;
};

export function reconcileRestaurantFundingOre(input: {
  periodGross: number | null;
  periodRefunds: number | null;
  periodFees: number | null;
  externalGross: number;
  externalRefunds: number;
  externalFees: number | null;
  rows: readonly FundingReconciliationOreRow[];
}) {
  const externalNet = input.externalFees == null
    ? null
    : input.externalGross - input.externalRefunds - input.externalFees;
  const restaurantFeesComplete = input.rows.every((row) => row.mollieFee != null);
  const restaurantFees = restaurantFeesComplete
    ? input.rows.reduce((sum, row) => sum + Number(row.mollieFee || 0), 0)
    : null;
  const mollieRestaurantNet = input.periodGross == null || input.periodRefunds == null || input.periodFees == null || externalNet == null
    ? null
    : input.periodGross - input.periodRefunds - input.periodFees - externalNet;
  const calculatedRestaurantNet = input.rows.reduce((sum, row) =>
    sum + row.payout + row.commission + row.subscription + row.feeVat +
      (row.selfDelivery ? 0 : row.deliveryFee + row.tip),
  0);
  const adjustmentNet = input.rows.reduce((sum, row) => sum + row.manualAdjustment, 0);
  const invoiceTotal = input.rows.reduce((sum, row) => sum + row.owed, 0);
  const linkedMollieSales = input.periodGross == null || input.periodRefunds == null
    ? null
    : input.periodGross - input.externalGross - input.periodRefunds + input.externalRefunds;
  const calculatedRestaurantSales = input.rows.reduce(
    (sum, row) => sum + row.grossTotal - row.refunds,
    0,
  );

  return {
    mollieRestaurantNet,
    calculatedRestaurantNet,
    difference: mollieRestaurantNet == null ? null : mollieRestaurantNet - calculatedRestaurantNet,
    salesDifference: linkedMollieSales == null ? null : linkedMollieSales - calculatedRestaurantSales,
    feeDifference: input.periodFees == null || input.externalFees == null || restaurantFees == null
      ? null
      : input.periodFees - input.externalFees - restaurantFees,
    adjustmentNet,
    invoiceTotal,
    externalNet,
  };
}
