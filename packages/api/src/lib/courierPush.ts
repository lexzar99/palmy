// ---------------------------------------------------------------------------
//  Web Push för kurir-PWA:n
//
//  Notifierar online-kurirer när en ny order blir tillgänglig i deras stad —
//  ÄVEN när appen är helt stängd (till skillnad från in-app-ljudet i notify.ts
//  som kräver att fliken lever). Kräver att kuriren lagt appen på hemskärmen
//  (iOS 16.4+) och godkänt notiser; subscriptionen lagras i
//  CourierPushSubscription och prunas automatiskt vid 404/410 (avregistrerad).
//
//  VAPID-nycklar kommer från env (VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT). Saknas
//  de är push:en helt inaktiv (no-op) — appen funkar ändå via polling.
// ---------------------------------------------------------------------------
import webpush from 'web-push';
import prisma from './prisma';
import { sendCourierFcm } from './courierFcm';
import { sendCourierApns } from './courierApns';

const PUBLIC_KEY = (process.env.VAPID_PUBLIC_KEY || '').trim();
const PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || '').trim();
const SUBJECT = (process.env.VAPID_SUBJECT || 'mailto:support@delivera.se').trim();

let configured = false;
if (PUBLIC_KEY && PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    configured = true;
  } catch (e) {
    console.warn('[courierPush] kunde inte sätta VAPID-detaljer:', (e as Error)?.message);
  }
} else {
  console.warn('[courierPush] VAPID-nycklar saknas — kurir-push är inaktiv (polling används ändå).');
}

export function isPushConfigured(): boolean {
  return configured;
}

export function getVapidPublicKey(): string | null {
  return configured ? PUBLIC_KEY : null;
}

interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Spara/uppdatera en enhets push-subscription för en kurir (idempotent per endpoint). */
export async function saveSubscription(
  courierId: string,
  sub: BrowserSubscription,
  userAgent?: string | null,
): Promise<void> {
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    throw new Error('Ogiltig push-subscription');
  }
  await prisma.courierPushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: {
      courierId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: userAgent ?? null,
    },
    // Endpoint kan återanvändas av en annan kurir på samma delade enhet →
    // flytta över ägarskapet + uppdatera nycklarna.
    update: {
      courierId,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: userAgent ?? null,
    },
  });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  if (!endpoint) return;
  await prisma.courierPushSubscription.deleteMany({ where: { endpoint } });
}

interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

async function sendToCourierIds(courierIds: string[], payload: PushPayload): Promise<number> {
  if (!configured || courierIds.length === 0) return 0;
  const subs = await prisma.courierPushSubscription.findMany({
    where: { courierId: { in: courierIds } },
  });
  if (subs.length === 0) return 0;

  const body = JSON.stringify(payload);
  let sent = 0;
  const dead: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 600, urgency: 'high' },
        );
        sent++;
      } catch (err: any) {
        const code = err?.statusCode;
        // 404/410 = subscriptionen är död (avinstallerad PWA / rensad) → städa bort.
        if (code === 404 || code === 410) dead.push(s.endpoint);
        else console.warn('[courierPush] push misslyckades:', code, err?.message);
      }
    }),
  );

  if (dead.length) {
    await prisma.courierPushSubscription
      .deleteMany({ where: { endpoint: { in: dead } } })
      .catch(() => null);
  }
  return sent;
}

/**
 * Notifiera alla online-kurirer i restaurangens stad om en ny tillgänglig order.
 * No-op om restaurangen kör self-leverans, ordern inte är leverans, eller push
 * inte är konfigurerad. Fire-and-forget från anroparen — får aldrig blocka
 * order-flödet.
 */
// Dedup: en order ska bara ge EN ny-order-notis även om status sätts till både
// ACCEPTED och PREPARING. Minne räcker (notisen är tidskänslig, inte kritisk).
const newJobNotified = new Map<string, number>();
const NEW_JOB_DEDUP_MS = 90_000;

export async function notifyCouriersOfNewJob(opts: {
  orderId?: string | null;
  restaurantId: string | null | undefined;
  orderType: string | null | undefined;
  orderNumber?: string | null;
}): Promise<void> {
  try {
    if (!opts.restaurantId || opts.orderType !== 'DELIVERY') return;

    // Dedup per order (90s) — hindrar dubbel-notis vid ACCEPTED→PREPARING.
    const key = opts.orderId || opts.orderNumber;
    if (key) {
      const now = Date.now();
      const last = newJobNotified.get(key);
      if (last && now - last < NEW_JOB_DEDUP_MS) return;
      newJobNotified.set(key, now);
      // Lätt städning så mappen inte växer obegränsat.
      if (newJobNotified.size > 500) {
        for (const [k, t] of newJobNotified) if (now - t > NEW_JOB_DEDUP_MS) newJobNotified.delete(k);
      }
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: opts.restaurantId },
      select: { city: true, name: true, selfDelivery: true },
    });
    // Self-leverans har ingen kurir-pool att ringa.
    if (!restaurant || restaurant.selfDelivery || !restaurant.city) return;

    const couriers = await prisma.courier.findMany({
      where: { online: true, isActive: true, city: { equals: restaurant.city, mode: 'insensitive' } },
      select: { id: true },
    });
    if (couriers.length === 0) return;
    const courierIds = couriers.map((c) => c.id);
    // Proffsigt, utan emoji + utan ordernummer: titel "Ny leverans – Lund",
    // restaurangnamnet under.
    const title = `Ny leverans – ${restaurant.city}`;
    const body = restaurant.name;

    // Web Push (PWA) + native FCM (Flutter-app) parallellt. Båda är no-op om
    // de inte är konfigurerade — kuriren ser ordern via polling oavsett.
    await Promise.all([
      sendToCourierIds(courierIds, { title, body, tag: 'delivera-new-order', url: '/' }),
      sendCourierFcm(courierIds, {
        title,
        body,
        data: { type: 'NEW_JOB', city: restaurant.city },
      }),
      sendCourierApns(courierIds, {
        title,
        body,
        data: { type: 'NEW_JOB', city: restaurant.city },
        sound: 'new_order',
        collapseId: `new-job-${restaurant.city}`,
      }),
    ]);
  } catch (e) {
    console.warn('[courierPush] notifyCouriersOfNewJob fel:', (e as Error)?.message);
  }
}

/**
 * Restaurangen markerade ordern "Klar för hämtning" (READY). Notifiera:
 *  - det tilldelade budet (om någon redan accepterat) → "Maten är klar för hämtning"
 *  - annars alla online-kurirer i staden → maten väntar, kom och hämta.
 * Endast vi-levererar (self-leverans har inget bud). Fire-and-forget.
 */
export async function notifyCouriersOrderReady(opts: {
  orderId: string;
  restaurantId: string | null | undefined;
  orderType: string | null | undefined;
  orderNumber?: string | null;
}): Promise<void> {
  try {
    if (!opts.restaurantId || opts.orderType !== 'DELIVERY') return;
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: opts.restaurantId },
      select: { city: true, name: true, selfDelivery: true },
    });
    if (!restaurant || restaurant.selfDelivery || !restaurant.city) return;

    // Proffsigt, utan emoji: "Restaurang – redo att hämtas".
    const title = `${restaurant.name} – redo att hämtas`;
    const body = 'Din leverans är klar för upphämtning';
    const READY_SOUND = { sound: 'ready_bell', androidChannel: 'ready_pickup' } as const;

    // Redan tilldelat bud (accepterat, på väg till hämtning)?
    const delivery = await prisma.delivery.findUnique({
      where: { orderId: opts.orderId },
      select: { courierId: true, status: true },
    });

    // ENDAST det tilldelade budet får "klar för hämtning". Tidigare väcktes ALLA
    // online-kurirer i staden när inget bud var tilldelat — det spammade kurirer
    // som inte tagit ordern. Jobb-tillgänglighet hanteras separat av
    // notifyCouriersOfNewJob. Ett bud som accepterar en order som REDAN är READY
    // notifieras istället vid accept (se routes/courier.ts), så signalen aldrig
    // går till någon som inte äger leveransen.
    if (delivery?.courierId) {
      await Promise.all([
        sendToCourierIds([delivery.courierId], { title, body, tag: 'delivera-ready' }),
        sendCourierFcm([delivery.courierId], {
          title,
          body,
          data: { type: 'ORDER_READY', orderId: opts.orderId },
          ...READY_SOUND,
        }),
        sendCourierApns([delivery.courierId], {
          title,
          body,
          data: { type: 'ORDER_READY', orderId: opts.orderId },
          sound: READY_SOUND.sound,
          collapseId: `ready-${opts.orderId}`,
        }),
      ]);
    }
  } catch (e) {
    console.warn('[courierPush] notifyCouriersOrderReady fel:', (e as Error)?.message);
  }
}
