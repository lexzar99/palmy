/**
 * Kundresan — rapporterar vad besökaren gör så vi kan se var flödet tar slut.
 *
 * Två regler styr all kod här:
 *
 *  1. Spårning får aldrig påverka kunden. Varje anrop är eld-och-glöm, inget
 *     await:as i ett flöde, och allt är inlindat i try/catch. Går mätningen
 *     sönder ska beställningen ändå gå fram.
 *  2. Besökaren är anonym tills hon skriver sitt nummer i kassan. Ett
 *     sessions-id i localStorage binder ihop stegen dessförinnan; servern
 *     skriver numret bakåt på sessionen när det blir känt.
 */

import { API_URL } from "@/lib/api";

const SESSION_KEY = "viaeats_journey_session";
const UTM_KEY = "viaeats_journey_utm";

export type JourneyStep =
  | "LANDED"
  | "RESTAURANT_VIEWED"
  | "PRODUCT_VIEWED"
  | "ADDED_TO_CART"
  | "CART_OPENED"
  | "ORDER_TYPE_CHOSEN"
  | "ADDRESS_ACCEPTED"
  | "ADDRESS_REJECTED"
  | "CONTACT_ENTERED"
  | "PAYMENT_STARTED"
  | "ORDER_PLACED"
  | "PAYMENT_FAILED";

type JourneyPayload = {
  restaurantId?: string | null;
  productId?: string | null;
  orderId?: string | null;
  phone?: string | null;
  email?: string | null;
  meta?: Record<string, unknown>;
};

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* äldre webbläsare */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Sessions-id:t. Skapas vid första steget och lever tills lagringen rensas. */
export function journeySessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = randomId();
    window.localStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    // Privat läge eller blockerad lagring: utan id går stegen inte att koppla
    // ihop, och en session av ett steg är brus. Hoppa hellre över mätningen.
    return null;
  }
}

/**
 * Fångar kampanjmärkningen vid landningen och behåller den genom besöket.
 * Utan det försvinner utm_source så fort kunden klickar vidare, och en order
 * kan inte tillskrivas mejlet som drev in henne.
 */
function rememberUtm(): { utmSource?: string; utmCampaign?: string } {
  if (typeof window === "undefined") return {};
  try {
    const params = new URLSearchParams(window.location.search);
    const source = params.get("utm_source");
    const campaign = params.get("utm_campaign");
    if (source || campaign) {
      const value = JSON.stringify({ utmSource: source || undefined, utmCampaign: campaign || undefined });
      window.localStorage.setItem(UTM_KEY, value);
      return JSON.parse(value);
    }
    const stored = window.localStorage.getItem(UTM_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

/**
 * Rapporterar ett steg. Väntar aldrig, kastar aldrig.
 *
 * `keepalive` gör att anropet överlever att sidan byts eller stängs — annars
 * tappas just de steg som föregår ett avhopp, vilket är exakt de vi vill se.
 */
export function trackJourney(step: JourneyStep, payload: JourneyPayload = {}): void {
  if (typeof window === "undefined") return;
  try {
    const sessionId = journeySessionId();
    if (!sessionId) return;

    const body = JSON.stringify({
      sessionId,
      step,
      ...rememberUtm(),
      ...(payload.restaurantId ? { restaurantId: payload.restaurantId } : {}),
      ...(payload.productId ? { productId: payload.productId } : {}),
      ...(payload.orderId ? { orderId: payload.orderId } : {}),
      ...(payload.phone ? { phone: payload.phone } : {}),
      ...(payload.email ? { email: payload.email } : {}),
      ...(payload.meta ? { meta: payload.meta } : {}),
    });

    void fetch(`${API_URL}/api/journey`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => { /* mätning får aldrig störa kunden */ });
  } catch {
    /* mätning får aldrig störa kunden */
  }
}
