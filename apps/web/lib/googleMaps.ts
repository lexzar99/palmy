// Klient-side Google Maps JS-loader (singleton). Används av AddressModal för
// den interaktiva kartan + draggbar nål + reverse-geocoding. Nyckeln
// NEXT_PUBLIC_GOOGLE_MAPS_KEY är avsiktligt klient-exponerad (krävs för Maps
// JS API som inte kan proxas server-side). Autocomplete/forward-geocode går
// fortfarande via Next-proxyn (/api/places/*) för usage-loggning.

let mapsPromise: Promise<any> | null = null;

export function loadGoogleMaps(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  const w = window as any;
  if (w.google?.maps) return Promise.resolve(w.google.maps);
  if (mapsPromise) return mapsPromise;

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!key) return Promise.reject(new Error("Missing NEXT_PUBLIC_GOOGLE_MAPS_KEY"));

  mapsPromise = new Promise((resolve, reject) => {
    // Vänta in window.google.maps även om script-onload råkar fira innan
    // API:t är fullt populerat (kan hända beroende på loader-läge).
    const waitForReady = (onTimeout: () => void) => {
      const start = Date.now();
      const tick = () => {
        if (w.google?.maps?.Map) { resolve(w.google.maps); return; }
        if (Date.now() - start > 10000) { onTimeout(); return; }
        setTimeout(tick, 60);
      };
      tick();
    };

    const existing = document.getElementById("gmaps-js") as HTMLScriptElement | null;
    if (existing) {
      waitForReady(() => reject(new Error("google.maps unavailable")));
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Maps")));
      return;
    }
    const s = document.createElement("script");
    s.id = "gmaps-js";
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
    s.async = true;
    s.defer = true;
    s.onload = () => waitForReady(() => reject(new Error("google.maps unavailable after load")));
    s.onerror = () => { mapsPromise = null; reject(new Error("Failed to load Google Maps")); };
    document.head.appendChild(s);
  });

  return mapsPromise;
}

// Default-center när vi inte har en sparad position (Lund-trakten där
// plattformen primärt opererar).
export const DEFAULT_MAP_CENTER = { lat: 55.7047, lng: 13.1910 };
