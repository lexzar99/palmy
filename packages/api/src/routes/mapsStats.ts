/**
 * Maps API usage stats — in-process tracking
 *
 * The web app proxy (apps/web/app/api/places/*) reports usage here.
 * Admin panel reads aggregated stats.
 *
 * For multi-instance deployments, move storage to Redis/DB.
 */
import { Router } from 'express';

const router = Router();

const DAILY_WARN = 500;   // warn admin at this many daily calls
const DAILY_BLOCK = 2000; // hard daily cap (protects free-tier credit)

interface DayStats {
  autocomplete: number;
  geocode: number;
  total: number;
  date: string; // YYYY-MM-DD UTC
}

interface Alert {
  ts: number;
  message: string;
  ip?: string;
}

// In-memory state
let today: DayStats = makeDay();
let yesterday: DayStats | null = null;
const alerts: Alert[] = [];
const flaggedIPs = new Set<string>();

function utcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeDay(): DayStats {
  return { autocomplete: 0, geocode: 0, total: 0, date: utcDate() };
}

function rolloverIfNeeded() {
  const d = utcDate();
  if (today.date !== d) {
    yesterday = { ...today };
    today = makeDay();
  }
}

function pushAlert(msg: string, ip?: string) {
  alerts.unshift({ ts: Date.now(), message: msg, ip });
  if (alerts.length > 200) alerts.pop();
}

// ── POST /api/maps-stats/log ─────────────────────────────────────────────────
// Called by the web app proxy routes (fire-and-forget)
router.post('/log', (req, res) => {
  rolloverIfNeeded();
  const { type, ip } = req.body as { type: 'autocomplete' | 'geocode'; ip?: string };

  if (!['autocomplete', 'geocode'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type' });
  }

  today[type] += 1;
  today.total += 1;

  // Track suspicious IPs
  if (ip) {
    // Simple: flag if they rack up 30+ calls per day
    const ipKey = `ip:${ip}:${today.date}`;
    const count = (ipCounters[ipKey] = (ipCounters[ipKey] ?? 0) + 1);
    if (count >= 30 && !flaggedIPs.has(ip)) {
      flaggedIPs.add(ip);
      pushAlert(
        `IP ${ip} har gjort ${count} Maps-anrop idag — möjligt missbruk`,
        ip
      );
    }
  }

  // Daily warn threshold
  if (!warnSent && today.total >= DAILY_WARN) {
    warnSent = true;
    pushAlert(
      `Daglig Maps API-användning nådde ${today.total} anrop (varningsgräns: ${DAILY_WARN}). Kolla Google Cloud Console.`
    );
  }

  // Hard cap (soft block — just flag, don't crash the app)
  if (!blockSent && today.total >= DAILY_BLOCK) {
    blockSent = true;
    pushAlert(
      `KRITISK: Daglig Maps API-användning nådde ${today.total} anrop! Gränsen är ${DAILY_BLOCK}. Temporärt stopp på geocoding.`
    );
  }

  res.json({ ok: true, total: today.total });
});

// Track per-IP daily counts separately
const ipCounters: Record<string, number> = {};
let warnSent = false;
let blockSent = false;

// ── GET /api/maps-stats ──────────────────────────────────────────────────────
// Admin dashboard reads this
router.get('/', (req, res) => {
  rolloverIfNeeded();
  res.json({
    today,
    yesterday,
    alerts: alerts.slice(0, 30),
    flaggedIPs: Array.from(flaggedIPs),
    limits: {
      dailyWarn: DAILY_WARN,
      dailyBlock: DAILY_BLOCK,
    },
    warnActive: today.total >= DAILY_WARN,
    blockActive: today.total >= DAILY_BLOCK,
  });
});

// ── DELETE /api/maps-stats/flag?ip=x ────────────────────────────────────────
router.delete('/flag', (req, res) => {
  const ip = req.query.ip as string;
  if (ip) flaggedIPs.delete(ip);
  res.json({ ok: true });
});

export default router;
