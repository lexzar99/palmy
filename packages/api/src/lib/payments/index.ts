/**
 * Provider-väljare. Aktiv PSP styrs av env PAYMENT_PROVIDER (default: mollie).
 * Byte till adyen/stripe = lägg till providern + flippa env, inga route-ändringar.
 */
import type { PaymentProvider } from './types';
import { mollieProvider } from './mollie';

export type { PaymentProvider } from './types';
export type { OrderForPayment } from './types';

export function getPaymentProvider(): PaymentProvider {
  const name = (process.env.PAYMENT_PROVIDER || 'mollie').toLowerCase();
  switch (name) {
    case 'mollie':
      return mollieProvider;
    // case 'adyen': return adyenProvider;   // byggs när Adyen-kontot finns
    // case 'stripe': return stripeProvider; // gammal Stripe-kod ligger kvar, bortkommenterad
    default:
      console.warn(`[payments] okänd PAYMENT_PROVIDER "${name}" — faller tillbaka på mollie`);
      return mollieProvider;
  }
}
