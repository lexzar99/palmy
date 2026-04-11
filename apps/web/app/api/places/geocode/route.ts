import { NextRequest, NextResponse } from "next/server";
import { checkGeocodeLimit } from "@/lib/mapsRateLimit";

// Always route through the backend proxy — avoids IP-restriction issues.
const API_URL =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://palmy-production-2021.up.railway.app"
    : "http://localhost:4000");

function reportUsage(ip: string) {
  fetch(`${API_URL}/api/maps-stats/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "geocode", ip }),
  }).catch(() => {});
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const place_id     = searchParams.get("place_id") || "";
  const sessiontoken = searchParams.get("sessiontoken") || "";

  if (!place_id) {
    return NextResponse.json({ error: "Missing place_id" }, { status: 400 });
  }

  // Rate limiting
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const limit = checkGeocodeLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "För många förfrågningar. Vänta lite." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } }
    );
  }

  // Proxy through backend
  try {
    const res = await fetch(`${API_URL}/api/places/geocode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ place_id, sessiontoken }),
    });

    if (!res.ok) throw new Error(`Backend ${res.status}`);
    const data = await res.json() as any;

    if (!data.location) throw new Error("No location in response");

    reportUsage(ip);
    return NextResponse.json({ location: data.location });
  } catch {
    return NextResponse.json({ error: "Geocode misslyckades" }, { status: 500 });
  }
}
