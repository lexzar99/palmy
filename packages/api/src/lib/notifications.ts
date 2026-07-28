import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import prisma from './prisma';
import { enqueueCustomerNotification } from './notificationOutbox';

export interface SendResult {
  success: boolean;
  count: number;
  errors: number;
  error?: string;
  queued?: boolean;
}

type QueueOptions = {
  dedupeKeyPrefix?: string;
  kind?: string;
};

const eligiblePushWhere: Prisma.UserWhereInput = {
  isActive: true,
  deletedAt: null,
  OR: [
    { deviceInstallations: { some: { active: true, provider: { not: 'WEB_PUSH' }, tokenCiphertext: { not: null } } } },
    { pushToken: { not: null } },
    { apnsDeviceToken: { not: null } },
  ],
};

function prefix(options?: QueueOptions): string {
  return options?.dedupeKeyPrefix || `admin:${crypto.randomUUID()}`;
}

async function enqueueUsers(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
  options?: QueueOptions,
): Promise<SendResult> {
  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) {
    return { success: true, count: 0, errors: 0, queued: true };
  }
  const dedupePrefix = prefix(options);
  let count = 0;
  let errors = 0;
  // Begränsad parallellism: stora broadcast-requestar ska inte öppna tusentals
  // samtidiga DB-anslutningar. Själva provider-sändningen görs av workern.
  for (let offset = 0; offset < uniqueIds.length; offset += 25) {
    const chunk = uniqueIds.slice(offset, offset + 25);
    const results = await Promise.allSettled(chunk.map((userId) =>
      enqueueCustomerNotification({
        dedupeKey: `${dedupePrefix}:user:${userId}`,
        kind: options?.kind || 'ADMIN_PUSH',
        userId,
        title,
        body,
        data: data || null,
      }),
    ));
    count += results.filter((result) => result.status === 'fulfilled').length;
    errors += results.filter((result) => result.status === 'rejected').length;
  }
  return {
    success: errors === 0,
    count,
    errors,
    queued: true,
    ...(count === 0 && errors === 0 ? { error: 'Användaren har ingen aktiv push-installation' } : {}),
  };
}

export async function sendToInstallations(
  installationIds: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
  options?: QueueOptions,
): Promise<SendResult> {
  const uniqueIds = [...new Set(installationIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { success: true, count: 0, errors: 0, queued: true };
  }
  const dedupePrefix = prefix(options);
  let count = 0;
  let errors = 0;
  for (let offset = 0; offset < uniqueIds.length; offset += 25) {
    const chunk = uniqueIds.slice(offset, offset + 25);
    const results = await Promise.allSettled(chunk.map((installationId) =>
      enqueueCustomerNotification({
        dedupeKey: `${dedupePrefix}:installation:${installationId}`,
        kind: 'ADMIN_INSTALLATION',
        title,
        body,
        data: { ...(data || {}), __targetInstallationId: installationId },
        maxAttempts: 3,
      }),
    ));
    count += results.filter((result) => result.status === 'fulfilled').length;
    errors += results.filter((result) => result.status === 'rejected').length;
  }
  return { success: errors === 0, count, errors, queued: true };
}

export async function sendToUser(
  identifier: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  options?: QueueOptions,
): Promise<SendResult> {
  const user = await prisma.user.findFirst({
    where: {
      AND: [
        eligiblePushWhere,
        { OR: [{ id: identifier }, { email: identifier }, { phone: identifier }] },
      ],
    },
    select: { id: true },
  });
  if (!user) {
    return {
      success: false,
      count: 0,
      errors: 0,
      queued: false,
      error: 'Användaren har ingen aktiv push-installation',
    };
  }
  return enqueueUsers([user.id], title, body, data, options);
}

export async function sendToCity(
  city: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  options?: QueueOptions,
): Promise<SendResult> {
  const users = await prisma.user.findMany({
    where: { ...eligiblePushWhere, city: { contains: city, mode: 'insensitive' } },
    select: { id: true },
  });
  return enqueueUsers(users.map((user) => user.id), title, body, data, options);
}

export async function sendToAllUsers(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  options?: QueueOptions,
): Promise<SendResult> {
  const users = await prisma.user.findMany({ where: eligiblePushWhere, select: { id: true } });
  return enqueueUsers(users.map((user) => user.id), title, body, data, options);
}
