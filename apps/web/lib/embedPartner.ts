export const EMBED_PARENT_ORIGIN_PARAM = "parent_origin";
const EMBED_PARENT_ORIGIN_SESSION_KEY = "viaeats_embed_parent_origin_v1";

const TRUSTED_PARTNER_ORIGINS = new Set([
  "https://palmyrapizzeria.se",
  "https://www.palmyrapizzeria.se",
  "http://localhost:3000",
  "http://localhost:4000",
]);

const PARTNER_ORIGIN_BY_RESTAURANT = new Map([
  ["palmyra-pizzeria-lund", "https://www.palmyrapizzeria.se"],
]);

export function trustedPartnerOrigin(candidate: unknown): string | null {
  if (typeof candidate !== "string" || !candidate || candidate.length > 256) return null;
  try {
    const origin = new URL(candidate).origin;
    return TRUSTED_PARTNER_ORIGINS.has(origin) ? origin : null;
  } catch {
    return null;
  }
}

export function rememberEmbedParentOrigin(candidate: unknown): string | null {
  const origin = trustedPartnerOrigin(candidate);
  if (!origin || typeof window === "undefined") return origin;
  try { window.sessionStorage.setItem(EMBED_PARENT_ORIGIN_SESSION_KEY, origin); } catch { /* noop */ }
  return origin;
}

export function readEmbedParentOrigin(): string | null {
  if (typeof window === "undefined") return null;
  const fromQuery = rememberEmbedParentOrigin(
    new URLSearchParams(window.location.search).get(EMBED_PARENT_ORIGIN_PARAM),
  );
  if (fromQuery) return fromQuery;
  try {
    return trustedPartnerOrigin(window.sessionStorage.getItem(EMBED_PARENT_ORIGIN_SESSION_KEY));
  } catch {
    return null;
  }
}

// Partnersidan ber om en tillbaka-knapp via ?back=1 på första iframe-URL:en.
// Flaggan sparas per flik så att den följer med till kassan och spårningen.
const EMBED_BACK_PARAM = "back";
const EMBED_BACK_SESSION_KEY = "viaeats_embed_back_v1";

export function readEmbedBackEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get(EMBED_BACK_PARAM) === "1") {
      window.sessionStorage.setItem(EMBED_BACK_SESSION_KEY, "1");
      return true;
    }
    return window.sessionStorage.getItem(EMBED_BACK_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

/** Ber partnersidan (embed.js) att navigera till sin egen tillbaka-adress. */
// Meddelandet bär ingen data, så "*" är ofarligt när partnerns origin är okänd
// (t.ex. palmyrapizzeria.se utan www). embed.js bestämmer själv målet.
export function requestEmbedBack() {
  if (typeof window === "undefined" || window.parent === window) return;
  window.parent.postMessage({ type: "viaeats:navigate-back" }, readEmbedParentOrigin() || "*");
}

export function partnerOriginForRestaurant(restaurantSlug: unknown): string | null {
  if (typeof restaurantSlug !== "string") return null;
  return PARTNER_ORIGIN_BY_RESTAURANT.get(restaurantSlug.trim().toLowerCase()) || null;
}
