import { NextRequest, NextResponse } from "next/server";
import { checkAutocompleteLimit } from "@/lib/mapsRateLimit";

// Always route through the backend proxy — avoids IP-restriction issues.
// Mirror the same URL resolution logic as apps/web/lib/api.ts so production
// deployments without API_URL set still find the right backend.
const API_URL =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://api.viaeats.se"
    : "http://localhost:4000");

function reportUsage(ip: string) {
  fetch(`${API_URL}/api/maps-stats/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "autocomplete", ip }),
  }).catch(() => {});
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const input        = searchParams.get("input") || "";
  const sessiontoken = searchParams.get("sessiontoken") || "";

  if (!input || input.length < 3) {
    return NextResponse.json({ predictions: [] });
  }

  // Rate limiting
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

  // Proxy through backend (key lives there, no IP restriction issue)
  try {
    const res = await fetch(`${API_URL}/api/places/autocomplete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, sessiontoken }),
    });

    if (!res.ok) throw new Error(`Backend ${res.status}`);
    const data = (await res.json()) as { predictions?: unknown[] };

    reportUsage(ip);
    return NextResponse.json(
      { predictions: data.predictions || [] },
      { headers: { "X-RateLimit-Remaining": String(limit.remaining) } }
    );
  } catch {
    return NextResponse.json(
      { predictions: [], error: "Söktjänsten är tillfälligt otillgänglig." },
      { status: 503 }
    );
  }
}
