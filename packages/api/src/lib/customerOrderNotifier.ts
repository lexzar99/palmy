import prisma from './prisma';
import { pushLiveActivityForOrder } from './liveActivityDispatch';
import { customerOrderNotificationAuditId, reviewPushId } from './notificationIds';
import {
  enqueueCustomerNotification,
  ORDER_STATUS_NOTIFICATION_MAX_ATTEMPTS,
} from './notificationOutbox';

export { reviewPushId } from './notificationIds';

type StatusCopy = { title: string; body: string };

export function customerOrderStatusCopy(
  statusValue: string,
  orderType: string,
  estimatedTime?: number | null,
  etaCustomerMin?: number | null,
): StatusCopy | null {
  const status = String(statusValue || '').toUpperCase();
  const pickup = String(orderType || '').toUpperCase() === 'PICKUP';
  if (status === 'ACCEPTED') {
    return {
      title: 'Ordern är mottagen',
      body: estimatedTime
        ? `Restaurangen har accepterat din order. Beräknad tid cirka ${estimatedTime} minuter.`
        : 'Restaurangen har accepterat din order.',
    };
  }
  if (status === 'PREPARING') {
    return {
      title: 'Din mat tillagas',
      body: estimatedTime
        ? `Köket är igång. Beräknad tid cirka ${estimatedTime} minuter.`
        : 'Köket är igång med din beställning.',
    };
  }
  if (status === 'READY') {
    return pickup
      ? { title: 'Maten är redo', body: 'Din beställning är klar att hämtas.' }
      : { title: 'Redo för utkörning', body: 'Maten är klar och väntar på budet.' };
  }
  if (status === 'DELIVERING') {
    return {
      title: 'Din mat är på väg',
      body: etaCustomerMin
        ? `Budet är på väg och beräknas vara framme om cirka ${etaCustomerMin} minuter.`
        : 'Budet har hämtat maten och är på väg.',
    };
  }
  if (status === 'DELIVERED' || status === 'COMPLETED') {
    return pickup
      ? { title: 'Ordern är hämtad', body: 'Hoppas det smakade!' }
      : { title: 'Ordern är levererad', body: 'Hoppas det smakade!' };
  }
  if (status === 'REJECTED' || status === 'CANCELLED' || status === 'DELIVERY_FAILED') {
    return {
      title: status === 'DELIVERY_FAILED' ? 'Leveransen behöver hjälp' : 'Ordern avbröts',
      body: 'Öppna ordern för aktuell status och betalningsinformation.',
    };
  }
  return null;
}

async function cancelReviewPrompt(orderId: string) {
  await (prisma as any).scheduledPush.updateMany({
    where: { id: reviewPushId(orderId), sentAt: null, cancelledAt: null },
    data: { cancelledAt: new Date() },
  }).catch((error: any) => {
    console.warn('[customerOrderNotifier] review cancellation failed:', error?.message || error);
  });
}

async function scheduleReviewPrompt(orderId: string, userId: string, pickup: boolean) {
  await (prisma as any).scheduledPush.create({
    data: {
      id: reviewPushId(orderId),
      scheduledFor: new Date(Date.now() + 20 * 60_000),
      target: 'user',
      identifier: userId,
      title: 'Vad tyckte du om maten?',
      body: pickup
        ? 'Berätta gärna hur maten smakade.'
        : 'Berätta gärna hur maten och leveransen fungerade.',
      deeplink: `/order/${orderId}`,
      createdBy: null,
    },
  }).catch((error: any) => {
    if (error?.code !== 'P2002') console.warn('[customerOrderNotifier] review schedule failed:', error?.message || error);
  });
}

/** One customer-notification policy for admin, courier and timed transitions. */
export async function dispatchCustomerOrderStatus(orderId: string, statusValue?: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        type: true,
        userId: true,
        estimatedTime: true,
        etaCustomerMin: true,
        liveActivityToken: true,
      },
    });
    if (!order) return;
    const status = String(statusValue || order.status).toUpperCase();

    if (status === 'REJECTED' || status === 'CANCELLED' || status === 'DELIVERY_FAILED') {
      await cancelReviewPrompt(order.id);
    }

    // Live Activity är en egen idempotent yta. Vanliga pushnotiser går via
    // den persistenta outboxen nedan och kan retryas efter process-/providerfel.
    void pushLiveActivityForOrder(order.id, { serverStatus: status }).catch((error) =>
      console.warn('[customerOrderNotifier] Live Activity failed:', error?.message || error),
    );

    const copy = customerOrderStatusCopy(status, order.type, order.estimatedTime, order.etaCustomerMin);
    if (!copy) return;

    // Only the immutable Order.userId grants account-wide delivery. A phone
    // number typed into a guest checkout is not proof of account ownership.
    const user = order.userId
      ? await prisma.user.findFirst({
          where: { id: order.userId, deletedAt: null, isActive: true },
          select: { id: true, pushToken: true, apnsDeviceToken: true },
        })
      : null;

    // Skapa ingen permanent dedupe-rad innan kunden faktiskt har en sändbar
    // installation. Reconciliatorn fyller då på exakt den aktuella statusen
    // efter att browsern/appen registrerats, i stället för att ett tidigt
    // no-device-job blockerar all senare återhämtning.
    const now = new Date();
    const [nativeDevices, orderScopedDevices] = await Promise.all([
      user?.id
        ? prisma.deviceInstallation.count({
            where: {
              userId: user.id,
              active: true,
              tokenCiphertext: { not: null },
              provider: { not: 'WEB_PUSH' },
            },
          })
        : Promise.resolve(0),
      prisma.deviceOrderSubscription.count({
        where: {
          orderId: order.id,
          revokedAt: null,
          expiresAt: { gt: now },
          deviceInstallation: {
            active: true,
            tokenCiphertext: { not: null },
          },
        },
      }),
    ]);
    const hasNotificationTarget = Boolean(
      user?.pushToken ||
      user?.apnsDeviceToken ||
      nativeDevices > 0 ||
      orderScopedDevices > 0,
    );

    if (hasNotificationTarget) {
      await enqueueCustomerNotification({
        dedupeKey: customerOrderNotificationAuditId(order.id, status),
        kind: 'ORDER_STATUS',
        userId: user?.id || null,
        orderId: order.id,
        title: copy.title,
        body: copy.body,
        maxAttempts: ORDER_STATUS_NOTIFICATION_MAX_ATTEMPTS,
        data: {
          orderId: order.id,
          status,
          url: `/order/${order.id}`,
          deeplink: `/order/${order.id}`,
          ...(order.liveActivityToken ? { apnsMode: 'silent' } : {}),
        },
      });
    }

    if ((status === 'DELIVERED' || status === 'COMPLETED') && user?.id) {
      await scheduleReviewPrompt(order.id, user.id, order.type === 'PICKUP');
    }

  } catch (error: any) {
    console.warn('[customerOrderNotifier] dispatch failed:', error?.message || error);
  }
}
