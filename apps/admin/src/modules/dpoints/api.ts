import { apiGet, apiPost, apiPatch, apiDelete } from "@/shared/api/client";

export interface DpointsConfig {
  dpointsEnabled: boolean;
  dpointsPerKr: number;
  dpointsValuePerKr: number;
  dpointsCardOnHome: boolean;
  dpointsMaxBalance: number;
  dpointsCourierCost: number; // öre — budkostnad på poäng-enbart order vid leverans
}

export interface DpointsOverview {
  outstanding: number;
  totalEarned: number;
  totalRedeemed: number;
  holders: number;
}

export interface SponsorCard {
  id: string;
  title: string;
  sponsorName: string | null;
  description: string | null;
  imageUrl: string | null;
  bonusPoints: number;
  ctaLabel: string | null;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

export interface DpointsReward {
  id: string;
  title: string;
  description: string | null;
  pointsCost: number;
  discountType: "FIXED" | "PERCENTAGE";
  discountValue: number; // FIXED: öre, PERCENTAGE: %
  minOrderKr: number;
  validDays: number;
  isActive: boolean;
  imageUrl: string | null;
}

export interface PointsCampaign {
  id: string;
  name: string;
  description: string | null;
  type: "MULTIPLIER" | "STREAK_DAILY" | "STREAK_WEEKLY";
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  minOrderKr: number;
  multiplier: number | null;
  rewardPoints: number | null;
  targetCount: number | null;
  repeatable: boolean;
  _count?: { progress: number };
}

export interface DpointsCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  pointsBalance: number;
}

export interface PointsTx {
  id: string;
  amount: number;
  type: string;
  reason: string | null;
  balanceAfter: number;
  createdAt: string;
}

export interface Redemption {
  id: string;
  userName: string | null;
  userPhone: string | null;
  pointsSpent: number;
  reason: string | null;
  code: string | null;
  createdAt: string;
}

const base = "/admin/dpoints";

export const dpointsKeys = {
  config: ["dpoints", "config"] as const,
  overview: ["dpoints", "overview"] as const,
  sponsors: ["dpoints", "sponsors"] as const,
  rewards: ["dpoints", "rewards"] as const,
  campaigns: ["dpoints", "campaigns"] as const,
  customers: (s: string) => ["dpoints", "customers", s] as const,
  customer: (id: string) => ["dpoints", "customer", id] as const,
  redemptions: ["dpoints", "redemptions"] as const,
};

export const getConfig = () => apiGet<DpointsConfig>(`${base}/config`);
export const updateConfig = (p: Partial<DpointsConfig>) => apiPatch<DpointsConfig>(`${base}/config`, p);
export const getOverview = () => apiGet<DpointsOverview>(`${base}/overview`);

export const getSponsors = () => apiGet<{ cards: SponsorCard[] }>(`${base}/sponsor-cards`).then((r) => r.cards);
export const createSponsor = (p: Partial<SponsorCard>) => apiPost(`${base}/sponsor-cards`, p);
export const updateSponsor = (id: string, p: Partial<SponsorCard>) => apiPatch(`${base}/sponsor-cards/${id}`, p);
export const deleteSponsor = (id: string) => apiDelete(`${base}/sponsor-cards/${id}`);

// discountValueKr = kr-input för FIXED (API:t normaliserar till öre).
export const getRewards = () => apiGet<{ rewards: DpointsReward[] }>(`${base}/rewards`).then((r) => r.rewards);
export const createReward = (p: Record<string, unknown>) => apiPost(`${base}/rewards`, p);
export const updateReward = (id: string, p: Record<string, unknown>) => apiPatch(`${base}/rewards/${id}`, p);
export const deleteReward = (id: string) => apiDelete(`${base}/rewards/${id}`);

export const getCampaigns = () => apiGet<{ campaigns: PointsCampaign[] }>(`${base}/campaigns`).then((r) => r.campaigns);
export const createCampaign = (p: Record<string, unknown>) => apiPost(`${base}/campaigns`, p);
export const updateCampaign = (id: string, p: Record<string, unknown>) => apiPatch(`${base}/campaigns/${id}`, p);
export const deleteCampaign = (id: string) => apiDelete(`${base}/campaigns/${id}`);

export const getCustomers = (search: string) =>
  apiGet<{ customers: DpointsCustomer[] }>(`/admin/dpoints/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`).then((r) => r.customers);
export const getCustomer = (id: string) =>
  apiGet<{ customer: DpointsCustomer; transactions: PointsTx[] }>(`${base}/customers/${id}`);
export const adjustCustomer = (id: string, amount: number, reason: string) =>
  apiPost<{ ok: boolean; balanceAfter: number }>(`${base}/customers/${id}/adjust`, { amount, reason });

export const getRedemptions = () => apiGet<{ redemptions: Redemption[] }>(`${base}/redemptions`).then((r) => r.redemptions);
