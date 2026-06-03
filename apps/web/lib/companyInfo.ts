import { API_URL } from "@/lib/api";

/**
 * Centraliserad form för plattformens företagsinfo. Hämtas från API:s
 * `GET /api/settings` (singleton-rad i RestaurantSettings) och används av
 * Terms-, Privacy-, About-, Contact- och SupportChat-komponenterna.
 *
 * Värden är alltid icke-null efter `getCompanyInfo()` returnerar — fallback-
 * defaults appliceras här så consumers slipper own null-hantering.
 */
export interface CompanyInfo {
  name: string;
  organizationNumber: string;
  address: string;
  supportEmail: string;
  privacyEmail: string;
  noReplyEmail: string;
  // För Contact-sidan
  contactPhone: string | null;
  contactPhoneHours: string | null;
  contactEmail: string | null;
  contactAddress: string | null;
  // Admin-skriven "Om oss"-text (valfri)
  aboutBody: string | null;
}

export const DEFAULT_COMPANY_INFO: CompanyInfo = {
  // Fallbacks om admin ännu inte fyllt i Plattform-inställningar. Det juridiska
  // namnet + orgnr + e-post sätts i admin (GET /api/settings) och vinner alltid.
  name: "Delívera",
  organizationNumber: "",
  address: "",
  supportEmail: "support@delivera.se",
  privacyEmail: "privacy@delivera.se",
  noReplyEmail: "no-reply@delivera.se",
  contactPhone: null,
  contactPhoneHours: null,
  contactEmail: null,
  contactAddress: null,
  aboutBody: null,
};

/**
 * Servernsida-fetch — använd från Next.js Server Components.
 * `revalidate: 300` ger 5-minuters cache så pages stays snappy.
 */
export async function getCompanyInfo(): Promise<CompanyInfo> {
  try {
    const res = await fetch(`${API_URL}/api/settings`, { next: { revalidate: 300 } });
    if (!res.ok) return DEFAULT_COMPANY_INFO;
    const data = await res.json();
    return {
      name: (data.companyName as string) || DEFAULT_COMPANY_INFO.name,
      organizationNumber:
        (data.organizationNumber as string) || DEFAULT_COMPANY_INFO.organizationNumber,
      address: (data.companyAddress as string) || DEFAULT_COMPANY_INFO.address,
      supportEmail:
        (data.supportEmail as string) ||
        (data.contactEmail as string) ||
        DEFAULT_COMPANY_INFO.supportEmail,
      privacyEmail:
        (data.privacyEmail as string) ||
        (data.supportEmail as string) ||
        (data.contactEmail as string) ||
        DEFAULT_COMPANY_INFO.privacyEmail,
      noReplyEmail: (data.noReplyEmail as string) || DEFAULT_COMPANY_INFO.noReplyEmail,
      contactPhone: (data.contactPhone as string) || null,
      contactPhoneHours: (data.contactPhoneHours as string) || null,
      contactEmail: (data.contactEmail as string) || null,
      contactAddress: (data.contactAddress as string) || null,
      aboutBody: (data.aboutBody as string) || null,
    };
  } catch {
    return DEFAULT_COMPANY_INFO;
  }
}
