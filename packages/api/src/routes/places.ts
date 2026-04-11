/**
 * Google Places Proxy — backend route
 *
 * Used by React Native (Expo) app so the Google Maps API key stays server-side.
 * Rate-limited to prevent abuse.
 *
 * GET /api/places/autocomplete?input=...&sessiontoken=...
 * GET /api/places/geocode?place_id=...&sessiontoken=...
 */
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

const router = Router();

const MAPS_KEY = process.env.GOOGLE_MAPS_KEY || '';

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

// ── POST /api/places/autocomplete ────────────────────────────────────────────
// Accepts POST so the key never leaks in query params when called via react-native fetch
router.post('/autocomplete', autocompleteLimiter, async (req: Request, res: Response) => {
  const { input, sessiontoken } = req.body as { input?: string; sessiontoken?: string };

  if (!input || input.length < 3) {
    return res.json({ predictions: [] });
  }

  if (!MAPS_KEY) {
    return res.status(500).json({ error: 'Maps API not configured on server' });
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input', input);
    url.searchParams.set('components', 'country:se');
    url.searchParams.set('language', 'sv');
    url.searchParams.set('types', 'address');
    if (sessiontoken) url.searchParams.set('sessiontoken', sessiontoken);
    url.searchParams.set('key', MAPS_KEY);

    const response = await fetch(url.toString());
    const data = await response.json() as any;

    const predictions = (data.predictions || []).map((p: any) => ({
      description: p.description,
      place_id: p.place_id,
    }));

    res.json({ predictions });
  } catch {
    res.status(500).json({ predictions: [], error: 'Autocomplete failed' });
  }
});

// ── GET /api/places/autocomplete (also accept GET for compatibility) ──────────
router.get('/autocomplete', autocompleteLimiter, async (req: Request, res: Response) => {
  const input = (req.query.input as string) || '';
  const sessiontoken = (req.query.sessiontoken as string) || '';

  if (!input || input.length < 3) {
    return res.json({ predictions: [] });
  }

  if (!MAPS_KEY) {
    return res.status(500).json({ error: 'Maps API not configured on server' });
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input', input);
    url.searchParams.set('components', 'country:se');
    url.searchParams.set('language', 'sv');
    url.searchParams.set('types', 'address');
    if (sessiontoken) url.searchParams.set('sessiontoken', sessiontoken);
    url.searchParams.set('key', MAPS_KEY);

    const response = await fetch(url.toString());
    const data = await response.json() as any;

    const predictions = (data.predictions || []).map((p: any) => ({
      description: p.description,
      place_id: p.place_id,
    }));

    res.json({ predictions });
  } catch {
    res.status(500).json({ predictions: [], error: 'Autocomplete failed' });
  }
});

// ── POST /api/places/geocode ─────────────────────────────────────────────────
router.post('/geocode', geocodeLimiter, async (req: Request, res: Response) => {
  const { place_id, sessiontoken } = req.body as { place_id?: string; sessiontoken?: string };

  if (!place_id) {
    return res.status(400).json({ error: 'place_id required' });
  }

  if (!MAPS_KEY) {
    return res.status(500).json({ error: 'Maps API not configured on server' });
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', place_id);
    url.searchParams.set('fields', 'geometry');
    if (sessiontoken) url.searchParams.set('sessiontoken', sessiontoken);
    url.searchParams.set('key', MAPS_KEY);

    const response = await fetch(url.toString());
    const data = await response.json() as any;

    const loc = data.result?.geometry?.location;
    if (!loc) {
      return res.status(404).json({ error: 'No location found for place_id' });
    }

    res.json({ location: { lat: loc.lat, lng: loc.lng } });
  } catch {
    res.status(500).json({ error: 'Geocode failed' });
  }
});

// ── GET /api/places/geocode (for compatibility) ───────────────────────────────
router.get('/geocode', geocodeLimiter, async (req: Request, res: Response) => {
  const place_id = (req.query.place_id as string) || '';
  const sessiontoken = (req.query.sessiontoken as string) || '';

  if (!place_id) {
    return res.status(400).json({ error: 'place_id required' });
  }

  if (!MAPS_KEY) {
    return res.status(500).json({ error: 'Maps API not configured on server' });
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', place_id);
    url.searchParams.set('fields', 'geometry');
    if (sessiontoken) url.searchParams.set('sessiontoken', sessiontoken);
    url.searchParams.set('key', MAPS_KEY);

    const response = await fetch(url.toString());
    const data = await response.json() as any;

    const loc = data.result?.geometry?.location;
    if (!loc) {
      return res.status(404).json({ error: 'No location found for place_id' });
    }

    res.json({ location: { lat: loc.lat, lng: loc.lng } });
  } catch {
    res.status(500).json({ error: 'Geocode failed' });
  }
});

export default router;
