import { z } from 'zod';
import { OrderChannel, ORDER_CHANNELS } from './orderChannel';

const short = z.string().max(120).optional();
const touchSchema = z.object({
  source: z.enum(['fb', 'ig', 'meta', 'email', 'google', 'palmyra', 'referral', 'other', 'direct', 'tiktok', 'bing', 'snapchat', 'youtube']),
  evidence: z.enum(['utm', 'click_id', 'referrer', 'direct']),
  at: z.number().finite(), referrer: z.string().max(253).regex(/^[a-z0-9.-]+$/).optional(),
  sourceName: short, campaign: short, medium: short, content: short, adId: short, adSetId: short,
});
const schema = z.object({
  consent: z.literal(true), first: touchSchema, last: touchSchema, current: touchSchema.optional(),
  sessionId: z.string().min(6).max(100).regex(/^[a-zA-Z0-9_-]+$/).nullish(),
  fbc: z.string().max(550).regex(/^fb\.\d+\.\d{13}\.[A-Za-z0-9_-]+$/).optional(),
  fbp: z.string().max(150).regex(/^fb\.\d+\.\d{13}\.\d+$/).optional(),
});
export const SOURCE_LABELS: Record<string, string> = { fb: 'Facebook', ig: 'Instagram', meta: 'Meta (okänd placering)', email: 'Mejl', google: 'Google', palmyra: 'Palmyras hemsida', referral: 'Hänvisning', other: 'Annan kampanj', direct: 'Direkt', tiktok: 'TikTok', bing: 'Bing', snapchat: 'Snapchat', youtube: 'YouTube' };
export const SURFACE_LABELS: Record<string, string> = { PARTNER_EMBED: 'Privat embed', VIAEATS_EMBED: 'viaeats-embed', VIAEATS_WEB: 'viaeats.se', VIAEATS_APP: 'viaeats-app' };
export type OrderAttribution = ReturnType<typeof normalizeOrderAttribution>;

/** Felaktig analysdata kastas bort utan att hindra en beställning. */
export function normalizeOrderAttribution(raw: unknown, channel: OrderChannel, now = Date.now()) {
  const claimedSurface = (raw && typeof raw === 'object') ? (raw as { surface?: unknown }).surface : null;
  const surface = channel === ORDER_CHANNELS.partnerEmbed ? 'PARTNER_EMBED'
    : channel === ORDER_CHANNELS.app ? 'VIAEATS_APP'
    : claimedSurface === 'VIAEATS_EMBED' ? 'VIAEATS_EMBED' : 'VIAEATS_WEB';
  const parsed = schema.safeParse(raw);
  const valid = parsed.success && [parsed.data.first, parsed.data.last, ...(parsed.data.current ? [parsed.data.current] : [])].every(t => t.at <= now + 60_000 && t.at >= now - 30 * 86400_000);
  return { version: 1, surface, surfaceEvidence: surface === 'VIAEATS_EMBED' ? 'client_context' : 'server_channel',
    capturedAt: new Date(now).toISOString(), marketing: valid && parsed.success ? parsed.data : null };
}
export function readOrderAttribution(changes?: string | null): OrderAttribution | null {
  try { const data = JSON.parse(changes || '{}'); return data.attribution?.version === 1 ? data.attribution : null; } catch { return null; }
}
/** Endast interna etiketter; klick-id och andra matchningsvärden lämnas aldrig ut. */
export function orderAttributionSummary(changes?: string | null) {
  const data = readOrderAttribution(changes);
  if (!data) return null;
  const last = data.marketing?.current || data.marketing?.last;
  return { surface: data.surface, surfaceLabel: SURFACE_LABELS[data.surface] || data.surface,
    source: last?.source || 'unknown', sourceLabel: last ? SOURCE_LABELS[last.source] : 'Okänd källa / inget samtycke',
    sourceName: last?.sourceName || null, referrer: last?.referrer || null, medium: last?.medium || null,
    marketingSource: data.marketing?.last.source || null, marketingCampaign: data.marketing?.last.campaign || null,
    campaign: last?.campaign || null, content: last?.content || null, adId: last?.adId || null,
    firstSource: data.marketing?.first.source || null, evidence: last?.evidence || null,
    capturedAt: data.capturedAt };
}
