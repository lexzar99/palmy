"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, ArrowUpRight, CircleCheckBig, Database, Loader2, RefreshCw, Store, Wallet, Wifi } from "lucide-react";
import { dashboardQueryKey, getControlCenter, getSystemHealth, healthQueryKey, updateRestaurantLiveState } from "@/modules/dashboard/api";
import { Badge, Button, ErrorPanel, MetricCard, SectionHeader, Surface } from "@/shared/components/ui";
import { formatCurrency, formatDateTime, formatNumber, orderStatusLabel, orderStatusTone } from "@/shared/utils/format";

export function DashboardPage() {
  const queryClient = useQueryClient();
  const controlCenter = useQuery({ queryKey: dashboardQueryKey, queryFn: getControlCenter });
  const health = useQuery({ queryKey: healthQueryKey, queryFn: getSystemHealth, refetchInterval: 30_000 });

  const toggleRestaurant = useMutation({
    mutationFn: ({ restaurantId, isOpen }: { restaurantId: string; isOpen: boolean }) => updateRestaurantLiveState(restaurantId, isOpen),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["restaurants"] });
    },
  });

  if (controlCenter.isLoading || health.isLoading) {
    return <div className="space-y-6"><Surface className="px-6 py-6"><SectionHeader eyebrow="Dashboard" title="Loading control center" description="Fetching live platform metrics and system health." /></Surface><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="metric-card h-[148px] animate-pulse" />)}</div></div>;
  }

  if (controlCenter.isError || health.isError || !controlCenter.data || !health.data) {
    return (
      <ErrorPanel
        title="Dashboard could not be loaded"
        description="The control center or health endpoint did not respond as expected."
        action={
          <Button
            onClick={() => {
              void controlCenter.refetch();
              void health.refetch();
            }}
          >
            <RefreshCw size={16} /> Try again
          </Button>
        }
      />
    );
  }

  const data = controlCenter.data;
  const healthData = health.data;
  const actionRestaurants = data.restaurantSnapshots.slice(0, 6);
  const attentionRestaurants = data.restaurantSnapshots
    .filter((restaurant) => restaurant.pendingOrders > 0 || !restaurant.hasHours || restaurant.reviewScore < 4.2)
    .slice(0, 8);

  return (
    <div className="page-stack">
      <Surface className="px-6 py-6">
        <SectionHeader
          eyebrow="Dashboard"
          title="Platform overview"
          description="Live order flow, active partners, payout exposure and system status in one control view."
          actions={
            <>
              <Badge tone="success">
                <Wifi size={12} /> Realtime connected
              </Badge>
              <Button
                onClick={() => {
                  void controlCenter.refetch();
                  void health.refetch();
                }}
              >
                <RefreshCw size={16} /> Refresh
              </Button>
            </>
          }
        />
      </Surface>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Revenue today" value={formatCurrency(data.summary.todayRevenue)} detail={`${formatNumber(data.summary.todayOrders)} orders`} />
        <MetricCard label="Live orders" value={formatNumber(data.summary.liveOrders)} detail={`${formatNumber(healthData.operations.pendingOrders)} pending`} />
        <MetricCard label="Restaurants open" value={`${formatNumber(data.summary.openRestaurants)}/${formatNumber(data.summary.totalRestaurants)}`} detail="Manual status and schedule combined" />
        <MetricCard label="Payout exposure" value={formatCurrency(data.summary.monthlyPayoutExposure)} detail={`Average ticket ${formatCurrency(data.summary.avgTicket)}`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.95fr]">
        <Surface className="px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Live status mix</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">Order pressure by state</h2>
            </div>
            <Badge tone={healthData.dbPingMs > 350 ? "warning" : "success"}>
              <Database size={12} /> DB {healthData.dbPingMs} ms
            </Badge>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Object.entries(data.liveStatusCounts).map(([status, count]) => (
              <div key={status} className="surface-muted px-4 py-4">
                <Badge tone={orderStatusTone(status) as "success" | "danger" | "warning" | "info" | "neutral"}>{orderStatusLabel(status)}</Badge>
                <div className="mt-4 text-3xl font-black tracking-[-0.04em]">{formatNumber(count)}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-3">
            {data.alerts.slice(0, 5).map((alert) => (
              <div key={alert.id} className="surface-muted px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <Badge tone={alert.severity === "high" ? "danger" : alert.severity === "medium" ? "warning" : "info"}>{alert.domain}</Badge>
                  <span className="text-[11px] font-semibold text-[var(--text-muted)]">{alert.severity}</span>
                </div>
                <p className="mt-3 text-base font-black tracking-[-0.02em]">{alert.title}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{alert.description}</p>
              </div>
            ))}
          </div>
        </Surface>

        <Surface className="px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">System health</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">API and runtime status</h2>
            </div>
            <Badge tone={healthData.status === "ONLINE" ? "success" : "danger"}>{healthData.status}</Badge>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="surface-muted px-4 py-4">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">Services</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone={healthData.services.auth ? "success" : "danger"}>Auth</Badge>
                <Badge tone={healthData.services.realtime ? "success" : "danger"}>Realtime</Badge>
                <Badge tone={healthData.services.uploads ? "success" : "warning"}>Uploads</Badge>
              </div>
            </div>
            <div className="surface-muted px-4 py-4">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">Operations</p>
              <div className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
                <div>{formatNumber(healthData.operations.restaurantCount)} restaurants</div>
                <div>{formatNumber(healthData.operations.userCount)} users</div>
                <div>{formatNumber(healthData.operations.liveOrders)} live orders</div>
                <div>{formatNumber(healthData.operations.payoutInReview)} payouts in review</div>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {healthData.alerts.map((alert, index) => (
              <div key={`${alert.level}-${index}`} className="surface-muted flex items-start gap-3 px-4 py-4">
                {alert.level === "warning" ? <AlertTriangle size={16} className="mt-0.5 text-[var(--warning)]" /> : <CircleCheckBig size={16} className="mt-0.5 text-[var(--success)]" />}
                <p className="text-sm leading-6 text-[var(--text-secondary)]">{alert.message}</p>
              </div>
            ))}
          </div>
        </Surface>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Surface className="px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Quick actions</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">Open or pause restaurants</h2>
            </div>
            {toggleRestaurant.isPending ? <Loader2 size={18} className="animate-spin text-[var(--accent-strong)]" /> : <Store size={18} className="text-[var(--text-muted)]" />}
          </div>

          <div className="mt-5 grid gap-3">
            {actionRestaurants.map((restaurant) => (
              <div key={restaurant.id} className="surface-muted flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-black tracking-[-0.02em]">{restaurant.name}</p>
                    <Badge tone={restaurant.isOpen ? "success" : "neutral"}>{restaurant.isOpen ? "Open" : "Closed"}</Badge>
                    <Badge tone={restaurant.pendingOrders > 0 ? "warning" : "neutral"}>{restaurant.pendingOrders} pending</Badge>
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">{restaurant.city || "No city"} • ETA {restaurant.etaMinutes} min • Updated {formatDateTime(restaurant.updatedAt)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant={restaurant.isOpen ? "danger" : "primary"}
                    onClick={() => toggleRestaurant.mutate({ restaurantId: restaurant.id, isOpen: !restaurant.manualIsOpen })}
                  >
                    {restaurant.isOpen ? "Pause" : "Open"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Surface>

        <Surface className="px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Needs attention</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">Restaurants to review</h2>
            </div>
            <Badge tone="warning">{attentionRestaurants.length}</Badge>
          </div>

          <div className="mt-5 grid gap-3">
            {attentionRestaurants.map((restaurant) => (
              <div key={restaurant.id} className="surface-muted px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-black tracking-[-0.02em]">{restaurant.name}</p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">{restaurant.city || "No city"}</p>
                  </div>
                  <ArrowUpRight size={18} className="text-[var(--text-muted)]" />
                </div>
                <div className="mt-4 grid gap-2 text-sm text-[var(--text-secondary)]">
                  <div>{restaurant.pendingOrders} pending orders</div>
                  <div>{restaurant.hasHours ? "Schedule configured" : "Missing opening hours"}</div>
                  <div>Review score {restaurant.reviewScore.toFixed(1)}</div>
                  <div>Payout estimate {formatCurrency(restaurant.payoutEstimate)}</div>
                </div>
              </div>
            ))}
          </div>
        </Surface>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Surface className="px-6 py-6">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Payment mix</p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">Recent payment distribution</h2>
          </div>

          <div className="mt-5 grid gap-3">
            {data.paymentMix.map((entry) => (
              <div key={entry.method} className="surface-muted flex items-center justify-between px-4 py-4">
                <div>
                  <p className="font-black">{entry.method}</p>
                  <p className="text-sm text-[var(--text-secondary)]">{formatNumber(entry.count)} payments</p>
                </div>
                <Wallet size={18} className="text-[var(--accent-strong)]" />
                <p className="font-black">{formatCurrency(entry.revenue)}</p>
              </div>
            ))}
          </div>
        </Surface>

        <Surface className="px-6 py-6">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Top products</p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">Best selling items</h2>
          </div>

          <div className="mt-5 grid gap-3">
            {data.topProducts.map((product, index) => (
              <div key={`${product.name}-${index}`} className="surface-muted flex items-center justify-between gap-3 px-4 py-4">
                <div>
                  <p className="font-black">{product.name}</p>
                  <p className="text-sm text-[var(--text-secondary)]">{formatNumber(product.count)} sold</p>
                </div>
                <div className="text-right">
                  <p className="font-black">{formatCurrency(product.revenue)}</p>
                  <p className="text-sm text-[var(--text-secondary)]">gross</p>
                </div>
              </div>
            ))}
          </div>
        </Surface>
      </div>
    </div>
  );
}
