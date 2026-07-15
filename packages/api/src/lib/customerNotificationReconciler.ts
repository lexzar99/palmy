import prisma from './prisma';
import { customerOrderStatusCopy } from './customerOrderNotifier';
import { customerOrderNotificationAuditId } from './notificationIds';
import {
  enqueueCustomerNotification,
  orderScopedDeviceOwnerWhere,
  ORDER_STATUS_NOTIFICATION_MAX_ATTEMPTS,
} from './notificationOutbox';

const RECONCILABLE_STATUSES = [
  'ACCEPTED',
  'PREPARING',
  'READY',
  'DELIVERING',
  'DELIVERED',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'DELIVERY_FAILED',
] as const;
const NON_TERMINAL_NOTIFICATION_STATUSES = new Set(['ACCEPTED', 'PREPARING', 'READY', 'DELIVERING']);
const TRANSIENT_PROVIDER_REVIVAL_ATTEMPTS = 7;

type CurrentOrderCandidate = { id: string; status: string };
type ExistingCurrentOutbox = {
  dedupeKey: string;
  status: string;
  acceptedCount: number;
  lastError: string | null;
  attemptCount?: number;
  failureCount?: number;
};

export function isTransientCustomerPushFailure(value: string | null): boolean {
  const error = String(value || '');
  return error === 'provider_retry' ||
    error === 'token_decryption' ||
    error.startsWith('fcm_') ||
    error.startsWith('expo_') ||
    error.startsWith('apns_') ||
    error.startsWith('web_push_');
}

export function currentNotificationOutboxBlocksRepair(
  row: ExistingCurrentOutbox,
  currentStatus?: string,
): boolean {
  const exhaustedWithoutDevice =
    (row.status === 'DEAD' || row.status === 'COMPLETED') &&
    row.acceptedCount === 0 &&
    row.lastError === 'no_active_installations';
  const transientProviderFailureForCurrentLiveOrder =
    row.status === 'DEAD' &&
    NON_TERMINAL_NOTIFICATION_STATUSES.has(String(currentStatus || '').toUpperCase()) &&
    isTransientCustomerPushFailure(row.lastError);
  return !(exhaustedWithoutDevice || transientProviderFailureForCurrentLiveOrder);
}

export function planMissingCurrentOrderNotifications(
  orders: readonly CurrentOrderCandidate[],
  existingDedupeKeys: ReadonlySet<string>,
) {
  const allowed = new Set<string>(RECONCILABLE_STATUSES);
  return orders
    .map((order) => ({
      orderId: order.id,
      status: String(order.status || '').toUpperCase(),
      dedupeKey: customerOrderNotificationAuditId(order.id, order.status),
    }))
    .filter((candidate) => allowed.has(candidate.status) && !existingDedupeKeys.has(candidate.dedupeKey));
}

type LockedOrder = {
  id: string;
  status: string;
  type: string;
  userId: string | null;
  estimatedTime: number | null;
  etaCustomerMin: number | null;
  liveActivityToken: string | null;
};

async function repairCurrentOrderNotification(orderId: string): Promise<'created' | 'deduped' | 'skipped'> {
  return prisma.$transaction(async (tx) => {
    // Row lock guarantees that the status used in dedupe/copy is the CURRENT
    // committed status for the whole enqueue operation. We never iterate old
    // status history or synthesize missing intermediate notifications.
    const rows = await tx.$queryRaw<LockedOrder[]>`
      SELECT "id", "status", "type", "userId",
             "estimatedTime", "etaCustomerMin", "liveActivityToken"
      FROM "Order"
      WHERE "id" = ${orderId}
      FOR UPDATE
    `;
    const order = rows[0];
    if (!order) return 'skipped';
    const status = String(order.status || '').toUpperCase();
    const copy = customerOrderStatusCopy(status, order.type, order.estimatedTime, order.etaCustomerMin);
    if (!copy) return 'skipped';

    const user = order.userId
      ? await tx.user.findFirst({
          where: { id: order.userId, isActive: true, deletedAt: null },
          select: { id: true, pushToken: true, apnsDeviceToken: true },
        })
      : null;

    const now = new Date();
    const [nativeDevices, orderScopedDevices] = await Promise.all([
      user?.id
        ? tx.deviceInstallation.count({
            where: {
              userId: user.id,
              active: true,
              tokenCiphertext: { not: null },
              provider: { not: 'WEB_PUSH' },
            },
          })
        : Promise.resolve(0),
      tx.deviceOrderSubscription.count({
        where: {
          orderId: order.id,
          revokedAt: null,
          expiresAt: { gt: now },
          deviceInstallation: {
            active: true,
            tokenCiphertext: { not: null },
            ...orderScopedDeviceOwnerWhere(user?.id || null),
          },
        },
      }),
    ]);
    const hasLegacyDevice = Boolean(user?.pushToken || user?.apnsDeviceToken);
    if (!hasLegacyDevice && nativeDevices === 0 && orderScopedDevices === 0) return 'skipped';

    const dedupeKey = customerOrderNotificationAuditId(order.id, status);
    const existingOutbox = await tx.notificationOutbox.findUnique({
      where: { dedupeKey },
      select: {
        id: true,
        dedupeKey: true,
        status: true,
        acceptedCount: true,
        failureCount: true,
        attemptCount: true,
        lastError: true,
      },
    });
    if (existingOutbox && !currentNotificationOutboxBlocksRepair(existingOutbox, status)) {
      const transientProviderFailure =
        existingOutbox.status === 'DEAD' &&
        isTransientCustomerPushFailure(existingOutbox.lastError);
      const revived = await tx.notificationOutbox.updateMany({
        where: {
          id: existingOutbox.id,
          status: existingOutbox.status,
          acceptedCount: existingOutbox.acceptedCount,
          lastError: existingOutbox.lastError,
        },
        data: {
          status: 'RETRY',
          availableAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
          // Provider retries have immutable delivery audit rows keyed by
          // attemptNo. Continue the sequence so revival cannot collide with
          // those rows; no-device jobs have no delivery rows and may restart.
          attemptCount: transientProviderFailure ? existingOutbox.attemptCount : 0,
          maxAttempts: transientProviderFailure
            // Attempts are already in the four-hour backoff tier. Seven more
            // gives roughly one additional day without a tight replay loop.
            ? Math.min(existingOutbox.attemptCount + TRANSIENT_PROVIDER_REVIVAL_ATTEMPTS, 100)
            : ORDER_STATUS_NOTIFICATION_MAX_ATTEMPTS,
          failureCount: transientProviderFailure ? existingOutbox.failureCount : 0,
          completedAt: null,
          lastError: null,
        },
      });
      if (revived.count === 1) return 'created';
    }

    const result = await enqueueCustomerNotification({
      dedupeKey,
      kind: 'ORDER_STATUS',
      userId: user?.id || null,
      orderId: order.id,
      title: copy.title,
      body: copy.body,
      maxAttempts: ORDER_STATUS_NOTIFICATION_MAX_ATTEMPTS,
      data: {
        orderId: order.id,
        status,
        url: `/order/${order.id}`,
        deeplink: `/order/${order.id}`,
        ...(order.liveActivityToken ? { apnsMode: 'silent' } : {}),
      },
    }, tx);
    return result.created ? 'created' : 'deduped';
  });
}

/**
 * Repairs only a missing outbox row for each order's current status. The
 * bounded lookback/batch prevents a historical replay storm after deploy.
 */
export async function reconcileRecentCustomerOrderNotifications(options?: {
  lookbackMs?: number;
  batchSize?: number;
}) {
  const lookbackMs = Math.min(Math.max(options?.lookbackMs || 72 * 60 * 60_000, 60_000), 7 * 24 * 60 * 60_000);
  const batchSize = Math.min(Math.max(options?.batchSize || 200, 1), 500);
  const orders = await prisma.order.findMany({
    where: {
      updatedAt: { gte: new Date(Date.now() - lookbackMs) },
      status: { in: [...RECONCILABLE_STATUSES] },
    },
    orderBy: { updatedAt: 'desc' },
    take: batchSize,
    select: { id: true, status: true },
  });
  const candidateKeys = orders.map((order) => customerOrderNotificationAuditId(order.id, order.status));
  const existing = candidateKeys.length
    ? await prisma.notificationOutbox.findMany({
        where: { dedupeKey: { in: candidateKeys } },
        select: { dedupeKey: true, status: true, acceptedCount: true, lastError: true },
      })
    : [];
  const statusByDedupeKey = new Map(
    orders.map((order) => [customerOrderNotificationAuditId(order.id, order.status), order.status]),
  );
  const planned = planMissingCurrentOrderNotifications(
    orders,
    new Set(existing
      .filter((row) => currentNotificationOutboxBlocksRepair(row, statusByDedupeKey.get(row.dedupeKey)))
      .map((row) => row.dedupeKey)),
  );

  let created = 0;
  let deduped = 0;
  let skipped = 0;
  let errors = 0;
  for (const candidate of planned) {
    try {
      const result = await repairCurrentOrderNotification(candidate.orderId);
      if (result === 'created') created += 1;
      else if (result === 'deduped') deduped += 1;
      else skipped += 1;
    } catch (error) {
      errors += 1;
      console.warn('[customerNotificationReconciler] repair failed:', candidate.orderId, (error as Error)?.message || error);
    }
  }
  return { scanned: orders.length, planned: planned.length, created, deduped, skipped, errors };
}
