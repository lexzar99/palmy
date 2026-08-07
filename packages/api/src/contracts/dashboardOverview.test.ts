import assert from 'node:assert/strict';
import { buildDashboardActions, buildDashboardTrend } from '../lib/dashboardOverview';

const days = Array.from({ length: 7 }, (_, index) => ({
  date: `2026-08-0${index + 1}`,
  label: `dag ${index + 1}`,
}));
const trend = buildDashboardTrend(days, [
  { date: '2026-08-01', netSalesOre: 10_000 },
  { date: '2026-08-01', netSalesOre: 2_500 },
  { date: '2026-08-07', netSalesOre: 7_500 },
  { date: '2026-08-08', netSalesOre: 99_999 }, // future/outside the supplied window
]);

assert.equal(trend.length, 7);
assert.deepEqual(trend[0], { date: '2026-08-01', label: 'dag 1', netSalesOre: 12_500, orders: 2 });
assert.deepEqual(trend[6], { date: '2026-08-07', label: 'dag 7', netSalesOre: 7_500, orders: 1 });
assert.equal(trend.some((point) => point.date === '2026-08-08'), false);

const actions = buildDashboardActions([
  {
    id: 'restaurant-1',
    name: 'Palmyra',
    isOpen: false,
    scheduledOpenNow: true,
    hasHours: false,
    liveOrders: 3,
    pendingOrders: 2,
  },
  {
    id: 'restaurant-2',
    name: 'Lugna köket',
    isOpen: true,
    scheduledOpenNow: true,
    hasHours: true,
    liveOrders: 0,
    pendingOrders: 0,
  },
]);

assert.equal(actions.length, 1, 'overlapping signals must produce one row per restaurant');
assert.equal(actions[0].id, 'restaurant-restaurant-1');
assert.equal(actions[0].kind, 'closed-with-live-orders');
assert.equal(actions[0].severity, 'high');
assert.match(actions[0].detail, /3 aktiva ordrar/);
assert.match(actions[0].detail, /2 ordrar väntar/);
assert.match(actions[0].detail, /öppettider saknas/);

console.log('dashboard overview trend + action contracts: ok');
