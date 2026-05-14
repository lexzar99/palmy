// Sentry — browser-config för matgo.se kund-app. Init:as automatiskt
// av @sentry/nextjs när NEXT_PUBLIC_SENTRY_DSN finns satt.
//
// GDPR: Sentry är klassad som "analys/spårning" och kräver explicit samtycke.
// Vi initialiserar därför ENDAST om localStorage `matgo_cookie_consent`
// innehåller `"accepted"`. För `"essential-only"`, `"rejected"` eller saknat
// värde (banner inte visad än) skippar vi init helt.
//
// CookieConsent-komponenten kan trigga `dispatchEvent(new Event("matgo:cookie-consent"))`
// efter att användaren klickat Acceptera; då lazy-init:ar vi Sentry på den
// pågående sessionen utan att kräva en page-reload.
import * as Sentry from "@sentry/nextjs";

const CONSENT_KEY = "matgo_cookie_consent";

function initSentryClient() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  // Idempotent — undvik dubbel-init om event:et fires samma session som
  // localStorage redan var "accepted".
  if (Sentry.getClient()) return;
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    sampleRate: 1.0,
    // Session replay endast vid error (privacy-first, kund-app)
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  });
}

function hasFullConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(CONSENT_KEY) === "accepted";
  } catch {
    return false;
  }
}

if (typeof window !== "undefined") {
  if (hasFullConsent()) {
    initSentryClient();
  } else {
    // Lyssna efter consent-event från CookieConsent-komponenten. Vi använder
    // `addEventListener` mot window så banner-komponenten kan dispatch:a när
    // användaren klickar "Acceptera alla" — Sentry init:as då lazy utan reload.
    window.addEventListener("matgo:cookie-consent", () => {
      if (hasFullConsent()) initSentryClient();
    });
  }
}

// Sentry v10 — kräver explicit export för att fånga route-transitions (navigations).
// Funktionen är en no-op när Sentry inte är init:ad så den är säker att
// alltid exportera.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
