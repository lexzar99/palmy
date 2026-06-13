"use client";

// Hem-cache: persistar senaste lyckade restaurang-/listdatan i localStorage så
// återbesök (även hård omladdning eller när RSC-seeden saknas) målas direkt
// utan skeleton. En tyst bakgrunds-refetch ersätter sedan med färsk data.
// Skiljt från offline-orders — detta är ren upplevd-snabbhet, inte offline.

const HOME_CACHE_KEY = "home_cache_v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h — äldre än så känns inte "snabbt", ladda om

export interface HomeCachePayload {
  restaurants: any[];
  cities: any[];
  deals: any[];
  sponsors: any[];
  homeCategories: any[];
}

export function writeHomeCache(payload: HomeCachePayload): void {
  try {
    localStorage.setItem(HOME_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), payload }));
  } catch { /* quota/private mode — cachen är best effort */ }
}

export function readHomeCache(): HomeCachePayload | null {
  try {
    const raw = localStorage.getItem(HOME_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt: number; payload: HomeCachePayload };
    if (!parsed?.payload || !Array.isArray(parsed.payload.restaurants)) return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return parsed.payload;
  } catch {
    return null;
  }
}
