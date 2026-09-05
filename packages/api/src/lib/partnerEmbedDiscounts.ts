import prisma from './prisma';

export type PartnerEmbedDiscountKind = 'deal' | 'discount-code';

export const partnerEmbedDiscountSettingKey = (kind: PartnerEmbedDiscountKind, id: string) =>
  `partner_embed_discount:${kind}:${id}`;

export function partnerEmbedEnabledIdsFromRows(
  kind: PartnerEmbedDiscountKind,
  rows: Array<{ key?: unknown }>,
): Set<string> {
  const prefix = `partner_embed_discount:${kind}:`;
  return new Set(
    rows
      .map((row) => String(row.key || ''))
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length)),
  );
}

/**
 * Privat embed är fullpris som standard. Bara poster som en admin uttryckligen
 * slagit på får lämna rabattmotorn. EngineSetting finns redan i produktion, så
 * kanalregeln kräver ingen riskabel databasmigrering inför lansering.
 */
export async function partnerEmbedEnabledIds(
  kind: PartnerEmbedDiscountKind,
  ids: string[],
): Promise<Set<string>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return new Set();

  try {
    const rows = await (prisma as any).engineSetting.findMany({
      where: {
        key: { in: uniqueIds.map((id) => partnerEmbedDiscountSettingKey(kind, id)) },
        enabled: true,
      },
      select: { key: true },
    });
    return partnerEmbedEnabledIdsFromRows(kind, rows);
  } catch (error) {
    console.error('[partner-embed-discounts] kunde inte läsa kanalregler:', error);
    return new Set();
  }
}

export async function isPartnerEmbedDiscountEnabled(
  kind: PartnerEmbedDiscountKind,
  id: string,
): Promise<boolean> {
  return (await partnerEmbedEnabledIds(kind, [id])).has(id);
}

export async function setPartnerEmbedDiscountEnabled(
  kind: PartnerEmbedDiscountKind,
  id: string,
  enabled: boolean,
): Promise<void> {
  await (prisma as any).engineSetting.upsert({
    where: { key: partnerEmbedDiscountSettingKey(kind, id) },
    create: { key: partnerEmbedDiscountSettingKey(kind, id), enabled: Boolean(enabled), params: {} },
    update: { enabled: Boolean(enabled) },
  });
}

export async function removePartnerEmbedDiscountSetting(
  kind: PartnerEmbedDiscountKind,
  id: string,
): Promise<void> {
  await (prisma as any).engineSetting.deleteMany({
    where: { key: partnerEmbedDiscountSettingKey(kind, id) },
  });
}
