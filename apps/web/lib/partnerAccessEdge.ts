/**
 * Partner-entré under prelaunch: kunder som kommer från en partnersajt
 * (t.ex. palmyrapizzeria.se) släpps förbi launch-grinden och får ett
 * Palmyra-scopat storefront (hemsidan visar bara partnerns restaurang).
 *
 * Entrén är en länk till partnerns restaurangsida med ?utm_source=partner
 * (samma parametrar som partner-embedden redan skickar). Middlewaren sätter
 * då en signerad cookie så att resten av beställningsflödet (cart, betalning,
 * tracking, konto) fungerar under grinden.
 *
 * Hela mekanismen är TILLFÄLLIG: när PRELAUNCH_MODE=0 är grinden öppen och
 * ingenting här används. Edge-säker (crypto.subtle) så samma kod går i både
 * middleware och server components.
 */

export const PARTNER_ACCESS_COOKIE = "viaeats_partner_access";

const DEFAULT_PARTNER_SLUGS = ["palmyra-pizzeria-lund"];

export function partnerBypassSlugs(): string[] {
  const raw = process.env.PARTNER_BYPASS_SLUGS || "";
  const fromEnv = raw
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_PARTNER_SLUGS;
}

async function hmacHex(message: string): Promise<string | null> {
  const secret = process.env.LAUNCH_ACCESS_COOKIE_SECRET || process.env.NEXTAUTH_SECRET || "";
  if (!secret) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Cookie-värde: "<slug>.<hmac(partner:<slug>)>" — slug läsbar, signaturen låser den. */
export async function signPartnerCookie(slug: string): Promise<string | null> {
  const signature = await hmacHex(`partner:${slug}`);
  return signature ? `${slug}.${signature}` : null;
}

/** Returnerar partner-slugen om cookien är giltig och slugen fortfarande är tillåten. */
export async function verifyPartnerCookie(value: string | undefined): Promise<string | null> {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const slug = value.slice(0, dot);
  if (!partnerBypassSlugs().includes(slug)) return null;
  const expected = await hmacHex(`partner:${slug}`);
  return expected && value.slice(dot + 1) === expected ? slug : null;
}

/**
 * Är detta en partner-entrélänk? Kräver både en tillåten partner-restaurang i
 * pathen och ?utm_source=partner så att en gissad restaurang-URL inte öppnar
 * grinden av sig själv.
 */
export function partnerEntrySlug(url: { pathname: string; searchParams: URLSearchParams }): string | null {
  if (url.searchParams.get("utm_source") !== "partner") return null;
  const match = url.pathname.match(/^\/restaurants\/([^/]+)\/?$/);
  if (!match) return null;
  const slug = decodeURIComponent(match[1]);
  return partnerBypassSlugs().includes(slug) ? slug : null;
}
