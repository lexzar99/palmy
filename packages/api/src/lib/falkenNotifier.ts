// Falken-notifiern: server-side ordervakt som kör i API-processen (Railway),
// dygnet runt, oberoende av Jalles dator. Skickar korta Telegram-rader vid
// orderhändelser och kan spegla samma events till en webhook (t.ex. Hermes)
// med HMAC-signatur.
//
// Aktiveras ENDAST om env-vars finns (sätts i Railway UI, aldrig i repo):
//   FALKEN_TELEGRAM_BOT_TOKEN  - Telegram-bot-token
//   FALKEN_TELEGRAM_CHAT_ID    - chat som ska notifieras
//   FALKEN_WEBHOOK_URL         - (valfri) POST-mål för order-events
//   FALKEN_WEBHOOK_SECRET      - (valfri) HMAC-SHA256-nyckel, header x-falken-signature
//   FALKEN_POLL_SECONDS        - (valfri) pollintervall, default 120
//
// State är in-memory: efter deploy/omstart seedas tyst (inga notiser för
// gammalt), övergångar som sker under själva omstarten kan missas — medvetet
// enkelt istället för en state-tabell.
import axios from 'axios';
import crypto from 'crypto';
import prisma from './prisma';

const STUCK_PENDING_MIN = 10;
const STUCK_READY_MIN = 20;
const TERMINAL = new Set(['DELIVERED', 'REJECTED', 'CANCELLED']);

type Seen = { status: string; createdAt: Date; flags: Set<string> };
const seen = new Map<string, Seen>();
let seeded = false;

const cfg = () => ({
  botToken: process.env.FALKEN_TELEGRAM_BOT_TOKEN || '',
  chatId: process.env.FALKEN_TELEGRAM_CHAT_ID || '',
  webhookUrl: process.env.FALKEN_WEBHOOK_URL || '',
  webhookSecret: process.env.FALKEN_WEBHOOK_SECRET || '',
  pollSeconds: Math.max(30, parseInt(process.env.FALKEN_POLL_SECONDS || '120', 10) || 120),
});

const ageMin = (d: Date) => Math.floor((Date.now() - d.getTime()) / 60_000);

const carMode = () => ['car', 'brief'].includes((process.env.FALKEN_TELEGRAM_MODE || '').toLowerCase());

function line(kind: 'decision' | 'fix' | 'info', text: string) {
  const prefix = kind === 'decision' ? 'Beslut' : kind === 'fix' ? 'Fixat' : 'Info';
  return carMode() ? `${prefix}: ${text}` : `${prefix}: ${text}`;
}

async function sendTelegram(text: string) {
  const { botToken, chatId } = cfg();
  if (!botToken || !chatId) return;
  try {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text,
    }, { timeout: 10_000 });
  } catch (err: any) {
    console.warn('[falken] telegram send failed:', err?.response?.status ?? err?.message);
  }
}

async function sendWebhook(events: Array<Record<string, unknown>>) {
  const { webhookUrl, webhookSecret } = cfg();
  if (!webhookUrl || events.length === 0) return;
  try {
    const body = JSON.stringify({ source: 'delivera-falken', events });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (webhookSecret) {
      headers['x-falken-signature'] = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
    }
    await axios.post(webhookUrl, body, { headers, timeout: 10_000 });
  } catch (err: any) {
    console.warn('[falken] webhook send failed:', err?.response?.status ?? err?.message);
  }
}

async function tick() {
  const orders = await prisma.order.findMany({
    where: { NOT: { status: 'AWAITING_PAYMENT' } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true, orderNumber: true, status: true, total: true,
      createdAt: true, updatedAt: true,
      restaurant: { select: { name: true } },
    },
  });

  if (!seeded) {
    for (const o of orders) {
      // Redan gamla "fastnade" ordrar flaggas vid seed så en deploy inte
      // re-larmar samma sak om och om igen.
      const flags = new Set<string>();
      if (o.status === 'PENDING' && ageMin(o.createdAt) >= STUCK_PENDING_MIN) flags.add('stuck_pending');
      if (o.status === 'READY' && ageMin(o.updatedAt) >= STUCK_READY_MIN) flags.add('stuck_ready');
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
  }

  // Rensa avslutade/gamla ordrar som lämnat 50-fönstret.
  const currentIds = new Set(orders.map((o) => o.id));
  for (const [id, e] of seen) {
    if (!currentIds.has(id) && (TERMINAL.has(e.status) || ageMin(e.createdAt) > 24 * 60)) seen.delete(id);
  }

  if (lines.length > 0) {
    await sendTelegram(lines.join('\n'));
    await sendWebhook(events);
  }
}

export function startFalkenNotifier() {
  const { botToken, chatId, webhookUrl, pollSeconds } = cfg();
  if (!(botToken && chatId) && !webhookUrl) {
    console.log('[falken] notifier inaktiv (FALKEN_TELEGRAM_* / FALKEN_WEBHOOK_URL saknas)');
    return;
  }
  console.log(`[falken] notifier aktiv (poll ${pollSeconds}s, telegram=${Boolean(botToken && chatId)}, webhook=${Boolean(webhookUrl)})`);
  setInterval(() => {
    tick().catch((err) => console.warn('[falken] tick failed:', (err as Error).message));
  }, pollSeconds * 1000);
  void tick().catch((err) => console.warn('[falken] seed failed:', (err as Error).message));
}
