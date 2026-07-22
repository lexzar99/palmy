import assert from 'assert';
import { createLiveState, type RedisLike } from '../lib/liveState';

let ms = 1_700_000_000_000;
const tick = (amount = 1) => { ms += amount; return new Date(ms); };

class FakeRedis implements RedisLike {
  connects = 0;
  multiCalls = 0;
  hgetCalls = 0;
  throwCommands = false;
  throwConnect = false;
  isOpen = false;
  hashes = new Map<string, Record<string, string>>();
  strings = new Map<string, string>();
  expiry = new Map<string, number>();
  on() { return this; }
  async connect() { this.connects++; if (this.throwConnect) throw new Error('connect failed'); this.isOpen = true; }
  destroy() { this.isOpen = false; }
  private expired(key: string) { if ((this.expiry.get(key) ?? Infinity) <= ms) { this.hashes.delete(key); this.strings.delete(key); this.expiry.delete(key); } }
  async hGetAll(key: string) { this.hgetCalls++; if (this.throwCommands) throw new Error('command failed'); this.expired(key); return { ...(this.hashes.get(key) ?? {}) }; }
  multi() {
    this.multiCalls++;
    const keys: string[] = [];
    const chain: any = {
      hGetAll: (key: string) => { keys.push(key); return chain; },
      exec: async () => Promise.all(keys.map((key) => this.hGetAll(key))),
    };
    return chain;
  }
  async eval(script: string, options: { keys: string[]; arguments: string[] }) {
    if (this.throwCommands) throw new Error('command failed');
    const [key, second] = options.keys;
    const args = options.arguments;
    this.expired(key); if (second) this.expired(second);
    if (script.includes('live-state:position')) {
      const [lat, lng, at, now, token] = args;
      const old = this.hashes.get(key);
      const oldAt = Number(old?.at);
      if (old && Number.isFinite(oldAt) && oldAt <= Number(now) + 60_000 && Number(at) <= oldAt) {
        return JSON.stringify({ accepted: false, lat: old.lat, lng: old.lng, at: old.at, claimed: false });
      }
      this.hashes.set(key, { v: '1', lat, lng, at }); this.expiry.set(key, ms + 600_000);
      const claimed = !this.strings.has(second);
      if (claimed) { this.strings.set(second, token); this.expiry.set(second, ms + 60_000); }
      return JSON.stringify({ accepted: true, lat, lng, at, claimed });
    }
    if (script.includes('live-state:release-flush')) {
      if (!this.strings.has(key)) return -1;
      if (this.strings.get(key) !== args[0]) return 0;
      this.strings.delete(key); this.expiry.delete(key); return 1;
    }
    if (script.includes('live-state:reset-flush') || script.includes('live-state:delete-eta')) {
      const existed = this.hashes.delete(key) || this.strings.delete(key); this.expiry.delete(key); return existed ? 1 : 0;
    }
    if (script.includes('live-state:eta')) {
      const old = this.hashes.get(key);
      const oldRevision = Number(old?.orderUpdatedAt ?? 0); const oldSource = Number(old?.sourcePositionAt ?? 0); const oldComputed = Number(old?.computedAt ?? 0);
      const revision = Number(args[2]); const source = Number(args[3]); const computed = Number(args[4]);
      if (old && (oldRevision > revision || (oldRevision === revision && (oldSource > source || (oldSource === source && oldComputed > computed))))) return 0;
      this.hashes.set(key, { v: '1', orderStatus: args[0], sourcePositionAt: args[1], orderUpdatedAt: args[2], computedAt: args[4], etaReadyAt: args[5], etaPickupAt: args[6], etaCustomerAt: args[7], etaCustomerMin: args[8], etaPriorityScore: args[9], etaReason: args[10] }); this.expiry.set(key, ms + 900_000); return 1;
    }
    throw new Error('unknown script');
  }
}

const env = () => ({ LIVE_STATE: 'redis', REDIS_URL: 'redis://fake', LIVE_STATE_KEY_PREFIX: 'test:live' });
const eta = (orderId = 'o1', revision = new Date(ms), sourcePositionAt: Date | null = new Date(ms), computedAt = new Date(ms)) => ({ orderId, orderStatus: 'PREPARING', orderUpdatedAt: revision, sourcePositionAt, computedAt, etaReadyAt: new Date(ms + 10_000), etaPickupAt: null, etaCustomerAt: new Date(ms + 20_000), etaCustomerMin: 0, etaPriorityScore: 0, etaReason: null });

async function main() {
  const off = new FakeRedis();
  const disabled = createLiveState({ env: { LIVE_STATE: 'pg', REDIS_URL: 'redis://fake' }, clientFactory: () => off });
  assert.deepStrictEqual(await disabled.getCourierPosition('c'), { state: 'disabled' }); assert.equal(off.connects, 0);
  const noUrl = createLiveState({ env: { LIVE_STATE: 'redis' }, clientFactory: () => off });
  assert.deepStrictEqual(await noUrl.getCourierPosition('c'), { state: 'disabled' }); assert.equal(off.connects, 0);

  const redis = new FakeRedis(); const live = createLiveState({ env: env(), now: () => new Date(ms), clientFactory: () => redis });
  assert.deepStrictEqual(await live.getCourierPosition('missing'), { state: 'miss' });
  const first = await live.setCourierPosition({ courierId: 'c', lat: 59.33, lng: 18.06, at: tick() });
  assert.equal(first.state, 'stored'); if (first.state !== 'stored') throw new Error('unreachable'); assert.equal(first.accepted, true); assert.ok(first.flushOwnerToken);
  const hit = await live.getCourierPosition('c'); assert.equal(hit.state, 'hit'); if (hit.state === 'hit') assert.deepStrictEqual(hit.value, { lat: 59.33, lng: 18.06, at: new Date(ms) });
  const older = await live.setCourierPosition({ courierId: 'c', lat: 1, lng: 2, at: new Date(ms - 1) }); assert.equal(older.state, 'stored'); if (older.state === 'stored') { assert.equal(older.accepted, false); assert.equal(older.position.lat, 59.33); }
  const second = await live.setCourierPosition({ courierId: 'c', lat: 60, lng: 19, at: tick() }); if (second.state !== 'stored') throw new Error('unreachable'); assert.equal(second.flushOwnerToken, null);
  assert.equal(await live.releasePositionFlushClaim('c', 'wrong'), 'not-owner'); assert.equal(await live.releasePositionFlushClaim('c', first.flushOwnerToken!), 'done');
  const third = await live.setCourierPosition({ courierId: 'c', lat: 61, lng: 20, at: tick() }); if (third.state !== 'stored') throw new Error('unreachable'); assert.ok(third.flushOwnerToken);
  ms += 60_001; const afterTtl = await live.setCourierPosition({ courierId: 'c', lat: 62, lng: 21, at: tick() }); if (afterTtl.state !== 'stored') throw new Error('unreachable'); assert.ok(afterTtl.flushOwnerToken);
  redis.hashes.set(live.key.position('corrupt'), { v: '1', lat: 'nope', lng: '18', at: 'bad' }); assert.deepStrictEqual(await live.getCourierPosition('corrupt'), { state: 'miss' });

  const batch = await live.getCourierPositions(['c', 'missing']); assert.equal(batch.state, 'ok'); if (batch.state === 'ok') assert.equal(batch.values.size, 1); assert.ok(redis.multiCalls > 0);
  const e1 = eta(); assert.equal(await live.setOrderEta(e1), 'stored');
  const read = await live.getOrderEta({ id: 'o1', status: 'PREPARING', updatedAt: e1.orderUpdatedAt }); assert.equal(read.state, 'hit'); if (read.state === 'hit') { assert.equal(read.value.etaCustomerMin, 0); assert.equal(read.value.etaPriorityScore, 0); assert.equal(read.value.etaPickupAt, null); }
  assert.equal(await live.setOrderEta(eta('o1', new Date(ms - 1), e1.sourcePositionAt, e1.computedAt)), 'superseded');
  assert.equal(await live.setOrderEta(eta('o1', e1.orderUpdatedAt, new Date((e1.sourcePositionAt?.getTime() ?? 0) - 1), e1.computedAt)), 'superseded');
  assert.equal(await live.setOrderEta(eta('o1', e1.orderUpdatedAt, e1.sourcePositionAt, new Date(e1.computedAt.getTime() - 1))), 'superseded');
  assert.deepStrictEqual(await live.getOrderEta({ id: 'o1', status: 'READY', updatedAt: e1.orderUpdatedAt }), { state: 'miss' });
  redis.hashes.set(live.key.eta('bad'), { v: '1', orderStatus: 'PREPARING', orderUpdatedAt: String(ms), etaReadyAt: 'bad' }); assert.deepStrictEqual(await live.getOrderEta({ id: 'bad', status: 'PREPARING', updatedAt: new Date(ms) }), { state: 'miss' });
  const etaBatch = await live.getOrderEtas([{ id: 'o1', status: 'PREPARING', updatedAt: e1.orderUpdatedAt }, { id: 'missing', status: 'PREPARING', updatedAt: e1.orderUpdatedAt }]); assert.equal(etaBatch.state, 'ok'); if (etaBatch.state === 'ok') assert.equal(etaBatch.values.size, 1);

  redis.throwCommands = true; assert.deepStrictEqual(await live.getCourierPosition('c'), { state: 'unavailable' }); assert.equal((await live.setOrderEta(eta('down'))), 'unavailable');

  let factoryCalls = 0; const sharedRedis = new FakeRedis(); const shared = createLiveState({ env: env(), now: () => new Date(ms), clientFactory: () => { factoryCalls++; return sharedRedis; } });
  await Promise.all([shared.getCourierPosition('a'), shared.getCourierPosition('b')]); assert.equal(factoryCalls, 1); assert.equal(sharedRedis.connects, 1);
  let recovered = false; const logs: string[] = []; const circuit = createLiveState({ env: env(), now: () => new Date(ms), circuitBreakerMs: 100, errorLogIntervalMs: 1_000, log: (message) => logs.push(message), clientFactory: () => { const client = new FakeRedis(); client.throwConnect = !recovered; return client; } });
  assert.deepStrictEqual(await circuit.getCourierPosition('x'), { state: 'unavailable' }); assert.deepStrictEqual(await circuit.getCourierPosition('x'), { state: 'unavailable' }); assert.equal(logs.length, 1); recovered = true; ms += 101; assert.deepStrictEqual(await circuit.getCourierPosition('x'), { state: 'miss' }); assert.ok(logs.some((message) => message.includes('recovered')));
  console.log('live-state contracts: disabled, recovery, codecs, CAS and batches OK');
}

main().catch((error) => { console.error(error); process.exit(1); });
