import { apiGet } from '@/shared/api/client';

export type ContentPlacement =
  | 'HOME_HERO'
  | 'HOME_FEATURED'
  | 'HOME_INLINE'
  | 'HOME_RAIL'
  | 'ORDER_TRACKING'
  | 'POST_ORDER';

export type ContentType = 'HERO' | 'CATEGORY_RAIL' | 'SHOWCASE' | 'SPONSOR' | 'ADVERTISEMENT';
export type ContentStatus = 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'ENDED';

export interface ContentPlacementRecord {
  id: string;
  sourceId: string;
  type: ContentType;
  placement: ContentPlacement;
  title: string;
  subtitle?: string | null;
  status: ContentStatus;
  sortOrder: number;
  startsAt?: string | null;
  endsAt?: string | null;
  layout: 'HERO' | 'LARGE_CARD' | 'COMPACT_CARD' | 'RAIL' | 'BANNER';
  editTarget: string;
  metadata?: Record<string, unknown>;
}

export interface ContentPlacementsResponse {
  records: ContentPlacementRecord[];
  summary: {
    total: number;
    live: number;
    scheduled: number;
    paused: number;
    draft: number;
    ended: number;
  };
}

export const contentPlacementsQueryKey = ['content-placements'] as const;
export const getContentPlacements = () => apiGet<ContentPlacementsResponse>('/admin/content-placements');
