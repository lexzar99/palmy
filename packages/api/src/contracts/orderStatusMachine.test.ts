import assert from 'node:assert/strict';
import { isRestaurantOrderTransitionAllowed as allowed } from '../lib/orderStatusMachine';

const platformDelivery = { type: 'DELIVERY', selfDelivery: false } as const;
const selfDelivery = { type: 'DELIVERY', selfDelivery: true } as const;
const pickup = { type: 'PICKUP', selfDelivery: false } as const;

assert.equal(allowed({ from: 'PENDING', to: 'PREPARING', ...platformDelivery }), true);
assert.equal(allowed({ from: 'PENDING', to: 'READY', ...platformDelivery }), false);
assert.equal(allowed({ from: 'PREPARING', to: 'READY', ...platformDelivery }), true);
assert.equal(allowed({ from: 'READY', to: 'DELIVERING', ...platformDelivery }), false);

assert.equal(allowed({ from: 'PREPARING', to: 'DELIVERING', ...selfDelivery }), true);
assert.equal(allowed({ from: 'DELIVERING', to: 'DELIVERED', ...selfDelivery }), true);

assert.equal(allowed({ from: 'PREPARING', to: 'READY', ...pickup }), true);
assert.equal(allowed({ from: 'READY', to: 'DELIVERED', ...pickup }), true);

assert.equal(allowed({ from: 'DELIVERED', to: 'PREPARING', ...pickup }), false);
assert.equal(allowed({ from: 'CANCELLED', to: 'PREPARING', ...pickup }), false);
assert.equal(allowed({ from: 'PREPARING', to: 'REJECTED', ...pickup }), false);
assert.equal(allowed({ from: 'PREPARING', to: 'CANCELLED', ...pickup }), true);
assert.equal(allowed({ from: 'READY', to: 'READY', ...pickup }), true);

console.log('restaurant order status machine contracts: ok');
