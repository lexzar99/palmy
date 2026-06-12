import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from "@/shared/api/client";

export interface BrandRestaurant {
  id: string;
  name: string;
  slug: string;
  city?: string | null;
}

export interface BrandRecord {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  masterRestaurantId?: string | null;
  restaurants: BrandRestaurant[];
  locationCount: number;
}

// Lättviktig restauranglista för att välja platser (samma endpoint som menyn).
export interface RestaurantRef {
  id: string;
  name: string;
  slug: string;
  city?: string | null;
  brandId?: string | null;
}

export interface BrandSyncSummary {
  categoriesCreated: number;
  categoriesUpdated: number;
  productsCreated: number;
  productsUpdated: number;
  priceLocked: number;
  groupsCreated: number;
  groupsReused: number;
  links: number;
}
export interface BrandSyncResponse {
  ok: boolean;
  dryRun: boolean;
  results: Array<{ targetRestaurantId: string; summary: BrandSyncSummary; warnings: string[] }>;
}

export const brandsQueryKey = ["brands"] as const;
export const brandRestaurantsQueryKey = ["brands", "restaurants"] as const;

export const getBrands = () => apiGet<BrandRecord[]>("/admin/brands");
export const getAllRestaurants = () => apiGet<RestaurantRef[]>("/restaurants");

export const createBrand = (name: string) => apiPost<BrandRecord>("/admin/brands", { name });
export const updateBrand = (id: string, payload: { name?: string; logoUrl?: string | null; masterRestaurantId?: string | null }) =>
  apiPatch<BrandRecord>(`/admin/brands/${id}`, payload);
export const setBrandRestaurants = (id: string, restaurantIds: string[]) =>
  apiPut<{ ok: boolean; count: number }>(`/admin/brands/${id}/restaurants`, { restaurantIds });
export const syncBrand = (id: string, apply: boolean) =>
  apiPost<BrandSyncResponse>(`/admin/brands/${id}/sync`, { apply }, { timeout: 5 * 60 * 1000 });
export const deleteBrand = (id: string) => apiDelete<{ ok: boolean }>(`/admin/brands/${id}`);
