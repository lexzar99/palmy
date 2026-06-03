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
import fs from 'fs';

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

// Läs en cgroup-fil (containerns RAM-tak/användning). "max" eller orimligt
// stort tal (cgroup v1 "ingen gräns"-sentinel) → null.
function readCgroupBytes(path: string): number | null {
  try {
    const v = fs.readFileSync(path, 'utf8').trim();
    if (v === 'max') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0 || n > 1e15) return null;
    return n;
  } catch {
    return null;
  }
}

export function getHostMetrics(): { metrics: CapacityMetric[]; note: string } {
  const metrics: CapacityMetric[] = [];
  const rss = process.memoryUsage().rss;
  const hostTotal = os.totalmem();

  // VIKTIGT: os.totalmem() på Railway = hela DELADE värd-maskinen (t.ex. 400 GB),
  // inte vår container. Vi läser containerns RAM-tak via cgroup (v2 → v1) istället.
  const cgLimit =
    readCgroupBytes('/sys/fs/cgroup/memory.max') ?? readCgroupBytes('/sys/fs/cgroup/memory/memory.limit_in_bytes');
  const cgUsage =
    readCgroupBytes('/sys/fs/cgroup/memory.current') ?? readCgroupBytes('/sys/fs/cgroup/memory/memory.usage_in_bytes');
  const limit = cgLimit && cgLimit < hostTotal ? cgLimit : null;
  const used = cgUsage && limit ? cgUsage : rss;

  if (limit) {
    const pct = Math.round((used / limit) * 100);
    metrics.push({
      key: 'host_mem',
      label: 'API-minne (container)',
      value: `${fmtBytes(used)} / ${fmtBytes(limit)}`,
      used,
      limit,
      pct,
      severity: sev(pct, 80, 92),
      hint: pct >= 80 ? 'Containerns minne tar slut → OOM-risk. Uppgradera Railway-planen.' : undefined,
    });
  } else {
    // Ingen container-gräns läsbar → visa processens RSS (host-total vore missvisande).
    const severity: Severity = rss > 700e6 ? 'critical' : rss > 480e6 ? 'warning' : 'ok';
    metrics.push({
      key: 'host_mem',
      label: 'API-minne (RSS)',
      value: fmtBytes(rss),
      used: rss,
      severity,
      hint:
        severity !== 'ok'
          ? 'API-processen använder mycket minne — kolla minnesläckor eller uppgradera plan.'
          : 'Containerns minnestak kunde inte läsas — visar processens egna RSS (normalt < 300 MB).',
    });
  }

  // Host-CPU är DELAD mellan containrar → bara info, aldrig larm.
  const load = os.loadavg()[0] ?? 0;
  const cpus = os.cpus().length || 1;
  metrics.push({
    key: 'host_cpu',
    label: `Host CPU-last 1m (delad, ${cpus} kärnor)`,
    value: load.toFixed(2),
    severity: 'info',
    hint: 'Hela värd-maskinens last (delad mellan containrar) — inte enbart vårt API.',
  });

  const up = process.uptime();
  metrics.push({
    key: 'host_uptime',
    label: 'Drifttid',
    value: up > 3600 ? `${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}m` : `${Math.floor(up / 60)}m`,
    severity: 'info',
    hint: up < 600 ? 'Nyligen omstartad — normalt direkt efter en deploy. Problem bara om det sker ofta.' : undefined,
  });

  return {
    metrics,
    note: 'API-processens/containerns egna resurser. Host-CPU är delad. Billing i $ kräver Railway-API-token (visas ej).',
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
