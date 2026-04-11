import { NextRequest, NextResponse } from "next/server";

const MAPS_KEY = process.env.GOOGLE_MAPS_KEY || "";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const input = searchParams.get("input") || "";
  const sessiontoken = searchParams.get("sessiontoken") || "";

  if (!input || input.length < 3) {
    return NextResponse.json({ predictions: [] });
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
    url.searchParams.set("input", input);
    url.searchParams.set("components", "country:se");
    url.searchParams.set("language", "sv");
    url.searchParams.set("sessiontoken", sessiontoken);
    url.searchParams.set("key", MAPS_KEY);
    // Restrict to addresses only to save money
    url.searchParams.set("types", "address");

    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    const data = await res.json();

    // Only return what the frontend needs (reduce payload)
    const predictions = (data.predictions || []).map((p: any) => ({
      description: p.description,
      place_id: p.place_id,
    }));

    return NextResponse.json({ predictions });
  } catch (err) {
    return NextResponse.json({ predictions: [], error: "Autocomplete failed" }, { status: 500 });
  }
}
