import axios from 'axios';
import crypto from 'crypto';

type HermesAlert = {
  source?: string;
  type: string;
  text: string;
  severity?: 'info' | 'warning' | 'critical' | string;
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

export function isHermesAlertConfigured(): boolean {
  const { webhookUrl, directSendUrl, directChatId } = cfg();
  return Boolean(webhookUrl || (directSendUrl && directChatId));
}

export async function sendHermesAlert(alert: HermesAlert): Promise<{ delivered: boolean; channel: string | null; reason?: string }> {
  const { webhookUrl, webhookSecret, directSendUrl, directChatId } = cfg();
  const payload = {
    source: alert.source || 'viaeats-api',
    at: new Date().toISOString(),
    ...alert,
  };

  if (directSendUrl && directChatId) {
    try {
      await axios.post(directSendUrl, {
        chatId: directChatId,
        message: alert.text,
        payload,
      }, { timeout: 10_000 });
      return { delivered: true, channel: 'whatsapp_direct' };
    } catch (err: any) {
      console.warn('[hermesAlerts] direct WhatsApp failed:', err?.response?.status ?? err?.message);
    }
  }

  if (!webhookUrl) return { delivered: false, channel: null, reason: 'no_webhook' };

  try {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (webhookSecret) {
      headers['x-hermes-signature'] = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
      headers['x-falken-signature'] = headers['x-hermes-signature'];
    }
    await axios.post(webhookUrl, body, { headers, timeout: 10_000 });
    return { delivered: true, channel: 'webhook' };
  } catch (err: any) {
    console.warn('[hermesAlerts] webhook failed:', err?.response?.status ?? err?.message);
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
