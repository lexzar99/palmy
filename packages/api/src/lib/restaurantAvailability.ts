import { isRestaurantOpen, nextOpeningAfterToday } from './openingHours';

export const ACCEPTING_ORDERS_MODES = ['SCHEDULED', 'FORCE_OPEN', 'FORCE_CLOSED'] as const;
export type AcceptingOrdersMode = (typeof ACCEPTING_ORDERS_MODES)[number];

export type RestaurantAvailabilityReason =
  | 'PLATFORM_PAUSED'
  | 'CITY_PAUSED'
  | 'RESTAURANT_PAUSED'
  | 'CLOSED_UNTIL_OPENING'
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
  /**
   * När restaurangen öppnar igen (ISO). Satt så fort den är stängd av schema.
   * Kunden ska se "Stängt · öppnar 11:00" — inte gissa sig till tiden ur
   * `pausedUntil`, som betyder något helt annat.
   */
  opensAt: string | null;
  configuredMode: AcceptingOrdersMode;
  effectiveMode: AcceptingOrdersMode;
  manualOverrideActive: boolean;
  overrideUntil: string | null;
  overrideReason: string | null;
  reason: RestaurantAvailabilityReason;
  platformPaused: boolean;
  cityPaused: boolean;
  restaurantPaused: boolean;
  /** Terminalens "stäng restaurang": stängd tills nästa öppning, inte pausad. */
  closedUntilOpening: boolean;
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

/** Längre "paus" än så här är i praktiken en stängning för kunden. */
const MAX_PAUSE_MINUTES = 120;

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
  // Paus och stängning delar samma kolumn i databasen (`pausedUntil`) men är
  // två olika saker för kunden. En paus är ett kort avbrott mitt i öppettiden
  // ("vi hinner inte just nu") och har en nedräkning. Terminalens "stäng
  // restaurang" skriver istället nästa öppningstid dit — det är en stängning,
  // och ska heta "Stängt · öppnar 11:00", inte "Pausad till 11:00".
  //
  // Skiljelinjen är om tiden landar på nästa schemalagda öppning. Samma
  // 2-minuterstolerans som terminalen själv använder.
  const pauseEnd = validDate(restaurant.pausedUntil);
  const pauseWindowActive = activeUntil(restaurant.pausedUntil, now);
  const nextOpening = nextOpeningAfterToday(restaurant.openingHours, now);
  const endsAtNextOpening =
    pauseEnd !== null && Math.abs(pauseEnd.getTime() - nextOpening.getTime()) <= 2 * 60_000;

  // Terminalen erbjuder +10 till +30 minuter när man förlänger en paus. Sträcker
  // sig "pausen" timmar framåt är den i praktiken en stängning, oavsett om
  // sluttiden råkar sammanfalla med ett skiftbyte eller inte.
  const pauseMinutesLeft = pauseEnd ? (pauseEnd.getTime() - now.getTime()) / 60_000 : 0;
  const wouldOtherwiseBeOpen = scheduledOpenNow || effectiveMode === 'FORCE_OPEN';
  const isShortPause =
    wouldOtherwiseBeOpen && !endsAtNextOpening && pauseMinutesLeft <= MAX_PAUSE_MINUTES;

  const restaurantPaused = pauseWindowActive && isShortPause;
  const closedUntilOpening = pauseWindowActive && !isShortPause;

  // Restaurangen är tillbaka när pausen tagit slut OCH schemat är öppet. Slutar
  // stängningen mitt i natten öppnar den inte då, utan vid nästa skiftstart.
  const reopenAt = pauseEnd
    ? (isRestaurantOpen(restaurant.openingHours, pauseEnd)
        ? pauseEnd
        : nextOpeningAfterToday(restaurant.openingHours, pauseEnd))
    : null;

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
  } else if (closedUntilOpening) {
    // Stängd tills den öppnar igen. Inte pausad, inte permanent stängd.
    isOpen = false;
    reason = 'CLOSED_UNTIL_OPENING';
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

  // Öppningstiden är bara intressant när stängningen faktiskt beror på
  // schemat. Arkiverad, utkast eller krisstoppad restaurang öppnar inte
  // 11:00 bara för att kalendern säger så.
  let opensAt: string | null = null;
  if (!isOpen) {
    if (reason === 'CLOSED_UNTIL_OPENING') opensAt = (reopenAt ?? nextOpening).toISOString();
    else if (reason === 'OUTSIDE_OPENING_HOURS') opensAt = nextOpening.toISOString();
  }

  return {
    isOpen,
    scheduledOpenNow,
    opensAt,
    configuredMode,
    effectiveMode,
    manualOverrideActive,
    overrideUntil: overrideUntilDate?.toISOString() ?? null,
    overrideReason: restaurant.acceptingOrdersOverrideReason ?? null,
    reason,
    platformPaused,
    cityPaused,
    restaurantPaused,
    closedUntilOpening,
    legacyManualIsOpen: effectiveMode !== 'FORCE_CLOSED',
  };
}
