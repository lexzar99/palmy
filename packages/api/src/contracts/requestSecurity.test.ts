import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cookieFromHeader, isPaymentWebhookRequest } from '../lib/requestSecurity';

const {
  DESTRUCTIVE_SEED_CONFIRMATION,
  assertDestructiveSeedAllowed,
  getRequiredSeedAdminCredentials,
} = require('../../prisma/seed-safety');

for (const path of [
  '/api/payments/webhook',
  '/api/payments/webhooks/stripe',
  '/api/payments/webhooks/mollie?retry=1',
  '/api/payments/webhooks/adyen/',
  '/api/payments/webhooks/swish',
]) {
  assert.equal(isPaymentWebhookRequest('POST', path), true, path);
}

assert.equal(isPaymentWebhookRequest('GET', '/api/payments/webhooks/stripe'), false);
assert.equal(isPaymentWebhookRequest('POST', '/api/payments/create'), false);
assert.equal(isPaymentWebhookRequest('POST', '/api/payments/webhooks/stripe/forged'), false);

console.log('Request security contracts: only exact payment webhooks bypass generic limiters');

assert.equal(cookieFromHeader('theme=dark; admin_token=abc%2E123; x=y', 'admin_token'), 'abc.123');
assert.equal(cookieFromHeader('theme=dark', 'admin_token'), null);

assert.throws(
  () => assertDestructiveSeedAllowed({ NODE_ENV: 'production', VIAEATS_ALLOW_DESTRUCTIVE_SEED: DESTRUCTIVE_SEED_CONFIRMATION }),
  /disabled in production/,
);
assert.throws(() => assertDestructiveSeedAllowed({ NODE_ENV: 'development' }), /Refusing destructive seed/);
assert.doesNotThrow(() =>
  assertDestructiveSeedAllowed({
    NODE_ENV: 'development',
    VIAEATS_ALLOW_DESTRUCTIVE_SEED: DESTRUCTIVE_SEED_CONFIRMATION,
  }),
);

assert.throws(
  () =>
    getRequiredSeedAdminCredentials({
      SUPER_ADMIN_EMAIL: 'seed-admin@example.test',
      SUPER_ADMIN_PASSWORD: 'short',
    }),
  /SUPER_ADMIN_PASSWORD/,
);
assert.deepEqual(
  getRequiredSeedAdminCredentials({
    SUPER_ADMIN_EMAIL: 'Seed-Admin@Example.test',
    SUPER_ADMIN_PASSWORD: 'T7!vQ2#nL9@xR4$m',
    SUPER_ADMIN_NAME: 'Launch Operator',
  }),
  {
    email: 'seed-admin@example.test',
    password: 'T7!vQ2#nL9@xR4$m',
    name: 'Launch Operator',
  },
);

const prismaDir = path.resolve(__dirname, '../../prisma');
const rootGitignore = fs.readFileSync(path.resolve(__dirname, '../../../../.gitignore'), 'utf8');

assert.match(rootGitignore, /^\*\.db$/m, 'all local SQLite databases must be ignored');
assert.match(rootGitignore, /^\*\.db-shm$/m, 'SQLite shared-memory sidecars must be ignored');
assert.match(rootGitignore, /^\*\.db-wal$/m, 'SQLite WAL sidecars must be ignored');
assert.doesNotMatch(
  rootGitignore,
  /^-\s*(?:sqlite\.db|\*\.db|\*-journal)$/m,
  'database ignore patterns must not have a literal leading dash',
);

for (const file of ['seed-final.ts', 'seed-multi.ts', 'seed-emergency.js']) {
  const source = fs.readFileSync(path.join(prismaDir, file), 'utf8');
  const guardOffset = source.indexOf('assertDestructiveSeedAllowed(process.env)');
  const firstDatabaseCallOffset = source.search(/prisma\.[a-zA-Z]+\.(?:count|find|create|upsert|update|delete)/);

  assert.ok(guardOffset >= 0, `${file} must require explicit destructive-seed confirmation`);
  assert.ok(
    firstDatabaseCallOffset < 0 || guardOffset < firstDatabaseCallOffset,
    `${file} must refuse unsafe execution before its first database call`,
  );
}

for (const file of ['seed-final.ts', 'seed-emergency.js']) {
  const source = fs.readFileSync(path.join(prismaDir, file), 'utf8');
  const adminWriteOffset = source.search(/prisma\.adminUser\.(?:create|upsert)\(/);
  const adminWriteSource = source.slice(adminWriteOffset, adminWriteOffset + 700);

  assert.match(source, /getRequiredSeedAdminCredentials\(process\.env\)/);
  assert.ok(adminWriteOffset >= 0, `${file} must create or update the explicit seed admin`);
  assert.match(adminWriteSource, /email:\s*adminCredentials\.email/);
  assert.doesNotMatch(source, /bcrypt\.hash\(\s*['"`]/, `${file} must never hash a source-code password literal`);
  assert.doesNotMatch(adminWriteSource, /email:\s*['"`]/, `${file} must not contain a fixed admin identity`);
}

console.log('Seed security contracts: production blocked, explicit opt-in and strong env credentials required');
