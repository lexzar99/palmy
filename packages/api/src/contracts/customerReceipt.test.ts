import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildCustomerReceipt,
  customerReceiptAccess,
  formatKr,
  renderCustomerReceiptPdf,
  swedishVatNumber,
} from '../lib/customerReceipt';
import { issueOrderAccessProof, issueOrderEmbedKey, issueOrderHttpSession } from '../lib/orderAccess';

const orderId = 'ckreceipt000000000000001';
const settings = {
  companyName: 'Säljarbolaget AB',
  organizationNumber: '556000-0000',
  companyAddress: 'Gatan 1\n222 22 Lund',
  supportEmail: 'hej@example.se',
};
const restaurant = {
  name: 'Testpizzerian',
  legalName: 'Testpizzerian i Lund AB',
  organizationNumber: '559000-0000',
  address: 'Torget 2',
  zip: '222 21',
  city: 'Lund',
  selfDelivery: false,
};

const baseOrder = {
  id: orderId,
  orderNumber: 'VE-1001',
  createdAt: new Date('2026-11-03T17:45:00.000Z'),
  type: 'DELIVERY',
  paymentStatus: 'PAID',
  paymentMethod: 'SWISH',
  paymentProvider: 'swish',
  customerName: 'Kim – viaeats',
  foodVatPercent: 12,
  deliveryVatPercent: 25,
  restaurant,
  items: [
    { productName: 'Margherita', quantity: 2, subtotal: 19800, vatPercent: 12, selectedExtras: JSON.stringify([{ extraName: 'Extra ost', priceAddon: 10, quantity: 1 }]) },
    { productName: 'Läsk', quantity: 1, subtotal: 2500, vatPercent: 12, selectedExtras: '[]' },
  ],
  discountAmount: 2230,
  foodDiscountAmount: 2230,
  deliveryDiscountAmount: 0,
  deliveryFee: 3900,
  smallOrderFee: 0,
  tipAmount: 1000,
  total: 19800 + 2500 - 2230 + 3900 + 1000,
};

// ── Moms per sats och avrundning i ören ──
{
  const receipt = buildCustomerReceipt(baseOrder, settings);
  assert.equal(receipt.amountMismatchOre, 0, 'kvittots delar går jämnt upp mot debiterat belopp');
  assert.deepEqual(receipt.vat.map((row) => row.rate), [12, 25], 'en rad per skattesats, stigande');
  const food = receipt.vat.find((row) => row.rate === 12)!;
  const delivery = receipt.vat.find((row) => row.rate === 25)!;
  // Rabatten minskar matens underlag innan momsen räknas.
  assert.equal(food.grossOre, 19800 + 2500 - 2230);
  assert.equal(food.vatOre, Math.round((20070 * 12) / 112), 'moms 12 % avrundas till närmaste öre');
  assert.equal(food.vatOre, 2150);
  assert.equal(delivery.grossOre, 3900);
  assert.equal(delivery.vatOre, 780);
  for (const row of receipt.vat) {
    assert.equal(row.netOre + row.vatOre, row.grossOre, 'exkl. moms + moms = inkl. moms per sats');
    assert.ok(Number.isInteger(row.vatOre) && Number.isInteger(row.netOre), 'bara hela ören');
  }
  assert.equal(receipt.totalVatOre, 2150 + 780, 'total moms är summan av raderna');
  assert.equal(
    receipt.vat.reduce((sum, row) => sum + row.grossOre, 0) + receipt.tipOre,
    receipt.totalOre,
    'dricksen ligger utanför momsunderlaget',
  );
  assert.equal(receipt.deliveryVatRate, 25);
  assert.deepEqual(receipt.lines.map((line) => line.vatRate), [12, 12]);
  assert.deepEqual(receipt.lines[0].extras, [{ name: 'Extra ost', quantity: 1, priceOre: 1000 }]);
  assert.equal(receipt.customerName, 'Kim', 'kanalmärkningen är bara för admin');
  assert.equal(receipt.paymentMethod, 'Swish');
}

// Egen leverans följer matens sats, rabatt på leveransen minskar 25 %-underlaget.
{
  const receipt = buildCustomerReceipt({
    ...baseOrder,
    restaurant: { ...restaurant, selfDelivery: true },
    deliveryVatPercent: 12,
    discountAmount: 2230 + 900,
    deliveryDiscountAmount: 900,
    total: baseOrder.total - 900,
  }, settings);
  assert.equal(receipt.amountMismatchOre, 0);
  assert.deepEqual(receipt.vat.map((row) => row.rate), [12]);
  assert.equal(receipt.vat[0].grossOre, 20070 + 3000);
  assert.equal(receipt.vat[0].vatOre, Math.round((23070 * 12) / 112));
}

// Proportionell rabatt över två satser tappar eller skapar inga ören.
{
  const receipt = buildCustomerReceipt({
    ...baseOrder,
    items: [
      { productName: 'A', quantity: 1, subtotal: 3333, vatPercent: 12, selectedExtras: '[]' },
      { productName: 'B', quantity: 1, subtotal: 3334, vatPercent: 25, selectedExtras: '[]' },
    ],
    discountAmount: 1001,
    foodDiscountAmount: 1001,
    deliveryFee: 0,
    tipAmount: 0,
    total: 3333 + 3334 - 1001,
  }, settings);
  assert.equal(receipt.amountMismatchOre, 0);
  assert.equal(receipt.vat.reduce((sum, row) => sum + row.grossOre, 0), 5666);
}

// Gamla ordrar med ogiltig matmoms 0 % visar aldrig "Moms 0 %".
{
  const receipt = buildCustomerReceipt({ ...baseOrder, foodVatPercent: 0, deliveryVatPercent: 0, items: baseOrder.items.map((item) => ({ ...item, vatPercent: 0 })) }, settings);
  assert.ok(receipt.vat.every((row) => row.rate > 0));
  assert.ok(receipt.lines.every((line) => line.vatRate === 6));
}

// ── Säljare, partner och saknade uppgifter ──
{
  const receipt = buildCustomerReceipt(baseOrder, settings);
  assert.equal(receipt.seller.name, 'Säljarbolaget AB', 'säljaren kommer från plattformens inställningar');
  assert.equal(receipt.seller.vatNumber, 'SE556000000001');
  assert.deepEqual(receipt.seller.address, ['Gatan 1', '222 22 Lund']);
  assert.equal(receipt.partner.name, 'Testpizzerian i Lund AB', 'restaurangen är partnern');
  assert.equal(receipt.partner.tradeName, 'Testpizzerian');
  assert.deepEqual(receipt.missing, []);

  const incomplete = buildCustomerReceipt({ ...baseOrder, restaurant: { ...restaurant, legalName: null, organizationNumber: '' } }, null);
  assert.equal(incomplete.seller.name, null, 'inget företagsnamn hårdkodas');
  assert.deepEqual(incomplete.missing, [
    'säljarens företagsnamn',
    'säljarens organisationsnummer',
    'säljarens adress',
    'restaurangens juridiska namn',
    'restaurangens organisationsnummer',
  ]);
}
assert.equal(swedishVatNumber('5560000000'), 'SE556000000001');
assert.equal(swedishVatNumber('16556000-0000'), 'SE556000000001');
assert.equal(swedishVatNumber('556000'), null);
assert.equal(swedishVatNumber(null), null);

// Återbetalning syns bara när betalningen faktiskt är återbetald.
{
  const refunded = buildCustomerReceipt({ ...baseOrder, paymentStatus: 'PARTIALLY_REFUNDED', refundAmount: 2500, refundedAt: new Date('2026-11-04T09:00:00Z') }, settings);
  assert.equal(refunded.refund?.amountOre, 2500);
  assert.equal(buildCustomerReceipt({ ...baseOrder, refundAmount: 2500 }, settings).refund, null);
}

assert.equal(formatKr(123456), '1 234,56 kr');
assert.equal(formatKr(-2230), '−22,30 kr');
assert.equal(formatKr(5), '0,05 kr');

// ── Åtkomst: samma ägarbevis som spårningen, aldrig kioskbevis ──
{
  const order = { id: orderId, userId: 'user-1', paymentStatus: 'PAID' };
  const deny = { orderSessionHeader: undefined, nativeSessionOwned: false, callerUserId: null };
  assert.equal(customerReceiptAccess({ order, ...deny }), 'not_found');
  assert.equal(customerReceiptAccess({ order, ...deny, orderSessionHeader: issueOrderHttpSession(orderId) }), 'ok');
  assert.equal(customerReceiptAccess({ order, ...deny, orderSessionHeader: issueOrderEmbedKey(orderId) }), 'ok', 'embeddens ordernyckel räcker');
  assert.equal(customerReceiptAccess({ order, ...deny, orderSessionHeader: issueOrderHttpSession('ckotherorder000000000001') }), 'not_found', 'bevis för en annan order');
  assert.equal(customerReceiptAccess({ order, ...deny, orderSessionHeader: issueOrderAccessProof(orderId) }), 'not_found', 'socketbeviset är inget kvittobevis');
  assert.equal(customerReceiptAccess({ order, ...deny, orderSessionHeader: 'skräp' }), 'not_found');
  assert.equal(customerReceiptAccess({ order, ...deny, nativeSessionOwned: true }), 'ok');
  assert.equal(customerReceiptAccess({ order, ...deny, callerUserId: 'user-1' }), 'ok');
  assert.equal(customerReceiptAccess({ order, ...deny, callerUserId: 'user-2' }), 'not_found');
  assert.equal(customerReceiptAccess({ order: { ...order, userId: null }, ...deny, callerUserId: 'user-1' }), 'not_found');
  for (const status of ['PENDING', 'FAILED', 'CANCELED']) {
    assert.equal(customerReceiptAccess({ order: { ...order, paymentStatus: status }, ...deny, callerUserId: 'user-1' }), 'not_paid');
  }
  assert.equal(customerReceiptAccess({ order: { ...order, paymentStatus: 'REFUNDED' }, ...deny, callerUserId: 'user-1' }), 'ok');
}

// Routen använder åtkomstkontrollen och aldrig kioskbeviset.
{
  const source = readFileSync(path.join(__dirname, '../routes/orders.ts'), 'utf8');
  const start = source.indexOf("router.get('/:id/receipt.pdf'");
  assert.ok(start > 0, 'kvittoroutern finns');
  const route = source.slice(start, source.indexOf('\nrouter.', start + 10));
  assert.match(route, /customerReceiptAccess\(/);
  assert.match(route, /buildCustomerReceipt\(order, settings\)/);
  assert.doesNotMatch(route, /kiosk/i, 'kioskbevis ger aldrig kvitto');
  assert.match(route, /application\/pdf/);
}

// ── PDF:en ──
void (async () => {
  const receipt = buildCustomerReceipt(baseOrder, settings);
  const pdf = await renderCustomerReceiptPdf(receipt);
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(pdf.length > 5000 && pdf.length < 400_000, `rimlig storlek (${pdf.length} byte)`);
  const again = await renderCustomerReceiptPdf(receipt);
  // pdfkit slumpar dokument-id:t; resten av filen ska vara stabil.
  const strip = (buffer: Buffer) => buffer.toString('latin1').replace(/\/ID \[<[0-9a-f]+> <[0-9a-f]+>\]/, '');
  assert.equal(strip(pdf), strip(again), 'samma order ger samma kvitto');

  const many = buildCustomerReceipt({
    ...baseOrder,
    items: Array.from({ length: 45 }, (_, index) => ({ productName: `Rätt ${index + 1}`, quantity: 1, subtotal: 10000, vatPercent: 12, selectedExtras: '[]' })),
    discountAmount: 0,
    foodDiscountAmount: 0,
    total: 450000 + 3900 + 1000,
  }, settings);
  const longPdf = await renderCustomerReceiptPdf(many);
  const pages = (longPdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
  assert.ok(pages >= 2, 'långa ordrar fortsätter på nästa sida');

  if (process.env.RECEIPT_SAMPLE_OUT) {
    writeFileSync(process.env.RECEIPT_SAMPLE_OUT, pdf);
    writeFileSync(process.env.RECEIPT_SAMPLE_OUT.replace(/\.pdf$/, '-lang.pdf'), longPdf);
    writeFileSync(
      process.env.RECEIPT_SAMPLE_OUT.replace(/\.pdf$/, '-ofullstandig.pdf'),
      await renderCustomerReceiptPdf(buildCustomerReceipt({ ...baseOrder, paymentStatus: 'PARTIALLY_REFUNDED', refundAmount: 2500, refundedAt: new Date('2026-11-04T09:00:00Z') }, null)),
    );
  }
  console.log('customerReceipt contracts OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
