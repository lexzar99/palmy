export const CHECKOUT_TOTAL_TOLERANCE_ORE = 100;

export type FrozenOrderPricing = {
  total: number;
  deliveryFee?: number | null;
  smallOrderFee?: number | null;
  tipAmount?: number | null;
  discountAmount?: number | null;
  foodDiscountAmount?: number | null;
  deliveryDiscountAmount?: number | null;
  platformFundedFoodDiscountAmount?: number | null;
  platformFundedDeliveryDiscountAmount?: number | null;
  items?: Array<{ subtotal?: number | null }> | null;
};

const ore = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : NaN;
};

export function checkoutTotalDifferenceOre(
  expectedTotalKr: number | null | undefined,
  serverTotalOre: number,
): number | null {
  if (expectedTotalKr == null) return null;
  const clientOre = Math.round(Number(expectedTotalKr) * 100);
  if (!Number.isFinite(clientOre)) return Number.POSITIVE_INFINITY;
  return Math.abs(clientOre - Math.round(serverTotalOre));
}

export function checkoutTotalMatches(
  expectedTotalKr: number | null | undefined,
  serverTotalOre: number,
  toleranceOre = CHECKOUT_TOTAL_TOLERANCE_ORE,
) {
  const differenceOre = checkoutTotalDifferenceOre(expectedTotalKr, serverTotalOre);
  return differenceOre == null || differenceOre <= toleranceOre;
}

/**
 * Rebuild the amount sent to the PSP from immutable order snapshots. This is a
 * final fail-closed guard between order creation and Mollie.
 */
export function validateFrozenOrderPricing(order: FrozenOrderPricing): {
  valid: boolean;
  expectedTotalOre: number | null;
  reason?: string;
} {
  const total = ore(order.total);
  const deliveryFee = ore(order.deliveryFee ?? 0);
  const smallOrderFee = ore(order.smallOrderFee ?? 0);
  const tipAmount = ore(order.tipAmount ?? 0);
  const discountAmount = ore(order.discountAmount ?? 0);
  const foodDiscountAmount = ore(order.foodDiscountAmount ?? 0);
  const deliveryDiscountAmount = ore(order.deliveryDiscountAmount ?? 0);
  const platformFundedFoodDiscountAmount = ore(order.platformFundedFoodDiscountAmount ?? 0);
  const platformFundedDeliveryDiscountAmount = ore(order.platformFundedDeliveryDiscountAmount ?? 0);
  const itemSubtotals = (order.items || []).map((item) => ore(item.subtotal ?? 0));
  const values = [
    total,
    deliveryFee,
    smallOrderFee,
    tipAmount,
    discountAmount,
    foodDiscountAmount,
    deliveryDiscountAmount,
    platformFundedFoodDiscountAmount,
    platformFundedDeliveryDiscountAmount,
    ...itemSubtotals,
  ];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    return { valid: false, expectedTotalOre: null, reason: 'INVALID_COMPONENT' };
  }

  const subtotal = itemSubtotals.reduce((sum, value) => sum + value, 0);
  if (foodDiscountAmount + deliveryDiscountAmount !== discountAmount) {
    return { valid: false, expectedTotalOre: null, reason: 'DISCOUNT_COMPONENT_MISMATCH' };
  }
  if (foodDiscountAmount > subtotal || deliveryDiscountAmount > deliveryFee) {
    return { valid: false, expectedTotalOre: null, reason: 'DISCOUNT_EXCEEDS_BASE' };
  }
  if (
    platformFundedFoodDiscountAmount > foodDiscountAmount ||
    platformFundedDeliveryDiscountAmount > deliveryDiscountAmount
  ) {
    return { valid: false, expectedTotalOre: null, reason: 'PLATFORM_FUNDING_EXCEEDS_DISCOUNT' };
  }

  const expectedTotalOre =
    subtotal - foodDiscountAmount +
    deliveryFee - deliveryDiscountAmount +
    smallOrderFee +
    tipAmount;
  if (total !== expectedTotalOre) {
    return { valid: false, expectedTotalOre, reason: 'TOTAL_MISMATCH' };
  }
  return { valid: true, expectedTotalOre };
}
