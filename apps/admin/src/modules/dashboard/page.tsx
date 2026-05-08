"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  CircleCheckBig,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  dashboardQueryKey,
  getControlCenter,
  getSystemHealth,
  healthQueryKey,
  updateRestaurantLiveState,
} from "@/modules/dashboard/api";
import {
  Badge,
  Button,
  ErrorPanel,
  MetricCard,
  PageHeader,
  Surface,
} from "@/shared/components/ui";
import {
  formatCurrency,
  formatNumber,
  orderStatusLabel,
  orderStatusTone,
} from "@/shared/utils/format";

function useLocalBool(key: string, defaultValue: boolean) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? stored === "true" : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const toggle = () =>
    setValue((current) => {
      const next = !current;
      try {
        localStorage.setItem(key, String(next));
      } catch {}
      return next;
    });

  return [value, toggle] as const;
}

export function DashboardPage() {
  const queryClient = useQueryClient();
  const [showMoreInsights, toggleMoreInsights] = useLocalBool(
    "dashboard_more_insights",
    false,
  );

  const controlCenter = useQuery({
    queryKey: dashboardQueryKey,
    queryFn: getControlCenter,
  });
  const health = useQuery({
    queryKey: healthQueryKey,
    queryFn: getSystemHealth,
    refetchInterval: 30_000,
  });

  const toggleRestaurant = useMutation({
    mutationFn: ({
      restaurantId,
      isOpen,
    }: {
      restaurantId: string;
      isOpen: boolean;
    }) => updateRestaurantLiveState(restaurantId, isOpen),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["restaurants"] });
    },
  });

  if (controlCenter.isLoading || health.isLoading) {
    return (
      <div className="page-stack">
        <PageHeader title="Dashboard" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="metric-card h-[76px] animate-pulse" />
          ))}
        </div>
        <div className="surface h-[160px] animate-pulse" />
      </div>
    );
  }

  if (
    controlCenter.isError ||
    health.isError ||
    !controlCenter.data ||
    !health.data
  ) {
    return (
      <div className="page-stack">
        <PageHeader title="Dashboard" />
        <ErrorPanel
          title="Dashboard kunde inte laddas"
          action={
            <Button
              onClick={() => {
                void controlCenter.refetch();
                void health.refetch();
              }}
            >
              <RefreshCw size={13} /> Försök igen
            </Button>
          }
        />
      </div>
    );
  }

  const data = controlCenter.data;
  const healthData = health.data;

  const attentionRestaurants = data.restaurantSnapshots
    .filter(
      (r) =>
        r.pendingOrders > 0 || !r.hasHours || r.reviewScore < 4.2,
    )
    .slice(0, 8);

  const actionRestaurants = data.restaurantSnapshots.slice(0, 8);

  const criticalAlerts = data.alerts.filter(
    (a) => a.severity === "high" || a.severity === "medium",
  );

  return (
    <div className="page-stack">
      {/* ── Header ── */}
      <PageHeader
        title="Dashboard"
        actions={
          <>
            <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
              Live
            </span>
            <Button
              variant="secondary"
              onClick={() => {
                void controlCenter.refetch();
                void health.refetch();
              }}
            >
              <RefreshCw size={13} /> Refresh
            </Button>
          </>
        }
      />

      {/* ── 3 key metrics ── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Live orders"
          value={formatNumber(data.summary.liveOrders)}
          detail={`${formatNumber(healthData.operations.pendingOrders)} pending`}
        />
        <MetricCard
          label="Restaurants open"
          value={`${formatNumber(data.summary.openRestaurants)} / ${formatNumber(data.summary.totalRestaurants)}`}
          detail="Manual + schema"
        />
        <MetricCard
          label="Needs attention"
          value={formatNumber(attentionRestaurants.length)}
          detail={
            criticalAlerts.length > 0
              ? `${criticalAlerts.length} aktiva alerts`
              : "Allt ser bra ut"
          }
        />
      </div>

      {/* ── Critical alerts — only shown if any ── */}
      {criticalAlerts.length > 0 ? (
        <Surface className="px-5 py-4">
          <p className="eyebrow mb-3">Alerts</p>
          <div className="grid gap-1.5">
            {criticalAlerts.map((alert) => (
              <div
                key={alert.id}
                className="surface-muted flex items-start gap-3 px-3 py-2.5"
              >
                <AlertCircle
                  size={13}
                  className="mt-0.5 flex-shrink-0 text-[var(--danger)]"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{alert.title}</p>
                  <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                    {alert.description}
                  </p>
                </div>
                <Badge
                  tone={alert.severity === "high" ? "danger" : "warning"}
                >
                  {alert.severity}
                </Badge>
              </div>
            ))}
          </div>
        </Surface>
      ) : null}

      {/* ── Restaurant quick toggles ── */}
      <Surface className="px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Open / Pause
          </p>
          {toggleRestaurant.isPending ? (
            <Loader2
              size={13}
              className="animate-spin text-[var(--accent-strong)]"
            />
          ) : null}
        </div>
        <div className="grid gap-1">
          {actionRestaurants.map((restaurant) => (
            <div
              key={restaurant.id}
              className="surface-muted flex items-center gap-3 px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">
                    {restaurant.name}
                  </span>
                  <Badge tone={restaurant.isOpen ? "success" : "neutral"}>
                    {restaurant.isOpen ? "Open" : "Closed"}
                  </Badge>
                  {restaurant.pendingOrders > 0 ? (
                    <Badge tone="warning">{restaurant.pendingOrders}</Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {restaurant.city || "–"} · ETA {restaurant.etaMinutes} min
                </p>
              </div>
              <Button
                variant={restaurant.isOpen ? "danger" : "primary"}
                onClick={() =>
                  toggleRestaurant.mutate({
                    restaurantId: restaurant.id,
                    isOpen: !restaurant.manualIsOpen,
                  })
                }
              >
                {restaurant.isOpen ? "Pause" : "Open"}
              </Button>
            </div>
          ))}
        </div>
      </Surface>

      {/* ── Needs attention ── */}
      {attentionRestaurants.length > 0 ? (
        <Surface className="px-5 py-4">
          <div className="mb-3 flex items-center gap-2">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Needs attention
            </p>
            <Badge tone="warning">{attentionRestaurants.length}</Badge>
          </div>
          <div className="grid gap-1">
            {attentionRestaurants.map((restaurant) => (
              <div
                key={restaurant.id}
                className="surface-muted flex items-center gap-2 px-3 py-2"
              >
                <span className="flex-1 min-w-0 truncate text-sm font-semibold">
                  {restaurant.name}
                </span>
                <div className="flex flex-shrink-0 flex-wrap gap-1.5">
                  {restaurant.pendingOrders > 0 ? (
                    <Badge tone="warning">
                      {restaurant.pendingOrders} pending
                    </Badge>
                  ) : null}
                  {!restaurant.hasHours ? (
                    <Badge tone="danger">No hours</Badge>
                  ) : null}
                  {restaurant.reviewScore < 4.2 ? (
                    <Badge tone="neutral">
                      {restaurant.reviewScore.toFixed(1)} ★
                    </Badge>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Surface>
      ) : null}

      {/* ── More insights toggle ── */}
      <button
        type="button"
        onClick={toggleMoreInsights}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-subtle)] py-2 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:bg-[rgba(255,255,255,0.03)] hover:text-[var(--text-secondary)]"
      >
        {showMoreInsights ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        {showMoreInsights ? "Dölj mer" : "Mer statistik"}
      </button>

      {/* ── Extended insights — progressively disclosed ── */}
      {showMoreInsights ? (
        <>
          {/* Finance metrics */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Revenue today"
              value={formatCurrency(data.summary.todayRevenue)}
              detail={`${formatNumber(data.summary.todayOrders)} orders`}
            />
            <MetricCard
              label="Payout exposure"
              value={formatCurrency(data.summary.monthlyPayoutExposure)}
            />
            <MetricCard
              label="Avg ticket"
              value={formatCurrency(data.summary.avgTicket)}
            />
            <MetricCard
              label="DB latency"
              value={`${healthData.dbPingMs} ms`}
              detail={healthData.status}
            />
          </div>

          {/* Order status mix */}
          <Surface className="px-5 py-4">
            <p className="eyebrow mb-3">Order status mix</p>
            <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
              {Object.entries(data.liveStatusCounts).map(([status, count]) => (
                <div
                  key={status}
                  className="surface-muted flex items-center justify-between px-3 py-2"
                >
                  <Badge
                    tone={
                      orderStatusTone(status) as
                        | "success"
                        | "danger"
                        | "warning"
                        | "info"
                        | "neutral"
                    }
                  >
                    {orderStatusLabel(status)}
                  </Badge>
                  <span className="text-base font-bold">
                    {formatNumber(count)}
                  </span>
                </div>
              ))}
            </div>
          </Surface>

          {/* System health */}
          <Surface className="px-5 py-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="eyebrow">System health</p>
              <Badge
                tone={healthData.status === "ONLINE" ? "success" : "danger"}
              >
                {healthData.status}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={healthData.services.auth ? "success" : "danger"}>
                Auth
              </Badge>
              <Badge
                tone={healthData.services.realtime ? "success" : "danger"}
              >
                Realtime
              </Badge>
              <Badge
                tone={healthData.services.uploads ? "success" : "warning"}
              >
                Uploads
              </Badge>
            </div>
            {healthData.alerts.length > 0 ? (
              <div className="mt-3 grid gap-1">
                {healthData.alerts.map((alert, i) => (
                  <div
                    key={i}
                    className="surface-muted flex items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)]"
                  >
                    {alert.level === "warning" ? (
                      <AlertCircle
                        size={11}
                        className="flex-shrink-0 text-[var(--warning)]"
                      />
                    ) : (
                      <CircleCheckBig
                        size={11}
                        className="flex-shrink-0 text-[var(--success)]"
                      />
                    )}
                    {alert.message}
                  </div>
                ))}
              </div>
            ) : null}
          </Surface>

          {/* Payment mix + top products */}
          <div className="grid gap-3 xl:grid-cols-2">
            <Surface className="px-5 py-4">
              <p className="eyebrow mb-3">Payment mix</p>
              <div className="grid gap-1">
                {data.paymentMix.map((entry) => (
                  <div
                    key={entry.method}
                    className="surface-muted flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <span className="font-semibold">{entry.method}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[var(--text-muted)]">
                        {formatNumber(entry.count)}×
                      </span>
                      <span className="font-semibold">
                        {formatCurrency(entry.revenue)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Surface>

            <Surface className="px-5 py-4">
              <p className="eyebrow mb-3">Top products</p>
              <div className="grid gap-1">
                {data.topProducts.map((product, i) => (
                  <div
                    key={`${product.name}-${i}`}
                    className="surface-muted flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {product.name}
                    </span>
                    <div className="flex flex-shrink-0 items-center gap-3">
                      <span className="text-xs text-[var(--text-muted)]">
                        {formatNumber(product.count)} sold
                      </span>
                      <span className="font-semibold">
                        {formatCurrency(product.revenue)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Surface>
          </div>
        </>
      ) : null}
    </div>
  );
}
