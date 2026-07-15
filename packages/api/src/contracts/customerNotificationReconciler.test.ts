import assert from 'node:assert/strict';
import {
  currentNotificationOutboxBlocksRepair,
  planMissingCurrentOrderNotifications,
} from '../lib/customerNotificationReconciler';
import { customerOrderNotificationAuditId } from '../lib/notificationIds';

const existing = new Set([customerOrderNotificationAuditId('order-1', 'ACCEPTED')]);
const plan = planMissingCurrentOrderNotifications([
  { id: 'order-1', status: 'ACCEPTED' },
  { id: 'order-2', status: 'PREPARING' },
  { id: 'order-3', status: 'AWAITING_PAYMENT' },
], existing);

assert.deepEqual(plan, [{
  orderId: 'order-2',
  status: 'PREPARING',
  dedupeKey: customerOrderNotificationAuditId('order-2', 'PREPARING'),
}]);

// Reconciliation receives only the current snapshot. If the DB now says
// READY, it plans READY and never invents/replays the previous PREPARING step.
const currentOnly = planMissingCurrentOrderNotifications([
  { id: 'order-2', status: 'READY' },
], new Set());
assert.equal(currentOnly.length, 1);
assert.equal(currentOnly[0].status, 'READY');
assert.equal(currentOnly[0].dedupeKey, customerOrderNotificationAuditId('order-2', 'READY'));
assert.notEqual(currentOnly[0].dedupeKey, customerOrderNotificationAuditId('order-2', 'PREPARING'));

assert.deepEqual(
  planMissingCurrentOrderNotifications([{ id: 'order-2', status: 'READY' }], new Set([currentOnly[0].dedupeKey])),
  [],
);

assert.equal(currentNotificationOutboxBlocksRepair({
  dedupeKey: currentOnly[0].dedupeKey,
  status: 'DEAD',
  acceptedCount: 0,
  lastError: 'no_active_installations',
}), false);
assert.equal(currentNotificationOutboxBlocksRepair({
  dedupeKey: currentOnly[0].dedupeKey,
  status: 'COMPLETED',
  acceptedCount: 0,
  lastError: 'no_active_installations',
}), false);
assert.equal(currentNotificationOutboxBlocksRepair({
  dedupeKey: currentOnly[0].dedupeKey,
  status: 'DEAD',
  acceptedCount: 0,
  lastError: 'provider_retry',
}, 'READY'), false);
assert.equal(currentNotificationOutboxBlocksRepair({
  dedupeKey: currentOnly[0].dedupeKey,
  status: 'DEAD',
  acceptedCount: 0,
  lastError: 'web_push_503',
}, 'DELIVERED'), true, 'terminal orders must not revive transient provider jobs');
assert.equal(currentNotificationOutboxBlocksRepair({
  dedupeKey: currentOnly[0].dedupeKey,
  status: 'DEAD',
  acceptedCount: 1,
  lastError: 'fcm_transport',
}, 'READY'), false, 'remaining devices may retry; accepted devices are skipped by immutable delivery audit');
assert.equal(currentNotificationOutboxBlocksRepair({
  dedupeKey: currentOnly[0].dedupeKey,
  status: 'COMPLETED',
  acceptedCount: 1,
  lastError: null,
}), true);

console.log('customer notification reconciler contracts: current-only repair, target recovery and stable dedupe OK');
