import { apiDelete, apiGet, apiPatch, apiPost } from "@/shared/api/client";

export interface RestaurantDeal {
  id: string;
  title: string;
  description?: string | null;
  discountType: string;
  discountValue: number;
  minOrder: number;
  isActive: boolean;
  isGlobal: boolean;
  showOnSite: boolean;
  validUntil?: string | null;
  maxUsages?: number | null;
  restaurant?: { id: string; name: string; slug: string } | null;
  applicableRestaurantIds?: string[];
}

export interface CustomerDeal {
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
}

export interface DealCustomerRef {
  id: string;
  name: string;
  phone: string;
}

export const dealsQueryKey = ["deals", "restaurant"] as const;
export const customerDealsQueryKey = ["deals", "customer"] as const;
export const dealRestaurantsQueryKey = ["deals", "restaurants"] as const;
export const dealCustomersQueryKey = ["deals", "customers"] as const;

export const getRestaurantDeals = () => apiGet<RestaurantDeal[]>("/admin/deals");
export const getCustomerDeals = () => apiGet<CustomerDeal[]>("/admin/customer-deals");
export const getDealRestaurants = () => apiGet<DealRestaurantRef[]>("/restaurants");
export const getDealCustomers = () => apiGet<DealCustomerRef[]>("/customers");

export const createRestaurantDeal = (payload: Record<string, unknown>) => apiPost<RestaurantDeal>("/admin/deals", payload);
export const updateRestaurantDeal = (dealId: string, payload: Record<string, unknown>) => apiPatch<RestaurantDeal>(`/admin/deals/${dealId}`, payload);
export const deleteRestaurantDeal = (dealId: string) => apiDelete<{ success: boolean }>(`/admin/deals/${dealId}`);

export const createCustomerDeal = (customerId: string, payload: Record<string, unknown>) => apiPost(`/customers/${customerId}/deals`, payload);
export const updateCustomerDeal = (dealId: string, payload: Record<string, unknown>) => apiPatch<CustomerDeal>(`/admin/customer-deals/${dealId}`, payload);
export const deleteCustomerDeal = (dealId: string) => apiDelete<{ ok: true }>(`/admin/customer-deals/${dealId}`);
