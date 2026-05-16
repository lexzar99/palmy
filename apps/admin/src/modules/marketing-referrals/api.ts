import { apiGet, apiPatch, apiPost } from "@/shared/api/client";

// ────────────────────────────────────────────────────────────────────────────
// Welcome-deal + Referral settings — singleton-konfig sparad i AdminSettings
// ────────────────────────────────────────────────────────────────────────────
export interface AvailableDeal {
  id: string;
  title: string;
  discountType: string;
  discountValue: number;
  minOrder: number;
  validUntil: string | null;
}

export interface WelcomeDealSettings {
  welcomeDealActive: boolean;
  // Welcome-deal pekar nu på en Personal Template-Deal (samma pattern
  // som referral). Inga hårdkodade kr/percent/days-fält.
  welcomeDealId: string | null;
  referralEnabled: boolean;
  referralDealId: string | null;
  referralCouponsPerSide: number;
  referralMaxRewardsPerInviter: number;
  availableDeals?: AvailableDeal[];
}

export const welcomeDealQueryKey = ["marketing-referrals", "welcome-deal"] as const;

export const getWelcomeDealSettings = () =>
  apiGet<WelcomeDealSettings>("/admin/welcome-deal");

export const updateWelcomeDealSettings = (payload: Partial<WelcomeDealSettings>) =>
  apiPatch<WelcomeDealSettings>("/admin/welcome-deal", payload);

// ─── Personliga Deals (referral-templates) — quick-create från marketing-sidan ─
export type PersonalDealType = "PERCENTAGE" | "FIXED" | "FREE_DELIVERY";

export interface CreatePersonalDealPayload {
  title: string;
  discountType: PersonalDealType;
  discountValue: number; // PERCENT: 25 = 25%. FIXED: belopp i kr. FREE_DELIVERY: 0 (ignoreras).
  minOrder?: number; // kr
  validUntil?: string | null;
}

export const createPersonalDeal = (payload: CreatePersonalDealPayload) =>
  apiPost<{ id: string; title: string }>("/admin/deals", {
    ...payload,
    // Personal template = används bara av referral, syns inte publikt.
    isPersonalTemplate: true,
    showOnSite: false,
    popupEnabled: false,
    isActive: true,
    isGlobal: true,
    triggerType: "NONE",
  });

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
