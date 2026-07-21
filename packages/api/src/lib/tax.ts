/** Tax helpers shared by checkout, payment providers and receipt projections. */

export const SUPPORTED_VAT_RATES = [0, 6, 12, 25] as const;

export function normalizeVatPercent(value: unknown, fallback = 6): number {
  const parsed = Number(value);
  return SUPPORTED_VAT_RATES.includes(parsed as (typeof SUPPORTED_VAT_RATES)[number])
    ? parsed
    : fallback;
}

/**
 * Prepared food sold through ViaEats must never inherit the legacy restaurant
 * value 0. Product-level 0 remains supported for a deliberately exempt item,
 * but a restaurant food rate of 0 predates the current admin validation and
 * made the whole checkout/receipt incorrectly display "Moms 0 %".
 */
export function normalizeFoodVatPercent(value: unknown, fallback = 6): number {
  const normalizedFallback = normalizeVatPercent(fallback, 6) || 6;
  const normalized = normalizeVatPercent(value, normalizedFallback);
  return normalized === 0 ? normalizedFallback : normalized;
}

/**
 * ViaEats delivery is a separate goods-transport service (25%). When the
 * restaurant delivers itself, delivery follows the prepared-food rate.
 */
export function deliveryVatPercent(selfDelivery: boolean, foodVatPercent: number): number {
  return selfDelivery ? normalizeVatPercent(foodVatPercent) : 25;
}

/** VAT included in a gross amount, rounded to the nearest öre. */
export function includedVatOre(grossOre: number, vatPercent: number): number {
  const gross = Math.trunc(grossOre);
  const rate = normalizeVatPercent(vatPercent, 0);
  if (gross === 0 || rate === 0) return 0;
  return Math.round((gross * rate) / (100 + rate));
}

/** Proportionally distribute an amount without losing or creating ören. */
export function allocateProportionally(totalOre: number, grossAmounts: number[]): number[] {
  const amounts = grossAmounts.map((amount) => Math.max(0, Math.trunc(amount)));
  const grossTotal = amounts.reduce((sum, amount) => sum + amount, 0);
  const allocatedTotal = Math.min(Math.max(0, Math.trunc(totalOre)), grossTotal);
  if (allocatedTotal === 0 || grossTotal === 0) return amounts.map(() => 0);

  const shares = amounts.map((amount, index) => {
    const numerator = allocatedTotal * amount;
    return {
      index,
      amount,
      allocated: Math.floor(numerator / grossTotal),
      remainder: numerator % grossTotal,
    };
  });
  let remaining = allocatedTotal - shares.reduce((sum, share) => sum + share.allocated, 0);
  for (const share of shares.slice().sort((a, b) => b.remainder - a.remainder || b.amount - a.amount || a.index - b.index)) {
    if (remaining > 0 && share.allocated < share.amount) {
      shares[share.index].allocated += 1;
      remaining -= 1;
    }
  }
  if (remaining !== 0) throw new Error('Kunde inte fördela beloppet exakt');
  return shares.map((share) => share.allocated);
}

export type VatBreakdownRow = { rate: number; grossOre: number; vatOre: number };

export function calculateOrderVat(input: {
  items?: Array<{ subtotal?: number | null; vatPercent?: number | null }> | null;
  discountAmount?: number | null;
  foodDiscountAmount?: number | null;
  deliveryDiscountAmount?: number | null;
  deliveryFee?: number | null;
  smallOrderFee?: number | null;
  foodVatPercent?: number | null;
  deliveryVatPercent?: number | null;
}): { totalVatOre: number; taxableGrossOre: number; breakdown: VatBreakdownRow[] } {
  const rawFoodRate = normalizeVatPercent(input.foodVatPercent, 6);
  const foodRate = normalizeFoodVatPercent(input.foodVatPercent, 6);
  const hasLegacyZeroFoodRate = rawFoodRate === 0;
  const items = input.items || [];
  const foodGrossRows = items.map((item) => Math.max(0, Math.trunc(Number(item.subtotal) || 0)));
  const foodGross = foodGrossRows.reduce((sum, value) => sum + value, 0);
  const deliveryFee = Math.max(0, Math.trunc(Number(input.deliveryFee) || 0));
  const totalDiscount = Math.max(0, Math.trunc(Number(input.discountAmount) || 0));
  let foodDiscount = Math.max(0, Math.trunc(Number(input.foodDiscountAmount) || 0));
  let deliveryDiscount = Math.max(0, Math.trunc(Number(input.deliveryDiscountAmount) || 0));
  // Legacy orders predate the split columns. Allocate conservatively to food
  // first so old receipts remain renderable; new orders always satisfy equality.
  if (foodDiscount + deliveryDiscount !== totalDiscount) {
    foodDiscount = Math.min(totalDiscount, foodGross);
    deliveryDiscount = Math.min(Math.max(0, totalDiscount - foodDiscount), deliveryFee);
  }
  foodDiscount = Math.min(foodDiscount, foodGross);
  deliveryDiscount = Math.min(deliveryDiscount, deliveryFee);

  const allocations = allocateProportionally(foodDiscount, foodGrossRows);
  const byRate = new Map<number, number>();
  items.forEach((item, index) => {
    const net = foodGrossRows[index] - allocations[index];
    const itemRate = normalizeVatPercent(item.vatPercent, foodRate);
    // Old orders created while the restaurant itself had the invalid 0 rate
    // also snapshotted 0 on every food line. Repair that projection only;
    // explicit product-level 0 remains intact when the order food rate is > 0.
    const rate = hasLegacyZeroFoodRate && itemRate === 0 ? foodRate : itemRate;
    byRate.set(rate, (byRate.get(rate) || 0) + net);
  });

  const smallOrderFee = Math.max(0, Math.trunc(Number(input.smallOrderFee) || 0));
  if (smallOrderFee > 0) {
    const rate = foodRate;
    byRate.set(rate, (byRate.get(rate) || 0) + smallOrderFee);
  }
  const netDelivery = deliveryFee - deliveryDiscount;
  if (netDelivery > 0) {
    const rawDeliveryRate = normalizeVatPercent(input.deliveryVatPercent, foodRate);
    const rate = hasLegacyZeroFoodRate && rawDeliveryRate === 0 ? foodRate : rawDeliveryRate;
    byRate.set(rate, (byRate.get(rate) || 0) + netDelivery);
  }

  const breakdown = [...byRate.entries()]
    .filter(([, grossOre]) => grossOre > 0)
    .sort(([a], [b]) => a - b)
    .map(([rate, grossOre]) => ({ rate, grossOre, vatOre: includedVatOre(grossOre, rate) }));
  return {
    taxableGrossOre: breakdown.reduce((sum, row) => sum + row.grossOre, 0),
    totalVatOre: breakdown.reduce((sum, row) => sum + row.vatOre, 0),
    breakdown,
  };
}
