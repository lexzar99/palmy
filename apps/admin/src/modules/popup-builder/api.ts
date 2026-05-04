import { apiDelete, apiGet, apiPatch, apiPost } from "@/shared/api/client";

export interface PopupDealRecord {
  id: string;
  title: string;
  description: string | null;
  badgeText: string | null;
  imageUrl: string | null;
  popupHeadline: string | null;
  popupBody: string | null;
  popupCtaLabel: string | null;
  popupCode: string | null;
  discountType: "PERCENTAGE" | "FIXED" | "FIXED_PRICE";
  discountValue: number;
  minOrder: number;
  isActive: boolean;
  popupEnabled: boolean;
  showOnSite: boolean;
  isGlobal: boolean;
  applicableRestaurantIds: string[];
  restaurantId: string | null;
  validUntil: string | null;
  validFrom: string | null;
  maxUsages: number | null;
  maxUsesPerCustomer: number | null;
  scopeType: "RESTAURANT" | "PRODUCT" | "CATEGORY" | "COMBO" | "MIN_ORDER";
  createdAt: string;
}

export type PopupDealPayload = Partial<Omit<PopupDealRecord, "id" | "createdAt">> & {
  title: string;
};

export const popupDealsQueryKey = ["popup-deals", "list"] as const;

// /admin/deals returnerar alla deals. Vi identifierar "äkta" popup-deals
// på närvaro av popupHeadline/popupBody/popupCode — popupEnabled ensamt
// är inte nog, eftersom legacy-default är true på vanliga deals.
// Backend returnerar en array (inte { deals: [...] }) så vi hanterar båda.
export const getPopupDeals = async (): Promise<PopupDealRecord[]> => {
  const raw = await apiGet<any>("/admin/deals");
  const list: any[] = Array.isArray(raw) ? raw : raw?.deals || [];
  return list.filter((d: any) =>
    Boolean(d?.popupHeadline?.trim() || d?.popupBody?.trim() || d?.popupCode?.trim()),
  );
};

export const createPopupDeal = (payload: PopupDealPayload) =>
  apiPost<PopupDealRecord>("/admin/deals", { ...payload, popupEnabled: true });

export const updatePopupDeal = (id: string, payload: PopupDealPayload) =>
  apiPatch<PopupDealRecord>(`/admin/deals/${id}`, { ...payload, popupEnabled: true });

export const deletePopupDeal = (id: string) =>
  apiDelete<{ success: boolean }>(`/admin/deals/${id}`);
