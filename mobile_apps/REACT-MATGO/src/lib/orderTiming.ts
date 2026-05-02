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

// ⚠️ TEMP TESTING — 30 s window matches the backend's
// computeDeliveryWindowMs() temp value so the in-app banner, the LA, and
// the customer-facing GET all auto-flip from DELIVERING → DELIVERED at the
// same moment. Revert both back to 10–25 min before public release.
export const DELIVERY_AUTO_DISMISS_MS = 30 * 1000;
/** Extra grace window before auto-flipping the order to DELIVERED. */
export const DELIVERY_AUTO_COMPLETE_GRACE_MS = 5 * 1000;
/** Total time from `deliveringAt` until we treat the order as completed
 *  client-side (20 + 2 min). Mirrors the visible timer + a courtesy buffer. */
export const DELIVERY_AUTO_COMPLETE_MS =
  DELIVERY_AUTO_DISMISS_MS + DELIVERY_AUTO_COMPLETE_GRACE_MS;

export type AutoDismissInput = {
  status?: string | null;
  deliveringAt?: string | number | Date | null;
  etaEndsAt?: number | null; // Unix epoch *seconds*
  now?: number;              // override for tests
};

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

  const windowEdge = deliveringTs + DELIVERY_AUTO_DISMISS_MS;
  const timerEdge = typeof input.etaEndsAt === "number" ? input.etaEndsAt * 1000 : windowEdge;
  const dismissAt = Math.max(windowEdge, timerEdge);

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

  const windowEdge = deliveringTs + DELIVERY_AUTO_COMPLETE_MS;
  const timerEdge = typeof input.etaEndsAt === "number"
    ? input.etaEndsAt * 1000 + DELIVERY_AUTO_COMPLETE_GRACE_MS
    : windowEdge;
  const completeAt = Math.max(windowEdge, timerEdge);

  const ms = completeAt - now;
  if (ms <= 0) return { ready: true };
  return { ready: false, msUntilReady: ms };
}
