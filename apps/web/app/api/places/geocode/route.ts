import { NextRequest, NextResponse } from "next/server";

const MAPS_KEY = process.env.GOOGLE_MAPS_KEY || "";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const place_id = searchParams.get("place_id") || "";
  const sessiontoken = searchParams.get("sessiontoken") || "";

  if (!place_id) {
    return NextResponse.json({ error: "Missing place_id" }, { status: 400 });
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
    url.searchParams.set("place_id", place_id);
    url.searchParams.set("fields", "geometry"); // Only request geometry to minimize cost
    url.searchParams.set("sessiontoken", sessiontoken); // Ends the session = 1 billing event
    url.searchParams.set("key", MAPS_KEY);

    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    const data = await res.json();

    const loc = data.result?.geometry?.location;
    if (!loc) throw new Error("No location in response");

    return NextResponse.json({ location: { lat: loc.lat, lng: loc.lng } });
  } catch (err) {
    return NextResponse.json({ error: "Geocode failed" }, { status: 500 });
  }
}
