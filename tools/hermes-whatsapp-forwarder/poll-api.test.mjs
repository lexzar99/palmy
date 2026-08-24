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
const { pollOnce, alertAgeMs, isAuthFailure, HttpError } = require('./poll-api.js');

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
