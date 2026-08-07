const PLATFORM_FUNDED_USER_DEAL_TYPES = new Set([
  'WELCOME',
  'REFERRAL_INVITER',
  'REFERRAL_INVITEE',
  'MANUAL',
]);

const ore = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

export function isPlatformFundedUserDealType(type: unknown): boolean {
  return PLATFORM_FUNDED_USER_DEAL_TYPES.has(String(type || '').trim().toUpperCase());
}

/** Freeze who finances the winning checkout discount. No source means restaurant-funded. */
export function resolvePlatformFundedDiscount(input: {
  foodDiscountAmount: number;
  deliveryDiscountAmount: number;
  automaticWelcomeApplied: boolean;
  appliedUserDealType?: string | null;
}) {
  const userDealApplied = input.appliedUserDealType != null;
  const platformFunded = userDealApplied
    ? isPlatformFundedUserDealType(input.appliedUserDealType)
    : input.automaticWelcomeApplied;
  return {
    platformFundedFoodDiscountAmount: platformFunded ? ore(input.foodDiscountAmount) : 0,
    platformFundedDeliveryDiscountAmount: platformFunded ? ore(input.deliveryDiscountAmount) : 0,
  };
}
