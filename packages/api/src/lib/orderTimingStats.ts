import prisma from './prisma';

// Ordertiming-statistik. Skrivs vid statusövergångarna som servern redan ser —
// terminalerna samlar ingenting och inget extra nätverk används. En upsert vid
// PÅ VÄG (fångar pressen just då) och en vid LEVERERAD (räknar utfallen).
// Fel här får ALDRIG stoppa själva statusuppdateringen — allt är best-effort.

const STOCKHOLM = 'Europe/Stockholm';

function stockholmDayHour(date: Date): { dayOfWeek: number; hourOfDay: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: STOCKHOLM,
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(date);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return { dayOfWeek: Math.max(0, days.indexOf(weekday)), hourOfDay: hour };
}

function minutesBetween(from?: Date | null, to?: Date | null): number | null {
  if (!from || !to) return null;
  const ms = to.getTime() - from.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round((ms / 60_000) * 10) / 10;
}

type TimingOrder = {
  id: string;
  restaurantId: string;
  type: string;
  createdAt: Date;
  preparingAt?: Date | null;
  deliveringAt?: Date | null;
  estimatedTime?: number | null;
  etaCustomerMin?: number | null;
  orderNumber?: string | null;
  paymentMethod?: string | null;
  restaurant?: { selfDelivery?: boolean | null } | null;
};

function looksLikeTestOrder(order: TimingOrder): boolean {
  return (
    String(order.orderNumber || '').toUpperCase().startsWith('TEST-') ||
    String(order.paymentMethod || '').toUpperCase() === 'TEST'
  );
}

/** Vid PÅ VÄG: skapa raden och frys pressen (antal aktiva ordrar just nu). */
export async function recordOrderOnWay(order: TimingOrder): Promise<void> {
  try {
    const model = (prisma as any).orderTimingStat;
    if (!model?.upsert) return;
    const deliveringAt = order.deliveringAt ?? new Date();
    const activeOrdersAtOnWay = await prisma.order.count({
      where: {
        restaurantId: order.restaurantId,
        status: { in: ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'DELIVERING'] },
      },
    });
    const { dayOfWeek, hourOfDay } = stockholmDayHour(deliveringAt);
    const base = {
      restaurantId: order.restaurantId,
      orderType: order.type,
      selfDelivery: Boolean(order.restaurant?.selfDelivery),
      isTestOrder: looksLikeTestOrder(order),
      orderedAt: order.createdAt,
      acceptedAt: order.preparingAt ?? null,
      deliveringAt,
      promisedMinutes: order.estimatedTime ?? null,
      courierEtaMinutes: order.etaCustomerMin ?? null,
      acceptToOnWayMin: minutesBetween(order.preparingAt, deliveringAt),
      activeOrdersAtOnWay,
      dayOfWeek,
      hourOfDay,
    };
    await model.upsert({
      where: { orderId: order.id },
      create: { orderId: order.id, ...base },
      update: base,
    });
  } catch (error: any) {
    console.warn('[timing-stats] on-way capture failed:', error?.message);
  }
}

/** Vid LEVERERAD/HÄMTAD: komplettera raden med utfallen. */
export async function recordOrderDelivered(order: TimingOrder, deliveredAt = new Date()): Promise<void> {
  try {
    const model = (prisma as any).orderTimingStat;
    if (!model?.upsert) return;
    // Vissa flöden nollar Order.deliveringAt vid DELIVERED — på väg-stämpeln
    // som frystes i on-way-upserten är då sanningen.
    const existingStat = await model.findUnique({ where: { orderId: order.id } }).catch(() => null);
    const effectiveDeliveringAt: Date | null = order.deliveringAt ?? existingStat?.deliveringAt ?? null;
    order = { ...order, deliveringAt: effectiveDeliveringAt };
    const { dayOfWeek, hourOfDay } = stockholmDayHour(order.deliveringAt ?? deliveredAt);
    const base = {
      restaurantId: order.restaurantId,
      orderType: order.type,
      selfDelivery: Boolean(order.restaurant?.selfDelivery),
      isTestOrder: looksLikeTestOrder(order),
      orderedAt: order.createdAt,
      acceptedAt: order.preparingAt ?? null,
      deliveringAt: order.deliveringAt ?? null,
      deliveredAt,
      promisedMinutes: order.estimatedTime ?? null,
      courierEtaMinutes: order.etaCustomerMin ?? null,
      acceptToOnWayMin: minutesBetween(order.preparingAt, order.deliveringAt),
      onWayToDeliveredMin: minutesBetween(order.deliveringAt, deliveredAt),
      orderToDeliveredMin: minutesBetween(order.createdAt, deliveredAt),
      dayOfWeek,
      hourOfDay,
    };
    await model.upsert({
      where: { orderId: order.id },
      create: { orderId: order.id, ...base },
      update: base,
    });
  } catch (error: any) {
    console.warn('[timing-stats] delivered capture failed:', error?.message);
  }
}
