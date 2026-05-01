/**
 * Places Proxy — backend route
 *
 * Used by React Native (Expo), web app, and admin so map keys stay server-side.
 * Google Maps is primary; Geoapify is a transparent fallback when Google fails
 * or returns empty results. Response shape is identical for both providers.
 *
 * Geoapify-sourced predictions encode coords inside the place_id as
 *   "geoapify:<lat>,<lng>"
 * so the geocode endpoint can resolve them without a second network call.
 *
 * GET /api/places/autocomplete?input=...&sessiontoken=...
 * GET /api/places/geocode?place_id=...&sessiontoken=...
 */
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

const router = Router();

const MAPS_KEY = process.env.GOOGLE_MAPS_KEY || '';
const GEOAPIFY_KEY = process.env.GEOAPIFY_API_KEY || '';

type Prediction = { description: string; place_id: string };

async function geoapifyAutocompleteFallback(input: string): Promise<Prediction[]> {
  if (!GEOAPIFY_KEY) return [];
  try {
    const url = new URL('https://api.geoapify.com/v1/geocode/autocomplete');
    url.searchParams.set('text', input);
    url.searchParams.set('filter', 'countrycode:se');
    url.searchParams.set('limit', '5');
    url.searchParams.set('apiKey', GEOAPIFY_KEY);

    const response = await fetch(url.toString());
    const data = (await response.json()) as any;
    const features = Array.isArray(data?.features) ? data.features : [];
    return features
      .map((f: any): Prediction | null => {
        const formatted = f?.properties?.formatted;
        const coords = f?.geometry?.coordinates;
        if (!formatted || !Array.isArray(coords) || coords.length !== 2) return null;
        const [lng, lat] = coords;
        return {
          description: String(formatted),
          place_id: `geoapify:${Number(lat)},${Number(lng)}`,
        };
      })
      .filter((p: Prediction | null): p is Prediction => p !== null);
  } catch {
    return [];
  }
}

function decodeGeoapifyPlaceId(place_id: string): { lat: number; lng: number } | null {
  if (!place_id.startsWith('geoapify:')) return null;
  const coords = place_id.slice('geoapify:'.length).split(',');
  if (coords.length !== 2) return null;
  const lat = Number(coords[0]);
  const lng = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

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
    const data = (await response.json()) as any;
    const predictions = (data.predictions || []).map((p: any): Prediction => ({
      description: p.description,
      place_id: p.place_id,
    }));
    return predictions;
  } catch {
    return null;
  }
}

async function googleGeocode(
  place_id: string,
  sessiontoken: string | undefined
): Promise<{ lat: number; lng: number } | null> {
  if (!MAPS_KEY) return null;
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', place_id);
    url.searchParams.set('fields', 'geometry');
    if (sessiontoken) url.searchParams.set('sessiontoken', sessiontoken);
    url.searchParams.set('key', MAPS_KEY);

    const response = await fetch(url.toString());
    const data = (await response.json()) as any;
    const loc = data.result?.geometry?.location;
    if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
      return { lat: loc.lat, lng: loc.lng };
    }
    return null;
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

  if (!MAPS_KEY && !GEOAPIFY_KEY) {
    return res.status(500).json({ error: 'No geocoding provider configured on server' });
  }

  const google = await googleAutocomplete(input, sessiontoken);
  if (google && google.length > 0) {
    return res.json({ predictions: google });
  }

  const geoapify = await geoapifyAutocompleteFallback(input);
  if (geoapify.length > 0) {
    return res.json({ predictions: geoapify });
  }

  if (google === null && !GEOAPIFY_KEY) {
    return res.status(500).json({ predictions: [], error: 'Autocomplete failed' });
  }

  return res.json({ predictions: [] });
}

async function handleGeocode(place_id: string, sessiontoken: string | undefined, res: Response) {
  if (!place_id) {
    return res.status(400).json({ error: 'place_id required' });
  }

  const geoapifyCoords = decodeGeoapifyPlaceId(place_id);
  if (geoapifyCoords) {
    return res.json({ location: geoapifyCoords });
  }

  if (!MAPS_KEY) {
    return res.status(500).json({ error: 'Maps API not configured on server' });
  }

  const loc = await googleGeocode(place_id, sessiontoken);
  if (!loc) {
    return res.status(404).json({ error: 'No location found for place_id' });
  }
  return res.json({ location: loc });
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
