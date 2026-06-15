/// Centraliserad kart-tile-konfiguration för Delivera Courier.
///
/// ALLA kartor i appen läser härifrån — byt en URL här och hela appen byter
/// kart-tjänst. (Speglar webbens `apps/web/lib/mapTiles.ts` så plattformarna
/// håller samma leverantörer; går en tjänst ner byter vi på ETT ställe per app.)
class MapTiles {
  MapTiles._();

  // ── Standard modern basemap: CARTO Voyager (nyckelfri, OSM-baserad) ─────────
  static const String voyagerUrl =
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';
  static const List<String> cartoSubdomains = ['a', 'b', 'c', 'd'];

  // ── Satellit: Esri World Imagery (nyckelfri). OBS {y}/{x}-ordningen. ────────
  static const String satelliteUrl =
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

  // ── Endast etiketter (gator/platser) att lägga OVANPÅ satelliten ───────────
  static const String labelsUrl =
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png';

  static const String userAgent = 'se.delivera.courier';
}
