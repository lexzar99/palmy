import { NextRequest, NextResponse } from "next/server";
import { checkGeocodeLimit } from "@/lib/mapsRateLimit";
import { isDeliverableStreet } from "@/lib/deliveryAddress";

// Reverse-geocode (lat/lng → adress) server-side så ingen browser-nyckel behövs
// → kart-väljaren funkar i produktion utan referrer-/nyckel-konfiguration.
// Strategi: 1) använd web-appens egen server-nyckel (GOOGLE_MAPS_KEY) och anropa
// Google direkt. 2) annars proxa till backend (Railway) som har nyckeln.
const API_URL =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://api.viaeats.se"
    : "http://localhost:4000");

const SERVER_MAPS_KEY =
  process.env.GOOGLE_MAPS_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ||
  "";

interface GeocodeComponent {
  long_name?: string;
  types?: string[];
}

interface GeocodeResult {
  address_components?: GeocodeComponent[];
  formatted_address?: string;
}

/**
 * Returnerar bara en adress som faktiskt går att köra ut till.
 *
 * Fallbacken på `formatted_address` finns kvar — landsbygdsadresser som
 * "Gårdstånga 309" saknar ofta strukturerad route/street_number — men allt
 * som kommer ut måste klara samma gatuadress-regel som ordern valideras mot.
 * En nål mitt i ett fält gav annars ett postnummerområde eller en plus-kod
 * ("HWX2+X2 Malmö") som såg ut som en giltig leveransadress. `null` betyder
 * "fortsätt leta" — anroparen provar backend och svarar annars tomt, så
 * kunden ombeds flytta nålen eller söka upp adressen.
 */
function parse(
  result: GeocodeResult,
): { address: string; postalCode: string | null; city: string | null } | null {
  const comp: GeocodeComponent[] = result?.address_components || [];
  const get = (type: string) => comp.find((c) => c.types?.includes(type))?.long_name;
  const route = get("route");
  const num = get("street_number");
  const street = route && num
    ? `${route} ${num}`
    : String(result?.formatted_address || "").split(",")[0].trim();
  if (!isDeliverableStreet(street)) return null;
  const zip = get("postal_code") || null;
  const city = get("postal_town") || get("locality") || get("sublocality") || null;
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
      const data = (await res.json()) as { results?: GeocodeResult[] };
      // Google sorterar det mest specifika först, men en nål utanför bebyggelse
      // ger bara områdesträffar. Leta efter den första som har gata + nummer
      // innan vi ger upp och provar backend.
      for (const result of data.results || []) {
        const parsed = parse(result);
        if (parsed) return NextResponse.json(parsed);
      }
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
