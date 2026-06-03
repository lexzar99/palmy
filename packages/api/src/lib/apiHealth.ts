/**
 * API-hälsa & användning — driver admin-sidan "API-hälsa".
 *
 * Mål: när något (t.ex. adress-komplettering) slutar funka ska admin direkt se
 * OM det är ett API-problem (kvot/billing/nyckel) eller ett kodfel:
 *  - configured: är nyckeln/env satt? (vi exponerar ALDRIG värdet)
 *  - status: live health-check (testanrop) → ok / error + detalj
 *  - usage: VÅR egen räknade användning denna månad + ev. free-tier-gräns
 *
 * Obs: providers (Google/Cloudflare) exponerar inte sin egen kvot utan separata
 * billing-API:er + credentials. Vi spårar därför vår egen användning och kör
 * health-checks som avslöjar kvot/billing-fel via felmeddelandet.
 */
import prisma from './prisma';

export type HealthResult = { ok: boolean; latencyMs: number; detail?: string };

interface ServiceDef {
  key: string;
  name: string;
  category: string;
  envVars: string[];
  freeTierLimit?: number;
  limitNote?: string;
  healthCheck?: () => Promise<{ ok: boolean; detail?: string }>;
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const isReal = (v?: string | null) => !!v && !String(v).includes('local_dev_only');

async function timed(fn: () => Promise<{ ok: boolean; detail?: string }>): Promise<HealthResult> {
  const start = Date.now();
  try {
    const r = await Promise.race([
      fn(),
      new Promise<{ ok: boolean; detail?: string }>((_, rej) => setTimeout(() => rej(new Error('timeout (6s)')), 6000)),
    ]);
    return { ok: r.ok, latencyMs: Date.now() - start, detail: r.detail };
  } catch (e: any) {
    return { ok: false, latencyMs: Date.now() - start, detail: (e?.message || 'fel').slice(0, 160) };
  }
}

const SERVICES: ServiceDef[] = [
  {
    key: 'google_maps',
    name: 'Google Maps / Places',
    category: 'Kartor',
    envVars: ['GOOGLE_MAPS_API_KEY'],
    freeTierLimit: 40000,
    limitNote: 'Free: ~$200 kredit/mån (≈ 40 000 geocodes). Vi räknar våra anrop.',
    healthCheck: async () => {
      const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_KEY;
      if (!key) return { ok: false, detail: 'nyckel saknas' };
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=Lund&key=${key}`);
      const j: any = await res.json();
      const ok = j.status === 'OK' || j.status === 'ZERO_RESULTS';
      return { ok, detail: `${j.status}${j.error_message ? ': ' + j.error_message : ''}` };
    },
  },
  {
    key: 'r2',
    name: 'Cloudflare R2 (bilder)',
    category: 'Lagring',
    envVars: ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_ENDPOINT'],
    limitNote: 'Free: 10 GB lagring · 10M läs · 1M skriv/mån. Vi räknar våra uppladdningar.',
    healthCheck: async () => {
      const base = process.env.R2_PUBLIC_BASE_URL || process.env.R2_ENDPOINT;
      if (!base) return { ok: false, detail: 'endpoint saknas' };
      const res = await fetch(base, { method: 'HEAD' });
      return { ok: res.status < 500, detail: `HTTP ${res.status}` };
    },
  },
  {
    key: 'stripe',
    name: 'Stripe (betalning)',
    category: 'Betalning',
    envVars: ['STRIPE_SECRET_KEY'],
    limitNote: 'Per transaktion — ingen månadsgräns.',
    healthCheck: async () => {
      const k = process.env.STRIPE_SECRET_KEY;
      if (!isReal(k)) return { ok: false, detail: 'nyckel saknas/dummy' };
      const Stripe = (await import('stripe')).default;
      const bal = await new Stripe(k as string).balance.retrieve();
      return { ok: !!bal, detail: (k as string).startsWith('sk_live_') ? 'LIVE' : 'TEST' };
    },
  },
  {
    key: 'supabase',
    name: 'Supabase (auth + db)',
    category: 'Auth/DB',
    envVars: ['SUPABASE_URL'],
    limitNote: 'Free: 500 MB db · 50k MAU · 5 GB bandbredd.',
    healthCheck: async () => {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
      if (!url) return { ok: false, detail: 'url saknas' };
      const res = await fetch(`${url}/auth/v1/health`, { headers: key ? { apikey: key } : {} });
      return { ok: res.ok, detail: `HTTP ${res.status}` };
    },
  },
  {
    key: 'resend',
    name: 'Resend (e-post)',
    category: 'E-post',
    envVars: ['RESEND_API_KEY'],
    freeTierLimit: 3000,
    limitNote: 'Free: 100 mejl/dag · 3 000/mån. Vi räknar våra utskick.',
    healthCheck: async () => {
      const k = process.env.RESEND_API_KEY;
      if (!k) return { ok: false, detail: 'nyckel saknas' };
      const res = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${k}` } });
      return { ok: res.ok, detail: `HTTP ${res.status}` };
    },
  },
  {
    key: 'apns',
    name: 'Apple Push (APNs)',
    category: 'Push',
    envVars: ['APNS_KEY_P8', 'APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_BUNDLE_ID'],
    limitNote: 'Gratis — ingen gräns. (Status = endast konfig-koll.)',
  },
  {
    key: 'twilio',
    name: 'Twilio (SMS)',
    category: 'SMS',
    envVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
    limitNote: 'Per SMS — ingen månadsgräns.',
    healthCheck: async () => {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const tok = process.env.TWILIO_AUTH_TOKEN;
      if (!sid || !tok) return { ok: false, detail: 'ej konfigurerad' };
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
        headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${tok}`).toString('base64') },
      });
      return { ok: res.ok, detail: `HTTP ${res.status}` };
    },
  },
];

/** Räkna upp vår användning av en extern tjänst (fire-and-forget, kastar aldrig). */
export async function trackApiCall(service: string, by = 1): Promise<void> {
  try {
    const period = currentPeriod();
    await prisma.apiUsageCounter.upsert({
      where: { service_period: { service, period } },
      create: { service, period, count: by },
      update: { count: { increment: by } },
    });
  } catch (e: any) {
    console.error('[apiHealth] track error:', e?.message);
  }
}

/** Bygg dashboard-data: konfig + live status + vår användning. Aldrig nyckelvärden. */
export async function getApiHealth() {
  const period = currentPeriod();
  const counters = await prisma.apiUsageCounter.findMany({ where: { period } }).catch(() => []);
  const usageMap = new Map<string, number>(counters.map((c: any) => [c.service, c.count] as [string, number]));

  const services = await Promise.all(
    SERVICES.map(async (svc) => {
      const configured = svc.envVars.every((v) => isReal(process.env[v]));
      const health = configured && svc.healthCheck ? await timed(svc.healthCheck) : null;
      const used = (usageMap.get(svc.key) as number) ?? 0;
      const limit = svc.freeTierLimit ?? null;
      return {
        key: svc.key,
        name: svc.name,
        category: svc.category,
        configured,
        status: !configured ? 'not_configured' : svc.healthCheck ? (health?.ok ? 'ok' : 'error') : 'configured',
        latencyMs: health?.latencyMs ?? null,
        detail: health?.detail ?? null,
        usage: { used, limit, remaining: limit != null ? Math.max(0, limit - used) : null, period },
        limitNote: svc.limitNote ?? null,
        envVars: svc.envVars, // bara NAMNEN, aldrig värden
      };
    }),
  );

  return { generatedAt: new Date().toISOString(), period, services };
}
