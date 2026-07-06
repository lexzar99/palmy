// ---------------------------------------------------------------------------
//  Web Push för KUND-PWA:n — orderstatus ("Din mat är på väg") även när
//  fliken/appen är stängd.
//
//  Återanvänder samma VAPID-konfiguration som kurir-pushen (courierPush.ts).
//  Prenumerationer lagras IN-MEMORY per order-id (medvetet ingen DB-modell:
//  delade Supabase-databasen ska inte migreras för en kortlivad koppling —
//  en order lever i minuter/timmar och en deploy-omstart betyder bara att
//  kunden inte får push för en redan pågående order; UI:t fungerar ändå via
//  socket/polling). TTL städar bort gamla poster automatiskt.
// ---------------------------------------------------------------------------
import webpush from 'web-push';
import { isPushConfigured } from './courierPush';

interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface Entry {
  subscription: BrowserSubscription;
  expiresAt: number;
}

const TTL_MS = 6 * 60 * 60 * 1000; // 6h — täcker hela orderlivscykeln med marginal
const MAX_PER_ORDER = 5;
const byOrder = new Map<string, Entry[]>();

function prune(): void {
  const now = Date.now();
  for (const [orderId, entries] of byOrder) {
    const alive = entries.filter((e) => e.expiresAt > now);
    if (alive.length === 0) byOrder.delete(orderId);
    else if (alive.length !== entries.length) byOrder.set(orderId, alive);
  }
}

export function addOrderSubscription(orderId: string, sub: BrowserSubscription): void {
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    throw new Error('Ogiltig push-subscription');
  }
  prune();
  const entries = byOrder.get(orderId) ?? [];
  const withoutDupe = entries.filter((e) => e.subscription.endpoint !== sub.endpoint);
  withoutDupe.push({ subscription: sub, expiresAt: Date.now() + TTL_MS });
  byOrder.set(orderId, withoutDupe.slice(-MAX_PER_ORDER));
}

// Kund-vänlig svensk copy per status. Statusar utan rad pushas inte
// (AWAITING_PAYMENT m.fl. är brus för kunden).
const STATUS_COPY: Record<string, { title: string; body: string }> = {
  ACCEPTED: { title: 'Ordern är bekräftad', body: 'Restaurangen har tagit emot din beställning.' },
  PREPARING: { title: 'Din mat tillagas', body: 'Köket är igång med din order.' },
  READY: { title: 'Ordern är redo', body: 'Din beställning är klar för avhämtning.' },
  DELIVERING: { title: 'Din mat är på väg', body: 'Budet har hämtat din order och är på väg till dig.' },
  DELIVERED: { title: 'Levererad — smaklig måltid', body: 'Din order är framme.' },
  COMPLETED: { title: 'Levererad — smaklig måltid', body: 'Din order är framme.' },
  CANCELLED: { title: 'Ordern avbröts', body: 'Din beställning har tyvärr avbrutits. Du har inte debiterats.' },
  REJECTED: { title: 'Ordern kunde inte tas emot', body: 'Restaurangen kunde tyvärr inte ta emot din beställning.' },
};

// Dedupe: skicka aldrig samma status två gånger för samma order (flera
// kodvägar kan emitta samma transition).
const lastSent = new Map<string, string>();

/**
 * Skicka orderstatus-push till kundens prenumererade enheter. Fire-and-forget
 * — får aldrig blocka order-flödet; alla fel sväljs (push är best effort).
 */
export async function sendOrderStatusPush(orderId: string, status: string): Promise<void> {
  try {
    if (!isPushConfigured() || !orderId || !status) return;
    const copy = STATUS_COPY[status];
    if (!copy) return;
    if (lastSent.get(orderId) === status) return;

    const entries = byOrder.get(orderId);
    if (!entries || entries.length === 0) return;
    lastSent.set(orderId, status);

    const payload = JSON.stringify({
      title: copy.title,
      body: copy.body,
      tag: `viaeats-order-${orderId}`,
      url: `/order/${orderId}`,
    });

    const dead: string[] = [];
    await Promise.all(
      entries.map(async (e) => {
        try {
          await webpush.sendNotification(e.subscription as any, payload, { TTL: 1800, urgency: 'high' });
        } catch (err: any) {
          const code = err?.statusCode;
          if (code === 404 || code === 410) dead.push(e.subscription.endpoint);
        }
      }),
    );
    if (dead.length) {
      byOrder.set(orderId, entries.filter((e) => !dead.includes(e.subscription.endpoint)));
    }
  } catch {
    /* best effort */
  }
}
