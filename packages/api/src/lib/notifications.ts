import prisma from './prisma';
import { sendApnsAlert, ApnsError } from './liveActivityPush';

export interface SendResult {
  sent: number;
  errors: number;
}

async function sendOne(token: string, title: string, body: string, data?: any): Promise<boolean> {
  try {
    await sendApnsAlert({ token, title, body, data });
    return true;
  } catch (e) {
    if (e instanceof ApnsError && e.invalidToken) {
      // Clear stale token so we don't keep hitting it
      await prisma.user.updateMany({ where: { apnsDeviceToken: token }, data: { apnsDeviceToken: null } }).catch(() => null);
    }
    console.error('❌ APNs send error:', (e as any)?.message ?? e);
    return false;
  }
}

export async function sendPushNotification(tokens: string[], title: string, body: string, data?: any): Promise<SendResult> {
  if (tokens.length === 0) return { sent: 0, errors: 0 };
  const results = await Promise.all(tokens.map((t) => sendOne(t, title, body, data)));
  const sent = results.filter(Boolean).length;
  return { sent, errors: tokens.length - sent };
}

export async function sendToUser(identifier: string, title: string, body: string, data?: any) {
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ id: identifier }, { email: identifier }, { phone: identifier }],
      deletedAt: null,
    },
    select: { apnsDeviceToken: true },
  });

  if (!user?.apnsDeviceToken) {
    return { success: false, count: 0, errors: 0, error: 'Användaren har ingen APNs-token registrerad' };
  }

  const ok = await sendOne(user.apnsDeviceToken, title, body, data);
  return { success: ok, count: ok ? 1 : 0, errors: ok ? 0 : 1 };
}

export async function sendToCity(city: string, title: string, body: string, data?: any) {
  const users = await prisma.user.findMany({
    where: { city: { contains: city, mode: 'insensitive' }, apnsDeviceToken: { not: null }, isActive: true, deletedAt: null },
    select: { apnsDeviceToken: true },
  });

  const tokens = users.map((u) => u.apnsDeviceToken as string).filter(Boolean);
  if (tokens.length === 0) return { success: true, count: 0, errors: 0 };

  const result = await sendPushNotification(tokens, title, body, data);
  return { success: result.errors === 0, count: result.sent, errors: result.errors };
}

export async function sendToAllUsers(title: string, body: string, data?: any) {
  const users = await prisma.user.findMany({
    where: { apnsDeviceToken: { not: null }, isActive: true, deletedAt: null },
    select: { apnsDeviceToken: true },
  });

  const tokens = users.map((u) => u.apnsDeviceToken as string).filter(Boolean);
  if (tokens.length === 0) return { success: true, count: 0, errors: 0 };

  const result = await sendPushNotification(tokens, title, body, data);
  return { success: result.errors === 0, count: result.sent, errors: result.errors };
}
