import { apiGet, apiPatch } from "@/shared/api/client";

export interface PlatformSettings {
  contactPhone?: string | null;
  contactPhoneHours?: string | null;
  contactEmail?: string | null;
  contactAddress?: string | null;
  aboutBody?: string | null;
}

export const platformSettingsQueryKey = ["platform-settings"] as const;

export const getPlatformSettings = () => apiGet<PlatformSettings & Record<string, unknown>>("/settings");

export const updatePlatformSettings = (payload: PlatformSettings) =>
  apiPatch<{ success: boolean }>("/settings", payload);
