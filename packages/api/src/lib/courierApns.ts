import prisma from './prisma';
import { ApnsError, sendApnsAlert } from './liveActivityPush';

const COURIER_APNS_BUNDLE_ID = (process.env.COURIER_APNS_BUNDLE_ID || process.env.APNS_COURIER_BUNDLE_ID || 'se.viaeats.kurir')
  .trim()
  .replace(/^["']|["']$/g, '');

export async function registerCourierApnsToken(courierId: string, token: string, platform?: string | null): Promise<void> {
  if (!token) return;
  await prisma.courier.update({
    where: { id: courierId },
    data: { apnsDeviceToken: token, apnsPlatform: platform === 'ios-apns' ? 'ios' : platform || 'ios' },
  });
}

export async function clearCourierApnsToken(courierId: string): Promise<void> {
  await prisma.courier
    .update({ where: { id: courierId }, data: { apnsDeviceToken: null, apnsPlatform: null } })
    .catch(() => null);
}

export interface CourierApnsPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string;
  collapseId?: string;
}

export async function sendCourierApns(courierIds: string[], payload: CourierApnsPayload): Promise<number> {
  if (courierIds.length === 0) return 0;
  const couriers = await prisma.courier.findMany({
    where: { id: { in: courierIds }, apnsDeviceToken: { not: null } },
    select: { id: true, apnsDeviceToken: true },
  });
  if (couriers.length === 0) return 0;

  let sent = 0;
  await Promise.all(
    couriers.map(async (courier) => {
      const token = courier.apnsDeviceToken;
      if (!token) return;
      try {
        await sendApnsAlert({
          token,
          topic: COURIER_APNS_BUNDLE_ID,
          title: payload.title,
          body: payload.body,
          data: payload.data,
          sound: payload.sound ? `${payload.sound}.caf` : 'default',
          collapseId: payload.collapseId,
          threadId: 'viaeats-courier',
        });
        sent += 1;
      } catch (e) {
        if (e instanceof ApnsError && e.invalidToken) {
          await prisma.courier.updateMany({ where: { apnsDeviceToken: token }, data: { apnsDeviceToken: null } }).catch(() => null);
        } else {
          console.warn('[courierApns] APNs-send misslyckades:', (e as Error)?.message);
        }
      }
    }),
  );
  return sent;
}

export async function sendTestCourierApns(courierId: string): Promise<{ ok: boolean; stage: string; detail?: string }> {
  const courier = await prisma.courier.findUnique({ where: { id: courierId }, select: { apnsDeviceToken: true } });
  if (!courier?.apnsDeviceToken) return { ok: false, stage: 'token', detail: 'Ingen APNs-token registrerad' };
  try {
    await sendApnsAlert({
      token: courier.apnsDeviceToken,
      topic: COURIER_APNS_BUNDLE_ID,
      title: 'ViaEats Kurir',
      body: 'Testnotis fungerar.',
      data: { type: 'TEST' },
      threadId: 'viaeats-courier',
    });
    return { ok: true, stage: 'sent' };
  } catch (e) {
    return { ok: false, stage: 'apns', detail: (e as Error)?.message || 'APNs misslyckades' };
  }
}
