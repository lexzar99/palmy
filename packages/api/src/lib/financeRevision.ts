type FinanceRevisionSnapshot = {
  commissionAmount?: unknown;
  subscriptionAmount?: unknown;
  feeVatPctSnapshot?: unknown;
};
const finiteNumberOrZero = (value: unknown) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const financeRevisionAmounts = (snapshot: FinanceRevisionSnapshot) => {
  const commissionExVatOre = finiteNumberOrZero(snapshot.commissionAmount);
  const subscriptionExVatOre = finiteNumberOrZero(snapshot.subscriptionAmount);
  const viaEatsExVatOre = commissionExVatOre + subscriptionExVatOre;
  const vatOre = Math.round(
    (viaEatsExVatOre * finiteNumberOrZero(snapshot.feeVatPctSnapshot)) / 100,
  );
  return {
    commissionExVatOre,
    subscriptionExVatOre,
    viaEatsExVatOre,
    vatOre,
  };
};
