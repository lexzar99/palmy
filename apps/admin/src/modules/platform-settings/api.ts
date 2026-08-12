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

export interface CheckoutPaymentMethod {
  id: string;
  label: string;
  direct?: boolean;
}

export const platformSettingsQueryKey = ["platform-settings"] as const;
export const checkoutPaymentMethodsQueryKey = ["checkout-payment-methods"] as const;

/** Vilka betalleverantörer kassan faktiskt kör just nu (PAYMENT_PROVIDERS). */
export const getCheckoutPaymentMethods = () =>
  apiGet<{ methods: CheckoutPaymentMethod[] }>("/payments/methods");

export const getPlatformSettings = () => apiGet<PlatformSettings & Record<string, unknown>>("/settings");

export const updatePlatformSettings = (payload: PlatformSettings) =>
  apiPatch<{ success: boolean }>("/settings", payload);
