/**
 * Places Proxy — backend route
 *
 * Används av React Native (Expo), web-appen och admin så map-nycklar
 * stannar server-side. Google Maps är enda källan — ingen Geoapify-fallback
 * längre.
 *
 * GET /api/places/autocomplete?input=...&sessiontoken=...
 * GET /api/places/geocode?place_id=...&sessiontoken=...
 */
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { trackApiCall } from '../lib/apiHealth';

const router = Router();

// Stöder båda env-namnen — GOOGLE_MAPS_API_KEY (det vi använder i index.ts
// startup-validering) eller GOOGLE_MAPS_KEY (legacy). Sätt ett av dem på
// Railway, det andra kan tas bort.
const MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_KEY || '';

type Prediction = { description: string; place_id: string };

async function googleAutocomplete(
  input: string,
  sessiontoken: string | undefined
): Promise<Prediction[] | null> {
  if (!MAPS_KEY) return null;
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input', input);
    url.searchParams.set('components', 'country:se');
    url.searchParams.set('language', 'sv');
    url.searchParams.set('types', 'address');
    if (sessiontoken) url.searchParams.set('sessiontoken', sessiontoken);
    url.searchParams.set('key', MAPS_KEY);

    const response = await fetch(url.toString());
    trackApiCall('google_maps').catch(() => {});
    const data = (await response.json()) as any;
    // REQUEST_DENIED (t.ex. billing avstängd) gav tidigare tyst tom lista —
    // kunden såg "inga förslag" och ingen larmade. Fel-status → null så
    // Photon-fallbacken tar över och Systemvakten ser loggen.
    if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('[places] Google autocomplete error:', data.status, data.error_message || '');
      return null;
    }
    const predictions = (data.predictions || []).map((p: any): Prediction => ({
      description: p.description,
      place_id: p.place_id,
    }));
    return predictions;
  } catch {
    return null;
  }
}

// ── Places API (New) ─────────────────────────────────────────────────────────
// Nya Google Cloud-projekt kan ofta bara aktivera "Places API (New)"
// (places.googleapis.com), inte legacy-API:t ovan. Servern provar legacy
// först och faller sedan tillbaka hit, så det räcker att ETT av dem är
// aktiverat på nyckeln.

async function googleAutocompleteNew(
  input: string,
  sessiontoken: string | undefined
): Promise<Prediction[] | null> {
  if (!MAPS_KEY) return null;
  try {
    const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': MAPS_KEY,
      },
      body: JSON.stringify({
        input,
        includedRegionCodes: ['se'],
        languageCode: 'sv',
        ...(sessiontoken ? { sessionToken: sessiontoken } : {}),
      }),
    });
    trackApiCall('google_maps').catch(() => {});
    const data = (await response.json()) as any;
    if (!response.ok) {
      console.error('[places] Google autocomplete (new) error:', response.status, data?.error?.message || '');
      return null;
    }
    const predictions: Prediction[] = [];
    for (const suggestion of data.suggestions || []) {
      const p = suggestion?.placePrediction;
      if (!p?.placeId || !p?.text?.text) continue;
      predictions.push({ description: p.text.text, place_id: p.placeId });
    }
    return predictions;
  } catch {
    return null;
  }
}

async function googleGeocodeNew(
  place_id: string,
  sessiontoken: string | undefined
): Promise<GeocodeResult | null> {
  if (!MAPS_KEY) return null;
  try {
    const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(place_id)}`);
    if (sessiontoken) url.searchParams.set('sessionToken', sessiontoken);
    const response = await fetch(url.toString(), {
      headers: {
        'X-Goog-Api-Key': MAPS_KEY,
        'X-Goog-FieldMask': 'location,addressComponents',
      },
    });
    trackApiCall('google_maps').catch(() => {});
    const data = (await response.json()) as any;
    if (!response.ok) {
      console.error('[places] Google place details (new) error:', response.status, data?.error?.message || '');
      return null;
    }
    const loc = data.location;
    if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') return null;
    const components: any[] = data.addressComponents || [];
    const get = (type: string) => components.find((c: any) => (c.types || []).includes(type))?.longText;
    return {
      lat: loc.latitude,
      lng: loc.longitude,
      postalCode: get('postal_code'),
      city: get('locality') || get('postal_town'),
    };
  } catch {
    return null;
  }
}

// ── Nyckelfri fallback: Photon (OpenStreetMap) ──────────────────────────────
// Google är primär källa. När nyckeln saknas, nekas (billing) eller tjänsten
// är nere får kunderna ändå adressförslag via Photon. Koordinaterna följer
// med i place_id ("photon:lat,lng,postnr,ort") så geocode-steget inte behöver
// något extra nätverksanrop.

function photonAddress(props: any): { street: string; zip?: string; city?: string } | null {
  const street = [props.street || props.name, props.housenumber].filter(Boolean).join(' ').trim();
  if (!street) return null;
  return {
    street,
    zip: props.postcode || undefined,
    city: props.city || props.town || props.village || props.locality || undefined,
  };
}

async function photonAutocomplete(input: string): Promise<Prediction[] | null> {
  try {
    const url = new URL('https://photon.komoot.io/api/');
    url.searchParams.set('q', input);
    url.searchParams.set('limit', '6');
    // Bias mot Sverige; Photon har inget hårt landsfilter i frågan så
    // countrycode filtreras på svaret i stället.
    url.searchParams.set('lat', '59.3');
    url.searchParams.set('lon', '14.5');
    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'ViaEats/1.0 (https://www.viaeats.se)' },
    });
    trackApiCall('photon').catch(() => {});
    const data = (await response.json()) as any;
    const seen = new Set<string>();
    const predictions: Prediction[] = [];
    for (const feature of data.features || []) {
      const props = feature?.properties || {};
      if (String(props.countrycode || '').toUpperCase() !== 'SE') continue;
      const parts = photonAddress(props);
      const coords = feature?.geometry?.coordinates;
      if (!parts || !Array.isArray(coords) || coords.length < 2) continue;
      const description = [parts.street, [parts.zip, parts.city].filter(Boolean).join(' ')]
        .filter(Boolean).join(', ');
      if (seen.has(description)) continue;
      seen.add(description);
      predictions.push({
        description,
        place_id: `photon:${coords[1]},${coords[0]},${parts.zip || ''},${parts.city || ''}`,
      });
    }
    return predictions;
  } catch {
    return null;
  }
}

async function photonReverse(lat: number, lng: number): Promise<ReverseResult | null> {
  try {
    const url = new URL('https://photon.komoot.io/reverse');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('limit', '1');
    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'ViaEats/1.0 (https://www.viaeats.se)' },
    });
    trackApiCall('photon').catch(() => {});
    const data = (await response.json()) as any;
    const props = data.features?.[0]?.properties;
    if (!props) return null;
    const parts = photonAddress(props);
    if (!parts) return null;
    const zipCity = [parts.zip, parts.city].filter(Boolean).join(' ');
    return {
      address: [parts.street, zipCity].filter(Boolean).join(', '),
      postalCode: parts.zip,
      city: parts.city,
    };
  } catch {
    return null;
  }
}

type GeocodeResult = { lat: number; lng: number; postalCode?: string; city?: string };

async function googleGeocode(
  place_id: string,
  sessiontoken: string | undefined
): Promise<GeocodeResult | null> {
  if (!MAPS_KEY) return null;
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', place_id);
    url.searchParams.set('fields', 'geometry,address_component');
    if (sessiontoken) url.searchParams.set('sessiontoken', sessiontoken);
    url.searchParams.set('key', MAPS_KEY);

    const response = await fetch(url.toString());
    trackApiCall('google_maps').catch(() => {});
    const data = (await response.json()) as any;
    const loc = data.result?.geometry?.location;
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return null;

    const components: any[] = data.result?.address_components || [];
    const get = (type: string) => components.find((c: any) => c.types.includes(type))?.long_name;

    return {
      lat: loc.lat,
      lng: loc.lng,
      postalCode: get('postal_code'),
      city: get('locality') || get('postal_town'),
    };
  } catch {
    return null;
  }
}

type ReverseResult = { address: string; postalCode?: string; city?: string };

async function googleReverse(lat: number, lng: number): Promise<ReverseResult | null> {
  if (!MAPS_KEY) return null;
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${lat},${lng}`);
    url.searchParams.set('language', 'sv');
    url.searchParams.set('key', MAPS_KEY);

    const response = await fetch(url.toString());
    trackApiCall('google_maps').catch(() => {});
    const data = (await response.json()) as any;
    if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('[places] Google reverse error:', data.status, data.error_message || '');
      return null;
    }
    const result = (data.results || [])[0];
    if (!result) return null;

    const components: any[] = result.address_components || [];
    const get = (type: string) => components.find((c: any) => c.types.includes(type))?.long_name;
    const route = get('route');
    const num = get('street_number');
    const zip = get('postal_code');
    const city = get('postal_town') || get('locality') || get('sublocality');
    const street = [route, num].filter(Boolean).join(' ') || String(result.formatted_address || '').split(',')[0];
    const zipCity = [zip, city].filter(Boolean).join(' ');
    const address = [street, zipCity].filter(Boolean).join(', ');
    return { address, postalCode: zip, city };
  } catch {
    return null;
  }
}

// ── Per-IP rate limiters ─────────────────────────────────────────────────────
const autocompleteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,  // 10 minutes
  max: 60,                     // 60 autocomplete calls per 10 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || 'unknown',
  message: { error: 'För många sökningar. Vänta lite och försök igen.' },
});

const geocodeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || 'unknown',
  message: { error: 'För många förfrågningar. Vänta lite och försök igen.' },
});

async function handleAutocomplete(input: string, sessiontoken: string | undefined, res: Response) {
  if (!input || input.length < 3) {
    return res.json({ predictions: [] });
  }

  const legacy = MAPS_KEY ? await googleAutocomplete(input, sessiontoken) : null;
  if (legacy && legacy.length > 0) {
    return res.json({ predictions: legacy });
  }
  // Legacy nekad (vanligt i nya Google-projekt) → Places API (New).
  const modern = MAPS_KEY && legacy === null ? await googleAutocompleteNew(input, sessiontoken) : null;
  if (modern && modern.length > 0) {
    return res.json({ predictions: modern });
  }
  const google = legacy ?? modern;

  // Google nere/nekad/utan träff → Photon. En tom men lyckad Google-lista
  // (ZERO_RESULTS) provas också — OSM hittar ibland adresser Google missar.
  const photon = await photonAutocomplete(input);
  if (photon && photon.length > 0) {
    return res.json({ predictions: photon });
  }
  if (google !== null || photon !== null) {
    return res.json({ predictions: [] });
  }
  return res.status(500).json({ predictions: [], error: 'Autocomplete failed' });
}

async function handleGeocode(place_id: string, sessiontoken: string | undefined, res: Response) {
  if (!place_id) {
    return res.status(400).json({ error: 'place_id required' });
  }

  // Photon-förslag bär sina koordinater i place_id — inget nätverksanrop.
  if (place_id.startsWith('photon:')) {
    const [latRaw, lngRaw, zipRaw, ...cityParts] = place_id.slice('photon:'.length).split(',');
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'Ogiltigt photon-place_id' });
    }
    return res.json({
      location: { lat, lng },
      postalCode: zipRaw || undefined,
      city: cityParts.join(',') || undefined,
    });
  }

  if (!MAPS_KEY) {
    return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY saknas på servern' });
  }

  // Place-ID:n är samma i båda API-generationerna, så detaljerna hämtas från
  // den variant som är aktiverad på nyckeln.
  const result = (await googleGeocode(place_id, sessiontoken))
    || (await googleGeocodeNew(place_id, sessiontoken));
  if (!result) {
    return res.status(404).json({ error: 'No location found for place_id' });
  }
  const { lat, lng, postalCode, city } = result;
  return res.json({ location: { lat, lng }, postalCode, city });
}

router.post('/autocomplete', autocompleteLimiter, async (req: Request, res: Response) => {
  const { input, sessiontoken } = req.body as { input?: string; sessiontoken?: string };
  return handleAutocomplete(input || '', sessiontoken, res);
});

router.get('/autocomplete', autocompleteLimiter, async (req: Request, res: Response) => {
  const input = (req.query.input as string) || '';
  const sessiontoken = (req.query.sessiontoken as string) || '';
  return handleAutocomplete(input, sessiontoken, res);
});

// Reverse-geocode (lat/lng → adress) för den keyless kart-väljaren. Körs
// server-side med Google-nyckeln → ingen browser-nyckel/referrer-krångel i prod.
router.get('/reverse', geocodeLimiter, async (req: Request, res: Response) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat/lng required' });
  }
  const result = (MAPS_KEY ? await googleReverse(lat, lng) : null) || await photonReverse(lat, lng);
  if (!result) return res.status(404).json({ error: 'No address found' });
  return res.json(result);
});

router.post('/geocode', geocodeLimiter, async (req: Request, res: Response) => {
  const { place_id, sessiontoken } = req.body as { place_id?: string; sessiontoken?: string };
  return handleGeocode(place_id || '', sessiontoken, res);
});

router.get('/geocode', geocodeLimiter, async (req: Request, res: Response) => {
  const place_id = (req.query.place_id as string) || '';
  const sessiontoken = (req.query.sessiontoken as string) || '';
  return handleGeocode(place_id, sessiontoken, res);
});

export default router;
