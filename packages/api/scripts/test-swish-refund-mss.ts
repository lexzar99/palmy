/**
 * Verifierar HELA Swish-refundkedjan mot Swish officiella testmiljö (MSS).
 *
 * M-commerce-betalningar (den vi använder i kassan) blir aldrig PAID på egen
 * hand i MSS — de väntar på att någon öppnar appen. För att få en betald
 * betalning att återbetala skapar steg 1 därför en E-commerce-betalning med
 * payerAlias direkt mot samma mTLS-klient. Steg 2 och 3 kör sedan exakt den
 * produktionskod som adminpanelen använder.
 *
 *   SWISH_ENVIRONMENT=MSS ts-node --transpile-only scripts/test-swish-refund-mss.ts
 */
import 'dotenv/config';
import assert from 'assert';
import axios from 'axios';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { Agent as HttpsAgent } from 'https';
import { swishProvider, getSwishRefundStatus, swishRefundInstructionId } from '../src/lib/payments/swish';

const BASE = process.env.SWISH_API_BASE_URL || 'https://mss.cpc.getswish.net';
const PAYEE = String(process.env.SWISH_PAYEE_ALIAS || '1234679304');
// MSS-simulatorn svarar utifrån payer alias; det här numret godkänner.
const PAYER = String(process.env.SWISH_MSS_PAYER_ALIAS || '4671234768');

function credential(pemName: string, pathName: string): Buffer | undefined {
  const inline = process.env[pemName];
  if (inline) {
    return inline.includes('-----BEGIN')
      ? Buffer.from(inline.replace(/\\n/g, '\n'))
      : Buffer.from(inline, 'base64');
  }
  const path = process.env[pathName];
  return path ? readFileSync(path) : undefined;
}

function instructionId(seed: string): string {
  return createHash('sha256').update(seed).digest('hex').slice(0, 32).toUpperCase();
}

async function main() {
  assert.notStrictEqual(process.env.NODE_ENV, 'production', 'MSS-test får aldrig köras i produktion');
  assert.strictEqual(String(process.env.SWISH_ENVIRONMENT || '').toUpperCase(), 'MSS');
  // Produktionsprovidern kräver en publik refund-callback. MSS-testet pollar
  // själv status, så en neutral HTTPS-adress räcker när lokal .env saknar en.
  process.env.SWISH_REFUND_CALLBACK_URL ||= 'https://example.com/api/swishcb/refunds';

  const client = axios.create({
    baseURL: BASE,
    httpsAgent: new HttpsAgent({
      cert: credential('SWISH_CERT_PEM', 'SWISH_CERT_PATH'),
      key: credential('SWISH_KEY_PEM', 'SWISH_KEY_PATH'),
      ca: credential('SWISH_CA_PEM', 'SWISH_CA_PATH'),
      passphrase: process.env.SWISH_KEY_PASSPHRASE || undefined,
      minVersion: 'TLSv1.2',
    }),
    headers: { 'Content-Type': 'application/json' },
  });

  // ── Steg 1: skapa och invänta en BETALD betalning ────────────────────────
  const stamp = Date.now().toString(36).toUpperCase();
  const paymentRef = instructionId(`viaeats-mss-refund-${stamp}`);
  await client.put(
    `/swish-cpcapi/api/v2/paymentrequests/${paymentRef}`,
    {
      payeePaymentReference: `MSSREF${stamp}`.slice(0, 35),
      callbackUrl: process.env.SWISH_CALLBACK_URL || 'https://example.com/api/payments/webhooks/swish',
      payeeAlias: PAYEE,
      payerAlias: PAYER,
      amount: '1.00',
      currency: 'SEK',
      message: 'ViaEats MSS refundtest',
    },
    { validateStatus: (status) => status === 201 },
  );

  let payment = await swishProvider.getRemoteStatus(paymentRef);
  for (let attempt = 0; attempt < 15 && payment.state === 'pending'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    payment = await swishProvider.getRemoteStatus(paymentRef);
  }
  assert.strictEqual(payment.state, 'paid', `Betalningen blev ${payment.state}, inte paid`);
  assert.strictEqual(payment.amountReceivedOre, 100);
  console.log(`✓ betalning PAID  ${paymentRef}  ${payment.amountReceivedOre} öre`);

  // ── Steg 2: återbetala via produktionskoden ──────────────────────────────
  const idempotencyKey = `ve-mss-refund-${stamp}`;
  const refund = await swishProvider.refund(paymentRef, 100, idempotencyKey);
  assert.strictEqual(refund.refundRef, swishRefundInstructionId(idempotencyKey),
    'Refund-referensen ska vara härledd ur idempotency-nyckeln');
  console.log(`✓ refund skapad   ${refund.refundRef}  status=${refund.status}`);

  // ── Steg 3: samma nyckel igen får INTE skapa en andra utbetalning ────────
  const replay = await swishProvider.refund(paymentRef, 100, idempotencyKey);
  assert.strictEqual(replay.refundRef, refund.refundRef,
    'En retry på samma idempotency-nyckel måste ge samma refund');
  console.log(`✓ retry idempotent ${replay.refundRef}  status=${replay.status}`);

  // ── Steg 4: Swish bekräftar att pengarna gått tillbaka ───────────────────
  let settled = await getSwishRefundStatus(refund.refundRef);
  for (let attempt = 0; attempt < 20 && settled && settled.state !== 'refunded' && settled.state !== 'failed'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    settled = await getSwishRefundStatus(refund.refundRef);
  }
  assert.ok(settled, 'Refunden gick inte att läsa tillbaka från Swish');
  assert.strictEqual(settled.amountOre, 100);
  console.log(`✓ refund status   ${settled.state}  ${settled.amountOre} öre`);
  assert.strictEqual(settled.state, 'refunded', `Refunden slutade som ${settled.state}`);

  console.log(JSON.stringify({ ok: true, paymentRef, refundRef: refund.refundRef }));
}

main().catch((error) => {
  const detail = (error as any)?.response?.data;
  console.error(error instanceof Error ? error.message : error);
  if (detail) console.error('Swish svarade:', JSON.stringify(detail));
  process.exitCode = 1;
});
