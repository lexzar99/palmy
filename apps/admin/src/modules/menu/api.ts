import { apiDelete, apiGet, apiPatch, apiPost } from "@/shared/api/client";

export interface RestaurantRef {
  id: string;
  name: string;
  slug: string;
  city?: string | null;
  // Bild för den virtuella "Erbjudanden"-tilen (sätts i Main categories-fliken).
  offersImageUrl?: string | null;
}

export interface CategoryRecord {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  position: number;
  isActive?: boolean;
  restaurantId?: string | null;
  _count?: { products: number };
}

export interface ExtraRecord {
  id?: string;
  name: string;
  priceAddon: number;
  isDefault?: boolean;
  position?: number;
}

export interface ExtraGroupRecord {
  id: string;
  name: string;
  type: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  restaurantId?: string | null;
  extras: ExtraRecord[];
  _count?: { productGroups: number };
}

export interface ProductRecord {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  categoryId: string;
  imageUrl?: string | null;
  isActive?: boolean;
  isVegan?: boolean;
  isVegetarian?: boolean;
  isGlutenFree?: boolean;
  position: number;
  // Visningsläge i menyn — "FULL" eller "COMPACT".
  displayMode?: "FULL" | "COMPACT";
  hideDescription?: boolean;
  // Dpoints: köpbar med poäng.
  rewardable?: boolean;
  category: { name: string; restaurantId?: string | null };
  extraGroups: Array<{
    id: string;
    name: string;
    type: string;
    required: boolean;
    extras: ExtraRecord[];
  }>;
}

export const menuRestaurantsQueryKey = ["menu", "restaurants"] as const;
export const menuCategoriesQueryKey = (restaurantId: string | null) => ["menu", "categories", restaurantId] as const;
export const menuProductsQueryKey = (restaurantId: string | null) => ["menu", "products", restaurantId] as const;
export const menuGroupsQueryKey = (restaurantId: string | null) => ["menu", "extra-groups", restaurantId] as const;

export const getMenuRestaurants = () => apiGet<RestaurantRef[]>("/restaurants");

// Uppdatera restaurang-fält (används för Erbjudande-tilens bild i menyfliken).
export const updateRestaurant = (id: string, payload: Partial<RestaurantRef> & Record<string, unknown>) =>
  apiPatch<RestaurantRef>(`/restaurants/${id}`, payload);

export const getCategories = (restaurantId: string) =>
  apiGet<CategoryRecord[]>(`/admin/categories?restaurantId=${restaurantId}&includeGlobal=auto`);

export const getProducts = (restaurantId: string) =>
  apiGet<ProductRecord[]>(`/admin/products?restaurantId=${restaurantId}&includeGlobal=1`);

export const getExtraGroups = (restaurantId: string) => apiGet<ExtraGroupRecord[]>(`/admin/extra-groups?restaurantId=${restaurantId}`);

export const createCategory = (payload: Partial<CategoryRecord> & { restaurantId: string }) => apiPost<CategoryRecord>("/admin/categories", payload);
export const updateCategory = (categoryId: string, payload: Partial<CategoryRecord>) => apiPatch<CategoryRecord>(`/admin/categories/${categoryId}`, payload);
export const deleteCategory = (categoryId: string) => apiDelete<{ success: boolean }>(`/admin/categories/${categoryId}`);

export const createProduct = (payload: Record<string, unknown>) => apiPost<ProductRecord>("/admin/products", payload);
export const updateProduct = (productId: string, payload: Record<string, unknown>) => apiPatch<ProductRecord>(`/admin/products/${productId}`, payload);
export const deleteProduct = (productId: string) => apiDelete<{ success: boolean }>(`/admin/products/${productId}`);

export const createExtraGroup = (payload: Record<string, unknown>) => apiPost<ExtraGroupRecord>("/admin/extra-groups", payload);
export const updateExtraGroup = (groupId: string, payload: Record<string, unknown>) => apiPatch<ExtraGroupRecord>(`/admin/extra-groups/${groupId}`, payload);
export const deleteExtraGroup = (groupId: string) => apiDelete<{ success: boolean }>(`/admin/extra-groups/${groupId}`);

// R2 image operations
export type R2AutoMatchResult = {
  restaurant: string;
  city: string;
  prefix: string;
  totalObjectsInPrefix: number;
  matched: { hero: boolean; logo: boolean; categories: number; products: number };
  /** Antal DB-skrivningar som faktiskt gjordes (skip:s om värdet redan var samma). */
  writes?: number;
  updates: Array<{ kind: string; id: string; url: string; key: string; changed?: boolean }>;
  dryRun: boolean;
};

export const r2AutoMatch = (restaurantId: string, dryRun: boolean) =>
  apiPost<R2AutoMatchResult>("/admin/images/auto-match", { restaurantId, dryRun });

export const r2ListImages = (prefix: string) =>
  apiGet<Array<{ key: string; url: string; size: number; lastModified?: string }>>(`/admin/images/list?prefix=${encodeURIComponent(prefix)}`);

export type R2MigrateResult = {
  scanned: number;
  alreadyR2: number;
  migrated: number;
  failed: number;
  skippedNoUrl: number;
  failedExamples: Array<{ label: string; url: string; error: string }>;
  migratedExamples: Array<{ label: string; from: string; to: string }>;
  dryRun: boolean;
  configured: boolean;
};

export const r2Migrate = (payload: { apply: boolean; only?: 'restaurants' | 'categories' | 'products'; restaurantSlug?: string; maxItems?: number }) =>
  // Migration kan ta minuter när det är på riktigt — bumpa timeout till 10 min.
  // Default axios = ingen timeout, men proxy-layers kan dö mycket tidigare.
  apiPost<R2MigrateResult>("/admin/images/migrate", payload, { timeout: 10 * 60 * 1000 });

export type R2PathsTemplate = {
  restaurant: { name: string; slug: string };
  city: { slug: string };
  prefix: string;
  hero: { key: string; label: string };
  logo: { key: string; label: string };
  categories: Array<{
    id: string;
    name: string;
    slug: string;
    key: string;
    folder: string;
    products: Array<{ id: string; name: string; slug: string; key: string }>;
  }>;
};

export const r2PathsTemplate = (restaurantId: string) =>
  apiGet<R2PathsTemplate>(`/admin/images/paths-template?restaurantId=${encodeURIComponent(restaurantId)}`);

// Bulk-import av meny (YAML/JSON) → kategorier/produkter/pålägg, idempotent upsert.
export type MenuImportResult = {
  ok: boolean;
  dryRun: boolean;
  summary: {
    extraGroupsCreated: number; extraGroupsUpdated: number;
    categoriesCreated: number; categoriesUpdated: number;
    productsCreated: number; productsUpdated: number; links: number;
  };
  errors: string[];
  warnings: string[];
  examples: string[];
};
export const menuBulkImport = (payload: { restaurantId: string; content: string; apply: boolean }) =>
  apiPost<MenuImportResult>("/admin/menu/bulk-import", payload, { timeout: 5 * 60 * 1000 });

// Kedjesynk master→platser (steg 3). Idempotent; lokal isActive bevaras.
export interface MenuSyncSummary {
  categoriesCreated: number; categoriesUpdated: number;
  productsCreated: number; productsUpdated: number;
  groupsCreated: number; groupsReused: number; links: number;
}
export interface MenuSyncResponse {
  ok: boolean;
  dryRun: boolean;
  results: Array<{ targetRestaurantId: string; summary: MenuSyncSummary; warnings: string[] }>;
}
export const menuSync = (payload: { sourceRestaurantId: string; targetRestaurantIds: string[]; apply: boolean }) =>
  apiPost<MenuSyncResponse>("/admin/menu/sync", payload, { timeout: 5 * 60 * 1000 });

// Copy/import — nya id genereras, källan rörs inte.
export const copyCategory = (sourceId: string, targetRestaurantId: string) =>
  apiPost<CategoryRecord>(`/admin/categories/${sourceId}/copy`, { targetRestaurantId });
export const copyProduct = (sourceId: string, targetRestaurantId: string, targetCategoryId: string) =>
  apiPost<ProductRecord>(`/admin/products/${sourceId}/copy`, { targetRestaurantId, targetCategoryId });
export const copyExtraGroup = (sourceId: string, targetRestaurantId: string) =>
  apiPost<ExtraGroupRecord>(`/admin/extra-groups/${sourceId}/copy`, { targetRestaurantId });
