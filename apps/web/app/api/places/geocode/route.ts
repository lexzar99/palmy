import { NextRequest, NextResponse } from "next/server";
import { checkGeocodeLimit } from "@/lib/mapsRateLimit";

const MAPS_KEY = process.env.GOOGLE_MAPS_KEY || "";
const API_URL  = process.env.API_URL || "http://localhost:4000";

function reportUsage(ip: string) {
  fetch(`${API_URL}/api/maps-stats/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "geocode", ip }),
  }).catch(() => {});
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const place_id    = searchParams.get("place_id") || "";
  const sessiontoken = searchParams.get("sessiontoken") || "";

  if (!place_id) {
    return NextResponse.json({ error: "Missing place_id" }, { status: 400 });
  }

  // ── Rate limiting ─────────────────────────────────────────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const limit = checkGeocodeLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "För många förfrågningar. Vänta lite och försök igen." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } }
    );
  }

  // ── Strategy 1: direct Google Places Details ──────────────────────────────
  if (MAPS_KEY) {
    try {
      const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
      url.searchParams.set("place_id", place_id);
      url.searchParams.set("fields", "geometry");
      url.searchParams.set("sessiontoken", sessiontoken);
      url.searchParams.set("key", MAPS_KEY);

      const res  = await fetch(url.toString(), { next: { revalidate: 0 } });
      const data = await res.json() as any;

      const loc = data.result?.geometry?.location;
      if (loc) {
        reportUsage(ip);
        return NextResponse.json({ location: { lat: loc.lat, lng: loc.lng } });
      }
      // Fall through if no location
    } catch { /* fall through */ }
  }

  // ── Strategy 2: proxy to backend ─────────────────────────────────────────
  try {
    const res = await fetch(`${API_URL}/api/places/geocode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ place_id, sessiontoken }),
    });
    const data = await res.json() as any;
    if (data.location) {
      reportUsage(ip);
      return NextResponse.json({ location: data.location });
    }
    throw new Error("No location");
  } catch {
    return NextResponse.json({ error: "Geocode misslyckades" }, { status: 500 });
  }
}
