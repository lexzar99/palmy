import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { customerOrderStatusCopy } from '../lib/customerOrderNotifier';
import { reviewPushId } from '../lib/notificationIds';

assert.match(customerOrderStatusCopy('ACCEPTED', 'DELIVERY', 20)?.body || '', /20/);
assert.match(customerOrderStatusCopy('READY', 'PICKUP')?.body || '', /hämtas/);
assert.match(customerOrderStatusCopy('READY', 'DELIVERY')?.body || '', /budet/);
assert.match(customerOrderStatusCopy('DELIVERED', 'PICKUP')?.title || '', /hämtad/);
assert.match(customerOrderStatusCopy('DELIVERED', 'DELIVERY')?.title || '', /levererad/);
assert.equal(customerOrderStatusCopy('AWAITING_PAYMENT', 'DELIVERY'), null);
assert.equal(reviewPushId('order-1'), reviewPushId('order-1'));
assert.notEqual(reviewPushId('order-1'), reviewPushId('order-2'));

const notifierSource = readFileSync(path.resolve(__dirname, '../lib/customerOrderNotifier.ts'), 'utf8');
const reconcilerSource = readFileSync(path.resolve(__dirname, '../lib/customerNotificationReconciler.ts'), 'utf8');
assert.doesNotMatch(notifierSource, /customerPhone|where:\s*\{\s*phone:/);
assert.doesNotMatch(reconcilerSource, /customerPhone|where:\s*\{\s*phone:/);

console.log('Customer order notifier contracts: status copy, stable review id and no phone ownership fallback OK');
