/**
 * Per-order DELIVERING window (in ms).
 *
 * Rules:
 *   - Rush hours 17:00–19:59 (Europe/Stockholm): 25 minutes.
 *   - Other hours: deterministic pseudo-random 10–20 minutes seeded by orderId.
 *
 * Determinism is required because the LA push (in admin.ts) and the
 * finalisation tick (in liveActivityFinalize.ts) both compute the window
 * independently — they must agree on the same number for the same order, even
 * across server restarts. Hashing the orderId gives that property without
 * needing a new DB column.
 */

export function computeDeliveryWindowMs(deliveringAt: Date, orderId: string): number {
  // ⚠️ TEMP TESTING — return 20 s for every order so the auto-DELIVERED + LA
  // dismiss flow can be exercised without waiting 10–25 minutes. Revert this
  // block (restore the rush-hour 25-min / 10–20-min logic below) before any
  // public release.
  return 20 * 1000;

  // eslint-disable-next-line no-unreachable
  const stockholmHour = stockholmHourOf(deliveringAt);
  if (stockholmHour >= 17 && stockholmHour < 20) {
    return 25 * 60 * 1000;
  }
  // 10..20 inclusive (11 values)
  const minutes = 10 + (hashOrderId(orderId) % 11);
  return minutes * 60 * 1000;
}

function stockholmHourOf(date: Date): number {
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Stockholm',
    hour: '2-digit',
    hour12: false,
  }).format(date);
  // Intl with hour12:false in en-US returns "00".."23" but can also yield "24" at midnight on some runtimes.
  const parsed = parseInt(hourStr, 10);
  return Number.isFinite(parsed) ? parsed % 24 : 0;
}

function hashOrderId(orderId: string): number {
  let h = 0;
  for (let i = 0; i < orderId.length; i++) {
    h = (h * 31 + orderId.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
