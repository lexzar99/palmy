import { apiDelete, apiGet, apiPatch, apiPost } from "@/shared/api/client";

// ── Auto-kampanjer ──────────────────────────────────────────────────────────
// Klient mot /admin/deal-campaigns. Motorn tilldelar UserDeals till kunder som
// matchar ett segment, viktade över en pool av deal-mallar (isTemplate=true).

export type CampaignStatus = "DRAFT" | "SCHEDULED" | "ACTIVE" | "PAUSED" | "DONE";

export interface DealCampaignVariant {
  dealTemplateId: string;
  weight: number;
}

export interface DealCampaignTemplate {
  id: string;
  title: string;
  discountType: string;
  discountValue: number;
  freeDelivery: boolean;
  minOrder: number;
  appDpointsBonus: number;
  appTemplate?: string | null;
  appTheme?: string | null;
}

export interface DealCampaignRecord {
  id: string;
  title: string;
  segment: string;
  status: CampaignStatus;
  variants: DealCampaignVariant[];
  restaurantId?: string | null;
  brandId?: string | null;
  capPerCustomer: number;
  validDays: number;
  scheduledAt?: string | null;
  lastRunAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  stats?: { assigned: number; redeemed: number };
}

export interface DealCampaignInput {
  title: string;
  segment: string;
  variants: DealCampaignVariant[];
  status?: CampaignStatus;
  restaurantId?: string | null;
  brandId?: string | null;
  capPerCustomer?: number;
  validDays?: number;
  scheduledAt?: string | null;
}

export interface DealCampaignRunResult {
  assigned: number;
  skipped: number;
}

export const dealCampaignsQueryKey = ["deals", "campaigns"] as const;
export const dealCampaignByIdQueryKey = (id: string) => ["deals", "campaigns", id] as const;
export const dealCampaignSegmentsQueryKey = ["deals", "campaigns", "segments"] as const;
export const dealCampaignTemplatesQueryKey = ["deals", "campaigns", "templates"] as const;
export const dealCampaignPreviewQueryKey = (segment: string) => ["deals", "campaigns", "preview", segment] as const;

export const getDealCampaigns = () =>
  apiGet<{ campaigns: DealCampaignRecord[] }>("/admin/deal-campaigns").then((r) => r.campaigns);

export const getDealCampaign = (id: string) =>
  apiGet<{ campaign: DealCampaignRecord }>(`/admin/deal-campaigns/${id}`).then((r) => r.campaign);

export const getDealCampaignSegments = () =>
  apiGet<{ segments: string[] }>("/admin/deal-campaigns/segments").then((r) => r.segments);

export const getDealCampaignTemplates = () =>
  apiGet<{ templates: DealCampaignTemplate[] }>("/admin/deal-campaigns/templates").then((r) => r.templates);

export interface DealTemplateInput {
  title: string;
  discountType: "PERCENTAGE" | "FIXED" | "NONE";
  discountValue: number;
  freeDelivery?: boolean;
  appDpointsBonus?: number;
  minOrderKr?: number;
  appTemplate?: string;
  appTheme?: string | null;
}

export const createDealTemplate = (payload: DealTemplateInput) =>
  apiPost<{ template: DealCampaignTemplate }>("/admin/deal-campaigns/templates", payload).then((r) => r.template);

export const getDealCampaignPreview = (segment: string) =>
  apiGet<{ segment: string; count: number }>(`/admin/deal-campaigns/preview?segment=${encodeURIComponent(segment)}`);

export const createDealCampaign = (payload: DealCampaignInput) =>
  apiPost<{ campaign: DealCampaignRecord }>("/admin/deal-campaigns", payload).then((r) => r.campaign);

export const updateDealCampaign = (id: string, payload: Partial<DealCampaignInput>) =>
  apiPatch<{ campaign: DealCampaignRecord }>(`/admin/deal-campaigns/${id}`, payload).then((r) => r.campaign);

export const deleteDealCampaign = (id: string) =>
  apiDelete<{ ok: true }>(`/admin/deal-campaigns/${id}`);

export const runDealCampaign = (id: string) =>
  apiPost<DealCampaignRunResult>(`/admin/deal-campaigns/${id}/run`, {});

// ── Etiketter ───────────────────────────────────────────────────────────────

export const SEGMENT_LABELS: Record<string, string> = {
  ALL: "Alla kunder",
  new_users_7d: "Nya (7 dagar)",
  inactive_30d: "Inaktiva (30 dagar)",
  active_repeaters: "Återkommande",
};

export const segmentLabel = (segment: string) => SEGMENT_LABELS[segment] ?? segment;

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: "Utkast",
  SCHEDULED: "Schemalagd",
  ACTIVE: "Aktiv",
  PAUSED: "Pausad",
  DONE: "Klar",
};

export const campaignStatusLabel = (status: string) =>
  CAMPAIGN_STATUS_LABELS[status as CampaignStatus] ?? status;

/** Kort mänsklig etikett för en deal-mall, härledd från rabattfälten. */
export function templateLabel(t: DealCampaignTemplate): string {
  const parts: string[] = [];
  if (t.freeDelivery) parts.push("Fri leverans");
  if (t.discountType === "PERCENTAGE" && t.discountValue > 0) parts.push(`${t.discountValue}% rabatt`);
  if ((t.discountType === "FIXED" || t.discountType === "FIXED_PRICE") && t.discountValue > 0) parts.push(`${t.discountValue} kr`);
  if ((t.appDpointsBonus ?? 0) > 0) parts.push(`+${t.appDpointsBonus} Vpoints`);
  if (parts.length === 0) return t.title || "Mall";
  return parts.join(" + ");
}
