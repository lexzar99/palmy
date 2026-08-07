export interface DashboardTrendDay {
  date: string;
  label: string;
}

export interface DashboardTrendOrder {
  date: string;
  netSalesOre: number;
}

export interface DashboardTrendPoint extends DashboardTrendDay {
  netSalesOre: number;
  orders: number;
}

/**
 * Aggregate only the explicitly supplied calendar days. The overview route
 * supplies today and the six preceding Stockholm days, so future dates can
 * never leak into the chart even though the accounting period continues.
 */
export function buildDashboardTrend(
  days: readonly DashboardTrendDay[],
  orders: readonly DashboardTrendOrder[],
): DashboardTrendPoint[] {
  const buckets = new Map(days.map((day) => [day.date, { ...day, netSalesOre: 0, orders: 0 }]));

  for (const order of orders) {
    const bucket = buckets.get(order.date);
    const amount = Math.max(0, Math.round(Number(order.netSalesOre) || 0));
    if (!bucket || amount <= 0) continue;
    bucket.netSalesOre += amount;
    bucket.orders += 1;
  }

  return days.map((day) => buckets.get(day.date)!);
}

export type DashboardActionSeverity = 'high' | 'medium' | 'info';
export type DashboardActionKind =
  | 'closed-with-live-orders'
  | 'pending-orders'
  | 'closed-during-hours'
  | 'missing-hours';

export interface DashboardRestaurantSignal {
  id: string;
  name: string;
  isOpen: boolean;
  scheduledOpenNow: boolean;
  hasHours: boolean;
  liveOrders: number;
  pendingOrders: number;
}

export interface DashboardOverviewAction {
  id: string;
  kind: DashboardActionKind;
  severity: DashboardActionSeverity;
  restaurantId: string;
  title: string;
  detail: string;
  href: string;
}

const severityRank: Record<DashboardActionSeverity, number> = {
  high: 3,
  medium: 2,
  info: 1,
};

/** One actionable row per restaurant, even when several signals overlap. */
export function buildDashboardActions(
  restaurants: readonly DashboardRestaurantSignal[],
  limit = 8,
): DashboardOverviewAction[] {
  return restaurants
    .flatMap((restaurant): DashboardOverviewAction[] => {
      const details: string[] = [];
      let kind: DashboardActionKind | null = null;
      let severity: DashboardActionSeverity = 'info';

      if (!restaurant.isOpen && restaurant.liveOrders > 0) {
        kind = 'closed-with-live-orders';
        severity = 'high';
        details.push(`${restaurant.liveOrders} aktiva ${restaurant.liveOrders === 1 ? 'order' : 'ordrar'} medan restaurangen är stängd`);
      }
      if (restaurant.pendingOrders > 0) {
        if (!kind) kind = 'pending-orders';
        severity = 'high';
        details.push(`${restaurant.pendingOrders} ${restaurant.pendingOrders === 1 ? 'order väntar' : 'ordrar väntar'} på svar`);
      }
      if (restaurant.scheduledOpenNow && !restaurant.isOpen && restaurant.liveOrders === 0) {
        if (!kind) kind = 'closed-during-hours';
        if (severity !== 'high') severity = 'medium';
        details.push('stängd under schemalagd öppettid');
      }
      if (!restaurant.hasHours) {
        if (!kind) kind = 'missing-hours';
        details.push('öppettider saknas');
      }

      if (!kind || details.length === 0) return [];
      const orderAction = restaurant.liveOrders > 0 || restaurant.pendingOrders > 0;
      return [{
        id: `restaurant-${restaurant.id}`,
        kind,
        severity,
        restaurantId: restaurant.id,
        title: restaurant.name,
        detail: details.join(' · '),
        href: orderAction ? '/orders' : `/restaurants/${restaurant.id}`,
      }];
    })
    .sort((left, right) => {
      const severity = severityRank[right.severity] - severityRank[left.severity];
      if (severity !== 0) return severity;
      return left.title.localeCompare(right.title, 'sv');
    })
    .slice(0, Math.max(0, limit));
}
