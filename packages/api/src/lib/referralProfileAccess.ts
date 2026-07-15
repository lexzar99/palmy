import crypto from 'crypto';
import { isReferralRewardCompletion } from './referralRules';

const MIN_ACCESS_TOKEN_LENGTH = 20;
const MAX_ACCESS_TOKEN_LENGTH = 512;
const MAX_ORDER_ID_LENGTH = 64;

export const REFERRAL_PROFILE_DENIED = Object.freeze({
  error: 'Referralprofilen kunde inte hittas',
});

export type GuestReferralProfileProof = {
  orderId: string;
  accessToken: string;
};

export type GuestReferralProfileOrder = {
  id: string;
  userId: string | null;
  accessToken: string | null;
  paymentStatus: unknown;
  status: unknown;
  type?: unknown;
};

export function parseGuestReferralProfileProof(
  value: unknown,
): GuestReferralProfileProof | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
  const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
  if (!orderId || orderId.length > MAX_ORDER_ID_LENGTH) return null;
  if (
    accessToken.length < MIN_ACCESS_TOKEN_LENGTH ||
    accessToken.length > MAX_ACCESS_TOKEN_LENGTH
  ) {
    return null;
  }
  return { orderId, accessToken };
}

function sameOpaqueSecret(candidate: string, expected: string | null): boolean {
  if (!expected) return false;
  const candidateDigest = crypto.createHash('sha256').update(candidate, 'utf8').digest();
  const expectedDigest = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(candidateDigest, expectedDigest);
}

/**
 * Resolve a guest capability to its referral owner. A phone number is never
 * accepted or consulted: possession of the completed order's opaque token is
 * the only public authorization path.
 */
export function guestReferralProfileUserId(
  proofValue: unknown,
  order: GuestReferralProfileOrder | null,
): string | null {
  const proof = parseGuestReferralProfileProof(proofValue);
  if (!proof || !order || order.id !== proof.orderId) return null;
  if (!sameOpaqueSecret(proof.accessToken, order.accessToken)) return null;
  if (!isReferralRewardCompletion(order)) return null;
  return typeof order.userId === 'string' && order.userId ? order.userId : null;
}
