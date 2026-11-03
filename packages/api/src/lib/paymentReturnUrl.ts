// Returadresser för betalningar. Utbrutet ur routes/payments.ts så att
// kontraktstesterna kan pröva det utan att starta routern.
import { getAllowedOrigins } from './config';
import { getPublicApiBaseUrl } from './launchReadiness';
import { restaurantDomainForOrigin } from './restaurantDomains';

function parseOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * PSP:n får bara skicka kunden tillbaka till våra egna origins. En godtycklig
 * returnUrl skulle annars göra betal-endpointen till en trovärdig open redirect.
 */
export function safePaymentReturnUrl(
  raw: unknown,
  channel: 'Web' | 'iOS' | 'Android',
): string | null {
  if (typeof raw !== 'string' || raw.length < 1 || raw.length > 2_048) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.username || parsed.password || parsed.hash) return null;

  const isLocalDev =
    process.env.NODE_ENV !== 'production' &&
    parsed.protocol === 'http:' &&
    ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !isLocalDev) return null;

  const allowedOrigins = new Set(
    [
      ...getAllowedOrigins(),
      getPublicApiBaseUrl(),
      process.env.FRONTEND_URL,
    ]
      .map(parseOrigin)
      .filter((origin): origin is string => Boolean(origin)),
  );
  if (!isLocalDev && !allowedOrigins.has(parsed.origin)) return null;

  // Native-apparna återvänder alltid via den neutrala API-bryggan, som i sin
  // tur öppnar viaeats://. Acceptera inte andra sidor bara för att domänen är vår.
  if (channel !== 'Web') {
    const nativeApiOrigins = new Set([
      'https://api.viaeats.se',
      parseOrigin(getPublicApiBaseUrl()),
    ].filter((origin): origin is string => Boolean(origin)));
    if (
      !nativeApiOrigins.has(parsed.origin) ||
      parsed.pathname !== '/api/payments/return' ||
      parsed.searchParams.get('app') !== 'viaeats'
    ) {
      return null;
    }
  }

  return parsed.toString();
}

/** Returadress på en restaurangdomän måste höra till orderns restaurang. */
export function paymentReturnMatchesRestaurant(returnUrl: string, restaurantSlug: string | null | undefined): boolean {
  const partner = restaurantDomainForOrigin(new URL(returnUrl).origin);
  return !partner || partner.restaurantSlug === restaurantSlug;
}
