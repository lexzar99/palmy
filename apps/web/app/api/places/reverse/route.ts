import { NextRequest, NextResponse } from "next/server";
import { checkGeocodeLimit } from "@/lib/mapsRateLimit";

// Reverse-geocode (lat/lng → adress) server-side så ingen browser-nyckel behövs
// → kart-väljaren funkar i produktion utan referrer-/nyckel-konfiguration.
// Strategi: 1) använd web-appens egen server-nyckel (GOOGLE_MAPS_KEY) och anropa
// Google direkt. 2) annars proxa till backend (Railway) som har nyckeln.
const API_URL =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://palmy-production-2021.up.railway.app"
    : "http://localhost:4000");

const SERVER_MAPS_KEY =
  process.env.GOOGLE_MAPS_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ||
  "";

function parse(result: any): { address: string; postalCode: string | null; city: string | null } {
  const comp: any[] = result?.address_components || [];
  const get = (type: string) => comp.find((c: any) => c.types?.includes(type))?.long_name as string | undefined;
  const route = get("route");
  const num = get("street_number");
  const zip = get("postal_code") || null;
  const city = get("postal_town") || get("locality") || get("sublocality") || null;
  const street = [route, num].filter(Boolean).join(" ") || String(result?.formatted_address || "").split(",")[0];
  const zipCity = [zip, city].filter(Boolean).join(" ");
  const address = [street, zipCity].filter(Boolean).join(", ");
  return { address, postalCode: zip, city };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat") || "";
  const lng = searchParams.get("lng") || "";
  if (!lat || !lng) return NextResponse.json({ error: "Missing lat/lng" }, { status: 400 });

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const limit = checkGeocodeLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "För många förfrågningar. Vänta lite." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } },
    );
  }

  // 1) Direkt mot Google med web-appens server-nyckel om den finns.
  if (SERVER_MAPS_KEY) {
    try {
      const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      url.searchParams.set("latlng", `${lat},${lng}`);
      url.searchParams.set("language", "sv");
      url.searchParams.set("key", SERVER_MAPS_KEY);
      const res = await fetch(url.toString());
      const data = (await res.json()) as any;
      const result = (data.results || [])[0];
      if (result) return NextResponse.json(parse(result));
    } catch {
      /* fall through to backend */
    }
  }

  // 2) Fallback: proxa till backend (har nyckeln i prod).
  try {
    const res = await fetch(`${API_URL}/api/places/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`);
    if (!res.ok) throw new Error(`Backend ${res.status}`);
    const data = (await res.json()) as { address?: string; postalCode?: string | null; city?: string | null };
    return NextResponse.json({
      address: data.address ?? null,
      postalCode: data.postalCode ?? null,
      city: data.city ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Reverse geocode misslyckades" }, { status: 500 });
  }
}
