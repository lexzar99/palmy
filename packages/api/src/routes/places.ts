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

  if (!MAPS_KEY) {
    return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY saknas på servern' });
  }

  const google = await googleAutocomplete(input, sessiontoken);
  if (google === null) {
    return res.status(500).json({ predictions: [], error: 'Autocomplete failed' });
  }
  return res.json({ predictions: google });
}

async function handleGeocode(place_id: string, sessiontoken: string | undefined, res: Response) {
  if (!place_id) {
    return res.status(400).json({ error: 'place_id required' });
  }

  if (!MAPS_KEY) {
    return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY saknas på servern' });
  }

  const result = await googleGeocode(place_id, sessiontoken);
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
