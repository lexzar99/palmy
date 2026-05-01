import { api } from "./api";
import { EXPO_PUBLIC_GEOAPIFY_KEY } from "./env";

export type PlaceItem = {
  id: string;
  description: string;
  source: "google" | "geoapify";
  coords?: { lat: number; lng: number };
};

const GEOAPIFY_AUTOCOMPLETE = "https://api.geoapify.com/v1/geocode/autocomplete";

async function googleAutocomplete(text: string): Promise<PlaceItem[] | null> {
  try {
    const res = await api.post("/api/places/autocomplete", { input: text }, { timeout: 6000 });
    const predictions = res.data?.predictions;
    if (!Array.isArray(predictions) || predictions.length === 0) return null;
    return predictions
      .filter((p: any) => p?.place_id && p?.description)
      .map((p: any) => ({
        id: String(p.place_id),
        description: String(p.description),
        source: "google" as const,
      }));
  } catch {
    return null;
  }
}

async function geoapifyAutocomplete(text: string, bias?: string): Promise<PlaceItem[]> {
  if (!EXPO_PUBLIC_GEOAPIFY_KEY) return [];
  try {
    const url = new URL(GEOAPIFY_AUTOCOMPLETE);
    url.searchParams.set("text", text);
    url.searchParams.set("filter", "countrycode:se");
    if (bias) url.searchParams.set("bias", bias);
    url.searchParams.set("limit", "5");
    url.searchParams.set("apiKey", EXPO_PUBLIC_GEOAPIFY_KEY);

    const res = await fetch(url.toString());
    const data = await res.json();
    const features = Array.isArray(data?.features) ? data.features : [];
    return features
      .map((f: any, idx: number) => {
        const formatted = f?.properties?.formatted;
        const coords = f?.geometry?.coordinates;
        if (!formatted) return null;
        return {
          id: `geoapify:${f?.properties?.place_id ?? formatted}:${idx}`,
          description: String(formatted),
          source: "geoapify" as const,
          coords:
            Array.isArray(coords) && coords.length === 2
              ? { lat: Number(coords[1]), lng: Number(coords[0]) }
              : undefined,
        } satisfies PlaceItem;
      })
      .filter((x: PlaceItem | null): x is PlaceItem => x !== null);
  } catch {
    return [];
  }
}

export async function placesAutocomplete(
  text: string,
  opts?: { bias?: string }
): Promise<PlaceItem[]> {
  if (!text || text.length < 3) return [];

  const google = await googleAutocomplete(text);
  if (google && google.length > 0) return google;

  return geoapifyAutocomplete(text, opts?.bias);
}

export async function placesResolveCoords(
  item: PlaceItem
): Promise<{ lat: number; lng: number } | null> {
  if (item.coords) return item.coords;
  if (item.source !== "google") return null;

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
