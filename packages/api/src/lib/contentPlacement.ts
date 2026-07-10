export type ContentPlacement =
  | 'HOME_HERO'
  | 'HOME_FEATURED'
  | 'HOME_INLINE'
  | 'HOME_RAIL'
  | 'ORDER_TRACKING'
  | 'POST_ORDER';

export type ContentType =
  | 'HERO'
  | 'CATEGORY_RAIL'
  | 'SHOWCASE'
  | 'SPONSOR'
  | 'ADVERTISEMENT';

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

export function resolveContentStatus(input: {
  isActive: boolean;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  hasContent?: boolean;
  now?: Date;
}): ContentStatus {
  if (input.hasContent === false) return 'DRAFT';
  if (!input.isActive) return 'PAUSED';
  const now = input.now ?? new Date();
  const startsAt = input.startsAt ? new Date(input.startsAt) : null;
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (startsAt && !Number.isNaN(startsAt.getTime()) && startsAt > now) return 'SCHEDULED';
  if (endsAt && !Number.isNaN(endsAt.getTime()) && endsAt < now) return 'ENDED';
  return 'LIVE';
}
