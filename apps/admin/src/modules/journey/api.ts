import { apiGet } from "@/shared/api/client";

/** Ett steg i tratten, med hur många som föll bort på vägen dit. */
export interface FunnelStep {
  step: string;
  label: string;
  reached: number;
  lost: number;
  /** Andel av föregående steg som tog sig hit. Trattens verkliga läckor. */
  shareOfPrevious: number;
  shareOfStart: number;
}

/** En besökares väg genom flödet. */
export interface JourneyPerson {
  sessionId: string;
  phone: string | null;
  email: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  firstSeen: string;
  lastSeen: string;
  orderId: string | null;
  steps: string[];
  deepestStep: string;
  deepestStepLabel: string;
  deepestIndex: number;
  /** Läsbar förklaring till var det tog slut. */
  outcome: string;
  ordered: boolean;
  restaurants: string[];
  rejectedAddress: string | null;
}

export interface JourneyReport {
  days: number;
  from: string;
  totals: { sessions: number; identified: number; ordered: number; conversion: number };
  funnel: FunnelStep[];
  problems: { step: string; label: string; sessions: number }[];
  outcomes: { outcome: string; sessions: number }[];
  sources: { source: string; sessions: number; orders: number }[];
  people: JourneyPerson[];
}

export const journeyQueryKey = (days: number) => ["journey", days] as const;

export const getJourney = (days: number) =>
  apiGet<JourneyReport>(`/admin/journey?days=${days}`);
