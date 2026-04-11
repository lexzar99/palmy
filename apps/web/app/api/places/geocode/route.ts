import { NextRequest, NextResponse } from "next/server";
import { checkGeocodeLimit } from "@/lib/mapsRateLimit";

const API_URL = process.env.API_URL || "http://localhost:4000";

function reportUsage(ip: string) {
  fetch(`${API_URL}/api/maps-stats/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "geocode", ip }),
  }).catch(() => {});
}

const MAPS_KEY = process.env.GOOGLE_MAPS_KEY || "";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const place_id = searchParams.get("place_id") || "";
  const sessiontoken = searchParams.get("sessiontoken") || "";

  if (!place_id) {
    return NextResponse.json({ error: "Missing place_id" }, { status: 400 });
  }

  // ── Rate limiting ────────────────────────────────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const limit = checkGeocodeLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "För många förfrågningar. Vänta lite och försök igen.",
        retryAfter: Math.ceil((limit.resetAt - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  if (!MAPS_KEY) {
    return NextResponse.json({ error: "Maps API not configured" }, { status: 500 });
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
    url.searchParams.set("place_id", place_id);
    url.searchParams.set("fields", "geometry"); // Only geometry = lowest cost tier
    url.searchParams.set("sessiontoken", sessiontoken); // Ends session → 1 billing event
    url.searchParams.set("key", MAPS_KEY);

    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    const data = await res.json();

    const loc = data.result?.geometry?.location;
    if (!loc) throw new Error("No location in response");

    // Report usage to backend (fire-and-forget)
    reportUsage(ip);

    return NextResponse.json({ location: { lat: loc.lat, lng: loc.lng } });
  } catch {
    return NextResponse.json({ error: "Geocode failed" }, { status: 500 });
  }
}
