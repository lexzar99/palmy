import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../lib/api";

/**
 * Plattformens admin-kontrollerade företagsinfo. Hämtas från
 * `GET /api/settings` (singleton-rad på backend) och cachas i AsyncStorage
 * för 24h. Fallback-värden är "MatGo AB"-defaults om backend är otillgänglig
 * eller fältet inte är ifyllt.
 */
export interface AppSettings {
  companyName: string;
  organizationNumber: string;
  companyAddress: string;
  supportEmail: string;
  privacyEmail: string;
  noReplyEmail: string;
  contactEmail: string | null;
  contactPhone: string | null;
  contactPhoneHours: string | null;
  contactAddress: string | null;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  companyName: "MatGo AB",
  organizationNumber: "",
  companyAddress: "",
  supportEmail: "support@matgo.se",
  privacyEmail: "privacy@matgo.se",
  noReplyEmail: "no-reply@matgo.se",
  contactEmail: null,
  contactPhone: null,
  contactPhoneHours: null,
  contactAddress: null,
};

const CACHE_KEY = "matgo_app_settings";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface CachedShape {
  fetchedAt: number;
  data: AppSettings;
}

function normalize(raw: unknown): AppSettings {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const get = (key: string) =>
    typeof data[key] === "string" && (data[key] as string).trim() ? (data[key] as string) : null;

  return {
    companyName: get("companyName") || DEFAULT_APP_SETTINGS.companyName,
    organizationNumber:
      get("organizationNumber") || DEFAULT_APP_SETTINGS.organizationNumber,
    companyAddress: get("companyAddress") || DEFAULT_APP_SETTINGS.companyAddress,
    supportEmail:
      get("supportEmail") || get("contactEmail") || DEFAULT_APP_SETTINGS.supportEmail,
    privacyEmail:
      get("privacyEmail") ||
      get("supportEmail") ||
      get("contactEmail") ||
      DEFAULT_APP_SETTINGS.privacyEmail,
    noReplyEmail: get("noReplyEmail") || DEFAULT_APP_SETTINGS.noReplyEmail,
    contactEmail: get("contactEmail"),
    contactPhone: get("contactPhone"),
    contactPhoneHours: get("contactPhoneHours"),
    contactAddress: get("contactAddress"),
  };
}

// Modul-singleton så flera komponenter delar samma latest data utan att
// trigga separata fetches. Tomt initialt; readCache vid första mount hydrerar.
let memoryCache: AppSettings = DEFAULT_APP_SETTINGS;
let memoryFetchedAt = 0;
let inflightPromise: Promise<AppSettings> | null = null;

async function readCache(): Promise<CachedShape | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedShape;
    if (
      parsed &&
      typeof parsed.fetchedAt === "number" &&
      parsed.data &&
      typeof parsed.data === "object"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeCache(data: AppSettings) {
  try {
    const payload: CachedShape = { fetchedAt: Date.now(), data };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Fail open — cache är ren optimering.
  }
}

async function fetchSettings(): Promise<AppSettings> {
  if (inflightPromise) return inflightPromise;
  inflightPromise = (async () => {
    try {
      const res = await api.get("/api/settings");
      const next = normalize(res.data);
      memoryCache = next;
      memoryFetchedAt = Date.now();
      void writeCache(next);
      return next;
    } catch {
      // Fail open — låt anroparen falla tillbaka på cache eller defaults.
      throw new Error("fetch_failed");
    } finally {
      inflightPromise = null;
    }
  })();
  return inflightPromise;
}

/**
 * Hook för app-wide settings. Returnerar alltid en `settings`-objekt — fält
 * är defaults innan backend svarat. `loading` blir false så snart vi har
 * antingen cache- eller fresh-data.
 */
export function useAppSettings(): { settings: AppSettings; loading: boolean } {
  const [settings, setSettings] = useState<AppSettings>(memoryCache);
  const [loading, setLoading] = useState<boolean>(memoryFetchedAt === 0);

  useEffect(() => {
    let alive = true;

    const hydrate = async () => {
      // 1) Hydrera från cache först (instant render om cache finns)
      const cached = await readCache();
      const cacheFresh =
        cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS;

      if (cached && alive) {
        memoryCache = cached.data;
        memoryFetchedAt = cached.fetchedAt;
        setSettings(cached.data);
        setLoading(false);
      }

      // 2) Om cache är stale eller saknas: hämta fresh
      if (!cacheFresh) {
        try {
          const fresh = await fetchSettings();
          if (alive) {
            setSettings(fresh);
            setLoading(false);
          }
        } catch {
          // Behåll cache/defaults — fail-open som spec'ar.
          if (alive) setLoading(false);
        }
      }
    };

    void hydrate();

    return () => {
      alive = false;
    };
  }, []);

  return { settings, loading };
}
