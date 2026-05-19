import { apiGet, apiPatch } from "@/shared/api/client";

export interface PlatformSettings {
  contactPhone?: string | null;
  contactPhoneHours?: string | null;
  contactEmail?: string | null;
  contactAddress?: string | null;
  aboutBody?: string | null;
  showDiscountedRail?: boolean;
  // Företagsidentitet — visas i Terms/Privacy + support-flows i web + RN.
  companyName?: string | null;
  organizationNumber?: string | null;
  companyAddress?: string | null;
  supportEmail?: string | null;
  privacyEmail?: string | null;
  noReplyEmail?: string | null;
  // A14: hero / brand CMS — visas på kund-webbens startsida.
  heroTitle?: string | null;
  heroSubtitle?: string | null;
  heroImageUrl?: string | null;
  heroCtaLabel?: string | null;
  heroCtaUrl?: string | null;
}

export const platformSettingsQueryKey = ["platform-settings"] as const;

export const getPlatformSettings = () => apiGet<PlatformSettings & Record<string, unknown>>("/settings");

export const updatePlatformSettings = (payload: PlatformSettings) =>
  apiPatch<{ success: boolean }>("/settings", payload);
