import { api } from "./api";

export type PlaceItem = {
  id: string;
  description: string;
  source: "google";
  coords?: { lat: number; lng: number };
};

// Google Maps är primär (och enda) källa för autocomplete + geocode i RN
// och web. All trafik går via backend `/api/places/*` så vi har en enda
// nyckel att rotera (GOOGLE_MAPS_API_KEY på Railway) — klienten exponerar
// inget. Geoapify är borttaget — om Google misslyckas returneras tomt.

async function googleAutocomplete(text: string): Promise<PlaceItem[]> {
  try {
    const res = await api.post("/api/places/autocomplete", { input: text }, { timeout: 6000 });
    const predictions = res.data?.predictions;
    if (!Array.isArray(predictions) || predictions.length === 0) return [];
    return predictions
      .filter((p: any) => p?.place_id && p?.description)
      .map((p: any) => ({
        id: String(p.place_id),
        description: String(p.description),
        source: "google" as const,
      }));
  } catch {
    return [];
  }
}

export async function placesAutocomplete(
  text: string,
  _opts?: { bias?: string }
): Promise<PlaceItem[]> {
  if (!text || text.length < 3) return [];
  return googleAutocomplete(text);
}

export async function placesResolveCoords(
  item: PlaceItem
): Promise<{ lat: number; lng: number } | null> {
  if (item.coords) return item.coords;
  try {
    const res = await api.post(
      "/api/places/geocode",
      { place_id: item.id },
      { timeout: 6000 }
    );
    const loc = res.data?.location;
    if (loc && typeof loc.lat === "number" && typeof loc.lng === "number") {
      return { lat: loc.lat, lng: loc.lng };
    }
  } catch {}
  return null;
}
