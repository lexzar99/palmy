/**
 * Sandbox-test av Adyen-providern (kör med ADYEN_*-test-credentials i .env).
 *   pnpm --filter @viaeats/api exec ts-node --transpile-only scripts/test-adyen.ts
 *
 * Skapar en Adyen-session för en syntetisk order och skriver ut session-id +
 * att sessionData kom tillbaka. Verifierar API-key, merchant account och
 * sessions-anropet. Rör ingen DB, flyttar inga riktiga pengar (test).
 */
import 'dotenv/config';
import { adyenProvider } from '../src/lib/payments/adyen';
import type { OrderForPayment } from '../src/lib/payments/types';

async function main() {
  const order: OrderForPayment = {
    id: 'test-order-' + Date.now(),
    orderNumber: 'TEST-2001',
    total: 18900, // 189,00 kr (öre) — måste = summan av raderna
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

  console.log('▶ createPayment (Adyen /sessions) …');
  console.log('  merchantAccount:', process.env.ADYEN_MERCHANT_ACCOUNT, '| env:', process.env.ADYEN_ENVIRONMENT);
  const res = await adyenProvider.createPayment({
    order,
    returnUrl: 'https://viaeats.se/order/' + order.id,
  });
  console.log('  session.id     :', res.session?.id);
  console.log('  sessionData    :', res.session?.sessionData ? `${res.session.sessionData.slice(0, 24)}… (${res.session.sessionData.length} tecken)` : '(saknas!)');
  console.log('\n✅ Adyen-sessionen skapades (id + sessionData). Drop-in kan monteras med dessa.');
}

main().catch((e) => {
  console.error('\n❌ TEST FAILED:', e?.message || e);
  if (e?.responseBody) console.error('   responseBody:', e.responseBody);
  process.exit(1);
});
