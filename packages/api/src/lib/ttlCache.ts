// Single-flight in-process TTL cache for hot, anonymous, read-only endpoints.
//
// Concurrent callers on the same key share ONE in-flight computation, so 1000
// simultaneous identical requests collapse to a single DB query per TTL window
// — the main defense against connection-pool exhaustion under load. Per-instance
// (not shared across Railway replicas); that's fine because each instance
// independently collapses its own herd. Failures are NOT cached (next caller
// retries). Only use for data that is identical for all anonymous callers and
// where a few seconds of staleness is acceptable.

type Entry = { promise: Promise<unknown>; expiresAt: number };
const stores = new Map<string, Map<string, Entry>>();

function getStore(name: string): Map<string, Entry> {
  let s = stores.get(name);
  if (!s) {
    s = new Map();
    stores.set(name, s);
  }
  return s;
}

export async function cached<T>(
  name: string,
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const s = getStore(name);
  const now = Date.now();
  const hit = s.get(key);
  if (hit && hit.expiresAt > now) return hit.promise as Promise<T>;

  // Reserve the slot synchronously (no await before s.set) so concurrent callers
  // on a cold key share this same promise instead of each running fn().
  const entry: Entry = { promise: Promise.resolve(undefined), expiresAt: now + ttlMs };
  entry.promise = fn().catch((err) => {
    // Never cache a failure — drop the slot so the next caller retries.
    if (s.get(key) === entry) s.delete(key);
    throw err;
  });
  s.set(key, entry);

  // Bound memory: if a key explosion occurs (e.g. many distinct coords), drop
  // expired entries first, then oldest, so the map can't grow unbounded.
  if (s.size > 5000) {
    for (const [k, v] of s) {
      if (v.expiresAt <= now) s.delete(k);
    }
    if (s.size > 5000) {
      let drop = s.size - 4000;
      for (const k of s.keys()) {
        if (drop-- <= 0) break;
        s.delete(k);
      }
    }
  }
  return entry.promise as Promise<T>;
}

export function bustCache(name: string, key?: string): void {
  const s = stores.get(name);
  if (!s) return;
  if (key === undefined) s.clear();
  else s.delete(key);
}
