/**
 * Provider-väljare. Nya produktionsbetalningar är låsta till Mollie.
 * Stripe/Adyen finns kvar enbart för att läsa, stämma av och återbetala äldre
 * order via orderns sparade provider.
 */
import type { PaymentProvider } from './types';
import { mollieProvider } from './mollie';
import { adyenProvider } from './adyen';
import { stripeProvider } from './stripe';
import { swishProvider } from './swish';
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
    case 'swish':
      return swishProvider;
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

export function configuredCheckoutProviderNames(): PaymentProviderName[] {
  const fallback = String(process.env.PAYMENT_PROVIDER || 'mollie').toLowerCase();
  const configured = String(process.env.PAYMENT_PROVIDERS || fallback)
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name): name is PaymentProviderName =>
      name === 'mollie' || name === 'stripe' || name === 'adyen' || name === 'swish');
  return [...new Set(configured)];
}

export function getCheckoutPaymentProvider(name?: unknown): PaymentProvider {
  const requested = String(name || process.env.PAYMENT_PROVIDER || 'mollie').trim().toLowerCase();
  const allowed = configuredCheckoutProviderNames();
  if (!allowed.includes(requested as PaymentProviderName)) {
    throw new Error(`Betalningsleverantören ${requested} är inte aktiverad`);
  }
  return getPaymentProviderByName(requested as PaymentProviderName);
}
