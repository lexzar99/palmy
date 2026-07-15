export type RestaurantOrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'DELIVERING'
  | 'DELIVERED'
  | 'DELIVERY_FAILED'
  | 'REJECTED'
  | 'CANCELLED';

export type RestaurantOrderType = 'PICKUP' | 'DELIVERY';

const TERMINAL_STATUSES = new Set<RestaurantOrderStatus>([
  'DELIVERED',
  'DELIVERY_FAILED',
  'REJECTED',
  'CANCELLED',
]);

/**
 * Transitions the restaurant terminal is allowed to make.
 *
 * The courier flow owns READY -> DELIVERING -> DELIVERED for platform
 * deliveries. Super-admin recovery tools intentionally bypass this helper;
 * ordinary restaurant accounts never do.
 */
export function isRestaurantOrderTransitionAllowed(input: {
  from: string;
  to: string;
  type: string;
  selfDelivery: boolean;
}): boolean {
  const from = input.from as RestaurantOrderStatus;
  const to = input.to as RestaurantOrderStatus;

  if (from === to) return true;
  if (TERMINAL_STATUSES.has(from)) return false;

  // A restaurant may cancel an active order, while REJECTED is only a valid
  // answer before food preparation has started.
  if (to === 'CANCELLED') return true;
  if (to === 'REJECTED') return from === 'PENDING' || from === 'ACCEPTED';

  if (from === 'PENDING') return to === 'ACCEPTED' || to === 'PREPARING';
  if (from === 'ACCEPTED') return to === 'PREPARING';

  if (input.type === 'PICKUP') {
    if (from === 'PREPARING') return to === 'READY';
    // The terminal can confirm collection. The existing timed fallback is a
    // safety net, not a reason to accept arbitrary status jumps.
    if (from === 'READY') return to === 'DELIVERED';
    return false;
  }

  if (input.selfDelivery) {
    if (from === 'PREPARING') return to === 'READY' || to === 'DELIVERING';
    if (from === 'READY') return to === 'DELIVERING';
    if (from === 'DELIVERING') return to === 'DELIVERED' || to === 'DELIVERY_FAILED';
    return false;
  }

  // Platform delivery: the restaurant hands the order to the courier at
  // READY. Courier endpoints own all subsequent transitions.
  if (from === 'PREPARING') return to === 'READY';
  return false;
}

export function isTerminalOrderStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status as RestaurantOrderStatus);
}
