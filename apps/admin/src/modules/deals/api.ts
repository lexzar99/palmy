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
  imageUrl?: string | null;
  popupHeadline?: string | null;
  popupBody?: string | null;
  popupCtaLabel?: string | null;
  popupCode?: string | null;
  validUntil?: string | null;
  validFrom?: string | null;
  maxUsages?: number | null;
  maxUsesPerCustomer?: number | null;
  usageCount?: number;
  sortOrder: number;
  restaurantId?: string | null;
  restaurant?: { id: string; name: string; slug: string } | null;
  applicableRestaurantIds?: string[];
  triggerCategoryId?: string | null;
  triggerQuantity?: number | null;
  rewardCategoryId?: string | null;
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

export interface PersonalCodeRecord {
  id: string;
  code: string;
  isUsed: boolean;
  usageCount: number;
  maxUsages: number;
  createdAt: string;
  user?: { name?: string | null; phone?: string | null } | null;
  campaign?: { title?: string | null; discountType?: string | null; discountValue?: number | null } | null;
}

export interface DealRestaurantRef {
  id: string;
  name: string;
  slug: string;
  city?: string | null;
}

export interface DealCustomerRef {
  id: string;
  name: string;
  phone: string;
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
  discountActive?: boolean | null;
  discountPercent?: number | null;
  discountPrice?: number | null;
  discountLabel?: string | null;
}

export const dealsQueryKey = ["deals", "automatic"] as const;
export const discountCodesQueryKey = ["deals", "codes"] as const;
export const personalCodesQueryKey = ["deals", "personal-codes"] as const;
export const dealRestaurantsQueryKey = ["deals", "restaurants"] as const;
export const dealCustomersQueryKey = ["deals", "customers"] as const;
export const dealCategoriesQueryKey = (restaurantId: string | null) => ["deals", "categories", restaurantId] as const;
export const dealProductsQueryKey = (restaurantId: string | null) => ["deals", "products", restaurantId] as const;

export const getAutomaticDeals = () => apiGet<AutomaticDealRecord[]>("/admin/deals");
export const getDiscountCodes = () => apiGet<DiscountCodeRecord[]>("/admin/discounts");
export const getPersonalCodes = () => apiGet<PersonalCodeRecord[]>("/admin/customer-deals");
export const getDealRestaurants = () => apiGet<DealRestaurantRef[]>("/restaurants");
export const getDealCustomers = () => apiGet<DealCustomerRef[]>("/customers");
export const getDealCategories = (restaurantId: string) => apiGet<DealCategoryRef[]>(`/admin/categories?restaurantId=${restaurantId}&includeGlobal=auto`);
export const getDealProducts = (restaurantId: string) => apiGet<DealProductRef[]>(`/admin/products?restaurantId=${restaurantId}&includeGlobal=1`);

export const createAutomaticDeal = (payload: Record<string, unknown>) => apiPost<AutomaticDealRecord>("/admin/deals", payload);
export const updateAutomaticDeal = (dealId: string, payload: Record<string, unknown>) => apiPatch<AutomaticDealRecord>(`/admin/deals/${dealId}`, payload);
export const deleteAutomaticDeal = (dealId: string) => apiDelete<{ success: boolean }>(`/admin/deals/${dealId}`);
export const wipeAllDeals = () => apiPost<{ success: boolean; deleted: number }>("/admin/deals/wipe", { confirm: "WIPE_ALL_DEALS" });

export const createDiscountCode = (payload: Record<string, unknown>) => apiPost<DiscountCodeRecord>("/admin/discounts", payload);
export const updateDiscountCode = (codeId: string, payload: Record<string, unknown>) => apiPatch<DiscountCodeRecord>(`/admin/discounts/${codeId}`, payload);
export const deleteDiscountCode = (codeId: string) => apiDelete<{ success: boolean }>(`/admin/discounts/${codeId}`);

export const createPersonalCode = (customerId: string, payload: Record<string, unknown>) => apiPost<PersonalCodeRecord>(`/customers/${customerId}/deals`, payload);
export const updatePersonalCode = (codeId: string, payload: Record<string, unknown>) => apiPatch<PersonalCodeRecord>(`/admin/customer-deals/${codeId}`, payload);
export const deletePersonalCode = (codeId: string) => apiDelete<{ ok: true }>(`/admin/customer-deals/${codeId}`);

export const clearLegacyProductDiscount = (productId: string) =>
  apiPatch(`/admin/products/${productId}`, {
    discountActive: false,
    discountPercent: null,
    discountPrice: null,
    discountImageUrl: null,
    discountLabel: null,
  });
