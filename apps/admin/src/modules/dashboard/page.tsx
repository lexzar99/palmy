"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronDown, ChevronUp, CircleCheckBig, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { dashboardQueryKey, getControlCenter, getSystemHealth, healthQueryKey, updateRestaurantLiveState } from "@/modules/dashboard/api";
import { Badge, Button, ErrorPanel, MetricCard, PageHeader, Surface } from "@/shared/components/ui";
import { formatCurrency, formatNumber, orderStatusLabel, orderStatusTone } from "@/shared/utils/format";

function useLocalBool(key: string, defaultValue: boolean) {
  const [value, setValue] = useState(() => {
    try { const s = localStorage.getItem(key); return s !== null ? s === "true" : defaultValue; } catch { return defaultValue; }
  });
  const toggle = () => setValue((prev) => { const next = !prev; try { localStorage.setItem(key, String(next)); } catch {} return next; });
  return [value, toggle] as const;
}

export function DashboardPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [showMore, toggleMore] = useLocalBool("dashboard_more", false);

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
    return (
      <div className="page-stack">
        <PageHeader title="Dashboard" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="metric-card h-[72px] animate-pulse" />)}
        </div>
        <div className="surface h-48 animate-pulse" />
      </div>
    );
  }

  if (controlCenter.isError || health.isError || !controlCenter.data || !health.data) {
    return (
      <div className="page-stack">
        <PageHeader title="Dashboard" />
        <ErrorPanel title="Kunde inte ladda dashboard" action={<Button onClick={() => { void controlCenter.refetch(); void health.refetch(); }}><RefreshCw size={13} /> Försök igen</Button>} />
      </div>
    );
  }

  const data = controlCenter.data;
  const healthData = health.data;
  const attentionList = data.restaurantSnapshots.filter((r) => r.pendingOrders > 0 || !r.hasHours || r.reviewScore < 4.2);
  const criticalAlerts = data.alerts.filter((a) => a.severity === "high" || a.severity === "medium");

  return (
    <div className="page-stack">
      <PageHeader
        title="Dashboard"
        actions={
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" /> Live
            </span>
            <Button variant="secondary" onClick={() => { void controlCenter.refetch(); void health.refetch(); }}><RefreshCw size={13} /></Button>
          </div>
        }
      />

      {/* Top metrics */}
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Live ordrar" value={formatNumber(data.summary.liveOrders)} detail={`${formatNumber(healthData.operations.pendingOrders)} väntande`} />
        <MetricCard label="Restauranger öppna" value={`${formatNumber(data.summary.openRestaurants)} / ${formatNumber(data.summary.totalRestaurants)}`} />
        <MetricCard label="Kräver åtgärd" value={formatNumber(attentionList.length)} detail={criticalAlerts.length > 0 ? `${criticalAlerts.length} alerts` : "Allt klart"} />
      </div>

      {/* Restaurant controls */}
      <Surface className="px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Restauranger — öppna/stäng</p>
          {toggleRestaurant.isPending && <Loader2 size={13} className="animate-spin text-[var(--accent)]" />}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {data.restaurantSnapshots.map((r) => (
            <div key={r.id} className="surface-muted flex items-center gap-3 px-4 py-3 rounded-xl">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${r.isOpen ? "bg-emerald-500" : "bg-[var(--text-muted)]"}`} />
                  <span className="truncate text-sm font-semibold">{r.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 ml-4">
                  {r.pendingOrders > 0 && <span className="text-xs text-amber-400 font-semibold">{r.pendingOrders} väntande</span>}
                  {r.liveOrders > 0 && <span className="text-xs text-[var(--text-muted)]">{r.liveOrders} live</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => router.push(`/restaurants/${r.id}`)}
                  className="rounded-lg border border-[var(--border-subtle)] p-1.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                  title="Öppna restaurangsidan"
                >
                  <ExternalLink size={12} />
                </button>
                <Button
                  variant={r.isOpen ? "danger" : "primary"}
                  onClick={() => toggleRestaurant.mutate({ restaurantId: r.id, isOpen: !r.manualIsOpen })}
                >
                  {r.isOpen ? "Stäng" : "Öppna"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Surface>

      {/* More toggle */}
      <button
        type="button"
        onClick={toggleMore}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] py-2.5 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:bg-[rgba(255,255,255,0.03)] hover:text-[var(--text-secondary)]"
      >
        {showMore ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        {showMore ? "Dölj statistik" : "Mer statistik"}
      </button>

      {showMore && (
        <>
          {criticalAlerts.length > 0 && (
            <Surface className="px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">Alerts</p>
              <div className="grid gap-2">
                {criticalAlerts.map((alert) => (
                  <div key={alert.id} className="surface-muted flex items-start gap-2.5 px-4 py-3">
                    <AlertCircle size={13} className="mt-0.5 shrink-0 text-[var(--danger)]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{alert.title}</p>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{alert.description}</p>
                    </div>
                    <Badge tone={alert.severity === "high" ? "danger" : "warning"}>{alert.severity}</Badge>
                  </div>
                ))}
              </div>
            </Surface>
          )}

          {attentionList.length > 0 && (
            <Surface className="px-6 py-5">
              <div className="flex items-center gap-2 mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Kräver åtgärd</p>
                <Badge tone="warning">{attentionList.length}</Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {attentionList.map((r) => (
                  <button key={r.id} type="button" onClick={() => router.push(`/restaurants/${r.id}`)} className="surface-muted flex items-center gap-3 px-4 py-3 text-left hover:brightness-110 transition-all">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{r.name}</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {r.pendingOrders > 0 && <Badge tone="warning">{r.pendingOrders} väntande</Badge>}
                      {!r.hasHours && <Badge tone="danger">Inga öppettider</Badge>}
                      {r.reviewScore < 4.2 && <Badge tone="neutral">{r.reviewScore.toFixed(1)} ★</Badge>}
                    </div>
                  </button>
                ))}
              </div>
            </Surface>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Intäkt idag" value={formatCurrency(data.summary.todayRevenue)} detail={`${formatNumber(data.summary.todayOrders)} ordrar`} />
            <MetricCard label="Utbetalning (månad)" value={formatCurrency(data.summary.monthlyPayoutExposure)} />
            <MetricCard label="Snittorder" value={formatCurrency(data.summary.avgTicket)} />
            <MetricCard label="DB-latens" value={`${healthData.dbPingMs} ms`} detail={healthData.status} />
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <Surface className="px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">Orderstatus</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {Object.entries(data.liveStatusCounts).map(([status, count]) => (
                  <div key={status} className="surface-muted flex items-center justify-between px-4 py-2.5">
                    <Badge tone={orderStatusTone(status) as any}>{orderStatusLabel(status)}</Badge>
                    <span className="text-base font-bold">{formatNumber(count)}</span>
                  </div>
                ))}
              </div>
            </Surface>

            <Surface className="px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">Topprodukter</p>
              <div className="grid gap-1.5">
                {data.topProducts.map((p, i) => (
                  <div key={`${p.name}-${i}`} className="surface-muted flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                    <div className="flex shrink-0 gap-3">
                      <span className="text-xs text-[var(--text-muted)]">{formatNumber(p.count)}×</span>
                      <span className="font-semibold">{formatCurrency(p.revenue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Surface>
          </div>

          <Surface className="px-6 py-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Systemstatus</p>
              <Badge tone={healthData.status === "ONLINE" ? "success" : "danger"}>{healthData.status}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={healthData.services.auth ? "success" : "danger"}>Auth</Badge>
              <Badge tone={healthData.services.realtime ? "success" : "danger"}>Realtime</Badge>
              <Badge tone={healthData.services.uploads ? "success" : "warning"}>Uploads</Badge>
            </div>
            {healthData.alerts.length > 0 && (
              <div className="mt-3 grid gap-1">
                {healthData.alerts.map((alert, i) => (
                  <div key={i} className="surface-muted flex items-center gap-2 px-4 py-2 text-xs text-[var(--text-secondary)]">
                    {alert.level === "warning" ? <AlertCircle size={11} className="shrink-0 text-[var(--warning)]" /> : <CircleCheckBig size={11} className="shrink-0 text-[var(--success)]" />}
                    {alert.message}
                  </div>
                ))}
              </div>
            )}
          </Surface>
        </>
      )}
    </div>
  );
}
