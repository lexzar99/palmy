/**
 * Delad läsning av cookiesamtycket.
 *
 * Värdet skrivs av `components/CookieConsent.tsx` till både
 * `localStorage.viaeats_cookie_consent` och en cookie med samma namn, och
 * ändringar aviseras med window-eventet `viaeats:cookie-consent`.
 *
 * Allt som laddar tredjepartsskript (Sentry, Meta-pixeln) ska läsa härifrån och
 * bara starta vid `"accepted"`. Integritetspolicyn lovar kunden exakt det.
 */

export type Consent = "accepted" | "essential-only" | "rejected";

export const CONSENT_STORAGE_KEY = "viaeats_cookie_consent";
export const CONSENT_COOKIE_NAME = CONSENT_STORAGE_KEY;
export const CONSENT_EVENT = "viaeats:cookie-consent";
export const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function normalizeConsent(value: string | null | undefined): Consent | null {
  if (value === "accepted" || value === "essential-only" || value === "rejected") return value;
  // Backåtkomp: gamla bannern lagrade "true" — behandla som "accepted".
  if (value === "true") return "accepted";
  return null;
}

export function readStoredConsent(): Consent | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizeConsent(window.localStorage.getItem(CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function readCookieConsent(): Consent | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${CONSENT_COOKIE_NAME}=`));
  if (!match) return null;
  return normalizeConsent(decodeURIComponent(match.split("=").slice(1).join("=")));
}

export function readConsent(): Consent | null {
  return readStoredConsent() ?? readCookieConsent();
}

export function subscribeConsent(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(CONSENT_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CONSENT_EVENT, callback);
  };
}

/** True först när kunden aktivt har godkänt analys och marknadsföring. */
export function hasMarketingConsent(): boolean {
  return readConsent() === "accepted";
}
