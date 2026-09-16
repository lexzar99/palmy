"use client";

import { hasMarketingConsent } from "@/lib/cookieConsent";
import { journeySessionId } from "@/lib/journey";

let entryCaptured = false;
let explicitSignature = "";
const KEY = "viaeats.order-attribution.v1";
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export type AttributionTouch = {
  source: string; evidence: string; at: number; referrer?: string;
  campaign?: string; medium?: string; content?: string; adId?: string; adSetId?: string;
};
type Stored = { first: AttributionTouch; last: AttributionTouch; fbc?: string };
const clean = (value: string | null) => value?.trim().slice(0, 120) || undefined;
const ownOrPayment = /(^|\.)(viaeats\.se|localhost|stripe\.com|mollie\.com|adyen\.com|swish\.nu)$/;

function touch(): AttributionTouch | null {
  const p = new URLSearchParams(window.location.search);
  let referrer = "";
  try { referrer = new URL(document.referrer).hostname.toLowerCase(); } catch { /* saknas */ }
  const raw = (p.get("utm_source") || "").toLowerCase();
  const source = /^(fb|facebook)$/.test(raw) ? "fb"
    : /^(ig|instagram)$/.test(raw) ? "ig"
    : /^(meta|an|audience_network|messenger)$/.test(raw) ? "meta"
    : /email|mail/.test(raw) ? "email"
    : /google/.test(raw) ? "google"
    : /palmyra/.test(raw) ? "palmyra"
    : raw ? "other"
    : p.has("fbclid") ? "meta"
    : p.has("gclid") ? "google"
    : /(^|\.)instagram\.com$/.test(referrer) ? "ig"
    : /(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(referrer) ? "fb"
    : /(^|\.)palmyrapizzeria\.se$/.test(referrer) ? "palmyra"
    : /(^|\.)(mail\.google\.com|outlook\.live\.com)$/.test(referrer) ? "email"
    : /(^|\.)google\.[a-z.]+$/.test(referrer) ? "google"
    : referrer && !ownOrPayment.test(referrer) ? "referral" : "direct";
  // Betalreturer och intern navigation får aldrig skriva över förvärvskällan.
  if (!raw && !p.has("fbclid") && !p.has("gclid") && ownOrPayment.test(referrer)) return null;
  return { source, evidence: raw ? "utm" : p.has("fbclid") || p.has("gclid") ? "click_id" : source === "direct" ? "direct" : "referrer",
    at: Date.now(), ...(referrer && !ownOrPayment.test(referrer) ? { referrer } : {}),
    campaign: clean(p.get("utm_campaign")), medium: clean(p.get("utm_medium")), content: clean(p.get("utm_content")),
    adId: clean(p.get("ad_id")), adSetId: clean(p.get("adset_id")) };
}
function cookie(name: string) {
  const row = document.cookie.split(";").map(s => s.trim()).find(s => s.startsWith(`${name}=`));
  return row ? decodeURIComponent(row.slice(name.length + 1)) : undefined;
}

/** Första och senaste externa kontakt, enbart efter marknadsföringssamtycke. */
export function captureOrderAttribution(): Stored | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const embedded = window.parent !== window || new URLSearchParams(window.location.search).get('embed') === '1';
    if (embedded) window.sessionStorage.setItem('viaeats.checkout-surface', 'embed');
    else if (!/^\/(cart|pay|order)(\/|$)/.test(window.location.pathname)) window.sessionStorage.removeItem('viaeats.checkout-surface');
    if (!hasMarketingConsent()) { window.localStorage.removeItem(KEY); entryCaptured = false; explicitSignature = ""; return undefined; }
    const now = Date.now();
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || "null") as Stored | null;
    let stored = parsed?.last?.at && now - parsed.last.at <= WINDOW_MS && parsed.last.at <= now ? parsed : null;
    const params = new URLSearchParams(window.location.search);
    const signature = ['utm_source', 'utm_campaign', 'utm_content', 'ad_id', 'adset_id', 'fbclid', 'gclid'].map(k => params.get(k) || '').join('|');
    const explicit = [...params.keys()].some(k => ['utm_source', 'utm_campaign', 'fbclid', 'gclid'].includes(k));
    const incoming = !entryCaptured || (explicit && signature !== explicitSignature) ? touch() : null;
    entryCaptured = true;
    if (explicit) explicitSignature = signature;
    if (incoming && (!stored || incoming.source !== "direct")) {
      // Samma landnings-URL på flera React-renderingar förlänger inte klickets liv.
      const same = stored && ["source", "campaign", "content", "adId", "medium", "referrer"].every(k =>
        stored!.last[k as keyof AttributionTouch] === incoming[k as keyof AttributionTouch]);
      if (!same) stored = { first: stored && now - stored.first.at <= WINDOW_MS ? stored.first : incoming, last: incoming };
    }
    if (!stored) stored = { first: incoming || { source: "direct", evidence: "direct", at: now }, last: incoming || { source: "direct", evidence: "direct", at: now } };
    const fbclid = new URLSearchParams(window.location.search).get("fbclid");
    if (fbclid && /^[A-Za-z0-9_\-]{1,500}$/.test(fbclid) && !stored.fbc?.endsWith(`.${fbclid}`)) {
      stored.fbc = `fb.1.${now}.${fbclid}`;
    }
    window.localStorage.setItem(KEY, JSON.stringify(stored));
    return stored;
  } catch { return undefined; }
}

/** Extra analysdata ändrar aldrig priser, identitet eller orderns avgiftskanal. */
export function orderAttributionContext() {
  try {
    const embedded = window.parent !== window || new URLSearchParams(window.location.search).get("embed") === "1";
    // Beställningsytan är driftkontext, inte en annonsidentifierare.
    if (embedded) { try { window.sessionStorage.setItem('viaeats.checkout-surface', 'embed'); } catch { /* blockerad lagring */ } }
    const retainedEmbed = /^\/(cart|pay|order)(\/|$)/.test(window.location.pathname) && window.sessionStorage.getItem('viaeats.checkout-surface') === 'embed';
    const surface = embedded || retainedEmbed ? "VIAEATS_EMBED" : "VIAEATS_WEB";
    const stored = captureOrderAttribution();
    if (!stored || !hasMarketingConsent()) return { surface, consent: false };
    return { surface, consent: true, sessionId: journeySessionId(), ...stored,
      fbc: stored.fbc || cookie("_fbc"), fbp: cookie("_fbp") };
  } catch { return { consent: false }; }
}
