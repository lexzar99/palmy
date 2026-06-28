import axios from "axios";

// Dpoints — web-klientens API-helpers. Alla anrop går via /api/platform-proxyn
// som vidarebefordrar plattforms-token till backend.

export interface DpointsTx {
  id: string;
  amount: number;
  type: string;
  reason: string | null;
  balanceAfter: number;
  createdAt: string;
}

export interface DpointsStreakState {
  target: number;
  count: number;
  ready: boolean;
  readyInDays: number;
}

export interface DpointsMe {
  enabled: boolean;
  balance: number;
  valuePerKr: number;
  signup?: { claimable: boolean; bonusPoints: number };
  streak?: DpointsStreakState;
  transactions: DpointsTx[];
}

export interface DpointsReward {
  id: string;
  title: string;
  description: string | null;
  pointsCost: number;
  discountType: string;
  discountKr: number | null;
  discountPercent: number | null;
  minOrderKr: number;
  validDays: number;
  imageUrl: string | null;
}

export interface SponsorCardData {
  id: string;
  title: string;
  sponsorName: string | null;
  description: string | null;
  imageUrl: string | null;
  bonusPoints: number;
  ctaLabel: string | null;
}

export const fetchDpointsMe = () => axios.get<DpointsMe>("/api/platform/dpoints/me").then((r) => r.data);

export interface EarnRule {
  key: string;
  label: string;
  points: number;
  repeat?: string;
}

export interface RewardProduct {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  imageUrl?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  pointsPrice: number;
  multiplier?: number | null;
  tier?: { key: string; label: string; rank: number };
}

export interface RewardRestaurant {
  id: string;
  name: string;
  slug: string;
  cuisine?: string | null;
  imageUrl?: string | null;
  logoUrl?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  products: RewardProduct[];
}

export const fetchDpointsRewards = () =>
  axios
    .get<{ enabled: boolean; valuePerKr: number; rewards: DpointsReward[]; earnRules?: EarnRule[]; streakTarget?: number }>("/api/platform/dpoints/rewards")
    .then((r) => r.data);

export const fetchRewardProducts = (refresh = false) =>
  axios
    .get<{ enabled: boolean; earnRate: number; restaurants: RewardRestaurant[] }>("/api/platform/dpoints/reward-products", {
      params: refresh ? { refresh: 1 } : undefined,
    })
    .then((r) => r.data);

export const fetchSponsorCard = () =>
  axios.get<{ card: SponsorCardData | null }>("/api/platform/dpoints/sponsor-card").then((r) => r.data.card);

export const claimDpointsSignup = () =>
  axios.post<{ ok: boolean; points: number; balance: number }>("/api/platform/dpoints/claim-signup").then((r) => r.data);

// Hur en transaktion ska beskrivas/visas.
export function txLabel(t: DpointsTx): string {
  if (t.reason) return t.reason;
  switch (t.type) {
    case "EARN_ORDER":
      return "Köp";
    case "SIGNUP_BONUS":
      return "Välkomstbonus";
    case "CAMPAIGN":
      return "Kampanj";
    case "REDEEM":
      return "Inlöst";
    case "ADMIN_ADJUST":
      return "Justering";
    case "REVERSAL":
      return "Återtag";
    default:
      return t.type;
  }
}
