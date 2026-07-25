import { isRestaurantOpen } from './openingHours';
import { normalizeAcceptingOrdersMode } from './restaurantAvailability';

export interface RestaurantStatusMaintenanceInput {
  openingHours?: unknown;
  scheduledOpenNow?: boolean | null;
  acceptingOrdersMode?: string | null;
  acceptingOrdersOverrideUntil?: Date | string | null;
  acceptingOrdersOverrideReason?: string | null;
  pausedUntil?: Date | string | null;
}

export interface RestaurantStatusMaintenanceResult {
  scheduledOpenNow: boolean;
  scheduleChanged: boolean;
  pauseExpired: boolean;
  overrideExpired: boolean;
  changed: boolean;
  update: Record<string, unknown>;
  restaurantForAvailability: RestaurantStatusMaintenanceInput;
}

const validDate = (value: Date | string | null | undefined): Date | null => {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function buildRestaurantStatusMaintenance(
  restaurant: RestaurantStatusMaintenanceInput,
  now = new Date(),
): RestaurantStatusMaintenanceResult {
  const scheduledOpenNow = isRestaurantOpen(restaurant.openingHours, now);
  const scheduleChanged = scheduledOpenNow !== restaurant.scheduledOpenNow;
  const pausedUntil = validDate(restaurant.pausedUntil);
  const pauseExpired = pausedUntil !== null && pausedUntil.getTime() <= now.getTime();
  const configuredMode = normalizeAcceptingOrdersMode(restaurant.acceptingOrdersMode);
  const overrideUntil = validDate(restaurant.acceptingOrdersOverrideUntil);
  const overrideExpired =
    configuredMode !== 'SCHEDULED' &&
    overrideUntil !== null &&
    overrideUntil.getTime() <= now.getTime();

  const update: Record<string, unknown> = {};
  if (scheduleChanged) update.scheduledOpenNow = scheduledOpenNow;
  if (pauseExpired) update.pausedUntil = null;
  if (overrideExpired) {
    update.acceptingOrdersMode = 'SCHEDULED';
    update.acceptingOrdersOverrideUntil = null;
    update.acceptingOrdersOverrideReason = null;
    update.isOpen = true;
  }

  const restaurantForAvailability: RestaurantStatusMaintenanceInput = {
    ...restaurant,
    scheduledOpenNow,
    pausedUntil: pauseExpired ? null : restaurant.pausedUntil,
    acceptingOrdersMode: overrideExpired ? 'SCHEDULED' : restaurant.acceptingOrdersMode,
    acceptingOrdersOverrideUntil: overrideExpired ? null : restaurant.acceptingOrdersOverrideUntil,
    acceptingOrdersOverrideReason: overrideExpired ? null : restaurant.acceptingOrdersOverrideReason,
  };

  return {
    scheduledOpenNow,
    scheduleChanged,
    pauseExpired,
    overrideExpired,
    changed: Object.keys(update).length > 0,
    update,
    restaurantForAvailability,
  };
}
