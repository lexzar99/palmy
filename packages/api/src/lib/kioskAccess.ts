import { createHmac, timingSafeEqual } from 'node:crypto';

export const KIOSK_ACCESS_HEADER = 'x-viaeats-kiosk-access';

function secretFrom(env: NodeJS.ProcessEnv): string {
  return String(env.LAUNCH_ACCESS_COOKIE_SECRET || '').trim();
}

export function createKioskAccessProof(
  restaurantSlug: string,
  ttlSeconds = 24 * 60 * 60,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const slug = restaurantSlug.trim();
  const secret = secretFrom(env);
  if (!slug || !secret) return null;
  const expiresAt = Math.floor(Date.now() / 1000) + Math.max(60, ttlSeconds);
  const payload = `${slug}:${expiresAt}`;
  const signature = createHmac('sha256', secret).update(`kiosk:${payload}`).digest('hex');
  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}

/** Returns the restaurant slug bound into the proof, or null when invalid. */
export function validKioskAccessProof(
  candidate: unknown,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (typeof candidate !== 'string' || candidate.length > 512) return null;
  const [encodedPayload, signature] = candidate.split('.');
  if (!encodedPayload || !signature || !/^[a-f0-9]{64}$/.test(signature)) return null;

  let payload = '';
  try {
    payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const separator = payload.lastIndexOf(':');
  if (separator <= 0) return null;
  const slug = payload.slice(0, separator).trim();
  const expiresAt = Number(payload.slice(separator + 1));
  if (!slug || !Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null;

  const secret = secretFrom(env);
  if (!secret) return null;
  const expected = createHmac('sha256', secret).update(`kiosk:${payload}`).digest('hex');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  return slug;
}
