// Sentry — browser-config för viaeats.se kund-app. Init:as automatiskt
// av @sentry/nextjs när NEXT_PUBLIC_SENTRY_DSN finns satt.
//
// GDPR: Sentry är klassad som "analys/spårning" och kräver explicit samtycke.
// Vi initialiserar därför ENDAST om localStorage `viaeats_cookie_consent`
// innehåller `"accepted"`. För `"essential-only"`, `"rejected"` eller saknat
// värde (banner inte visad än) skippar vi init helt.
//
// CookieConsent-komponenten kan trigga `dispatchEvent(new Event("viaeats:cookie-consent"))`
// efter att användaren klickat Acceptera; då lazy-init:ar vi Sentry på den
// pågående sessionen utan att kräva en page-reload.
import * as Sentry from "@sentry/nextjs";

const CONSENT_KEY = "viaeats_cookie_consent";

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
    integrations: [],
    // Brus från in-app-webbläsare, inte fel i viaeats.
    //
    // Facebooks och Instagrams Android-webbläsare injicerar ett eget
    // mätskript (`navigation_performance_logger_android`). När användaren
    // lämnar sidan rivs WebViewens JS→Java-brygga innan skriptets egen
    // beforeunload-hanterare hunnit köra, och det kastar "Java object is
    // gone". Felet sker under unload, inget går sönder för kunden, och vi
    // kan inte åtgärda kod vi inte äger.
    //
    // Det spelar roll just nu: all annonstrafik landar i exakt den
    // webbläsaren, så utan filtret dränks riktiga fel i det här bruset.
    ignoreErrors: [
      "Java object is gone",
      "Error invoking postMessage",
    ],
    denyUrls: [
      /navigation_performance_logger_android/i,
    ],
  });
  // Replay LAZY-laddas efter init (Sentry CDN) istället för statisk import —
  // den statiska referensen drog in ~50 kB gzip replay-kod i VARJE sidladdning.
  // Error-tracking funkar direkt; replay kopplas på när modulen kommit in.
  // Misslyckas CDN-hämtningen (offline/adblock) förblir error-tracking intakt.
  Sentry.lazyLoadIntegration("replayIntegration")
    .then((replayIntegration) => {
      Sentry.getClient()?.addIntegration(
        replayIntegration({ maskAllText: true, blockAllMedia: true }),
      );
    })
    .catch(() => {});
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
    window.addEventListener("viaeats:cookie-consent", () => {
      if (hasFullConsent()) initSentryClient();
    });
  }
}

// Sentry v10 — kräver explicit export för att fånga route-transitions (navigations).
// Funktionen är en no-op när Sentry inte är init:ad så den är säker att
// alltid exportera.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
