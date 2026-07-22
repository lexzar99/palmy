import assert from 'assert';
import { createCourierLivePosition, createCourierPositionWriteBehind } from '../lib/courierLivePosition';

const pgAt = new Date('2026-01-01T10:00:00.000Z');
const older = new Date('2026-01-01T09:59:00.000Z');
const newer = new Date('2026-01-01T10:01:00.000Z');

async function main() {
  let minimalReads = 0;
  const db = {
    courier: {
      findUnique: async () => { minimalReads++; return { currentLat: 1, currentLng: 2, lastSeenAt: pgAt }; },
      findMany: async () => [{ id: 'missing-fields', currentLat: 1, currentLng: 2, lastSeenAt: pgAt }],
      updateMany: async () => ({ count: 1 }),
    },
  };
  const position = createCourierLivePosition({
    prisma: db,
    getCourierPosition: async (id) => id === 'down' ? { state: 'unavailable' } : { state: 'hit', value: { lat: 9, lng: 10, at: id === 'old' ? older : newer } },
    getCourierPositions: async () => ({ state: 'ok', values: new Map([['a', { lat: 9, lng: 10, at: newer }]]) }),
  });
  const pgWins = await position.overlayCourier({ id: 'old', currentLat: 1, currentLng: 2, lastSeenAt: pgAt });
  assert.deepStrictEqual({ lat: pgWins.currentLat, lng: pgWins.currentLng, at: pgWins.lastSeenAt }, { lat: 1, lng: 2, at: pgAt });
  const redisWins = await position.overlayCourier({ id: 'new', currentLat: 1, currentLng: 2, lastSeenAt: pgAt });
  assert.deepStrictEqual({ lat: redisWins.currentLat, lng: redisWins.currentLng, at: redisWins.lastSeenAt }, { lat: 9, lng: 10, at: newer });
  const fallback = await position.overlayCourier({ id: 'down', currentLat: 1, currentLng: 2, lastSeenAt: pgAt });
  assert.equal(fallback.currentLat, 1);
  const fetched = await position.overlayCourier({ id: 'missing-fields' });
  assert.equal(fetched.currentLat, 9); assert.equal(minimalReads, 1);
  const batch = await position.overlayCouriers([{ id: 'a', currentLat: 1, currentLng: 2, lastSeenAt: pgAt }, { id: 'b', currentLat: 3, currentLng: 4, lastSeenAt: pgAt }]);
  assert.equal(batch[0].currentLat, 9); assert.equal(batch[1].currentLat, 3);

  let writes = 0; let releases = 0;
  const writeBehind = createCourierPositionWriteBehind({
    setPosition: async () => ({ state: 'stored', accepted: true, position: { lat: 9, lng: 10, at: newer }, flushOwnerToken: 'owner' }),
    persistNewestPosition: async () => { writes++; return { currentLat: 9, currentLng: 10, lastSeenAt: newer }; },
    releaseFlushClaim: async () => { releases++; },
  });
  assert.equal((await writeBehind({ courierId: 'c', lat: 1, lng: 2, at: pgAt })).pgWrite, 'flushed'); assert.equal(writes, 1);
  const skipped = createCourierPositionWriteBehind({ setPosition: async () => ({ state: 'stored', accepted: true, position: { lat: 9, lng: 10, at: newer }, flushOwnerToken: null }), persistNewestPosition: async () => { writes++; return { currentLat: 9, currentLng: 10, lastSeenAt: newer }; } });
  assert.equal((await skipped({ courierId: 'c', lat: 1, lng: 2, at: pgAt })).pgWrite, 'skipped'); assert.equal(writes, 1);
  const down = createCourierPositionWriteBehind({ setPosition: async () => ({ state: 'unavailable' }), persistNewestPosition: async () => { writes++; return { currentLat: 1, currentLng: 2, lastSeenAt: pgAt }; } });
  assert.equal((await down({ courierId: 'c', lat: 1, lng: 2, at: pgAt })).pgWrite, 'fallback'); assert.equal(writes, 2);
  const failedFlush = createCourierPositionWriteBehind({ setPosition: async () => ({ state: 'stored', accepted: true, position: { lat: 9, lng: 10, at: newer }, flushOwnerToken: 'owner' }), persistNewestPosition: async () => { throw new Error('pg down'); }, releaseFlushClaim: async () => { releases++; }, log: () => null });
  assert.equal((await failedFlush({ courierId: 'c', lat: 1, lng: 2, at: pgAt })).pgWrite, 'failed-best-effort'); await new Promise((resolve) => setImmediate(resolve)); assert.equal(releases, 1);
  console.log('courier live position contracts: newest-wins, fallback, batch and write-behind OK');
}

main().catch((error) => { console.error(error); process.exit(1); });
