/**
 * Customer-visible self-delivery transit window. Platform deliveries are
 * completed only by their courier, never by this timer.
 *
 * Fönstret är restaurangens "tid till kund" som sattes vid PÅ VÄG
 * (etaCustomerAt). Terminalen v2 skickar ingen egen tid längre; då räknar
 * servern fram den ur avståndet ([selfDeliveryMinutesForDistance]). Saknas
 * en sådan tid (äldre ordrar) gäller 15 minuter som förut. Samma fönster
 * styr kundens nedräkning och när ordern markeras som levererad.
 */

const DEFAULT_WINDOW_MIN = 15;
const MIN_WINDOW_MIN = 5;
const MAX_WINDOW_MIN = 90;

export function computeDeliveryWindowMs(
  deliveringAt: Date,
  orderId: string,
  etaCustomerAt?: Date | string | null,
): number {
  void orderId;
  if (etaCustomerAt) {
    const diffMin = (new Date(etaCustomerAt).getTime() - deliveringAt.getTime()) / 60_000;
    if (Number.isFinite(diffMin) && diffMin >= 0) {
      return Math.round(Math.min(MAX_WINDOW_MIN, Math.max(MIN_WINDOW_MIN, diffMin)) * 60_000);
    }
  }
  return DEFAULT_WINDOW_MIN * 60 * 1000;
}

/** Fågelvägen i km mellan två punkter (haversine). */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Egen hemkörning: 15 minuter upp till 1,5 km, 25 minuter från 6 km, linjärt
 * däremellan. Okänt avstånd ger 20 minuter.
 */
export function selfDeliveryMinutesForDistance(km: number | null | undefined): number {
  if (km == null || !Number.isFinite(km) || km < 0) return 20;
  const t = Math.min(1, Math.max(0, (km - 1.5) / 4.5));
  return Math.round(15 + 10 * t);
}

/** Orsaker som bara sätts vid själva PÅ VÄG-övergången (routes/admin.ts). */
export const DEPARTURE_ETA_REASONS = ['Restaurangens tid till kund', 'Avstånd till kund'];

/**
 * Kundens tid räknas som leveransfönster bara om den sattes vid PÅ VÄG. En
 * äldre uppskattning från köksfasen kan ligga efter deliveringAt men får
 * aldrig förlänga fönstret eller visas som tid till dörren.
 */
export function departureEtaCustomerAt(order: {
  etaCustomerAt?: Date | string | null;
  etaReason?: string | null;
  deliveringAt?: Date | string | null;
}): Date | null {
  if (!order.etaCustomerAt || !order.deliveringAt) return null;
  if (!order.etaReason || !DEPARTURE_ETA_REASONS.includes(order.etaReason)) return null;
  const at = new Date(order.etaCustomerAt);
  return at.getTime() >= new Date(order.deliveringAt).getTime() ? at : null;
}

type Coordinates = { latitude?: number | null; longitude?: number | null };

export function selfDeliveryMinutes(
  order: { deliveryLatitude?: number | null; deliveryLongitude?: number | null },
  restaurant: Coordinates | null | undefined,
): number {
  const { deliveryLatitude: lat, deliveryLongitude: lng } = order;
  if (lat == null || lng == null || restaurant?.latitude == null || restaurant?.longitude == null) {
    return selfDeliveryMinutesForDistance(null);
  }
  return selfDeliveryMinutesForDistance(distanceKm(restaurant.latitude, restaurant.longitude, lat, lng));
}
