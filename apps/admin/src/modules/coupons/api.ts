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
  // Stackbar fri leverans-flagga: PERCENTAGE eller FIXED kan kombineras med
  // fri leverans i samma kupong (t.ex. "SOMMAR20 → 20% + fri leverans").
  // FREE_DELIVERY-typen ignorerar flaggan (redundant).
  freeDelivery: boolean;
  // Var koden gäller: ALL (överallt) | APP (bara mobilappen) | WEB (bara webben).
  platform: "ALL" | "APP" | "WEB";
  // true = rabatten räknas bara på varor som inte redan är nedsatta
  // (menypris-rea, produkt-/kategorideal, BOGO). Kunden får inte rabatt
  // ovanpå rabatt. false = procenten räknas på hela varukorgen.
  excludeDiscountedItems: boolean;
  // Avstängd som standard. Måste slås på explicit för restaurangens privata embed.
  partnerEmbedEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export const discountsQueryKey = ["discounts"] as const;

export const getDiscounts = () => apiGet<DiscountRecord[]>("/admin/discounts");
export const createDiscount = (data: Record<string, unknown>) => apiPost<DiscountRecord>("/admin/discounts", data);
export const updateDiscount = (id: string, data: Record<string, unknown>) => apiPatch<DiscountRecord>(`/admin/discounts/${id}`, data);
export const deleteDiscount = (id: string) => apiDelete<{ success: boolean }>(`/admin/discounts/${id}`);
