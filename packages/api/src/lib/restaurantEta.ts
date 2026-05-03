import prisma from './prisma';

// Dynamisk ETA per restaurang.
// Vi mäter tiden från Order.createdAt till Order.deliveringAt — d.v.s. från
// det att kunden lade ordern till att restaurangen markerade den "på väg".
// Snittet av de senaste N ordrarna ger en realistisk ETA som speglar varje
// restaurangs tempo och belastning. Vi clampar till [25, 55] min så att en
// outlier-leverans (kurir gick på lunch, glömt bord, etc) inte snedvrider
// kundens förväntan i någon riktning.

export const ETA_DEFAULT_MINUTES = 40;
export const ETA_MIN_MINUTES = 25;
export const ETA_MAX_MINUTES = 55;
export const ETA_SAMPLE_SIZE = 20;
export const ETA_MIN_SAMPLES = 5; // Under detta = för få datapunkter, behåll default

const clampEta = (n: number) => Math.max(ETA_MIN_MINUTES, Math.min(ETA_MAX_MINUTES, Math.round(n)));

/**
 * Effektiv ETA för en restaurang.
 *  - etaOverrideMinutes (admin manuell) vinner alltid om satt
 *  - annars etaCalculatedMinutes (auto från historik)
 *  - annars etaMinutes (legacy "base" som kan ha satts manuellt tidigare)
 *  - annars ETA_DEFAULT_MINUTES (40)
 *
 * Resultat alltid clampat till [25, 55].
 */
export function getEffectiveEtaMinutes(restaurant: {
  etaOverrideMinutes?: number | null;
  etaCalculatedMinutes?: number | null;
  etaMinutes?: number | null;
}): number {
  const candidate =
    restaurant.etaOverrideMinutes ??
    restaurant.etaCalculatedMinutes ??
    restaurant.etaMinutes ??
    ETA_DEFAULT_MINUTES;
  return clampEta(candidate);
}

/**
 * Beräknar och uppdaterar etaCalculatedMinutes för en restaurang.
 * Tittar på de senaste ETA_SAMPLE_SIZE ordrarna som hunnit till
 * deliveringAt och tar snittet av (deliveringAt - createdAt) i minuter.
 *
 * Anropas fire-and-forget från admin.ts varje gång en order går till
 * DELIVERING. Behöver inte vara perfekt synk eller transaktionssäker —
 * nästa DELIVERING-event räknar om värdet ändå.
 */
export async function recalculateRestaurantEta(restaurantId: string): Promise<number | null> {
  try {
    const samples = await prisma.order.findMany({
      where: {
        restaurantId,
        deliveringAt: { not: null },
        type: 'DELIVERY',
      },
      orderBy: { deliveringAt: 'desc' },
      take: ETA_SAMPLE_SIZE,
      select: { createdAt: true, deliveringAt: true },
    });

    if (samples.length < ETA_MIN_SAMPLES) {
      // För få datapunkter — låt etaCalculatedMinutes vara null så
      // getEffectiveEtaMinutes faller tillbaka till etaMinutes/default 40.
      return null;
    }

    const durationsMin: number[] = [];
    for (const s of samples) {
      if (!s.deliveringAt) continue;
      const ms = s.deliveringAt.getTime() - s.createdAt.getTime();
      const minutes = ms / 60_000;
      // Sanity check: mer än 4 h eller negativt = trasig data, hoppa över.
      if (minutes > 0 && minutes < 240) {
        durationsMin.push(minutes);
      }
    }

    if (durationsMin.length < ETA_MIN_SAMPLES) {
      return null;
    }

    const avg = durationsMin.reduce((a, b) => a + b, 0) / durationsMin.length;
    const next = clampEta(avg);

    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { etaCalculatedMinutes: next },
    });

    return next;
  } catch (error) {
    // Aldrig låt en ETA-räkning fälla något viktigt anrop. Det här
    // körs alltid fire-and-forget från status-uppdateringen.
    console.warn(`[restaurantEta] recalc failed for ${restaurantId}:`, (error as Error).message);
    return null;
  }
}
