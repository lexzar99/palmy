import { registerOrderWebPush } from './deviceInstallations';

export interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Persist customer web-push encrypted per browser and active order. */
export async function addOrderSubscription(orderId: string, subscription: BrowserSubscription) {
  return registerOrderWebPush({ orderId, subscription });
}
