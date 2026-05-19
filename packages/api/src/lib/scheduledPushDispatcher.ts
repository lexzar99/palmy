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
    const reservedAt = new Date();
    // Optimistic claim — set sentAt to "in progress" so a concurrent tick
    // (multi-process restart) doesn't pick the same row again. We always
    // overwrite with the real outcome below.
    try {
      const claim = await (prisma as any).scheduledPush.updateMany({
        where: { id: row.id, sentAt: null, cancelledAt: null },
        data: { sentAt: reservedAt },
      });
      if (claim.count !== 1) continue; // somebody else got it
    } catch (err) {
      console.warn('[scheduledPush] claim failed', row.id, err);
      continue;
    }

    let count = 0;
    let success = true;
    let firstError: string | null = null;

    try {
      const data: Record<string, unknown> | undefined = row.deeplink ? { deeplink: row.deeplink } : undefined;
      if (row.target === 'all') {
        const r = await sendToAllUsers(row.title, row.body, data);
        count = r.count || 0;
        if (!r.success) success = false;
        if (r.errors > 0) firstError = `${r.errors} ticket errors`;
      } else if (row.target === 'user' && row.identifier) {
        const r = await sendToUser(row.identifier, row.title, row.body, data);
        count = r.count || 0;
        success = r.success;
        firstError = r.error ?? null;
      } else if (row.target === 'city' && row.city) {
        const r = await sendToCity(row.city, row.title, row.body, data);
        count = r.count || 0;
        if (!r.success) success = false;
      } else if (row.target === 'cohort' && row.cohort) {
        const userIds = await resolveCohort(row.cohort);
        for (const userId of userIds) {
          try {
            const r = await sendToUser(userId, row.title, row.body, data);
            count += r.count || 0;
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

    // Record outcome
    try {
      await (prisma as any).scheduledPush.update({
        where: { id: row.id },
        data: { sentAt: new Date(), sentCount: count, sentSuccess: success, sentError: firstError },
      });
      await (prisma as any).pushLog.create({
        data: {
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
      });
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
      where: { deletedAt: null, createdAt: { lte: since7 }, OR: [{ pushToken: { not: null } }, { apnsDeviceToken: { not: null } }] },
      select: { id: true },
    });
    return (users as any[]).map((u) => u.id).filter((id) => !recentSet.has(id));
  }
  if (cohort === 'new_users_7d') {
    const since7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const users = await (prisma as any).user.findMany({
      where: { deletedAt: null, createdAt: { gte: since7 }, OR: [{ pushToken: { not: null } }, { apnsDeviceToken: { not: null } }] },
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
