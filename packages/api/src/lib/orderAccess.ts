import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from './prisma';
import supabaseAdmin from './supabase';
import { JWT_SECRET } from './config';
import {
  customerAuthMethod,
  localCustomerAuthMethod,
  type CustomerAuthMethod,
} from './customerAuthPolicy';

const ORDER_ACCESS_AUDIENCE = 'viaeats-order-events';
const ORDER_ACCESS_ISSUER = 'viaeats-api';
const ORDER_ACCESS_SCOPE = 'order:events';
const ORDER_ACCESS_PROOF_TTL_SECONDS = 5 * 60;
const ORDER_HTTP_SESSION_AUDIENCE = 'viaeats-order-http';
const ORDER_HTTP_SESSION_SCOPE = 'order:http';
const ORDER_NATIVE_SESSION_AUDIENCE = 'viaeats-order-native-http';
const ORDER_NATIVE_SESSION_SCOPE = 'order:native-http';
const ORDER_PAYMENT_RESUME_AUDIENCE = 'viaeats-order-payment-resume';
const ORDER_PAYMENT_RESUME_SCOPE = 'order:payment-resume';
const ORDER_PAYMENT_RESUME_TTL_SECONDS = 15 * 60;

// A raw checkout secret is only an exchange credential. It remains available
// briefly for native-client compatibility and hosted-payment recovery, but it
// must never be a permanent password to customer PII.
export const RAW_ORDER_ACCESS_TTL_MS = 48 * 60 * 60 * 1000;
export const ORDER_HTTP_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const ORDER_HTTP_SESSION_HEADER = 'x-viaeats-order-session';
export const ORDER_HTTP_SESSION_ID_HEADER = 'x-viaeats-order-id';
export const ORDER_NATIVE_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const ORDER_NATIVE_SESSION_HEADER = 'x-viaeats-order-native-session';

type OrderAccessProofPayload = jwt.JwtPayload & {
  orderId?: string;
  scope?: string;
  credentialHash?: string;
};

type ResolveOrderAccessInput = {
  orderId: unknown;
  accessToken?: unknown;
  orderSession?: unknown;
  authorization?: unknown;
};

export type ActiveCustomerIdentity = {
  id: string;
  phone: string | null;
  isVerified: boolean;
  authMethod: CustomerAuthMethod;
};

type StoredOrderAccess = {
  userId: string | null;
  accessToken: string | null;
};

type StoredRawOrderAccess = Pick<StoredOrderAccess, 'accessToken'> & {
  createdAt: Date | string;
};

export function validOrderId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64;
}

/**
 * Compare a customer-facing order secret without an early-exit string compare.
 * Order access tokens are bearer credentials and must be treated like passwords,
 * never like ordinary query parameters or phone numbers.
 */
export function sameOrderSecret(
  candidate: unknown,
  expected: string | null | undefined,
): boolean {
  if (typeof candidate !== 'string' || !candidate || !expected) return false;
  const candidateDigest = crypto.createHash('sha256').update(candidate, 'utf8').digest();
  const expectedDigest = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(candidateDigest, expectedDigest);
}

export function ownsOrder(
  order: StoredOrderAccess,
  customerId: string | null,
  accessToken: unknown,
): boolean {
  if (customerId && order.userId && customerId === order.userId) return true;
  return sameOrderSecret(accessToken, order.accessToken);
}

/**
 * Raw guest credentials have a strict exchange window. Account ownership and
 * the signed browser session below are intentionally not tied to this window.
 */
export function ownsOrderWithActiveRawSecret(
  order: StoredRawOrderAccess,
  accessToken: unknown,
  now = new Date(),
  maxAgeMs = RAW_ORDER_ACCESS_TTL_MS,
): boolean {
  if (!sameOrderSecret(accessToken, order.accessToken)) return false;
  const createdAtMs = new Date(order.createdAt).getTime();
  const ageMs = now.getTime() - createdAtMs;
  // Callers may choose a shorter exchange window, but no feature is allowed
  // to silently turn the raw checkout secret into a credential lasting longer
  // than the platform-wide 48-hour ceiling.
  const boundedMaxAgeMs = Math.min(
    RAW_ORDER_ACCESS_TTL_MS,
    Math.max(0, Number.isFinite(maxAgeMs) ? maxAgeMs : 0),
  );
  return Number.isFinite(createdAtMs) && ageMs >= 0 && ageMs <= boundedMaxAgeMs;
}

/**
 * Mint a short-lived capability after the HTTP layer has checked ownership.
 * The audience + scope prevent an ordinary account JWT signed with the same
 * application secret from being reused as an order-room credential.
 */
export function issueOrderAccessProof(
  orderId: string,
  secret = JWT_SECRET,
  expiresInSeconds = ORDER_ACCESS_PROOF_TTL_SECONDS,
): string {
  if (!validOrderId(orderId)) throw new Error('Invalid order id');
  return jwt.sign(
    { orderId, scope: ORDER_ACCESS_SCOPE },
    secret,
    {
      algorithm: 'HS256',
      audience: ORDER_ACCESS_AUDIENCE,
      issuer: ORDER_ACCESS_ISSUER,
      expiresIn: expiresInSeconds,
    },
  );
}

/** Verify that a capability is valid and bound to exactly this order. */
export function verifyOrderAccessProof(
  proof: unknown,
  orderId: unknown,
  secret = JWT_SECRET,
): boolean {
  if (typeof proof !== 'string' || !proof || !validOrderId(orderId)) return false;
  try {
    const payload = jwt.verify(proof, secret, {
      algorithms: ['HS256'],
      audience: ORDER_ACCESS_AUDIENCE,
      issuer: ORDER_ACCESS_ISSUER,
    }) as OrderAccessProofPayload;
    return payload.scope === ORDER_ACCESS_SCOPE && payload.orderId === orderId;
  } catch {
    return false;
  }
}

/**
 * Browser-only order session. It is scoped to one order, stored by Next in a
 * Secure + HttpOnly cookie and never exposed to client JavaScript or URLs.
 */
export function issueOrderHttpSession(
  orderId: string,
  secret = JWT_SECRET,
  expiresInSeconds = ORDER_HTTP_SESSION_TTL_SECONDS,
): string {
  if (!validOrderId(orderId)) throw new Error('Invalid order id');
  return jwt.sign(
    { orderId, scope: ORDER_HTTP_SESSION_SCOPE },
    secret,
    {
      algorithm: 'HS256',
      audience: ORDER_HTTP_SESSION_AUDIENCE,
      issuer: ORDER_ACCESS_ISSUER,
      expiresIn: expiresInSeconds,
    },
  );
}

export function verifyOrderHttpSession(
  proof: unknown,
  orderId: unknown,
  secret = JWT_SECRET,
): boolean {
  if (typeof proof !== 'string' || !proof || !validOrderId(orderId)) return false;
  try {
    const payload = jwt.verify(proof, secret, {
      algorithms: ['HS256'],
      audience: ORDER_HTTP_SESSION_AUDIENCE,
      issuer: ORDER_ACCESS_ISSUER,
    }) as OrderAccessProofPayload;
    return payload.scope === ORDER_HTTP_SESSION_SCOPE && payload.orderId === orderId;
  } catch {
    return false;
  }
}

/**
 * Native HTTP capability. The raw checkout secret is exchanged/returned only
 * over HTTPS, then iOS/Android use this signed, order-bound value in a header.
 * A separate audience prevents browser cookies or realtime proofs from being
 * replayed as native API credentials.
 */
export function issueOrderNativeSession(
  orderId: string,
  secret = JWT_SECRET,
  expiresInSeconds = ORDER_NATIVE_SESSION_TTL_SECONDS,
): string {
  if (!validOrderId(orderId)) throw new Error('Invalid order id');
  return jwt.sign(
    { orderId, scope: ORDER_NATIVE_SESSION_SCOPE },
    secret,
    {
      algorithm: 'HS256',
      audience: ORDER_NATIVE_SESSION_AUDIENCE,
      issuer: ORDER_ACCESS_ISSUER,
      expiresIn: expiresInSeconds,
    },
  );
}

export function verifyOrderNativeSession(
  proof: unknown,
  orderId: unknown,
  secret = JWT_SECRET,
): boolean {
  if (typeof proof !== 'string' || !proof || !validOrderId(orderId)) return false;
  try {
    const payload = jwt.verify(proof, secret, {
      algorithms: ['HS256'],
      audience: ORDER_NATIVE_SESSION_AUDIENCE,
      issuer: ORDER_ACCESS_ISSUER,
    }) as OrderAccessProofPayload;
    return payload.scope === ORDER_NATIVE_SESSION_SCOPE && payload.orderId === orderId;
  } catch {
    return false;
  }
}

/**
 * Short-lived return capability for Swish app/browser hand-offs. The raw
 * checkout secret never enters a URL: only its SHA-256 digest is embedded in
 * a signed, order-bound JWT. Exchanging the proof clears the underlying raw
 * secret atomically, which makes the return capability one-time.
 */
export function issueOrderPaymentResumeProof(
  orderId: string,
  rawAccessToken: string,
  secret = JWT_SECRET,
  expiresInSeconds = ORDER_PAYMENT_RESUME_TTL_SECONDS,
): string {
  if (!validOrderId(orderId) || typeof rawAccessToken !== 'string' || rawAccessToken.length < 20) {
    throw new Error('Invalid payment resume input');
  }
  return jwt.sign(
    {
      orderId,
      scope: ORDER_PAYMENT_RESUME_SCOPE,
      credentialHash: crypto.createHash('sha256').update(rawAccessToken, 'utf8').digest('base64url'),
    },
    secret,
    {
      algorithm: 'HS256',
      audience: ORDER_PAYMENT_RESUME_AUDIENCE,
      issuer: ORDER_ACCESS_ISSUER,
      expiresIn: expiresInSeconds,
    },
  );
}

function verifiedOrderPaymentResumePayload(
  proof: unknown,
  orderId: unknown,
  secret = JWT_SECRET,
): OrderAccessProofPayload | null {
  if (typeof proof !== 'string' || !proof || !validOrderId(orderId)) return null;
  try {
    const payload = jwt.verify(proof, secret, {
      algorithms: ['HS256'],
      audience: ORDER_PAYMENT_RESUME_AUDIENCE,
      issuer: ORDER_ACCESS_ISSUER,
    }) as OrderAccessProofPayload;
    return payload.scope === ORDER_PAYMENT_RESUME_SCOPE &&
      payload.orderId === orderId &&
      typeof payload.credentialHash === 'string'
      ? payload
      : null;
  } catch {
    return null;
  }
}

export function verifyOrderPaymentResumeProof(
  proof: unknown,
  orderId: unknown,
  rawAccessToken: unknown,
  secret = JWT_SECRET,
): boolean {
  const payload = verifiedOrderPaymentResumePayload(proof, orderId, secret);
  if (!payload || typeof rawAccessToken !== 'string' || !rawAccessToken) return false;
  return sameOrderSecret(
    payload.credentialHash,
    crypto.createHash('sha256').update(rawAccessToken, 'utf8').digest('base64url'),
  );
}

type LocalCustomerRow = {
  id: string;
  phone: string | null;
  email: string | null;
  isVerified: boolean;
  isActive: boolean;
  deletedAt: Date | null;
  oauthProvider: string | null;
};

const localCustomerSelect = {
  id: true,
  phone: true,
  email: true,
  isVerified: true,
  isActive: true,
  deletedAt: true,
  oauthProvider: true,
} as const;

function activeLocalIdentity(
  row: LocalCustomerRow | null | undefined,
  authMethod?: CustomerAuthMethod | null,
): ActiveCustomerIdentity | null {
  if (!row || row.deletedAt || row.isActive === false) return null;
  const method = authMethod || localCustomerAuthMethod(row);
  if (!method) return null;
  return {
    id: row.id,
    phone: row.phone,
    isVerified: row.isVerified,
    authMethod: method,
  };
}

/**
 * Resolve one customer bearer through the phone-OTP policy and the
 * authoritative local tombstone/account state.
 * Every order route uses this helper; no route may trust a JWT subject alone.
 */
export async function resolveActiveCustomerFromAuthorization(
  authorization: unknown,
): Promise<ActiveCustomerIdentity | null> {
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return null;
  const bearer = authorization.slice(7).trim();
  if (!bearer) return null;

  try {
    const payload = jwt.verify(bearer, JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (payload.role === 'USER' && typeof payload.id === 'string' && payload.id) {
      const local = await (prisma as any).user.findUnique({
        where: { id: payload.id },
        select: localCustomerSelect,
      }).catch(() => null) as LocalCustomerRow | null;
      return activeLocalIdentity(local);
    }
    // A token signed by our platform key but carrying another role is never a
    // Supabase fallback candidate (prevents an admin JWT crossing scopes).
    return null;
  } catch {
    // Supabase tokens use a different signing key and are checked below.
  }

  if (supabaseAdmin) {
    try {
      const result = await supabaseAdmin.auth.getUser(bearer);
      const sbUser = result.data.user;
      // getUser validates the bearer before decoded AMR claims are used.
      const decoded = jwt.decode(bearer);
      const authenticationMethods =
        decoded && typeof decoded !== 'string' && Array.isArray(decoded.amr)
          ? decoded.amr
              .map((entry: unknown) =>
                entry && typeof entry === 'object'
                  ? String((entry as { method?: unknown }).method || '').toLowerCase()
                  : '',
              )
              .filter(Boolean)
          : [];
      const method = customerAuthMethod(sbUser, authenticationMethods);
      if (result.error || !sbUser?.id || !method) return null;

      // An id tombstone is authoritative. Never fall back to email/phone and
      // accidentally bind a deleted/blocked Supabase identity to another row.
      const byId = await (prisma as any).user.findUnique({
        where: { id: sbUser.id },
        select: localCustomerSelect,
      }).catch(() => null) as LocalCustomerRow | null;
      if (byId) return activeLocalIdentity(byId, method);

      // Historical accounts can have a cuid local id while Supabase uses a
      // UUID. Link only through provider-attested data, mirroring auth.ts.
      let linked: LocalCustomerRow | null = null;
      if (method === 'phone' && sbUser.phone && sbUser.phone_confirmed_at) {
        linked = await (prisma as any).user.findFirst({
          where: { phone: sbUser.phone, deletedAt: null, isActive: true },
          select: localCustomerSelect,
        }).catch(() => null);
      } else if (sbUser.email && sbUser.email_confirmed_at) {
        linked = await (prisma as any).user.findFirst({
          where: { email: sbUser.email.toLowerCase(), deletedAt: null, isActive: true },
          select: localCustomerSelect,
        }).catch(() => null);
      }
      return activeLocalIdentity(linked, method);
    } catch {
      // Invalid bearer.
    }
  }

  return null;
}

export async function resolveActiveCustomerIdFromAuthorization(
  authorization: unknown,
): Promise<string | null> {
  return (await resolveActiveCustomerFromAuthorization(authorization))?.id || null;
}

/**
 * Resolve ownership without revealing whether the order exists. Callers must
 * map every false result to the same status and response body.
 */
export async function resolveOrderAccess({
  orderId,
  accessToken,
  orderSession,
  authorization,
}: ResolveOrderAccessInput): Promise<boolean> {
  if (!validOrderId(orderId)) return false;

  if (verifyOrderHttpSession(orderSession, orderId)) return true;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { userId: true, accessToken: true, createdAt: true },
  });
  if (!order) return false;

  if (ownsOrderWithActiveRawSecret(order, accessToken)) return true;

  const customerId = await resolveActiveCustomerIdFromAuthorization(authorization);
  return ownsOrder(order, customerId, null);
}

/**
 * Exchange a raw checkout secret exactly once for a browser HttpOnly session.
 * Existing order sessions and active account ownership do not consume a
 * secret. A raw-secret winner clears the DB column atomically; concurrent
 * replays therefore fail even if both read the old row before the update.
 */
export async function exchangeOrderAccessForHttpSession({
  orderId,
  accessToken,
  orderSession,
  authorization,
}: ResolveOrderAccessInput, client: any = prisma): Promise<boolean> {
  if (!validOrderId(orderId)) return false;
  if (verifyOrderHttpSession(orderSession, orderId)) return true;

  const order = await client.order.findUnique({
    where: { id: orderId },
    select: { userId: true, accessToken: true, createdAt: true },
  });
  if (!order) return false;

  const customerId = await resolveActiveCustomerIdFromAuthorization(authorization);
  const ownsByAccount = Boolean(customerId && order.userId === customerId);
  if (!ownsOrderWithActiveRawSecret(order, accessToken)) return ownsByAccount;

  const consumed = await client.order.updateMany({
    where: { id: orderId, accessToken: order.accessToken },
    data: { accessToken: null },
  });
  return consumed.count === 1 || ownsByAccount;
}

/**
 * Consume a Swish return capability and its backing raw checkout secret in
 * one compare-and-swap. A copied callback URL therefore cannot establish a
 * second browser session after the legitimate return has completed.
 */
export async function exchangeOrderPaymentResumeForHttpSession(
  orderId: unknown,
  paymentResumeToken: unknown,
  client: any = prisma,
): Promise<boolean> {
  if (!validOrderId(orderId)) return false;
  const order = await client.order.findUnique({
    where: { id: orderId },
    select: { accessToken: true, createdAt: true },
  });
  if (!order || !ownsOrderWithActiveRawSecret(order, order.accessToken)) return false;
  if (!verifyOrderPaymentResumeProof(paymentResumeToken, orderId, order.accessToken)) return false;

  const consumed = await client.order.updateMany({
    where: { id: orderId, accessToken: order.accessToken },
    data: { accessToken: null },
  });
  return consumed.count === 1;
}

/** Only old local test clients may use a phone-number lookup shortcut. */
export function allowLegacyOrderPhoneProof(nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv !== 'production';
}
