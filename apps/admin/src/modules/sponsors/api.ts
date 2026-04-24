import { apiDelete, apiGet, apiPatch, apiPost } from "@/shared/api/client";

export interface SponsorRecord {
  id: string;
  name: string;
  imageUrl: string;
  isActive: boolean;
  isClickable: boolean;
  infoText?: string;
  ctaText?: string;
  ctaLink?: string;
  linkType?: "EXTERNAL" | "DEAL" | "RESTAURANT";
  linkTarget?: string;
  showName?: boolean;
  sortOrder: number;
  createdAt: string;
}

export const sponsorsQueryKey = ["sponsors", "all"] as const;

export const getSponsors = () => apiGet<SponsorRecord[]>("/sponsors/all");
export const createSponsor = (payload: Partial<SponsorRecord>) => apiPost<SponsorRecord>("/sponsors", payload);
export const updateSponsor = (sponsorId: string, payload: Partial<SponsorRecord>) => apiPatch<SponsorRecord>(`/sponsors/${sponsorId}`, payload);
export const deleteSponsor = (sponsorId: string) => apiDelete<{ ok: true }>(`/sponsors/${sponsorId}`);
