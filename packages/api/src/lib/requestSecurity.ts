const PAYMENT_WEBHOOK_PATHS = new Set([
  '/api/payments/webhook',
  '/api/payments/webhooks/stripe',
  '/api/payments/webhooks/mollie',
  '/api/payments/webhooks/adyen',
  '/api/payments/webhooks/swish',
]);

/** Signed PSP callbacks must not share browser/client rate-limit buckets. */
export function isPaymentWebhookRequest(method: string, originalUrl: string): boolean {
  if (method.toUpperCase() !== 'POST') return false;
  const pathname = originalUrl.split('?')[0].replace(/\/+$/, '') || '/';
  return PAYMENT_WEBHOOK_PATHS.has(pathname);
}

/** Read one cookie from a raw Socket.IO handshake header without exposing it to JS. */
export function cookieFromHeader(header: unknown, name: string): string | null {
  if (typeof header !== 'string' || !header || !name) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}
