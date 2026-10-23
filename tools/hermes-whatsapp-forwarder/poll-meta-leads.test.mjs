// Kontrakt for lead-pollaren.
// Kor: node --test tools/hermes-whatsapp-forwarder/poll-meta-leads.test.mjs
//
// Det viktiga: varje lead skickas exakt en gang, aven efter en omstart, och ett
// bryggfel far aldrig gora att ett lead markeras som skickat.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildConfig, classifyField, leadMessage, pollOnce, readState, recordFailure, HttpError } = require('./poll-meta-leads.js');

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = (server) => new Promise((resolve) => server.close(resolve));
const readBody = (req) => new Promise((resolve) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => resolve(body ? JSON.parse(body) : {}));
});
const metaTime = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, '+0000');

function lead(id, createdMs, restaurant) {
  return {
    id,
    created_time: metaTime(createdMs),
    platform: 'fb',
    field_data: [
      { name: 'restaurangens_namn', values: [restaurant] },
      { name: 'phone_number', values: ['+46701234567'] },
      { name: 'city', values: ['Lund'] },
    ],
  };
}

async function harness(t, { leads, bridgeStatus = () => 200, graphError = null }) {
  const sent = [];
  const graphRequests = [];
  const bridge = http.createServer(async (req, res) => {
    const body = await readBody(req);
    const status = bridgeStatus(body);
    if (status === 200) sent.push(body);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
  });
  const graph = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    graphRequests.push({ url, auth: req.headers.authorization });
    res.setHeader('Content-Type', 'application/json');
    if (graphError) {
      res.writeHead(graphError.status);
      res.end(JSON.stringify({ error: { code: graphError.code, message: 'nope' } }));
      return;
    }
    if (url.pathname === '/v23.0/page1/leadgen_forms') {
      res.end(JSON.stringify({ data: [{ id: 'form1', name: 'Restaurangagare Skane', status: 'ACTIVE' }] }));
      return;
    }
    if (url.pathname === '/v23.0/form1/leads') {
      const filter = JSON.parse(url.searchParams.get('filtering') || '[]')[0];
      const sinceSec = filter?.value ?? 0;
      const data = leads().filter((item) => Date.parse(item.created_time.replace('+0000', 'Z')) / 1000 > sinceSec);
      res.end(JSON.stringify({ data: data.reverse() }));
      return;
    }
    res.writeHead(404);
    res.end('{}');
  });
  const bridgePort = await listen(bridge);
  const graphPort = await listen(graph);
  t.after(() => Promise.all([close(bridge), close(graph)]));

  const stateFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'meta-leads-')), 'state.json');
  const config = buildConfig({
    META_GRAPH_BASE: `http://127.0.0.1:${graphPort}`,
    META_PAGE_ACCESS_TOKEN: 'EAAtesttokentesttokentesttoken',
    META_PAGE_ID: 'page1',
    HERMES_BRIDGE_SEND_URL: `http://127.0.0.1:${bridgePort}/send`,
    HERMES_WHATSAPP_CHAT_ID: 'chat@test',
    META_LEADS_STATE: stateFile,
    META_API_MAX_ATTEMPTS: '1',
  });
  return { sent, graphRequests, config, stateFile };
}

test('nya leads skickas en gang, aldst forst, och aldrig igen efter omstart', async (t) => {
  const start = Date.now() - 10 * 60_000;
  let current = [];
  const h = await harness(t, { leads: () => current });

  // Forsta starten: inget fanns, inget skickas.
  let state = readState(h.config.stateFile);
  await pollOnce(h.config, state, {}, { now: start });
  assert.equal(h.sent.length, 0);

  current = [lead('L2', start + 120_000, 'Andra'), lead('L1', start + 60_000, 'Forsta')];
  await pollOnce(h.config, state, {}, { now: start + 180_000 });
  assert.deepEqual(h.sent.map((body) => body.payload.leadId), ['L1', 'L2']);
  assert.match(h.sent[0].message, /^NY LEAD\nRestaurang: Forsta\nTelefon: \+46701234567\nStad: Lund/);
  assert.equal(h.sent[0].chatId, 'chat@test');

  // Samma runda igen: inga dubbletter.
  await pollOnce(h.config, state, {}, { now: start + 240_000 });
  assert.equal(h.sent.length, 2);

  // "Omstart": nytt tillstand last fran disk, samma leads i Meta.
  state = readState(h.config.stateFile);
  current.push(lead('L3', start + 300_000, 'Tredje'));
  await pollOnce(h.config, state, {}, { now: start + 360_000 });
  assert.deepEqual(h.sent.map((body) => body.payload.leadId), ['L1', 'L2', 'L3']);
});

test('forsta starten skickar inte gamla leads, --backfill gor det', async (t) => {
  const now = Date.now();
  const old = [lead('OLD', now - 2 * 86_400_000, 'Gammal')];

  const plain = await harness(t, { leads: () => old });
  await pollOnce(plain.config, readState(plain.config.stateFile), {}, { now });
  assert.equal(plain.sent.length, 0);

  const backfill = await harness(t, { leads: () => old });
  await pollOnce(backfill.config, readState(backfill.config.stateFile), {}, { now, backfill: true });
  assert.deepEqual(backfill.sent.map((body) => body.payload.leadId), ['OLD']);
});

test('ett bryggfel markerar inte leadet som skickat', async (t) => {
  const start = Date.now() - 10 * 60_000;
  let bridgeUp = false;
  const leads = [];
  const h = await harness(t, { leads: () => leads, bridgeStatus: () => (bridgeUp ? 200 : 503) });
  const state = readState(h.config.stateFile);
  await pollOnce(h.config, state, {}, { now: start });

  leads.push(lead('L1', start + 60_000, 'Forsta'));
  await assert.rejects(pollOnce(h.config, state, {}, { now: start + 120_000 }), (error) => error.stage === 'bridge');
  assert.equal(readState(h.config.stateFile).seen.L1, undefined);

  bridgeUp = true;
  await pollOnce(h.config, state, {}, { now: start + 180_000 });
  assert.deepEqual(h.sent.map((body) => body.payload.leadId), ['L1']);
  assert.ok(readState(h.config.stateFile).seen.L1);
});

test('token skickas i headern, aldrig i URL:en', async (t) => {
  const h = await harness(t, { leads: () => [] });
  await pollOnce(h.config, readState(h.config.stateFile), {}, { now: Date.now() });
  assert.ok(h.graphRequests.length >= 2);
  for (const request of h.graphRequests) {
    assert.equal(request.url.searchParams.get('access_token'), null);
    assert.equal(request.auth, 'Bearer EAAtesttokentesttokentesttoken');
  }
});

test('avvisad Meta-token larmar en gang, inte varje runda', async (t) => {
  const h = await harness(t, { leads: () => [], graphError: { status: 400, code: 190 } });
  const state = readState(h.config.stateFile);
  const now = Date.now();
  for (const offset of [0, 60_000, 120_000]) {
    const error = await pollOnce(h.config, state, {}, { now: now + offset }).catch((caught) => caught);
    assert.ok(error instanceof HttpError);
    assert.equal(error.graphCode, 190);
    await recordFailure(h.config, state, error, now + offset);
  }
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0].message, /^Blockerad: Meta avvisar token/);
  assert.doesNotMatch(h.sent[0].message, /EAA/);
});

test('trasig tillstandsfil stoppar i stallet for att skicka om allt', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'meta-leads-')), 'state.json');
  fs.writeFileSync(file, '{inte json');
  assert.throws(() => readState(file), /Tillstandsfilen/);
});

test('falten kanns igen aven nar Meta slugifierar egna fragor', () => {
  assert.equal(classifyField('company_name'), 'restaurant');
  assert.equal(classifyField('vad_heter_din_restaurang?'), 'restaurant');
  assert.equal(classifyField('restaurangens_namn'), 'restaurant');
  assert.equal(classifyField('phone_number'), 'phone');
  assert.equal(classifyField('telefonnummer'), 'phone');
  assert.equal(classifyField('city'), 'city');
  assert.equal(classifyField('i_vilken_stad_ligger_restaurangen?'), 'city');
  assert.equal(classifyField('ort'), 'city');
  assert.equal(classifyField('sortiment'), null);
  assert.equal(classifyField('vilken_stad?'), 'city');
  assert.equal(classifyField('full_name'), null);

  const message = leadMessage({ created_time: '2026-10-23T14:05:12+0000', field_data: [{ name: 'full_name', values: ['Anna'] }] }, 'Form');
  assert.match(message, /Restaurang: \(saknas\)/);
  assert.match(message, /Namn: Anna/);
});
