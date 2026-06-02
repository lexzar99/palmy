// Klient-side Google Maps JS-loader (singleton). Används av AddressModal för
// den interaktiva kartan + draggbar nål + reverse-geocoding. Nyckeln
// NEXT_PUBLIC_GOOGLE_MAPS_KEY är avsiktligt klient-exponerad (krävs för Maps
// JS API som inte kan proxas server-side). Autocomplete/forward-geocode går
// fortfarande via Next-proxyn (/api/places/*) för usage-loggning.

let mapsPromise: Promise<any> | null = null;
let cachedKey: string | null = null;

// Hämta browser-nyckeln. Föredrar den build-inlinade NEXT_PUBLIC-varianten, men
// faller tillbaka till runtime-API:t /api/maps-key — så kartan funkar i prod
// även om NEXT_PUBLIC inte hann med i builden (nyckeln läses då server-side).
async function resolveMapsKey(): Promise<string> {
  const inlined = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (inlined) return inlined;
  if (cachedKey !== null) return cachedKey;
  try {
    const res = await fetch("/api/maps-key");
    const data = await res.json();
    cachedKey = (data?.key as string) || "";
  } catch {
    cachedKey = "";
  }
  return cachedKey;
}

export function loadGoogleMaps(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  const w = window as any;
  if (w.google?.maps?.Map) return Promise.resolve(w.google.maps);
  if (mapsPromise) return mapsPromise;

  mapsPromise = new Promise((resolve, reject) => {
    // VIKTIGT: cacha ALDRIG ett avvisat löfte. Tidigare poisonades singleton:en
    // av ett enda transient-fel → "Kartan kunde inte laddas" för alltid tills
    // sid-omladdning. Nu nollas mapsPromise + det trasiga scriptet tas bort så
    // nästa öppning av modalen kan göra ett nytt försök.
    const fail = (err: Error) => {
      mapsPromise = null;
      const stale = document.getElementById("gmaps-js");
      if (stale && !w.google?.maps?.Map) stale.remove();
      reject(err);
    };
    // Vänta in window.google.maps även om script-onload råkar fira innan
    // API:t är fullt populerat.
    const waitForReady = () => {
      const start = Date.now();
      const tick = () => {
        if (w.google?.maps?.Map) { resolve(w.google.maps); return; }
        if (Date.now() - start > 12000) { fail(new Error("google.maps unavailable")); return; }
        setTimeout(tick, 60);
      };
      tick();
    };

    const existing = document.getElementById("gmaps-js") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("error", () => fail(new Error("Failed to load Google Maps")));
      waitForReady();
      return;
    }

    resolveMapsKey().then((key) => {
      if (!key) { fail(new Error("Missing Google Maps key")); return; }
      const s = document.createElement("script");
      s.id = "gmaps-js";
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
      s.async = true;
      s.defer = true;
      s.onload = () => waitForReady();
      s.onerror = () => fail(new Error("Failed to load Google Maps"));
      document.head.appendChild(s);
    });
  });

  return mapsPromise;
}

// Default-center när vi inte har en sparad position (Lund-trakten där
// plattformen primärt opererar).
export const DEFAULT_MAP_CENTER = { lat: 55.7047, lng: 13.1910 };
