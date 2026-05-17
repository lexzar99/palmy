import axios from "axios";

// Global axios-default: 8 sekunders timeout istället för 0 (oändlig).
// På 3G/flakey-nät innebar oändliga timeouts att checkout-POSTs och
// order-tracking-fetches kunde hänga 60+ sek utan att kunden förstod
// att något var trasigt — bara en evig spinner. 8s är generöst nog för
// normala backend-anrop och kort nog för att felmeddelandet ska komma
// innan kunden ger upp.
//
// Stripe.confirmPayment har sin egen 30s timeout (i StripeCheckout.tsx)
// och påverkas inte av denna global default.
//
// Sätts ENDAST på klient-sidan eftersom server-komponenter (proxy via
// /api/platform/[...path]) använder native fetch och inte axios.
if (typeof window !== "undefined" && axios.defaults.timeout === 0) {
  axios.defaults.timeout = 8000;
}

export const getApiUrl = () => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  // Final fallback (production)
  if (process.env.NODE_ENV === "production" || (typeof window !== "undefined" && !window.location.hostname.includes("localhost"))) {
    return "https://palmy-production-2021.up.railway.app";
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
  // try to connect to http://matgo-web-pi.vercel.app:4000 (wrong, no HTTPS).
  if (process.env.NODE_ENV === "production" || (typeof window !== "undefined" && !window.location.hostname.includes("localhost"))) {
    return "https://palmy-production-2021.up.railway.app";
  }

  if (typeof window !== "undefined") {
    return `http://${window.location.hostname}:4000`;
  }

  return "http://localhost:4000";
};

export const API_URL = getApiUrl();
export const SOCKET_URL = getSocketUrl();

