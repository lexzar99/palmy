"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * localStorage-backad favoriter-store (paritet med RN-appens `useFavoritesStore`).
 *
 * Nyckeln `platform_favorites` används som primär (bakåtkompatibel med
 * tidigare inline-state i app/page.tsx). Vi skriver också `matgo_favorites`
 * som alias enligt task-spec, men läser från `platform_favorites` om
 * båda finns.
 *
 * Implementerad via `useSyncExternalStore` — React-rekommenderade mönstret
 * för att synka med externa källor (localStorage + cross-component-events).
 * SSR-safe via `getServerSnapshot` som returnerar en tom mängd, så att alla
 * mounta:r börjar med samma state och hydreras korrekt på klient.
 */

const STORAGE_KEY = "platform_favorites";
const ALIAS_KEY = "matgo_favorites";
const EVENT_NAME = "matgo:favorites-change";

// Stabil tom referens för server-snapshot så React-jämförelser inte triggar re-render
const EMPTY_SET: ReadonlySet<string> = new Set();

// Cache senaste snapshot — useSyncExternalStore kräver att getSnapshot returnerar
// samma referens mellan render-anrop när underliggande data inte ändrats, annars
// loopar React. Vi invaliderar cachen i `notifyChange()`.
let cachedSnapshot: ReadonlySet<string> | null = null;

function readFromStorage(): ReadonlySet<string> {
  if (typeof window === "undefined") return EMPTY_SET;
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(ALIAS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    /* noop */
  }
  return new Set();
}

function writeToStorage(set: ReadonlySet<string>) {
  if (typeof window === "undefined") return;
  try {
    const arr = JSON.stringify([...set]);
    localStorage.setItem(STORAGE_KEY, arr);
    localStorage.setItem(ALIAS_KEY, arr);
  } catch {
    /* noop */
  }
}

function notifyChange() {
  cachedSnapshot = null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENT_NAME));
  }
}

function getSnapshot(): ReadonlySet<string> {
  if (cachedSnapshot === null) {
    cachedSnapshot = readFromStorage();
  }
  return cachedSnapshot;
}

function getServerSnapshot(): ReadonlySet<string> {
  return EMPTY_SET;
}

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onChange = () => {
    cachedSnapshot = null;
    callback();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === ALIAS_KEY) {
      cachedSnapshot = null;
      callback();
    }
  };
  window.addEventListener(EVENT_NAME, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT_NAME, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export interface FavoritesApi {
  favorites: ReadonlySet<string>;
  toggle: (id: string) => void;
  isFavorite: (id: string) => boolean;
  clear: () => void;
}

export function useFavorites(): FavoritesApi {
  const favorites = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback((id: string) => {
    if (typeof window === "undefined" || !id) return;
    const current = readFromStorage();
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    writeToStorage(next);
    notifyChange();
  }, []);

  const isFavorite = useCallback((id: string) => favorites.has(id), [favorites]);

  const clear = useCallback(() => {
    if (typeof window === "undefined") return;
    writeToStorage(new Set());
    notifyChange();
  }, []);

  return { favorites, toggle, isFavorite, clear };
}
