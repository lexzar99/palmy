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

export function getCachedResponse(key: string): CachedResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry;
}

export function cacheResponse(key: string, status: number, body: unknown): void {
  if (cache.size >= MAX_ENTRIES) {
    const toEvict = Math.floor(MAX_ENTRIES / 10);
    let i = 0;
    for (const k of cache.keys()) {
      if (i++ >= toEvict) break;
      cache.delete(k);
    }
  }
  cache.set(key, { status, body, expiresAt: Date.now() + TTL_MS });
}
