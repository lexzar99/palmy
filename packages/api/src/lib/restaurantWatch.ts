import prisma from './prisma';
import { sendHermesAlert } from './hermesAlerts';
import { isRestaurantOpen, minutesUntilClose } from './openingHours';
import { normalizeAcceptingOrdersMode } from './restaurantAvailability';

// ── Bedrägeri-/drift-bevakning för restauranger ──────────────────────────────
// Skickar Hermes-alerts (→ WhatsApp via /api/hermes/alerts-flödet) när:
//   1. En restaurang skapar en deal (event, admin.ts).
//   2. En restaurang pausar / förlänger pausen (event, restaurants.ts PATCH).
//   3. En restaurang har varit pausad/stängd > 30 min under sina öppettider
//      (periodisk vakt här nedan) — fångar "leker och stänger" + tidig stängning.
//
// Allt går via sendHermesAlert som persist:ar till audit-loggen; pollern hämtar
// dem via API:t, så Hermes kan flyttas till valfri dator utan att detta rör sig.

const TZ = 'Europe/Stockholm';

function swedenTime(date: Date): string {
  return date.toLocaleTimeString('sv-SE', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  });
}

function swedenDateTime(date: Date): string {
  return date.toLocaleString('sv-SE', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('sv-SE', { timeZone: TZ, day: '2-digit', month: '2-digit' });
}

// ── 1. Deal skapad ───────────────────────────────────────────────────────────
export async function alertDealCreated(params: {
  restaurantId: string | null;
  restaurantName: string;
  title: string;
  discountType: string;
  discountValue: number;
  scopeType: string;
  targetCount: number;
  validFrom?: string | null;
  validUntil?: string | null;
}): Promise<void> {
  const { restaurantName, title, discountType, discountValue, scopeType, targetCount } = params;

  const v = Number(discountValue);
  const discount =
    discountType === 'FIXED'
      ? `-${v} kr rabatt`
      : discountType === 'FIXED_PRICE'
        ? `fast pris ${v} kr`
        : `${v}% rabatt`;

  const scope =
    scopeType === 'CATEGORY'
      ? `${targetCount} ${targetCount === 1 ? 'kategori' : 'kategorier'}`
      : scopeType === 'PRODUCT'
        ? `${targetCount} ${targetCount === 1 ? 'produkt' : 'produkter'}`
        : 'hela menyn';

  const from = shortDate(params.validFrom);
  const until = shortDate(params.validUntil);
  const validity =
    from && until ? `${from} - ${until}` : until ? `till ${until}` : from ? `från ${from}` : 'tills vidare';

  const text = [
    `🏷️ ${restaurantName} skapade en ny deal`,
    `"${title}" — ${discount}, ${scope}`,
    `Giltig: ${validity}`,
    `Tid: ${swedenDateTime(new Date())}`,
  ].join('\n');

  await safeSend({
    type: 'restaurant_deal_created',
    severity: 'info',
    text,
    restaurantId: params.restaurantId,
    restaurantName,
    dealTitle: title,
  });
}

// ── 2. Paus / förlängning ────────────────────────────────────────────────────
export async function alertRestaurantPause(params: {
  restaurantId: string;
  restaurantName: string;
  previousPausedUntil: Date | null;
  newPausedUntil: Date;
}): Promise<void> {
  const { restaurantName, previousPausedUntil, newPausedUntil } = params;
  const now = Date.now();
  const minutesLeft = Math.max(1, Math.round((newPausedUntil.getTime() - now) / 60_000));
  const wasPaused = previousPausedUntil != null && previousPausedUntil.getTime() > now;

  const text = wasPaused
    ? `⏸️➕ ${restaurantName} förlängde pausen (pausad till ${swedenTime(newPausedUntil)}, ~${minutesLeft} min kvar).`
    : `⏸️ ${restaurantName} pausade beställningar (~${minutesLeft} min, till ${swedenTime(newPausedUntil)}).`;

  await safeSend({
    type: wasPaused ? 'restaurant_pause_extended' : 'restaurant_paused',
    severity: 'info',
    text,
    restaurantId: params.restaurantId,
    restaurantName,
    pausedUntil: newPausedUntil.toISOString(),
  });
}

// ── 3. Periodisk vakt: stängd/pausad > 30 min under öppettider ────────────────
const CLOSED_ALERT_MIN = 30; // flagga när stängningen passerar 30 min
const EARLY_CLOSE_MIN = 90; // "stängde tidigt" om >= 1,5h kvar till schemalagd stängning
const SCAN_INTERVAL_MS = 5 * 60_000;

// Episod-spårning i minnet: när vi FÖRST såg restaurangen stängd under öppettid,
// och om vi redan larmat för den pågående episoden. Nollställs när den öppnar
// igen. In-memory räcker (en API-instans); en omstart re-armar bara vakten.
const episodeStart = new Map<string, number>();
const alertedEpisode = new Set<string>();

let scanInFlight = false;

export async function scanClosedRestaurants(): Promise<void> {
  if (scanInFlight) return;
  scanInFlight = true;
  try {
    const restaurants = await prisma.restaurant.findMany({
      where: { draft: false, comingSoon: false },
      select: {
        id: true,
        name: true,
        acceptingOrdersMode: true,
        acceptingOrdersOverrideUntil: true,
        pausedUntil: true,
        openingHours: true,
      },
    });

    const nowMs = Date.now();
    for (const r of restaurants) {
      const paused = r.pausedUntil != null && new Date(r.pausedUntil).getTime() > nowMs;
      const configuredMode = normalizeAcceptingOrdersMode(r.acceptingOrdersMode);
      const overrideUntil = r.acceptingOrdersOverrideUntil
        ? new Date(r.acceptingOrdersOverrideUntil).getTime()
        : null;
      const overrideActive = overrideUntil == null || overrideUntil > nowMs;
      const manuallyClosed = configuredMode === 'FORCE_CLOSED' && overrideActive;
      const scheduleOpenNow = isRestaurantOpen(r.openingHours);
      const closedDuringHours = scheduleOpenNow && (paused || manuallyClosed);

      if (!closedDuringHours) {
        episodeStart.delete(r.id);
        alertedEpisode.delete(r.id);
        continue;
      }

      if (!episodeStart.has(r.id)) episodeStart.set(r.id, nowMs);
      const startedMs = episodeStart.get(r.id)!;
      const closedMin = Math.round((nowMs - startedMs) / 60_000);

      if (closedMin > CLOSED_ALERT_MIN && !alertedEpisode.has(r.id)) {
        alertedEpisode.add(r.id);

        const untilClose = minutesUntilClose(r.openingHours);
        const earlyNote =
          untilClose != null && untilClose >= EARLY_CLOSE_MIN
            ? ` Det är ~${Math.round(untilClose / 60 * 10) / 10}h kvar till schemalagd stängning — de stänger tidigt.`
            : '';
        const how = paused ? 'pausad' : 'stängd';

        const text =
          `⚠️ ${r.name} har varit ${how} i över ${CLOSED_ALERT_MIN} min under sina öppettider ` +
          `(nu ~${closedMin} min).${earlyNote}`;

        await safeSend({
          type: 'restaurant_closed_too_long',
          severity: 'warning',
          text,
          restaurantId: r.id,
          restaurantName: r.name,
          closedMinutes: closedMin,
          via: paused ? 'pause' : 'manual',
        });
      }
    }
  } catch (err: any) {
    console.error('[restaurantWatch] scan error:', err?.message ?? err);
  } finally {
    scanInFlight = false;
  }
}

export function startRestaurantFraudWatch(): void {
  // Första körningen efter 90s (låt boot lugna sig), sedan var 5:e minut.
  setTimeout(() => void scanClosedRestaurants(), 90_000);
  setInterval(() => void scanClosedRestaurants(), SCAN_INTERVAL_MS);
  console.log('[restaurantWatch] fraud watch startad (var 5:e min)');
}

// Alla alerts är best-effort — de får aldrig fälla en request.
async function safeSend(alert: Record<string, unknown> & { type: string; text: string }): Promise<void> {
  try {
    await sendHermesAlert(alert as any);
  } catch (err: any) {
    console.warn('[restaurantWatch] alert failed:', err?.message ?? err);
  }
}
