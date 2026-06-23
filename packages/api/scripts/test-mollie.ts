/**
 * Sandbox-test av Mollie-providern (kör med test_-nyckel).
 *   pnpm --filter @palmyra/api exec ts-node --transpile-only scripts/test-mollie.ts
 *
 * Skapar en syntetisk order, anropar createPayment (verifierar att Klarna-rader
 * + billingAddress accepteras och summerar till total), hämtar checkout-URL och
 * läser tillbaka status. Rör ingen DB, flyttar inga riktiga pengar (test-mode).
 */
import 'dotenv/config';
import { mollieProvider } from '../src/lib/payments/mollie';
import type { OrderForPayment } from '../src/lib/payments/types';

async function main() {
  const order: OrderForPayment = {
    id: 'test-order-' + Date.now(),
    orderNumber: 'TEST-1001',
    total: 18900, // 189,00 kr — måste = summan av raderna nedan
    deliveryFee: 2900,
    discountAmount: 0,
    tipAmount: 0,
    customerName: 'Anna Andersson',
    customerEmail: 'anna@example.com',
    customerPhone: '0700000000',
    deliveryStreet: 'Testgatan 1',
    deliveryCity: 'Stockholm',
    deliveryZip: '11122',
    items: [
      { productName: 'Margherita', quantity: 2, subtotal: 13000 },
      { productName: 'Coca-Cola', quantity: 1, subtotal: 3000 },
    ],
    restaurantName: 'Palmyra Pizzeria',
  };

  console.log('▶ createPayment …');
  const res = await mollieProvider.createPayment({
    order,
    returnUrl: 'https://delivera.se/order/' + order.id,
  });
  console.log('  paymentRef :', res.paymentRef);
  console.log('  checkoutUrl:', res.checkoutUrl);

  console.log('▶ getRemoteStatus …');
  const status = await mollieProvider.getRemoteStatus(res.paymentRef);
  console.log('  status     :', JSON.stringify(status));

  console.log('\n✅ Mollie-flödet fungerar (skapa + checkout-URL + status).');
}

main().catch((e) => {
  console.error('\n❌ TEST FAILED:', e?.message || e);
  if (e?.field) console.error('   field:', e.field);
  process.exit(1);
});
