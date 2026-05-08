import { apiDelete, apiGet, apiPatch, apiPost } from "@/shared/api/client";

export interface DiscountRecord {
  id: string;
  code: string;
  description: string | null;
  discountType: "percentage" | "fixed" | "free_delivery";
  discountValue: number;
  minOrderAmount: number;
  maxUses: number | null;
  usedCount: number;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  restaurantId: string | null;
  applicableRestaurantIds: string[];
  createdAt: string;
  updatedAt: string;
}

export const discountsQueryKey = ["discounts"] as const;

export const getDiscounts = () => apiGet<DiscountRecord[]>("/admin/discounts");
export const createDiscount = (data: Record<string, unknown>) => apiPost<DiscountRecord>("/admin/discounts", data);
export const updateDiscount = (id: string, data: Record<string, unknown>) => apiPatch<DiscountRecord>(`/admin/discounts/${id}`, data);
export const deleteDiscount = (id: string) => apiDelete<{ success: boolean }>(`/admin/discounts/${id}`);
