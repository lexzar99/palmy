#!/usr/bin/env node
// Hamtar nya leads fran Metas snabbformular och skickar dem som "NY LEAD" till
// WhatsApp-bryggan pa minin. Samma brygga och chatt som ordernotiserna.
//
//   Meta Graph API (/{form-id}/leads) -> poll-meta-leads.js -> WhatsApp-bryggan
//
// Pollning i stallet for webhook: inget i API:t eller i Meta-appen behover
// andras, och missade leads tas igen efter ett avbrott eftersom Meta sparar
// dem i 90 dagar. Varje lead skickas en gang: id:t sparas i tillstandsfilen
// direkt efter att bryggan bekraftat.
//
//   node poll-meta-leads.js              # kor for evigt (systemd)
//   node poll-meta-leads.js --once       # en runda
//   node poll-meta-leads.js --check      # token, formular och brygga, skickar inget
//   node poll-meta-leads.js --test-message   # ett pahittat lead till WhatsApp
//   node poll-meta-leads.js --backfill   # skicka aven leads fran fore forsta starten
//   node poll-meta-leads.js --latest 5   # skriv ut de senaste leadsen (Hermes svarar med dem)
const fs = require('fs');
const os = require('os');
const path = require('path');

const hermesDir = path.join(os.homedir(), '.viaeats', 'hermes');
const runtimeEnvFile = path.join(__dirname, '.runtime.env');
const DAY_MS = 24 * 60 * 60_000;
// Aldre leads an sa har hamtas inte. Minin kan alltsa vara nere en vecka utan
// att nagot lead tappas. Seen-listan maste leva langre an fonstret.
const DEFAULT_LOOKBACK_MS = 7 * DAY_MS;
const SEEN_RETENTION_MS = 30 * DAY_MS;
const FORM_REFRESH_MS = 15 * 60_000;
const MAX_SENDS_PER_ROUND = 20;
const MAX_PAGES_PER_FORM = 10;
const DEFAULT_OUTAGE_ALERT_AFTER_MS = 30 * 60_000;
const DEFAULT_OUTAGE_REPEAT_MS = 6 * 60 * 60_000;
const DEFAULT_AUTH_REPEAT_MS = 12 * 60 * 60_000;

class HttpError extends Error {
  constructor(status, stage, graphCode = null) {
    super(`HTTP ${status}${graphCode != null ? ` (Meta-kod ${graphCode})` : ''}`);
    this.name = 'HttpError';
    this.status = status;
    this.stage = stage;
    this.graphCode = graphCode;
  }
}

// 190 = ogiltig/utgangen token, 102 = session, 10/200-299 = saknad behorighet.
// De lagar sig aldrig sjalva och far ett eget larm direkt.
function isMetaAuthFailure(error) {
  if (!(error instanceof HttpError) || error.stage !== 'meta') return false;
  const code = Number(error.graphCode);
  return code === 190 || code === 102 || code === 10 || (code >= 200 && code <= 299);
}

function loadEnvFile(file) {
  if (!file || !fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

function numberSetting(value, fallback, minimum = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

function validateEndpoint(value, name, { allowLocalHttp = false } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} har en ogiltig URL`);
  }
  const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== 'https:' && !(allowLocalHttp && isLocal && url.protocol === 'http:'))) {
    throw new Error(`${name} maste vara HTTPS (HTTP ar bara tillatet lokalt)`);
  }
  return url.toString().replace(/\/$/, '');
}

function redactText(value) {
  return String(value || '')
    .replace(/(bearer\s+|oauth\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:access_?token|api_?key|token|secret|signature|password)=[^&\s]+)/gi, (match) => `${match.slice(0, match.indexOf('=') + 1)}[REDACTED]`)
    .replace(/((?:access_?token|api_?key|token|secret|authorization|cookie|password)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/EAA[A-Za-z0-9]{20,}/g, '[REDACTED]');
}

function safeErrorMessage(error) {
  const where = error?.stage === 'bridge' ? 'WhatsApp-bryggan' : 'Meta';
  if (error instanceof HttpError) return `${where} svarade ${error.message}`;
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return `${where}: timeout`;
  return `${where}: ${redactText(error?.code || error?.message || 'okant natverksfel').slice(0, 160)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryable(error) {
  if (!(error instanceof HttpError)) return true;
  if (isMetaAuthFailure(error)) return false;
  return error.status === 408 || error.status === 429 || error.status >= 500;
}

async function request(url, options, { maxAttempts = 3, stage, timeoutMs = 20_000 }) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) {
        let graphCode = null;
        if (stage === 'meta') {
          const body = await response.json().catch(() => null);
          graphCode = body?.error?.code ?? null;
        }
        throw new HttpError(response.status, stage, graphCode);
      }
      return response;
    } catch (error) {
      if (error && typeof error === 'object' && !error.stage) {
        try { error.stage = stage; } catch { /* frusna felobjekt */ }
      }
      lastError = error;
      if (attempt === maxAttempts || !retryable(error)) throw error;
      await sleep(Math.min(1_000 * 2 ** (attempt - 1), 4_000) + Math.floor(Math.random() * 250));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

// Token skickas i Authorization-headern, aldrig i URL:en. Annars hamnar den i
// felmeddelanden och loggar.
async function graphGet(config, pathname, params = {}) {
  const url = new URL(`${config.graphBase}/${config.graphVersion}/${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    url.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  const response = await request(url, {
    headers: { Authorization: `Bearer ${config.token}` },
  }, { maxAttempts: config.maxAttempts, stage: 'meta' });
  return response.json();
}

async function sendToBridge(config, message, payload) {
  // Ett forsok per runda. Ett nytt forsok om en timeout kunde annars ge
  // dubbletter om bryggan hann skicka. Nasta runda forsoker igen.
  await request(config.bridgeSendUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: config.chatId, message, payload }),
  }, { maxAttempts: 1, stage: 'bridge', timeoutMs: 30_000 });
}

function parseMetaTime(value) {
  // Meta skriver "2026-10-23T14:05:12+0000". Gor om offseten till ISO.
  const iso = String(value || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : NaN;
}

const STANDARD_LABELS = {
  company_name: 'Restaurang',
  phone_number: 'Telefon',
  city: 'Stad',
  full_name: 'Namn',
  first_name: 'Förnamn',
  last_name: 'Efternamn',
  email: 'E-post',
  work_email: 'E-post',
  street_address: 'Adress',
  post_code: 'Postnummer',
  zip_code: 'Postnummer',
  job_title: 'Titel',
};

function fieldValue(field) {
  const values = Array.isArray(field?.values) ? field.values : [];
  return values
    .map((value) => String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim())
    .filter(Boolean)
    .join(', ')
    .slice(0, 200);
}

function humanizeKey(key) {
  const text = String(key || '').replace(/[_-]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Fält';
}

// Formularet fragar efter restaurangens namn, telefon och stad. Egna fragor
// far nycklar som Meta slugifierar ur frageteksten, darfor monster och inte
// bara exakta namn.
// Stad kollas fore restaurang: "i_vilken_stad_ligger_restaurangen?" ar en stad.
function classifyField(name) {
  const key = String(name || '').toLowerCase();
  if (key === 'phone_number' || /phone|telefon|mobil/.test(key)) return 'phone';
  if (key === 'city' || /stad|city|kommun|(^|_)ort(_|\?|$)/.test(key)) return 'city';
  if (key === 'company_name' || /restaurang|restaurant|f(o|ö)retag|company|business|verksamhet/.test(key)) return 'restaurant';
  return null;
}

function leadMessage(lead, formName, { now = Date.now(), retry = false } = {}) {
  const picked = { restaurant: '', phone: '', city: '' };
  const extra = [];
  for (const field of Array.isArray(lead?.field_data) ? lead.field_data : []) {
    const value = fieldValue(field);
    if (!value) continue;
    const kind = classifyField(field.name);
    if (kind && !picked[kind]) {
      picked[kind] = value;
    } else {
      extra.push(`${STANDARD_LABELS[field.name] || humanizeKey(field.name)}: ${value}`);
    }
  }

  const created = parseMetaTime(lead?.created_time);
  const when = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(Number.isFinite(created) ? created : now);
  const source = lead?.platform === 'ig' ? 'Instagram' : lead?.platform === 'fb' ? 'Facebook' : null;

  return [
    retry ? 'NY LEAD (skickas igen, kan vara en dubblett)' : 'NY LEAD',
    `Restaurang: ${picked.restaurant || '(saknas)'}`,
    `Telefon: ${picked.phone || '(saknas)'}`,
    `Stad: ${picked.city || '(saknas)'}`,
    ...extra,
    '',
    [`Inkom ${when}`, source, formName].filter(Boolean).join(' · '),
  ].join('\n').slice(0, 3500);
}

function defaultState() {
  return {
    version: 1,
    initializedAt: null,
    seen: {},
    uncertain: {},
    firstFailureAt: null,
    outageAlertSentAt: null,
    authAlertSentAt: null,
    lastSuccessAt: null,
  };
}

function readState(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const state = defaultState();
    for (const key of Object.keys(state)) if (raw[key] !== undefined) state[key] = raw[key];
    if (!state.seen || typeof state.seen !== 'object') state.seen = {};
    if (!state.uncertain || typeof state.uncertain !== 'object') state.uncertain = {};
    return state;
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      // En trasig fil far aldrig tolkas som "inga leads skickade". Da skulle
      // hela fonstret skickas om. Stanna hellre och lat systemd logga det.
      throw new Error(`Tillstandsfilen gar inte att lasa (${error.message}). Flytta undan den for att borja om.`);
    }
    return defaultState();
  }
}

function writeState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function pruneSeen(state, now = Date.now()) {
  for (const [id, at] of Object.entries(state.seen)) {
    const ts = Date.parse(at);
    if (Number.isFinite(ts) && now - ts > SEEN_RETENTION_MS) delete state.seen[id];
  }
}

async function loadForms(config, cache, now = Date.now()) {
  if (cache.forms && now - cache.loadedAt < FORM_REFRESH_MS) return cache.forms;
  let forms;
  if (config.formIds.length) {
    forms = config.formIds.map((id) => ({ id, name: cache.forms?.find((form) => form.id === id)?.name || null }));
    for (const form of forms) {
      if (form.name) continue;
      const info = await graphGet(config, form.id, { fields: 'id,name,status' }).catch(() => null);
      form.name = info?.name || null;
    }
  } else {
    forms = [];
    let after = null;
    for (let page = 0; page < MAX_PAGES_PER_FORM; page += 1) {
      const data = await graphGet(config, `${config.pageId}/leadgen_forms`, { fields: 'id,name,status', limit: '100', after });
      for (const form of data.data || []) {
        // Arkiverade formular tar inte emot leads, men ett som nyss stangts
        // kan ha leads i fonstret. Bara DELETED hoppas over.
        if (form.status !== 'DELETED') forms.push({ id: form.id, name: form.name || null });
      }
      after = data.paging?.next ? data.paging?.cursors?.after : null;
      if (!after) break;
    }
  }
  cache.forms = forms;
  cache.loadedAt = now;
  return forms;
}

async function fetchLeads(config, formId, sinceMs) {
  const leads = [];
  let after = null;
  for (let page = 0; page < MAX_PAGES_PER_FORM; page += 1) {
    const data = await graphGet(config, `${formId}/leads`, {
      fields: 'id,created_time,field_data,platform',
      limit: '100',
      filtering: [{ field: 'time_created', operator: 'GREATER_THAN', value: Math.floor(sinceMs / 1000) }],
      after,
    });
    leads.push(...(data.data || []));
    after = data.paging?.next ? data.paging?.cursors?.after : null;
    if (!after) break;
  }
  return leads;
}

async function pollOnce(config, state, cache, { now = Date.now(), backfill = false } = {}) {
  const firstRun = !state.initializedAt;
  if (firstRun) {
    // Forsta starten skickar bara det som kommer in harefter, sa ingen far
    // en skur av gamla leads. --backfill tar med hela fonstret.
    state.initializedAt = new Date(backfill ? now - config.lookbackMs : now).toISOString();
    writeState(config.stateFile, state);
  }

  const forms = await loadForms(config, cache, now);
  const floor = Math.max(Date.parse(state.initializedAt), now - config.lookbackMs);
  const pending = [];
  for (const form of forms) {
    // Ett sekunds marginal: Metas filter ar "storre an" pa hela sekunder.
    for (const lead of await fetchLeads(config, form.id, floor - 1_000)) {
      if (!lead?.id || state.seen[lead.id]) continue;
      const created = parseMetaTime(lead.created_time);
      if (Number.isFinite(created) && created < floor) continue;
      pending.push({ lead, form, created: Number.isFinite(created) ? created : now });
    }
  }
  pending.sort((a, b) => a.created - b.created || String(a.lead.id).localeCompare(String(b.lead.id)));

  let sent = 0;
  for (const { lead, form } of pending.slice(0, MAX_SENDS_PER_ROUND)) {
    const retry = Boolean(state.uncertain[lead.id]);
    try {
      await sendToBridge(config, leadMessage(lead, form.name, { now, retry }), {
        type: 'meta_lead',
        leadId: lead.id,
        formId: form.id,
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        // Bryggan svarade inte i tid men kan ha skickat. Nasta forsok markeras.
        state.uncertain[lead.id] = new Date(now).toISOString();
        writeState(config.stateFile, state);
      }
      throw error;
    }
    state.seen[lead.id] = new Date().toISOString();
    delete state.uncertain[lead.id];
    writeState(config.stateFile, state);
    sent += 1;
    console.log(`[meta-leads] skickade lead ${lead.id} (formular ${form.id})`);
  }

  pruneSeen(state, now);
  writeState(config.stateFile, state);
  return { firstRun, forms: forms.length, pending: pending.length, sent };
}

function outageDurationMs(state, now = Date.now()) {
  const started = state.firstFailureAt ? Date.parse(state.firstFailureAt) : NaN;
  return Number.isFinite(started) ? Math.max(0, now - started) : 0;
}

async function recordFailure(config, state, error, now = Date.now()) {
  if (!state.firstFailureAt) state.firstFailureAt = new Date(now).toISOString();
  writeState(config.stateFile, state);

  // Bryggan nere: inget att larma genom. Journalen far bara det.
  if (error?.stage === 'bridge') return;

  if (isMetaAuthFailure(error)) {
    const sentAt = state.authAlertSentAt ? Date.parse(state.authAlertSentAt) : NaN;
    if (!Number.isFinite(sentAt) || now - sentAt >= config.authRepeatMs) {
      await sendToBridge(config, `Blockerad: Meta avvisar token för lead-bevakningen (${safeErrorMessage(error)}). Nya leads syns bara i Meta tills token är utbytt.`, {
        type: 'meta_leads_auth_failed', severity: 'critical',
      });
      state.authAlertSentAt = new Date(now).toISOString();
      writeState(config.stateFile, state);
    }
    return;
  }

  const sentAt = state.outageAlertSentAt ? Date.parse(state.outageAlertSentAt) : NaN;
  if (outageDurationMs(state, now) >= config.outageAlertAfterMs
    && (!Number.isFinite(sentAt) || now - sentAt >= config.outageRepeatMs)) {
    const minutes = Math.max(1, Math.floor(outageDurationMs(state, now) / 60_000));
    await sendToBridge(config, `Blockerad: lead-bevakningen har inte nått Meta på ${minutes} min (${safeErrorMessage(error)}). Försöker igen automatiskt, inga leads tappas.`, {
      type: 'meta_leads_outage', severity: 'warning',
    });
    state.outageAlertSentAt = new Date(now).toISOString();
    writeState(config.stateFile, state);
  }
}

function recordSuccess(config, state, now = Date.now()) {
  if (state.firstFailureAt) console.log('[meta-leads] kontakten med Meta och bryggan ar tillbaka');
  state.firstFailureAt = null;
  state.outageAlertSentAt = null;
  state.authAlertSentAt = null;
  state.lastSuccessAt = new Date(now).toISOString();
  writeState(config.stateFile, state);
}

function buildConfig(env = process.env) {
  const formIds = String(env.META_LEAD_FORM_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);
  return {
    graphBase: validateEndpoint(env.META_GRAPH_BASE || 'https://graph.facebook.com', 'META_GRAPH_BASE', { allowLocalHttp: true }),
    graphVersion: /^v\d+\.\d+$/.test(env.META_GRAPH_API_VERSION || '') ? env.META_GRAPH_API_VERSION : 'v23.0',
    token: String(env.META_PAGE_ACCESS_TOKEN || '').trim(),
    pageId: String(env.META_PAGE_ID || '').trim(),
    formIds,
    bridgeSendUrl: validateEndpoint(env.HERMES_BRIDGE_SEND_URL || 'http://127.0.0.1:3000/send', 'HERMES_BRIDGE_SEND_URL', { allowLocalHttp: true }),
    chatId: String(env.META_LEADS_CHAT_ID || env.HERMES_WHATSAPP_CHAT_ID || '').trim(),
    stateFile: env.META_LEADS_STATE || path.join(hermesDir, 'meta-leads-state.json'),
    intervalMs: numberSetting(env.META_LEADS_POLL_MS, 60_000, 15_000),
    lookbackMs: numberSetting(env.META_LEADS_LOOKBACK_HOURS, DEFAULT_LOOKBACK_MS / 3_600_000, 1) * 3_600_000,
    maxAttempts: numberSetting(env.META_API_MAX_ATTEMPTS, 3, 1),
    outageAlertAfterMs: numberSetting(env.META_LEADS_OUTAGE_ALERT_AFTER_MS, DEFAULT_OUTAGE_ALERT_AFTER_MS, 60_000),
    outageRepeatMs: numberSetting(env.META_LEADS_OUTAGE_REPEAT_MS, DEFAULT_OUTAGE_REPEAT_MS, 60_000),
    authRepeatMs: numberSetting(env.META_LEADS_AUTH_REPEAT_MS, DEFAULT_AUTH_REPEAT_MS, 60_000),
  };
}

function assertConfig(config) {
  if (!config.token) throw new Error('META_PAGE_ACCESS_TOKEN saknas');
  if (!config.pageId && !config.formIds.length) throw new Error('META_PAGE_ID eller META_LEAD_FORM_IDS saknas');
  if (!config.chatId) throw new Error('HERMES_WHATSAPP_CHAT_ID saknas');
}

async function check(config, state) {
  // Skriver aldrig ut token, chat-id eller leadsens innehall.
  const forms = await loadForms(config, {});
  console.log(`[meta-leads] token fungerar, ${forms.length} formular:`);
  for (const form of forms) {
    const leads = await fetchLeads(config, form.id, Date.now() - config.lookbackMs);
    console.log(`  ${form.id}  ${form.name || '(namnlost)'}  leads senaste ${Math.round(config.lookbackMs / DAY_MS)} dygn: ${leads.length}`);
    // Faltnycklarna visar om meddelandet hittar restaurang, telefon och stad.
    const info = await graphGet(config, form.id, { fields: 'questions{key,type}' }).catch(() => null);
    for (const question of info?.questions || []) {
      console.log(`      falt ${question.key} (${question.type}) -> ${classifyField(question.key) || 'ovrigt'}`);
    }
  }
  const healthUrl = config.bridgeSendUrl.replace(/\/send$/, '/health');
  const health = await fetch(healthUrl, { signal: AbortSignal.timeout(5_000) }).then((res) => res.status).catch((error) => error.code || error.name);
  console.log(`[meta-leads] WhatsApp-bryggan ${healthUrl}: ${health}`);
  console.log(`[meta-leads] tillstand: ${state.initializedAt ? `startad ${state.initializedAt}, ${Object.keys(state.seen).length} skickade leads` : 'ej startad an'}`);
}

async function main(argv = process.argv.slice(2)) {
  loadEnvFile(process.env.META_LEADS_ENV_FILE || path.join(hermesDir, 'meta-leads.env'));
  loadEnvFile(runtimeEnvFile);
  const config = buildConfig();
  assertConfig(config);
  const state = readState(config.stateFile);
  const cache = {};

  if (argv.includes('--check')) return check(config, state);
  if (argv.includes('--latest')) {
    // Hermes svarar med dessa nar anvandaren fragar "visa senaste leadsen".
    const count = numberSetting(argv[argv.indexOf('--latest') + 1], 5, 1);
    const all = [];
    for (const form of await loadForms(config, cache)) {
      for (const lead of await fetchLeads(config, form.id, Date.now() - 90 * DAY_MS)) all.push({ lead, form });
    }
    all.sort((a, b) => parseMetaTime(b.lead.created_time) - parseMetaTime(a.lead.created_time));
    if (!all.length) console.log('Inga leads de senaste 90 dagarna.');
    for (const { lead, form } of all.slice(0, count)) {
      console.log(leadMessage(lead, form.name).replace(/^NY LEAD\n/, '') + '\n');
    }
    return;
  }
  if (argv.includes('--test-message')) {
    await sendToBridge(config, leadMessage({
      id: 'test',
      created_time: new Date().toISOString(),
      field_data: [
        { name: 'company_name', values: ['Testrestaurangen (inte en riktig lead)'] },
        { name: 'phone_number', values: ['+46700000000'] },
        { name: 'city', values: ['Lund'] },
      ],
    }, 'Testmeddelande från poll-meta-leads.js'), { type: 'meta_lead_test' });
    console.log('[meta-leads] testmeddelande skickat');
    return;
  }

  const backfill = argv.includes('--backfill');
  const once = argv.includes('--once');
  console.log(`[meta-leads] pollar ${config.formIds.length ? `${config.formIds.length} formular` : 'sidans formular'} var ${Math.round(config.intervalMs / 1000)}s`);
  while (true) {
    try {
      const result = await pollOnce(config, state, cache, { backfill });
      if (result.firstRun) console.log(`[meta-leads] forsta starten: ${result.forms} formular, skickar leads fran ${state.initializedAt}`);
      if (result.pending > result.sent) console.log(`[meta-leads] ${result.pending - result.sent} leads vantar till nasta runda`);
      recordSuccess(config, state);
    } catch (error) {
      try {
        await recordFailure(config, state, error);
      } catch (notifyError) {
        console.warn(`[meta-leads] larm kunde inte skickas (${safeErrorMessage(notifyError)})`);
      }
      console.warn(`[meta-leads] misslyckad runda (${safeErrorMessage(error)}); forsoker igen`);
      if (once) process.exitCode = 1;
    }
    if (once) return;
    await sleep(config.intervalMs);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[meta-leads] fatal:', safeErrorMessage(error));
    process.exit(1);
  });
}

module.exports = {
  HttpError,
  buildConfig,
  classifyField,
  isMetaAuthFailure,
  leadMessage,
  parseMetaTime,
  pollOnce,
  readState,
  recordFailure,
  redactText,
};
