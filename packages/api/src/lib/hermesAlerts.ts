import axios from 'axios';
import crypto from 'crypto';
import prisma from './prisma';

type HermesAlert = {
  source?: string;
  type: string;
  text: string;
  severity?: 'info' | 'warning' | 'critical' | string;
  /** Stable business-event key. A claimed key is delivered at most once. */
  dedupeKey?: string;
  [key: string]: unknown;
};

const cfg = () => ({
  webhookUrl:
    process.env.HERMES_WHATSAPP_WEBHOOK_URL ||
    process.env.HERMES_ALERT_WEBHOOK_URL ||
    process.env.FALKEN_WEBHOOK_URL ||
    '',
  webhookSecret:
    process.env.HERMES_WHATSAPP_WEBHOOK_SECRET ||
    process.env.HERMES_ALERT_WEBHOOK_SECRET ||
    process.env.FALKEN_WEBHOOK_SECRET ||
    '',
  directSendUrl: process.env.HERMES_WHATSAPP_SEND_URL || '',
  directChatId: process.env.HERMES_WHATSAPP_CHAT_ID || '',
});

/** Never let credentials from an upstream/tool error escape through Hermes. */
const redactExternalText = (value: unknown) => String(value || '')
  .replace(/(bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
  .replace(/([?&](?:access_?token|api_?key|token|secret|signature|password)=[^&\s]+)/gi, (match) => `${match.slice(0, match.indexOf('=') + 1)}[REDACTED]`)
  .replace(/((?:access_?token|api_?key|token|secret|authorization|cookie|password)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]');

/** The WhatsApp bridge only needs routing metadata; raw tool/API payloads stay in ViaEats. */
const externalAlertMetadata = (payload: Record<string, unknown>) => ({
  alertId: typeof payload.alertId === 'string' ? payload.alertId : null,
  source: typeof payload.source === 'string' ? payload.source : null,
  type: typeof payload.type === 'string' ? payload.type : null,
  severity: typeof payload.severity === 'string' ? payload.severity : null,
  orderNumber: typeof payload.orderNumber === 'string' ? payload.orderNumber : null,
  restaurantName: typeof payload.restaurantName === 'string' ? payload.restaurantName : null,
  at: typeof payload.at === 'string' ? payload.at : null,
});

export function isHermesAlertConfigured(): boolean {
  const { webhookUrl, directSendUrl, directChatId } = cfg();
  return Boolean(webhookUrl || (directSendUrl && directChatId) || process.env.HERMES_API_TOKEN);
}

export function hermesAlertDedupeKey(alert: Pick<HermesAlert, 'source' | 'type' | 'dedupeKey'> & {
  orderId?: unknown;
}): string | null {
  const explicit = String(alert.dedupeKey || '').trim();
  if (explicit) return explicit;
  const orderId = String(alert.orderId || '').trim();
  if (!orderId || !alert.type) return null;
  // Source is deliberately excluded: the event-driven courier path and the
  // periodic Falken recovery scan may detect the same business event.
  return `viaeats:${alert.type}:${orderId}`;
}

export function hermesAlertAuditId(dedupeKey: string): string {
  const digest = crypto.createHash('sha256').update(dedupeKey, 'utf8').digest('hex');
  return `hermes_${digest.slice(0, 48)}`;
}

type AlertClaim = { id: string | null; claimed: boolean };

async function claimHermesAlert(
  payload: Record<string, unknown>,
  dedupeKey: string | null,
): Promise<AlertClaim> {
  try {
    const row = await prisma.auditLog.create({
      data: {
        ...(dedupeKey ? { id: hermesAlertAuditId(dedupeKey) } : {}),
        action: 'HERMES_ALERT_PROCESSING',
        resourceType: 'HermesAlert',
        resourceId: dedupeKey || `${String(payload.type || 'alert')}:${Date.now()}:${crypto.randomBytes(4).toString('hex')}`,
        changes: JSON.stringify(payload),
      },
      select: { id: true },
    });
    return { id: row.id, claimed: true };
  } catch (err: any) {
    if (dedupeKey && err?.code === 'P2002') {
      return { id: hermesAlertAuditId(dedupeKey), claimed: false };
    }
    // Ops-alerts are best effort. If the DB itself is unavailable, still try
    // the direct channel; there is simply no durable polling fallback.
    console.warn('[hermesAlerts] persist failed:', err?.message ?? err);
    return { id: null, claimed: true };
  }
}

async function setHermesAlertState(
  id: string | null,
  action: 'HERMES_ALERT_DELIVERED' | 'HERMES_ALERT_QUEUED',
  payload: Record<string, unknown>,
  delivery?: string,
) {
  if (!id) return;
  await prisma.auditLog.updateMany({
    where: { id, action: 'HERMES_ALERT_PROCESSING' },
    data: {
      action,
      changes: JSON.stringify({ ...payload, ...(delivery ? { delivery } : {}) }),
    },
  }).catch((err: any) => console.warn('[hermesAlerts] state update failed:', err?.message ?? err));
}

export async function sendHermesAlert(alert: HermesAlert): Promise<{ delivered: boolean; channel: string | null; reason?: string }> {
  const { webhookUrl, webhookSecret, directSendUrl, directChatId } = cfg();
  const { dedupeKey: _dedupeKey, ...publicAlert } = alert;
  const payload = {
    source: alert.source || 'viaeats-api',
    at: new Date().toISOString(),
    ...publicAlert,
  };
  const dedupeKey = hermesAlertDedupeKey(alert);
  const claim = await claimHermesAlert(payload, dedupeKey);
  if (!claim.claimed) {
    return { delivered: false, channel: null, reason: 'duplicate' };
  }
  const deliveryPayload = { ...payload, ...(claim.id ? { alertId: claim.id } : {}) };
  const outgoingMessage = redactExternalText(alert.text);
  const outgoingPayload = externalAlertMetadata(deliveryPayload);

  if (directSendUrl && directChatId) {
    try {
      await axios.post(directSendUrl, {
        chatId: directChatId,
        message: outgoingMessage,
        payload: outgoingPayload,
      }, { timeout: 10_000 });
      await setHermesAlertState(claim.id, 'HERMES_ALERT_DELIVERED', deliveryPayload, 'whatsapp_direct');
      return { delivered: true, channel: 'whatsapp_direct' };
    } catch (err: any) {
      console.warn('[hermesAlerts] direct WhatsApp failed:', err?.response?.status ?? err?.message);
    }
  }

  if (!webhookUrl) {
    await setHermesAlertState(claim.id, 'HERMES_ALERT_QUEUED', deliveryPayload);
    return { delivered: false, channel: null, reason: 'no_webhook' };
  }

  try {
    const body = JSON.stringify({ ...outgoingPayload, text: outgoingMessage });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (webhookSecret) {
      headers['x-hermes-signature'] = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
      headers['x-falken-signature'] = headers['x-hermes-signature'];
    }
    await axios.post(webhookUrl, body, { headers, timeout: 10_000 });
    await setHermesAlertState(claim.id, 'HERMES_ALERT_DELIVERED', deliveryPayload, 'webhook');
    return { delivered: true, channel: 'webhook' };
  } catch (err: any) {
    console.warn('[hermesAlerts] webhook failed:', err?.response?.status ?? err?.message);
    await setHermesAlertState(claim.id, 'HERMES_ALERT_QUEUED', deliveryPayload);
    return { delivered: false, channel: 'webhook', reason: 'send_failed' };
  }
}

export async function sendHermesEvents(events: Array<Record<string, unknown>>, fallbackText: string) {
  if (events.length === 0) return { delivered: false, channel: null, reason: 'no_events' };
  return sendHermesAlert({
    source: 'viaeats-falken',
    type: 'events',
    severity: 'info',
    text: fallbackText,
    events,
  });
}
