import crypto from 'node:crypto';
import os from 'node:os';
import type { Prisma } from '@prisma/client';
import prisma from './prisma';
import {
  type CustomerPushProvider,
  customerPushAdvisoryLockResources,
  decryptCustomerPushToken,
  importLegacyUserInstallations,
  lockCustomerPushAdvisoryResources,
} from './deviceInstallations';
import { sendCustomerPushTransport, type CustomerPushTransportResult } from './customerPushTransport';

const WORKER_ID = `${os.hostname()}:${process.pid}:${crypto.randomUUID().slice(0, 8)}`;
const LEASE_MS = 2 * 60_000;
export const ORDER_STATUS_NOTIFICATION_MAX_ATTEMPTS = 15;
const ORDER_DISPATCH_TRANSACTION_TIMEOUT_MS = 75_000;

function notificationOrderAdvisoryLockPair(orderId: string): [number, number] {
  const digest = crypto.createHash('sha256')
    .update(`customer-notification-order:${orderId}`, 'utf8')
    .digest();
  return [digest.readInt32BE(0), digest.readInt32BE(4)];
}

/**
 * Serialise every status job for one order across API replicas. The callback
 * intentionally owns the transaction (and therefore the advisory lock) through
 * the final current-status check and provider transport. That guarantees:
 *
 * - newer job wins first -> older job observes the new DB status and is skipped;
 * - older job wins first -> newer job waits and is necessarily delivered last.
 */
export async function withOrderNotificationDispatchLock<T>(
  orderId: string,
  run: (tx: any) => Promise<T>,
  client: any = prisma,
): Promise<T> {
  const [classId, objectId] = notificationOrderAdvisoryLockPair(orderId);
  return client.$transaction(async (tx: any) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${classId}, ${objectId})`;
    return run(tx);
  }, {
    maxWait: 10_000,
    timeout: ORDER_DISPATCH_TRANSACTION_TIMEOUT_MS,
  });
}

export type EnqueueCustomerNotificationInput = {
  dedupeKey: string;
  kind: string;
  userId?: string | null;
  orderId?: string | null;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
  availableAt?: Date;
  maxAttempts?: number;
};

export type EnqueueCustomerNotificationResult = {
  id: string;
  created: boolean;
  status: string;
};

export function notificationOutboxBackoffMs(attempt: number): number {
  // Attempts 10+ wait four hours. With the order-status policy's 15 attempts,
  // a transient provider outage remains recoverable for about 24 hours.
  const seconds = [5, 15, 45, 120, 300, 900, 1_800, 3_600, 7_200, 14_400];
  return seconds[Math.min(Math.max(attempt - 1, 0), seconds.length - 1)] * 1_000;
}

export function orderStatusNotificationMatchesCurrent(
  kind: string,
  data: unknown,
  currentStatus: string,
): boolean {
  if (kind !== 'ORDER_STATUS') return true;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  return String((data as Record<string, unknown>).status || '').toUpperCase() ===
    String(currentStatus || '').toUpperCase();
}

const ADMIN_INSTALLATION_TARGET_KEY = '__targetInstallationId';

export function adminInstallationTargetId(kind: string, data: unknown): string | null {
  if (kind !== 'ADMIN_INSTALLATION' || !data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }
  const value = String((data as Record<string, unknown>)[ADMIN_INSTALLATION_TARGET_KEY] || '').trim();
  return value || null;
}

/**
 * Nullable-user devices are deliberately exact-order guest capabilities. A
 * non-null device may only join the account owner carried by the outbox after
 * that owner has been checked against the current Order row.
 */
export function orderScopedDeviceOwnerWhere(
  authorizedUserId: string | null,
): Prisma.DeviceInstallationWhereInput {
  return authorizedUserId
    ? { OR: [{ userId: null }, { userId: authorizedUserId }] }
    : { userId: null };
}

/** Every provider may be order-scoped; relation + compatible owner are gates. */
export function activeOrderSubscribedDeviceWhere(
  orderId: string,
  now: Date,
  authorizedUserId: string | null,
): Prisma.DeviceInstallationWhereInput {
  return {
    AND: [
      {
        orderSubscriptions: {
          some: { orderId, revokedAt: null, expiresAt: { gt: now } },
        },
      },
      orderScopedDeviceOwnerWhere(authorizedUserId),
    ],
  };
}

/** Stable dedupe means a repeated status/webhook/admin scheduler only gets one job. */
export async function enqueueCustomerNotification(
  input: EnqueueCustomerNotificationInput,
  client: any = prisma,
): Promise<EnqueueCustomerNotificationResult> {
  const dedupeKey = String(input.dedupeKey || '').trim();
  if (!dedupeKey || dedupeKey.length > 300) throw new Error('Ogiltig notification dedupeKey');
  const installationTargetId = adminInstallationTargetId(input.kind, input.data);
  if (!input.userId && (!input.orderId || input.kind !== 'ORDER_STATUS') && !installationTargetId) {
    throw new Error('Gästnotiser måste vara orderspecifika ORDER_STATUS-jobb');
  }
  try {
    const row = await client.notificationOutbox.create({
      data: {
        dedupeKey,
        kind: input.kind,
        userId: input.userId || null,
        orderId: input.orderId || null,
        title: input.title,
        body: input.body,
        data: (input.data || undefined) as Prisma.InputJsonValue | undefined,
        availableAt: input.availableAt || new Date(),
        maxAttempts: Math.min(Math.max(input.maxAttempts || 8, 1), 20),
      },
      select: { id: true, status: true },
    });
    return { ...row, created: true };
  } catch (error: any) {
    if (error?.code !== 'P2002') throw error;
    const existing = await client.notificationOutbox.findUnique({
      where: { dedupeKey },
      select: { id: true, status: true },
    });
    if (!existing) throw error;
    return { ...existing, created: false };
  }
}

type ClaimedOutbox = Awaited<ReturnType<typeof claimOutbox>>;

async function claimOutbox(id: string) {
  const now = new Date();
  const claim = await prisma.notificationOutbox.updateMany({
    where: {
      id,
      status: { in: ['PENDING', 'RETRY', 'PROCESSING'] },
      availableAt: { lte: now },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
    },
    data: {
      status: 'PROCESSING',
      leaseOwner: WORKER_ID,
      leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      attemptCount: { increment: 1 },
    },
  });
  if (claim.count !== 1) return null;
  return prisma.notificationOutbox.findUnique({ where: { id } });
}

async function recordDelivery(
  outbox: NonNullable<ClaimedOutbox>,
  device: { id: string; provider: string },
  result: CustomerPushTransportResult,
  rawToken?: string,
  client: any = prisma,
): Promise<void> {
  const now = new Date();
  const write = async (tx: any) => {
    await tx.notificationDelivery.create({
      data: {
        outboxId: outbox.id,
        deviceInstallationId: device.id,
        provider: device.provider,
        attemptNo: outbox.attemptCount,
        status: result.status,
        providerMessageId: result.providerMessageId || null,
        errorCode: result.errorCode || null,
        errorDetail: result.errorDetail || null,
        acceptedAt: result.status === 'ACCEPTED' ? now : null,
      },
    });
    if (result.status === 'INVALID') {
      await tx.deviceInstallation.updateMany({
        where: { id: device.id, active: true },
        data: {
          active: false,
          revokedAt: now,
          revokedReason: String(result.errorCode || 'provider_invalid_token').slice(0, 120),
          tokenHash: null,
          tokenCiphertext: null,
          lastFailureAt: now,
          consecutiveFailures: { increment: 1 },
        },
      });
      if (rawToken && outbox.userId && device.provider === 'APNS') {
        await tx.user.updateMany({
            where: { id: outbox.userId, apnsDeviceToken: rawToken },
            data: { apnsDeviceToken: null },
          });
      } else if (rawToken && outbox.userId && device.provider !== 'WEB_PUSH') {
        await tx.user.updateMany({
              where: { id: outbox.userId, pushToken: rawToken },
              data: { pushToken: null },
            });
      }
      return;
    }
    await tx.deviceInstallation.updateMany({
      where: { id: device.id },
      data: result.status === 'ACCEPTED'
        ? { lastSuccessAt: now, consecutiveFailures: 0 }
        : { lastFailureAt: now, consecutiveFailures: { increment: 1 } },
    });
  };

  if (typeof client.$transaction === 'function') {
    await client.$transaction((tx: any) => write(tx));
  } else {
    await write(client);
  }
}

async function refreshOutboxMetrics(outboxId: string, client: any = prisma) {
  const grouped = await client.notificationDelivery.groupBy({
    by: ['status'],
    where: { outboxId },
    _count: { _all: true },
  });
  const count = (status: string) => grouped.find((row) => row.status === status)?._count._all || 0;
  return {
    acceptedCount: count('ACCEPTED'),
    invalidCount: count('INVALID'),
    failureCount: count('RETRY') + count('FAILED'),
  };
}

async function releaseForRetry(
  outbox: NonNullable<ClaimedOutbox>,
  error: string,
  client: any = prisma,
): Promise<void> {
  const dead = outbox.attemptCount >= outbox.maxAttempts;
  const metrics = await refreshOutboxMetrics(outbox.id, client).catch(() => ({
    acceptedCount: outbox.acceptedCount,
    invalidCount: outbox.invalidCount,
    failureCount: outbox.failureCount + 1,
  }));
  await client.notificationOutbox.updateMany({
    where: { id: outbox.id, leaseOwner: WORKER_ID },
    data: {
      ...metrics,
      status: dead ? 'DEAD' : 'RETRY',
      availableAt: dead ? outbox.availableAt : new Date(Date.now() + notificationOutboxBackoffMs(outbox.attemptCount)),
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: error.slice(0, 300),
      completedAt: dead ? new Date() : null,
    },
  });
}

async function completeOutbox(
  outbox: NonNullable<ClaimedOutbox>,
  note?: string,
  client: any = prisma,
): Promise<void> {
  const metrics = await refreshOutboxMetrics(outbox.id, client);
  await client.notificationOutbox.updateMany({
    where: { id: outbox.id, leaseOwner: WORKER_ID },
    data: {
      ...metrics,
      status: 'COMPLETED',
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: note || null,
      completedAt: new Date(),
    },
  });
}

async function processClaimedOutboxWithClient(
  outbox: NonNullable<ClaimedOutbox>,
  client: any,
): Promise<void> {
  if (outbox.orderId) {
    const currentOrder = await client.order.findUnique({
      where: { id: outbox.orderId },
      select: { status: true, userId: true },
    });
    if (!currentOrder) {
      await completeOutbox(outbox, 'order_missing', client);
      return;
    }
    if (outbox.userId && outbox.userId !== currentOrder.userId) {
      // User ownership on an Order is normally immutable. Fail closed if a
      // historical/corrupt outbox row points at another account.
      await completeOutbox(outbox, 'order_owner_mismatch', client);
      return;
    }
    if (
      outbox.kind === 'ORDER_STATUS' &&
      !orderStatusNotificationMatchesCurrent(outbox.kind, outbox.data, currentOrder.status)
    ) {
      await completeOutbox(outbox, 'superseded_order_status', client);
      return;
    }
  }

  const activeUser = outbox.userId
    ? await client.user.count({ where: { id: outbox.userId, isActive: true, deletedAt: null } })
    : null;
  if (outbox.userId && activeUser !== 1) {
    const now = new Date();
    await client.deviceInstallation.updateMany({
      where: { userId: outbox.userId, active: true },
      data: {
        active: false,
        revokedAt: now,
        revokedReason: 'user_inactive',
        tokenHash: null,
        tokenCiphertext: null,
      },
    });
    await client.user.updateMany({
      where: { id: outbox.userId },
      data: { pushToken: null, apnsDeviceToken: null },
    });
    await completeOutbox(outbox, 'user_inactive', client);
    return;
  }

  const now = new Date();
  const installationTargetId = adminInstallationTargetId(outbox.kind, outbox.data);
  const deviceWhere: Prisma.DeviceInstallationWhereInput = {
    active: true,
    tokenCiphertext: { not: null },
    ...(installationTargetId
      ? {
          id: installationTargetId,
          provider: { in: ['APNS', 'FCM_FID', 'EXPO'] },
        }
      : outbox.orderId
      ? {
          OR: [
            ...(outbox.userId
              ? [{
                  userId: outbox.userId,
                  user: { isActive: true, deletedAt: null },
                  provider: { not: 'WEB_PUSH' },
                }]
              : []),
            activeOrderSubscribedDeviceWhere(outbox.orderId, now, outbox.userId),
          ],
        }
      : {
          userId: outbox.userId!,
          user: { isActive: true, deletedAt: null },
          provider: { not: 'WEB_PUSH' },
        }),
  };
  const deviceSelect = {
    id: true,
    provider: true,
    installationId: true,
    tokenHash: true,
    tokenCiphertext: true,
  } as const;
  const candidateDevices = await client.deviceInstallation.findMany({
    where: deviceWhere,
    select: deviceSelect,
  });

  if (outbox.orderId && candidateDevices.length > 0) {
    // Ownership transfer/logout uses these exact aliases too. Holding every
    // candidate lock (globally sorted) through transport prevents a device from
    // changing customer after selection but before an old order is sent.
    const deviceLockResources = candidateDevices.flatMap((device: any) =>
      customerPushAdvisoryLockResources(
        device.provider as CustomerPushProvider,
        device.installationId,
        device.tokenHash,
      ));
    await lockCustomerPushAdvisoryResources(client, deviceLockResources);
  }

  // Re-read under the device locks. A registration/revoke that won the lock
  // first may have changed owner, active state or exact-order relation.
  const devices = candidateDevices.length > 0
    ? await client.deviceInstallation.findMany({ where: deviceWhere, select: deviceSelect })
    : candidateDevices;

  const terminalDeliveries = await client.notificationDelivery.findMany({
    where: {
      outboxId: outbox.id,
      status: { in: ['ACCEPTED', 'INVALID', 'FAILED'] },
      deviceInstallationId: { not: null },
    },
    select: { deviceInstallationId: true },
  });
  const terminalIds = new Set(terminalDeliveries.map((row: any) => row.deviceInstallationId).filter(Boolean));
  const pendingDevices = devices.filter((device: any) => !terminalIds.has(device.id));
  if (pendingDevices.length === 0) {
    if (devices.length === 0 && terminalIds.size === 0) {
      // Vanlig race: statusen köas precis före browsern hunnit registrera
      // sin orderspecifika subscription. Retry-fönstret fångar den direkt;
      // reconciliatorn kan även återuppliva ett uttömt no-device-job senare.
      await releaseForRetry(outbox, 'no_active_installations', client);
    } else {
      await completeOutbox(outbox, undefined, client);
    }
    return;
  }

  if (outbox.orderId && outbox.kind === 'ORDER_STATUS') {
    // This is deliberately the last DB action before transport. The advisory
    // transaction remains held during transport, so another replica cannot
    // deliver a newer status and then be overwritten by this older job.
    const latestOrder = await client.order.findUnique({
      where: { id: outbox.orderId },
      select: { status: true, userId: true },
    });
    if (!latestOrder) {
      await completeOutbox(outbox, 'order_missing', client);
      return;
    }
    if (outbox.userId && outbox.userId !== latestOrder.userId) {
      await completeOutbox(outbox, 'order_owner_mismatch', client);
      return;
    }
    if (!orderStatusNotificationMatchesCurrent(outbox.kind, outbox.data, latestOrder.status)) {
      await completeOutbox(outbox, 'superseded_order_status', client);
      return;
    }
  }

  const results = await Promise.all(pendingDevices.map(async (device: any) => {
    let result: CustomerPushTransportResult;
    let rawToken: string | undefined;
    try {
      rawToken = decryptCustomerPushToken(device.tokenCiphertext!);
      const payloadData = (outbox.data && typeof outbox.data === 'object' && !Array.isArray(outbox.data))
        ? { ...(outbox.data as Record<string, unknown>) }
        : undefined;
      if (payloadData) delete payloadData[ADMIN_INSTALLATION_TARGET_KEY];
      result = await sendCustomerPushTransport({
        provider: device.provider as CustomerPushProvider,
        rawToken,
        title: outbox.title,
        body: outbox.body,
        data: payloadData,
      });
    } catch (error) {
      // Fel krypteringsnyckel är ett serverfel, inte en ogiltig enhet. Tokenen
      // får inte raderas; jobbet retryas och /ready larmar om konfigurationen.
      result = {
        status: 'RETRY',
        errorCode: 'token_decryption',
        errorDetail: String((error as Error)?.message || error).slice(0, 240),
      };
    }
    await recordDelivery(outbox, device, result, rawToken, client);
    return result;
  }));

  const retry = results.find((result) => result.status === 'RETRY');
  if (retry) {
    await releaseForRetry(outbox, retry.errorCode || 'provider_retry', client);
    return;
  }
  await completeOutbox(outbox, undefined, client);
}

async function processClaimedOutbox(outbox: NonNullable<ClaimedOutbox>): Promise<void> {
  try {
    // Legacy columns are imported before taking the per-order dispatch lock;
    // provider/device advisory locks inside registration remain independent.
    if (outbox.userId) {
      const activeBeforeImport = await prisma.user.count({
        where: { id: outbox.userId, isActive: true, deletedAt: null },
      });
      if (activeBeforeImport === 1) await importLegacyUserInstallations(outbox.userId);
    }

    if (outbox.orderId) {
      await withOrderNotificationDispatchLock(
        outbox.orderId,
        (tx) => processClaimedOutboxWithClient(outbox, tx),
      );
    } else {
      await processClaimedOutboxWithClient(outbox, prisma);
    }
  } catch (error) {
    await releaseForRetry(outbox, String((error as Error)?.message || error));
  }
}

export async function dispatchNotificationOutboxBatch(limit = 25): Promise<{
  candidates: number;
  claimed: number;
}> {
  const now = new Date();
  const candidates = await prisma.notificationOutbox.findMany({
    where: {
      status: { in: ['PENDING', 'RETRY', 'PROCESSING'] },
      availableAt: { lte: now },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
    },
    orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
    take: Math.min(Math.max(limit, 1), 100),
    select: { id: true },
  });
  let claimed = 0;
  for (const candidate of candidates) {
    const outbox = await claimOutbox(candidate.id);
    if (!outbox) continue;
    claimed += 1;
    await processClaimedOutbox(outbox);
  }
  return { candidates: candidates.length, claimed };
}

export async function getCustomerNotificationMetrics(since = new Date(Date.now() - 24 * 60 * 60_000)) {
  const [deliveries, outbox] = await Promise.all([
    prisma.notificationDelivery.groupBy({
      by: ['provider', 'status'],
      where: { attemptedAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.notificationOutbox.groupBy({
      by: ['status'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);
  return {
    since,
    acceptedMeans: 'provider_accepted_not_device_displayed',
    deliveries: deliveries.map((row) => ({ provider: row.provider, status: row.status, count: row._count._all })),
    outbox: outbox.map((row) => ({ status: row.status, count: row._count._all })),
  };
}
