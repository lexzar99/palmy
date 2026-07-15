import prisma from './prisma';
import { sendToAllUsers, sendToUser, sendToCity } from './notifications';

/**
 * A13 — runs every 60s from index.ts. Looks for scheduled pushes that are due
 * (scheduledFor <= now, not yet sent, not cancelled), dispatches them, and
 * marks them complete. Failure of one row never aborts the rest.
 */
export async function dispatchDueScheduledPushes(): Promise<void> {
  const now = new Date();
  const due = await (prisma as any).scheduledPush.findMany({
    where: {
      scheduledFor: { lte: now },
      sentAt: null,
      cancelledAt: null,
    },
    orderBy: { scheduledFor: 'asc' },
    take: 25, // cap per tick to avoid hammering the push gateway in one shot
  });

  if (due.length === 0) return;

  for (const row of due) {
    let count = 0;
    let success = true;
    let firstError: string | null = null;
    let queueErrors = 0;
    const queueOptions = { dedupeKeyPrefix: `scheduled:${row.id}`, kind: 'SCHEDULED_PUSH' };

    try {
      const data: Record<string, unknown> | undefined = row.deeplink ? { deeplink: row.deeplink } : undefined;
      if (row.target === 'all') {
        const r = await sendToAllUsers(row.title, row.body, data, queueOptions);
        count = r.count || 0;
        if (!r.success) success = false;
        queueErrors += r.errors || 0;
        if (r.errors > 0) firstError = `${r.errors} queue errors`;
      } else if (row.target === 'user' && row.identifier) {
        const r = await sendToUser(row.identifier, row.title, row.body, data, queueOptions);
        count = r.count || 0;
        success = r.success;
        queueErrors += r.errors || 0;
        firstError = r.error ?? null;
      } else if (row.target === 'city' && row.city) {
        const r = await sendToCity(row.city, row.title, row.body, data, queueOptions);
        count = r.count || 0;
        if (!r.success) success = false;
        queueErrors += r.errors || 0;
      } else if (row.target === 'cohort' && row.cohort) {
        const userIds = await resolveCohort(row.cohort);
        for (const userId of userIds) {
          try {
            const r = await sendToUser(userId, row.title, row.body, data, queueOptions);
            count += r.count || 0;
            queueErrors += r.errors || 0;
            if (!r.success && !firstError) firstError = r.error ?? null;
          } catch (e: any) {
            if (!firstError) firstError = e?.message?.slice(0, 200) || 'unknown';
          }
        }
      } else {
        success = false;
        firstError = `unsupported_target_${row.target}`;
      }
    } catch (err: any) {
      success = false;
      firstError = err?.message?.slice(0, 200) || 'unknown';
    }

    // Stable per-row/per-user dedupe makes concurrent replicas and a crash
    // between enqueue and sentAt safe. Queue failures leave sentAt NULL so the
    // next tick retries only the missing outbox rows.
    try {
      const retryQueue = queueErrors > 0;
      await (prisma as any).scheduledPush.update({
        where: { id: row.id },
        data: {
          sentAt: retryQueue ? null : new Date(),
          sentCount: count,
          sentSuccess: retryQueue ? false : success,
          sentError: firstError,
        },
      });
      if (!retryQueue) {
        await (prisma as any).pushLog.upsert({
          where: { id: `scheduled_${row.id}` },
          create: {
            id: `scheduled_${row.id}`,
            target: row.target,
            identifier: row.identifier,
            city: row.city,
            cohort: row.cohort,
            title: row.title,
            body: row.body,
            deeplink: row.deeplink,
            count,
            success,
            error: firstError,
            sentBy: row.createdBy,
          },
          update: { count, success, error: firstError },
        });
      }
    } catch (err) {
      console.warn('[scheduledPush] post-send write failed', row.id, err);
    }
  }
}

async function resolveCohort(cohort: string): Promise<string[]> {
  const now = Date.now();
  if (cohort === 'inactive_30d') {
    const since30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const since7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const recentByUser = await prisma.order.groupBy({
      by: ['userId'],
      where: { userId: { not: null }, createdAt: { gte: since30 } },
      _count: { _all: true },
    });
    const recentSet = new Set(recentByUser.map((r) => r.userId!));
    const users = await (prisma as any).user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        createdAt: { lte: since7 },
        OR: [
          { deviceInstallations: { some: { active: true, provider: { not: 'WEB_PUSH' } } } },
          { pushToken: { not: null } },
          { apnsDeviceToken: { not: null } },
        ],
      },
      select: { id: true },
    });
    return (users as any[]).map((u) => u.id).filter((id) => !recentSet.has(id));
  }
  if (cohort === 'new_users_7d') {
    const since7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const users = await (prisma as any).user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        createdAt: { gte: since7 },
        OR: [
          { deviceInstallations: { some: { active: true, provider: { not: 'WEB_PUSH' } } } },
          { pushToken: { not: null } },
          { apnsDeviceToken: { not: null } },
        ],
      },
      select: { id: true, _count: { select: { orders: true } } },
    });
    return (users as any[]).filter((u) => (u._count?.orders ?? 0) === 0).map((u) => u.id);
  }
  if (cohort === 'active_repeaters') {
    const since30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const recentByUser = await prisma.order.groupBy({
      by: ['userId'],
      where: { userId: { not: null }, createdAt: { gte: since30 } },
      _count: { _all: true },
    });
    return recentByUser.filter((r) => r._count._all >= 3).map((r) => r.userId!);
  }
  return [];
}
