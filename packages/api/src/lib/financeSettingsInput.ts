const numericFinanceInput = (value: unknown, label: string) => {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new TypeError(`${label} måste vara ett tal`);
  }
  if (typeof value === 'string' && value.trim() === '') {
    throw new TypeError(`${label} måste vara ett tal`);
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new TypeError(`${label} måste vara ett tal`);
  }
  return numeric;
};
export const parseFinancePercentage = (value: unknown, label: string) => {
  const numeric = numericFinanceInput(value, label);
  if (numeric < 0 || numeric > 100) {
    throw new TypeError(`${label} måste vara mellan 0 och 100 procent`);
  }
  return Math.round(numeric);
};

export const parseFinancePriceOre = (value: unknown, label: string) => {
  const numeric = numericFinanceInput(value, label);
  if (numeric < 0) {
    throw new TypeError(`${label} måste vara 0 kr eller mer`);
  }
  const ore = Math.round(numeric * 100);
  if (!Number.isSafeInteger(ore)) {
    throw new TypeError(`${label} är för stort`);
  }
  return ore;
};
