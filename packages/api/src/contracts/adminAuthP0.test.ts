import assert from 'node:assert/strict';
import {
  adminSessionTokenFromRequest,
  verifyAdminSessionToken,
} from '../lib/adminSessionVerification';
import {
  isStrongSuperAdminBootstrapPassword,
  planSuperAdminBootstrap,
} from '../lib/superAdminBootstrap';

const request = (input: {
  cookie?: string;
  authorization?: string;
  bodyToken?: string;
}) => ({
  headers: { authorization: input.authorization },
  cookies: input.cookie === undefined ? {} : { admin_token: input.cookie },
  body: input.bodyToken === undefined ? {} : { token: input.bodyToken },
}) as any;

// Cookie is authoritative. Bearer remains compatible and body-token support is
// deliberately restricted to the explicit verification endpoint.
assert.equal(adminSessionTokenFromRequest(request({ cookie: 'cookie', authorization: 'Bearer header', bodyToken: 'body' }), { allowLegacyBodyToken: true }), 'cookie');
assert.equal(adminSessionTokenFromRequest(request({ authorization: 'bearer header' })), 'header');
assert.equal(adminSessionTokenFromRequest(request({ bodyToken: 'body' })), null);
assert.equal(adminSessionTokenFromRequest(request({ bodyToken: 'body' }), { allowLegacyBodyToken: true }), 'body');
assert.equal(adminSessionTokenFromRequest(request({ authorization: 'Basic no' })), null);

assert.equal(isStrongSuperAdminBootstrapPassword('admin123'), false);
assert.equal(isStrongSuperAdminBootstrapPassword('aaaaaaaaaaaaaaaaaaaa'), false);
assert.equal(isStrongSuperAdminBootstrapPassword('nR7!pQ2#xV9@kL4$'), true);

assert.throws(
  () => planSuperAdminBootstrap({ production: true, existing: null }),
  /explicit SUPER_ADMIN_PASSWORD/,
);
assert.throws(
  () => planSuperAdminBootstrap({ production: true, existing: null, initialPassword: 'admin123' }),
  /explicit SUPER_ADMIN_PASSWORD/,
);
assert.deepEqual(
  planSuperAdminBootstrap({
    production: true,
    existing: null,
    initialPassword: 'nR7!pQ2#xV9@kL4$',
  }),
  { kind: 'create', password: 'nR7!pQ2#xV9@kL4$' },
);
assert.throws(
  () => planSuperAdminBootstrap({
    production: true,
    existing: { role: 'SUPER_ADMIN', isActive: false },
    forcePassword: 'nR7!pQ2#xV9@kL4$',
  }),
  /avstängd/,
);
assert.deepEqual(
  planSuperAdminBootstrap({
    production: false,
    existing: { role: 'SUPER_ADMIN', isActive: false },
    forcePassword: 'reset-in-dev',
  }),
  { kind: 'none', reason: 'inactive_development' },
);
assert.deepEqual(
  planSuperAdminBootstrap({
    production: true,
    existing: { role: 'SUPER_ADMIN', isActive: true },
  }),
  { kind: 'none', reason: 'already_ready' },
);
assert.throws(
  () => planSuperAdminBootstrap({
    production: true,
    existing: { role: 'SUPER_ADMIN', isActive: true },
    forcePassword: 'short',
  }),
  /SUPER_ADMIN_PASSWORD_FORCE/,
);

void (async () => {
  const admin = { id: 'admin-1', role: 'SUPER_ADMIN' };
  assert.deepEqual(
    await verifyAdminSessionToken('valid', async () => admin),
    { status: 200, body: { valid: true, admin } },
  );
  assert.deepEqual(
    await verifyAdminSessionToken(null, async () => admin),
    { status: 401, body: { valid: false } },
  );
  assert.deepEqual(
    await verifyAdminSessionToken('revoked', async () => null),
    { status: 401, body: { valid: false } },
  );

  const expired = new Error('expired');
  expired.name = 'TokenExpiredError';
  const expiredResult = await verifyAdminSessionToken('expired', async () => { throw expired; });
  assert.equal(expiredResult.status, 401);
  assert.deepEqual(expiredResult.body, { valid: false });

  const databaseError = new Error('database offline');
  const failedResult = await verifyAdminSessionToken('valid', async () => { throw databaseError; });
  assert.equal(failedResult.status, 500);
  assert.deepEqual(failedResult.body, { valid: false, error: 'Kunde inte verifiera sessionen' });

  console.log('admin auth P0 contracts: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
