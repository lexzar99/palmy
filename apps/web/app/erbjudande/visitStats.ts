/**
 * Anonym mätning av /erbjudande. Besöket har ett slumpat id som bara finns i minnet tills sidan stängs,
 * så inget sparas på besökarens enhet. Inga kontaktuppgifter skickas.
 */
const STAGES = ["start", "skroll", "kvitto", "formaner", "jamforelse", "anmal", "vidare", "astronaut", "tillval", "hemsidor", "pris", "ingar", "palmyra", "steg", "fragor", "slut"] as const;
export type OfferStage = (typeof STAGES)[number];

/** Resans steg, som andel av resan. Samma tider som scenen i TerminalScene. */
const JOURNEY: [number, OfferStage][] = [[0.999, "vidare"], [0.87, "anmal"], [0.68, "jamforelse"], [0.48, "formaner"], [0.2, "kvitto"], [0.02, "skroll"], [0, "start"]];
const HEARTBEAT = 20_000;
const MAX_BEATS = 30;
const TOKEN = /^[a-zA-Z0-9_.-]{1,80}$/;

let active = false;
let id = "";
let deepest = 0;
let last: OfferStage = "start";
let form = 0;
let shown = 0;
let visibleSince = 0;
let source = "direkt";
let campaign: string | undefined;
let platform: string | undefined;
let ad: string | undefined;
let pending = 0;

const seconds = () => Math.min(3600, Math.round((shown + (visibleSince ? Date.now() - visibleSince : 0)) / 1000));

function send() {
  if (!active) return;
  window.clearTimeout(pending);
  pending = 0;
  const device = window.innerWidth < 768 ? "mobil" : "dator";
  const body = JSON.stringify({ id, stage: STAGES[deepest], last, seconds: seconds(), form, device, source, campaign, platform, ad });
  navigator.sendBeacon("/api/offer-stats", new Blob([body], { type: "application/json" }));
}
const soon = () => { if (active && !pending) pending = window.setTimeout(send, 1500); };

export function atStage(stage: OfferStage) {
  if (stage === last) return;
  last = stage;
  const index = STAGES.indexOf(stage);
  if (index > deepest) deepest = index;
  soon();
}

export function atJourney(progress: number) {
  atStage(JOURNEY.find(([from]) => progress >= from)?.[1] ?? "start");
}

export function atFormStep(step: number) {
  if (step <= form) return;
  form = step;
  soon();
}

/** Startar mätningen. Bara på viaeats.se, så tester på den egna datorn inte räknas. */
export function startVisit() {
  if (!/(^|\.)viaeats\.se$/.test(window.location.hostname) || !navigator.sendBeacon) return () => undefined;
  const query = new URLSearchParams(window.location.search);
  let referrer = "";
  try { referrer = document.referrer ? new URL(document.referrer).hostname : ""; } catch { /* okänd källa */ }
  const from = query.get("utm_source") || referrer;
  id = crypto.randomUUID();
  deepest = 0; last = "start"; form = 0; shown = 0;
  source = from && TOKEN.test(from) ? from : "direkt";
  const utm = query.get("utm_campaign") ?? "";
  campaign = TOKEN.test(utm) ? utm : undefined;
  // Meta fyller i utm_medium med var annonsen visades (fb, ig) och utm_content med annonsens namn.
  const medium = query.get("utm_medium") ?? "";
  platform = TOKEN.test(medium) && medium.length <= 40 ? medium : undefined;
  const content = query.get("utm_content") ?? "";
  ad = TOKEN.test(content) ? content : undefined;
  visibleSince = document.hidden ? 0 : Date.now();
  active = true;
  const onVisibility = () => {
    if (document.hidden) {
      shown += visibleSince ? Date.now() - visibleSince : 0;
      visibleSince = 0;
      send();
    } else visibleSince = Date.now();
  };
  let beats = 0;
  const beat = window.setInterval(() => {
    if (!document.hidden) send();
    if (++beats >= MAX_BEATS) window.clearInterval(beat);
  }, HEARTBEAT);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", send);
  send();
  return () => {
    send();
    active = false;
    window.clearInterval(beat);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", send);
  };
}
