import { isRestaurantOpen } from './openingHours';

export const ACCEPTING_ORDERS_MODES = ['SCHEDULED', 'FORCE_OPEN', 'FORCE_CLOSED'] as const;
export type AcceptingOrdersMode = (typeof ACCEPTING_ORDERS_MODES)[number];

export type RestaurantAvailabilityReason =
  | 'PLATFORM_PAUSED'
  | 'CITY_PAUSED'
  | 'RESTAURANT_PAUSED'
  | 'ARCHIVED'
  | 'DRAFT'
  | 'COMING_SOON'
  | 'MANUAL_FORCE_CLOSED'
  | 'MANUAL_FORCE_OPEN'
  | 'OUTSIDE_OPENING_HOURS'
  | 'SCHEDULE_OPEN';

export interface AvailabilityRestaurant {
  openingHours?: unknown;
  scheduledOpenNow?: boolean | null;
  acceptingOrdersMode?: string | null;
  acceptingOrdersOverrideUntil?: Date | string | null;
  acceptingOrdersOverrideReason?: string | null;
  pausedUntil?: Date | string | null;
  archivedAt?: Date | string | null;
  draft?: boolean | null;
  comingSoon?: boolean | null;
}

export interface AvailabilityCityOverlay {
  ordersPaused?: boolean | null;
  ordersPausedUntil?: Date | string | null;
  ordersPauseReason?: string | null;
}

export interface AvailabilityPlatformOverlay {
  platformOrdersPaused?: boolean | null;
  platformPausedUntil?: Date | string | null;
  platformPauseReason?: string | null;
}

export interface RestaurantAvailability {
  isOpen: boolean;
  scheduledOpenNow: boolean;
  configuredMode: AcceptingOrdersMode;
  effectiveMode: AcceptingOrdersMode;
  manualOverrideActive: boolean;
  overrideUntil: string | null;
  overrideReason: string | null;
  reason: RestaurantAvailabilityReason;
  platformPaused: boolean;
  cityPaused: boolean;
  restaurantPaused: boolean;
  /** Old clients model this as a boolean toggle: false means forced closed. */
  legacyManualIsOpen: boolean;
}

const validDate = (value: Date | string | null | undefined): Date | null => {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const activeUntil = (value: Date | string | null | undefined, now: Date): boolean => {
  const until = validDate(value);
  return until !== null && until.getTime() > now.getTime();
};

export const normalizeAcceptingOrdersMode = (value: unknown): AcceptingOrdersMode =>
  ACCEPTING_ORDERS_MODES.includes(value as AcceptingOrdersMode)
    ? (value as AcceptingOrdersMode)
    : 'SCHEDULED';

/**
 * Single source of truth for every customer/order/admin surface.
 * Precedence is deliberately explicit:
 * platform crisis > city crisis > restaurant pause > archived/unpublished state >
 * active manual override > opening-hours schedule.
 */
export function resolveRestaurantAvailability(
  restaurant: AvailabilityRestaurant,
  overlays: {
    city?: AvailabilityCityOverlay | null;
    platform?: AvailabilityPlatformOverlay | null;
  } = {},
  now = new Date(),
): RestaurantAvailability {
  const scheduledOpenNow = isRestaurantOpen(restaurant.openingHours, now);
  const configuredMode = normalizeAcceptingOrdersMode(restaurant.acceptingOrdersMode);
  const overrideUntilDate = validDate(restaurant.acceptingOrdersOverrideUntil);
  const manualOverrideActive =
    configuredMode !== 'SCHEDULED' &&
    (overrideUntilDate === null || overrideUntilDate.getTime() > now.getTime());
  const effectiveMode = manualOverrideActive ? configuredMode : 'SCHEDULED';

  const platformPaused =
    overlays.platform?.platformOrdersPaused === true ||
    activeUntil(overlays.platform?.platformPausedUntil, now);
  const cityPaused =
    overlays.city?.ordersPaused === true ||
    activeUntil(overlays.city?.ordersPausedUntil, now);
  const restaurantPaused = activeUntil(restaurant.pausedUntil, now);

  let isOpen: boolean;
  let reason: RestaurantAvailabilityReason;

  if (platformPaused) {
    isOpen = false;
    reason = 'PLATFORM_PAUSED';
  } else if (cityPaused) {
    isOpen = false;
    reason = 'CITY_PAUSED';
  } else if (restaurantPaused) {
    isOpen = false;
    reason = 'RESTAURANT_PAUSED';
  } else if (restaurant.archivedAt != null) {
    isOpen = false;
    reason = 'ARCHIVED';
  } else if (restaurant.draft === true) {
    isOpen = false;
    reason = 'DRAFT';
  } else if (restaurant.comingSoon === true) {
    isOpen = false;
    reason = 'COMING_SOON';
  } else if (effectiveMode === 'FORCE_CLOSED') {
    isOpen = false;
    reason = 'MANUAL_FORCE_CLOSED';
  } else if (effectiveMode === 'FORCE_OPEN') {
    isOpen = true;
    reason = 'MANUAL_FORCE_OPEN';
  } else {
    isOpen = scheduledOpenNow;
    reason = scheduledOpenNow ? 'SCHEDULE_OPEN' : 'OUTSIDE_OPENING_HOURS';
  }

  return {
    isOpen,
    scheduledOpenNow,
    configuredMode,
    effectiveMode,
    manualOverrideActive,
    overrideUntil: overrideUntilDate?.toISOString() ?? null,
    overrideReason: restaurant.acceptingOrdersOverrideReason ?? null,
    reason,
    platformPaused,
    cityPaused,
    restaurantPaused,
    legacyManualIsOpen: effectiveMode !== 'FORCE_CLOSED',
  };
}
