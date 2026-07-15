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

export function getOrderSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/api/platform",
    maxAge: ORDER_SESSION_MAX_AGE_SECONDS,
  };
}
