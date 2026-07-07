#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../..');
const envFile = path.join(__dirname, '.runtime.env');
const tokenFile = path.join(rootDir, 'tools/dograh-hermes/.viaeats-hermes-token');
const stateFile = process.env.HERMES_ALERT_STATE || path.join(__dirname, 'api-poll-state.json');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
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

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return { since: new Date(Date.now() - 5 * 60_000).toISOString() };
  }
}

function writeState(state) {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function alertText(alert) {
  if (alert.text) return String(alert.text);
  if (Array.isArray(alert.events) && alert.events.length) {
    return alert.events
      .map((event) => event.text || event.message || event.type || JSON.stringify(event))
      .join('\n\n');
  }
  return JSON.stringify(alert, null, 2);
}

async function postJson(url, body, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`${response.status} ${text}`.trim());
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function getJson(url, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`${response.status} ${text}`.trim());
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function pollOnce(config, state) {
  const url = new URL('/api/hermes/alerts', config.apiBase);
  url.searchParams.set('since', state.since);
  url.searchParams.set('limit', '50');

  const data = await getJson(url.toString(), {
    Authorization: `Bearer ${config.token}`,
  });

  for (const alert of data.alerts || []) {
    const message = alertText(alert);
    if (!message.trim()) continue;

    await postJson(config.bridgeSendUrl, {
      chatId: config.chatId,
      message,
      payload: alert,
    });

    if (alert.id) {
      await postJson(`${config.apiBase.replace(/\/$/, '')}/api/hermes/alerts/${alert.id}/ack`, {}, {
        Authorization: `Bearer ${config.token}`,
      }).catch(() => {});
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

async function main() {
  loadEnvFile(envFile);

  const config = {
    apiBase: (process.env.VIAEATS_API_BASE || 'https://api.viaeats.se').replace(/\/$/, ''),
    token: readToken(),
    bridgeSendUrl: process.env.HERMES_BRIDGE_SEND_URL || 'http://127.0.0.1:3000/send',
    chatId: process.env.HERMES_WHATSAPP_CHAT_ID || '',
    intervalMs: Number(process.env.HERMES_ALERT_POLL_MS || 10_000),
  };

  if (!config.token) throw new Error('HERMES_API_TOKEN saknas');
  if (!config.chatId) throw new Error('HERMES_WHATSAPP_CHAT_ID saknas');

  const state = readState();
  console.log(`[hermes-poll] polling ${config.apiBase}/api/hermes/alerts`);

  while (true) {
    try {
      await pollOnce(config, state);
    } catch (error) {
      console.error('[hermes-poll] failed:', error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, config.intervalMs));
  }
}

main().catch((error) => {
  console.error('[hermes-poll] fatal:', error.message || error);
  process.exit(1);
});
