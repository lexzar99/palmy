/**
 * Google Maps API abuse protection — server-side only (Next.js route handlers)
 *
 * Strategy:
 *  • Per-IP sliding window for autocomplete (max 60 calls / 10 min)
 *  • Per-IP hard limit for geocode (max 20 calls / 10 min)
 *  • Global daily call counter (resets at midnight UTC)
 *  • Admin alert threshold: warn at 800 calls/day (Google free tier = 200$/month credit)
 *  • Any single IP that exhausts the per-IP limit gets flagged as "suspicious"
 *
 * All counters are in-process memory — reset on deploy/restart.
 * For persistent tracking across instances, move to Redis/DB.
 */

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes sliding window

const AUTOCOMPLETE_LIMIT = 60;   // per IP per window
const GEOCODE_LIMIT = 20;        // per IP per window
const DAILY_WARN_THRESHOLD = 500; // global daily calls before admin warning

interface WindowEntry {
  count: number;
  windowStart: number;
}

// Maps: ip → { count, windowStart }
const autocompleteMap = new Map<string, WindowEntry>();
const geocodeMap = new Map<string, WindowEntry>();

// Flagged IPs (abusive)
export const flaggedIPs = new Set<string>();

// Global daily counters
let dailyAutocomplete = 0;
let dailyGeocode = 0;
let dayStart = todayUTCMidnight();

// Admin alert state
let adminAlertSent = false;
const adminAlerts: { ts: number; message: string; ip?: string }[] = [];

function todayUTCMidnight(): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function resetIfNewDay() {
  const today = todayUTCMidnight();
  if (today !== dayStart) {
    dayStart = today;
    dailyAutocomplete = 0;
    dailyGeocode = 0;
    adminAlertSent = false;
  }
}

function checkWindow(map: Map<string, WindowEntry>, ip: string, limit: number): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  resetIfNewDay();
  const now = Date.now();
  let entry = map.get(ip);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    entry = { count: 0, windowStart: now };
  }

  if (entry.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.windowStart + WINDOW_MS,
    };
  }

  entry.count += 1;
  map.set(ip, entry);

  return {
    allowed: true,
    remaining: limit - entry.count,
    resetAt: entry.windowStart + WINDOW_MS,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export function checkAutocompleteLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  suspicious: boolean;
} {
  const result = checkWindow(autocompleteMap, ip, AUTOCOMPLETE_LIMIT);
  if (!result.allowed) {
    flaggedIPs.add(ip);
    pushAlert(`IP ${ip} överskred autocomplete-gränsen (${AUTOCOMPLETE_LIMIT} anrop / 10 min)`, ip);
  }
  if (result.allowed) {
    dailyAutocomplete += 1;
    checkDailyThreshold();
  }
  return { ...result, suspicious: flaggedIPs.has(ip) };
}

export function checkGeocodeLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  suspicious: boolean;
} {
  const result = checkWindow(geocodeMap, ip, GEOCODE_LIMIT);
  if (!result.allowed) {
    flaggedIPs.add(ip);
    pushAlert(`IP ${ip} överskred geocode-gränsen (${GEOCODE_LIMIT} anrop / 10 min)`, ip);
  }
  if (result.allowed) {
    dailyGeocode += 1;
    checkDailyThreshold();
  }
  return { ...result, suspicious: flaggedIPs.has(ip) };
}

function checkDailyThreshold() {
  const total = dailyAutocomplete + dailyGeocode;
  if (!adminAlertSent && total >= DAILY_WARN_THRESHOLD) {
    adminAlertSent = true;
    pushAlert(
      `Daglig Maps API-användning nådde ${total} anrop (varningsgräns: ${DAILY_WARN_THRESHOLD}). Kolla Google Cloud Console.`
    );
  }
}

function pushAlert(message: string, ip?: string) {
  adminAlerts.unshift({ ts: Date.now(), message, ip });
  // Keep last 100 alerts
  if (adminAlerts.length > 100) adminAlerts.pop();
}

export function getUsageStats() {
  resetIfNewDay();
  return {
    daily: {
      autocomplete: dailyAutocomplete,
      geocode: dailyGeocode,
      total: dailyAutocomplete + dailyGeocode,
      warnThreshold: DAILY_WARN_THRESHOLD,
      alertSent: adminAlertSent,
    },
    flaggedIPs: Array.from(flaggedIPs),
    alerts: adminAlerts.slice(0, 20),
    limits: {
      autocomplete: { perIP: AUTOCOMPLETE_LIMIT, windowMin: WINDOW_MS / 60000 },
      geocode: { perIP: GEOCODE_LIMIT, windowMin: WINDOW_MS / 60000 },
    },
  };
}

export function clearFlag(ip: string) {
  flaggedIPs.delete(ip);
}
