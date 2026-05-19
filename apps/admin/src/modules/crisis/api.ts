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

// A11 — platform / city granular crisis controls
export interface CrisisState {
  platformPaused: { until: string; reason: string | null } | null;
  cities: Array<{ id: string; name: string; slug: string; isActive: boolean }>;
}
export const getCrisisState = () => apiGet<CrisisState>("/admin/crisis/state");

export const pausePlatform = (minutes: number, reason?: string) =>
  apiPost<{ success: boolean; until: string; reason: string | null }>("/admin/crisis/pause-platform", { minutes, reason });

export const unpausePlatform = () =>
  apiPost<{ success: boolean }>("/admin/crisis/unpause-platform");

export const pauseCity = (input: { cityId?: string; city?: string; reason?: string }) =>
  apiPost<{ success: boolean; closedCount: number }>("/admin/crisis/pause-city", input);

export const unpauseCity = (input: { cityId?: string; city?: string }) =>
  apiPost<{ success: boolean; openedCount: number }>("/admin/crisis/unpause-city", input);

// A14 — hero / brand CMS (PATCH /api/settings)
export interface HeroSettings {
  heroTitle?: string | null;
  heroSubtitle?: string | null;
  heroImageUrl?: string | null;
  heroCtaLabel?: string | null;
  heroCtaUrl?: string | null;
}
export const updateHero = (payload: HeroSettings) =>
  apiPatch<{ success: boolean }>("/settings", payload);
