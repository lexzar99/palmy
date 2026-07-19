import assert from 'node:assert/strict';
import { customerStepEtaEndsAt } from '../lib/orderEta';

const started = new Date('2026-07-19T10:00:00.000Z');
const kitchenReady = new Date(started.getTime() + 35 * 60_000);
const oldDoorEstimate = new Date(started.getTime() + 45 * 60_000);

const beforeDeparture = customerStepEtaEndsAt({
  id: 'self-delivery-order',
  type: 'DELIVERY',
  status: 'PREPARING',
  selfDelivery: true,
  estimatedTime: 35,
  preparingAt: started,
  etaReadyAt: kitchenReady,
  etaCustomerAt: oldDoorEstimate,
});
assert.equal(beforeDeparture?.toISOString(), kitchenReady.toISOString(), '35-minute restaurant ETA must remain 35 before departure');

const departed = new Date('2026-07-19T10:08:00.000Z');
const afterDeparture = customerStepEtaEndsAt({
  id: 'self-delivery-order',
  type: 'DELIVERY',
  status: 'DELIVERING',
  selfDelivery: true,
  deliveringAt: departed,
  etaReadyAt: kitchenReady,
  etaCustomerAt: oldDoorEstimate,
});
assert.equal(
  afterDeparture?.toISOString(),
  new Date(departed.getTime() + 15 * 60_000).toISOString(),
  'self-delivery must start a fresh 15-minute transit ETA at departure',
);

const platformArrival = new Date('2026-07-19T10:22:00.000Z');
const platformDeparture = customerStepEtaEndsAt({
  id: 'platform-delivery-order',
  type: 'DELIVERY',
  status: 'DELIVERING',
  selfDelivery: false,
  deliveringAt: departed,
  etaCustomerAt: platformArrival,
});
assert.equal(platformDeparture?.toISOString(), platformArrival.toISOString(), 'platform delivery must use its fresh route ETA');

console.log('✅ Customer tracking uses separate kitchen and delivery clocks');
