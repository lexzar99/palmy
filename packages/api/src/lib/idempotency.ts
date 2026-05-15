import { Request } from 'express';

/**
 * In-memory idempotency cache for client-supplied `Idempotency-Key` headers.
 * Lost on server restart — clients can safely retry with the same key.
 *
 * Used additively: routes that opt in only act on the cache when a key is
 * present. Requests without the header behave exactly as before.
 */

type CachedResponse = { status: number; body: unknown; expiresAt: number };

const TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES = 10_000;

const cache = new Map<string, CachedResponse>();

export function getIdempotencyKey(req: Request): string | null {
  const raw = req.headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 255) return null;
  return trimmed;
}

/**
 * scope = userId (för authed requests) eller IP (för gäster). Säkrar att
 * key:n inte är delad mellan användare — annars kunde User B med samma
 * idempotency-key återanvända User A:s cachade respons (t.ex. clientSecret
 * från Stripe).
 */
function buildKey(scope: string, key: string): string {
  return `${scope}:${key}`;
}

export function getCachedResponse(scope: string, key: string): CachedResponse | null {
  const fullKey = buildKey(scope, key);
  const entry = cache.get(fullKey);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(fullKey);
    return null;
  }
  return entry;
}

export function cacheResponse(scope: string, key: string, status: number, body: unknown): void {
  if (cache.size >= MAX_ENTRIES) {
    const toEvict = Math.floor(MAX_ENTRIES / 10);
    let i = 0;
    for (const k of cache.keys()) {
      if (i++ >= toEvict) break;
      cache.delete(k);
    }
  }
  cache.set(buildKey(scope, key), { status, body, expiresAt: Date.now() + TTL_MS });
}
