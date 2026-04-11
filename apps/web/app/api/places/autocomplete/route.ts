import { NextRequest, NextResponse } from "next/server";
import { checkAutocompleteLimit } from "@/lib/mapsRateLimit";

const API_URL = process.env.API_URL || "http://localhost:4000";

// Fire-and-forget usage report to backend
function reportUsage(ip: string) {
  fetch(`${API_URL}/api/maps-stats/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "autocomplete", ip }),
  }).catch(() => {}); // ignore errors
}

const MAPS_KEY = process.env.GOOGLE_MAPS_KEY || "";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const input = searchParams.get("input") || "";
  const sessiontoken = searchParams.get("sessiontoken") || "";

  if (!input || input.length < 3) {
    return NextResponse.json({ predictions: [] });
  }

  // ── Rate limiting ────────────────────────────────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const limit = checkAutocompleteLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        predictions: [],
        error: "För många sökningar. Vänta lite och försök igen.",
        retryAfter: Math.ceil((limit.resetAt - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  if (!MAPS_KEY) {
    return NextResponse.json({ predictions: [], error: "Maps API not configured" }, { status: 500 });
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
    url.searchParams.set("input", input);
    url.searchParams.set("components", "country:se");
    url.searchParams.set("language", "sv");
    url.searchParams.set("sessiontoken", sessiontoken);
    url.searchParams.set("key", MAPS_KEY);
    // Restrict to addresses only to reduce cost
    url.searchParams.set("types", "address");

    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    const data = await res.json();

    // Only return what the frontend needs (reduce payload + hide raw API data)
    const predictions = (data.predictions || []).map((p: any) => ({
      description: p.description,
      place_id: p.place_id,
    }));

    // Report usage to backend (fire-and-forget)
    reportUsage(ip);

    return NextResponse.json(
      { predictions },
      {
        headers: {
          "X-RateLimit-Remaining": String(limit.remaining),
        },
      }
    );
  } catch {
    return NextResponse.json({ predictions: [], error: "Autocomplete failed" }, { status: 500 });
  }
}
