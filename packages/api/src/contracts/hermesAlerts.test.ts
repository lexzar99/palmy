import assert from 'node:assert/strict';
import { hermesAlertAuditId, hermesAlertDedupeKey } from '../lib/hermesAlerts';

const alert = {
  source: 'viaeats-falken',
  type: 'order:delivered',
  orderId: 'order-1',
};

assert.equal(
  hermesAlertDedupeKey(alert),
  'viaeats:order:delivered:order-1',
);
assert.equal(hermesAlertDedupeKey({ ...alert, source: 'another-replica' }), hermesAlertDedupeKey(alert));
assert.equal(hermesAlertDedupeKey(alert), hermesAlertDedupeKey({ ...alert }));
assert.notEqual(
  hermesAlertDedupeKey(alert),
  hermesAlertDedupeKey({ ...alert, type: 'order:accepted' }),
);
assert.equal(
  hermesAlertDedupeKey({ ...alert, dedupeKey: 'manual-key' }),
  'manual-key',
);
assert.equal(hermesAlertDedupeKey({ source: 'ops', type: 'health' }), null);
assert.match(
  hermesAlertAuditId('viaeats:order:delivered:order-1'),
  /^hermes_[a-f0-9]{48}$/,
);

console.log('Hermes contracts: stable cross-replica event dedupe OK');
