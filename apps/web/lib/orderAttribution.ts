"use client";

import { hasMarketingConsent } from "@/lib/cookieConsent";
import { journeySessionId } from "@/lib/journey";

let entryCaptured = false;
let explicitSignature = "";
let landing: AttributionTouch | null | undefined;
let landingClick: string | null = null;
const KEY = "viaeats.order-attribution.v1";
const VISIT_KEY = "viaeats.order-attribution.visit.v1";
const VISIT_MS = 30 * 60 * 1000;
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export type AttributionTouch = {
  source: string; evidence: string; at: number; referrer?: string;
  campaign?: string; medium?: string; content?: string; adId?: string; adSetId?: string; sourceName?: string;
};
type Stored = { first: AttributionTouch; last: AttributionTouch; current?: AttributionTouch; fbc?: string };
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
    : /tiktok|bing|snapchat|youtube/.test(raw) ? (/tiktok|bing|snapchat|youtube/.exec(raw)![0])
    : raw ? "other"
    : p.has("fbclid") ? "meta"
    : (p.has("gclid") || p.has("gbraid") || p.has("wbraid")) ? "google"
    : /(^|\.)instagram\.com$/.test(referrer) ? "ig"
    : /(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(referrer) ? "fb"
    : /(^|\.)palmyrapizzeria\.se$/.test(referrer) ? "palmyra"
    : /(^|\.)(mail\.google\.com|outlook\.live\.com)$/.test(referrer) ? "email"
    : /(^|\.)google\.[a-z.]+$/.test(referrer) ? "google"
    : /(^|\.)(tiktok|bing|snapchat|youtube)\.com$/.test(referrer) ? referrer.split(".").slice(-2)[0]
    : referrer && !ownOrPayment.test(referrer) ? "referral" : "direct";
  // Betalreturer och intern navigation får aldrig skriva över förvärvskällan.
  if (!raw && !p.has("fbclid") && !(p.has("gclid") || p.has("gbraid") || p.has("wbraid")) && ownOrPayment.test(referrer)) return null;
  return { source, evidence: raw ? "utm" : p.has("fbclid") || (p.has("gclid") || p.has("gbraid") || p.has("wbraid")) ? "click_id" : source === "direct" ? "direct" : "referrer",
    at: Date.now(), ...(referrer && !ownOrPayment.test(referrer) ? { referrer } : {}),
    sourceName: clean(p.get("utm_source")), campaign: clean(p.get("utm_campaign")), medium: clean(p.get("utm_medium")), content: clean(p.get("utm_content")),
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
    // Behåll bara landningen i minnet tills besökaren har valt samtycke.
    if (landing === undefined) { landing = touch(); landingClick = new URLSearchParams(window.location.search).get("fbclid"); }
    if (!hasMarketingConsent()) { window.localStorage.removeItem(KEY); window.sessionStorage.removeItem(VISIT_KEY); entryCaptured = false; explicitSignature = ""; return undefined; }
    const now = Date.now();
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || "null") as Stored | null;
    let stored = parsed?.last?.at && now - parsed.last.at <= WINDOW_MS && parsed.last.at <= now ? parsed : null;
    const params = new URLSearchParams(window.location.search);
    const signature = ['utm_source', 'utm_campaign', 'utm_content', 'ad_id', 'adset_id', 'fbclid', 'gclid', 'gbraid', 'wbraid'].map(k => params.get(k) || '').join('|');
    const explicit = [...params.keys()].some(k => ['utm_source', 'utm_campaign', 'fbclid', 'gclid', 'gbraid', 'wbraid'].includes(k));
    const visit = JSON.parse(window.sessionStorage.getItem(VISIT_KEY) || "null") as { touch: AttributionTouch; seenAt: number } | null;
    const activeVisit = visit && now - visit.seenAt < VISIT_MS && visit.seenAt <= now ? visit : null;
    const changedCampaign = explicit && signature !== explicitSignature;
    const incoming = !entryCaptured ? landing : changedCampaign ? touch() : null;
    let current = activeVisit?.touch;
    // Ny extern ingång byter besökskälla. Betalretur och omladdning behåller den.
    if (incoming && (!activeVisit || (incoming.source !== "direct" && (!entryCaptured || changedCampaign)))) current = incoming;
    if (!current) current = incoming || { source: "direct", evidence: "direct", at: now };
    window.sessionStorage.setItem(VISIT_KEY, JSON.stringify({ touch: current, seenAt: now }));
    entryCaptured = true;
    if (explicit) explicitSignature = signature;
    if (incoming && (!stored || incoming.source !== "direct")) {
      // Samma landnings-URL på flera React-renderingar förlänger inte klickets liv.
      const same = stored && ["source", "campaign", "content", "adId", "medium", "referrer"].every(k =>
        stored!.last[k as keyof AttributionTouch] === incoming[k as keyof AttributionTouch]);
      if (!same) stored = { first: stored && now - stored.first.at <= WINDOW_MS ? stored.first : incoming, last: incoming, ...(stored?.fbc ? { fbc: stored.fbc } : {}) };
    }
    if (!stored) stored = { first: incoming || { source: "direct", evidence: "direct", at: now }, last: incoming || { source: "direct", evidence: "direct", at: now } };
    const fbclid = new URLSearchParams(window.location.search).get("fbclid") || landingClick;
    if (fbclid && /^[A-Za-z0-9_\-]{1,500}$/.test(fbclid) && !stored.fbc?.endsWith(`.${fbclid}`)) {
      stored.fbc = `fb.1.${now}.${fbclid}`;
    }
    if (now - stored.first.at > WINDOW_MS) stored.first = stored.last;
    stored.current = current;
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
