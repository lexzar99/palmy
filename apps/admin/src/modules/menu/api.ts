import { apiDelete, apiGet, apiPatch, apiPost } from "@/shared/api/client";

export interface RestaurantRef {
  id: string;
  name: string;
  slug: string;
  city?: string | null;
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

// Copy/import — nya id genereras, källan rörs inte.
export const copyCategory = (sourceId: string, targetRestaurantId: string) =>
  apiPost<CategoryRecord>(`/admin/categories/${sourceId}/copy`, { targetRestaurantId });
export const copyProduct = (sourceId: string, targetRestaurantId: string, targetCategoryId: string) =>
  apiPost<ProductRecord>(`/admin/products/${sourceId}/copy`, { targetRestaurantId, targetCategoryId });
export const copyExtraGroup = (sourceId: string, targetRestaurantId: string) =>
  apiPost<ExtraGroupRecord>(`/admin/extra-groups/${sourceId}/copy`, { targetRestaurantId });
