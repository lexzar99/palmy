import prisma from './prisma';
import { sendFcmTokens } from './courierFcm';

export type PartnerNewOrderPush = {
  restaurantId: string;
  orderId: string;
  orderNumber: string | number;
};

/**
 * Reservkanal för restaurangterminaler. Socket.IO är primär realtid; FCM gör
 * att en fysisk terminal ändå väcks/notifieras när Android har pausat socketen
 * eller appen ligger i bakgrunden. Fire-and-forget från orderflödet: ett
 * pushfel får aldrig påverka betalning eller orderns DB-commit.
 */
export async function notifyPartnerDevicesOfNewOrder(
  input: PartnerNewOrderPush,
): Promise<number> {
  try {
    const devices = await prisma.restaurantDevice.findMany({
      where: {
        restaurantId: input.restaurantId,
        revoked: false,
        pushToken: { not: null },
      },
      select: { pushToken: true },
    });
    const tokens = devices
      .map((device) => device.pushToken)
      .filter((token): token is string => Boolean(token));
    if (tokens.length === 0) return 0;

    const { sent, deadTokens } = await sendFcmTokens(tokens, {
      title: `Ny beställning #${input.orderNumber}`,
      body: 'Öppna ViaEats Partner och godkänn beställningen.',
      data: {
        type: 'NEW_ORDER',
        orderId: input.orderId,
        restaurantId: input.restaurantId,
      },
      sound: 'default',
      androidChannel: 'viaeats_partner_orders',
    });

    if (deadTokens.length > 0) {
      await prisma.restaurantDevice.updateMany({
        where: {
          restaurantId: input.restaurantId,
          pushToken: { in: deadTokens },
        },
        data: { pushToken: null },
      }).catch(() => null);
    }
    console.log(
      `[partnerFcm] order=${input.orderId} restaurant=${input.restaurantId} sent=${sent}/${tokens.length}`,
    );
    return sent;
  } catch (error) {
    console.warn('[partnerFcm] push failed:', (error as Error)?.message);
    return 0;
  }
}
