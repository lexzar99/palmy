import prisma from './prisma';

// Delade kund-segment. Samma definitioner används av push-cohorter och av
// DealCampaign-motorn. Skillnad mot push: här krävs INTE en push-token, en
// deal kan tilldelas alla matchande konton oavsett notis-status.
//
// Vill du lägga till ett segment: lägg en nyckel här. Inga hårdkodade regler
// ligger utanför den här filen.

export const DEAL_SEGMENTS = ['ALL', 'new_users_7d', 'inactive_30d', 'active_repeaters'] as const;
export type DealSegment = (typeof DEAL_SEGMENTS)[number];

export function isDealSegment(value: unknown): value is DealSegment {
  return typeof value === 'string' && (DEAL_SEGMENTS as readonly string[]).includes(value);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Löser upp ett segment till en lista användar-id:n. Global, ingen push-token
 * krävs. ALL = alla aktiva konton.
 */
export async function resolveSegmentUserIds(segment: string): Promise<string[]> {
  const now = Date.now();

  if (segment === 'ALL') {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  if (segment === 'new_users_7d') {
    const since7 = new Date(now - 7 * DAY_MS);
    const users = await prisma.user.findMany({
      where: { deletedAt: null, createdAt: { gte: since7 } },
      select: { id: true, _count: { select: { orders: true } } },
    });
    return users.filter((u) => (u._count?.orders ?? 0) === 0).map((u) => u.id);
  }

  if (segment === 'inactive_30d') {
    const since30 = new Date(now - 30 * DAY_MS);
    const since7 = new Date(now - 7 * DAY_MS);
    // Konton som INTE lagt en order senaste 30 dagarna, men som funnits >7 dagar
    // (annars är de "nya", inte "inaktiva").
    const recentByUser = await prisma.order.groupBy({
      by: ['userId'],
      where: { userId: { not: null }, createdAt: { gte: since30 } },
      _count: { _all: true },
    });
    const recentSet = new Set(recentByUser.map((r) => r.userId!).filter(Boolean));
    const users = await prisma.user.findMany({
      where: { deletedAt: null, createdAt: { lte: since7 } },
      select: { id: true },
    });
    return users.map((u) => u.id).filter((id) => !recentSet.has(id));
  }

  if (segment === 'active_repeaters') {
    const since30 = new Date(now - 30 * DAY_MS);
    const recentByUser = await prisma.order.groupBy({
      by: ['userId'],
      where: { userId: { not: null }, createdAt: { gte: since30 } },
      _count: { _all: true },
    });
    return recentByUser.filter((r) => r._count._all >= 3).map((r) => r.userId!).filter(Boolean);
  }

  return [];
}

/** Snabb uppskattning för admin-preview ("~N kunder matchar"). */
export async function countSegment(segment: string): Promise<number> {
  if (segment === 'ALL') {
    return prisma.user.count({ where: { deletedAt: null } });
  }
  const ids = await resolveSegmentUserIds(segment);
  return ids.length;
}
