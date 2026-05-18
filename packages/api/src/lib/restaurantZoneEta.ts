import prisma from './prisma';
import { isPointInZone, haversineKm, type DeliveryZone } from '../utils/geo';
import { normalizeDeliveryZones } from '../utils/deliveryZones';
import {
  ETA_DEFAULT_MINUTES,
  ETA_ALLOWED_VALUES,
  ETA_MIN_MINUTES,
  ETA_MAX_MINUTES,
  ETA_SAMPLE_SIZE,
  ETA_MIN_SAMPLES,
  ETA_RECALC_INTERVAL,
} from './restaurantEta';

/**
 * Per-zon ETA-räkning.
 *
 * Spegelbild av restaurantEta.ts fast på zon-nivå istället för hela
 * restaurangen. Admin sätter etaMinutes per zon som "kickstart" — det
 * visas tills auto-räkning får tillräckligt med data (≥5 orders inom
 * zonen). Sedan räknas calculatedEtaMinutes från senaste 20 ordrarnas
 * createdAt → deliveringAt-snitt.
 *
 * MONOTONIC-GUARD: efter individuell beräkning säkerställer vi att
 * närmare zoner alltid har ≤ ETA än längre zoner. Sortera zoner by
 * avstånd från restaurang-pin och bump:a ETA framåt om en längre zon
 * råkat hamna under en närmare zon (statistik kan slumpa). Resultat:
 * monoton ETA-sekvens som matchar verkligheten — kortare avstånd kan
 * aldrig ta längre tid än större avstånd.
 */

const snapEta = (n: number): number => {
  const clamped = Math.max(ETA_MIN_MINUTES, Math.min(ETA_MAX_MINUTES, n));
  let best = ETA_ALLOWED_VALUES[0] as number;
  let bestDist = Math.abs(clamped - best);
  for (const value of ETA_ALLOWED_VALUES) {
    const dist = Math.abs(clamped - value);
    if (dist < bestDist) {
      best = value;
      bestDist = dist;
    }
  }
  return best;
};

/**
 * Effektiv zon-ETA: calculated om finns + tillräckligt med samples,
 * annars admin-manual (etaMinutes), annars restaurang-default.
 */
export function getEffectiveZoneEta(zone: {
  calculatedEtaMinutes?: number | null;
  etaSampleCount?: number | null;
  etaMinutes?: number | null;
}, restaurantDefault: number = ETA_DEFAULT_MINUTES): number {
  if (zone.calculatedEtaMinutes != null && (zone.etaSampleCount ?? 0) >= ETA_MIN_SAMPLES) {
    return snapEta(zone.calculatedEtaMinutes);
  }
  if (zone.etaMinutes != null) {
    return snapEta(zone.etaMinutes);
  }
  return snapEta(restaurantDefault);
}

/**
 * Distans från restaurang-pin till zone-centroid (cirkel = center, polygon =
 * snitt av hörnens lat/lng). Används för monotonic-sort.
 */
function distanceFromRestaurant(zone: DeliveryZone, restLat: number, restLng: number): number {
  if (zone.type === 'circle' && zone.centerLat != null && zone.centerLng != null) {
    return haversineKm(restLat, restLng, zone.centerLat, zone.centerLng);
  }
  if (zone.type === 'polygon' && Array.isArray(zone.polygon) && zone.polygon.length > 0) {
    const sumLng = zone.polygon.reduce((a, [lng]) => a + lng, 0);
    const sumLat = zone.polygon.reduce((a, [, lat]) => a + lat, 0);
    const centroidLng = sumLng / zone.polygon.length;
    const centroidLat = sumLat / zone.polygon.length;
    return haversineKm(restLat, restLng, centroidLat, centroidLng);
  }
  return Number.POSITIVE_INFINITY; // okänd geometri → sist
}

/**
 * Säkerställ att zoner sorterade by avstånd har monoton stigande ETA.
 * Mutate zone-objektens calculatedEtaMinutes om en längre zon har
 * mindre ETA än en närmare → bumpa upp till min(prev + 0, snappad).
 *
 * Behåller admin-kickstart-etaMinutes orörd — bara calculatedEtaMinutes
 * justeras. Admin's manuella värde är "san sanning" tills calculated
 * tar över; vi rör inte hennes input.
 */
function enforceMonotonicEta(
  zonesSortedByDistance: Array<DeliveryZone & { _effectiveEta: number }>
): void {
  for (let i = 1; i < zonesSortedByDistance.length; i++) {
    const prev = zonesSortedByDistance[i - 1];
    const curr = zonesSortedByDistance[i];
    if (curr._effectiveEta < prev._effectiveEta) {
      // Justera upp: snappa till närmaste tillåtna värde ≥ prev._effectiveEta
      const minAllowed = prev._effectiveEta;
      const snapped = snapEta(minAllowed);
      curr._effectiveEta = snapped;
      // Sätt calculatedEtaMinutes så det persisteras tillbaka i JSON.
      curr.calculatedEtaMinutes = snapped;
    }
  }
}

/**
 * Räknar om ETA per zon för en restaurang baserat på senaste leveransernas
 * createdAt → deliveringAt-snitt. Sparar resultat tillbaka i
 * Restaurant.deliveryZones JSON med calculatedEtaMinutes + etaSampleCount
 * på varje zone-objekt.
 *
 * Anropas fire-and-forget från admin.ts efter att order går till DELIVERING.
 * Trigger samma schema som per-restaurang ETA: efter 5:e ordern, sen var
 * 20:e (totalDelivered === 5, 25, 45, ...).
 */
export async function recalculateRestaurantZoneEtas(
  restaurantId: string,
  options: { force?: boolean } = {},
): Promise<void> {
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { latitude: true, longitude: true, deliveryZones: true, etaMinutes: true },
    });
    if (!restaurant || restaurant.latitude == null || restaurant.longitude == null) {
      return;
    }

    const zonesRaw = typeof restaurant.deliveryZones === 'string'
      ? JSON.parse(restaurant.deliveryZones || '[]')
      : (restaurant.deliveryZones || []);
    const zones = normalizeDeliveryZones(zonesRaw);
    if (zones.length === 0) return;

    const totalDelivered = await prisma.order.count({
      where: {
        restaurantId,
        deliveringAt: { not: null },
        type: 'DELIVERY',
        deliveryLatitude: { not: null },
        deliveryLongitude: { not: null },
      },
    });

    if (!options.force) {
      if (totalDelivered < ETA_MIN_SAMPLES) return;
      const isFirstMilestone = totalDelivered === ETA_MIN_SAMPLES;
      const isPeriodicMilestone =
        totalDelivered > ETA_MIN_SAMPLES &&
        (totalDelivered - ETA_MIN_SAMPLES) % ETA_RECALC_INTERVAL === 0;
      if (!isFirstMilestone && !isPeriodicMilestone) return;
    }

    // Hämta senaste 20×N orders med coords — N=antal zoner som hedge, så även
    // små zoner får sample-möjlighet. Capped vid 200 så inte enorma queries.
    const sampleLimit = Math.min(200, ETA_SAMPLE_SIZE * Math.max(1, zones.length));
    const samples = await prisma.order.findMany({
      where: {
        restaurantId,
        deliveringAt: { not: null },
        type: 'DELIVERY',
        deliveryLatitude: { not: null },
        deliveryLongitude: { not: null },
      },
      orderBy: { deliveringAt: 'desc' },
      take: sampleLimit,
      select: {
        createdAt: true,
        deliveringAt: true,
        deliveryLatitude: true,
        deliveryLongitude: true,
      },
    });

    const cityCenter = { lat: restaurant.latitude, lng: restaurant.longitude };

    // Bucket samples per zon. En sample går till FÖRSTA zon den matchar
    // (zoner är ordnade i admin → tier 1 (core) vinner före tier 2 (outer)
    // om geometrier överlappar).
    const buckets = new Map<string, number[]>(); // zone.id → array of duration minutes
    for (const z of zones) buckets.set(z.id, []);

    for (const s of samples) {
      const lat = s.deliveryLatitude!;
      const lng = s.deliveryLongitude!;
      const ms = s.deliveringAt!.getTime() - s.createdAt.getTime();
      const minutes = ms / 60_000;
      if (minutes <= 0 || minutes > 240) continue; // sanity
      for (const z of zones) {
        if (isPointInZone(lat, lng, z, cityCenter)) {
          buckets.get(z.id)!.push(minutes);
          break;
        }
      }
    }

    // Räkna calculatedEtaMinutes per zon där tillräckligt sample finns.
    const enriched: Array<DeliveryZone & { _effectiveEta: number }> = zones.map((z) => {
      const samples = buckets.get(z.id) || [];
      let calculatedEtaMinutes: number | undefined;
      if (samples.length >= ETA_MIN_SAMPLES) {
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
        calculatedEtaMinutes = snapEta(avg);
      }
      const next: DeliveryZone = {
        ...z,
        calculatedEtaMinutes,
        etaSampleCount: samples.length,
      };
      const effective = getEffectiveZoneEta(next, restaurant.etaMinutes ?? ETA_DEFAULT_MINUTES);
      return { ...next, _effectiveEta: effective };
    });

    // Sortera by avstånd från restaurang och tillämpa monotonic-guard.
    enriched.sort((a, b) => distanceFromRestaurant(a, cityCenter.lat, cityCenter.lng) - distanceFromRestaurant(b, cityCenter.lat, cityCenter.lng));
    enforceMonotonicEta(enriched);

    // Spara tillbaka. Plocka bort _effectiveEta (internal) innan persist.
    const updatedJson = enriched.map(({ _effectiveEta, ...zone }) => ({
      ...zone,
      // Konvertera öre→kr för admin-form-kompatibilitet (admin sparar i kr,
      // normalizeDeliveryZones gör om till öre vid läsning).
      fee: zone.fee / 100,
      minOrder: zone.minOrder / 100,
    }));

    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { deliveryZones: JSON.stringify(updatedJson) },
    });
  } catch (error) {
    console.warn(`[restaurantZoneEta] recalc failed for ${restaurantId}:`, (error as Error).message);
  }
}
