import assert from 'node:assert/strict';
import { claimPaidOrders, isJourneyPaidOrder } from '../lib/journeyConversions';

const order = { paymentStatus: 'PAID', status: 'DELIVERED', accountingExcluded: false };
assert.equal(isJourneyPaidOrder(order), true);
for (const paymentStatus of ['PENDING', 'FAILED', 'REFUNDED', 'REFUNDING']) {
  assert.equal(isJourneyPaidOrder({ ...order, paymentStatus }), false);
}
assert.equal(isJourneyPaidOrder({ ...order, paymentStatus: 'PARTIALLY_REFUNDED' }), true);
assert.equal(isJourneyPaidOrder({ ...order, accountingExcluded: true }), false);
assert.equal(isJourneyPaidOrder({ ...order, status: 'CANCELLED' }), false);
const paid = new Set(['paid-1', 'paid-2']);
const claimed = new Set<string>();
assert.deepEqual(claimPaidOrders(['pending', 'paid-1', 'paid-1'], paid, claimed), ['paid-1']);
assert.deepEqual(claimPaidOrders(['paid-1', 'paid-2'], paid, claimed), ['paid-2']);
assert.equal(claimed.size, 2);
console.log('Kundresans betalningsklassificering och deduplicering: ok');
