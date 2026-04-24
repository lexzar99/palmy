import { apiDelete, apiGet, apiPatch, apiPost } from "@/shared/api/client";

export type DealScopeType = "RESTAURANT" | "PRODUCT" | "CATEGORY" | "COMBO" | "MIN_ORDER";
export type DealDiscountType = "PERCENTAGE" | "FIXED" | "FIXED_PRICE";

export interface AutomaticDealRecord {
  id: string;
  title: string;
  description?: string | null;
  badgeText?: string | null;
  scopeType: DealScopeType;
  triggerType: string;
  discountType: DealDiscountType | string;
  discountValue: number;
  minOrder: number;
  targetIds: string[];
  comboProductIds: string[];
  isActive: boolean;
  isGlobal: boolean;
  showOnSite: boolean;
  popupEnabled: boolean;
  validUntil?: string | null;
  validFrom?: string | null;
  maxUsages?: number | null;
  maxUsesPerCustomer?: number | null;
  usageCount?: number;
  sortOrder: number;
  restaurantId?: string | null;
  restaurant?: { id: string; name: string; slug: string } | null;
  applicableRestaurantIds?: string[];
}

export interface DiscountCodeRecord {
  id: string;
  code: string;
  description?: string | null;
  discountType: "fixed" | "percentage";
  discountValue: number;
  minOrderAmount: number;
  maxUses?: number | null;
  usedCount: number;
  startsAt?: string | null;
  expiresAt?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DealRestaurantRef {
  id: string;
  name: string;
  slug: string;
  city?: string | null;
}

export interface DealCategoryRef {
  id: string;
  name: string;
  restaurantId?: string | null;
  _count?: { products: number };
}

export interface DealProductRef {
  id: string;
  name: string;
  categoryId: string;
  category: { name: string };
  price: number;
}

export const dealsQueryKey = ["deals", "automatic"] as const;
export const discountCodesQueryKey = ["deals", "codes"] as const;
export const dealRestaurantsQueryKey = ["deals", "restaurants"] as const;
export const dealCategoriesQueryKey = (restaurantId: string | null) => ["deals", "categories", restaurantId] as const;
export const dealProductsQueryKey = (restaurantId: string | null) => ["deals", "products", restaurantId] as const;

export const getAutomaticDeals = () => apiGet<AutomaticDealRecord[]>("/admin/deals");
export const getDiscountCodes = () => apiGet<DiscountCodeRecord[]>("/admin/discounts");
export const getDealRestaurants = () => apiGet<DealRestaurantRef[]>("/restaurants");
export const getDealCategories = (restaurantId: string) => apiGet<DealCategoryRef[]>(`/admin/categories?restaurantId=${restaurantId}`);
export const getDealProducts = (restaurantId: string) => apiGet<DealProductRef[]>(`/admin/products?restaurantId=${restaurantId}`);

export const createAutomaticDeal = (payload: Record<string, unknown>) => apiPost<AutomaticDealRecord>("/admin/deals", payload);
export const updateAutomaticDeal = (dealId: string, payload: Record<string, unknown>) => apiPatch<AutomaticDealRecord>(`/admin/deals/${dealId}`, payload);
export const deleteAutomaticDeal = (dealId: string) => apiDelete<{ success: boolean }>(`/admin/deals/${dealId}`);

export const createDiscountCode = (payload: Record<string, unknown>) => apiPost<DiscountCodeRecord>("/admin/discounts", payload);
export const updateDiscountCode = (codeId: string, payload: Record<string, unknown>) => apiPatch<DiscountCodeRecord>(`/admin/discounts/${codeId}`, payload);
export const deleteDiscountCode = (codeId: string) => apiDelete<{ success: boolean }>(`/admin/discounts/${codeId}`);
