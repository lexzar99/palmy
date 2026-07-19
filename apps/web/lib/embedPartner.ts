export const EMBED_PARENT_ORIGIN_PARAM = "parent_origin";
const EMBED_PARENT_ORIGIN_SESSION_KEY = "viaeats_embed_parent_origin_v1";

const TRUSTED_PARTNER_ORIGINS = new Set([
  "https://palmyrapizzeria.se",
  "https://www.palmyrapizzeria.se",
  "http://localhost:3000",
  "http://localhost:4000",
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
