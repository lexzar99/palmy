export const ORDER_SESSION_COOKIE_PREFIX = "viaeats_order_";
export const ORDER_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const ORDER_SESSION_HEADER = "x-viaeats-order-session";
export const ORDER_SESSION_ID_HEADER = "x-viaeats-order-id";

// Order ids are currently cuid/uuid-like. Rejecting rather than encoding odd
// input keeps the cookie namespace deterministic and prevents cookie-name
// injection if an upstream ever returns a malformed id header.
export function orderSessionCookieName(orderId: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(orderId)) return null;
  return `${ORDER_SESSION_COOKIE_PREFIX}${orderId}`;
}

export const EMBED_CONTEXT_HEADER = "x-viaeats-embed";

/**
 * Partnersidan bäddar in kassan i en cross-site iframe. En SameSite=Lax-cookie
 * skickas aldrig i den kontexten, så orderns session försvann tyst: status,
 * abandon och tracking svarade 404 och avbryt-knappen kunde aldrig bekräftas.
 *
 * Den inbäddade varianten sätts därför som SameSite=None + Partitioned (CHIPS).
 * Den förblir HttpOnly och binds till partitionen partnersida × viaeats, så
 * den kan varken läsas av JavaScript eller återanvändas som spårande
 * tredjepartscookie. Den vanliga viaeats.se-kassan behåller Lax.
 */
export function getOrderSessionCookieOptions(options: { embedded?: boolean } = {}) {
  const secure = process.env.NODE_ENV === "production";
  const base = {
    httpOnly: true,
    path: "/api/platform",
    maxAge: ORDER_SESSION_MAX_AGE_SECONDS,
  };
  // SameSite=None kräver Secure. Lokal http-utveckling faller därför tillbaka
  // på Lax, där iframe:n ändå är same-site.
  if (options.embedded && secure) {
    return { ...base, sameSite: "none" as const, secure: true, partitioned: true };
  }
  return { ...base, sameSite: "lax" as const, secure };
}
