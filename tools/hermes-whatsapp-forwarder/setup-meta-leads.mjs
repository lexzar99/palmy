#!/usr/bin/env node
// Engangssteg for lead-bevakningen: gor om en token fran Graph API Explorer
// till en sidtoken som inte gar ut, kontrollerar att den kan lasa sidans
// leadformular och sparar den i ~/.viaeats/hermes/meta-leads.env (chmod 600).
//
//   node tools/hermes-whatsapp-forwarder/setup-meta-leads.mjs [--page-id <id>] [--out <fil>]
//
// Token matas in dolt och skrivs aldrig ut. App-hemligheten behovs bara om
// token ar kortlivad. En token som forlangts i Metas Access Token Tool
// ("Extend Access Token") racker utan hemlighet. Inget av dem sparas utom
// sidtoken.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const GRAPH = 'https://graph.facebook.com/v23.0';
const NEEDED_SCOPES = ['leads_retrieval', 'pages_show_list', 'pages_read_engagement', 'pages_manage_ads'];

const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const outFile = argValue('--out') || path.join(os.homedir(), '.viaeats', 'hermes', 'meta-leads.env');

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (text) => { if (text.includes(question)) process.stdout.write(question); };
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function graph(pathname, params, token) {
  const url = new URL(`${GRAPH}/${pathname}`);
  for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    const error = body.error || {};
    throw new Error(`Meta svarade HTTP ${response.status}${error.code != null ? `, kod ${error.code}` : ''}: ${String(error.message || 'okant fel').replace(/EAA[A-Za-z0-9]+/g, '[token]')}`);
  }
  return body;
}

function fail(message) {
  console.error(`\nStopp: ${message}`);
  process.exit(1);
}

const inputToken = await ask('Token (förlängd användartoken eller sidtoken, visas inte): ', { hidden: true });
if (!inputToken) fail('Ingen token.');
let appSecret = process.env.META_APP_SECRET || '';
let appId = process.env.META_APP_ID || '';
// En token kan granska sig sjalv. App-token behovs bara for bytet nedan.
const debug = async (token) => (await graph('debug_token', { input_token: token }, appSecret && appId ? `${appId}|${appSecret}` : token)).data || {};
const selfInfo = await debug(inputToken).catch((error) => fail(error.message));
appId = String(selfInfo.app_id || appId);
const inputInfo = selfInfo;
if (!inputInfo.is_valid) fail('Meta säger att token inte är giltig. Generera en ny i Graph API Explorer.');
const DAY_S = 86_400;

let pageId = argValue('--page-id');
let pageToken;
let pageName;
if (inputInfo.type === 'PAGE') {
  // En sidtoken direkt (till exempel fran en systemanvandare). Explorerns
  // sidtoken lever bara en timme, sa den duger inte.
  if (inputInfo.expires_at !== 0) fail('Det här är en sidtoken som går ut. Välj "Användartoken" i Graph API Explorer och kör igen.');
  pageId = String(inputInfo.profile_id);
  pageToken = inputToken;
} else {
  let userToken = inputToken;
  const longLived = inputInfo.expires_at === 0 || inputInfo.expires_at - Date.now() / 1000 > 7 * DAY_S;
  if (!longLived && !appSecret) {
    appSecret = await ask('Token är kortlivad. Förläng den i Access Token Tool, eller ange app-hemligheten (visas inte): ', { hidden: true });
    if (!appSecret) fail('Förläng token med "Extend Access Token" i Access Token Tool och kör igen.');
  }
  if (!longLived) {
    // Kortlivad anvandartoken -> 60 dagar. En sidtoken hamtad med den gar inte ut.
    const exchanged = await graph('oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: inputToken,
    }).catch((error) => fail(error.message));
    userToken = exchanged.access_token;
  }
  const accounts = await graph('me/accounts', { fields: 'id,name,access_token', limit: '100' }, userToken)
    .catch((error) => fail(error.message));
  const pages = accounts.data || [];
  let page = pageId ? pages.find((item) => item.id === pageId) : null;
  if (!page && !pageId) {
    const matches = pages.filter((item) => /via\s*eats/i.test(item.name || ''));
    page = matches.length === 1 ? matches[0] : null;
  }
  if (!page) {
    console.log('\nSidor som token når:');
    for (const item of pages) console.log(`  ${item.id}  ${item.name}`);
    fail(pages.length
      ? 'Hittade inte ViaEats-sidan entydigt. Kör igen med --page-id <id> från listan.'
      : 'Token når inga sidor. Bocka i ViaEats-sidan när du loggar in i Graph API Explorer.');
  }
  pageId = page.id;
  pageName = page.name;
  pageToken = page.access_token;
}

const pageInfo = await debug(pageToken).catch((error) => fail(error.message));
const scopes = pageInfo.scopes || [];
const missing = NEEDED_SCOPES.filter((scope) => !scopes.includes(scope));
const forms = await graph(`${pageId}/leadgen_forms`, { fields: 'id,name,status', limit: '100' }, pageToken)
  .catch((error) => fail(`${error.message}\nKontrollera behörigheten leads_retrieval och att appen har leadåtkomst för sidan (Företagsinställningar → Integreringar → Leadåtkomst).`));

console.log(`\nSida: ${pageName || pageId} (${pageId})`);
console.log(`Sidtoken går ut: ${pageInfo.expires_at === 0 ? 'aldrig' : new Date(pageInfo.expires_at * 1000).toISOString()}`);
if (missing.length) console.log(`Behörigheter som saknas: ${missing.join(', ')}`);
console.log(`Leadformulär (${(forms.data || []).length}):`);
for (const form of forms.data || []) console.log(`  ${form.id}  ${form.status}  ${form.name}`);

fs.mkdirSync(path.dirname(outFile), { recursive: true, mode: 0o700 });
fs.writeFileSync(outFile, [
  '# Lead-bevakningen (poll-meta-leads.js). Skapad av setup-meta-leads.mjs.',
  `# ${new Date().toISOString()}`,
  `META_PAGE_ID=${pageId}`,
  `META_PAGE_ACCESS_TOKEN=${pageToken}`,
  'META_GRAPH_API_VERSION=v23.0',
  '',
].join('\n'), { mode: 0o600 });
fs.chmodSync(outFile, 0o600);
console.log(`\nSparat i ${outFile} (chmod 600).`);
