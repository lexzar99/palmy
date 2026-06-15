// Enda källan för kart-tiles i webben. Byt en URL HÄR → hela webben byter
// kart-tjänst (adress-väljaren, order-trackingen). Speglar mobil-kurirens
// `lib/core/map_tiles.dart` så plattformarna delar leverantörer; går en tjänst
// ner byter vi på ETT ställe per app.
//
// Standard-basemapen kan dessutom överstyras med NEXT_PUBLIC_MAP_TILE_URL utan
// kodändring (t.ex. snabbt byte till Mapbox om CARTO strular i produktion).

export type TileConfig = {
  url: string;
  subdomains: string;
  maxZoom: number;
};

const VOYAGER =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

export const MAP_TILES = {
  // Modern, varm street-basemap (CARTO Voyager) — default för tracking-kartan.
  voyager: {
    url: process.env.NEXT_PUBLIC_MAP_TILE_URL || VOYAGER,
    subdomains: "abcd",
    maxZoom: 20,
  } satisfies TileConfig,
  // Rena ljusa/mörka basemaps (matchar tema) — för adress-väljaren.
  light: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    subdomains: "abcd",
    maxZoom: 20,
  } satisfies TileConfig,
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    subdomains: "abcd",
    maxZoom: 20,
  } satisfies TileConfig,
  // Satellit (Esri World Imagery, nyckelfri). OBS {y}/{x}-ordning, inga subdomains.
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    subdomains: "",
    maxZoom: 19,
  } satisfies TileConfig,
  // Endast etiketter (gator/platser) att lägga ovanpå satelliten.
  labels: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png",
    subdomains: "abcd",
    maxZoom: 20,
  } satisfies TileConfig,
} as const;

export const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

export const DEFAULT_MAP_CENTER = { lat: 55.7047, lng: 13.191 };
