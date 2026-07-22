import prisma from './prisma';
import { getCourierPosition, getCourierPositions, releasePositionFlushClaim, setCourierPosition, type CourierPosition, type LiveRead, type BatchLiveRead, type PositionWriteResult } from './liveState';

type PositionSnapshot = { currentLat: number | null; currentLng: number | null; lastSeenAt: Date | null };
type CourierWithId = { id: string; [key: string]: any };

const positionSelect = { currentLat: true, currentLng: true, lastSeenAt: true } as const;

function hasPgPosition(value: any): value is PositionSnapshot {
  return value != null && ['currentLat', 'currentLng', 'lastSeenAt'].every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function validPosition(position: CourierPosition): boolean {
  return Number.isFinite(position.lat) && Number.isFinite(position.lng) && Number.isFinite(position.at.getTime()) && position.lat >= -90 && position.lat <= 90 && position.lng >= -180 && position.lng <= 180;
}

export function chooseNewestCourierPosition<T extends CourierWithId>(courier: T, live: LiveRead<CourierPosition>, pg: PositionSnapshot): T & PositionSnapshot {
  const pgAt = pg.lastSeenAt instanceof Date && Number.isFinite(pg.lastSeenAt.getTime()) ? pg.lastSeenAt : null;
  const useLive = live.state === 'hit' && validPosition(live.value) && (!pgAt || live.value.at.getTime() > pgAt.getTime());
  const position = useLive
    ? { currentLat: live.value.lat, currentLng: live.value.lng, lastSeenAt: live.value.at }
    : { currentLat: pg.currentLat, currentLng: pg.currentLng, lastSeenAt: pg.lastSeenAt };
  return { ...courier, ...position };
}

export function createCourierLivePosition(options: {
  prisma?: any;
  getCourierPosition?: (courierId: string) => Promise<LiveRead<CourierPosition>>;
  getCourierPositions?: (courierIds: string[]) => Promise<BatchLiveRead<CourierPosition>>;
} = {}) {
  const db = options.prisma ?? prisma;
  const readOne = options.getCourierPosition ?? getCourierPosition;
  const readMany = options.getCourierPositions ?? getCourierPositions;

  const overlayCourier = async <T extends CourierWithId>(courier: T): Promise<T & PositionSnapshot> => {
    const pgPromise: Promise<PositionSnapshot> = hasPgPosition(courier)
      ? Promise.resolve({ currentLat: courier.currentLat, currentLng: courier.currentLng, lastSeenAt: courier.lastSeenAt })
      : db.courier.findUnique({ where: { id: courier.id }, select: positionSelect }).then((value: PositionSnapshot | null) => value ?? { currentLat: null, currentLng: null, lastSeenAt: null });
    const [pg, live] = await Promise.all([pgPromise, readOne(courier.id)]);
    return chooseNewestCourierPosition(courier, live, pg);
  };

  const overlayCouriers = async <T extends CourierWithId>(couriers: T[]): Promise<Array<T & PositionSnapshot>> => {
    if (couriers.length === 0) return [];
    const missing = couriers.filter((courier) => !hasPgPosition(courier));
    const pgPromise: Promise<Map<string, PositionSnapshot>> = missing.length === 0
      ? Promise.resolve(new Map(couriers.map((courier) => [courier.id, { currentLat: courier.currentLat, currentLng: courier.currentLng, lastSeenAt: courier.lastSeenAt }])))
      : db.courier.findMany({ where: { id: { in: missing.map((courier) => courier.id) } }, select: { id: true, ...positionSelect } }).then((rows: any[]) => {
        const values = new Map<string, PositionSnapshot>();
        couriers.filter((courier) => hasPgPosition(courier)).forEach((courier) => values.set(courier.id, { currentLat: courier.currentLat, currentLng: courier.currentLng, lastSeenAt: courier.lastSeenAt }));
        rows.forEach((row) => values.set(row.id, row));
        return values;
      });
    const [pgById, live] = await Promise.all([pgPromise, readMany(couriers.map((courier) => courier.id))]);
    return couriers.map((courier) => chooseNewestCourierPosition(courier, live.state === 'ok' && live.values.has(courier.id) ? { state: 'hit', value: live.values.get(courier.id)! } : live.state === 'ok' ? { state: 'miss' } : live, pgById.get(courier.id) ?? { currentLat: null, currentLng: null, lastSeenAt: null }));
  };

  const persistNewestPosition = async (courierId: string, position: CourierPosition): Promise<PositionSnapshot> => {
    const written = await db.courier.updateMany({
      where: { id: courierId, OR: [{ lastSeenAt: null }, { lastSeenAt: { lte: position.at } }] },
      data: { currentLat: position.lat, currentLng: position.lng, lastSeenAt: position.at },
    });
    if (written.count === 1) return { currentLat: position.lat, currentLng: position.lng, lastSeenAt: position.at };
    return (await db.courier.findUnique({ where: { id: courierId }, select: positionSelect })) ?? { currentLat: null, currentLng: null, lastSeenAt: null };
  };

  return { overlayCourier, overlayCouriers, persistNewestPosition };
}

const singleton = createCourierLivePosition();
export const overlayCourierLivePosition = singleton.overlayCourier;
export const overlayCourierLivePositions = singleton.overlayCouriers;
export const persistNewestCourierPosition = singleton.persistNewestPosition;

/** The route uses this small orchestrator so write-behind semantics are testable without Express. */
export function createCourierPositionWriteBehind(options: {
  setPosition?: (input: { courierId: string; lat: number; lng: number; at: Date }) => Promise<PositionWriteResult>;
  persistNewestPosition?: (courierId: string, position: CourierPosition) => Promise<PositionSnapshot>;
  releaseFlushClaim?: (courierId: string, ownerToken: string) => Promise<unknown>;
  log?: (message: string) => void;
} = {}) {
  const setPosition = options.setPosition ?? setCourierPosition;
  const persistNewestPosition = options.persistNewestPosition ?? persistNewestCourierPosition;
  const releaseFlushClaim = options.releaseFlushClaim ?? releasePositionFlushClaim;
  const log = options.log ?? ((message: string) => console.warn(message));
  return async (input: { courierId: string; lat: number; lng: number; at: Date }) => {
    const attempted = await setPosition(input);
    if (attempted.state === 'stored') {
      if (attempted.accepted && attempted.flushOwnerToken) {
        try {
          await persistNewestPosition(input.courierId, attempted.position);
        } catch (error) {
          log(`[courier] periodic position flush failed: ${(error as Error)?.message ?? String(error)}`);
          void releaseFlushClaim(input.courierId, attempted.flushOwnerToken).catch(() => null);
          return { position: attempted.position, pgWrite: 'failed-best-effort' as const };
        }
        return { position: attempted.position, pgWrite: 'flushed' as const };
      }
      return { position: attempted.position, pgWrite: 'skipped' as const };
    }
    // In disabled/unavailable mode the PostgreSQL write is the request's
    // durability guarantee; let its error preserve the established 500 path.
    const persisted = await persistNewestPosition(input.courierId, input);
    const position = Number.isFinite(persisted.currentLat) && Number.isFinite(persisted.currentLng) && persisted.lastSeenAt
      ? { lat: persisted.currentLat, lng: persisted.currentLng, at: persisted.lastSeenAt }
      : input;
    return { position, pgWrite: 'fallback' as const };
  };
}

export const writeCourierPositionWithFallback = createCourierPositionWriteBehind();
