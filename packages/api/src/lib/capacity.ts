/**
 * Kapacitets-metrik — förutspå när det är dags att uppgradera tier.
 *
 * Supabase: live från Postgres egna system-vyer (pg_catalog/auth) via vår
 * befintliga DB-anslutning — INGA nycklar exponeras. Vi mäter det som faktiskt
 * gör att databasen "hänger"/blir långsam: storlek vs free-tier-tak, antal
 * anslutningar, cache-träff (RAM), hängande queries, MAU.
 *
 * Railway/host: API-processens egna resurser (minne/CPU/uptime) → "tål den
 * lasten / börjar den strypa". Railways billing/usage kräver Railway-API-token
 * (visas ej här) — men resurs-strypning syns direkt i process-metriken.
 *
 * Varje mätvärde får severity (ok/warning/critical) + en konkret hint.
 */
import prisma from './prisma';
import os from 'os';

export type Severity = 'ok' | 'warning' | 'critical' | 'info';

export interface CapacityMetric {
  key: string;
  label: string;
  value: string;
  used?: number;
  limit?: number;
  pct?: number | null;
  severity: Severity;
  hint?: string;
}

function sev(pct: number | null, warn = 80, crit = 95): Severity {
  if (pct == null) return 'info';
  if (pct >= crit) return 'critical';
  if (pct >= warn) return 'warning';
  return 'ok';
}

function fmtBytes(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)} MB`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(0)} KB`;
  return `${Math.round(b)} B`;
}

// Konstant SQL (ingen klient-input) — kastar aldrig uppåt; failar tyst per query.
async function q(sql: string): Promise<any[]> {
  try {
    return (await (prisma as any).$queryRawUnsafe(sql)) as any[];
  } catch {
    return [];
  }
}

export async function getSupabaseMetrics(): Promise<{ ok: boolean; metrics: CapacityMetric[]; note: string }> {
  const metrics: CapacityMetric[] = [];
  const FREE_DB = 500 * 1e6; // 500 MB free tier
  const FREE_MAU = 50000;

  const sizeRows = await q(`SELECT pg_database_size(current_database())::float8 AS bytes`);
  if (sizeRows[0]?.bytes != null) {
    const used = Number(sizeRows[0].bytes);
    const pct = Math.round((used / FREE_DB) * 100);
    metrics.push({
      key: 'db_size',
      label: 'Databasstorlek',
      value: `${fmtBytes(used)} / 500 MB`,
      used,
      limit: FREE_DB,
      pct,
      severity: sev(pct),
      hint: pct >= 80 ? 'Närmar dig free-tier-taket (500 MB) → planera Supabase Pro.' : undefined,
    });
  }

  const connRows = await q(
    `SELECT (SELECT count(*) FROM pg_stat_activity)::float8 AS active, (SELECT setting::float8 FROM pg_settings WHERE name='max_connections') AS max`,
  );
  if (connRows[0]?.active != null) {
    const active = Number(connRows[0].active);
    const max = Number(connRows[0].max) || 0;
    const pct = max ? Math.round((active / max) * 100) : null;
    metrics.push({
      key: 'connections',
      label: 'DB-anslutningar',
      value: max ? `${active} / ${max}` : `${active}`,
      used: active,
      limit: max || undefined,
      pct,
      severity: sev(pct, 70, 90),
      hint: pct != null && pct >= 70 ? 'Många samtidiga anslutningar → risk för "too many connections". Använd pooler / uppgradera.' : undefined,
    });
  }

  const cacheRows = await q(
    `SELECT round(sum(blks_hit)*100.0/NULLIF(sum(blks_hit)+sum(blks_read),0),1)::float8 AS ratio FROM pg_stat_database`,
  );
  if (cacheRows[0]?.ratio != null) {
    const ratio = Number(cacheRows[0].ratio);
    const severity: Severity = ratio < 90 ? 'critical' : ratio < 95 ? 'warning' : 'ok';
    metrics.push({
      key: 'cache_hit',
      label: 'Cache-träff (RAM)',
      value: `${ratio}%`,
      severity,
      hint: ratio < 95 ? 'Låg cache-träff = läser från disk = långsamt. Mer RAM (uppgradering) hjälper.' : undefined,
    });
  }

  const longRows = await q(
    `SELECT COALESCE(max(extract(epoch from (now()-query_start))),0)::float8 AS secs FROM pg_stat_activity WHERE state='active' AND query NOT ILIKE '%pg_stat_activity%'`,
  );
  if (longRows[0]?.secs != null) {
    const secs = Math.round(Number(longRows[0].secs));
    const severity: Severity = secs > 30 ? 'critical' : secs > 5 ? 'warning' : 'ok';
    metrics.push({
      key: 'longest_query',
      label: 'Längsta aktiva query',
      value: `${secs}s`,
      severity,
      hint: secs > 5 ? 'Långkörande/hängande query → ofta saknat index eller låsning. Kolla loggar.' : undefined,
    });
  }

  const mauRows = await q(
    `SELECT count(*)::float8 AS total, count(*) FILTER (WHERE last_sign_in_at > now()-interval '30 days')::float8 AS mau FROM auth.users`,
  );
  if (mauRows[0]?.mau != null) {
    const mau = Number(mauRows[0].mau);
    const total = Number(mauRows[0].total);
    const pct = Math.round((mau / FREE_MAU) * 100);
    metrics.push({
      key: 'mau',
      label: 'Aktiva användare (30d)',
      value: `${mau} MAU · ${total} totalt`,
      used: mau,
      limit: FREE_MAU,
      pct,
      severity: sev(pct),
      hint: pct >= 80 ? 'Närmar dig free-tier MAU-tak (50 000).' : undefined,
    });
  }

  return {
    ok: metrics.length > 0,
    metrics,
    note: 'Live från Postgres (pg_catalog/auth). Free-tier: 500 MB db · 50k MAU · 5 GB bandbredd.',
  };
}

export function getHostMetrics(): { metrics: CapacityMetric[]; note: string } {
  const metrics: CapacityMetric[] = [];

  const total = os.totalmem();
  const free = os.freemem();
  const usedSys = total - free;
  const memPct = total ? Math.round((usedSys / total) * 100) : null;
  metrics.push({
    key: 'host_mem',
    label: 'Serverminne',
    value: `${fmtBytes(usedSys)} / ${fmtBytes(total)}`,
    used: usedSys,
    limit: total,
    pct: memPct,
    severity: sev(memPct, 80, 92),
    hint: memPct != null && memPct >= 80 ? 'Minnet tar slut → risk för OOM-omstart. Uppgradera Railway-planen.' : undefined,
  });

  const mem = process.memoryUsage();
  metrics.push({ key: 'host_rss', label: 'API-process (RSS)', value: fmtBytes(mem.rss), severity: 'info' });

  const load = os.loadavg()[0] ?? 0;
  const cpus = os.cpus().length || 1;
  const loadPct = Math.round((load / cpus) * 100);
  metrics.push({
    key: 'host_cpu',
    label: `CPU-last 1m (${cpus} kärnor)`,
    value: load.toFixed(2),
    pct: loadPct,
    severity: sev(loadPct, 80, 100),
    hint: loadPct >= 80 ? 'Hög CPU-last → API:t börjar strypa. Uppgradera plan eller optimera.' : undefined,
  });

  const up = process.uptime();
  metrics.push({
    key: 'host_uptime',
    label: 'Drifttid',
    value: up > 3600 ? `${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}m` : `${Math.floor(up / 60)}m`,
    severity: up < 300 ? 'warning' : 'info',
    hint: up < 300 ? 'Nyligen omstartad — om det sker ofta kan det vara krascher/OOM.' : undefined,
  });

  return {
    metrics,
    note: 'API-processens egna resurser (Railway-container). Billing/usage i $ kräver Railway-API-token (visas ej).',
  };
}

export async function getCapacityMetrics() {
  const supabase = await getSupabaseMetrics();
  const host = getHostMetrics();
  const all = [...supabase.metrics, ...host.metrics];
  const worst: Severity = all.some((m) => m.severity === 'critical')
    ? 'critical'
    : all.some((m) => m.severity === 'warning')
      ? 'warning'
      : 'ok';
  const alerts = all.filter((m) => m.severity === 'warning' || m.severity === 'critical');
  return { supabase, host, worst, alerts, generatedAt: new Date().toISOString() };
}
