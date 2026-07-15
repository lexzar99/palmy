import assert from 'node:assert/strict';
import {
  isReferralRewardCompletion,
  isSameReferralPhone,
  normalizeReferralPhone,
  referralPhoneVariants,
} from '../lib/referralRules';
import {
  guestReferralProfileUserId,
  parseGuestReferralProfileProof,
  REFERRAL_PROFILE_DENIED,
} from '../lib/referralProfileAccess';

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
assert.equal(isReferralRewardCompletion({ paymentStatus: 'PAID', status: 'READY', type: 'PICKUP' }), false);
assert.equal(isReferralRewardCompletion({ paymentStatus: 'PAID', status: 'DELIVERED', type: 'PICKUP' }), true);
assert.equal(isReferralRewardCompletion({ paymentStatus: 'PAID', status: 'READY', type: 'DELIVERY' }), false);

const accessToken = 'opaque-order-access-token-'.padEnd(64, 'x');
const completedOrder = {
  id: 'completed-order-1',
  userId: 'guest-user-1',
  accessToken,
  paymentStatus: 'PAID',
  status: 'DELIVERED',
  type: 'DELIVERY',
};
const validProof = { orderId: completedOrder.id, accessToken };

assert.deepEqual(parseGuestReferralProfileProof(validProof), validProof);
assert.equal(parseGuestReferralProfileProof({ phone: '+46701234567' }), null);
assert.equal(parseGuestReferralProfileProof({ orderId: completedOrder.id, accessToken: 'short' }), null);
assert.equal(guestReferralProfileUserId(validProof, completedOrder), 'guest-user-1');
assert.equal(guestReferralProfileUserId({ ...validProof, accessToken: `${accessToken}wrong` }, completedOrder), null);
assert.equal(guestReferralProfileUserId({ ...validProof, orderId: 'other-order' }, completedOrder), null);
assert.equal(guestReferralProfileUserId(validProof, { ...completedOrder, paymentStatus: 'PENDING' }), null);
assert.equal(guestReferralProfileUserId(validProof, { ...completedOrder, status: 'PREPARING' }), null);
assert.equal(guestReferralProfileUserId(validProof, { ...completedOrder, userId: null }), null);
assert.equal(guestReferralProfileUserId({ phone: '+46700000001' }, completedOrder), null);
assert.equal(guestReferralProfileUserId({ phone: '+46700000002' }, null), null);
assert.deepEqual(Object.keys(REFERRAL_PROFILE_DENIED), ['error']);
assert.equal('code' in REFERRAL_PROFILE_DENIED, false);
assert.equal('deals' in REFERRAL_PROFILE_DENIED, false);

console.log('Referral contracts: phone-free guest proof and completion checks OK');
