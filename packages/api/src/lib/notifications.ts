import http2 from 'http2';
import jwt from 'jsonwebtoken';
import prisma from './prisma';

const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID ?? 'com.foodgoJalle.app';
const APNS_HOST = 'https://api.push.apple.com';

let cachedJwt: string | null = null;
let cachedJwtAt = 0;

function getApnsJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwtAt < 1800) return cachedJwt;

  const privateKey = (process.env.APNS_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
  cachedJwt = jwt.sign({ iss: process.env.APNS_TEAM_ID }, privateKey, {
    algorithm: 'ES256',
    keyid: process.env.APNS_KEY_ID,
    expiresIn: '1h',
  });
  cachedJwtAt = now;
  return cachedJwt;
}

export interface SendResult {
  sent: number;
  errors: number;
}

// Sends to multiple APNs device tokens over a single HTTP/2 session.
export function sendPushNotification(tokens: string[], title: string, body: string, data?: any): Promise<SendResult> {
  if (tokens.length === 0) return Promise.resolve({ sent: 0, errors: 0 });

  return new Promise((resolve) => {
    const client = http2.connect(APNS_HOST);
    let pending = tokens.length;
    let sent = 0;
    let errors = 0;

    const finish = () => {
      client.close();
      resolve({ sent, errors });
    };

    client.on('error', (err) => {
      console.error('❌ APNs session error:', err.message);
      resolve({ sent, errors: pending });
    });

    const payload = JSON.stringify({
      aps: {
        alert: { title, body },
        sound: 'default',
      },
      ...(data ?? {}),
    });
    const payloadBytes = Buffer.byteLength(payload);
    const jwtToken = getApnsJwt();

    for (const token of tokens) {
      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        'authorization': `bearer ${jwtToken}`,
        'apns-topic': APNS_BUNDLE_ID,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
        'content-length': payloadBytes,
      });

      req.write(payload);
      req.end();

      let status = 0;
      let body = '';

      req.on(':response', (headers) => { status = headers[':status'] as number; });
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        if (status === 200) {
          sent++;
        } else {
          errors++;
          try {
            const parsed = JSON.parse(body) as { reason?: string };
            console.error(`❌ APNs ${token.slice(0, 8)}…: ${parsed.reason ?? status}`);
          } catch {
            console.error(`❌ APNs HTTP ${status} for ${token.slice(0, 8)}…`);
          }
        }
        pending--;
        if (pending === 0) finish();
      });
      req.on('error', (err) => {
        errors++;
        console.error('❌ APNs req error:', err.message);
        pending--;
        if (pending === 0) finish();
      });
    }
  });
}

export async function sendToUser(identifier: string, title: string, body: string, data?: any) {
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ id: identifier }, { email: identifier }, { phone: identifier }],
      deletedAt: null,
    },
    select: { apnsDeviceToken: true, id: true },
  });

  if (!user?.apnsDeviceToken) {
    return { success: false, count: 0, errors: 0, error: 'Användaren har ingen APNs-token registrerad' };
  }

  const result = await sendPushNotification([user.apnsDeviceToken], title, body, data);
  return { success: result.errors === 0, count: result.sent, errors: result.errors };
}

export async function sendToCity(city: string, title: string, body: string, data?: any) {
  const users = await prisma.user.findMany({
    where: {
      city: { contains: city, mode: 'insensitive' },
      apnsDeviceToken: { not: null },
      isActive: true,
      deletedAt: null,
    },
    select: { apnsDeviceToken: true },
  });

  const tokens = users.map((u) => u.apnsDeviceToken as string).filter(Boolean);

  if (tokens.length === 0) return { success: true, count: 0, errors: 0 };

  const chunks: string[][] = [];
  for (let i = 0; i < tokens.length; i += 500) chunks.push(tokens.slice(i, i + 500));

  const results = await Promise.all(chunks.map((c) => sendPushNotification(c, title, body, data)));
  const sent = results.reduce((s, r) => s + r.sent, 0);
  const errors = results.reduce((s, r) => s + r.errors, 0);
  return { success: errors === 0, count: sent, errors, chunks: chunks.length };
}

export async function sendToAllUsers(title: string, body: string, data?: any) {
  const users = await prisma.user.findMany({
    where: { apnsDeviceToken: { not: null }, isActive: true, deletedAt: null },
    select: { apnsDeviceToken: true },
  });

  const tokens = users.map((u) => u.apnsDeviceToken as string).filter(Boolean);

  if (tokens.length === 0) return { success: true, count: 0, errors: 0 };

  const chunks: string[][] = [];
  for (let i = 0; i < tokens.length; i += 500) chunks.push(tokens.slice(i, i + 500));

  const results = await Promise.all(chunks.map((c) => sendPushNotification(c, title, body, data)));
  const sent = results.reduce((s, r) => s + r.sent, 0);
  const errors = results.reduce((s, r) => s + r.errors, 0);
  return { success: errors === 0, count: sent, errors, chunks: chunks.length };
}
