import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  mergeSwishClientCertificate,
  swishCallbackIdentifier,
  swishCommerceQrPayload,
  swishInstructionId,
  swishPaymentRequestUrl,
  validSwishCallbackIdentifier,
  validateSwishCallbackUrl,
} from '../lib/payments/swish';
import { directSwishFeeSnapshot } from '../lib/directSwishFinance';

const instructionId = swishInstructionId('checkout-order-1');
assert.match(instructionId, /^[0-9A-F]{32}$/);
assert.equal(instructionId, swishInstructionId('checkout-order-1'));
assert.notEqual(instructionId, swishInstructionId('checkout-order-2'));

process.env.NODE_ENV = 'test';
process.env.SWISH_CALLBACK_SECRET = 'swish-contract-secret-at-least-32-chars';
const callbackIdentifier = swishCallbackIdentifier(instructionId);
assert.match(callbackIdentifier, /^[0-9A-F]{32}$/);
assert.equal(validSwishCallbackIdentifier(instructionId, callbackIdentifier), true);
assert.equal(validSwishCallbackIdentifier(instructionId, callbackIdentifier.slice(1)), false);

const pemBlock = (body: string) => Buffer.from(
  `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`,
);
const leafOnly = pemBlock('LEAF');
const issuerChain = Buffer.concat([pemBlock('INTERMEDIATE'), pemBlock('ROOT')]);
const fullChain = mergeSwishClientCertificate(leafOnly, issuerChain).toString('utf8');
assert.equal((fullChain.match(/BEGIN CERTIFICATE/g) || []).length, 3);
assert.equal(
  mergeSwishClientCertificate(Buffer.from(fullChain), issuerChain).toString('utf8'),
  fullChain,
  'en redan komplett kedja får inte dupliceras',
);
assert.throws(
  () => mergeSwishClientCertificate(Buffer.from('not a certificate')),
  /inget PEM-certifikat/,
);

assert.equal(swishCommerceQrPayload('ABC123'), 'DABC123');
assert.throws(() => swishCommerceQrPayload('token with spaces'), /ogiltig M-commerce-token/);
const appUrl = swishPaymentRequestUrl(
  'ABC123',
  'https://viaeats.se/cart?payment_return=swish',
);
assert.equal(
  appUrl,
  'swish://paymentrequest?token=ABC123&callbackurl=https%253A%252F%252Fviaeats.se%252Fcart%253Fpayment_return%253Dswish',
);

assert.equal(
  validateSwishCallbackUrl('https://api.viaeats.se/api/payments/webhooks/swish'),
  'https://api.viaeats.se/api/payments/webhooks/swish',
);
assert.equal(
  validateSwishCallbackUrl('https://api.viaeats.se:443/api/payments/webhooks/swish'),
  'https://api.viaeats.se/api/payments/webhooks/swish',
);
for (const invalid of [
  'http://api.viaeats.se/api/payments/webhooks/swish',
  'https://api.viaeats.se:8443/api/payments/webhooks/swish',
  'https://localhost/api/payments/webhooks/swish',
  'https://api.viaeats.se/api/payments/webhooks/swish#fragment',
]) {
  assert.throws(() => validateSwishCallbackUrl(invalid), /HTTPS på port 443/);
}

const cleanupSource = readFileSync(path.resolve(__dirname, '../lib/cleanup.ts'), 'utf8');
assert.match(cleanupSource, /swishPaymentId:\s*true/);
assert.match(cleanupSource, /\['mollie', 'stripe', 'adyen', 'swish'\]/);
assert.match(cleanupSource, /provider\.name === 'swish'[\s\S]*?order\.swishPaymentId/);

const orderRouteSource = readFileSync(path.resolve(__dirname, '../routes/orders.ts'), 'utf8');
const abandonRoute = orderRouteSource.match(
  /router\.post\('\/:id\/abandon'[\s\S]*?\n\}\);/,
)?.[0] || '';
assert.match(abandonRoute, /cancelPaymentWithCanonicalRetry\(provider, ref, 3\)/);
assert.match(
  abandonRoute,
  /paymentStatus === 'PAID'[\s\S]*?paid: true, alreadyTerminal: true/,
  'stale abandon calls must report an already-paid order as paid',
);
assert.match(
  abandonRoute,
  /terminalPaymentStatuses\.has\(paymentStatus\)[\s\S]*?failed: true, alreadyTerminal: true/,
  'stale abandon calls must report failed/cancelled orders as terminal',
);
const paymentProviderSource = readFileSync(path.resolve(__dirname, '../lib/payments/index.ts'), 'utf8');
assert.match(paymentProviderSource, /provider\.cancelPayment\(paymentRef\)/);
assert.match(paymentProviderSource, /provider\.getRemoteStatus\(paymentRef\)/);

const paymentRouteSource = readFileSync(path.resolve(__dirname, '../routes/payments.ts'), 'utf8');
assert.match(paymentRouteSource, /inspectSwishTlsConfiguration\(\)\.ok/);
assert.match(
  paymentRouteSource,
  /providers\.includes\('swish'\) && swishReady[\s\S]*?id: 'swish'/,
  '/methods must not advertise Swish when the TLS identity is invalid',
);
assert.match(paymentRouteSource, /randomBytes\(16\)\.toString\('hex'\)\.toUpperCase\(\)/);
assert.match(paymentRouteSource, /data: \{ swishPaymentId: reusableRef \}/);
assert.match(
  paymentRouteSource,
  /paymentReference: provider\.name === 'stripe'[\s\S]*?: reservedSwishPaymentRef/,
  'create must preserve the reserved Swish reference while allowing exact Stripe reuse',
);
assert.match(paymentRouteSource, /await provider\.cancelPayment\(previousRef\)/);
assert.match(paymentRouteSource, /SWISH_PAYMENT_STILL_PENDING/);
assert.match(paymentRouteSource, /issueOrderPaymentResumeProof\(order\.id, order\.accessToken\)/);

const swishSource = readFileSync(path.resolve(__dirname, '../lib/payments/swish.ts'), 'utf8');
assert.match(swishSource, /refundOre < 100/);
assert.match(swishSource, /QRCode\.toDataURL\(swishCommerceQrPayload\(token\)/);
assert.match(swishSource, /paymentReference \|\| swishInstructionId\(idempotencyKey\)/);
assert.match(swishSource, /assertSwishPaymentIdentity\(response\.data\)/);

assert.deepEqual(
  directSwishFeeSnapshot(
    [{ paymentProvider: 'swish', paymentStatus: 'PAID', swishPaymentId: 'swish-payment-1' }],
    { SWISH_PAYOUTS_DISABLED: 'true', SWISH_PAYOUT_FEE_POLICY: 'external' },
  ),
  {
    status: 'unavailable',
    policy: null,
    paymentCount: 1,
    feePerPaymentOre: null,
    totalFeesOre: null,
    error: 'Restaurangutbetalningar med Swish är blockerade av SWISH_PAYOUTS_DISABLED.',
  },
);

console.log('Swish contracts: mTLS chain, app switch, QR, callbacks and cleanup are guarded');
