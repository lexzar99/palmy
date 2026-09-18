import prisma from './prisma';
import { orderAttributionSummary, SOURCE_LABELS, SURFACE_LABELS } from './orderAttribution';
import { metaPurchaseConfiguration } from './metaPurchase';

/** Perioden avser orderns skapandedatum. Betalstatus kontrolleras vid läsning. */
export async function orderAttributionReport(days: number, page: number) {
  const until = new Date();
  const from = new Date(until.getTime() - days * 86400_000);
  const rows = await prisma.$queryRaw<Array<{ surface: string; source: string; campaign: string; content: string; adId: string; medium: string; orders: bigint; grossOre: bigint }>>`
    WITH paid AS (
      SELECT o.id, o.total FROM "Order" o
      WHERE o."createdAt" >= ${from} AND o."createdAt" <= ${until}
        AND o."paymentStatus" IN ('PAID', 'PARTIALLY_REFUNDED')
        AND o.status <> 'CANCELLED' AND o."accountingExcluded" = false
    ), attributed AS (
      SELECT p.id, p.total, a.changes::jsonb AS data FROM paid p
      LEFT JOIN LATERAL (
        SELECT changes FROM "AuditLog" WHERE "resourceId" = p.id AND "resourceType" = 'Order'
          AND action = 'ORDER_CHANNEL_CAPTURED' ORDER BY "createdAt" ASC, id ASC LIMIT 1
      ) a ON true
    )
    SELECT COALESCE(data->'attribution'->>'surface', data->>'channel', 'UNKNOWN') AS surface,
      COALESCE(COALESCE(data->'attribution'->'marketing'->'current', data->'attribution'->'marketing'->'last')->>'source', 'unknown') AS source,
      COALESCE(COALESCE(data->'attribution'->'marketing'->'current', data->'attribution'->'marketing'->'last')->>'campaign', '') AS campaign,
      COALESCE(COALESCE(data->'attribution'->'marketing'->'current', data->'attribution'->'marketing'->'last')->>'content', '') AS content,
      COALESCE(COALESCE(data->'attribution'->'marketing'->'current', data->'attribution'->'marketing'->'last')->>'adId', '') AS "adId",
      COALESCE(COALESCE(data->'attribution'->'marketing'->'current', data->'attribution'->'marketing'->'last')->>'medium', '') AS medium,
      COUNT(*) AS orders, SUM(total)::bigint AS "grossOre"
    FROM attributed GROUP BY 1,2,3,4,5,6 ORDER BY COUNT(*) DESC`;
  const where = { createdAt: { gte: from, lte: until }, paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] }, status: { not: 'CANCELLED' as const }, accountingExcluded: false };
  const orders = await prisma.order.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100, skip: (page - 1) * 100,
    select: { id: true, orderNumber: true, createdAt: true, paymentStatus: true, total: true } });
  const audit = orders.length ? await prisma.auditLog.findMany({ where: { resourceId: { in: orders.map(o => o.id) }, resourceType: 'Order', action: 'ORDER_CHANNEL_CAPTURED' }, orderBy: { createdAt: 'asc' }, select: { resourceId: true, changes: true } }) : [];
  const byId = new Map<string, string | null>();
  for (const row of audit) if (row.resourceId && !byId.has(row.resourceId)) byId.set(row.resourceId, row.changes);
  const groups = rows.map(r => ({ ...r, orders: Number(r.orders), grossKr: Number(r.grossOre) / 100, grossOre: undefined,
    surfaceLabel: SURFACE_LABELS[r.surface] || 'Äldre order / okänd yta', sourceLabel: SOURCE_LABELS[r.source] || 'Okänd källa / inget samtycke' }));
  const delivery = await prisma.auditLog.groupBy({ by: ['action'], where: { action: { startsWith: 'META_PURCHASE_' }, createdAt: { gte: from, lte: until } }, _count: { _all: true } });
  return { days, from: from.toISOString(), until: until.toISOString(), page, pageSize: 100,
    totalOrders: groups.reduce((n, g) => n + g.orders, 0), groups,
    meta: { ...metaPurchaseConfiguration(), delivery: delivery.map(r => ({ status: r.action, count: r._count._all })) },
    orders: orders.map(o => ({ id: o.id, orderNumber: o.orderNumber, createdAt: o.createdAt.toISOString(), paymentStatus: o.paymentStatus,
      grossKr: o.total / 100, attribution: orderAttributionSummary(byId.get(o.id)) })) };
}
