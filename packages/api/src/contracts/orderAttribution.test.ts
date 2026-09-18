import assert from 'node:assert/strict';
import { normalizeOrderAttribution, orderAttributionSummary } from '../lib/orderAttribution';
import { buildMetaPurchase, enqueueMetaPurchase, flushMetaPurchases } from '../lib/metaPurchase';

async function main() {
  const now = Date.now();
  const touch = { source: 'ig', evidence: 'utm', at: now, campaign: 'lund', adId: 'ad-1' };
  const raw = { consent: true, surface: 'VIAEATS_EMBED', first: touch, last: touch, fbc: `fb.1.${now}.CLICK` };
  const attribution = normalizeOrderAttribution(raw, 'VIAEATS_WEB', now);
  assert.equal(attribution.surface, 'VIAEATS_EMBED');
  assert.equal(normalizeOrderAttribution(raw, 'PARTNER_EMBED', now).surface, 'PARTNER_EMBED');
  assert.equal(normalizeOrderAttribution({ ...raw, consent: false }, 'VIAEATS_WEB', now).marketing, null);
  assert.equal(normalizeOrderAttribution({ ...raw, last: { ...touch, at: now - 31 * 86400000 } }, 'VIAEATS_WEB', now).marketing, null);
  assert.equal(normalizeOrderAttribution('invalid', 'VIAEATS_WEB', now).marketing, null);
  const changes = JSON.stringify({ attribution });
  assert.equal(orderAttributionSummary(changes)?.source, 'ig');
  const returning = normalizeOrderAttribution({ ...raw, current: { source: 'direct', evidence: 'direct', at: now } }, 'VIAEATS_WEB', now);
  const returningSummary = orderAttributionSummary(JSON.stringify({ attribution: returning }));
  assert.equal(returningSummary?.source, 'direct');
  assert.equal(returningSummary?.marketingSource, 'ig');
  assert.equal(returningSummary?.campaign, null);
  assert.equal(orderAttributionSummary(JSON.stringify({ channel: 'VIAEATS_WEB' })), null);
  assert.equal(JSON.stringify(orderAttributionSummary(changes)).includes('CLICK'), false);
  const order = { id: 'order-1', total: 12345, paymentStatus: 'PAID', status: 'DELIVERED', accountingExcluded: false, createdAt: new Date(now) };
  const event = buildMetaPurchase(order, changes, null, now)!;
  assert.equal(event.custom_data.value, 123.45);
  assert.equal(event.event_id, 'Purchase:order-1');
  for (const paymentStatus of ['PENDING', 'FAILED', 'REFUNDED']) assert.equal(buildMetaPurchase({ ...order, paymentStatus }, changes, null), null);
  assert.equal(buildMetaPurchase({ ...order, accountingExcluded: true }, changes, null), null);
  assert.equal(buildMetaPurchase({ ...order, status: 'CANCELLED' }, changes, null), null);
  assert.equal(buildMetaPurchase(order, '{}', null), null);

  let row: any = null;
  const store: any = { order: { findUnique: async () => order }, auditLog: {
    findFirst: async () => ({ changes, userAgent: null }),
    upsert: async ({ create }: any) => { if (!row) row = { ...create, createdAt: new Date(now) }; return row; },
    findMany: async () => row?.action === 'META_PURCHASE_PENDING' ? [{ ...row }] : [],
    updateMany: async ({ where, data }: any) => {
      if (row.id !== where.id || row.action !== where.action || row.changes !== where.changes) return { count: 0 };
      Object.assign(row, data); return { count: 1 };
    },
  } };
  await enqueueMetaPurchase(order.id, store);
  const original = row.changes;
  await enqueueMetaPurchase(order.id, store);
  assert.equal(row.changes, original);
  process.env.META_CAPI_ENABLED = '1'; process.env.META_PIXEL_ID = '123';
  process.env.META_GRAPH_VERSION = 'v23.0'; process.env.META_CAPI_ACCESS_TOKEN = 'test-only';
  const sent: any[] = [];
  const send: any = async (_url: string, options: any) => { sent.push(JSON.parse(options.body)); return { ok: sent.length > 1, status: sent.length > 1 ? 200 : 500, json: async () => ({ events_received: sent.length > 1 ? 1 : 0 }) }; };
  await flushMetaPurchases(store, send, now);
  assert.equal(row.action, 'META_PURCHASE_PENDING');
  await flushMetaPurchases(store, send, now + 1000);
  assert.equal(sent.length, 1);
  await flushMetaPurchases(store, send, now + 61000);
  assert.equal(row.action, 'META_PURCHASE_SENT');
  assert.deepEqual(sent[0].data, sent[1].data);
  await enqueueMetaPurchase(order.id, store);
  await flushMetaPurchases(store, send, now + 120000);
  assert.equal(sent.length, 2);
  row.action = 'META_PURCHASE_PENDING'; row.changes = original; order.paymentStatus = 'REFUNDED';
  await flushMetaPurchases(store, send, now + 130000);
  assert.equal(row.action, 'META_PURCHASE_SKIPPED');
  assert.equal(sent.length, 2);
  console.log('Orderattribution och Meta: samtycke, serverstatus, belopp, deduplicering och återförsök OK');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
