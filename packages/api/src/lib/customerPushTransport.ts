import webpush from 'web-push';
import { isPushConfigured } from './courierPush';
import { sendFcmInstallations } from './courierFcm';
import { ApnsError, isApnsConfigured, sendApnsAlert, sendApnsSilentWake } from './liveActivityPush';
import {
  type CustomerPushProvider,
  validateBrowserPushSubscription,
} from './deviceInstallations';

export type CustomerPushTransportResult = {
  status: 'ACCEPTED' | 'INVALID' | 'RETRY' | 'FAILED';
  providerMessageId?: string | null;
  errorCode?: string | null;
  errorDetail?: string | null;
};

type SendInput = {
  provider: CustomerPushProvider;
  rawToken: string;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
};

const safeDetail = (value: unknown): string => String(value || 'okänt fel').slice(0, 240);

async function sendExpo(input: SendInput): Promise<CustomerPushTransportResult> {
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: input.rawToken,
        title: input.title,
        body: input.body,
        data: input.data || undefined,
        sound: 'default',
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const payload = await response.json().catch(() => ({})) as any;
    const ticket = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
    if (response.ok && ticket?.status !== 'error') {
      return { status: 'ACCEPTED', providerMessageId: ticket?.id || null };
    }
    if (ticket?.details?.error === 'DeviceNotRegistered') {
      return { status: 'INVALID', errorCode: 'DeviceNotRegistered', errorDetail: safeDetail(ticket?.message) };
    }
    if (response.status === 429 || response.status >= 500) {
      return { status: 'RETRY', errorCode: `expo_${response.status}`, errorDetail: safeDetail(ticket?.message) };
    }
    return { status: 'FAILED', errorCode: `expo_${response.status}`, errorDetail: safeDetail(ticket?.message || payload?.errors) };
  } catch (error) {
    return { status: 'RETRY', errorCode: 'expo_transport', errorDetail: safeDetail((error as Error)?.message) };
  }
}

async function sendFcm(input: SendInput): Promise<CustomerPushTransportResult> {
  const normalizedData = Object.fromEntries(
    Object.entries(input.data || {}).map(([key, value]) => [key, String(value)]),
  );
  try {
    const result = await sendFcmInstallations([input.rawToken], {
      title: input.title,
      body: input.body,
      data: normalizedData,
      sound: 'default',
      androidChannel: 'order_updates',
    });
    if (result.sent === 1) return { status: 'ACCEPTED' };
    if (result.deadInstallationIds.includes(input.rawToken)) {
      return { status: 'INVALID', errorCode: 'fcm_unregistered', errorDetail: 'FCM avvisade installationen' };
    }
    return { status: 'RETRY', errorCode: 'fcm_not_accepted', errorDetail: 'FCM accepterade inte meddelandet' };
  } catch (error) {
    return { status: 'RETRY', errorCode: 'fcm_transport', errorDetail: safeDetail((error as Error)?.message) };
  }
}

async function sendApns(input: SendInput): Promise<CustomerPushTransportResult> {
  if (!isApnsConfigured()) {
    return { status: 'RETRY', errorCode: 'apns_not_configured', errorDetail: 'APNs-konfiguration saknas' };
  }
  try {
    const orderId = typeof input.data?.orderId === 'string' ? input.data.orderId : null;
    if (input.data?.apnsMode === 'silent') {
      await sendApnsSilentWake({
        token: input.rawToken,
        collapseId: orderId ? `order-${orderId}-wake` : undefined,
        data: input.data || undefined,
      });
    } else {
      await sendApnsAlert({
        token: input.rawToken,
        title: input.title,
        body: input.body,
        collapseId: orderId ? `order-${orderId}` : undefined,
        threadId: orderId ? `order-${orderId}` : undefined,
        data: input.data || undefined,
      });
    }
    return { status: 'ACCEPTED' };
  } catch (error) {
    if (error instanceof ApnsError) {
      return {
        status: error.invalidToken ? 'INVALID' : error.status === 429 || error.status >= 500 ? 'RETRY' : 'FAILED',
        errorCode: `apns_${error.reason}`,
        errorDetail: safeDetail(error.message),
      };
    }
    return { status: 'RETRY', errorCode: 'apns_transport', errorDetail: safeDetail((error as Error)?.message) };
  }
}

async function sendWebPush(input: SendInput): Promise<CustomerPushTransportResult> {
  if (!isPushConfigured()) {
    return { status: 'RETRY', errorCode: 'web_push_not_configured', errorDetail: 'VAPID-konfiguration saknas' };
  }
  let subscription: ReturnType<typeof validateBrowserPushSubscription>;
  try {
    // Validate again at the outbound trust boundary. This also quarantines an
    // old/corrupt DB row created before endpoint allow-listing, instead of ever
    // turning durable encrypted data into an SSRF destination.
    subscription = validateBrowserPushSubscription(JSON.parse(input.rawToken));
  } catch {
    return { status: 'INVALID', errorCode: 'web_push_payload', errorDetail: 'Ogiltig browser-subscription' };
  }
  try {
    const orderId = typeof input.data?.orderId === 'string' ? input.data.orderId : null;
    const deeplink = typeof input.data?.url === 'string'
      ? input.data.url
      : typeof input.data?.deeplink === 'string'
        ? input.data.deeplink
      : orderId ? `/order/${orderId}` : '/';
    await webpush.sendNotification(subscription as any, JSON.stringify({
      title: input.title,
      body: input.body,
      tag: orderId ? `viaeats-order-${orderId}` : undefined,
      url: deeplink,
      data: input.data || undefined,
    }), { TTL: 1800, urgency: 'high', timeout: 20_000 });
    return { status: 'ACCEPTED' };
  } catch (error: any) {
    const status = Number(error?.statusCode || 0);
    if (status === 404 || status === 410) {
      return { status: 'INVALID', errorCode: `web_push_${status}`, errorDetail: 'Browser-prenumerationen har upphört' };
    }
    if (status === 429 || status >= 500 || status === 0) {
      return { status: 'RETRY', errorCode: `web_push_${status || 'transport'}`, errorDetail: safeDetail(error?.message) };
    }
    return { status: 'FAILED', errorCode: `web_push_${status}`, errorDetail: safeDetail(error?.message) };
  }
}

export async function sendCustomerPushTransport(input: SendInput): Promise<CustomerPushTransportResult> {
  if (input.provider === 'EXPO') return sendExpo(input);
  if (input.provider === 'FCM_FID') return sendFcm(input);
  if (input.provider === 'APNS') return sendApns(input);
  return sendWebPush(input);
}
