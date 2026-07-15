/**
 * Provider-väljare. Nya produktionsbetalningar är låsta till Mollie.
 * Stripe/Adyen finns kvar enbart för att läsa, stämma av och återbetala äldre
 * order via orderns sparade provider.
 */
import type { PaymentProvider } from './types';
import { mollieProvider } from './mollie';
import { adyenProvider } from './adyen';
import { stripeProvider } from './stripe';
import type { PaymentProviderName } from './finalize';

export type { PaymentProvider } from './types';
export type { OrderForPayment } from './types';

export function getPaymentProviderByName(name: PaymentProviderName): PaymentProvider {
  switch (name) {
    case 'mollie':
      return mollieProvider;
    case 'adyen':
      return adyenProvider;
    case 'stripe':
      return stripeProvider;
  }
}

export function getPaymentProvider(): PaymentProvider {
  const name = (process.env.PAYMENT_PROVIDER || 'mollie').toLowerCase();
  if (process.env.NODE_ENV === 'production' && name !== 'mollie') {
    throw new Error('Mollie måste vara aktiv PAYMENT_PROVIDER i produktion');
  }
  switch (name) {
    case 'mollie':
      return getPaymentProviderByName('mollie');
    case 'adyen':
      return getPaymentProviderByName('adyen'); // ligger kvar för jämförelse/återgång, ej aktiv vid lansering
    case 'stripe':
      return getPaymentProviderByName('stripe');
    default:
      throw new Error(`Okänd PAYMENT_PROVIDER: ${name}`);
  }
}
