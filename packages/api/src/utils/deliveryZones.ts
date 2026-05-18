import type { DeliveryZone } from './geo';

const toNum = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
};

/**
 * Normalises raw zone data from DB / admin UIs into canonical DeliveryZone.
 * - Handles legacy zones (just radiusKm, no type/geometry)
 * - Handles new zones (type + centerLat/centerLng or polygon)
 * - All money values → öre
 */
export const normalizeDeliveryZones = (raw: unknown): DeliveryZone[] => {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((z: any): DeliveryZone | null => {
      const id = String(z?.id ?? '');
      const name = String(z?.name ?? '');
      if (!id || !name) return null;

      const type: 'circle' | 'polygon' =
        z?.type === 'polygon' ? 'polygon' : 'circle';

      const radiusKm = toNum(z?.radiusKm) ?? 0;

      const feeRaw = toNum(z?.fee ?? z?.deliveryFee ?? z?.delivery_fee) ?? 0;
      const minRaw = toNum(z?.minOrder ?? z?.min_order) ?? 0;

      const fee = normalizeMoneyToOre(feeRaw);
      const minOrder = normalizeMoneyToOre(minRaw);
      const isActive = z?.isActive === false ? false : true;

      const zone: DeliveryZone = {
        id,
        name,
        type,
        radiusKm,
        fee,
        minOrder,
        isActive,
      };

      // Carry through geometry fields
      if (type === 'polygon' && Array.isArray(z?.polygon)) {
        zone.polygon = z.polygon;
      }
      if (toNum(z?.centerLat) !== null) zone.centerLat = toNum(z.centerLat)!;
      if (toNum(z?.centerLng) !== null) zone.centerLng = toNum(z.centerLng)!;
      if (z?.color && typeof z.color === 'string') zone.color = z.color;
      if (toNum(z?.etaMinutes) !== null) zone.etaMinutes = Math.round(toNum(z.etaMinutes)!);
      if (toNum(z?.calculatedEtaMinutes) !== null) zone.calculatedEtaMinutes = Math.round(toNum(z.calculatedEtaMinutes)!);
      if (toNum(z?.etaSampleCount) !== null) zone.etaSampleCount = Math.round(toNum(z.etaSampleCount)!);

      // Validate: both zone types must have renderable geometry
      if (type === 'polygon') {
        if (!zone.polygon || zone.polygon.length < 3) return null;
      } else {
        // Circle MUST have a center and a positive radius — no invisible legacy zones
        if (!zone.centerLat || !zone.centerLng || radiusKm <= 0) return null;
      }

      return zone;
    })
    .filter((z): z is DeliveryZone => z !== null);
};

/**
 * Resolve the delivery fee for a (restaurant, lat, lng) tuple — single
 * source of truth shared by:
 *   - POST /api/cities/validate-location  (what the kassa shows the user)
 *   - POST /api/orders                    (what gets stored on the order)
 *
 * Both routes MUST produce the same fee for the same address, otherwise
 * the customer is charged one amount and admin sees another. The previous
 * divergence (orders.ts used restaurant-lat/lng as the legacy-zone center
 * while validate-location used city-center) was the reason admin showed
 * "49 kr" while the customer paid 30/40/50.
 *
 * Inputs:
 *   restaurant   prisma row with at least { deliveryZones, latitude,
 *                longitude, cityId, deliveryFee }
 *   lat, lng     customer address coords
 *   prisma       prisma client (used to fetch the city for inheritance)
 *
 * Returns { fee, minOrder } in **öre**, or null when the address is
 * outside every zone the restaurant covers.
 */
export const resolveDeliveryFee = async (
  restaurant: {
    deliveryZones?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    cityId?: string | null;
    deliveryFee?: number | null;
    minOrderAmount?: number | null;
  },
  lat: number,
  lng: number,
  prisma: { city: { findUnique: (args: any) => Promise<any> } }
): Promise<{ fee: number; minOrder: number } | null> => {
  const { findDeliveryZone, pointInPolygon, haversineKm } = await import('./geo');

  // 1) Pull city full data — vi behöver center + zones + polygon + radius
  //    så vi matchar EXAKT samma logik som /api/cities/validate-location
  //    (kassan använder den). Annars säger kassan "vi levererar hit" men
  //    backend rejectar ordern → kund får "vi levererar inte hit"-fel
  //    trots att de just sett att levereransen funkar.
  let cityCenter: { lat: number; lng: number } | undefined;
  let cityZones: DeliveryZone[] = [];
  let cityPolygon: [number, number][] | null = null;
  let cityRadiusKm: number = 10;
  let cityHasGps = false;
  if (restaurant.cityId) {
    const city = await prisma.city.findUnique({
      where: { id: restaurant.cityId },
      select: {
        zones: true,
        polygon: true,
        radiusKm: true,
        centerLat: true, centerLng: true,
        latitude: true, longitude: true,
      },
    });
    if (city) {
      const cLat = (city.centerLat ?? city.latitude) as number | null | undefined;
      const cLng = (city.centerLng ?? city.longitude) as number | null | undefined;
      if (cLat != null && cLng != null) {
        cityCenter = { lat: cLat, lng: cLng };
        cityHasGps = true;
      }
      cityRadiusKm = city.radiusKm ?? 10;

      let cityZonesRaw: any[] = [];
      try { cityZonesRaw = JSON.parse(city.zones || '[]'); } catch { cityZonesRaw = []; }
      cityZones = normalizeDeliveryZones(cityZonesRaw);

      try {
        if (city.polygon) {
          const parsed = JSON.parse(city.polygon);
          if (Array.isArray(parsed) && parsed.length >= 3) cityPolygon = parsed;
        }
      } catch { /* ignorera korrupt polygon */ }
    }
  }

  // 2) Restaurant's own zones — vinner alltid om satta.
  let restZonesRaw: any[] = [];
  try { restZonesRaw = JSON.parse(restaurant.deliveryZones || '[]'); } catch { restZonesRaw = []; }
  const restZones = normalizeDeliveryZones(restZonesRaw);

  // 3) Restaurant has own zones → match mot dessa.
  if (restZones.length > 0) {
    const zone = findDeliveryZone(lat, lng, restZones, cityCenter);
    if (!zone) return null;
    return { fee: zone.fee, minOrder: zone.minOrder };
  }

  // 4) City zones → match mot dessa.
  if (cityZones.length > 0) {
    const zone = findDeliveryZone(lat, lng, cityZones, cityCenter);
    if (!zone) return null;
    return { fee: zone.fee, minOrder: zone.minOrder };
  }

  // 5) Inga zoner alls → fall tillbaka på city-täckning (polygon ELLER
  //    radius). Detta matchar validate-location:s fallback. När en city
  //    bara har polygon/radius (legacy-config) säger den "ja vi levererar"
  //    men det finns ingen zone-fee → vi använder 0 kr (kunden ser då
  //    "GRATIS"-leverans i kassan).
  if (cityPolygon && pointInPolygon([lng, lat], cityPolygon)) {
    return { fee: 0, minOrder: 0 };
  }
  if (cityHasGps && cityCenter) {
    const distKm = haversineKm(lat, lng, cityCenter.lat, cityCenter.lng);
    if (distKm <= cityRadiusKm) {
      return { fee: 0, minOrder: 0 };
    }
  }

  return null;
};

/**
 * Heuristic: if value >= 1000 treat as already in öre, else multiply by 100.
 */
export const normalizeMoneyToOre = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  if (rounded === 0) return 0;
  if (Math.abs(rounded) >= 1000) return rounded;
  return Math.round(value * 100);
};
