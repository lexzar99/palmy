/** Tidsbegränsat kampanjtest. Ändrar aldrig restaurangens privata avgiftskanal. */
export const PALMYRA_ID = 'cmnxhfd1z000110wjrhizs4nh';
export const PALMYRA_SLUG = 'palmyra-pizzeria-lund';
export const VIA50_END = new Date('2026-09-19T21:59:59.999Z');
export const via50Active = (now = new Date()) => now >= new Date('2026-09-19T00:00:00Z') && now <= VIA50_END;
export const isPalmyra = (value: unknown) => value === PALMYRA_ID || value === PALMYRA_SLUG;
export function palmyraRegularPricing(restaurant: unknown, privateEmbed: boolean, offerChannel: unknown, now = new Date()) {
  return via50Active(now) && isPalmyra(restaurant) && !privateEmbed && offerChannel !== 'palmyra';
}
export function via50Code(code: unknown): any | null {
  const name = String(code || '').trim().toUpperCase();
  if (!['VIA50', 'VIA70'].includes(name)) return null;
  const amount = name === 'VIA70' ? 7000 : 5000;
  const minimum = name === 'VIA70' ? 25000 : 15000;
  return { id: `campaign-${name.toLowerCase()}-20260919`, code: name, isActive: true,
    type: 'FIXED', value: amount, minOrder: minimum, restaurantId: PALMYRA_ID,
    applicableRestaurantIds: null, platform: 'WEB', excludeDiscountedItems: true,
    freeDelivery: true, validFrom: new Date('2026-09-19T00:00:00Z'), validUntil: VIA50_END,
    maxUsages: null, usageCount: 0, description: `${amount / 100} kr rabatt på mat från ${minimum / 100} kr hos Palmyra` };
}
export function via50Error(input: { restaurant: unknown; subtotalOre: number; discounted: boolean; privateEmbed: boolean; now?: Date; code?: string }) {
  const code = via50Code(input.code || 'VIA50');
  if (!code) return 'Ogiltig rabattkod.';
  if (!via50Active(input.now)) return `${code.code} har gått ut.`;
  if (!isPalmyra(input.restaurant) || input.privateEmbed) return `${code.code} gäller hos Palmyra på viaeats.se, inte i den privata beställningen.`;
  if (input.discounted) return 'Koden gäller ej rabatterade varor. Ta bort kampanjvarorna eller beställ utan koden.';
  if (input.subtotalOre < code.minOrder) return `${code.code} gäller på mat från ${code.minOrder / 100} kr, exklusive leverans.`;
  return null;
}
