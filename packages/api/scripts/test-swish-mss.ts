import 'dotenv/config';
import assert from 'assert';
import { swishProvider } from '../src/lib/payments/swish';

async function main() {
  assert.notStrictEqual(process.env.NODE_ENV, 'production', 'MSS-test får aldrig köras i produktion');
  assert.strictEqual(String(process.env.SWISH_ENVIRONMENT || '').toUpperCase(), 'MSS');

  const stamp = Date.now().toString(36).toUpperCase();
  const created = await swishProvider.createPayment({
    order: {
      id: `mss-${stamp}`,
      orderNumber: `MSS-${stamp}`.slice(0, 35),
      total: 100,
      deliveryFee: 0,
      discountAmount: 0,
      foodDiscountAmount: 0,
      deliveryDiscountAmount: 0,
      smallOrderFee: 0,
      foodVatPercent: 12,
      deliveryVatPercent: null,
      tipAmount: 0,
      customerName: 'MSS Test',
      customerEmail: 'test@example.com',
      customerPhone: '46701234567',
      deliveryStreet: null,
      deliveryCity: null,
      deliveryZip: null,
      items: [{ productName: 'Testprodukt', quantity: 1, subtotal: 100, vatPercent: 12 }],
      restaurantName: 'ViaEats MSS',
    },
    idempotencyKey: `mss-${stamp}`,
    returnUrl: 'https://viaeats.se/cart?payment_return=mss',
    webhookUrl: process.env.SWISH_CALLBACK_URL || 'https://example.com/api/swishcb/paymentrequests',
  });

  assert.match(created.paymentRef, /^[0-9A-F]{32}$/);
  assert.ok(created.swishToken);
  assert.match(created.swishUrl || '', /^swish:\/\/paymentrequest\?/);
  assert.match(created.swishQrCode || '', /^data:image\/png;base64,/);

  let state = await swishProvider.getRemoteStatus(created.paymentRef);
  for (let attempt = 0; attempt < 8 && state.state === 'pending'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    state = await swishProvider.getRemoteStatus(created.paymentRef);
  }
  assert.ok(['paid', 'failed', 'canceled', 'pending'].includes(state.state));
  console.log(JSON.stringify({ ok: true, paymentRef: created.paymentRef, state: state.state }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
