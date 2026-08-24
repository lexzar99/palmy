#!/usr/bin/env node
// Loggar in en Hermes-agent (Falken/Kocken/Torget) mot ViaEats-API:t och
// sparar sessionen som en token-fil agenterna kan lasa.
//
// Varfor det behovs: POST /api/auth/login lamnar JWT:n ENBART i en HttpOnly-
// cookie (Set-Cookie: admin_token=...). En headless agent som bara laser
// svarskroppen far inget att autentisera med och rapporterar "AuthError".
// Det har skriptet plockar cookien, verifierar den och lagger den dar
// agenten hittar den.
//
//   node tools/hermes-agent/login.mjs            # alla konfigurerade agenter
//   node tools/hermes-agent/login.mjs falken     # en agent
//
// Konfiguration lases fran ~/.viaeats/hermes/agents.env (chmod 600):
//   VIAEATS_API_BASE=https://api.viaeats.se
//   AGENT_LOGIN_KEY=<samma varde som Railway-variabeln>
//   FALKEN_EMAIL=falken@viaeats.se
//   FALKEN_PASSWORD=<losenord>
//   KOCKEN_EMAIL=... / KOCKEN_PASSWORD=...
//   TORGET_EMAIL=... / TORGET_PASSWORD=...
//
// Losenord och tokens skrivs aldrig ut - bara status.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const AGENTS = ['falken', 'kocken', 'torget'];
const HOME_DIR = path.join(os.homedir(), '.viaeats', 'hermes');
const ENV_FILE = process.env.HERMES_AGENT_ENV || path.join(HOME_DIR, 'agents.env');
const TOKEN_DIR = process.env.HERMES_AGENT_TOKEN_DIR || HOME_DIR;

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

function apiBase() {
  const raw = process.env.VIAEATS_API_BASE || 'https://api.viaeats.se';
  const url = new URL(raw);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('VIAEATS_API_BASE maste vara HTTPS');
  }
  return url.toString().replace(/\/$/, '');
}

/** admin_token ligger bara i Set-Cookie - inte i JSON-svaret. */
function adminTokenFromSetCookie(response) {
  const headers = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  for (const header of headers) {
    const match = String(header).match(/(?:^|;\s*)admin_token=([^;]+)/);
    if (match && match[1]) return decodeURIComponent(match[1]);
  }
  return null;
}

/** Bara for att kunna rapportera giltighetstid. Ingen signaturkontroll. */
function tokenExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return Number.isFinite(payload.exp) ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

async function loginAgent(agent, base) {
  const upper = agent.toUpperCase();
  const identifier = (process.env[`${upper}_EMAIL`] || `${agent}@viaeats.se`).trim();
  const password = process.env[`${upper}_PASSWORD`] || '';
  if (!password) return { agent, ok: false, reason: `${upper}_PASSWORD saknas i ${ENV_FILE}`, configured: false };

  const headers = { 'Content-Type': 'application/json' };
  // Delad agent-hemlighet ger 80 inloggningar/15 min i stallet for 8. Utan
  // den delar agenten den strama budgeten med all annan trafik fran samma IP.
  if (process.env.AGENT_LOGIN_KEY) headers['x-viaeats-agent'] = process.env.AGENT_LOGIN_KEY;

  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ identifier, password }),
  });

  const body = await response.json().catch(() => ({}));

  if (response.status === 429) {
    return { agent, ok: false, reason: 'HTTP 429 - inloggningsbudgeten ar slut. Satt AGENT_LOGIN_KEY och vanta 15 min.' };
  }
  if (response.status === 401) {
    return { agent, ok: false, reason: `HTTP 401 - ${body?.error || 'fel losenord eller inaktivt konto'}` };
  }
  if (!response.ok) {
    return { agent, ok: false, reason: `HTTP ${response.status} - ${body?.error || 'oväntat svar'}` };
  }
  if (body?.totpRequired) {
    return { agent, ok: false, reason: '2FA ar paslaget pa kontot. En headless agent kan inte svara pa TOTP - sla av 2FA for agentkontot eller kor login manuellt med recoveryCode.' };
  }

  const token = adminTokenFromSetCookie(response);
  if (!token) {
    return { agent, ok: false, reason: 'Inloggningen gick igenom men ingen admin_token-cookie kom tillbaka.' };
  }

  // Bevisa att sessionen faktiskt duger innan den skrivs till disk.
  const verify = await fetch(`${base}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: '{}',
  });
  if (!verify.ok) {
    return { agent, ok: false, reason: `Sessionen underkandes av /api/auth/verify (HTTP ${verify.status})` };
  }
  const verified = await verify.json().catch(() => ({}));

  fs.mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
  const tokenFile = path.join(TOKEN_DIR, `${agent}.token`);
  fs.writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
  fs.chmodSync(tokenFile, 0o600);

  return {
    agent,
    ok: true,
    role: verified?.admin?.role || body?.admin?.role || 'okand',
    tokenFile,
    expiresAt: tokenExpiry(token),
  };
}

async function main() {
  loadEnvFile(ENV_FILE);
  const base = apiBase();
  const requested = process.argv.slice(2).map((value) => value.toLowerCase()).filter(Boolean);
  const targets = requested.length ? requested : AGENTS;

  for (const agent of targets) {
    if (!AGENTS.includes(agent)) {
      console.error(`[hermes-login] okand agent "${agent}" (giltiga: ${AGENTS.join(', ')})`);
      process.exitCode = 1;
      continue;
    }
    let result;
    try {
      result = await loginAgent(agent, base);
    } catch (error) {
      result = { agent, ok: false, reason: error?.message || 'natverksfel' };
    }
    if (result.ok) {
      const days = result.expiresAt
        ? Math.max(0, Math.round((result.expiresAt.getTime() - Date.now()) / 86_400_000))
        : null;
      console.log(`[hermes-login] ${agent}: OK (${result.role}) -> ${result.tokenFile}${days == null ? '' : `, giltig ${days} dygn`}`);
    } else if (result.configured === false) {
      console.warn(`[hermes-login] ${agent}: hoppades over - ${result.reason}`);
    } else {
      console.error(`[hermes-login] ${agent}: MISSLYCKADES - ${result.reason}`);
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error('[hermes-login] fatal:', error?.message || error);
  process.exit(1);
});
