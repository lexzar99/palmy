import { apiDelete, apiGet, apiPatch, apiPost } from "@/shared/api/client";

export type HomeCategoryFilterMode = "FILTER" | "MANUAL" | "HYBRID";
export type HomeCategorySortBy = "FEATURED" | "RATING" | "ETA" | "NAME";
export type HomeCategorySortDirection = "ASC" | "DESC";

export interface HomeCategoryFilters {
  searchTerm?: string | null;
  cuisines?: string[];
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

export interface HomeCategorySchedule {
  enabled?: boolean;
  daysOfWeek?: number[];
  startTime?: string | null;
  endTime?: string | null;
}

export interface HomeCategorySection {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  filterMode: HomeCategoryFilterMode;
  maxRestaurants: number;
  manualRestaurantIds: string[];
  filters: HomeCategoryFilters;
  schedule: HomeCategorySchedule;
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
