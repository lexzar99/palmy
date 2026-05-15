import { apiGet, apiPatch, apiPost } from "@/shared/api/client";

// ────────────────────────────────────────────────────────────────────────────
// Welcome-deal + Referral settings — singleton-konfig sparad i AdminSettings
// ────────────────────────────────────────────────────────────────────────────
export interface WelcomeDealSettings {
  welcomeDealActive: boolean;
  welcomeDealAmountKr: number;
  welcomeDealMinOrderKr: number;
  welcomeDealExpiresDays: number;
  referralEnabled: boolean;
  referralRewardKr: number;
  referralMinOrderKr: number;
}

export const welcomeDealQueryKey = ["marketing-referrals", "welcome-deal"] as const;

export const getWelcomeDealSettings = () =>
  apiGet<WelcomeDealSettings>("/admin/welcome-deal");

export const updateWelcomeDealSettings = (payload: Partial<WelcomeDealSettings>) =>
  apiPatch<WelcomeDealSettings>("/admin/welcome-deal", payload);

// ────────────────────────────────────────────────────────────────────────────
// Referrals list — paginerad
// ────────────────────────────────────────────────────────────────────────────
export type ReferralStatus =
  | "PENDING"
  | "REGISTERED"
  | "ORDERED"
  | "REWARDED"
  | "REVERTED"
  | "EXPIRED";

export interface ReferralRecord {
  id: string;
  code: string;
  inviterUserId: string | null;
  inviterName: string | null;
  inviterEmail: string | null;
  inviteeUserId: string | null;
  inviteeName: string | null;
  inviteeEmail: string | null;
  status: ReferralStatus;
  fraudFlags: string[];
  createdAt: string;
  registeredAt: string | null;
  rewardedAt: string | null;
  inviteeOrderId: string | null;
  revertedAt: string | null;
  revertReason: string | null;
}

export interface ReferralsListResponse {
  data: ReferralRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReferralsListParams {
  status?: string;
  search?: string;
  page?: number;
}

export const referralsListQueryKey = (params: ReferralsListParams) =>
  ["marketing-referrals", "list", params.status ?? "", params.search ?? "", params.page ?? 1] as const;

export const getReferrals = (params: ReferralsListParams) => {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.search) qs.set("search", params.search);
  if (params.page) qs.set("page", String(params.page));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiGet<ReferralsListResponse>(`/admin/referrals${suffix}`);
};

export const referralDetailQueryKey = (id: string | null) =>
  ["marketing-referrals", "detail", id] as const;

export const getReferral = (id: string) => apiGet<ReferralRecord>(`/admin/referrals/${id}`);

export const revertReferral = (id: string, reason: string) =>
  apiPost<{ success: boolean }>(`/admin/referrals/${id}/revert`, { reason });

// ────────────────────────────────────────────────────────────────────────────
// Referral-statistik
// ────────────────────────────────────────────────────────────────────────────
export interface ReferralFunnel {
  invited: number;
  registered: number;
  ordered: number;
  rewarded: number;
}

export interface ReferralTopInviter {
  userId: string;
  name: string;
  count: number;
  earnedKr: number;
}

export interface ReferralSuspiciousPattern {
  pattern: string;
  count: number;
}

export interface ReferralStats {
  funnel: ReferralFunnel;
  topInviters: ReferralTopInviter[];
  suspiciousPatterns: ReferralSuspiciousPattern[];
}

export const referralStatsQueryKey = ["marketing-referrals", "stats"] as const;

export const getReferralStats = () => apiGet<ReferralStats>("/admin/stats/referrals");
