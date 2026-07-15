import { apiDelete, apiGet, apiPatch, apiPost } from "@/shared/api/client";
import type { ControlCenterData, ControlCenterRestaurantSnapshot } from "@/modules/dashboard/api";
import type {
  AcceptingOrdersMode,
  RestaurantAvailabilityReason,
  SekMoney,
} from "@/shared/contracts/restaurants";

export type { AcceptingOrdersMode } from "@/shared/contracts/restaurants";

export interface RestaurantMenuCategory {
  id: string;
  name: string;
  description?: string | null;
  position: number;
  items: Array<{
    id: string;
    name: string;
    description?: string | null;
    price: number;
    imageUrl?: string | null;
    isVegan?: boolean;
    isVegetarian?: boolean;
    isGlutenFree?: boolean;
  }>;
}

export interface RestaurantDetail {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  cuisine?: string | null;
  address?: string | null;
  city?: string | null;
  zip?: string | null;
  phone?: string | null;
  email?: string | null;
  legalName?: string | null;
  organizationNumber?: string | null;
  imageUrl?: string | null;
  heroImageUrl?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  deliveryFeeOre: number;
  deliveryFeeMoney: SekMoney;
  deliveryFee: number;
  minOrderAmountOre: number;
  minOrderAmountMoney: SekMoney;
  minOrderAmount: number;
  etaMinutes: number;
  baseEtaMinutes?: number;
  etaCalculatedMinutes?: number | null;
  etaOverrideMinutes?: number | null;
  activeOrdersCount: number;
  /** Effektiv kundstatus efter schema, manuellt läge och driftöverlägg. */
  isOpen: boolean;
  scheduledOpenNow: boolean;
  acceptingOrdersMode: AcceptingOrdersMode;
  effectiveAcceptingOrdersMode: AcceptingOrdersMode;
  acceptingOrdersOverrideUntil?: string | null;
  acceptingOrdersOverrideReason?: string | null;
  acceptingOrdersOverrideActive?: boolean;
  availabilityReason: RestaurantAvailabilityReason;
  availabilityOverlays?: {
    platformPaused: boolean;
    cityPaused: boolean;
    restaurantPaused: boolean;
  };
  /** @deprecated använd acceptingOrdersMode. */
  manualIsOpen: boolean;
  comingSoon?: boolean;
  draft?: boolean;
  featuredClass: number;
  selfDelivery?: boolean;
  commissionPctOverride?: number | null;
  tags: string[];
  openingHours: Record<string, unknown>;
  internalInfo?: string | null;
  adminEmail?: string | null;
  createdAt: string;
  updatedAt: string;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  freeDeliveryAbove?: number | null;
  freeDeliveryAboveOre?: number | null;
  freeDeliveryAboveMoney?: SekMoney | null;
  deliveryZones?: unknown[];
  menu?: RestaurantMenuCategory[];
  logoutCode?: string | null;
}

export interface RestaurantOrderSummary {
  id: string;
  orderNumber: string;
  customerName: string;
  status: string;
  total: number;
  createdAt: string;
  type: string;
}

export interface RestaurantFormPayload {
  name: string;
  slug?: string;
  description?: string | null;
  cuisine?: string;
  address?: string;
  city?: string;
  zip?: string;
  phone?: string;
  email?: string | null;
  legalName?: string | null;
  organizationNumber?: string | null;
  adminEmail?: string;
  imageUrl?: string | null;
  heroImageUrl?: string | null;
  deliveryFeeOre?: number;
  deliveryFee?: number;
  minOrderAmountOre?: number;
  minOrderAmount?: number;
  etaMinutes?: number;
  etaOverrideMinutes?: number | null;
  featuredClass?: number;
  acceptingOrdersMode?: AcceptingOrdersMode;
  acceptingOrdersOverrideUntil?: string | null;
  acceptingOrdersOverrideReason?: string | null;
  /** @deprecated använd acceptingOrdersMode. */
  isOpen?: boolean;
  comingSoon?: boolean;
  // Publicera utkast (bara super admin, servern ignorerar annat).
  draft?: boolean;
  rating?: number;
  ratingCount?: number;
  adminPassword?: string;
  internalInfo?: string | null;
  tags?: string[];
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  freeDeliveryAboveOre?: number | null;
  /** @deprecated använd freeDeliveryAboveOre. */
  freeDeliveryAbove?: number | null;
  deliveryZones?: unknown[];
  openingHours?: Record<string, { closed: boolean; shifts: { open: string; close: string }[] }>;
  logoutCode?: string | null;
  announcementText?: string | null;
  vatPercent?: number | null;
  selfDelivery?: boolean;
  commissionPctOverride?: number | null;
}

export const restaurantsQueryKey = ["restaurants", "overview"] as const;
export const restaurantDetailQueryKey = (restaurantId: string) => ["restaurants", "detail", restaurantId] as const;

export const getRestaurantOverview = async () => {
  const data = await apiGet<ControlCenterData>("/admin/control-center");
  return data.restaurantSnapshots;
};

export const getRestaurantDetail = (restaurantId: string) => apiGet<RestaurantDetail>(`/restaurants/${restaurantId}`);

export const getRestaurantOrders = async (restaurantId: string) => {
  const response = await apiGet<{ orders: RestaurantOrderSummary[] }>(`/admin/orders?limit=20&restaurantId=${restaurantId}`);
  return response.orders;
};

export const createRestaurant = (payload: RestaurantFormPayload) => apiPost<RestaurantDetail>("/restaurants", payload);

export const patchRestaurant = (restaurantId: string, payload: Partial<RestaurantFormPayload>) =>
  apiPatch<RestaurantDetail>(`/restaurants/${restaurantId}`, payload);

export const archiveRestaurant = (restaurantId: string) =>
  apiDelete<{ success: boolean; archived: boolean }>(`/restaurants/${restaurantId}`);

export type { ControlCenterRestaurantSnapshot };
