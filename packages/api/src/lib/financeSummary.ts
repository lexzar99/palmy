export type FinanceSummaryEconomicValues = {
  orderCount: number;
  grossSales: number;
  commission: number;
  subscription: number;
  feeVat: number;
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
  payoutAmount: number;
  commissionPctSnapshot: number | null;
  feeVatPctSnapshot: number | null;
  selfDeliverySnapshot: boolean | null;
};

export function isFrozenFinanceSummaryStatus(status: unknown): boolean {
  return ['APPROVED', 'PAID'].includes(String(status || '').toUpperCase());
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

  return {
    orderCount: Math.max(0, Math.round(Number(persisted.orderCount) || 0)),
    grossSales,
    commission,
    subscription,
    feeVat,
    payout: Math.max(0, Math.round(Number(persisted.payoutAmount) || 0)),
    owed: Math.max(0, commission + subscription + feeVat - grossSales),
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
      payout: 0,
      owed: 0,
      orderCount: 0,
    },
  );
}
