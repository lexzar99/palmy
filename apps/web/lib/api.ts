import axios from "axios";
import { getKioskAccessProof } from "@/lib/kioskAccessClient";

// Global axios-default: 25 sekunders timeout istället för 0 (oändlig).
// På 3G/flakey-nät innebar oändliga timeouts att checkout-POSTs och
// order-tracking-fetches kunde hänga 60+ sek utan att kunden förstod
// att något var trasigt — bara en evig spinner.
//
// Höjt från 12s till 25s 2026-05: Railway cold-starts + den första
// menyhämtningen (deep-nested Prisma include på /api/menu/categories)
// kunde nå ~15s totalt på ett kallt API. 12s lämnade restaurang-sidan
// med "Ett fel uppstod / Kunde inte ladda menyn" innan svaret kom. En
// in-memory TTL-cache på backend gör att andra-+ requests landar inom
// 50-300ms; första cold-start får mer marginal med 25s.
//
// Stripe.confirmPayment har sin egen 30s timeout (i StripeCheckout.tsx)
// och påverkas inte av denna global default.
//
// Sätts ENDAST på klient-sidan eftersom server-komponenter (proxy via
// /api/platform/[...path]) använder native fetch och inte axios.
if (typeof window !== "undefined" && axios.defaults.timeout === 0) {
  axios.defaults.timeout = 25000;
}

// Embedded partner pages can be treated as a third-party iframe by the
// browser, which means the HttpOnly kiosk cookie may not be sent. Attach the
// short-lived, restaurant-scoped proof to same-origin platform calls as a
// fallback. Never attach it to direct API_URL calls or unrelated routes.
if (typeof window !== "undefined") {
  axios.interceptors.request.use((config) => {
    const url = typeof config.url === "string" ? config.url : "";
    if (url.startsWith("/api/platform/")) {
      const proof = getKioskAccessProof();
      if (proof) {
        config.headers = config.headers || {};
        config.headers["x-viaeats-kiosk-access"] = proof;
      }
    }
    return config;
  });
}

export const getApiUrl = () => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  // Final fallback (production)
  if (process.env.NODE_ENV === "production" || (typeof window !== "undefined" && !window.location.hostname.includes("localhost"))) {
    return "https://api.viaeats.se";
  }

  // Fallback for client-side local dev
  if (typeof window !== "undefined") {
    return `http://${window.location.hostname}:4000`;
  }

  return "http://localhost:4000";
};

export const getSocketUrl = () => {
  if (process.env.NEXT_PUBLIC_SOCKET_URL) {
    return process.env.NEXT_PUBLIC_SOCKET_URL;
  }

  // Same production fallback as getApiUrl — without this the socket would
  // try to connect to http://viaeats-web-pi.vercel.app:4000 (wrong, no HTTPS).
  if (process.env.NODE_ENV === "production" || (typeof window !== "undefined" && !window.location.hostname.includes("localhost"))) {
    return "https://api.viaeats.se";
  }

  if (typeof window !== "undefined") {
    return `http://${window.location.hostname}:4000`;
  }

  return "http://localhost:4000";
};

export const API_URL = getApiUrl();
export const SOCKET_URL = getSocketUrl();

/**
 * Plockar serverns felmeddelande ur ett okänt fel (axios/fetch-form) utan
 * `any`. Läser `response.data.error` i första hand, sedan `.message`,
 * annars fallback. Används i catch-block över hela web-appen.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as {
    response?: { data?: { error?: unknown; message?: unknown } };
    message?: unknown;
  } | null;
  const msg = e?.response?.data?.error ?? e?.response?.data?.message;
  if (typeof msg === "string" && msg) return msg;
  return fallback;
}
