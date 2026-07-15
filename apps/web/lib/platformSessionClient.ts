"use client";

const PLATFORM_SESSION_CHANGED_EVENT = "platform-session-changed";
const LOGGED_OUT_KEY = "dlv_logged_out";
const LOGIN_INTENT_KEY = "dlv_login_intent";
const LOGGED_OUT_COOKIE = "viaeats_logged_out";
export const LAST_CUSTOMER_ID_KEY = "viaeats.lastCustomerId";

function emitPlatformSessionChanged() {
  window.dispatchEvent(new Event(PLATFORM_SESSION_CHANGED_EVENT));
}

export function clearLegacyPlatformUserToken() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem("platform_user_token");
  } catch {
    /* storage can be blocked; never abort the rest of the identity cleanup */
  }
}

// "Utloggad medvetet"-spärr. En kvarvarande Supabase-session (cookies som inte
// alltid rensas rent klient-sida) fick profil-bootstrappen att auto-byta tillbaka
// till inloggad direkt efter logout → flappning. Spärren stoppar auto-återinlogg
// tills användaren EXPLICIT loggar in igen (då rensas den).
function setBrowserLogoutSentinel(enabled: boolean) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = enabled
    ? `${LOGGED_OUT_COOKIE}=1; Path=/; Max-Age=2592000; SameSite=Lax${secure}`
    : `${LOGGED_OUT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

export function markLoggedOut() {
  try {
    window.localStorage.setItem(LOGGED_OUT_KEY, "1");
    window.localStorage.removeItem(LOGIN_INTENT_KEY);
  } catch { /* noop */ }
  setBrowserLogoutSentinel(true);
}
export function clearLoggedOutMark() {
  try {
    window.localStorage.removeItem(LOGGED_OUT_KEY);
    window.localStorage.removeItem(LOGIN_INTENT_KEY);
  } catch { /* noop */ }
  setBrowserLogoutSentinel(false);
}
export function isLoggedOutMark(): boolean {
  try { return window.localStorage.getItem(LOGGED_OUT_KEY) === "1"; } catch { return false; }
}

export function markExplicitLoginStarted() {
  try { window.localStorage.setItem(LOGIN_INTENT_KEY, "1"); } catch { /* noop */ }
}

export function hasExplicitLoginIntent(): boolean {
  try { return window.localStorage.getItem(LOGIN_INTENT_KEY) === "1"; } catch { return false; }
}

// Rensar localStorage-data som är knuten till en specifik kund. Det omfattar
// både PII och alla orderreferenser/ägarbevis/cachar; annars kan nästa person
// på samma enhet öppna föregående kunds order efter logout. Preferences
// (theme, locale) och visited-flags är device-state och behålls.
const USER_DATA_LOCAL_KEYS = [
  "platform_quick_addresses",
  "platform_address",
  "platform_address_error",
  "platform_city",
  "platform_coords",
  "platform_delivery_address",
  "platform_delivery_city",
  "platform_delivery_coords",
  "platform_delivery",
  "platform_pickup_city",
  "platform_order_type",
  "cart_order_type",
  "guest_name",
  "guest_email",
  "guest_phone",
  "cart_note",
  "platform_order_history",
  "offline_last_order",
  "offline_orders_list",
  "pending_order_id",
  "pending_order_token",
  "pending_order_phone",
  "viaeats.checkout.attempt.v1",
  "viaeats_active_order_id",
  "viaeats_active_order_token",
  "viaeats_active_order_phone",
  "viaeats_active_orders",
  "viaeats_dismissed_order_id",
  "viaeats_closed_order_seen_v1",
  "viaeats.activeUserDealId",
  "viaeats.activeUserDealSnapshot",
  "platform_favorites",
  "viaeats_favorites",
  "viaeats.skippedReviewOrderIds",
  "viaeats_preferred_payment_method_v1",
  "viaeats_claim_dismissed_at",
  LAST_CUSTOMER_ID_KEY,
  "viaeats-cart",
];

const USER_DATA_SESSION_KEYS = [
  // Dismissal gäller den inloggade kundens WELCOME/REFERRAL-banner, inte hela
  // browsern. En annan kund på samma flik ska få sin egen banner.
  "viaeats_welcome_banner_dismissed",
];

const USER_DATA_LOCAL_PREFIXES = [
  // Per-order push-prenumerationer är också kund/order-state. Nyckeln skapas
  // dynamiskt av webPushClient, så den kan inte listas statiskt ovan.
  "push_order_",
  // Kvittots nedladdningsräknare innehåller order-id i nyckeln.
  "receipt_dl_",
];

const CUSTOMER_STORAGE_EVENT_KEYS = [
  "viaeats_active_order_id",
  "viaeats_active_orders",
  "platform_order_history",
  "viaeats.activeUserDealId",
  "viaeats.activeUserDealSnapshot",
  "platform_favorites",
  "viaeats_favorites",
  "viaeats.skippedReviewOrderIds",
  "viaeats_preferred_payment_method_v1",
  "viaeats_claim_dismissed_at",
  "viaeats_welcome_banner_dismissed",
  LAST_CUSTOMER_ID_KEY,
  "viaeats-cart",
];

export function clearPlatformLocalUserData() {
  if (typeof window === "undefined") return;
  for (const key of USER_DATA_LOCAL_KEYS) {
    try { window.localStorage.removeItem(key); } catch { /* keep clearing in-memory UI */ }
  }
  for (const key of USER_DATA_SESSION_KEYS) {
    try { window.sessionStorage.removeItem(key); } catch { /* keep clearing in-memory UI */ }
  }
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key && USER_DATA_LOCAL_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        window.localStorage.removeItem(key);
      }
    }
  } catch { /* blocked storage cannot expose values to the app; still reset mounted state below */ }
  // `storage` skickas normalt bara till andra flikar. Dispatcha lokalt också
  // så monterade order-, deal-, review- och favoritvyer tappar föregående kund
  // omedelbart, även när identiteten byts utan en full sidladdning.
  for (const key of CUSTOMER_STORAGE_EVENT_KEYS) {
    try {
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: null }));
    } catch {
      /* äldre webview: polling blir fallback */
    }
  }
  // Favorites-storen har ett eget event som även fungerar i äldre webviews
  // där StorageEvent-konstruktorn saknas.
  window.dispatchEvent(new Event("viaeats:favorites-change"));
}

async function clearPlatformCustomerState() {
  // Remove persisted data synchronously first. If the Zustand module is already
  // mounted, also clear its in-memory state so the old cart cannot flash or be
  // written back after localStorage was cleaned.
  clearPlatformLocalUserData();
  try {
    const { useCartStore } = await import("@/store/cartStore");
    useCartStore.getState().clearCart();
    window.localStorage.removeItem("viaeats-cart");
  } catch {
    /* localStorage/module unavailable: the synchronous clear above still won */
  }
}

function readLastCustomerId(): string | null {
  try {
    const value = window.localStorage.getItem(LAST_CUSTOMER_ID_KEY)?.trim();
    return value && value.length <= 256 ? value : null;
  } catch {
    return null;
  }
}

function writeLastCustomerId(customerId: string) {
  try {
    window.localStorage.setItem(LAST_CUSTOMER_ID_KEY, customerId);
  } catch {
    /* continuity hint only; never an authorization credential */
  }
}

export async function persistPlatformSession(token: string) {
  const previousCustomerId = readLastCustomerId();
  const response = await fetch("/api/platform/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token, previousCustomerId }),
  });

  if (!response.ok) {
    throw new Error("Kunde inte skapa session");
  }

  const result = (await response.json().catch(() => ({}))) as {
    identityChanged?: boolean;
    clearCustomerState?: boolean;
    revokePush?: boolean;
    customerId?: string;
  };

  const clearCustomerState = result.clearCustomerState ?? result.identityChanged === true;
  const revokePush = result.revokePush ?? result.identityChanged === true;
  const customerId = typeof result.customerId === "string" && result.customerId.trim()
    ? result.customerId.trim()
    : null;

  if (revokePush) {
    // PushManager can survive both the HttpOnly cookie and localStorage. Revoke
    // independently from customer-data cleanup so first login keeps a guest cart
    // while a hidden subscription from an unknown identity still fails closed.
    const { unsubscribeWebPushForLogout } = await import("@/lib/webPushClient");
    await unsubscribeWebPushForLogout().catch(() => {});
  }
  if (clearCustomerState) await clearPlatformCustomerState();
  if (!customerId) {
    // A successful session response without the server-verified subject cannot
    // safely establish browser continuity. Clear locally before surfacing it.
    await clearPlatformCustomerState();
    throw new Error("Kundsessionen saknar verifierad identitet");
  }
  writeLastCustomerId(customerId);

  clearLegacyPlatformUserToken();
  clearLoggedOutMark();
  emitPlatformSessionChanged();
}

export async function clearPlatformSession() {
  // Synchronous browser sentinel first: even an offline/aborted DELETE can no
  // longer expose the still-stored HttpOnly cookie through the proxy.
  markLoggedOut();
  try {
    const { unsubscribeWebPushForLogout } = await import("@/lib/webPushClient");
    await unsubscribeWebPushForLogout().catch(() => {});
    await fetch("/api/platform/session", {
      method: "DELETE",
      keepalive: true,
    });
  } catch {
    // Offline/nätfel får inte avbryta klientens logout-state. LOGGED_OUT_KEY
    // blockerar den kvarvarande HttpOnly-cookien tills en explicit login sker.
  } finally {
    // Lokal logout får inte vara beroende av nätet. Även om cookie-anropet
    // misslyckas ska inga orderbevis eller kundcachar ligga kvar på enheten.
    clearLegacyPlatformUserToken();
    await clearPlatformCustomerState();
    emitPlatformSessionChanged();
  }
}

/**
 * Rotate only the account credential before an OAuth/Supabase exchange.
 * This is not a logout: order history, payment recovery and delivery address
 * must survive an ordinary session refresh.
 */
export async function clearPlatformSessionForRefresh() {
  // Keep the current HttpOnly token until POST /session atomically compares
  // old and new subjects. Same-user refresh preserves order recovery; a real
  // account switch clears cookies and local state in persistPlatformSession.
  clearLegacyPlatformUserToken();
}

export async function getPlatformSessionStatus() {
  if (typeof window !== "undefined" && isLoggedOutMark()) return false;
  try {
    const response = await fetch("/api/platform/session", {
      cache: "no-store",
    });

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as { authenticated?: boolean };
    return Boolean(data.authenticated);
  } catch {
    return false;
  }
}

export { PLATFORM_SESSION_CHANGED_EVENT };
