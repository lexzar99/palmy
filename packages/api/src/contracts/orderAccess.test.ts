import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  allowLegacyOrderPhoneProof,
  exchangeOrderAccessForHttpSession,
  issueOrderAccessProof,
  issueOrderHttpSession,
  issueOrderNativeSession,
  ownsOrder,
  ownsOrderWithActiveRawSecret,
  sameOrderSecret,
  validOrderId,
  verifyOrderAccessProof,
  verifyOrderHttpSession,
  verifyOrderNativeSession,
} from '../lib/orderAccess';
import { localCustomerAuthMethod } from '../lib/customerAuthPolicy';

const token = 'f'.repeat(64);

assert.equal(sameOrderSecret(token, token), true);
assert.equal(sameOrderSecret(`${token.slice(0, -1)}e`, token), false);
assert.equal(sameOrderSecret('', token), false);
assert.equal(sameOrderSecret(null, token), false);
assert.equal(sameOrderSecret(token, null), false);
assert.equal(sameOrderSecret(1234, token), false);
assert.equal(sameOrderSecret('åäö-token', 'åäö-token'), true);
assert.equal(ownsOrder({ userId: 'user-1', accessToken: token }, 'user-1', null), true);
assert.equal(ownsOrder({ userId: 'user-1', accessToken: token }, 'user-2', token), true);
assert.equal(ownsOrder({ userId: 'user-1', accessToken: token }, 'user-2', 'wrong'), false);
const createdAt = new Date('2026-07-15T10:00:00.000Z');
assert.equal(
  ownsOrderWithActiveRawSecret({ accessToken: token, createdAt }, token, new Date('2026-07-17T09:59:59.000Z')),
  true,
);
assert.equal(
  ownsOrderWithActiveRawSecret({ accessToken: token, createdAt }, token, new Date('2026-07-17T10:00:01.000Z')),
  false,
);
assert.equal(
  ownsOrderWithActiveRawSecret(
    { accessToken: token, createdAt },
    token,
    new Date('2026-07-17T10:00:01.000Z'),
    30 * 24 * 60 * 60 * 1000,
  ),
  false,
  'callers cannot extend a raw checkout secret beyond 48 hours',
);
assert.equal(
  ownsOrderWithActiveRawSecret(
    { accessToken: token, createdAt },
    token,
    new Date('2026-07-15T10:30:01.000Z'),
    30 * 60 * 1000,
  ),
  false,
  'callers may enforce a shorter raw-secret window',
);
assert.equal(
  ownsOrderWithActiveRawSecret({ accessToken: token, createdAt }, 'wrong', new Date('2026-07-15T10:01:00.000Z')),
  false,
);
assert.equal(allowLegacyOrderPhoneProof('production'), false);
assert.equal(allowLegacyOrderPhoneProof('development'), true);
assert.equal(allowLegacyOrderPhoneProof('test'), true);
assert.equal(localCustomerAuthMethod({ oauthProvider: 'google' }), null);
assert.equal(localCustomerAuthMethod({ oauthProvider: 'apple' }), null);
assert.equal(
  localCustomerAuthMethod({ oauthProvider: 'apple', phone: '+46700000000', isVerified: true }),
  'phone',
);
assert.equal(
  localCustomerAuthMethod({ oauthProvider: 'phone', phone: '+46700000000', isVerified: true }),
  'phone',
);
assert.equal(
  localCustomerAuthMethod({ oauthProvider: 'phone', phone: '+46700000000', isVerified: false }),
  null,
);
assert.equal(
  localCustomerAuthMethod({ oauthProvider: null, phone: '+46700000000', isVerified: true }),
  'phone',
);

const proofSecret = 'contract-test-secret-at-least-32-bytes';
const orderId = 'cm-order-owner-1';
const proof = issueOrderAccessProof(orderId, proofSecret);
assert.equal(validOrderId(orderId), true);
assert.equal(validOrderId(''), false);
assert.equal(validOrderId('x'.repeat(65)), false);
assert.equal(verifyOrderAccessProof(proof, orderId, proofSecret), true);
assert.equal(verifyOrderAccessProof(proof, 'different-order', proofSecret), false);
assert.equal(verifyOrderAccessProof(proof, orderId, `${proofSecret}-wrong`), false);
assert.equal(verifyOrderAccessProof(`${proof.slice(0, -1)}x`, orderId, proofSecret), false);
const expiredProof = issueOrderAccessProof(orderId, proofSecret, -1);
assert.equal(verifyOrderAccessProof(expiredProof, orderId, proofSecret), false);

const httpSession = issueOrderHttpSession(orderId, proofSecret, 60);
assert.equal(verifyOrderHttpSession(httpSession, orderId, proofSecret), true);
assert.equal(verifyOrderHttpSession(httpSession, 'different-order', proofSecret), false);
assert.equal(verifyOrderAccessProof(httpSession, orderId, proofSecret), false);
assert.equal(verifyOrderHttpSession(proof, orderId, proofSecret), false);
const expiredHttpSession = issueOrderHttpSession(orderId, proofSecret, -1);
assert.equal(verifyOrderHttpSession(expiredHttpSession, orderId, proofSecret), false);

const nativeSession = issueOrderNativeSession(orderId, proofSecret, 60);
assert.equal(verifyOrderNativeSession(nativeSession, orderId, proofSecret), true);
assert.equal(verifyOrderNativeSession(nativeSession, 'different-order', proofSecret), false);
assert.equal(verifyOrderHttpSession(nativeSession, orderId, proofSecret), false);
assert.equal(verifyOrderAccessProof(nativeSession, orderId, proofSecret), false);
assert.equal(verifyOrderNativeSession(httpSession, orderId, proofSecret), false);
const expiredNativeSession = issueOrderNativeSession(orderId, proofSecret, -1);
assert.equal(verifyOrderNativeSession(expiredNativeSession, orderId, proofSecret), false);

async function assertOneTimeRawExchange() {
  let storedRawSecret: string | null = token;
  const exchangeClient = {
    order: {
      findUnique: async () => ({
        userId: null,
        accessToken: storedRawSecret,
        createdAt: new Date(),
      }),
      updateMany: async ({ where, data }: any) => {
        if (storedRawSecret && where.accessToken === storedRawSecret) {
          storedRawSecret = data.accessToken;
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
  };
  assert.equal(await exchangeOrderAccessForHttpSession({ orderId, accessToken: token }, exchangeClient), true);
  assert.equal(storedRawSecret, null);
  assert.equal(
    await exchangeOrderAccessForHttpSession({ orderId, accessToken: token }, exchangeClient),
    false,
    'a raw checkout secret must lose the second exchange',
  );
}

const ordersRouteSource = readFileSync(path.resolve(__dirname, '../routes/orders.ts'), 'utf8');
const orderAccessSource = readFileSync(path.resolve(__dirname, '../lib/orderAccess.ts'), 'utf8');
const paymentsRouteSource = readFileSync(path.resolve(__dirname, '../routes/paymentsMollie.ts'), 'utf8');
const authRouteSource = readFileSync(path.resolve(__dirname, '../routes/auth.ts'), 'utf8');
const pushRouteSource = readFileSync(path.resolve(__dirname, '../routes/push.ts'), 'utf8');
const deviceSource = readFileSync(path.resolve(__dirname, '../lib/deviceInstallations.ts'), 'utf8');
assert.match(ordersRouteSource, /code: 'ORDER_REPLAY_EXPIRED'/);
assert.match(
  ordersRouteSource,
  /if \(!ownsOrderWithActiveRawSecret\(existing, existing\.accessToken\)\) \{\s*return rejectExpiredOrderReplay\(res\);/,
);
assert.match(ordersRouteSource, /exchangeOrderAccessForHttpSession\(\{/);
assert.match(ordersRouteSource, /resolveActiveCustomerFromAuthorization\(authHeaderForScope\)/);
assert.match(ordersRouteSource, /resolveActiveCustomerIdFromAuthorization\(/);
assert.doesNotMatch(ordersRouteSource, /req\.query\.token/);
assert.match(ordersRouteSource, /router\.post\('\/:id\/native-session'/);
assert.match(ordersRouteSource, /issueOrderNativeSession\(orderId\)/);
assert.match(ordersRouteSource, /verifyOrderNativeSession\(/);
assert.doesNotMatch(ordersRouteSource, /supabaseAdmin\.auth\.getUser/);
assert.match(orderAccessSource, /payload\.role === 'USER'/);
assert.match(orderAccessSource, /customerAuthMethod\(sbUser\)/);
assert.match(orderAccessSource, /row\.deletedAt \|\| row\.isActive === false/);
assert.match(
  orderAccessSource,
  /where: \{ id: orderId, accessToken: order\.accessToken \}[\s\S]*data: \{ accessToken: null \}/,
);
assert.doesNotMatch(paymentsRouteSource, /req\.query\.token/);
assert.match(paymentsRouteSource, /verifyOrderNativeSession\(/);
assert.match(paymentsRouteSource, /res\.redirect\(302, appUrl\)/);
assert.doesNotMatch(paymentsRouteSource, /window\.location\.replace/);
assert.match(authRouteSource, /payload\?\.role !== 'USER'/);
assert.match(authRouteSource, /localCustomerAuthMethod\(account\)/);
assert.doesNotMatch(pushRouteSource, /accessToken:\s*req\.body\?\.accessToken/);
assert.match(pushRouteSource, /router\.post\('\/unsubscribe'/);
assert.match(pushRouteSource, /revokeOrderWebPushSubscription\(req\.body\?\.subscription\)/);
assert.match(deviceSource, /provider: 'WEB_PUSH', installationId, tokenHash/);
assert.match(deviceSource, /deviceOrderSubscription\.updateMany/);

void assertOneTimeRawExchange()
  .then(() => {
    console.log('Order access contracts: active customer policy, one-time raw exchange and scoped proofs OK');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
