import type { DeliveryZone } from './geo';

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : null;
};

/**
 * DB stores money in öre. Some older/buggy writers have stored values in kr,
 * or used alternate keys (`deliveryFee` instead of `fee`) and missing `isActive`.
 *
 * This normalizer accepts mixed inputs and produces canonical DeliveryZone:
 * - `fee` in öre
 * - `minOrder` in öre
 * - `isActive` default true
 */
export const normalizeDeliveryZones = (raw: unknown): DeliveryZone[] => {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((zoneLike: any) => {
      const id = String(zoneLike?.id ?? '');
      const name = String(zoneLike?.name ?? '');
      const radiusKm = toNumber(zoneLike?.radiusKm) ?? 0;

      const feeInput = toNumber(zoneLike?.fee ?? zoneLike?.deliveryFee ?? zoneLike?.delivery_fee) ?? 0;
      const minOrderInput = toNumber(zoneLike?.minOrder ?? zoneLike?.min_order) ?? 0;

      const isActive = zoneLike?.isActive === false ? false : true;

      const fee = normalizeMoneyToOre(feeInput);
      const minOrder = normalizeMoneyToOre(minOrderInput);

      return {
        id,
        name,
        radiusKm,
        fee,
        minOrder,
        isActive,
      } satisfies DeliveryZone;
    })
    .filter((z) => z.id && z.name && z.radiusKm > 0);
};

/**
 * Heuristic:
 * - If it looks like öre (>= 1000), keep as-is.
 * - Otherwise treat as kr and convert to öre.
 *
 * This is intentionally biased towards treating small numbers as kr, because
 * many admin/client UIs enter fees/minOrders as whole kr amounts (e.g. 39, 200).
 */
export const normalizeMoneyToOre = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  if (rounded === 0) return 0;
  if (Math.abs(rounded) >= 1000) return rounded;
  return Math.round(value * 100);
};
