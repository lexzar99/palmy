type ScreenCacheEntry<T> = {
  key: string;
  data: T;
};

const screenCache = new Map<string, ScreenCacheEntry<unknown>>();

export function getScreenCache<T>(name: string, key: string): T | null {
  const entry = screenCache.get(name);
  if (!entry || entry.key !== key) return null;
  return entry.data as T;
}

export function setScreenCache<T>(name: string, key: string, data: T) {
  screenCache.set(name, { key, data });
}

export function clearScreenCache(name?: string) {
  if (name) {
    screenCache.delete(name);
    return;
  }
  screenCache.clear();
}
