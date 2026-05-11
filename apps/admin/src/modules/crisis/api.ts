import { apiGet, apiPatch, apiPost } from "@/shared/api/client";

export const emergencyCloseAll = (reason: string) =>
  apiPost<{ success: boolean; closedCount: number }>("/admin/emergency-close-all", { reason });

export const emergencyOpenAll = () =>
  apiPost<{ success: boolean; openedCount: number }>("/admin/emergency-open-all");

export interface BulkRefundResult {
  summary: {
    total: number;
    refunded: number;
    skipped: number;
    failed: number;
  };
}

export const bulkRefundRestaurant = (
  restaurantId: string,
  payload: { fromDate: string; toDate: string; reason: string },
) => apiPost<BulkRefundResult>(`/admin/restaurants/${restaurantId}/bulk-refund`, payload);

export const deactivateRestaurant = (restaurantId: string, reason: string) =>
  apiPost<{ success: boolean; datadump: unknown }>(`/admin/restaurants/${restaurantId}/deactivate`, { reason });

export interface PlatformBannerSettings {
  bannerMessage?: string | null;
  bannerSeverity?: "info" | "warning" | "critical" | null;
  bannerExpiresAt?: string | null;
}

export const getPlatformBanner = () => apiGet<PlatformBannerSettings & Record<string, unknown>>("/settings");
export const updatePlatformBanner = (payload: PlatformBannerSettings) =>
  apiPatch<{ success: boolean }>("/settings", payload);
