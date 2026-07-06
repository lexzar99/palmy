/**
 * Ops-metrik i minnet — det Railway-loggarna inte ger oss på ett query-bart sätt.
 *
 * Räknar 429:or (vem slog i vilken limiter), 5xx-svar och långsamma requests
 * sedan processtart, med små ringbuffertar för "senaste händelserna".
 * Läses av GET /api/admin/ops (SUPER_ADMIN + GLOBAL_VIEWER, dvs Falken).
 * Nollställs vid deploy/omstart — det är medvetet: trender över tid ägs av
 * vakt-skriptet som diffar mellan körningar, inte av API:t.
 */

export interface RateLimitHit {
  at: string;
  limiter: string; // 'general' | 'abuse' | 'order' | 'admin-login' | 'session-verify'
  path: string;
  ip: string;
  // Limiter-nyckeln kan vara telefonnummer (orderLimiter) → gör att en
  // missbrukande kund kan identifieras. Endpointen är admin-skyddad.
  key: string;
}

export interface SlowRequest {
  at: string;
  method: string;
  path: string;
  ms: number;
  status: number;
}

export interface ServerErrorEvent {
  at: string;
  method: string;
  path: string;
  status: number;
}

const RING_MAX = 100;
export const SLOW_MS = 2000;

const state = {
  startedAt: new Date().toISOString(),
  requests: 0,
  rateLimitHits: 0,
  serverErrors: 0,
  slowRequests: 0,
  recentRateLimitHits: [] as RateLimitHit[],
  recentSlow: [] as SlowRequest[],
  recentServerErrors: [] as ServerErrorEvent[],
};

function push<T>(ring: T[], item: T) {
  ring.push(item);
  if (ring.length > RING_MAX) ring.shift();
}

export function recordRateLimitHit(limiter: string, path: string, ip: string, key: string) {
  state.rateLimitHits += 1;
  push(state.recentRateLimitHits, {
    at: new Date().toISOString(),
    limiter,
    path,
    ip,
    key,
  });
}

export function recordRequest(method: string, path: string, status: number, ms: number) {
  state.requests += 1;
  if (status >= 500) {
    state.serverErrors += 1;
    push(state.recentServerErrors, { at: new Date().toISOString(), method, path, status });
  }
  if (ms >= SLOW_MS) {
    state.slowRequests += 1;
    push(state.recentSlow, { at: new Date().toISOString(), method, path, ms: Math.round(ms), status });
  }
}

export function getOpsMetrics() {
  return {
    startedAt: state.startedAt,
    uptimeSeconds: Math.round(process.uptime()),
    counters: {
      requests: state.requests,
      rateLimitHits: state.rateLimitHits,
      serverErrors: state.serverErrors,
      slowRequests: state.slowRequests,
    },
    slowThresholdMs: SLOW_MS,
    recentRateLimitHits: state.recentRateLimitHits.slice(-30),
    recentSlow: state.recentSlow.slice(-30),
    recentServerErrors: state.recentServerErrors.slice(-30),
  };
}
