// Falken-notifiern: server-side ordervakt som kör i API-processen (Railway),
// dygnet runt, oberoende av Jalles dator. Skickar korta händelser till Hermes/
// WhatsApp via webhook.
//
// Aktiveras ENDAST om env-vars finns (sätts i Railway UI, aldrig i repo):
//   HERMES_WHATSAPP_WEBHOOK_URL eller HERMES_ALERT_WEBHOOK_URL
//   HERMES_WHATSAPP_WEBHOOK_SECRET eller HERMES_ALERT_WEBHOOK_SECRET
//   FALKEN_WEBHOOK_URL / FALKEN_WEBHOOK_SECRET fungerar som legacy-alias.
//   FALKEN_POLL_SECONDS        - (valfri) pollintervall, default 120
//
// State är in-memory: efter deploy/omstart seedas tyst (inga notiser för
// gammalt), övergångar som sker under själva omstarten kan missas — medvetet
// enkelt istället för en state-tabell.
import prisma from './prisma';
import { isHermesAlertConfigured, sendHermesEvents } from './hermesAlerts';

const STUCK_PENDING_MIN = 10;
const STUCK_READY_MIN = 20;
const COURIER_NOT_ACCEPTED_MIN = 4;
const TERMINAL = new Set(['DELIVERED', 'REJECTED', 'CANCELLED']);

type Seen = { status: string; createdAt: Date; flags: Set<string> };
const seen = new Map<string, Seen>();
let seeded = false;

const cfg = () => ({
  pollSeconds: Math.max(30, parseInt(process.env.FALKEN_POLL_SECONDS || '120', 10) || 120),
});

const ageMin = (d: Date) => Math.floor((Date.now() - d.getTime()) / 60_000);

const carMode = () => ['car', 'brief'].includes((process.env.FALKEN_TELEGRAM_MODE || '').toLowerCase());

function line(kind: 'decision' | 'fix' | 'info', text: string) {
  const prefix = kind === 'decision' ? 'Beslut' : kind === 'fix' ? 'Fixat' : 'Info';
  return carMode() ? `${prefix}: ${text}` : `${prefix}: ${text}`;
}

async function tick() {
  const orders = await prisma.order.findMany({
    where: { NOT: { status: 'AWAITING_PAYMENT' } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true, orderNumber: true, status: true, type: true, total: true,
      createdAt: true, updatedAt: true,
      restaurant: { select: { name: true, city: true, selfDelivery: true } },
      delivery: { select: { courierId: true } },
    },
  });

  if (!seeded) {
    for (const o of orders) {
      // Redan gamla "fastnade" ordrar flaggas vid seed så en deploy inte
      // re-larmar samma sak om och om igen.
      const flags = new Set<string>();
      if (o.status === 'PENDING' && ageMin(o.createdAt) >= STUCK_PENDING_MIN) flags.add('stuck_pending');
      if (o.status === 'READY' && ageMin(o.updatedAt) >= STUCK_READY_MIN) flags.add('stuck_ready');
      if (
        o.type === 'DELIVERY' &&
        !o.restaurant?.selfDelivery &&
        !o.delivery?.courierId &&
        ['ACCEPTED', 'PREPARING', 'READY'].includes(o.status) &&
        ageMin(o.updatedAt) >= COURIER_NOT_ACCEPTED_MIN
      ) {
        flags.add('courier_not_accepted');
      }
      seen.set(o.id, { status: o.status, createdAt: o.createdAt, flags });
    }
    seeded = true;
    console.log(`[falken] notifier seedad med ${orders.length} ordrar`);
    return;
  }

  const lines: string[] = [];
  const events: Array<Record<string, unknown>> = [];
  const emit = (line: string, type: string, o: (typeof orders)[number]) => {
    lines.push(line);
    events.push({
      type,
      orderId: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      totalKr: o.total / 100,
      restaurant: o.restaurant?.name ?? null,
      at: new Date().toISOString(),
    });
  };

  for (const o of orders) {
    const num = o.orderNumber ?? o.id;
    const rest = o.restaurant?.name ?? 'okänd restaurang';
    const kr = Math.round(o.total / 100);
    const prev = seen.get(o.id);

    if (!prev) {
      seen.set(o.id, { status: o.status, createdAt: o.createdAt, flags: new Set() });
      if (o.status === 'PENDING') emit(line('decision', `Ny order ${num} hos ${rest}, ${kr} kr. Väntar på accept.`), 'order:new', o);
      else if (!TERMINAL.has(o.status)) emit(line('info', `Order ${num} hos ${rest}, ${kr} kr. Status ${o.status}.`), 'order:new', o);
    } else if (prev.status !== o.status) {
      prev.status = o.status;
      if (o.status === 'ACCEPTED') emit(line('fix', `${rest} accepterade ${num}.`), 'order:accepted', o);
      else if (o.status === 'DELIVERING') emit(line('info', `Kuriren är på väg med ${num} från ${rest}.`), 'order:delivering', o);
      else if (o.status === 'DELIVERED') emit(line('fix', `${num} levererad från ${rest}. Total tid ${ageMin(o.createdAt)} min.`), 'order:delivered', o);
      else if (o.status === 'REJECTED') emit(line('decision', `${rest} avvisade ${num}, ${kr} kr. Kolla om kund behöver hjälp.`), 'order:rejected', o);
      else if (o.status === 'CANCELLED') emit(line('decision', `${num} hos ${rest} avbröts, ${kr} kr. Kolla om kund behöver hjälp.`), 'order:cancelled', o);
    }

    const entry = seen.get(o.id)!;
    if (o.status === 'PENDING' && ageMin(o.createdAt) >= STUCK_PENDING_MIN && !entry.flags.has('stuck_pending')) {
      entry.flags.add('stuck_pending');
      emit(line('decision', `Ingen har accepterat ${num} hos ${rest}, ${ageMin(o.createdAt)} min nu.`), 'order:stuck_pending', o);
    }
    if (o.status === 'READY' && ageMin(o.updatedAt) >= STUCK_READY_MIN && !entry.flags.has('stuck_ready')) {
      entry.flags.add('stuck_ready');
      emit(line('decision', `${num} hos ${rest} har stått klar i ${ageMin(o.updatedAt)} min utan att hämtas.`), 'order:stuck_ready', o);
    }
    if (
      o.type === 'DELIVERY' &&
      !o.restaurant?.selfDelivery &&
      !o.delivery?.courierId &&
      ['ACCEPTED', 'PREPARING', 'READY'].includes(o.status) &&
      ageMin(o.updatedAt) >= COURIER_NOT_ACCEPTED_MIN &&
      !entry.flags.has('courier_not_accepted')
    ) {
      entry.flags.add('courier_not_accepted');
      emit(
        line('decision', `Ingen kurir har tagit ${num} hos ${rest} efter ${ageMin(o.updatedAt)} min. Kolla bud direkt.`),
        'courier:not_accepted_4m',
        o,
      );
    }
  }

  // Rensa avslutade/gamla ordrar som lämnat 50-fönstret.
  const currentIds = new Set(orders.map((o) => o.id));
  for (const [id, e] of seen) {
    if (!currentIds.has(id) && (TERMINAL.has(e.status) || ageMin(e.createdAt) > 24 * 60)) seen.delete(id);
  }

  if (lines.length > 0) {
    await sendHermesEvents(events, lines.join('\n'));
  }
}

export function startFalkenNotifier() {
  const { pollSeconds } = cfg();
  if (!isHermesAlertConfigured()) {
    console.log('[falken] notifier inaktiv (Hermes/WhatsApp webhook saknas)');
    return;
  }
  console.log(`[falken] notifier aktiv (poll ${pollSeconds}s, whatsapp=true)`);
  setInterval(() => {
    tick().catch((err) => console.warn('[falken] tick failed:', (err as Error).message));
  }, pollSeconds * 1000);
  void tick().catch((err) => console.warn('[falken] seed failed:', (err as Error).message));
}
