export const ACCEPTING_ORDERS_MODES = ["SCHEDULED", "FORCE_OPEN", "FORCE_CLOSED"] as const;

export type AcceptingOrdersMode = (typeof ACCEPTING_ORDERS_MODES)[number];

export type RestaurantAvailabilityReason =
  | "PLATFORM_PAUSED"
  | "CITY_PAUSED"
  | "RESTAURANT_PAUSED"
  | "ARCHIVED"
  | "DRAFT"
  | "COMING_SOON"
  | "MANUAL_FORCE_CLOSED"
  | "MANUAL_FORCE_OPEN"
  | "OUTSIDE_OPENING_HOURS"
  | "SCHEDULE_OPEN";

export interface SekMoney {
  amountMinor: number;
  currency: "SEK";
}

export const acceptingOrdersModeLabel: Record<AcceptingOrdersMode, string> = {
  SCHEDULED: "Följ öppettider",
  FORCE_OPEN: "Tvinga öppen",
  FORCE_CLOSED: "Tvinga stängd",
};

export const availabilityReasonLabel: Record<RestaurantAvailabilityReason, string> = {
  PLATFORM_PAUSED: "Plattformen är pausad",
  CITY_PAUSED: "Staden är pausad",
  RESTAURANT_PAUSED: "Restaurangen är tillfälligt pausad",
  ARCHIVED: "Restaurangen är arkiverad",
  DRAFT: "Restaurangen är ett utkast",
  COMING_SOON: "Restaurangen är markerad som coming soon",
  MANUAL_FORCE_CLOSED: "Manuellt tvingad stängd",
  MANUAL_FORCE_OPEN: "Manuellt tvingad öppen",
  OUTSIDE_OPENING_HOURS: "Utanför öppettider",
  SCHEDULE_OPEN: "Öppen enligt öppettider",
};
