import { randomUUID } from 'crypto';
import { createClient } from 'redis';
import type { OrderEtaSnapshot } from './orderEta';

/** Redis-only live data.  Prisma deliberately does not belong in this module. */
export type LiveRead<T> =
  | { state: 'hit'; value: T }
  | { state: 'miss' }
  | { state: 'disabled' }
  | { state: 'unavailable' };

export type BatchLiveRead<T> =
  | { state: 'ok'; values: Map<string, T> }
  | { state: 'disabled' }
  | { state: 'unavailable' };

export type CourierPosition = { lat: number; lng: number; at: Date };
export type PositionWriteResult =
  | { state: 'stored'; accepted: boolean; position: CourierPosition; flushOwnerToken: string | null }
  | { state: 'disabled' }
  | { state: 'unavailable' };
export type EtaWriteResult = 'stored' | 'superseded' | 'disabled' | 'unavailable';
export type MaintenanceResult = 'done' | 'not-found' | 'not-owner' | 'disabled' | 'unavailable';

export type OrderEtaSnapshotWithMetadata = OrderEtaSnapshot & {
  orderId: string;
  orderStatus: string;
  orderUpdatedAt: Date;
  computedAt: Date;
  sourcePositionAt: Date | null;
};

export type LiveStateOrder = { id: string; status: string; updatedAt: Date };

type RedisMulti = { hGetAll(key: string): RedisMulti; exec(): Promise<Array<Record<string, string>>> };
export interface RedisLike {
  connect(): Promise<void>;
  on?(event: 'error', listener: (error: unknown) => void): unknown;
  hGetAll(key: string): Promise<Record<string, string>>;
  multi(): RedisMulti;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
  disconnect?(): Promise<void> | void;
  destroy?(): void;
  isOpen?: boolean;
}

export type LiveStateOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  clientFactory?: () => RedisLike;
  log?: (message: string) => void;
  commandTimeoutMs?: number;
  circuitBreakerMs?: number;
  errorLogIntervalMs?: number;
};

const POSITION_TTL_MS = 10 * 60_000;
const FLUSH_TTL_MS = 60_000;
const ETA_TTL_MS = 15 * 60_000;
const VERSION = '1';

const POSITION_WRITE_LUA = `-- live-state:position
local oldAt = redis.call('HGET', KEYS[1], 'at')
local incomingAt = tonumber(ARGV[3])
local now = tonumber(ARGV[4])
if oldAt and tonumber(oldAt) and tonumber(oldAt) <= now + 60000 and incomingAt <= tonumber(oldAt) then
  return cjson.encode({accepted=false,lat=redis.call('HGET', KEYS[1], 'lat'),lng=redis.call('HGET', KEYS[1], 'lng'),at=oldAt,claimed=false})
end
redis.call('HSET', KEYS[1], 'v', '1', 'lat', ARGV[1], 'lng', ARGV[2], 'at', ARGV[3])
redis.call('PEXPIRE', KEYS[1], 600000)
local claimed = redis.call('SET', KEYS[2], ARGV[5], 'NX', 'PX', 60000)
return cjson.encode({accepted=true,lat=ARGV[1],lng=ARGV[2],at=ARGV[3],claimed=claimed and true or false})`;

const RELEASE_CLAIM_LUA = `-- live-state:release-flush
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
if redis.call('EXISTS', KEYS[1]) == 0 then return -1 end
return 0`;

const ETA_WRITE_LUA = `-- live-state:eta
local existingRevision = redis.call('HGET', KEYS[1], 'orderUpdatedAt')
if existingRevision then
  local oldRevision = tonumber(existingRevision) or 0
  local oldSource = tonumber(redis.call('HGET', KEYS[1], 'sourcePositionAt') or '0') or 0
  local oldComputed = tonumber(redis.call('HGET', KEYS[1], 'computedAt') or '0') or 0
  local revision = tonumber(ARGV[3]) or 0
  local source = tonumber(ARGV[4]) or 0
  local computed = tonumber(ARGV[5]) or 0
  if oldRevision > revision or (oldRevision == revision and (oldSource > source or (oldSource == source and oldComputed > computed))) then return 0 end
end
redis.call('HSET', KEYS[1], 'v', '1', 'orderStatus', ARGV[1], 'orderUpdatedAt', ARGV[3], 'computedAt', ARGV[5], 'sourcePositionAt', ARGV[2], 'etaReadyAt', ARGV[6], 'etaPickupAt', ARGV[7], 'etaCustomerAt', ARGV[8], 'etaCustomerMin', ARGV[9], 'etaPriorityScore', ARGV[10], 'etaReason', ARGV[11])
redis.call('PEXPIRE', KEYS[1], 900000)
return 1`;

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function decodePosition(raw: Record<string, string>): CourierPosition | null {
  if (raw.v !== VERSION) return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  const at = Number(raw.at);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(at) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const date = new Date(at);
  return validDate(date) ? { lat, lng, at: date } : null;
}

function jsonField<T>(raw: string | undefined, isValue: (value: unknown) => value is T): T | null | undefined {
  if (raw === undefined) return undefined;
  try {
    const value = JSON.parse(raw);
    return value === null || isValue(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function decodeEta(raw: Record<string, string>, order: LiveStateOrder): OrderEtaSnapshot | null {
  if (raw.v !== VERSION || raw.orderStatus !== order.status || Number(raw.orderUpdatedAt) !== order.updatedAt.getTime()) return null;
  const decodeDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(new Date(value).getTime());
  const ready = jsonField(raw.etaReadyAt, decodeDate);
  const pickup = jsonField(raw.etaPickupAt, decodeDate);
  const customer = jsonField(raw.etaCustomerAt, decodeDate);
  const customerMin = jsonField(raw.etaCustomerMin, (value): value is number => typeof value === 'number' && Number.isFinite(value));
  const priority = jsonField(raw.etaPriorityScore, (value): value is number => typeof value === 'number' && Number.isFinite(value));
  const reason = jsonField(raw.etaReason, (value): value is string => typeof value === 'string');
  if ([ready, pickup, customer, customerMin, priority, reason].some((value) => value === undefined)) return null;
  return {
    etaReadyAt: ready === null ? null : new Date(ready!),
    etaPickupAt: pickup === null ? null : new Date(pickup!),
    etaCustomerAt: customer === null ? null : new Date(customer!),
    etaCustomerMin: customerMin as number | null,
    etaPriorityScore: priority as number | null,
    etaReason: reason as string | null,
  };
}

function parseEvalJson(value: unknown): any | null {
  try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; }
}

export function createLiveState(options: LiveStateOptions = {}) {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const log = options.log ?? ((message) => console.error(message));
  const commandTimeoutMs = options.commandTimeoutMs ?? 2_000;
  const circuitBreakerMs = options.circuitBreakerMs ?? 30_000;
  const errorLogIntervalMs = options.errorLogIntervalMs ?? 5 * 60_000;
  const enabled = env.LIVE_STATE === 'redis' && Boolean(env.REDIS_URL);
  const prefix = env.LIVE_STATE_KEY_PREFIX || 'viaeats:live:v1';
  let client: RedisLike | undefined;
  let connectPromise: Promise<RedisLike> | undefined;
  let circuitUntil = 0;
  let lastErrorLogAt = -Infinity;
  let failedSinceRecovery = false;

  const key = {
    position: (courierId: string) => `${prefix}:courier:pos:${courierId}`,
    flush: (courierId: string) => `${prefix}:courier:pos-flush:${courierId}`,
    eta: (orderId: string) => `${prefix}:order:eta:${orderId}`,
  };

  const reportError = (error: unknown) => {
    const at = now().getTime();
    if (at - lastErrorLogAt >= errorLogIntervalMs) {
      const message = error instanceof Error ? error.message : String(error);
      log(`[live-state] Redis unavailable: ${message}`);
      lastErrorLogAt = at;
    }
    failedSinceRecovery = true;
  };
  const discardClient = () => {
    const bad = client;
    client = undefined;
    connectPromise = undefined;
    circuitUntil = now().getTime() + circuitBreakerMs;
    try { bad?.destroy?.(); } catch { /* best effort */ }
    try { void bad?.disconnect?.(); } catch { /* best effort */ }
  };
  const deadline = async <T>(promise: Promise<T>): Promise<T> => {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error('Redis command timed out')), commandTimeoutMs); }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  };
  const defaultFactory = (): RedisLike => createClient({
    url: env.REDIS_URL,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: commandTimeoutMs,
      socketTimeout: commandTimeoutMs,
      reconnectStrategy: (attempt: number) => attempt >= 2 ? new Error('live-state reconnect limit reached') : Math.min(200 * (attempt + 1), 500),
    },
  } as any) as unknown as RedisLike;
  const getClient = async (): Promise<RedisLike | undefined> => {
    if (!enabled) return undefined;
    if (client && client.isOpen !== false) return client;
    if (now().getTime() < circuitUntil) return undefined;
    if (!connectPromise) {
      const candidate = (options.clientFactory ?? defaultFactory)();
      client = candidate;
      candidate.on?.('error', reportError);
      connectPromise = deadline(candidate.connect()).then(() => {
        if (failedSinceRecovery) log('[live-state] Redis connection recovered');
        failedSinceRecovery = false;
        return candidate;
      }).catch((error) => {
        reportError(error);
        discardClient();
        throw error;
      });
    }
    try { return await connectPromise; } catch { return undefined; }
  };
  const unavailable = async <T>(operation: (redis: RedisLike) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> => {
    const redis = await getClient();
    if (!redis) return { ok: false };
    try { return { ok: true, value: await deadline(operation(redis)) }; }
    catch (error) { reportError(error); discardClient(); return { ok: false }; }
  };

  const getCourierPosition = async (courierId: string): Promise<LiveRead<CourierPosition>> => {
    if (!enabled) return { state: 'disabled' };
    const result = await unavailable((redis) => redis.hGetAll(key.position(courierId)));
    if (!result.ok) return { state: 'unavailable' };
    const value = decodePosition(result.value);
    return value ? { state: 'hit', value } : { state: 'miss' };
  };
  const getCourierPositions = async (courierIds: string[]): Promise<BatchLiveRead<CourierPosition>> => {
    if (!enabled) return { state: 'disabled' };
    const unique = [...new Set(courierIds)];
    const result = await unavailable(async (redis) => {
      const multi = redis.multi();
      unique.forEach((id) => multi.hGetAll(key.position(id)));
      return multi.exec();
    });
    if (!result.ok) return { state: 'unavailable' };
    const values = new Map<string, CourierPosition>();
    unique.forEach((id, index) => { const value = decodePosition(result.value[index] ?? {}); if (value) values.set(id, value); });
    return { state: 'ok', values };
  };
  const setCourierPosition = async (input: { courierId: string; lat: number; lng: number; at: Date }): Promise<PositionWriteResult> => {
    if (!enabled) return { state: 'disabled' };
    if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng) || !validDate(input.at)) return { state: 'unavailable' };
    const token = randomUUID();
    const result = await unavailable((redis) => redis.eval(POSITION_WRITE_LUA, { keys: [key.position(input.courierId), key.flush(input.courierId)], arguments: [String(input.lat), String(input.lng), String(input.at.getTime()), String(now().getTime()), token] }));
    if (!result.ok) return { state: 'unavailable' };
    const stored = parseEvalJson(result.value);
    const position = stored && decodePosition({ v: VERSION, lat: String(stored.lat), lng: String(stored.lng), at: String(stored.at) });
    if (!position || typeof stored.accepted !== 'boolean') return { state: 'unavailable' };
    return { state: 'stored', accepted: stored.accepted, position, flushOwnerToken: stored.accepted && stored.claimed ? token : null };
  };
  const releasePositionFlushClaim = async (courierId: string, ownerToken: string): Promise<MaintenanceResult> => {
    if (!enabled) return 'disabled';
    const result = await unavailable((redis) => redis.eval(RELEASE_CLAIM_LUA, { keys: [key.flush(courierId)], arguments: [ownerToken] }));
    if (!result.ok) return 'unavailable';
    return Number(result.value) === 1 ? 'done' : Number(result.value) === -1 ? 'not-found' : 'not-owner';
  };
  const resetPositionFlushClaim = async (courierId: string): Promise<MaintenanceResult> => {
    if (!enabled) return 'disabled';
    const result = await unavailable((redis) => redis.eval("-- live-state:reset-flush\nreturn redis.call('DEL', KEYS[1])", { keys: [key.flush(courierId)], arguments: [] }));
    if (!result.ok) return 'unavailable';
    return Number(result.value) > 0 ? 'done' : 'not-found';
  };
  const getOrderEta = async (order: LiveStateOrder): Promise<LiveRead<OrderEtaSnapshot>> => {
    if (!enabled) return { state: 'disabled' };
    const result = await unavailable((redis) => redis.hGetAll(key.eta(order.id)));
    if (!result.ok) return { state: 'unavailable' };
    const value = decodeEta(result.value, order);
    return value ? { state: 'hit', value } : { state: 'miss' };
  };
  const getOrderEtas = async (orders: LiveStateOrder[]): Promise<BatchLiveRead<OrderEtaSnapshot>> => {
    if (!enabled) return { state: 'disabled' };
    const unique = [...new Map(orders.map((order) => [order.id, order])).values()];
    const result = await unavailable(async (redis) => { const multi = redis.multi(); unique.forEach((order) => multi.hGetAll(key.eta(order.id))); return multi.exec(); });
    if (!result.ok) return { state: 'unavailable' };
    const values = new Map<string, OrderEtaSnapshot>();
    unique.forEach((order, index) => { const value = decodeEta(result.value[index] ?? {}, order); if (value) values.set(order.id, value); });
    return { state: 'ok', values };
  };
  const setOrderEta = async (snapshot: OrderEtaSnapshotWithMetadata): Promise<EtaWriteResult> => {
    if (!enabled) return 'disabled';
    if (!validDate(snapshot.orderUpdatedAt) || !validDate(snapshot.computedAt) || (snapshot.sourcePositionAt !== null && !validDate(snapshot.sourcePositionAt))) return 'unavailable';
    const fields = [snapshot.etaReadyAt, snapshot.etaPickupAt, snapshot.etaCustomerAt, snapshot.etaCustomerMin, snapshot.etaPriorityScore, snapshot.etaReason].map((value) => JSON.stringify(value instanceof Date ? value.toISOString() : value));
    const result = await unavailable((redis) => redis.eval(ETA_WRITE_LUA, { keys: [key.eta(snapshot.orderId)], arguments: [snapshot.orderStatus, JSON.stringify(snapshot.sourcePositionAt ? snapshot.sourcePositionAt.getTime() : null), String(snapshot.orderUpdatedAt.getTime()), String(snapshot.sourcePositionAt?.getTime() ?? 0), String(snapshot.computedAt.getTime()), ...fields] }));
    if (!result.ok) return 'unavailable';
    return Number(result.value) === 1 ? 'stored' : 'superseded';
  };
  const deleteOrderEta = async (orderId: string): Promise<MaintenanceResult> => {
    if (!enabled) return 'disabled';
    const result = await unavailable((redis) => redis.eval("-- live-state:delete-eta\nreturn redis.call('DEL', KEYS[1])", { keys: [key.eta(orderId)], arguments: [] }));
    if (!result.ok) return 'unavailable';
    return Number(result.value) > 0 ? 'done' : 'not-found';
  };

  return { getCourierPosition, getCourierPositions, setCourierPosition, releasePositionFlushClaim, resetPositionFlushClaim, getOrderEta, getOrderEtas, setOrderEta, deleteOrderEta, key };
}

const singleton = createLiveState();
export const getCourierPosition = singleton.getCourierPosition;
export const getCourierPositions = singleton.getCourierPositions;
export const setCourierPosition = singleton.setCourierPosition;
export const releasePositionFlushClaim = singleton.releasePositionFlushClaim;
export const resetPositionFlushClaim = singleton.resetPositionFlushClaim;
export const getOrderEta = singleton.getOrderEta;
export const getOrderEtas = singleton.getOrderEtas;
export const setOrderEta = singleton.setOrderEta;
export const deleteOrderEta = singleton.deleteOrderEta;
