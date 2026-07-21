#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../..');
const envFile = path.join(__dirname, '.runtime.env');
const tokenFile = path.join(rootDir, 'tools/dograh-hermes/.viaeats-hermes-token');
const stateFile = process.env.HERMES_ALERT_STATE || path.join(__dirname, 'api-poll-state.json');
const DEFAULT_OUTAGE_ALERT_AFTER_MS = 10 * 60_000;
const DEFAULT_OUTAGE_REPEAT_MS = 60 * 60_000;

class HttpError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.name = 'HttpError';
    this.status = status;
  }
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

function readToken() {
  if (process.env.HERMES_API_TOKEN) return process.env.HERMES_API_TOKEN.trim();
  if (fs.existsSync(tokenFile)) return fs.readFileSync(tokenFile, 'utf8').trim();
  return '';
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
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== 'https:' && !(allowLocalHttp && isLocal && url.protocol === 'http:'))) {
    throw new Error(`${name} maste vara HTTPS (HTTP ar bara tillatet lokalt)`);
  }
  return url.toString().replace(/\/$/, '');
}

function redactText(value) {
  return String(value || '')
    .replace(/(bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:access_?token|api_?key|token|secret|signature|password)=[^&\s]+)/gi, (match) => `${match.slice(0, match.indexOf('=') + 1)}[REDACTED]`)
    .replace(/((?:access_?token|api_?key|token|secret|authorization|cookie|password)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]');
}

function safeErrorMessage(error) {
  if (error instanceof HttpError) return `HTTP ${error.status}`;
  if (error?.name === 'AbortError') return 'timeout';
  return redactText(error?.code || error?.message || 'okant natverksfel').slice(0, 160);
}

function readState() {
  try {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return {
      since: typeof state.since === 'string' ? state.since : new Date(Date.now() - 5 * 60_000).toISOString(),
      firstFailureAt: typeof state.firstFailureAt === 'string' ? state.firstFailureAt : null,
      consecutiveFailures: Number.isFinite(state.consecutiveFailures) ? state.consecutiveFailures : 0,
      outageAlertSentAt: typeof state.outageAlertSentAt === 'string' ? state.outageAlertSentAt : null,
    };
  } catch {
    return { since: new Date(Date.now() - 5 * 60_000).toISOString(), firstFailureAt: null, consecutiveFailures: 0, outageAlertSentAt: null };
  }
}

function writeState(state) {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function alertText(alert) {
  if (alert.text) return redactText(alert.text);
  if (Array.isArray(alert.events) && alert.events.length) {
    return alert.events
      .map((event) => redactText(event.text || event.message || event.type || 'Hermes-handelese'))
      .join('\n\n');
  }
  return 'En Hermes-alert saknar visningsbar sammanfattning.';
}

function safeAlertPayload(alert) {
  return {
    alertId: alert.id || alert.alertId || null,
    createdAt: alert.createdAt || alert.at || null,
    source: typeof alert.source === 'string' ? alert.source : null,
    type: typeof alert.type === 'string' ? alert.type : null,
    severity: typeof alert.severity === 'string' ? alert.severity : null,
    orderNumber: typeof alert.orderNumber === 'string' ? alert.orderNumber : null,
    restaurantName: typeof alert.restaurantName === 'string' ? alert.restaurantName : null,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryable(error) {
  return !(error instanceof HttpError) || error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
}

async function request(url, options, maxAttempts) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new HttpError(response.status);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !retryable(error)) throw error;
      await sleep(Math.min(1_000 * 2 ** (attempt - 1), 4_000) + Math.floor(Math.random() * 250));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function postJson(url, body, headers = {}, maxAttempts = 3) {
  return request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }, maxAttempts);
}

async function getJson(url, headers = {}, maxAttempts = 3) {
  const response = await request(url, { headers }, maxAttempts);
  return response.json();
}

async function pollOnce(config, state) {
  const url = new URL('/api/hermes/alerts', config.apiBase);
  url.searchParams.set('since', state.since);
  url.searchParams.set('limit', '50');
  const data = await getJson(url.toString(), { Authorization: `Bearer ${config.token}` }, config.maxAttempts);

  for (const alert of data.alerts || []) {
    const message = alertText(alert);
    if (!message.trim()) continue;
    await postJson(config.bridgeSendUrl, { chatId: config.chatId, message, payload: safeAlertPayload(alert) }, {}, config.maxAttempts);
    if (alert.id) {
      await postJson(`${config.apiBase}/api/hermes/alerts/${alert.id}/ack`, {}, { Authorization: `Bearer ${config.token}` }, config.maxAttempts).catch(() => {});
    }
    state.since = alert.createdAt || data.nextSince || new Date().toISOString();
    writeState(state);
    console.log(`[hermes-poll] sent alert ${alert.id || state.since}`);
  }

  if (data.nextSince && (!data.alerts || data.alerts.length === 0)) {
    state.since = data.nextSince;
    writeState(state);
  }
}

function outageDurationMs(state, now = Date.now()) {
  const started = state.firstFailureAt ? Date.parse(state.firstFailureAt) : NaN;
  return Number.isFinite(started) ? Math.max(0, now - started) : 0;
}

async function recordFailure(config, state, error) {
  const now = Date.now();
  if (!state.firstFailureAt) state.firstFailureAt = new Date(now).toISOString();
  state.consecutiveFailures = (state.consecutiveFailures || 0) + 1;
  const sentAt = state.outageAlertSentAt ? Date.parse(state.outageAlertSentAt) : NaN;
  const canNotify = outageDurationMs(state, now) >= config.outageAlertAfterMs
    && (!Number.isFinite(sentAt) || now - sentAt >= config.outageRepeatMs);
  if (canNotify) {
    const minutes = Math.max(1, Math.floor(outageDurationMs(state, now) / 60_000));
    await postJson(config.bridgeSendUrl, {
      chatId: config.chatId,
      message: `Blockerad: Hermes har inte fatt API-svar pa ${minutes} min. Fortsatter forsoka automatiskt.`,
      payload: { type: 'hermes_api_outage', severity: 'warning', durationMinutes: minutes, reason: safeErrorMessage(error) },
    }, {}, config.maxAttempts);
    state.outageAlertSentAt = new Date(now).toISOString();
    console.warn(`[hermes-poll] outage notified after ${minutes} min (${safeErrorMessage(error)})`);
  }
  writeState(state);
}

function recordSuccess(state) {
  if (state.firstFailureAt) console.log('[hermes-poll] API contact restored');
  state.firstFailureAt = null;
  state.consecutiveFailures = 0;
  state.outageAlertSentAt = null;
  writeState(state);
}

async function main() {
  loadEnvFile(envFile);
  const config = {
    apiBase: validateEndpoint(process.env.VIAEATS_API_BASE || 'https://api.viaeats.se', 'VIAEATS_API_BASE'),
    token: readToken(),
    bridgeSendUrl: validateEndpoint(process.env.HERMES_BRIDGE_SEND_URL || 'http://127.0.0.1:3000/send', 'HERMES_BRIDGE_SEND_URL', { allowLocalHttp: true }),
    chatId: process.env.HERMES_WHATSAPP_CHAT_ID || '',
    intervalMs: numberSetting(process.env.HERMES_ALERT_POLL_MS, 10_000, 1_000),
    maxAttempts: numberSetting(process.env.HERMES_API_MAX_ATTEMPTS, 3, 1),
    outageAlertAfterMs: numberSetting(process.env.HERMES_API_OUTAGE_ALERT_AFTER_MS, DEFAULT_OUTAGE_ALERT_AFTER_MS, 60_000),
    outageRepeatMs: numberSetting(process.env.HERMES_API_OUTAGE_REPEAT_MS, DEFAULT_OUTAGE_REPEAT_MS, 60_000),
  };
  if (!config.token) throw new Error('HERMES_API_TOKEN saknas');
  if (!config.chatId) throw new Error('HERMES_WHATSAPP_CHAT_ID saknas');

  const state = readState();
  console.log(`[hermes-poll] polling ${config.apiBase}/api/hermes/alerts`);
  while (true) {
    try {
      await pollOnce(config, state);
      recordSuccess(state);
    } catch (error) {
      try {
        await recordFailure(config, state, error);
      } catch (notifyError) {
        writeState(state);
        console.warn(`[hermes-poll] API unavailable; outage notice deferred (${safeErrorMessage(notifyError)})`);
      }
      console.warn(`[hermes-poll] API unavailable (${safeErrorMessage(error)}); retrying silently`);
    }
    await sleep(config.intervalMs);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[hermes-poll] fatal:', safeErrorMessage(error));
    process.exit(1);
  });
}

module.exports = { HttpError, alertText, safeAlertPayload, safeErrorMessage, recordFailure, recordSuccess, validateEndpoint };
