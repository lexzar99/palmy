// Kontrakt for jour-grinden.
// Kor: node --test tools/hermes-agent/jour/viaeats-jour.test.mjs
//
// Ett lokalt bare-repo spelar GitHub och en lokal HTTP-server spelar
// WhatsApp-bryggan. Det som maste hålla: inget pushas utan anvandarens kod,
// koden syns aldrig for agenten, och det som visades ar det som pushas.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const WRAPPER = path.join(here, 'viaeats-jour');
const GATE = path.join(here, 'viaeats-jour.py');

async function sh(cwd, cmd, args, env = {}) {
  return run(cmd, args, { cwd, env: { ...process.env, ...env }, maxBuffer: 10 * 1024 * 1024 });
}

async function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jour-'));
  const remote = path.join(dir, 'github.git');
  const work = path.join(dir, 'work');
  const gitEnv = { GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t' };
  await sh(dir, 'git', ['init', '-q', '--bare', '-b', 'main', remote]);
  await sh(remote, 'git', ['config', 'uploadpack.allowFilter', 'true']);
  await sh(remote, 'git', ['config', 'uploadpack.allowAnySHA1InWant', 'true']);
  await sh(dir, 'git', ['clone', '-q', `file://${remote}`, work]);
  fs.mkdirSync(path.join(work, 'apps/web'), { recursive: true });
  fs.writeFileSync(path.join(work, 'apps/web/kassa.txt'), 'Betala nu\n');
  fs.writeFileSync(path.join(work, 'apps/web/gammal.txt'), Array.from({ length: 40 }, (_, i) => `rad ${i}`).join('\n') + '\n');
  await sh(work, 'git', ['add', '.'], gitEnv);
  await sh(work, 'git', ['commit', '-q', '-m', 'start'], gitEnv);
  await sh(work, 'git', ['push', '-q', 'origin', 'HEAD:main'], gitEnv);

  const messages = [];
  const bridge = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => { messages.push(JSON.parse(body)); res.writeHead(200); res.end('{"ok":true}'); });
  });
  await new Promise((resolve) => bridge.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => bridge.close(resolve)));

  const config = path.join(dir, 'jour.env');
  fs.writeFileSync(config, [
    `JOUR_HOME=${path.join(dir, 'gate')}`,
    `JOUR_REPO_FETCH_URL=file://${remote}`,
    `JOUR_REPO_PUSH_URL=file://${remote}`,
    `HERMES_BRIDGE_SEND_URL=http://127.0.0.1:${bridge.address().port}/send`,
    'HERMES_WHATSAPP_CHAT_ID=chat@test',
  ].join('\n'));
  const env = { ...gitEnv, VIAEATS_JOUR_NO_SUDO: '1', VIAEATS_JOUR_GATE: GATE, VIAEATS_JOUR_CONFIG: config };
  const jour = (...args) => sh(work, WRAPPER, args, env);
  const commit = async (msg) => { await sh(work, 'git', ['add', '-A'], gitEnv); await sh(work, 'git', ['commit', '-q', '-m', msg], gitEnv); };
  const remoteMain = async () => (await sh(dir, 'git', ['--git-dir', remote, 'rev-parse', 'main'])).stdout.trim();
  const head = async () => (await sh(work, 'git', ['rev-parse', 'HEAD'])).stdout.trim();
  return { dir, work, remote, messages, jour, commit, remoteMain, head, gitEnv };
}

const codeOf = (message) => message.match(/(?:GODKÄNN(?: RADERING)?) ([A-Z2-9]{4}) (\d{6})/).slice(1);

test('inget pushas utan anvandarens kod, och koden syns aldrig for agenten', async (t) => {
  const s = await setup(t);
  const before = await s.remoteMain();
  fs.writeFileSync(path.join(s.work, 'apps/web/kassa.txt'), 'Betala nu med Swish\n');
  await s.commit('Rätta knapptext i kassan');

  const request = await s.jour('request', 'Rätta knapptext i kassan');
  assert.equal(s.messages.length, 1);
  const text = s.messages[0].message;
  const [id, code] = codeOf(text);
  assert.match(text, /^JOUR-ÄNDRING [A-Z2-9]{4} väntar på ditt OK/);
  assert.match(text, /apps\/web\/kassa\.txt – ändrad \(\+1 −1\)/);
  assert.match(text, /\+Betala nu med Swish/, 'exakt diff visas');
  assert.doesNotMatch(text, /TAR BORT/);
  assert.equal(request.stdout.includes(code), false, 'agenten far aldrig se koden');
  assert.equal(await s.remoteMain(), before, 'inget pushat an');

  const wrongCode = code === '000000' ? '111111' : '000000';
  await assert.rejects(s.jour('approve', id, wrongCode), /Fel kod\. 2 försök kvar/);
  assert.equal(await s.remoteMain(), before);

  await s.jour('approve', id, code);
  assert.equal(await s.remoteMain(), await s.head(), 'exakt de visade commitarna pushades');
  assert.match(s.messages.at(-1).message, new RegExp(`✅ JOUR ${id} pushad till main`));
  await assert.rejects(s.jour('approve', id, code), /redan pushed/);
});

test('tre fel koder sparrar begaran', async (t) => {
  const s = await setup(t);
  fs.writeFileSync(path.join(s.work, 'apps/web/kassa.txt'), 'x\n');
  await s.commit('x');
  await s.jour('request', 'x');
  const [id, code] = codeOf(s.messages[0].message);
  const wrong = code === '123456' ? '654321' : '123456';
  await assert.rejects(s.jour('approve', id, wrong));
  await assert.rejects(s.jour('approve', id, wrong));
  await assert.rejects(s.jour('approve', id, wrong), /spärrad/);
  await assert.rejects(s.jour('approve', id, code), /redan locked/);
  assert.match(s.messages.at(-1).message, /🔒 JOUR .* spärrad/);
});

test('radering markeras och kraver GODKANN RADERING', async (t) => {
  const s = await setup(t);
  fs.rmSync(path.join(s.work, 'apps/web/gammal.txt'));
  await s.commit('Ta bort gammal fil');
  const result = await s.jour('request', 'Ta bort gammal fil');
  const text = s.messages[0].message;
  assert.match(text, /⚠️ TAR BORT:\n• fil: apps\/web\/gammal\.txt/);
  assert.match(text, /Svara: GODKÄNN RADERING [A-Z2-9]{4} \d{6}/);
  assert.match(result.stdout, /GODKÄNN RADERING/);
});

test('skyddade filer och hemliga nycklar stoppas innan nagot skickas', async (t) => {
  const s = await setup(t);
  fs.mkdirSync(path.join(s.work, 'packages/api/prisma'), { recursive: true });
  fs.writeFileSync(path.join(s.work, 'packages/api/prisma/schema.prisma'), 'model X {}\n');
  await s.commit('schema');
  await assert.rejects(s.jour('request', 'schema'), /schema\.prisma är skyddad/);

  await sh(s.work, 'git', ['reset', '-q', '--hard', 'origin/main']);
  fs.writeFileSync(path.join(s.work, 'apps/web/kassa.txt'), `const key = "sk_live_${'a'.repeat(24)}"\n`);
  await s.commit('nyckel');
  await assert.rejects(s.jour('request', 'nyckel'), /hemlig nyckel/);
  assert.equal(s.messages.length, 0, 'inget meddelande for stoppade andringar');
});

test('om main flyttat sig efter begaran pushas ingenting', async (t) => {
  const s = await setup(t);
  fs.writeFileSync(path.join(s.work, 'apps/web/kassa.txt'), 'jour\n');
  await s.commit('jour');
  await s.jour('request', 'jour');
  const [id, code] = codeOf(s.messages[0].message);

  // Nagon annan pushar till main under tiden.
  const other = path.join(s.dir, 'other');
  await sh(s.dir, 'git', ['clone', '-q', `file://${s.remote}`, other]);
  fs.writeFileSync(path.join(other, 'annat.txt'), 'annat\n');
  await sh(other, 'git', ['add', '.'], s.gitEnv);
  await sh(other, 'git', ['commit', '-q', '-m', 'annat'], s.gitEnv);
  await sh(other, 'git', ['push', '-q', 'origin', 'HEAD:main'], s.gitEnv);
  const moved = await s.remoteMain();

  await assert.rejects(s.jour('approve', id, code), /har ändrats sedan begäran skapades/);
  assert.equal(await s.remoteMain(), moved, 'inget skrevs over');
});

test('ocommittade andringar vagras', async (t) => {
  const s = await setup(t);
  fs.writeFileSync(path.join(s.work, 'apps/web/kassa.txt'), 'ocommittat\n');
  await assert.rejects(s.jour('request', 'x'), /ocommittade ändringar/);
});
