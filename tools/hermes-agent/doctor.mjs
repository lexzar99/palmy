#!/usr/bin/env node
// Gar igenom hela Hermes-kedjan och sager exakt vilken lank som ar trasig:
//
//   API -> /api/hermes/alerts (Hermes-token) -> pollaren -> WhatsApp-bryggan
//                            \-> agentsession (Falken/Kocken/Torget)
//
//   node tools/hermes-agent/doctor.mjs
//
// Skriver aldrig ut tokens, losenord eller chat-id.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const FORWARDER_DIR = path.join(REPO_ROOT, 'tools', 'hermes-whatsapp-forwarder');
const HOME_DIR = path.join(os.homedir(), '.viaeats', 'hermes');
const TOKEN_DIR = process.env.HERMES_AGENT_TOKEN_DIR || HOME_DIR;
const AGENTS = ['falken', 'kocken', 'torget'];

const results = [];
const record = (ok, label, detail) => {
  results.push({ ok, label, detail });
  console.log(`${ok ? 'OK  ' : 'FEL '} ${label}${detail ? ` - ${detail}` : ''}`);
};

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

const minutesAgo = (iso) => {
  const parsed = Date.parse(iso || '');
  return Number.isFinite(parsed) ? Math.round((Date.now() - parsed) / 60_000) : null;
};

const ageLabel = (minutes) => {
  if (minutes == null) return 'okand alder';
  if (minutes < 90) return `${minutes} min gammal`;
  if (minutes < 60 * 48) return `${Math.round(minutes / 60)} h gammal`;
  return `${Math.round(minutes / 1440)} dygn gammal`;
};

async function tcpReachable(hostname, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: hostname, port, timeout: 3_000 });
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
  });
}

async function main() {
  loadEnvFile(path.join(FORWARDER_DIR, '.runtime.env'));
  loadEnvFile(process.env.HERMES_AGENT_ENV || path.join(HOME_DIR, 'agents.env'));

  const base = (process.env.VIAEATS_API_BASE || 'https://api.viaeats.se').replace(/\/$/, '');
  const hermesToken = (process.env.HERMES_API_TOKEN || '').trim();

  // 1. Lever API:t?
  try {
    const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(10_000) });
    record(health.ok, `API ${base}`, `HTTP ${health.status}`);
  } catch (error) {
    record(false, `API ${base}`, error?.message || 'natverksfel');
  }

  // 2. Hermes-token mot alert-koen.
  let queued = null;
  if (!hermesToken) {
    record(false, 'HERMES_API_TOKEN', `saknas i ${path.join(FORWARDER_DIR, '.runtime.env')}`);
  } else {
    try {
      const response = await fetch(`${base}/api/hermes/alerts?limit=1`, {
        headers: { Authorization: `Bearer ${hermesToken}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 401 || response.status === 403) {
        record(false, 'HERMES_API_TOKEN', `API:t avvisar token (HTTP ${response.status}) - byt mot Railway-vardet`);
      } else if (!response.ok) {
        record(false, 'Hermes alert-ko', `HTTP ${response.status}`);
      } else {
        queued = await response.json();
        record(true, 'HERMES_API_TOKEN', 'accepteras av API:t');
      }
    } catch (error) {
      record(false, 'Hermes alert-ko', error?.message || 'natverksfel');
    }
  }

  // 3. Pollarens markor: star den stilla ligger notiserna kvar i koen.
  const stateFile = process.env.HERMES_ALERT_STATE || path.join(FORWARDER_DIR, 'api-poll-state.json');
  if (!fs.existsSync(stateFile)) {
    record(false, 'Pollarens tillstand', `${stateFile} saknas - har poll-api.js nagonsin kort har?`);
  } else {
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      const minutes = minutesAgo(state.since);
      const failures = Number(state.consecutiveFailures) || 0;
      const stuck = minutes != null && minutes > 60;
      record(!stuck && failures === 0, 'Pollarens markor', `${ageLabel(minutes)}, ${failures} misslyckade rundor i rad`);
    } catch (error) {
      record(false, 'Pollarens tillstand', `kunde inte lasas (${error?.message || 'okant fel'})`);
    }
  }

  // 4. WhatsApp-bryggan - den lank som senast fallde hela kedjan.
  const sendUrl = process.env.HERMES_BRIDGE_SEND_URL || 'http://127.0.0.1:3000/send';
  try {
    const url = new URL(sendUrl);
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    const reachable = await tcpReachable(url.hostname, port);
    record(reachable, 'WhatsApp-bryggan', reachable ? `svarar pa ${url.hostname}:${port}` : `ingen lyssnare pa ${url.hostname}:${port}`);
  } catch {
    record(false, 'WhatsApp-bryggan', 'HERMES_BRIDGE_SEND_URL ar ogiltig');
  }
  if (!process.env.HERMES_WHATSAPP_CHAT_ID) {
    record(false, 'HERMES_WHATSAPP_CHAT_ID', 'saknas - pollaren vet inte vart notiserna ska');
  }

  // 5. Agentsessionerna (morgonrapporten).
  for (const agent of AGENTS) {
    const tokenFile = path.join(TOKEN_DIR, `${agent}.token`);
    if (!fs.existsSync(tokenFile)) {
      record(false, `Session ${agent}`, `${tokenFile} saknas - kor: node tools/hermes-agent/login.mjs ${agent}`);
      continue;
    }
    const token = fs.readFileSync(tokenFile, 'utf8').trim();
    try {
      const verify = await fetch(`${base}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: '{}',
        signal: AbortSignal.timeout(15_000),
      });
      if (!verify.ok) {
        record(false, `Session ${agent}`, `HTTP ${verify.status} - sessionen har gatt ut, kor login.mjs ${agent}`);
        continue;
      }
      const body = await verify.json().catch(() => ({}));
      const role = body?.admin?.role || 'okand roll';
      // Falken ar den som hamtar driftdata till morgonrapporten.
      if (agent === 'falken') {
        const ops = await fetch(`${base}/api/admin/ops`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15_000),
        });
        record(ops.ok, `Session ${agent}`, `${role}, /api/admin/ops HTTP ${ops.status}`);
      } else {
        record(true, `Session ${agent}`, role);
      }
    } catch (error) {
      record(false, `Session ${agent}`, error?.message || 'natverksfel');
    }
  }

  // Sammanfattning: hur manga notiser som ligger olevererade just nu.
  if (queued?.alerts?.length) {
    const latest = queued.alerts[queued.alerts.length - 1];
    console.log(`\nSenaste olevererade notis: ${latest.type || 'okand'} (${ageLabel(minutesAgo(latest.createdAt))})`);
  }

  const broken = results.filter((row) => !row.ok);
  console.log(`\n${broken.length ? `${broken.length} trasiga lankar:` : 'Hela kedjan ar hel.'}`);
  for (const row of broken) console.log(`  - ${row.label}: ${row.detail}`);
  process.exitCode = broken.length ? 1 : 0;
}

main().catch((error) => {
  console.error('[hermes-doctor] fatal:', error?.message || error);
  process.exit(1);
});
