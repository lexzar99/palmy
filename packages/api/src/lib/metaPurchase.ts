import prisma from './prisma';
import { readOrderAttribution } from './orderAttribution';

const PREFIX = 'meta-purchase:';
const MAX_AGE_MS = 47 * 60 * 60 * 1000;
export function metaPurchaseEligible(order: { paymentStatus: string; status: string; accountingExcluded: boolean }) {
  return order.paymentStatus === 'PAID' && order.status !== 'CANCELLED' && !order.accountingExcluded;
}
export function buildMetaPurchase(order: { id: string; total: number; paymentStatus: string; status: string; accountingExcluded: boolean }, changes: string | null, userAgent: string | null, now = Date.now()) {
  const attribution = readOrderAttribution(changes);
  if (!Number.isFinite(order.total) || order.total <= 0 || !metaPurchaseEligible(order) || !attribution?.marketing || attribution.surface === 'VIAEATS_APP') return null;
  const { fbc, fbp } = attribution.marketing;
  return {
    event_name: 'Purchase', event_id: `Purchase:${order.id}`, event_time: Math.floor(now / 1000),
    action_source: 'website', event_source_url: 'https://www.viaeats.se/',
    user_data: { ...(fbc ? { fbc } : {}), ...(fbp ? { fbp } : {}), ...(userAgent ? { client_user_agent: userAgent.slice(0, 512) } : {}) },
    custom_data: { currency: 'SEK', value: order.total / 100, order_id: order.id },
  };
}

/** Beständig kö efter PAID. Inga nätanrop till Meta i betalningsflödet. */
export async function enqueueMetaPurchase(orderId: string, store = prisma): Promise<void> {
  try {
    const [order, captured] = await Promise.all([
      store.order.findUnique({ where: { id: orderId } }),
      store.auditLog.findFirst({ where: { action: 'ORDER_CHANNEL_CAPTURED', resourceType: 'Order', resourceId: orderId }, orderBy: { createdAt: 'asc' } }),
    ]);
    if (!order || !captured || Date.now() - order.createdAt.getTime() > MAX_AGE_MS) return;
    const event = buildMetaPurchase(order, captured.changes, captured.userAgent);
    if (!event) return;
    await store.auditLog.upsert({
      where: { id: PREFIX + orderId }, update: {},
      create: { id: PREFIX + orderId, action: 'META_PURCHASE_PENDING', resourceType: 'Order', resourceId: orderId,
        changes: JSON.stringify({ event, attempts: 0, nextAttemptAt: 0 }) },
    });
  } catch { console.error('[meta-purchase] Kunde inte köa köphändelsen', { orderId }); }
}

/** Klienten får bara belopp och id från en serverbekräftad köphändelse. */
export async function metaPurchaseReceipt(order: { id: string; paymentStatus: string; status: string; accountingExcluded: boolean }) {
  if (!metaPurchaseEligible(order)) return null;
  try {
    let row = await prisma.auditLog.findUnique({ where: { id: PREFIX + order.id } });
    // Återhämtar ett tillfälligt köfel utan att skapa ett nytt event-id.
    if (!row) {
      await enqueueMetaPurchase(order.id);
      row = await prisma.auditLog.findUnique({ where: { id: PREFIX + order.id } });
    }
    if (!row || Date.now() - row.createdAt.getTime() > MAX_AGE_MS) return null;
    const { event } = JSON.parse(row.changes || '{}');
    return event ? { orderId: order.id, eventId: event.event_id, value: event.custom_data.value, expiresAt: row.createdAt.getTime() + MAX_AGE_MS } : null;
  } catch { return null; }
}

export function metaPurchaseConfiguration() {
  const enabled = process.env.META_CAPI_ENABLED === '1';
  const configured = /^\d+$/.test(process.env.META_PIXEL_ID || '') && Boolean(process.env.META_CAPI_ACCESS_TOKEN)
    && /^v\d+\.\d+$/.test(process.env.META_GRAPH_VERSION || '');
  return { enabled, configured, active: enabled && configured };
}
let running = false;
/** Begränsade försök, beständig kvittens och CAS-lås över flera API-instanser. */
export async function flushMetaPurchases(store = prisma, send: typeof fetch = fetch, now = Date.now()) {
  if (running || !metaPurchaseConfiguration().active) return;
  running = true;
  try {
    const rows = await store.auditLog.findMany({ where: { action: 'META_PURCHASE_PENDING' }, orderBy: { createdAt: 'asc' }, take: 100 });
    for (const row of rows) {
      let state: any;
      try { state = JSON.parse(row.changes || '{}'); } catch { state = {}; }
      if (Date.now() - now > 25_000) break;
      if (state.nextAttemptAt > now) continue;
      if (!state.event || now - row.createdAt.getTime() > MAX_AGE_MS || state.attempts >= 8) {
        await store.auditLog.updateMany({ where: { id: row.id, action: 'META_PURCHASE_PENDING', changes: row.changes }, data: { action: 'META_PURCHASE_EXPIRED' } }); continue;
      }
      const order = row.resourceId ? await store.order.findUnique({ where: { id: row.resourceId } }) : null;
      // Skicka inte köp som hunnit annulleras eller återbetalas före leveransen.
      if (!order || !metaPurchaseEligible(order)) {
        await store.auditLog.updateMany({ where: { id: row.id, action: 'META_PURCHASE_PENDING', changes: row.changes }, data: { action: 'META_PURCHASE_SKIPPED' } }); continue;
      }
      if (!state.event.user_data?.fbc && !state.event.user_data?.fbp) {
        await store.auditLog.updateMany({ where: { id: row.id, action: 'META_PURCHASE_PENDING', changes: row.changes }, data: { action: 'META_PURCHASE_UNMATCHED' } }); continue;
      }
      const locked = JSON.stringify({ ...state, attempts: state.attempts + 1, nextAttemptAt: now + 60_000 });
      const claim = await store.auditLog.updateMany({ where: { id: row.id, action: 'META_PURCHASE_PENDING', changes: row.changes }, data: { changes: locked } });
      if (claim.count !== 1) continue;
      let accepted = false, status = 0;
      try {
        const response = await send(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION}/${process.env.META_PIXEL_ID}/events`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
          body: JSON.stringify({ data: [state.event], access_token: process.env.META_CAPI_ACCESS_TOKEN,
            ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {}) }),
        });
        status = response.status;
        const result = await response.json() as { events_received?: number };
        accepted = response.ok && result.events_received === 1;
      } catch { /* Nätfel: behåll samma event-id och köptid vid nästa försök. */ }
      await store.auditLog.updateMany({ where: { id: row.id, action: 'META_PURCHASE_PENDING', changes: locked }, data: {
        action: accepted ? 'META_PURCHASE_SENT' : 'META_PURCHASE_PENDING',
        changes: JSON.stringify({ ...state, attempts: state.attempts + 1, lastHttpStatus: status,
          nextAttemptAt: now + Math.min(6 * 60 * 60_000, 60_000 * 2 ** state.attempts), ...(accepted ? { sentAt: new Date().toISOString() } : {}) }),
      } });
    }
  } catch { console.error('[meta-purchase] Köleveransen misslyckades; försöker senare'); }
  finally { running = false; }
}
export function startMetaPurchaseWorker() {
  if (!metaPurchaseConfiguration().active) return;
  void flushMetaPurchases();
  const timer = setInterval(() => { void flushMetaPurchases(); }, 30_000);
  timer.unref();
}
