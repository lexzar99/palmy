// Kontrakt for pollaren.
// Kor: node --test tools/hermes-whatsapp-forwarder/poll-api.test.mjs
//
// Det som testas ar den vag som tog ner Hermes 2026-07-31: markoren flyttades
// bara efter en lyckad sandning, sa en nere brygga lasta koen for gott och
// samlade pa sig veckor av notiser att skralla ut pa en gang.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const stateFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-poll-')), 'state.json');
process.env.HERMES_ALERT_STATE = stateFile;
const require = createRequire(import.meta.url);
const { pollOnce, alertAgeMs, deliverableText, isAuthFailure, HttpError } = require('./poll-api.js');

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = (server) => new Promise((resolve) => server.close(resolve));

const readBody = (req) => new Promise((resolve) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => resolve(body ? JSON.parse(body) : {}));
});

test('gamla notiser hoppas over, farska skickas och markoren flyttas alltid', async (t) => {
  const sent = [];
  const acked = [];

  const bridge = http.createServer(async (req, res) => {
    sent.push(await readBody(req));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
  });
  const api = http.createServer((req, res) => {
    if (req.url.startsWith('/api/hermes/alerts?')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        alerts: [
          { id: 'gammal', createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString(), type: 'order:new', text: 'Gammal order' },
          { id: 'tom', createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), type: 'noise', text: '' },
          { id: 'farsk', createdAt: new Date(Date.now() - 60_000).toISOString(), type: 'order:new', text: 'Ny order PA-2000-XX' },
        ],
      }));
      return;
    }
    if (req.url.endsWith('/ack')) {
      acked.push(req.url);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
      return;
    }
    res.writeHead(404);
    res.end('{}');
  });

  const bridgePort = await listen(bridge);
  const apiPort = await listen(api);
  t.after(async () => { await close(bridge); await close(api); });

  const state = { since: '2026-07-31T20:44:28.901Z' };
  await pollOnce({
    apiBase: `http://127.0.0.1:${apiPort}`,
    token: 'test',
    bridgeSendUrl: `http://127.0.0.1:${bridgePort}/send`,
    chatId: 'chat',
    maxAttempts: 1,
    maxAlertAgeMs: 45 * 60_000,
  }, state);

  const meddelanden = sent.map((entry) => entry.message);
  assert.ok(meddelanden.some((text) => text.includes('PA-2000-XX')), 'farsk notis ska skickas');
  assert.ok(!meddelanden.some((text) => text.includes('Gammal order')), 'gammal notis ska inte skickas');
  assert.ok(meddelanden.some((text) => text.includes('hoppades over')), 'overhoppad backlog ska rapporteras');
  assert.equal(acked.length, 1, 'bara levererade notiser kvitteras');
  assert.ok(Date.parse(state.since) > Date.parse('2026-08-01T00:00:00Z'), 'markoren ska ha flyttats forbi backloggen');
});

test('markoren flyttas aven nar bryggan ar nere', async (t) => {
  const api = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      alerts: [{ id: 'gammal', createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString(), type: 'order:new', text: 'Gammal order' }],
    }));
  });
  const apiPort = await listen(api);
  t.after(() => close(api));

  const state = { since: '2026-07-31T20:44:28.901Z' };
  // Bryggan svarar inte alls - port 1 har ingen lyssnare.
  await pollOnce({
    apiBase: `http://127.0.0.1:${apiPort}`,
    token: 'test',
    bridgeSendUrl: 'http://127.0.0.1:1/send',
    chatId: 'chat',
    maxAttempts: 1,
    maxAlertAgeMs: 45 * 60_000,
  }, state);

  assert.ok(Date.parse(state.since) > Date.parse('2026-08-01T00:00:00Z'), 'en nere brygga far inte lasa koen');
});

test('401 fran API:t klassas som autentiseringsfel, inte natverksglapp', () => {
  assert.equal(isAuthFailure(new HttpError(401, 'api')), true);
  assert.equal(isAuthFailure(new HttpError(500, 'api')), false);
  assert.equal(isAuthFailure(new HttpError(401, 'bridge')), false, 'bryggans 401 ar inte var API-token');
});

test('alertAgeMs behandlar saknad tidsstampel som farsk', () => {
  assert.equal(alertAgeMs({}), 0);
  assert.ok(alertAgeMs({ createdAt: new Date(Date.now() - 120_000).toISOString() }) >= 119_000);
});

test('en notis per ny order med pris, statusbyten och budlarm tystas men kvitteras', async (t) => {
  const sent = [];
  const acked = [];
  const now = Date.now();
  const bridge = http.createServer(async (req, res) => {
    sent.push(await readBody(req));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
  });
  const api = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.url.endsWith('/ack')) {
      acked.push(req.url.split('/')[4]);
      res.end('{}');
      return;
    }
    const at = (offset) => new Date(now - 60_000 + offset).toISOString();
    res.end(JSON.stringify({
      ok: true,
      alerts: [
        { id: 'ny', createdAt: at(0), type: 'order:new', text: 'Ny order PA-1 från Palmyra Pizzeria, 359 kr.', totalKr: 359, restaurant: 'Palmyra Pizzeria' },
        { id: 'acc', createdAt: at(1), type: 'order:accepted', text: 'Order PA-1 accepterad', totalKr: 359, restaurant: 'Palmyra Pizzeria' },
        { id: 'lev', createdAt: at(2), type: 'order:delivered', text: 'Order PA-1 är hämtad' },
        { id: 'bud', createdAt: at(3), type: 'courier:none_online', text: 'INGA BUD' },
        { id: 'sup', createdAt: at(4), type: 'support:report', text: 'Supportärende från Elina' },
      ],
    }));
  });
  const bridgePort = await listen(bridge);
  const apiPort = await listen(api);
  t.after(async () => { await close(bridge); await close(api); });

  const state = { since: new Date(now - 3_600_000).toISOString() };
  await pollOnce({
    apiBase: `http://127.0.0.1:${apiPort}`,
    token: 'test',
    bridgeSendUrl: `http://127.0.0.1:${bridgePort}/send`,
    chatId: 'chat',
    maxAttempts: 1,
    maxAlertAgeMs: 45 * 60_000,
  }, state);

  assert.deepEqual(sent.map((entry) => entry.message), ['NY ORDER 359 kr Palmyra Pizzeria', 'Supportärende från Elina']);
  assert.deepEqual(acked.sort(), ['acc', 'bud', 'lev', 'ny', 'sup']);
  assert.equal(deliverableText({ type: 'order:new', totalKr: 359.5, restaurant: 'Roma' }), 'NY ORDER 359,5 kr Roma');
  assert.equal(deliverableText({ type: 'order:accepted', text: 'x' }, ['order:new', 'order:accepted']), 'x');
});

test('restaurangvakten larmar en gang om en order ingen tagit, men inte om den hunnit accepteras', async (t) => {
  const sent = [];
  const now = Date.now();
  const at = (minutesAgo) => new Date(now - minutesAgo * 60_000).toISOString();
  const lookups = { 'PA-1': { orderNumber: 'PA-1', status: 'PENDING', restaurantPhone: '046-12 34 56' }, 'PA-3': { orderNumber: 'PA-3', status: 'ACCEPTED' } };
  let round = 0;
  const bridge = http.createServer(async (req, res) => {
    sent.push(await readBody(req));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
  });
  const api = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.url.startsWith('/api/hermes/orders/lookup')) {
      const number = new URL(req.url, 'http://x').searchParams.get('orderNumber');
      res.end(JSON.stringify({ ok: true, orders: lookups[number] ? [lookups[number]] : [] }));
      return;
    }
    if (req.url.endsWith('/ack')) { res.end('{}'); return; }
    round += 1;
    res.end(JSON.stringify({
      ok: true,
      alerts: round > 1 ? [] : [
        { id: 'a', createdAt: at(6), type: 'order:new', status: 'PENDING', orderId: 'o1', orderNumber: 'PA-1', totalKr: 359, restaurant: 'Palmyra Pizzeria' },
        { id: 'b', createdAt: at(6), type: 'order:new', status: 'PENDING', orderId: 'o2', orderNumber: 'PA-2', totalKr: 120, restaurant: 'Roma' },
        { id: 'c', createdAt: at(5), type: 'order:accepted', status: 'ACCEPTED', orderId: 'o2', orderNumber: 'PA-2' },
        { id: 'd', createdAt: at(6), type: 'order:new', status: 'PENDING', orderId: 'o3', orderNumber: 'PA-3', totalKr: 99, restaurant: 'Wanthai' },
        { id: 'e', createdAt: at(1), type: 'order:new', status: 'PENDING', orderId: 'o4', orderNumber: 'PA-4', totalKr: 50, restaurant: 'Cucco' },
      ],
    }));
  });
  const bridgePort = await listen(bridge);
  const apiPort = await listen(api);
  t.after(async () => { await close(bridge); await close(api); });

  const config = {
    apiBase: `http://127.0.0.1:${apiPort}`,
    token: 'test',
    bridgeSendUrl: `http://127.0.0.1:${bridgePort}/send`,
    chatId: 'chat',
    maxAttempts: 1,
    maxAlertAgeMs: 45 * 60_000,
    pendingOrderAlertMs: 4 * 60_000,
  };
  const state = { since: at(60) };
  await pollOnce(config, state);
  await pollOnce(config, state);

  const alarms = sent.filter((entry) => entry.payload?.type === 'order:pending_too_long');
  assert.equal(alarms.length, 1, 'ett larm, inte ett per runda');
  assert.equal(alarms[0].message, 'INGEN HAR TAGIT ORDERN\n359 kr hos Palmyra Pizzeria har väntat 6 min (PA-1).\nRing restaurangen: 046-12 34 56');
  assert.deepEqual(Object.keys(state.pendingOrders).sort(), ['o1', 'o4'], 'PA-3 var redan accepterad enligt uppslaget');
  const day = Object.keys(state.orderDays)[0];
  assert.deepEqual(state.orderDays[day], { orders: 4, sales: 628 }, 'orderboken raknar varje ny order en gang');
});
