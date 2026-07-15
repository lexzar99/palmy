import { ownsOrderWithActiveRawSecret } from './orderAccess';

export const CUSTOMER_NOTIFICATION_PROOF_MAX_AGE_MS = 30 * 60_000;

export type CustomerNotificationOrder = {
  userId: string | null;
  accessToken: string | null;
  createdAt: Date;
};

type ResolveCustomerNotificationTargetInput = {
  authenticatedUserId?: string | null;
  /** undefined means that no order proof was requested; null means not found. */
  order?: CustomerNotificationOrder | null;
  accessToken?: unknown;
  nowMs?: number;
};

export type CustomerNotificationTarget =
  | { scope: 'account'; userId: string }
  | { scope: 'order'; userId: string | null };

/**
 * Resolve exactly which notification scope a registration may receive.
 *
 * - Account JWT without order proof grants account-wide registration.
 * - Matching account ownership grants that account plus the requested order.
 * - A fresh raw order secret grants ONLY that order. Without a JWT it returns
 *   userId=null, even when the order belongs to an account. If the caller also
 *   has a valid account JWT, that independent account scope is preserved.
 */
export function resolveCustomerNotificationTarget({
  authenticatedUserId,
  order,
  accessToken,
  nowMs = Date.now(),
}: ResolveCustomerNotificationTargetInput): CustomerNotificationTarget | null {
  if (order === undefined) {
    return authenticatedUserId ? { scope: 'account', userId: authenticatedUserId } : null;
  }
  if (!order) return null;
  if (authenticatedUserId && authenticatedUserId === order.userId) {
    return { scope: 'order', userId: authenticatedUserId };
  }

  return ownsOrderWithActiveRawSecret(
    order,
    accessToken,
    new Date(nowMs),
    CUSTOMER_NOTIFICATION_PROOF_MAX_AGE_MS,
  )
    ? { scope: 'order', userId: authenticatedUserId || null }
    : null;
}
