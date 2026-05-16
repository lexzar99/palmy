import axios from "axios";
import type { PublicDeal } from "../types";
import {
  EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_SOCKET_URL,
  EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  EXPO_PUBLIC_WEB_URL,
} from "./env";

export const API_URL = EXPO_PUBLIC_API_URL;
export const SOCKET_URL = EXPO_PUBLIC_SOCKET_URL || API_URL;
export const WEB_URL = EXPO_PUBLIC_WEB_URL;
export const STRIPE_PUBLISHABLE_KEY = EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

// Lazy-registered handler for unauthorised responses. App.tsx calls
// `setUnauthorizedHandler` once at mount with a function that clears the
// auth store. We avoid importing the store directly here so this module
// stays import-cycle-free with the Zustand setup in store/useAppStore.
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler;
}

// Endpoints where 401 means "you tried something admin-only" rather than
// "your session is dead". Hitting one of these MUST NOT trigger global
// logout — historiskt kraschade detta checkout mid-flow: en post-payment
// refund-call till /api/payments/refund (admin-only) returnerade 401 →
// interceptorn nollade JWT → "debiterad men ordern kommer inte fram".
// Lägg till nya admin-routes som klienten kan råka anropa här.
const NON_SESSION_401_PATTERNS: RegExp[] = [
  /\/api\/payments\/refund(?!-orphan)/, // matchar /refund men INTE /refund-orphan
];

function isNonSessionRoute(url: string | undefined): boolean {
  if (!url) return false;
  return NON_SESSION_401_PATTERNS.some((re) => re.test(url));
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only log out on UNAUTHENTICATED responses to OUR auth-gated endpoints.
    // Routes that return 401 because of input validation aren't a session
    // issue — but our backend uses 401 only when auth is missing/expired/
    // soft-deleted, so we can treat every 401 as a "the session is dead".
    //
    // Undantag: vissa admin-routes (refund t.ex.) returnerar 401 om
    // klienten inte är admin — det är förväntat, inte ett session-fel.
    // Vi listar dem ovan så de inte triggar global utloggning.
    const url: string = error?.config?.url || error?.request?.responseURL || "";
    if (
      error?.response?.status === 401
      && unauthorizedHandler
      && !isNonSessionRoute(url)
    ) {
      try { unauthorizedHandler(); } catch {}
    }
    return Promise.reject(error);
  },
);

export function getImageUrl(path?: string | null) {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("data:")) return path;
  if (path.startsWith("/")) return `${API_URL}${path}`;
  return `${API_URL}/${path}`;
}

export function formatDealReward(deal: PublicDeal) {
  if (deal.discountType === "FIXED") {
    return `${deal.discountValue} kr rabatt`;
  }
  return `${deal.discountValue}% rabatt`;
}
