import { apiGet, apiPatch } from "@/shared/api/client";

export type ShowcaseSurface = "champion" | "discounts" | "trending" | "new";

export interface ShowcaseShownItem {
  restaurantId: string;
  name: string;
  slug: string;
  label: string;
  pinned: boolean;
  featuredClass: number;
}

export interface ShowcaseCandidate {
  restaurantId: string;
  name: string;
  slug: string;
  label: string;
  featuredClass: number;
}

export interface ShowcaseSurfaceData {
  surface: ShowcaseSurface;
  rotationHours: number;
  rotatedAt: string | null;
  shown: ShowcaseShownItem[];
  candidates: ShowcaseCandidate[];
}

export interface ShowcaseRestaurant {
  id: string;
  name: string;
  slug: string;
  featuredClass: number;
}

export interface ShowcaseResponse {
  surfaces: ShowcaseSurfaceData[];
  restaurants: ShowcaseRestaurant[];
}

export interface ShowcasePatch {
  rotationHours?: number;
  hide?: string;
  unhide?: string;
  pin?: string;
  unpin?: string;
}

export const showcaseQueryKey = ["showcase", "admin"] as const;

export const getShowcase = () => apiGet<ShowcaseResponse>("/admin/showcase");
export const patchShowcase = (surface: ShowcaseSurface, payload: ShowcasePatch) =>
  apiPatch<{ surfaces: ShowcaseSurfaceData[] }>(`/admin/showcase/${surface}`, payload);
