/**
 * Provider-väljare. Aktiv PSP styrs av env PAYMENT_PROVIDER (default: mollie).
 * Byte till adyen/stripe = lägg till providern + flippa env, inga route-ändringar.
 */
import type { PaymentProvider } from './types';
import { mollieProvider } from './mollie';
import { adyenProvider } from './adyen';

export type { PaymentProvider } from './types';
export type { OrderForPayment } from './types';

export function getPaymentProvider(): PaymentProvider {
  const name = (process.env.PAYMENT_PROVIDER || 'mollie').toLowerCase();
  switch (name) {
    case 'mollie':
      return mollieProvider;
    case 'adyen':
      return adyenProvider; // ligger kvar för jämförelse/återgång, ej aktiv vid lansering
    // case 'stripe': return stripeProvider; // gammal Stripe-kod ligger kvar (RN), provider-stub ej byggd
    default:
      console.warn(`[payments] okänd PAYMENT_PROVIDER "${name}" — faller tillbaka på mollie`);
      return mollieProvider;
  }
}
