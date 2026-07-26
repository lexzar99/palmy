import { apiDelete, apiGet, apiPatch, apiPost } from "@/shared/api/client";

export type HomeCategoryFilterMode = "FILTER" | "MANUAL" | "HYBRID";
export type HomeCategorySortBy =
  | "SMART"
  | "FEATURED"
  | "ORDERS_TODAY"
  | "ORDERS_7D"
  | "RATING"
  | "ETA"
  | "DELIVERY_FEE"
  | "DISCOUNT"
  | "NAME";
export type HomeCategorySortDirection = "ASC" | "DESC";
export type HomeCategoryRankingStrategy = "WEIGHTED" | "BALANCED";
export type HomeCategoryLayout = "MEDIUM_RAIL" | "LARGE_RAIL" | "GRID";
export type HomeCategoryAccent = "ORANGE" | "BLUE" | "GREEN" | "PURPLE" | "NAVY";

export interface HomeCategoryFilters {
  searchTerm?: string | null;
  cuisines?: string[];
  tagIds?: string[];
  /** @deprecated Nya adminflödet använder tagIds. */
  tags?: string[];
  featuredClasses?: number[];
  minRating?: number | null;
  maxEtaMinutes?: number | null;
  maxDeliveryFee?: number | null;
  freeDeliveryOnly?: boolean;
  dealsOnly?: boolean;
  openNowOnly?: boolean;
  sortBy?: HomeCategorySortBy;
  sortDirection?: HomeCategorySortDirection;
}

export interface HomeCategoryPresentation {
  layout?: HomeCategoryLayout;
  accent?: HomeCategoryAccent;
  accentColor?: string | null;
  backgroundColor?: string | null;
  icon?: string | null;
}

export interface HomeCategoryRanking {
  strategy?: HomeCategoryRankingStrategy;
  weights?: {
    ordersToday?: number;
    orders7d?: number;
    eta?: number;
    ratingConfidence?: number;
    deliveryFee?: number;
    freeDelivery?: number;
    discount?: number;
    tier?: number;
    dailyRotation?: number;
  };
  avoidDuplicateFirst?: boolean;
  appearancePenalty?: number;
  maxAdminBoostPoints?: number;
}

export interface HomeCategorySchedule {
  enabled?: boolean;
  daysOfWeek?: number[];
  startTime?: string | null;
  endTime?: string | null;
}

export interface HomeCategorySection {
  id: string;
  title: string;
  titleEn: string | null;
  slug: string;
  subtitle: string | null;
  subtitleEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  isActive: boolean;
  sortOrder: number;
  filterMode: HomeCategoryFilterMode;
  maxRestaurants: number;
  manualRestaurantIds: string[];
  filters: HomeCategoryFilters;
  schedule: HomeCategorySchedule;
  presentation: HomeCategoryPresentation;
  ranking: HomeCategoryRanking;
  createdAt: string;
  updatedAt: string;
}

export type HomeCategoryPayload = Partial<Omit<HomeCategorySection, "id" | "createdAt" | "updatedAt">>;

export const categoriesQueryKey = ["home-categories", "all"] as const;

export const getCategories = () => apiGet<HomeCategorySection[]>("/home-categories/all");
export const createCategory = (payload: HomeCategoryPayload) => apiPost<HomeCategorySection>("/home-categories", payload);
export const updateCategory = (id: string, payload: HomeCategoryPayload) =>
  apiPatch<HomeCategorySection>(`/home-categories/${id}`, payload);
export const deleteCategory = (id: string) => apiDelete<{ ok: true }>(`/home-categories/${id}`);

export interface RestaurantTag {
  id: string;
  name: string;
  nameEn: string | null;
  slug: string;
  description: string | null;
  color: string;
  icon: string | null;
  isActive: boolean;
  sortOrder: number;
  restaurantCount: number;
  createdAt: string;
  updatedAt: string;
}

export type RestaurantTagPayload = Partial<
  Pick<RestaurantTag, "name" | "nameEn" | "slug" | "description" | "color" | "icon" | "isActive" | "sortOrder">
>;

export const restaurantTagsQueryKey = ["restaurant-tags", "all"] as const;
export const getRestaurantTags = () => apiGet<RestaurantTag[]>("/restaurant-tags/all");
export const getPublicRestaurantTags = () => apiGet<RestaurantTag[]>("/restaurant-tags");
export const createRestaurantTag = (payload: RestaurantTagPayload & { name: string }) =>
  apiPost<RestaurantTag>("/restaurant-tags", payload);
export const updateRestaurantTag = (id: string, payload: RestaurantTagPayload) =>
  apiPatch<RestaurantTag>(`/restaurant-tags/${id}`, payload);
export const deleteRestaurantTag = (id: string) =>
  apiDelete<{ ok: true }>(`/restaurant-tags/${id}`);
