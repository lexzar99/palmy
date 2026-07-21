// ---------------------------------------------------------------------------
//  Ruttmatris: riktiga vägavstånd/restider för dispatch-simuleringen.
//
//  Problem: haversine (fågelvägen) ser inte broar, floder eller enkelriktat.
//  Lösning: en OSRM /table-fråga ger hela restids-/avståndsmatrisen mellan
//  alla inblandade punkter (kurirer + stopp + nya ordern) i ETT anrop.
//
//  Konfiguration: env OSRM_URL, t.ex. en självhostad OSRM ("http://osrm:5000")
//  eller demoservern "https://router.project-osrm.org" (endast test — den är
//  rate-limitad och utan SLA). Saknas OSRM_URL, eller failar anropet, återgår
//  simuleringen tyst till haversine — dispatchen får ALDRIG blockeras av en
//  extern rutt-tjänst (timeout 1.5 s).
//
//  Fordonslogik: OSRM-profilen är bil. För CAR används den verkliga restiden
//  (×1.15 trafikfaktor). För cykel/elcykel används det verkliga VÄGavståndet
//  (mycket bättre än fågelvägen — broar!) gånger cykelns min/km.
//
//  Cache: par-nivå (4 decimaler ≈ 11 m) med TTL så täta dispatch-vågor i samma
//  stad inte spammar OSRM. Lyckade matriser seedar cachen; vid nätverksfel
//  svarar cachen för de par den känner till och resten faller till haversine.
// ---------------------------------------------------------------------------
import axios from 'axios';

export type Coord = { lat: number; lng: number };

/** null = okänt par → anroparen faller tillbaka till haversine. */
export type TravelLookup = (from: Coord, to: Coord) => { durationMin: number; distanceKm: number } | null;

const OSRM_TIMEOUT_MS = 1_500;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX_PAIRS = 8_000;
const MAX_TABLE_POINTS = 80; // en dispatch-våg i en stad ligger långt under detta

const pairCache = new Map<string, { durationMin: number; distanceKm: number; at: number }>();

const keyOf = (c: Coord) => `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`;
const pairKey = (a: Coord, b: Coord) => `${keyOf(a)}|${keyOf(b)}`;

function cacheGet(a: Coord, b: Coord) {
  const hit = pairCache.get(pairKey(a, b));
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    pairCache.delete(pairKey(a, b));
    return null;
  }
  return { durationMin: hit.durationMin, distanceKm: hit.distanceKm };
}

function cacheSet(a: Coord, b: Coord, durationMin: number, distanceKm: number) {
  if (pairCache.size >= CACHE_MAX_PAIRS) {
    // Enkel städning: släng äldsta tredjedelen (insertion order ≈ ålder).
    let toDrop = Math.floor(CACHE_MAX_PAIRS / 3);
    for (const k of pairCache.keys()) {
      pairCache.delete(k);
      if (--toDrop <= 0) break;
    }
  }
  pairCache.set(pairKey(a, b), { durationMin, distanceKm, at: Date.now() });
}

let lastWarnAt = 0;
function warnThrottled(msg: string) {
  if (Date.now() - lastWarnAt < 5 * 60_000) return;
  lastWarnAt = 0 + Date.now();
  console.warn(`[travelMatrix] ${msg} — använder haversine-fallback.`);
}

export function isRoutingConfigured(): boolean {
  return Boolean((process.env.OSRM_URL || '').trim());
}

/**
 * Bygg en synkron lookup för alla par bland `points`. Returnerar null när
 * routing inte är konfigurerad (anroparen kör då ren haversine). Vid partiellt
 * misslyckande returneras en cache-endast-lookup som svarar null för okända
 * par (per-par-fallback till haversine i orderEta).
 */
export async function buildTravelLookup(points: Coord[]): Promise<TravelLookup | null> {
  const base = (process.env.OSRM_URL || '').trim().replace(/\/+$/, '');
  if (!base) return null;

  // Deduplicera på cache-nyckel (11 m-upplösning räcker för dispatch).
  const unique: Coord[] = [];
  const seen = new Set<string>();
  for (const p of points) {
    if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lng)) continue;
    const k = keyOf(p);
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(p);
    }
  }
  const cacheOnly: TravelLookup = (a, b) => cacheGet(a, b);
  if (unique.length < 2) return cacheOnly;
  if (unique.length > MAX_TABLE_POINTS) {
    warnThrottled(`${unique.length} punkter är fler än taket ${MAX_TABLE_POINTS}`);
    return cacheOnly;
  }

  // Allt redan i cache? Hoppa över nätverket helt.
  const allCached = unique.every((a) => unique.every((b) => a === b || cacheGet(a, b) != null));
  if (allCached) return cacheOnly;

  try {
    const coords = unique.map((p) => `${p.lng},${p.lat}`).join(';');
    const url = `${base}/table/v1/driving/${coords}?annotations=duration,distance`;
    const res = await axios.get(url, { timeout: OSRM_TIMEOUT_MS });
    const durations: number[][] | undefined = res.data?.durations;
    const distances: number[][] | undefined = res.data?.distances;
    if (!Array.isArray(durations)) {
      warnThrottled(`oväntat OSRM-svar (${res.data?.code ?? 'okänd kod'})`);
      return cacheOnly;
    }
    for (let i = 0; i < unique.length; i++) {
      for (let j = 0; j < unique.length; j++) {
        if (i === j) continue;
        const durSec = durations[i]?.[j];
        if (typeof durSec !== 'number' || !Number.isFinite(durSec)) continue;
        const distM = distances?.[i]?.[j];
        const distanceKm = typeof distM === 'number' && Number.isFinite(distM) ? distM / 1000 : durSec / 60 * 0.5;
        cacheSet(unique[i], unique[j], durSec / 60, distanceKm);
      }
    }
    return (a, b) => cacheGet(a, b);
  } catch (e) {
    warnThrottled(`OSRM-anropet misslyckades (${(e as Error)?.message})`);
    return cacheOnly;
  }
}
