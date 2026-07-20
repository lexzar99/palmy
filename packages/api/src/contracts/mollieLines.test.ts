import assert from 'node:assert/strict';
import { allocateDiscount, buildMollieLines } from '../lib/payments/mollieLines';
import type { OrderForPayment } from '../lib/payments/types';
import { calculateOrderVat, normalizeFoodVatPercent } from '../lib/tax';

const baseOrder = (overrides: Partial<OrderForPayment> = {}): OrderForPayment => ({
  id: 'order-1',
  orderNumber: 'VE-1001-AA',
  total: 16_900,
  deliveryFee: 3_900,
  discountAmount: 0,
  foodDiscountAmount: 0,
  deliveryDiscountAmount: 0,
  smallOrderFee: 0,
  foodVatPercent: 6,
  deliveryVatPercent: 25,
  tipAmount: 1_000,
  customerName: 'Test Kund',
  customerEmail: 'test@example.com',
  customerPhone: '46700000000',
  deliveryStreet: 'Testgatan 1',
  deliveryCity: 'Lund',
  deliveryZip: '22222',
  items: [{ productName: 'Pizza', quantity: 1, subtotal: 12_000, vatPercent: 6 }],
  restaurantName: 'Testrestaurang',
  ...overrides,
});

const ore = (value: string) => Math.round(Number(value) * 100);
const sumLines = (lines: ReturnType<typeof buildMollieLines>) =>
  lines.reduce((sum, line) => sum + ore(line.totalAmount.value), 0);

{
  const lines = buildMollieLines(baseOrder());
  assert.equal(sumLines(lines), 16_900);
  assert.equal(lines[0].vatRate, '6.00');
  assert.equal(lines[0].vatAmount?.value, '6.79');
  assert.equal(lines[1].type, 'shipping_fee');
  assert.equal(lines[1].vatRate, '25.00');
  assert.equal(lines[1].vatAmount?.value, '7.80');
  assert.equal(lines[2].description, 'Frivillig dricks till leveransperson');
  assert.equal(lines[2].vatRate, undefined);
}

{
  const order = baseOrder({
    items: [
      { productName: 'Mat', quantity: 1, subtotal: 10_000, vatPercent: 6 },
      { productName: 'Vin', quantity: 1, subtotal: 5_000, vatPercent: 25 },
    ],
    foodDiscountAmount: 3_000,
    deliveryDiscountAmount: 3_900,
    discountAmount: 6_900,
    smallOrderFee: 500,
    total: 13_500,
  });
  const lines = buildMollieLines(order);
  assert.equal(sumLines(lines), order.total);
  assert.equal(lines[0].discountAmount?.value, '20.00');
  assert.equal(lines[0].totalAmount.value, '80.00');
  assert.equal(lines[1].discountAmount?.value, '10.00');
  assert.equal(lines[1].totalAmount.value, '40.00');
  assert.equal(lines[2].discountAmount?.value, '39.00');
  assert.equal(lines[2].totalAmount.value, '0.00');
  assert.equal(lines[3].description, 'Komplettering till minsta ordervärde');
}

assert.deepEqual(allocateDiscount(1, [1, 1, 1]), [1, 0, 0]);
assert.deepEqual(allocateDiscount(100, [100, 300]), [25, 75]);

// Legacy restaurant/order snapshots with food VAT 0 must render as the
// platform's prepared-food default, while a product-level 0 override remains
// valid on an otherwise correctly taxed order.
assert.equal(normalizeFoodVatPercent(0, 6), 6);
assert.deepEqual(
  calculateOrderVat({
    foodVatPercent: 0,
    deliveryVatPercent: 25,
    items: [{ subtotal: 28_300, vatPercent: 0 }],
  }).breakdown,
  [{ rate: 6, grossOre: 28_300, vatOre: 1_602 }],
);
assert.deepEqual(
  calculateOrderVat({
    foodVatPercent: 6,
    items: [{ subtotal: 1_000, vatPercent: 0 }],
  }).breakdown,
  [{ rate: 0, grossOre: 1_000, vatOre: 0 }],
);

assert.throws(
  () => buildMollieLines(baseOrder({ foodDiscountAmount: 100, discountAmount: 0 })),
  /rabattkomponenter/,
);
assert.throws(
  () => buildMollieLines(baseOrder({ deliveryDiscountAmount: 4_000, discountAmount: 4_000 })),
  /överstiger leveransavgiften/,
);

console.log('mollie line contracts: ok');
