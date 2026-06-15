// ---------------------------------------------------------------------------
//  Native push för Flutter-kurir-appen (Firebase Cloud Messaging, HTTP v1)
//
//  Den gamla courierPush.ts är Web Push (PWA på hemskärm). Native Flutter-appen
//  registrerar istället en FCM-token. FCM levererar till Android direkt och till
//  iOS via APNs — så EN integration når kuriren även när appen är HELT stängd.
//
//  Konfig via env (graciös no-op om den saknas — appen funkar via polling ändå):
//    FCM_SERVICE_ACCOUNT_JSON  — hela service-account-JSON:en (en rad)
//    (alt.) GOOGLE_SERVICE_ACCOUNT / FIREBASE_SERVICE_ACCOUNT
//
//  Custom-ljud: Android-kanalen "new_order" (skapas i appen) + APNs sound-namn
//  "new_order.caf". Filnamnen måste matcha de assets som bundlas i appen.
// ---------------------------------------------------------------------------
import jwt from 'jsonwebtoken';
import prisma from './prisma';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

function loadServiceAccount(): ServiceAccount | null {
  const raw = (
    process.env.FCM_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_SERVICE_ACCOUNT ||
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    ''
  ).trim();
  if (!raw) return null;
  try {
    const json = JSON.parse(raw);
    if (!json.client_email || !json.private_key || !json.project_id) return null;
    // Railway/Vercel manglar ofta \n i multiline-secrets → normalisera.
    json.private_key = String(json.private_key).replace(/\\n/g, '\n');
    return json as ServiceAccount;
  } catch (e) {
    console.warn('[courierFcm] kunde inte parsa service-account-JSON:', (e as Error)?.message);
    return null;
  }
}

const SA = loadServiceAccount();
if (!SA) {
  console.warn('[courierFcm] FCM_SERVICE_ACCOUNT_JSON saknas — native kurir-push är inaktiv (polling används ändå).');
}

export function isFcmConfigured(): boolean {
  return !!SA;
}

// ---- OAuth2-access-token (cachas ~55 min) ---------------------------------
let cachedToken: { token: string; exp: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  if (!SA) return null;
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const assertion = jwt.sign(
    {
      iss: SA.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    SA.private_key,
    { algorithm: 'RS256' },
  );

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!res.ok) {
      console.warn('[courierFcm] OAuth-token misslyckades:', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = { token: data.access_token, exp: now + (data.expires_in || 3600) };
    return data.access_token;
  } catch (e) {
    console.warn('[courierFcm] OAuth-token fel:', (e as Error)?.message);
    return null;
  }
}

// ---- token-registrering ----------------------------------------------------
export async function registerCourierFcmToken(courierId: string, token: string, platform?: string | null): Promise<void> {
  if (!token) return;
  await prisma.courier.update({
    where: { id: courierId },
    data: { fcmToken: token, fcmPlatform: platform === 'ios' ? 'ios' : platform === 'android' ? 'android' : null },
  });
}

export async function clearCourierFcmToken(courierId: string): Promise<void> {
  await prisma.courier.update({ where: { id: courierId }, data: { fcmToken: null } }).catch(() => null);
}

// ---- skicka push -----------------------------------------------------------
export interface CourierPushPayload {
  title: string;
  body: string;
  /** Extra data som appen kan agera på (t.ex. { type: 'NEW_JOB', orderId }). */
  data?: Record<string, string>;
  /** Ljud-basnamn: 'new_order' (default) eller 'ready_bell'. iOS lägger på .caf. */
  sound?: string;
  /** Android-notiskanal: 'new_order' (default) eller 'ready_pickup'. */
  androidChannel?: string;
}

async function sendToToken(accessToken: string, fcmToken: string, payload: CourierPushPayload): Promise<'ok' | 'dead' | 'error'> {
  if (!SA) return 'error';
  const sound = payload.sound || 'new_order';
  const channel = payload.androidChannel || 'new_order';
  const message = {
    message: {
      token: fcmToken,
      notification: { title: payload.title, body: payload.body },
      data: payload.data || {},
      android: {
        priority: 'high',
        notification: {
          channel_id: channel,
          sound,
          default_sound: false,
        },
      },
      apns: {
        // apns-push-type: alert + priority 10 = visa DIREKT. INGEN
        // content-available (det gjorde notisen till en tyst bakgrunds-push
        // som iOS strypte/fördröjde — orsaken till delayen).
        headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
        payload: {
          aps: {
            alert: { title: payload.title, body: payload.body },
            sound: `${sound}.caf`,
          },
        },
      },
    },
  };

  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${SA.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (res.ok) return 'ok';
    // 404 UNREGISTERED / 400 invalid token → token är död, städa bort.
    if (res.status === 404 || res.status === 400) return 'dead';
    console.warn('[courierFcm] FCM-send misslyckades:', res.status, await res.text().catch(() => ''));
    return 'error';
  } catch (e) {
    console.warn('[courierFcm] FCM-send fel:', (e as Error)?.message);
    return 'error';
  }
}

/**
 * Diagnostik-sändning till EN kurir som returnerar EXAKT var/varför det
 * failar (config / OAuth / FCM-svaret). Driver "Skicka testnotis" så felet
 * blir synligt i appen istället för ett tyst sent=0.
 */
export async function sendTestFcm(courierId: string): Promise<{ ok: boolean; stage: string; status?: number; detail?: string }> {
  if (!SA) return { ok: false, stage: 'config', detail: 'FCM_SERVICE_ACCOUNT_JSON saknas/ogiltig på servern' };
  const c = await prisma.courier.findUnique({ where: { id: courierId }, select: { fcmToken: true } });
  if (!c?.fcmToken) return { ok: false, stage: 'token', detail: 'Ingen FCM-token registrerad' };

  const accessToken = await getAccessToken();
  if (!accessToken) return { ok: false, stage: 'oauth', detail: 'Kunde inte hämta OAuth-token (kontrollera service-account private_key)' };

  const message = {
    message: {
      token: c.fcmToken,
      notification: { title: 'Testnotis 🔔', body: 'Push fungerar — du får notiser om nya ordrar.' },
      data: { type: 'TEST' },
      android: { priority: 'high', notification: { channel_id: 'new_order', sound: 'new_order', default_sound: false } },
      apns: {
        headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
        payload: { aps: { alert: { title: 'Testnotis 🔔', body: 'Push fungerar — du får notiser om nya ordrar.' }, sound: 'new_order.caf' } },
      },
    },
  };
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${SA.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (res.ok) return { ok: true, stage: 'sent', status: res.status };
    const body = await res.text().catch(() => '');
    // 404 UNREGISTERED → token död.
    if (res.status === 404 || res.status === 400) {
      await prisma.courier.update({ where: { id: courierId }, data: { fcmToken: null } }).catch(() => null);
    }
    return { ok: false, stage: 'fcm', status: res.status, detail: body.slice(0, 300) };
  } catch (e) {
    return { ok: false, stage: 'fcm', detail: (e as Error)?.message };
  }
}

/** Skicka native push till en uppsättning kurirer. Fire-and-forget. */
export async function sendCourierFcm(courierIds: string[], payload: CourierPushPayload): Promise<number> {
  if (!SA || courierIds.length === 0) return 0;
  const accessToken = await getAccessToken();
  if (!accessToken) return 0;

  const couriers = await prisma.courier.findMany({
    where: { id: { in: courierIds }, fcmToken: { not: null } },
    select: { id: true, fcmToken: true },
  });
  if (couriers.length === 0) return 0;

  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    couriers.map(async (c) => {
      const r = await sendToToken(accessToken, c.fcmToken!, payload);
      if (r === 'ok') sent++;
      else if (r === 'dead') dead.push(c.id);
    }),
  );
  if (dead.length) {
    await prisma.courier.updateMany({ where: { id: { in: dead } }, data: { fcmToken: null } }).catch(() => null);
  }
  return sent;
}
