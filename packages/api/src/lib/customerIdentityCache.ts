// Short-lived cache for the local identity resolved from a customer bearer
// token. Kept outside the auth router so account-deletion routes can revoke
// every cached token for a user immediately after committing the tombstone.

type CachedCustomerIdentity = {
  id?: string;
  [key: string]: unknown;
};

const CACHE_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 5_000;
const TRIMMED_CACHE_ENTRIES = 4_000;

const identityCache = new Map<
  string,
  { value: CachedCustomerIdentity; expiresAt: number }
>();

export function getCachedCustomerIdentity(token: string): CachedCustomerIdentity | null {
  const entry = identityCache.get(token);
  if (entry && entry.expiresAt > Date.now()) return entry.value;
  if (entry) identityCache.delete(token);
  return null;
}

export function setCachedCustomerIdentity(
  token: string,
  value: CachedCustomerIdentity,
): void {
  identityCache.set(token, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  if (identityCache.size <= MAX_CACHE_ENTRIES) return;

  for (const key of identityCache.keys()) {
    identityCache.delete(key);
    if (identityCache.size <= TRIMMED_CACHE_ENTRIES) break;
  }
}

export function invalidateCachedCustomerIdentity(userId: string): void {
  if (!userId) return;
  for (const [token, entry] of identityCache.entries()) {
    if (entry.value.id === userId) identityCache.delete(token);
  }
}

// Contract-test helper; intentionally not used by production request paths.
export function clearCustomerIdentityCacheForTests(): void {
  identityCache.clear();
}
