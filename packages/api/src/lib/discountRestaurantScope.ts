import { parseApplicableRestaurantIds } from './deals';

type ScopedCode = { applicableRestaurantIds?: string | null; restaurantId?: string | null };

/** Är koden begränsad till vissa restauranger? */
export function discountCodeIsRestaurantScoped(code: ScopedCode): boolean {
  return parseApplicableRestaurantIds(code.applicableRestaurantIds ?? null).length > 0 || Boolean(code.restaurantId);
}

/**
 * Gäller koden hos restaurangen? Samma regel i kassans validering och vid orderläggning:
 * applicableRestaurantIds vinner, annars restaurantId, annars gäller koden överallt.
 */
export function discountCodeAppliesToRestaurant(code: ScopedCode, restaurantId: string | null | undefined): boolean {
  const applicableIds = parseApplicableRestaurantIds(code.applicableRestaurantIds ?? null);
  if (applicableIds.length > 0) return Boolean(restaurantId) && applicableIds.includes(String(restaurantId));
  if (code.restaurantId) return code.restaurantId === restaurantId;
  return true;
}
