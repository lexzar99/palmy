import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('../lib/journey.ts', import.meta.url), 'utf8');
function fixture() {
  const storage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
  let consent = true, now = 1000000000000, id = 0;
  const calls = [];
  const window = { localStorage: storage(), sessionStorage: storage(), location: { search: '?utm_source=email&utm_campaign=palmyra_test' } };
  const module = { exports: {} };
  const context = { module, exports: module.exports, window, document: { referrer: '' }, URLSearchParams, URL, Date: { now: () => now }, crypto: { randomUUID: () => `session-${++id}` }, fetch: async (_, args) => { calls.push(JSON.parse(args.body)); }, require: name => name.includes('cookieConsent') ? { hasMarketingConsent: () => consent } : { API_URL: '' } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { ...module.exports, window, calls, setConsent: v => consent = v, advance: ms => now += ms };
}
test('mejlkällan följer intern navigation och registrering', () => {
  const f = fixture();
  f.trackJourney('LANDED');
  f.window.location.search = '';
  f.trackJourney('CART_OPENED');
  assert.equal(f.calls[1].utmCampaign, 'palmyra_test');
  assert.equal(f.calls[0].sessionId, f.calls[1].sessionId);
  assert.equal(f.journeyRegistrationContext().utmSource, 'email');
});
test('samtycke krävs för händelser och registreringskoppling', () => {
  const f = fixture(); f.setConsent(false);
  f.trackJourney('LANDED');
  assert.equal(f.calls.length, 0);
  assert.equal(f.journeyRegistrationContext(), undefined);
  assert.equal(f.window.localStorage.getItem('viaeats_journey_session'), null);
});
test('ett nytt kampanjklick får en egen session och räknas inte på tidigare kampanj', () => {
  const f = fixture(); f.trackJourney('LANDED');
  f.window.location.search = '?utm_source=meta&utm_campaign=king_kong';
  f.trackJourney('LANDED'); f.trackJourney('RESTAURANT_VIEWED');
  assert.notEqual(f.calls[0].sessionId, f.calls[1].sessionId);
  assert.equal(f.calls[1].sessionId, f.calls[2].sessionId);
  assert.equal(f.calls[1].utmCampaign, 'king_kong');
});
test('nytt besök efter 30 minuter, kampanjkoppling löper ut efter 30 dagar', () => {
  const f = fixture(); f.trackJourney('LANDED'); f.window.location.search = '';
  f.advance(31 * 60 * 1000); f.trackJourney('LANDED');
  assert.notEqual(f.calls[0].sessionId, f.calls[1].sessionId);
  assert.equal(f.calls[1].utmCampaign, 'palmyra_test');
  f.advance(31 * 24 * 60 * 60 * 1000); f.trackJourney('LANDED');
  assert.equal(f.calls[2].utmCampaign, undefined);
});
