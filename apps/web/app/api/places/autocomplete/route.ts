import { NextRequest, NextResponse } from "next/server";
import { checkAutocompleteLimit } from "@/lib/mapsRateLimit";

const MAPS_KEY = process.env.GOOGLE_MAPS_KEY || "";
const API_URL  = process.env.API_URL || "http://localhost:4000";

function reportUsage(ip: string) {
  fetch(`${API_URL}/api/maps-stats/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "autocomplete", ip }),
  }).catch(() => {});
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const input       = searchParams.get("input") || "";
  const sessiontoken = searchParams.get("sessiontoken") || "";

  if (!input || input.length < 3) {
    return NextResponse.json({ predictions: [] });
  }

  // ── Rate limiting ─────────────────────────────────────────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const limit = checkAutocompleteLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { predictions: [], error: "För många sökningar. Vänta lite och försök igen." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } }
    );
  }

  // ── Strategy 1: use server-side Google Maps key (preferred) ──────────────
  if (MAPS_KEY) {
    try {
      const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
      url.searchParams.set("input", input);
      url.searchParams.set("components", "country:se");
      url.searchParams.set("language", "sv");
      url.searchParams.set("types", "address");
      url.searchParams.set("sessiontoken", sessiontoken);
      url.searchParams.set("key", MAPS_KEY);

      const res  = await fetch(url.toString(), { next: { revalidate: 0 } });
      const data = await res.json() as any;

      if (data.status === "REQUEST_DENIED" || data.status === "INVALID_REQUEST") {
        // Fall through to strategy 2
      } else {
        const predictions = (data.predictions || []).map((p: any) => ({
          description: p.description,
          place_id: p.place_id,
        }));
        reportUsage(ip);
        return NextResponse.json({ predictions }, {
          headers: { "X-RateLimit-Remaining": String(limit.remaining) },
        });
      }
    } catch { /* fall through */ }
  }

  // ── Strategy 2: proxy through backend API (fallback) ─────────────────────
  // Used when GOOGLE_MAPS_KEY isn't set on this Next.js server but IS on the backend.
  try {
    const res = await fetch(`${API_URL}/api/places/autocomplete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, sessiontoken }),
    });
    const data = await res.json() as any;
    reportUsage(ip);
    return NextResponse.json(
      { predictions: data.predictions || [] },
      { headers: { "X-RateLimit-Remaining": String(limit.remaining) } }
    );
  } catch {
    return NextResponse.json({ predictions: [], error: "Autocomplete tillfälligt otillgänglig" }, { status: 503 });
  }
}
