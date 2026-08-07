import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkoutTotalDifferenceOre,
  checkoutTotalMatches,
  validateFrozenOrderPricing,
} from '../lib/checkoutIntegrity';
import {
  dealMatchesRestaurant,
  isAutomaticBasketDeal,
} from '../lib/deals';
import {
  isPlatformFundedUserDealType,
  resolvePlatformFundedDiscount,
} from '../lib/discountFunding';

const romaId = 'restaurant-roma';
const palmyraId = 'restaurant-palmyra';

const romaProductDeal = {
  restaurantId: romaId,
  isGlobal: false,
  applicableRestaurantIds: JSON.stringify([romaId]),
  triggerType: 'PRODUCT',
};

assert.equal(dealMatchesRestaurant(romaProductDeal, romaId), true);
assert.equal(
  dealMatchesRestaurant(romaProductDeal, palmyraId),
  false,
  'a Roma-only deal must never enter Palmyra pricing',
);
assert.equal(
  dealMatchesRestaurant(
    {
      ...romaProductDeal,
      applicableRestaurantIds: JSON.stringify([romaId, palmyraId]),
    },
    palmyraId,
  ),
  true,
  'an explicitly multi-restaurant deal may cover both restaurants',
);
assert.equal(
  dealMatchesRestaurant(
    { ...romaProductDeal, restaurantId: null, applicableRestaurantIds: '[]', isGlobal: true },
    palmyraId,
  ),
  true,
  'an explicitly global deal may cover all restaurants',
);

assert.equal(
  isAutomaticBasketDeal(romaProductDeal),
  false,
  'a targeted PRODUCT deal is priced per matching item, never over the basket',
);
assert.equal(
  isAutomaticBasketDeal({ triggerType: 'CATEGORY' }),
  false,
  'a targeted CATEGORY deal is priced per matching item, never over the basket',
);
assert.equal(isAutomaticBasketDeal({ triggerType: 'BOGO_CATEGORY' }), true);
assert.equal(isAutomaticBasketDeal({ triggerType: 'COMBO' }), true);
assert.equal(isAutomaticBasketDeal({ triggerType: 'MIN_ORDER' }), true);
assert.equal(isAutomaticBasketDeal({ triggerType: 'NONE' }), true);

assert.equal(checkoutTotalMatches(130, 13_000), true);
assert.equal(checkoutTotalMatches(129, 13_000), true, 'one-krona tolerance is accepted');
assert.equal(checkoutTotalMatches(128.99, 13_000), false);
assert.equal(checkoutTotalDifferenceOre(78, 13_100), 5_300);
assert.equal(checkoutTotalMatches(undefined, 13_000), true, 'legacy clients remain compatible');

for (const type of ['WELCOME', 'REFERRAL_INVITER', 'REFERRAL_INVITEE', 'MANUAL']) {
  assert.equal(isPlatformFundedUserDealType(type), true, `${type} is financed by ViaEats`);
}
assert.equal(isPlatformFundedUserDealType('APP_DEAL'), false);
assert.deepEqual(resolvePlatformFundedDiscount({
  foodDiscountAmount: 2_000,
  deliveryDiscountAmount: 500,
  automaticWelcomeApplied: true,
  appliedUserDealType: null,
}), {
  platformFundedFoodDiscountAmount: 2_000,
  platformFundedDeliveryDiscountAmount: 500,
});
assert.deepEqual(resolvePlatformFundedDiscount({
  foodDiscountAmount: 2_000,
  deliveryDiscountAmount: 500,
  automaticWelcomeApplied: true,
  appliedUserDealType: 'APP_DEAL',
}), {
  platformFundedFoodDiscountAmount: 0,
  platformFundedDeliveryDiscountAmount: 0,
}, 'a restaurant-funded UserDeal winner replaces the automatic welcome source');

assert.deepEqual(
  validateFrozenOrderPricing({
    total: 7_900,
    deliveryFee: 100,
    smallOrderFee: 0,
    tipAmount: 0,
    discountAmount: 5_200,
    foodDiscountAmount: 5_200,
    deliveryDiscountAmount: 0,
    items: [{ subtotal: 13_000 }],
  }),
  { valid: true, expectedTotalOre: 7_900 },
);

assert.equal(
  validateFrozenOrderPricing({
    total: 7_900,
    deliveryFee: 100,
    discountAmount: 5_200,
    foodDiscountAmount: 0,
    deliveryDiscountAmount: 0,
    items: [{ subtotal: 13_000 }],
  }).reason,
  'DISCOUNT_COMPONENT_MISMATCH',
);

assert.equal(
  validateFrozenOrderPricing({
    total: 7_800,
    deliveryFee: 100,
    discountAmount: 5_200,
    foodDiscountAmount: 5_200,
    deliveryDiscountAmount: 0,
    items: [{ subtotal: 13_000 }],
  }).reason,
  'TOTAL_MISMATCH',
);

assert.deepEqual(
  validateFrozenOrderPricing({
    total: 7_900,
    deliveryFee: 100,
    discountAmount: 5_200,
    foodDiscountAmount: 5_200,
    deliveryDiscountAmount: 0,
    platformFundedFoodDiscountAmount: 5_200,
    platformFundedDeliveryDiscountAmount: 0,
    items: [{ subtotal: 13_000 }],
  }),
  { valid: true, expectedTotalOre: 7_900 },
);
assert.equal(
  validateFrozenOrderPricing({
    total: 7_900,
    deliveryFee: 100,
    discountAmount: 5_200,
    foodDiscountAmount: 5_200,
    deliveryDiscountAmount: 0,
    platformFundedFoodDiscountAmount: 5_201,
    items: [{ subtotal: 13_000 }],
  }).reason,
  'PLATFORM_FUNDING_EXCEEDS_DISCOUNT',
);

const orderRouteSource = readFileSync(join(__dirname, '..', 'routes', 'orders.ts'), 'utf8');
assert.match(orderRouteSource, /automaticWelcomeApplied = true/);
assert.match(orderRouteSource, /appliedUserDealType = String\(userDeal\.type \|\| ''\)/);
assert.match(orderRouteSource, /platformFundedFoodDiscountAmount: platformDiscountFunding\.platformFundedFoodDiscountAmount/);
assert.match(orderRouteSource, /platformFundedDeliveryDiscountAmount: platformDiscountFunding\.platformFundedDeliveryDiscountAmount/);

console.log('Checkout pricing integrity: restaurant scope, deal scope and PSP totals OK');
