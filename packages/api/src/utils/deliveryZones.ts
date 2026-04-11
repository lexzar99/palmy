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

      // Validate: polygon zone must have polygon, circle must have radiusKm > 0
      if (type === 'polygon') {
        if (!zone.polygon || zone.polygon.length < 3) return null;
      } else {
        if (radiusKm <= 0 && !zone.centerLat) return null;
      }

      return zone;
    })
    .filter((z): z is DeliveryZone => z !== null);
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
