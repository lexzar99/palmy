/**
 * Provider selector. New checkouts are restricted to PAYMENT_PROVIDERS;
 * historical rows always resolve through their frozen provider.
 */
import type { PaymentProvider, RemotePaymentStatus } from './types';
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
  switch (name) {
    case 'mollie':
      return getPaymentProviderByName('mollie');
    case 'adyen':
      return getPaymentProviderByName('adyen'); // ligger kvar för jämförelse/återgång, ej aktiv vid lansering
    case 'stripe':
      return getPaymentProviderByName('stripe');
    case 'swish':
      return getPaymentProviderByName('swish');
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

/**
 * Cancel an open PSP attempt with bounded canonical rereads. Cancel endpoints
 * are idempotent; PAID and terminal states always win, while an unknown state
 * is propagated so callers preserve the order instead of guessing FAILED.
 */
export async function cancelPaymentWithCanonicalRetry(
  provider: PaymentProvider,
  paymentRef: string,
  maxAttempts = 3,
): Promise<RemotePaymentStatus> {
  const terminal = (state: RemotePaymentStatus['state']) =>
    state === 'paid' || state === 'failed' || state === 'canceled' || state === 'expired';
  const attempts = Math.max(1, Math.min(3, Math.floor(maxAttempts) || 1));
  let lastKnown: RemotePaymentStatus | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      lastKnown = await provider.getRemoteStatus(paymentRef);
      if (terminal(lastKnown.state)) return lastKnown;
    } catch (error) {
      lastError = error;
      console.warn('[payments/cancel] Canonical status read failed before cancel', {
        provider: provider.name,
        paymentRef,
        attempt: attempt + 1,
        error: (error as Error)?.message,
      });
    }

    if (!provider.cancelPayment) continue;

    try {
      lastKnown = await provider.cancelPayment(paymentRef);
      if (terminal(lastKnown.state)) return lastKnown;
    } catch (error) {
      lastError = error;
      console.warn('[payments/cancel] PSP cancel failed; rereading canonical status', {
        provider: provider.name,
        paymentRef,
        attempt: attempt + 1,
        error: (error as Error)?.message,
      });
    }

    try {
      lastKnown = await provider.getRemoteStatus(paymentRef);
      if (terminal(lastKnown.state)) return lastKnown;
    } catch (error) {
      lastError = error;
      console.warn('[payments/cancel] Canonical status reread failed after cancel', {
        provider: provider.name,
        paymentRef,
        attempt: attempt + 1,
        error: (error as Error)?.message,
      });
    }
  }

  if (lastKnown) return lastKnown;
  throw lastError instanceof Error
    ? lastError
    : new Error(`Could not read canonical ${provider.name} payment status`);
}
