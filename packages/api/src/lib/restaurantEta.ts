import prisma from './prisma';

// Dynamisk ETA per restaurang.
// Vi mäter tiden från Order.createdAt till Order.deliveringAt — d.v.s. från
// det att kunden lade ordern till att restaurangen markerade den "på väg".
// Snittet av de senaste 20 ordrarnas leverans-tid ger en realistisk ETA som
// speglar varje restaurangs tempo och belastning.
//
// Räkneschema (per restaurang):
//   - 0–4 deliverade ordrar: ingen beräkning, default 40 min visas
//   - 5:e ordern hamnar på DELIVERING: räkna första gången (small batch)
//   - Därefter: räkna om var 20:e ny order (count == 25, 45, 65, ...)
//
// Tillåtna värden: 25, 30, 35, 40, 45, 50, 55. Snittet snappas till
// närmaste värde i listan så kunden ser snygga steg-värden.

export const ETA_DEFAULT_MINUTES = 40;
// Hard tak vid 60 min för längsta zonen — zonmönster, ingen restaurang
// ska lova >60 min ETA till kund (då bör de inte erbjuda leverans dit alls).
// Admin kan sätta vad som helst manuellt, men auto-räkning snappar inom
// detta intervall.
export const ETA_ALLOWED_VALUES = [25, 30, 35, 40, 45, 50, 55, 60] as const;
export const ETA_MIN_MINUTES = ETA_ALLOWED_VALUES[0];
export const ETA_MAX_MINUTES = ETA_ALLOWED_VALUES[ETA_ALLOWED_VALUES.length - 1];
export const ETA_SAMPLE_SIZE = 20;
export const ETA_MIN_SAMPLES = 5;
export const ETA_RECALC_INTERVAL = 20;

// Snap till närmaste tillåtna värde (25, 30, ..., 55). Clampar också så
// outliers utanför ramen tas in i intervallet innan snap.
const snapEta = (n: number): number => {
  const clamped = Math.max(ETA_MIN_MINUTES, Math.min(ETA_MAX_MINUTES, n));
  let best = ETA_ALLOWED_VALUES[0] as number;
  let bestDist = Math.abs(clamped - best);
  for (const value of ETA_ALLOWED_VALUES) {
    const dist = Math.abs(clamped - value);
    if (dist < bestDist) {
      best = value;
      bestDist = dist;
    }
  }
  return best;
};

/**
 * Effektiv ETA för en restaurang.
 *  - etaOverrideMinutes (admin manuell) vinner alltid om satt
 *  - annars etaCalculatedMinutes (auto från historik, null = för få ordrar)
 *  - annars ETA_DEFAULT_MINUTES (40)
 *
 * Vi rör inte det legacy etaMinutes-fältet längre — det fanns bara för att
 * admin tidigare satte det själv. Nu styr override (manuell) och calculated
 * (auto) hela värdet. Resultat alltid clampat till [25, 55].
 */
export function getEffectiveEtaMinutes(restaurant: {
  etaOverrideMinutes?: number | null;
  etaCalculatedMinutes?: number | null;
}): number {
  const candidate =
    restaurant.etaOverrideMinutes ??
    restaurant.etaCalculatedMinutes ??
    ETA_DEFAULT_MINUTES;
  return snapEta(candidate);
}

/**
 * Beräknar och uppdaterar etaCalculatedMinutes för en restaurang —
 * men bara enligt schemat (efter 5:e ordern, sedan var 20:e). Samtliga
 * andra DELIVERING-events skippas så vi inte ramar databasen i onödan.
 *
 * options.force = true räknar om oavsett, för admin-backfill-knappen.
 *
 * Anropas fire-and-forget från admin.ts varje gång en order går till
 * DELIVERING.
 */
export async function recalculateRestaurantEta(
  restaurantId: string,
  options: { force?: boolean } = {},
): Promise<number | null> {
  try {
    // Räkna ALLA delivery-ordrar med deliveringAt — det avgör om vi ska
    // räkna nu eller skippa till nästa milstolpe.
    const totalDelivered = await prisma.order.count({
      where: { restaurantId, deliveringAt: { not: null }, type: 'DELIVERY' },
    });

    if (!options.force) {
      if (totalDelivered < ETA_MIN_SAMPLES) {
        // Ännu inte 5 deliveringar — håll kvar default (null = visa 40 min).
        return null;
      }
      // 5:e ordern: räkna första gången. Därefter var 20:e order
      // (count == 25, 45, 65, ...). Så scheman triggar vid:
      //   count == 5, 25, 45, 65, ...
      const isFirstMilestone = totalDelivered === ETA_MIN_SAMPLES;
      const isPeriodicMilestone =
        totalDelivered > ETA_MIN_SAMPLES &&
        (totalDelivered - ETA_MIN_SAMPLES) % ETA_RECALC_INTERVAL === 0;
      if (!isFirstMilestone && !isPeriodicMilestone) {
        return null;
      }
    }

    // Hämta sample baserat på tillgänglig data:
    //   - Vid 5:e ordern: använd alla 5
    //   - Senare: använd senaste 20
    const sampleSize = totalDelivered < ETA_SAMPLE_SIZE ? Math.max(ETA_MIN_SAMPLES, totalDelivered) : ETA_SAMPLE_SIZE;
    const samples = await prisma.order.findMany({
      where: { restaurantId, deliveringAt: { not: null }, type: 'DELIVERY' },
      orderBy: { deliveringAt: 'desc' },
      take: sampleSize,
      select: { createdAt: true, deliveringAt: true },
    });

    if (samples.length < ETA_MIN_SAMPLES && !options.force) {
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

    if (durationsMin.length === 0) {
      return null;
    }

    const avg = durationsMin.reduce((a, b) => a + b, 0) / durationsMin.length;
    const next = snapEta(avg);

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
