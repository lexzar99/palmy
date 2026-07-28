import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CUSTOMER_NOTIFICATION_PROOF_MAX_AGE_MS,
  resolveCustomerNotificationTarget,
} from '../lib/customerNotificationAccess';
import {
  clearCustomerIdentityCacheForTests,
  getCachedCustomerIdentity,
  invalidateCachedCustomerIdentity,
  setCachedCustomerIdentity,
} from '../lib/customerIdentityCache';

const now = Date.UTC(2026, 6, 15, 12, 0, 0);
const freshOrder = {
  userId: 'guest-user',
  accessToken: 'secret-order-token',
  createdAt: new Date(now - 5 * 60_000),
};

assert.deepEqual(
  resolveCustomerNotificationTarget({ authenticatedUserId: 'account' }),
  { scope: 'account', userId: 'account' },
);
assert.equal(resolveCustomerNotificationTarget({}), null);
assert.deepEqual(
  resolveCustomerNotificationTarget({ order: freshOrder, accessToken: 'secret-order-token', nowMs: now }),
  { scope: 'order', userId: null },
);
assert.equal(resolveCustomerNotificationTarget({ order: freshOrder, accessToken: 'wrong', nowMs: now }), null);
assert.deepEqual(
  resolveCustomerNotificationTarget({ authenticatedUserId: 'guest-user', order: freshOrder, nowMs: now }),
  { scope: 'order', userId: 'guest-user' },
);
assert.equal(resolveCustomerNotificationTarget({ authenticatedUserId: 'other-user', order: freshOrder, nowMs: now }), null);
assert.deepEqual(resolveCustomerNotificationTarget({
  authenticatedUserId: 'other-user',
  order: freshOrder,
  accessToken: 'secret-order-token',
  nowMs: now,
}), { scope: 'order', userId: 'other-user' });
const trueGuestOrder = { ...freshOrder, userId: null };
assert.deepEqual(resolveCustomerNotificationTarget({
  order: trueGuestOrder,
  accessToken: 'secret-order-token',
  nowMs: now,
}), { scope: 'order', userId: null });
assert.equal(resolveCustomerNotificationTarget({
  authenticatedUserId: 'account',
  order: trueGuestOrder,
  nowMs: now,
}), null);
assert.deepEqual(resolveCustomerNotificationTarget({
  authenticatedUserId: 'account',
  order: trueGuestOrder,
  accessToken: 'secret-order-token',
  nowMs: now,
}), { scope: 'order', userId: 'account' });
assert.equal(resolveCustomerNotificationTarget({ order: null, accessToken: 'secret-order-token', nowMs: now }), null);
assert.equal(resolveCustomerNotificationTarget({
  order: { ...freshOrder, createdAt: new Date(now - CUSTOMER_NOTIFICATION_PROOF_MAX_AGE_MS - 1) },
  accessToken: 'secret-order-token',
  nowMs: now,
}), null);
assert.equal(resolveCustomerNotificationTarget({
  order: { ...freshOrder, createdAt: new Date(now + 1) },
  accessToken: 'secret-order-token',
  nowMs: now,
}), null);

clearCustomerIdentityCacheForTests();
setCachedCustomerIdentity('deleted-user-token', { id: 'deleted-user', role: 'USER' });
setCachedCustomerIdentity('other-user-token', { id: 'other-user', role: 'USER' });
assert.equal(getCachedCustomerIdentity('deleted-user-token')?.id, 'deleted-user');
invalidateCachedCustomerIdentity('deleted-user');
assert.equal(getCachedCustomerIdentity('deleted-user-token'), null);
assert.equal(getCachedCustomerIdentity('other-user-token')?.id, 'other-user');
clearCustomerIdentityCacheForTests();

const profileSource = readFileSync(path.resolve(__dirname, '../routes/profile.ts'), 'utf8');
assert.match(profileSource, /deviceInstallation\.updateMany/);
assert.match(profileSource, /active:\s*false/);
assert.match(profileSource, /tokenHash:\s*null/);
assert.match(profileSource, /tokenCiphertext:\s*null/);
assert.match(profileSource, /revokedReason:\s*'account_deleted'/);
assert.match(profileSource, /\$transaction\(async \(tx\)/);
assert.match(profileSource, /invalidateCachedCustomerIdentity\(userId\)/);

const customerAdminSource = readFileSync(path.resolve(__dirname, '../routes/customers.ts'), 'utf8');
assert.match(customerAdminSource, /revokedReason:\s*'account_deleted_by_admin'/);
assert.match(customerAdminSource, /invalidateCachedCustomerIdentity\(id\)/);

const authSource = readFileSync(path.resolve(__dirname, '../routes/auth.ts'), 'utf8');
assert.match(
  authSource,
  /if \(tombstone\?\.deletedAt\) \{\s*return res\.status\(401\)\.json\(\{ error: 'Konto borttaget' \}\);\s*\}/,
);

const supabaseDeleteSource = readFileSync(path.resolve(__dirname, '../lib/supabaseUserDelete.ts'), 'utf8');
assert.match(supabaseDeleteSource, /for \(let page = 1; page <= 10_000; page \+= 1\)/);

const notificationRoutesSource = readFileSync(path.resolve(__dirname, '../routes/notifications.ts'), 'utf8');
for (const routePath of ['/register-fcm', '/register-device']) {
  const start = notificationRoutesSource.indexOf(`router.post('${routePath}'`);
  assert.notEqual(start, -1, `${routePath} must exist`);
  const nextRoute = notificationRoutesSource.indexOf("router.post('", start + 20);
  const routeSource = notificationRoutesSource.slice(start, nextRoute === -1 ? undefined : nextRoute);
  assert.match(routeSource, /resolveCustomerNotificationTarget\(\{ authenticatedUserId, order, accessToken \}\)/);
  assert.match(routeSource, /scope: 'installation', userId: null/);
  assert.match(routeSource, /userId: null/);
  assert.match(routeSource, /registerOrderDeviceInstallation\(\{ \.\.\.registration, orderId \}\)/);
}
const deviceInstallationSource = readFileSync(path.resolve(__dirname, '../lib/deviceInstallations.ts'), 'utf8');
const atomicOrderRegistration = deviceInstallationSource.match(
  /export async function registerOrderDeviceInstallation[\s\S]*?export async function importLegacyUserInstallations/,
)?.[0] || '';
assert.match(atomicOrderRegistration, /FOR UPDATE/);
assert.match(atomicOrderRegistration, /registerDeviceInstallation/);
assert.match(atomicOrderRegistration, /upsertOrderDeviceSubscription/);

const dealsSource = readFileSync(path.resolve(__dirname, '../routes/deals.ts'), 'utf8');
const dealDetailRoute = dealsSource.match(
  /router\.get\('\/:id\/restaurants'[\s\S]*?\/\/ GET \/api\/deals\/banners/,
)?.[0] || '';
assert.match(dealDetailRoute, /deal\.isPersonalTemplate/);
assert.match(dealDetailRoute, /deal\.isTemplate/);
assert.match(dealDetailRoute, /!isCustomerFacing/);
assert.match(dealDetailRoute, /isDealAvailableNow\(deal, now\)/);
assert.match(profileSource, /isPersonalTemplate:\s*false/);
assert.match(profileSource, /isTemplate:\s*false/);

const softDeleteMigration = readFileSync(
  path.resolve(__dirname, '../../prisma/migrations/20260715210000_customer_soft_delete/migration.sql'),
  'utf8',
);
assert.match(softDeleteMigration, /ADD COLUMN IF NOT EXISTS "deletedAt"/);

console.log('Customer notification/device access and deletion revocation contracts OK');
