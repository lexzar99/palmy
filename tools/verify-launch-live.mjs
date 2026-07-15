const apiBase = String(process.env.LAUNCH_API_URL || 'https://api.viaeats.se').replace(/\/$/, '');
const webBase = String(process.env.LAUNCH_WEB_URL || 'https://www.viaeats.se').replace(/\/$/, '');
const adminBase = String(process.env.LAUNCH_ADMIN_URL || 'https://office.viaeats.se').replace(/\/$/, '');
const expectedMode = String(process.env.EXPECT_PRELAUNCH_MODE || '').trim();

if (expectedMode && expectedMode !== '0' && expectedMode !== '1') {
  throw new Error('EXPECT_PRELAUNCH_MODE måste vara 0 eller 1');
}

async function request(url, init) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
    ...init,
  });
  const body = await response.text();
  return { response, body };
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

async function jsonEndpoint(path) {
  const { response, body } = await request(`${apiBase}${path}`);
  requireCondition(response.ok, `${path} svarade ${response.status}`);
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${path} returnerade inte JSON`);
  }
}

const health = await jsonEndpoint('/health');
requireCondition(health.status === 'ok', '/health är inte ok');

const ready = await jsonEndpoint('/ready');
requireCondition(ready.status === 'ready', `/ready är ${ready.status || 'okänd'}; warnings/blockers måste vara tomma`);
requireCondition(ready.checks?.database === 'ok', '/ready: databasen är inte ok');
requireCondition(ready.checks?.databaseSchema === 'ok', '/ready: launchpatcharna är inte verifierade');
requireCondition(ready.checks?.adminMfa === 'ok', '/ready: superadmin-MFA är inte ok');

const home = await request(webBase);
requireCondition(home.response.ok, `kundwebben svarade ${home.response.status}`);
const launchPageVisible = /Vi lanserar snart/i.test(home.body);
if (expectedMode === '1') requireCondition(launchPageVisible, 'kundwebben förväntades vara låst men launchsidan hittades inte');
if (expectedMode === '0') requireCondition(!launchPageVisible, 'kundwebben förväntades vara offentlig men launchsidan visas');

const manifest = await request(`${webBase}/manifest.webmanifest`);
requireCondition(manifest.response.ok, `manifest.webmanifest svarade ${manifest.response.status}`);
requireCondition(
  /json|manifest/i.test(manifest.response.headers.get('content-type') || ''),
  'manifest.webmanifest returnerade inte manifest/JSON',
);
JSON.parse(manifest.body);

const appleAssociation = await request(`${webBase}/.well-known/apple-app-site-association`);
requireCondition(appleAssociation.response.ok, `Apple association svarade ${appleAssociation.response.status}`);
requireCondition(/json/i.test(appleAssociation.response.headers.get('content-type') || ''), 'Apple association returnerade inte JSON');
JSON.parse(appleAssociation.body);

const admin = await request(`${adminBase}/login`);
requireCondition(admin.response.ok, `adminlogin svarade ${admin.response.status}`);

console.log(`Launch live gate: OK (${apiBase}, ${webBase}, ${adminBase})`);
