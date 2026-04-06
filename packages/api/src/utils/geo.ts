/**
 * Calculate distance between two GPS coordinates using Haversine formula.
 * Returns distance in kilometers.
 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface DeliveryZone {
  id: string;
  name: string;
  radiusKm: number;
  fee: number;       // delivery fee in öre (kr * 100)
  minOrder: number;   // minimum order in öre
  isActive: boolean;
}

/**
 * Find which zone a customer falls into, based on distance to restaurant.
 * Zones must be sorted innermost → outermost.
 * Returns the matching zone, or null if outside all zones.
 */
export function findDeliveryZone(
  distanceKm: number,
  zones: DeliveryZone[]
): DeliveryZone | null {
  const sorted = [...zones].filter(z => z.isActive).sort((a, b) => a.radiusKm - b.radiusKm);
  for (const zone of sorted) {
    if (distanceKm <= zone.radiusKm) return zone;
  }
  return null;
}
