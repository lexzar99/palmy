// Leaflet-loader (CDN, singleton). Keyless karta → funkar i produktion utan
// någon Google browser-nyckel/referrer-konfiguration. Tiles från CARTO (rena
// ljusa/mörka basemaps) och reverse-geocoding via backend (/api/places/reverse).

type LeafletModule = typeof import("leaflet");

let leafletPromise: Promise<LeafletModule> | null = null;

export function loadLeaflet(): Promise<LeafletModule> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  const w = window as unknown as Window & { L?: LeafletModule };
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
        if (w.L) { resolve(w.L as LeafletModule); return; }
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

// Tile-URL:erna bor numera i ETT ställe (lib/mapTiles.ts) så hela webben byter
// kart-tjänst på en rad. Re-exporteras här för bakåtkompatibilitet.
import { MAP_TILES, CARTO_ATTRIBUTION as ATTR, DEFAULT_MAP_CENTER as CENTER } from "./mapTiles";

export const CARTO_LIGHT = MAP_TILES.light.url;
export const CARTO_DARK = MAP_TILES.dark.url;
export const CARTO_ATTRIBUTION = ATTR;
export const DEFAULT_MAP_CENTER = CENTER;
