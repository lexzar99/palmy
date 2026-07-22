import { getOrderEta, getOrderEtas } from './liveState';
import type { OrderEtaSnapshot } from './orderEta';

function canOverlay(order: any): order is { id: string; status: string; updatedAt: Date } {
  return Boolean(order?.id && typeof order.status === 'string' && order.updatedAt instanceof Date && Number.isFinite(order.updatedAt.getTime()));
}

export function applyLiveEta<T extends object>(order: T, eta: OrderEtaSnapshot | null): T {
  return eta ? { ...order, ...eta } : { ...order };
}

export async function overlayOrderLiveEta<T extends object>(order: T): Promise<T> {
  if (!canOverlay(order)) return { ...order };
  const live = await getOrderEta(order);
  return applyLiveEta(order, live.state === 'hit' ? live.value : null);
}

export async function overlayOrderLiveEtas<T extends object>(orders: T[]): Promise<T[]> {
  const eligible = orders.filter(canOverlay);
  if (eligible.length === 0) return orders.map((order) => ({ ...order }));
  const live = await getOrderEtas(eligible as Array<{ id: string; status: string; updatedAt: Date }>);
  return orders.map((order) => applyLiveEta(order, canOverlay(order) && live.state === 'ok' ? live.values.get(order.id) ?? null : null));
}
