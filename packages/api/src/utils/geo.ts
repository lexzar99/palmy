/**
 * Geo utilities: Haversine, point-in-polygon, zone matching.
 */

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Ray-casting point-in-polygon. polygon is [[lng, lat], ...] */
export function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Each delivery zone now carries its own geometry:
 * - type "circle": centerLat/centerLng/radiusKm
 * - type "polygon": polygon [[lng,lat],...]
 * Legacy zones (no type) are treated as circles from the city center.
 */
export interface DeliveryZone {
  id: string;
  name: string;
  type: 'circle' | 'polygon';
  // circle fields
  centerLat?: number;
  centerLng?: number;
  radiusKm: number;
  // polygon fields
  polygon?: [number, number][];
  // Canonical pricing (explicit minor units).
  feeOre: number;
  minOrderOre: number;
  // Deprecated aliases, also in ore. Kept for web/Swift compatibility while
  // clients migrate to feeOre/minOrderOre.
  fee: number;
  minOrder: number;
  isActive: boolean;
  color?: string;
  /** Admin-satt "kickstart"-ETA i minuter. Visas tills auto-räkning får data. */
  etaMinutes?: number;
  /** Auto-räknat ETA från order-historik (recalculateRestaurantZoneEtas).
   *  null = inte tillräckligt med data än → fall back till etaMinutes. */
  calculatedEtaMinutes?: number;
  /** Antal samples som ledde till calculatedEtaMinutes. Användbart för UI. */
  etaSampleCount?: number;
}

/**
 * Returns true if a lat/lng point is covered by a zone.
 * cityCenter is used as fallback for legacy zones with no own geometry.
 */
export function isPointInZone(
  lat: number,
  lng: number,
  zone: DeliveryZone,
  cityCenter?: { lat: number; lng: number }
): boolean {
  if (!zone.isActive) return false;

  if (zone.type === 'polygon' && Array.isArray(zone.polygon) && zone.polygon.length > 2) {
    return pointInPolygon([lng, lat], zone.polygon);
  }

  // Circle: use own center if available, else fall back to city center
  const clat = zone.centerLat ?? cityCenter?.lat;
  const clng = zone.centerLng ?? cityCenter?.lng;
  if (clat !== undefined && clng !== undefined && zone.radiusKm > 0) {
    return haversineKm(lat, lng, clat, clng) <= zone.radiusKm;
  }

  return false;
}

/** Returns the best-matching zone (smallest coverage area first). */
export function findDeliveryZone(
  lat: number,
  lng: number,
  zones: DeliveryZone[],
  cityCenter?: { lat: number; lng: number }
): DeliveryZone | null {
  // Sort by "coverage size" - circles by radiusKm, polygons last within same fee tier
  const active = zones.filter(z => z.isActive);
  const circles = active.filter(z => z.type !== 'polygon').sort((a, b) => a.radiusKm - b.radiusKm);
  const polygons = active.filter(z => z.type === 'polygon');
  const sorted = [...circles, ...polygons];

  for (const zone of sorted) {
    if (isPointInZone(lat, lng, zone, cityCenter)) return zone;
  }
  return null;
}
