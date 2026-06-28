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
  linkType?: "NONE" | "EXTERNAL" | "DEAL" | "RESTAURANT";
  linkTarget?: string;
  showName?: boolean;
  imageOnly?: boolean;
  category?: string;
  tier?: "Huvudpartner" | "Partner" | string;
  tagline?: string;
  color?: string;
  startsAt?: string;
  endsAt?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt?: string;
}

export interface TrackingAdRecord {
  id: string;
  brand: string;
  title: string;
  subtitle: string;
  imageUrl?: string;
  url?: string;
  imageOnly?: boolean;
  startsAt?: string;
  endsAt?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt?: string;
}

export const sponsorsQueryKey = ["sponsors", "all"] as const;
export const adsQueryKey = ["tracking-ads", "all"] as const;

export const getSponsors = () => apiGet<SponsorRecord[]>("/sponsors/all");
export const createSponsor = (payload: Partial<SponsorRecord>) => apiPost<SponsorRecord>("/sponsors", payload);
export const updateSponsor = (sponsorId: string, payload: Partial<SponsorRecord>) => apiPatch<SponsorRecord>(`/sponsors/${sponsorId}`, payload);
export const deleteSponsor = (sponsorId: string) => apiDelete<{ ok: true }>(`/sponsors/${sponsorId}`);

export const getAds = () => apiGet<TrackingAdRecord[]>("/ads/all");
export const createAd = (payload: Partial<TrackingAdRecord>) => apiPost<TrackingAdRecord>("/ads", payload);
export const updateAd = (adId: string, payload: Partial<TrackingAdRecord>) => apiPatch<TrackingAdRecord>(`/ads/${adId}`, payload);
export const deleteAd = (adId: string) => apiDelete<{ ok: true }>(`/ads/${adId}`);
