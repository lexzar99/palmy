import assert from 'node:assert/strict';
import {
  isReferralRewardCompletion,
  isSameReferralPhone,
  normalizeReferralPhone,
  referralPhoneVariants,
} from '../lib/referralRules';

assert.equal(normalizeReferralPhone('070-123 45 67'), '+46701234567');
assert.equal(normalizeReferralPhone('+46 70 123 45 67'), '+46701234567');
assert.equal(normalizeReferralPhone('0046701234567'), '+46701234567');
assert.equal(isSameReferralPhone('0701234567', '+46701234567'), true);
assert.equal(isSameReferralPhone('0701234567', '+46709999999'), false);
assert.ok(referralPhoneVariants('0701234567').includes('+46701234567'));
assert.ok(referralPhoneVariants('0701234567').includes('0701234567'));

assert.equal(isReferralRewardCompletion({ paymentStatus: 'PENDING', status: 'DELIVERED', type: 'DELIVERY' }), false);
assert.equal(isReferralRewardCompletion({ paymentStatus: 'PAID', status: 'PREPARING', type: 'DELIVERY' }), false);
assert.equal(isReferralRewardCompletion({ paymentStatus: 'PAID', status: 'DELIVERED', type: 'DELIVERY' }), true);
assert.equal(isReferralRewardCompletion({ paymentStatus: 'PAID', status: 'COMPLETED', type: 'DELIVERY' }), true);
assert.equal(isReferralRewardCompletion({ paymentStatus: 'PAID', status: 'READY', type: 'PICKUP' }), true);
assert.equal(isReferralRewardCompletion({ paymentStatus: 'PAID', status: 'READY', type: 'DELIVERY' }), false);

console.log('Referral contracts: 13 scenarier OK');
