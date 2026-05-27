"use client";

const PLATFORM_SESSION_CHANGED_EVENT = "platform-session-changed";

function emitPlatformSessionChanged() {
  window.dispatchEvent(new Event(PLATFORM_SESSION_CHANGED_EVENT));
}

export function clearLegacyPlatformUserToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("platform_user_token");
}

// Rensar localStorage-data som är knuten till en specifik inloggad användare
// (PII, sparade adresser, gäst-kontaktfält, kund-anteckningar). Kallas vid
// logout så nästa person som använder samma device inte ser föregående
// användares saved addresses i cart-vyn (privacy-läckaget A12 Linnea fann).
// Behåller preferences (theme, locale) och visited-flags som är device-state,
// inte user-state. Behåller också pending_order_id/token så aktiva
// betalnings-flöden kan recoveras — de rensas separat efter Stripe-callback.
const USER_DATA_LOCAL_KEYS = [
  "platform_quick_addresses",
  "platform_address",
  "platform_address_error",
  "platform_city",
  "platform_coords",
  "platform_pickup_city",
  "guest_name",
  "guest_email",
  "guest_phone",
  "cart_note",
];

export function clearPlatformLocalUserData() {
  if (typeof window === "undefined") return;
  for (const key of USER_DATA_LOCAL_KEYS) {
    window.localStorage.removeItem(key);
  }
}

export async function persistPlatformSession(token: string) {
  const response = await fetch("/api/platform/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    throw new Error("Kunde inte skapa session");
  }

  clearLegacyPlatformUserToken();
  emitPlatformSessionChanged();
}

export async function clearPlatformSession() {
  await fetch("/api/platform/session", {
    method: "DELETE",
  });

  clearLegacyPlatformUserToken();
  clearPlatformLocalUserData();
  emitPlatformSessionChanged();
}

export async function getPlatformSessionStatus() {
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
