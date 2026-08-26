"use client";

/**
 * Meta-konverteringar.
 *
 * Pixeln i `components/MetaPixel.tsx` skickar bara PageView. Utan ett
 * Purchase-event kan en Sales-kampanj aldrig lära sig vem som faktiskt
 * beställer — Meta ser trafik men aldrig utfall, och "Website purchases"
 * står kvar på "--" hur många ordrar som än kommer in.
 *
 * Allt här är tyst om kunden inte aktivt godkänt marknadsföringscookies.
 * Ingen personuppgift skickas: bara ordervärde, valuta och ett event-id.
 */

import { hasMarketingConsent } from "@/lib/cookieConsent";

const SENT_EVENTS_KEY = "viaeats.meta.sentEvents.v1";
const SENT_EVENTS_LIMIT = 20;

function readSentEvents(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SENT_EVENTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((row): row is string => typeof row === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Kassan når sitt "betald"-läge från flera håll: providerreturen, den passiva
 * återhämtningen och statuspollningen. Alla tre kan träffa samma order, och
 * ett dubblerat Purchase blåser upp Metas siffror och förgiftar optimeringen.
 * Nyckeln lagras därför lokalt och eventet skickas en enda gång per order.
 */
function alreadySent(eventKey: string): boolean {
  return readSentEvents().includes(eventKey);
}

function markSent(eventKey: string): void {
  try {
    const next = [...readSentEvents().filter((row) => row !== eventKey), eventKey].slice(-SENT_EVENTS_LIMIT);
    localStorage.setItem(SENT_EVENTS_KEY, JSON.stringify(next));
  } catch {
    // Privat läge/kvot: hellre ett event för mycket än inget alls.
  }
}

/**
 * Returnerar true bara när eventet faktiskt lämnade klienten. Anroparen får
 * inte kvittera ett event som stoppades av samtyckesgrinden eller av att
 * pixeln ännu inte hunnit laddas — då hade det brunnit för alltid och aldrig
 * kunnat skickas om.
 */
function track(
  eventName: string,
  payload: Record<string, unknown>,
  options?: { eventID: string },
): boolean {
  if (typeof window === "undefined") return false;
  if (!hasMarketingConsent()) return false;
  const fbq = window.fbq;
  if (typeof fbq !== "function") return false;
  try {
    if (options) fbq("track", eventName, payload, options);
    else fbq("track", eventName, payload);
    return true;
  } catch {
    // Pixeln får aldrig kunna sänka kassan.
    return false;
  }
}

function positiveAmount(value: unknown): number | null {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

/** Kunden har lagt något i varukorgen. */
export function trackMetaAddToCart(input: { value?: number | null; contentName?: string | null }): void {
  const value = positiveAmount(input.value);
  track("AddToCart", {
    currency: "SEK",
    ...(value === null ? {} : { value }),
    ...(input.contentName ? { content_name: input.contentName } : {}),
  });
}

/** Ordern är skapad och kunden skickas till betalningen. */
export function trackMetaInitiateCheckout(input: { orderId: string; value?: number | null }): void {
  if (!input.orderId) return;
  const eventKey = `InitiateCheckout:${input.orderId}`;
  if (alreadySent(eventKey)) return;
  const value = positiveAmount(input.value);
  const sent = track(
    "InitiateCheckout",
    { currency: "SEK", ...(value === null ? {} : { value }) },
    { eventID: eventKey },
  );
  if (sent) markSent(eventKey);
}

/**
 * Ordern är betald. `eventID` är stabil per order så en framtida
 * Conversions API-koppling kan deduplicera mot samma event i stället för att
 * räkna köpet två gånger.
 */
export function trackMetaPurchase(input: { orderId: string; value?: number | null }): void {
  if (!input.orderId) return;
  const eventKey = `Purchase:${input.orderId}`;
  if (alreadySent(eventKey)) return;
  const value = positiveAmount(input.value);
  const sent = track(
    "Purchase",
    { currency: "SEK", ...(value === null ? {} : { value }) },
    { eventID: eventKey },
  );
  if (sent) markSent(eventKey);
}
