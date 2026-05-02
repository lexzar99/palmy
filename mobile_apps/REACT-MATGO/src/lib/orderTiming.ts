/**
 * Shared timing constants for the post-order experience.
 *
 * These drive when the in-app banner and the iOS Live Activity automatically
 * dismiss themselves once the rider is on the way. Both LiveOrderBanner.tsx
 * and useOrderActivitySync.ts read from this module so the rules stay in sync.
 *
 * Auto-dismiss happens when the order has been DELIVERING long enough AND the
 * customer-facing countdown has expired — whichever takes longer wins. If the
 * server hasn't supplied an etaEndsAt we fall back to the time-window alone.
 */

// Conservative client-side fallback: 25 min matches the backend rush-hour
// upper bound. The backend returns `etaEndsAt` per order (computed via
// computeDeliveryWindowMs which randomises 10–20 min off-peak / 25 min
// 17:00–19:59 Europe/Stockholm) — the helpers below prefer etaEndsAt when
// present, so this constant only applies when the server didn't supply one.
export const DELIVERY_AUTO_DISMISS_MS = 25 * 60 * 1000;
/** Extra grace window before auto-flipping the order to DELIVERED. */
export const DELIVERY_AUTO_COMPLETE_GRACE_MS = 2 * 60 * 1000;
/** Total time from `deliveringAt` until we treat the order as completed
 *  client-side (20 + 2 min). Mirrors the visible timer + a courtesy buffer. */
export const DELIVERY_AUTO_COMPLETE_MS =
  DELIVERY_AUTO_DISMISS_MS + DELIVERY_AUTO_COMPLETE_GRACE_MS;

export type AutoDismissInput = {
  status?: string | null;
  deliveringAt?: string | number | Date | null;
  // Accepts both Unix epoch *seconds* (number) and ISO 8601 string.
  // Backend's GET /api/orders/:id returns ISO string today; some local
  // call-sites compute it as seconds. Both work.
  etaEndsAt?: number | string | null;
  now?: number;              // override for tests
};

// Returns the etaEndsAt in milliseconds, or NaN if missing/invalid.
function etaEndsAtMs(value: AutoDismissInput["etaEndsAt"]): number {
  if (typeof value === "number") return value * 1000;
  if (typeof value === "string") return new Date(value).getTime();
  return NaN;
}

export type AutoDismissResult =
  | { ready: true }
  | { ready: false; msUntilReady: number | null };

/**
 * Decide whether the on-the-way banner / Live Activity should be dismissed
 * right now. Returns either `{ ready: true }` or how many ms until it will be
 * (so callers can schedule a single setTimeout on the longest-remaining edge).
 *
 * Returns `{ ready: false, msUntilReady: null }` for orders that aren't on
 * the way (no countdown to schedule).
 */
export function evaluateOnTheWayDismiss(input: AutoDismissInput): AutoDismissResult {
  const status = input.status ?? null;
  if (status !== "DELIVERING" && status !== "OUT_FOR_DELIVERY") {
    return { ready: false, msUntilReady: null };
  }

  const now = input.now ?? Date.now();
  const deliveringTs = input.deliveringAt ? new Date(input.deliveringAt).getTime() : NaN;

  if (!Number.isFinite(deliveringTs)) {
    return { ready: false, msUntilReady: null };
  }

  // etaEndsAt (server-side per-order window from computeDeliveryWindowMs) is
  // authoritative when present. The local DELIVERY_AUTO_DISMISS_MS constant
  // is only the fallback when the server didn't supply one.
  const etaMs = etaEndsAtMs(input.etaEndsAt);
  const dismissAt = Number.isFinite(etaMs)
    ? etaMs
    : deliveringTs + DELIVERY_AUTO_DISMISS_MS;

  const ms = dismissAt - now;
  if (ms <= 0) return { ready: true };
  return { ready: false, msUntilReady: ms };
}

/**
 * Same logic as the dismiss evaluator but with a 2-minute grace window on
 * top — used to decide when we should *also* flip the order to DELIVERED
 * client-side and fire the "thanks for ordering" review notification.
 */
export function evaluateOnTheWayComplete(input: AutoDismissInput): AutoDismissResult {
  const status = input.status ?? null;
  if (status !== "DELIVERING" && status !== "OUT_FOR_DELIVERY") {
    return { ready: false, msUntilReady: null };
  }

  const now = input.now ?? Date.now();
  const deliveringTs = input.deliveringAt ? new Date(input.deliveringAt).getTime() : NaN;
  if (!Number.isFinite(deliveringTs)) {
    return { ready: false, msUntilReady: null };
  }

  // Same priority rule as the dismiss helper: etaEndsAt wins when present,
  // and we just bolt the grace window on top.
  const etaMs = etaEndsAtMs(input.etaEndsAt);
  const completeAt = Number.isFinite(etaMs)
    ? etaMs + DELIVERY_AUTO_COMPLETE_GRACE_MS
    : deliveringTs + DELIVERY_AUTO_COMPLETE_MS;

  const ms = completeAt - now;
  if (ms <= 0) return { ready: true };
  return { ready: false, msUntilReady: ms };
}
