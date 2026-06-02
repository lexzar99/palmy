// Leaflet-loader (CDN, singleton). Keyless karta → funkar i produktion utan
// någon Google browser-nyckel/referrer-konfiguration. Tiles från CARTO (rena
// ljusa/mörka basemaps) och reverse-geocoding via backend (/api/places/reverse).

let leafletPromise: Promise<any> | null = null;

export function loadLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  const w = window as any;
  if (w.L) return Promise.resolve(w.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    const fail = (err: Error) => { leafletPromise = null; reject(err); };

    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    const waitForReady = () => {
      const start = Date.now();
      const tick = () => {
        if (w.L) { resolve(w.L); return; }
        if (Date.now() - start > 10000) { fail(new Error("Leaflet unavailable")); return; }
        setTimeout(tick, 50);
      };
      tick();
    };

    const existing = document.getElementById("leaflet-js") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("error", () => fail(new Error("Leaflet failed to load")));
      waitForReady();
      return;
    }
    const s = document.createElement("script");
    s.id = "leaflet-js";
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.async = true;
    s.defer = true;
    s.onload = () => waitForReady();
    s.onerror = () => fail(new Error("Leaflet failed to load"));
    document.head.appendChild(s);
  });

  return leafletPromise;
}

// Rena CARTO-basemaps som matchar ljust/mörkt tema (keyless).
export const CARTO_LIGHT = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
export const CARTO_DARK = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
export const CARTO_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

export const DEFAULT_MAP_CENTER = { lat: 55.7047, lng: 13.1910 };
