import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  customerPushTokenHash,
  customerPushAdvisoryLockResources,
  decryptCustomerPushToken,
  encryptCustomerPushToken,
  MAX_ACTIVE_WEB_PUSH_DEVICES_PER_ORDER,
  MAX_ACTIVE_WEB_PUSH_DEVICES_PER_USER,
  opaqueInstallationId,
  orderScopedInstallationUserId,
  ORDER_DEVICE_SUBSCRIPTION_TTL_MS,
  registerDeviceInstallation,
  revokeOrderWebPushSubscription,
  upsertOrderDeviceSubscription,
  validateBrowserPushSubscription,
} from '../lib/deviceInstallations';
import {
  activeOrderSubscribedDeviceWhere,
  notificationOutboxBackoffMs,
  ORDER_STATUS_NOTIFICATION_MAX_ATTEMPTS,
  orderStatusNotificationMatchesCurrent,
  withOrderNotificationDispatchLock,
} from '../lib/notificationOutbox';
import { classifyFcmFailure } from '../lib/courierFcm';
import {
  evaluateCustomerNotificationWorkerHealth,
  type CustomerNotificationWorkerSnapshot,
} from '../lib/customerNotificationWorkers';

process.env.PUSH_TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';

const raw = 'fcm-installation-secret-value';
const encrypted = encryptCustomerPushToken(raw);
assert.notEqual(encrypted, raw);
assert(!encrypted.includes(raw));
assert.equal(decryptCustomerPushToken(encrypted), raw);
assert.equal(customerPushTokenHash('FCM_FID', raw), customerPushTokenHash('FCM_FID', raw));
assert.notEqual(customerPushTokenHash('FCM_FID', raw), customerPushTokenHash('APNS', raw));
assert(opaqueInstallationId('FCM_FID', raw).startsWith('legacy_'));
assert(!opaqueInstallationId('FCM_FID', raw).includes(raw));
const advisoryResources = customerPushAdvisoryLockResources(
  'WEB_PUSH',
  'web_device',
  customerPushTokenHash('WEB_PUSH', raw),
);
assert.equal(advisoryResources.length, 2);
assert.deepEqual(advisoryResources, [...advisoryResources].sort());
assert.notEqual(advisoryResources[0], advisoryResources[1]);
assert.equal(orderScopedInstallationUserId('owner-a', 'owner-a'), 'owner-a');
assert.equal(orderScopedInstallationUserId('owner-a', 'owner-b'), null);
assert.equal(orderScopedInstallationUserId('owner-a', null), null);
assert.equal(orderScopedInstallationUserId(null, 'owner-a'), null);

assert.equal(notificationOutboxBackoffMs(1), 5_000);
assert.equal(notificationOutboxBackoffMs(2), 15_000);
assert.equal(notificationOutboxBackoffMs(8), 3_600_000);
assert.equal(notificationOutboxBackoffMs(10), 14_400_000);
assert.equal(notificationOutboxBackoffMs(100), 14_400_000);
assert.equal(ORDER_STATUS_NOTIFICATION_MAX_ATTEMPTS, 15);
assert.equal(orderStatusNotificationMatchesCurrent('ORDER_STATUS', { status: 'READY' }, 'READY'), true);
assert.equal(orderStatusNotificationMatchesCurrent('ORDER_STATUS', { status: 'PREPARING' }, 'READY'), false);
assert.equal(orderStatusNotificationMatchesCurrent('ORDER_STATUS', null, 'READY'), false);
assert.equal(orderStatusNotificationMatchesCurrent('ADMIN', null, 'READY'), true);
assert.equal(ORDER_DEVICE_SUBSCRIPTION_TTL_MS, 7 * 24 * 60 * 60_000);
assert.equal(MAX_ACTIVE_WEB_PUSH_DEVICES_PER_ORDER, 6);
assert.equal(MAX_ACTIVE_WEB_PUSH_DEVICES_PER_USER, 20);

const browserKey = crypto.createECDH('prime256v1');
browserKey.generateKeys();
const validBrowserKeys = {
  p256dh: browserKey.getPublicKey().toString('base64url'),
  auth: crypto.randomBytes(16).toString('base64url'),
};
for (const endpoint of [
  'https://fcm.googleapis.com/fcm/send/example',
  'https://android.googleapis.com/gcm/send/legacy-example',
  'https://updates.push.services.mozilla.com/wpush/v2/example',
  'https://web.push.apple.com/Qexample',
  'https://wns2-db3p.notify.windows.com/w/?token=example',
]) {
  assert.equal(validateBrowserPushSubscription({ endpoint, keys: validBrowserKeys }).endpoint, endpoint);
}
for (const endpoint of [
  'http://fcm.googleapis.com/fcm/send/example',
  'https://127.0.0.1/push',
  'https://localhost/push',
  'https://fcm.googleapis.com.evil.example/push',
  'https://user:secret@fcm.googleapis.com/push',
  'https://fcm.googleapis.com:444/push',
  'https://fcm.googleapis.com/push#fragment',
]) {
  assert.throws(
    () => validateBrowserPushSubscription({ endpoint, keys: validBrowserKeys }),
    /provider|endpoint/i,
  );
}
assert.throws(() => validateBrowserPushSubscription({
  endpoint: 'https://fcm.googleapis.com/fcm/send/example',
  keys: { ...validBrowserKeys, auth: crypto.randomBytes(15).toString('base64url') },
}), /auth/i);
assert.throws(() => validateBrowserPushSubscription({
  endpoint: 'https://fcm.googleapis.com/fcm/send/example',
  keys: { ...validBrowserKeys, p256dh: 'not-a-real-public-key' },
}), /p256dh/i);
assert.throws(() => validateBrowserPushSubscription({
  endpoint: 'https://fcm.googleapis.com/fcm/send/example',
  keys: validBrowserKeys,
  ignored: 'x'.repeat(4_096),
}), /för stor/i);

const pushRouteSource = readFileSync(path.resolve(__dirname, '../routes/push.ts'), 'utf8');
assert.match(pushRouteSource, /router\.post\('\/subscribe', subscribeLimiter/);
assert.match(pushRouteSource, /router\.post\('\/unsubscribe', unsubscribeLimiter/);
assert.match(pushRouteSource, /await revokeOrderWebPushSubscription\(req\.body\?\.subscription\)/);
assert.match(pushRouteSource, /return res\.json\(\{ ok: true \}\)/);
const pushAccessRoutes = pushRouteSource.slice(
  pushRouteSource.indexOf("router.post('/order-access'"),
  pushRouteSource.indexOf("router.post('/unsubscribe'"),
);
assert.doesNotMatch(pushAccessRoutes, /accessToken:\s*req\.body/);
const deviceInstallationSource = readFileSync(path.resolve(__dirname, '../lib/deviceInstallations.ts'), 'utf8');
assert.match(deviceInstallationSource, /activeForOrder >= MAX_ACTIVE_WEB_PUSH_DEVICES_PER_ORDER/);
assert.match(deviceInstallationSource, /activeForUser >= MAX_ACTIVE_WEB_PUSH_DEVICES_PER_USER/);
assert.match(deviceInstallationSource, /FROM "Order" WHERE "id" = \$\{input\.orderId\} FOR UPDATE/);
assert.match(deviceInstallationSource, /pg_advisory_xact_lock/);
assert.match(deviceInstallationSource, /await lockDeviceRegistration\(tx, 'WEB_PUSH', installationId, tokenHash\)/);
assert.match(deviceInstallationSource, /registerOrderDeviceInstallation/);
const notificationRoutesSource = readFileSync(path.resolve(__dirname, '../routes/notifications.ts'), 'utf8');
assert.match(notificationRoutesSource, /registerOrderDeviceInstallation/);
assert.doesNotMatch(notificationRoutesSource, /await upsertOrderDeviceSubscription/);
const apiIndexSource = readFileSync(path.resolve(__dirname, '../index.ts'), 'utf8');
const criticalWorkerStart = apiIndexSource.indexOf('startCustomerNotificationWorkers();');
const bestEffortBootstrap = apiIndexSource.indexOf('await ensureRestaurantAdmins();');
assert(criticalWorkerStart > 0 && criticalWorkerStart < bestEffortBootstrap);
assert.match(apiIndexSource, /getCustomerNotificationWorkerIssues\(\)/);
assert.match(apiIndexSource, /checks: \{ database, databaseSchema, adminMfa, notificationWorkers \}/);
assert.doesNotMatch(apiIndexSource, /setInterval\(\(\) => \{ void dispatchCustomerNotifications\(\); \}, 5_000\)/);
const notificationOutboxSource = readFileSync(path.resolve(__dirname, '../lib/notificationOutbox.ts'), 'utf8');
assert.match(notificationOutboxSource, /customer-notification-order:/);
assert.match(notificationOutboxSource, /pg_advisory_xact_lock/);
assert.match(notificationOutboxSource, /This is deliberately the last DB action before transport/);
const customerPushTransportSource = readFileSync(path.resolve(__dirname, '../lib/customerPushTransport.ts'), 'utf8');
assert.match(customerPushTransportSource, /validateBrowserPushSubscription\(JSON\.parse\(input\.rawToken\)\)/);

const workerNow = Date.parse('2026-07-15T12:00:00Z');
const heartbeat = (lastSucceededAt: number | null) => ({
  running: false,
  lastStartedAt: lastSucceededAt,
  lastSucceededAt,
  lastFailedAt: null,
  consecutiveFailures: 0,
  lastError: null,
});
const healthyWorkers: CustomerNotificationWorkerSnapshot = {
  startedAt: workerNow - 60_000,
  workers: {
    outbox: heartbeat(workerNow - 1_000),
    reconciler: heartbeat(workerNow - 30_000),
    prune: heartbeat(workerNow - 60_000),
  },
};
assert.deepEqual(evaluateCustomerNotificationWorkerHealth(healthyWorkers, workerNow), []);
assert.equal(evaluateCustomerNotificationWorkerHealth({
  startedAt: null,
  workers: healthyWorkers.workers,
}, workerNow)[0]?.key, 'notification_workers_not_started');
assert(evaluateCustomerNotificationWorkerHealth({
  ...healthyWorkers,
  workers: {
    ...healthyWorkers.workers,
    outbox: heartbeat(workerNow - 6 * 60_000),
  },
}, workerNow).some((issue) => issue.key === 'notification_worker_outbox'));

const scopedAt = new Date('2026-07-15T12:00:00Z');
const scopedWhere = activeOrderSubscribedDeviceWhere('order-account', scopedAt, 'owner-a');
assert.deepEqual(scopedWhere, {
  AND: [
    {
      orderSubscriptions: {
        some: {
          orderId: 'order-account',
          revokedAt: null,
          expiresAt: { gt: scopedAt },
        },
      },
    },
    { OR: [{ userId: null }, { userId: 'owner-a' }] },
  ],
});
assert.equal('provider' in scopedWhere, false, 'all order-subscribed providers must be eligible');
assert.deepEqual(activeOrderSubscribedDeviceWhere('order-guest', scopedAt, null), {
  AND: [
    {
      orderSubscriptions: {
        some: {
          orderId: 'order-guest',
          revokedAt: null,
          expiresAt: { gt: scopedAt },
        },
      },
    },
    { userId: null },
  ],
});

assert.equal(classifyFcmFailure({
  error: {
    status: 'INVALID_ARGUMENT',
    details: [{
      '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError',
      errorCode: 'INVALID_ARGUMENT',
    }],
  },
}), 'dead');
assert.equal(classifyFcmFailure({
  error: {
    status: 'INVALID_ARGUMENT',
    details: [{
      '@type': 'type.googleapis.com/google.rpc.BadRequest',
      fieldViolations: [{ field: 'message.data', description: 'reserved key' }],
    }],
  },
}), 'error');
assert.equal(classifyFcmFailure({ error: { status: 'NOT_FOUND' } }), 'error');
assert.equal(classifyFcmFailure({ error: { status: 'UNREGISTERED' } }), 'dead');

void (async () => {
  const now = new Date('2026-07-15T12:00:00Z');
  const webSubscription = validateBrowserPushSubscription({
    endpoint: 'https://fcm.googleapis.com/fcm/send/unsubscribe-test',
    keys: validBrowserKeys,
  });
  const storedWebTokenHash = customerPushTokenHash('WEB_PUSH', JSON.stringify(webSubscription));
  const storedWebInstallationId = `web_${crypto.createHash('sha256').update(webSubscription.endpoint).digest('hex').slice(0, 40)}`;
  let revokedSubscriptions = 0;
  let revokedDevice = 0;
  let unsubscribeAdvisoryLocks = 0;
  const unsubscribeClient = {
    $transaction: async (run: (tx: any) => Promise<unknown>) => run({
      $queryRaw: async () => { unsubscribeAdvisoryLocks += 1; return []; },
      deviceInstallation: {
        findFirst: async ({ where }: any) =>
          where.provider === 'WEB_PUSH' &&
          where.installationId === storedWebInstallationId &&
          where.tokenHash === storedWebTokenHash
            ? { id: 'web-device-1' }
            : null,
        updateMany: async () => { revokedDevice += 1; return { count: 1 }; },
      },
      deviceOrderSubscription: {
        updateMany: async () => { revokedSubscriptions += 1; return { count: 2 }; },
      },
    }),
  };
  assert.equal(await revokeOrderWebPushSubscription({
    ...webSubscription,
    keys: { ...webSubscription.keys, auth: crypto.randomBytes(16).toString('base64url') },
  }, unsubscribeClient), false, 'all subscription secrets must match');
  assert.equal(revokedDevice, 0);
  assert.equal(await revokeOrderWebPushSubscription(webSubscription, unsubscribeClient), true);
  assert.equal(revokedSubscriptions, 1);
  assert.equal(revokedDevice, 1);
  assert.equal(unsubscribeAdvisoryLocks, 4, 'both installation and token aliases lock on every revoke');

  const accountDevice: any = {
    id: 'device-account-to-guest',
    userId: 'account-1',
    provider: 'FCM_FID',
    installationId: 'physical-device-1',
    tokenHash: customerPushTokenHash('FCM_FID', raw),
    tokenCiphertext: encryptCustomerPushToken(raw),
    active: true,
  };
  const subscriptions: any[] = [{
    deviceInstallationId: accountDevice.id,
    orderId: 'old-account-order',
    expiresAt: new Date(now.getTime() + ORDER_DEVICE_SUBSCRIPTION_TTL_MS),
    revokedAt: null,
  }];
  let registrationAdvisoryLocks = 0;
  const deviceStore = {
    $queryRaw: async () => { registrationAdvisoryLocks += 1; return []; },
    user: { updateMany: async () => ({ count: 0 }) },
    deviceInstallation: {
      findUnique: async ({ where }: any) => {
        if (where.provider_installationId) {
          const key = where.provider_installationId;
          return key.provider === accountDevice.provider && key.installationId === accountDevice.installationId
            ? accountDevice
            : null;
        }
        return where.tokenHash === accountDevice.tokenHash ? accountDevice : null;
      },
      update: async ({ data }: any) => {
        Object.assign(accountDevice, data);
        return { ...accountDevice };
      },
      create: async () => { throw new Error('unexpected create'); },
    },
    deviceOrderSubscription: {
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const subscription of subscriptions) {
          if (
            subscription.deviceInstallationId === where.deviceInstallationId &&
            (where.revokedAt !== null || subscription.revokedAt === null)
          ) {
            Object.assign(subscription, data);
            count += 1;
          }
        }
        return { count };
      },
      upsert: async ({ where, create, update }: any) => {
        const key = where.deviceInstallationId_orderId;
        const existing = subscriptions.find((subscription) =>
          subscription.deviceInstallationId === key.deviceInstallationId &&
          subscription.orderId === key.orderId,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const created = { ...create, revokedAt: null };
        subscriptions.push(created);
        return created;
      },
    },
  };
  const fakeClient = {
    $transaction: async (run: (tx: any) => Promise<unknown>) => run(deviceStore),
    deviceOrderSubscription: deviceStore.deviceOrderSubscription,
  };

  const transitioned = await registerDeviceInstallation({
    userId: null,
    provider: 'FCM_FID',
    rawToken: raw,
    installationId: accountDevice.installationId,
    platform: 'android',
  }, false, fakeClient);
  assert.equal(transitioned.userId, null, 'explicit null must detach the previous account');
  assert(subscriptions.find((row) => row.orderId === 'old-account-order')?.revokedAt instanceof Date);
  assert.equal(registrationAdvisoryLocks, 2, 'registration locks installation and token aliases before ownership lookup');

  await upsertOrderDeviceSubscription({
    deviceInstallationId: accountDevice.id,
    orderId: 'exact-guest-order',
    now,
  }, fakeClient);
  const exactGuestScope = subscriptions.find((row) => row.orderId === 'exact-guest-order');
  assert(exactGuestScope);
  assert.equal(exactGuestScope.revokedAt, null);
  assert.equal(exactGuestScope.expiresAt.getTime() - now.getTime(), ORDER_DEVICE_SUBSCRIPTION_TTL_MS);
  assert.equal(
    subscriptions.filter((row) => row.revokedAt === null).map((row) => row.orderId).join(','),
    'exact-guest-order',
  );

  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
  };
  const createSharedAdvisoryClient = () => {
    let tail = Promise.resolve();
    return {
      $transaction: async (run: (tx: any) => Promise<unknown>) => {
        const previous = tail;
        const release = deferred();
        tail = release.promise;
        try {
          return await run({
            $queryRaw: async () => { await previous; return []; },
          });
        } finally {
          release.resolve();
        }
      },
    };
  };

  // Replica A gets PREPARING first. READY may already be committed while A is
  // sending, but replica B waits on the same order lock and is delivered last.
  {
    const client = createSharedAdvisoryClient();
    let currentStatus = 'PREPARING';
    const sent: string[] = [];
    const oldEntered = deferred();
    const releaseOld = deferred();
    const older = withOrderNotificationDispatchLock('order-race-old-first', async () => {
      if (orderStatusNotificationMatchesCurrent('ORDER_STATUS', { status: 'PREPARING' }, currentStatus)) {
        oldEntered.resolve();
        await releaseOld.promise;
        sent.push('PREPARING');
      }
    }, client);
    await oldEntered.promise;
    currentStatus = 'READY';
    const newer = withOrderNotificationDispatchLock('order-race-old-first', async () => {
      if (orderStatusNotificationMatchesCurrent('ORDER_STATUS', { status: 'READY' }, currentStatus)) {
        sent.push('READY');
      }
    }, client);
    releaseOld.resolve();
    await Promise.all([older, newer]);
    assert.deepEqual(sent, ['PREPARING', 'READY']);
  }

  // Replica B gets the lock after READY is current. The older PREPARING job
  // waits, re-checks under the lock and is superseded without transport.
  {
    const client = createSharedAdvisoryClient();
    const currentStatus = 'READY';
    const sent: string[] = [];
    const newEntered = deferred();
    const releaseNew = deferred();
    const newer = withOrderNotificationDispatchLock('order-race-new-first', async () => {
      newEntered.resolve();
      await releaseNew.promise;
      if (orderStatusNotificationMatchesCurrent('ORDER_STATUS', { status: 'READY' }, currentStatus)) {
        sent.push('READY');
      }
    }, client);
    await newEntered.promise;
    const older = withOrderNotificationDispatchLock('order-race-new-first', async () => {
      if (orderStatusNotificationMatchesCurrent('ORDER_STATUS', { status: 'PREPARING' }, currentStatus)) {
        sent.push('PREPARING');
      }
    }, client);
    releaseNew.resolve();
    await Promise.all([newer, older]);
    assert.deepEqual(sent, ['READY']);
  }

  console.log('notification outbox contracts: ownership serialisation and cross-replica status ordering OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
