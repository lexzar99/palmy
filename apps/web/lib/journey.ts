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
const CHANNEL_KEY = "viaeats_journey_channel";

/**
 * Domänmönster → kanal. Ordningen spelar roll: `l.instagram.com` måste testas
 * före `facebook.com`, eftersom Metas länkomdirigering går via båda.
 *
 * Listan täcker det som faktiskt driver trafik till en svensk matleverans-
 * sajt. En okänd domän blir kanalen "Hänvisad" med domänen kvar i `referrer`,
 * så en ny källa syns i rapporten i stället för att försvinna i "Direkt".
 */
const CHANNEL_RULES: Array<{ match: RegExp; channel: string }> = [
  { match: /(^|\.)(mail\.google\.com|inbox\.google\.com)$/, channel: "Gmail" },
  { match: /(^|\.)(mail\.yahoo\.|outlook\.(live|office)\.com|mail\.proton)/, channel: "E-post" },
  { match: /(^|\.)(instagram\.com|ig\.me)$/, channel: "Instagram" },
  { match: /(^|\.)(facebook\.com|fb\.me|fb\.com|messenger\.com)$/, channel: "Facebook" },
  { match: /(^|\.)(tiktok\.com)$/, channel: "TikTok" },
  { match: /(^|\.)(google\.[a-z.]+|googleadservices\.com)$/, channel: "Google" },
  { match: /(^|\.)(bing\.com|duckduckgo\.com|ecosia\.org|yahoo\.com)$/, channel: "Annan sökmotor" },
  { match: /(^|\.)(snapchat\.com)$/, channel: "Snapchat" },
  { match: /(^|\.)(t\.co|x\.com|twitter\.com)$/, channel: "X" },
  { match: /(^|\.)(linkedin\.com|lnkd\.in)$/, channel: "LinkedIn" },
  { match: /(^|\.)(reddit\.com)$/, channel: "Reddit" },
  { match: /(^|\.)(youtube\.com|youtu\.be)$/, channel: "YouTube" },
];

/** Domäner som är vi själva — intern navigering är ingen trafikkälla. */
const EGNA_DOMANER = /(^|\.)(viaeats\.se|localhost)$/;

/**
 * Var besökaren kom ifrån.
 *
 * Prioritetsordning, och den spelar roll:
 *   1. `utm_source` — den enda signalen vi själva satt, och därmed den enda
 *      vi vet är sann. Mejlutskicket ska tillskrivas mejlet även om kunden
 *      öppnade länken i Gmails webbläsare.
 *   2. `fbclid` / `gclid` — annonsklick. Meta och Google strippar ofta
 *      referraren på annonstrafik, men klick-id:t överlever.
 *   3. Referrerns domän.
 *   4. Ingen referrer alls → "Direkt" (skrivet i adressfältet, bokmärke,
 *      eller en app som inte skickar referrer).
 */
function classifyChannel(): { channel: string; referrer: string | null } {
  if (typeof window === "undefined") return { channel: "Direkt", referrer: null };

  const params = new URLSearchParams(window.location.search);
  const utm = params.get("utm_source");
  let referrerHost: string | null = null;
  try {
    referrerHost = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : null;
  } catch {
    referrerHost = null;
  }

  if (utm) return { channel: utm, referrer: referrerHost };

  // Annonsklick: Meta och Google skickar ofta ingen referrer, men klick-id:t
  // finns i URL:en. Utan det hade all annonstrafik hamnat under "Direkt".
  if (params.get("fbclid")) return { channel: "Facebook/Instagram-annons", referrer: referrerHost };
  if (params.get("gclid")) return { channel: "Google-annons", referrer: referrerHost };

  if (!referrerHost) return { channel: "Direkt", referrer: null };
  if (EGNA_DOMANER.test(referrerHost)) return { channel: "Direkt", referrer: referrerHost };

  for (const rule of CHANNEL_RULES) {
    if (rule.match.test(referrerHost)) return { channel: rule.channel, referrer: referrerHost };
  }
  return { channel: "Hänvisad", referrer: referrerHost };
}

/**
 * Kanalen för hela besöket, bestämd vid landningen.
 *
 * Måste låsas där: referraren finns bara på den första sidvisningen, och
 * efter ett klick vidare i menyn är den vi själva. Utan det hade varje besök
 * skrivits om till "Direkt" så fort kunden klickade sig vidare.
 */
function rememberChannel(): { channel: string; referrer?: string } {
  if (typeof window === "undefined") return { channel: "Direkt" };
  try {
    // Ett explicit kampanjklick är ett nytt, avsiktligt inflöde även om samma
    // flik tidigare besökt viaeats. Skriv därför över en äldre sessionskanal
    // när länken bär utm_source (t.ex. Palmyras "Beställ på viaeats").
    if (new URLSearchParams(window.location.search).get("utm_source")) {
      const resolved = classifyChannel();
      const value = { channel: resolved.channel, ...(resolved.referrer ? { referrer: resolved.referrer } : {}) };
      window.sessionStorage.setItem(CHANNEL_KEY, JSON.stringify(value));
      return value;
    }
    const stored = window.sessionStorage.getItem(CHANNEL_KEY);
    if (stored) return JSON.parse(stored);
    const resolved = classifyChannel();
    const value = { channel: resolved.channel, ...(resolved.referrer ? { referrer: resolved.referrer } : {}) };
    window.sessionStorage.setItem(CHANNEL_KEY, JSON.stringify(value));
    return value;
  } catch {
    // Blockerad sessionStorage: klassificera om per steg. Sämre — referraren
    // är borta efter första sidan — men bättre än ingen kanal alls.
    const fallback = classifyChannel();
    return { channel: fallback.channel, ...(fallback.referrer ? { referrer: fallback.referrer } : {}) };
  }
}

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
      ...rememberChannel(),
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
