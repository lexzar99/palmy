import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/shared/api/client";
import type { ControlCenterData, ControlCenterRestaurantSnapshot } from "@/modules/dashboard/api";

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
  imageUrl?: string | null;
  heroImageUrl?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  deliveryFee: number;
  minOrderAmount: number;
  etaMinutes: number;
  baseEtaMinutes?: number;
  etaCalculatedMinutes?: number | null;
  etaOverrideMinutes?: number | null;
  activeOrdersCount: number;
  isOpen: boolean;
  manualIsOpen: boolean;
  featuredClass: number;
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
  adminEmail?: string;
  imageUrl?: string | null;
  heroImageUrl?: string | null;
  deliveryFee?: number;
  minOrderAmount?: number;
  etaMinutes?: number;
  etaOverrideMinutes?: number | null;
  featuredClass?: number;
  isOpen?: boolean;
  rating?: number;
  ratingCount?: number;
  adminPassword?: string;
  internalInfo?: string | null;
  tags?: string[];
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  freeDeliveryAbove?: number;
  openingHours?: Record<string, { closed: boolean; shifts: { open: string; close: string }[] }>;
  logoutCode?: string | null;
  announcementText?: string | null;
  vatPercent?: number | null;
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

export const deleteRestaurant = (restaurantId: string) => apiDelete<{ success: boolean }>(`/restaurants/${restaurantId}`);

export interface RestaurantLoginAccount {
  id: string;
  username: string;
  name: string;
  role: string;
  isActive: boolean;
  // Klartext-lösenord om vi har det sparat. null = endast bcrypt (gammalt
  // konto) — vi måste få ett nytt lösenord för att kunna visa det igen.
  password: string | null;
  hasPassword: boolean;
}

export interface RestaurantLogin {
  restaurantId: string;
  restaurantName: string;
  slug: string;
  adminEmail: string | null;
  // Det enda inloggningskontot. null = inget finns än, UI visar skapa-form.
  // Backend auto-rensar dubletter och länkar via Restaurant.adminUserId.
  account: RestaurantLoginAccount | null;
}

export const getRestaurantLogin = (restaurantId: string) =>
  apiGet<RestaurantLogin>(`/admin/restaurants/${restaurantId}/login`);

export const updateRestaurantLogin = (
  restaurantId: string,
  payload: { username?: string | null; password?: string | null },
) => apiPut<RestaurantLogin>(`/admin/restaurants/${restaurantId}/login`, payload);

export const deleteRestaurantLogin = (restaurantId: string) =>
  apiDelete<{ success: boolean }>(`/admin/restaurants/${restaurantId}/login`);

export type { ControlCenterRestaurantSnapshot };
