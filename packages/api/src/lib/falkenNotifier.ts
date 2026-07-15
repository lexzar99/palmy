// Server-side order notifier for the private Hermes/WhatsApp channel.
// Courier availability alerts live in courierPush.ts, so the same order can
// never produce two competing courier messages. Restarts seed silently.
import prisma from './prisma';
import { isHermesAlertConfigured, sendHermesAlert } from './hermesAlerts';

const TERMINAL = new Set(['DELIVERED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'DELIVERY_FAILED']);
const ACCEPTED = new Set(['ACCEPTED', 'PREPARING']);

type Seen = { status: string; createdAt: Date; flags: Set<string> };
const seen = new Map<string, Seen>();
let seeded = false;

const cfg = () => ({
  pollSeconds: Math.max(10, parseInt(process.env.FALKEN_POLL_SECONDS || '15', 10) || 15),
});
const ageMin = (date: Date) => Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));

async function tick() {
  const [orders, onlineCouriers] = await Promise.all([
    prisma.order.findMany({
      where: { NOT: { status: 'AWAITING_PAYMENT' } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        type: true,
        total: true,
        estimatedTime: true,
        createdAt: true,
        preparingAt: true,
        delivery: { select: { courierId: true } },
        restaurant: { select: { name: true, city: true, selfDelivery: true } },
      },
    }),
    prisma.courier.findMany({
      where: { online: true, isActive: true },
      select: { city: true },
    }),
  ]);
  const onlineCourierCities = new Set(onlineCouriers.map((courier) => courier.city.trim().toLowerCase()));

  if (!seeded) {
    for (const order of orders) {
      const flags = new Set<string>();
      if (ACCEPTED.has(order.status)) flags.add('accepted');
      seen.set(order.id, { status: order.status, createdAt: order.createdAt, flags });
    }
    seeded = true;
    console.log(`[falken] notifier seedad med ${orders.length} ordrar`);
    return;
  }

  const alerts: Array<Record<string, unknown> & { type: string; text: string }> = [];
  const emit = (text: string, type: string, order: (typeof orders)[number]) => {
    alerts.push({
      source: 'viaeats-falken',
      type,
      text,
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalKr: order.total / 100,
      restaurant: order.restaurant?.name ?? null,
      at: new Date().toISOString(),
    });
  };

  for (const order of orders) {
    const number = order.orderNumber || order.id;
    const restaurant = order.restaurant?.name || 'okänd restaurang';
    const totalKr = Math.round(order.total / 100);
    let previous = seen.get(order.id);

    if (!previous) {
      const flags = new Set<string>();
      previous = { status: order.status, createdAt: order.createdAt, flags };
      seen.set(order.id, previous);
      if (!TERMINAL.has(order.status)) {
        emit(`Ny order ${number} från ${restaurant}, ${totalKr} kr. Väntar på restaurangen.`, 'order:new', order);
      }
      if (ACCEPTED.has(order.status)) {
        flags.add('accepted');
        emit(`Order ${number} accepterad av ${restaurant}. Klar om ${order.estimatedTime || 20} min.`, 'order:accepted', order);
      }
    } else if (previous.status !== order.status) {
      previous.status = order.status;
      if (ACCEPTED.has(order.status) && !previous.flags.has('accepted')) {
        previous.flags.add('accepted');
        emit(`Order ${number} accepterad av ${restaurant}. Klar om ${order.estimatedTime || 20} min.`, 'order:accepted', order);
      } else if (order.status === 'DELIVERING') {
        emit(`Order ${number} är på väg från ${restaurant}.`, 'order:delivering', order);
      } else if (order.status === 'DELIVERED' || order.status === 'COMPLETED') {
        emit(
          order.type === 'PICKUP'
            ? `Order ${number} är hämtad hos ${restaurant}.`
            : `Order ${number} är levererad från ${restaurant}.`,
          'order:delivered',
          order,
        );
      } else if (order.status === 'REJECTED') {
        emit(`Order ${number} avvisades av ${restaurant}.`, 'order:rejected', order);
      } else if (order.status === 'CANCELLED') {
        emit(`Order ${number} hos ${restaurant} avbröts.`, 'order:cancelled', order);
      } else if (order.status === 'DELIVERY_FAILED') {
        emit(`Leveransen av order ${number} från ${restaurant} misslyckades.`, 'order:delivery_failed', order);
      }
    }

    // Durable recovery for courier alerts. Event-driven timers give the fast
    // path, while this DB scan survives API restarts and multi-replica races.
    const isUnassignedPlatformDelivery =
      order.type === 'DELIVERY' &&
      !order.restaurant?.selfDelivery &&
      !order.delivery?.courierId &&
      (ACCEPTED.has(order.status) || order.status === 'READY');
    if (isUnassignedPlatformDelivery) {
      const city = String(order.restaurant?.city || '').trim();
      const hasOnlineCourier = city ? onlineCourierCities.has(city.toLowerCase()) : false;
      if (!hasOnlineCourier && !previous.flags.has('no-couriers-online')) {
        previous.flags.add('no-couriers-online');
        emit(
          `INGA BUD\nOrder ${number} accepterad av ${restaurant}. Klar om ${order.estimatedTime || 20} min.`,
          'courier:none_online',
          order,
        );
      } else {
        const acceptedAt = order.preparingAt || order.createdAt;
        if (hasOnlineCourier && ageMin(acceptedAt) >= 3 && !previous.flags.has('no-courier-accepted-3m')) {
          previous.flags.add('no-courier-accepted-3m');
          emit(
            `Inget bud har accepterat den pågående beställningen ${number} från ${restaurant} efter 3 minuter.`,
            'courier:not_accepted_3m',
            order,
          );
        }
      }
    }
  }

  const currentIds = new Set(orders.map((order) => order.id));
  for (const [id, entry] of seen) {
    if (!currentIds.has(id) && (TERMINAL.has(entry.status) || ageMin(entry.createdAt) > 24 * 60)) seen.delete(id);
  }

  // En alert per affärshändelse ger tydliga WhatsApp-meddelanden. Den
  // gemensamma Hermes-claimen deduplicerar orderId+typ över alla API-repliker.
  for (const alert of alerts) {
    await sendHermesAlert(alert as any);
  }
}

export function startFalkenNotifier() {
  const { pollSeconds } = cfg();
  if (!isHermesAlertConfigured()) {
    console.log('[falken] notifier inaktiv (Hermes/WhatsApp saknas)');
    return;
  }
  console.log(`[falken] notifier aktiv (poll ${pollSeconds}s)`);
  setInterval(() => void tick().catch((error) => console.warn('[falken] tick failed:', (error as Error).message)), pollSeconds * 1000);
  void tick().catch((error) => console.warn('[falken] seed failed:', (error as Error).message));
}
