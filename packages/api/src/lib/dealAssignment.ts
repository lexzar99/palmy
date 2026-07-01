import prisma from './prisma';
import { resolveSegmentUserIds } from './segments';

// DealCampaign-motorn: mall + variant. En kampanj delar ut EN deal per kund
// genom att deterministiskt slumpa en variant ur poolen och snapshota mallens
// värden till en per-kund UserDeal (type=CAMPAIGN). Ser slumpat ut för kunden
// men är stabilt (samma kund -> samma variant), cappat och spårbart.

const DAY_MS = 24 * 60 * 60 * 1000;
const oreToKr = (value: unknown) => Math.round(Number(value || 0)) / 100;

export interface DealVariant {
  dealTemplateId: string;
  weight: number;
}

// Stabil hash (FNV-1a). Ingen Math.random -> reproducerbart och A/B-mätbart.
function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Väljer en variant deterministiskt utifrån seed och vikter. */
export function weightedPick<T extends { weight: number }>(variants: T[], seed: string): T | null {
  const pool = variants.filter((v) => Number(v.weight) > 0);
  if (pool.length === 0) return null;
  const total = pool.reduce((sum, v) => sum + Number(v.weight), 0);
  let point = hashSeed(seed) % total;
  for (const v of pool) {
    point -= Number(v.weight);
    if (point < 0) return v;
  }
  return pool[pool.length - 1];
}

function parseVariants(raw: unknown): DealVariant[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((v: any) => ({
      dealTemplateId: String(v?.dealTemplateId || ''),
      weight: Math.max(0, Math.round(Number(v?.weight || 0))),
    }))
    .filter((v) => v.dealTemplateId && v.weight > 0);
}

interface RunResult {
  assigned: number;
  skipped: number;
  reason?: string;
}

/**
 * Kör EN kampanj: löser segment, dedupar mot redan tilldelade, väljer variant
 * per kund och skapar UserDeal-rader. Idempotent via metadata.campaignId +
 * capPerCustomer, så återkörning bara fångar nya kunder som gått in i segmentet.
 */
export async function runDealCampaign(campaign: any): Promise<RunResult> {
  const variants = parseVariants(campaign.variants);
  if (variants.length === 0) return { assigned: 0, skipped: 0, reason: 'no_variants' };

  // Ladda mall-dealsen en gång.
  const templateIds = Array.from(new Set(variants.map((v) => v.dealTemplateId)));
  const templates = await prisma.deal.findMany({ where: { id: { in: templateIds } } });
  const templateById = new Map(templates.map((t) => [t.id, t]));
  const validVariants = variants.filter((v) => {
    const t = templateById.get(v.dealTemplateId);
    return t && t.isActive !== false;
  });
  if (validVariants.length === 0) return { assigned: 0, skipped: 0, reason: 'no_valid_templates' };

  const userIds = await resolveSegmentUserIds(campaign.segment);
  if (userIds.length === 0) {
    await prisma.dealCampaign.update({ where: { id: campaign.id }, data: { lastRunAt: new Date() } }).catch(() => null);
    return { assigned: 0, skipped: 0, reason: 'empty_segment' };
  }

  // Redan tilldelade i denna kampanj (för dedupe/cap).
  const existing = await prisma.userDeal.findMany({
    where: {
      type: 'CAMPAIGN',
      status: { in: ['ACTIVE', 'RESERVED', 'USED'] },
      metadata: { path: ['campaignId'], equals: campaign.id },
    },
    select: { userId: true },
  });
  const countByUser = new Map<string, number>();
  for (const row of existing) countByUser.set(row.userId, (countByUser.get(row.userId) || 0) + 1);

  const cap = Math.max(1, Math.round(Number(campaign.capPerCustomer || 1)));
  const validDays = Math.max(1, Math.round(Number(campaign.validDays || 7)));
  const expiresAt = new Date(Date.now() + validDays * DAY_MS);

  const rows: any[] = [];
  let skipped = 0;
  for (const userId of userIds) {
    const had = countByUser.get(userId) || 0;
    if (had >= cap) {
      skipped++;
      continue;
    }
    const variant = weightedPick(validVariants, `${userId}:${campaign.id}:${had}`);
    const template = variant && templateById.get(variant.dealTemplateId);
    if (!template) {
      skipped++;
      continue;
    }
    const mission = false; // motor-deals är alltid checkout-rabatter, inte missions
    rows.push({
      userId,
      dealId: template.id,
      type: 'CAMPAIGN',
      status: 'ACTIVE',
      amountKr: template.discountType === 'FIXED' ? Math.round(oreToKr(template.discountValue)) : null,
      discountPercent: template.discountType === 'PERCENTAGE' ? template.discountValue : null,
      discountType: template.discountType,
      freeDelivery: !!template.freeDelivery,
      expiresAt,
      metadata: {
        source: 'campaign',
        campaignId: campaign.id,
        campaignTitle: campaign.title,
        segment: campaign.segment,
        variantTemplateId: template.id,
        restaurantId: campaign.restaurantId || template.restaurantId || null,
        title: template.title,
        minOrderKr: oreToKr(template.minOrder),
        appDpointsBonus: mission ? 0 : template.appDpointsBonus || 0,
        appTemplate: template.appTemplate || null,
        appTheme: template.appTheme || null,
      },
    });
  }

  if (rows.length > 0) {
    await prisma.userDeal.createMany({ data: rows });
  }
  await prisma.dealCampaign.update({ where: { id: campaign.id }, data: { lastRunAt: new Date() } }).catch(() => null);

  return { assigned: rows.length, skipped };
}

/**
 * Schemaläggnings-entrypoint (körs från index.ts-slotten). Aktiverar
 * schemalagda kampanjer som blivit due och kör alla ACTIVE. Ett fel på en
 * kampanj stoppar aldrig de andra.
 */
export async function runDueDealCampaigns(): Promise<void> {
  const now = new Date();
  try {
    // Flippa schemalagda som passerat sin tid till ACTIVE.
    await prisma.dealCampaign.updateMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
      data: { status: 'ACTIVE' },
    });
  } catch (err) {
    console.error('[DealCampaign] schedule flip error:', err);
  }

  let campaigns: any[] = [];
  try {
    campaigns = await prisma.dealCampaign.findMany({ where: { status: 'ACTIVE' } });
  } catch (err) {
    console.error('[DealCampaign] load error:', err);
    return;
  }

  for (const campaign of campaigns) {
    try {
      const result = await runDealCampaign(campaign);
      if (result.assigned > 0) {
        console.log(`[DealCampaign] "${campaign.title}" tilldelade ${result.assigned} kunder (hoppade ${result.skipped}).`);
      }
    } catch (err) {
      console.error(`[DealCampaign] run error for ${campaign.id}:`, err);
    }
  }
}
