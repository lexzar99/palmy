"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronDown, ChevronUp, Loader2, RefreshCw } from "lucide-react";
import {
  dashboardQueryKey,
  getControlCenter,
  getSystemHealth,
  healthQueryKey,
  updateRestaurantLiveState,
} from "@/modules/dashboard/api";
import { Badge, Button, ErrorPanel, MetricCard, PageHeader, Surface } from "@/shared/components/ui";
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
    setValue((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(key, String(next));
      } catch {}
      return next;
    });
  return [value, toggle] as const;
}

export function DashboardPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [showMore, toggleMore] = useLocalBool("dashboard:show-more", false);

  const controlCenter = useQuery({ queryKey: dashboardQueryKey, queryFn: getControlCenter });
  const health = useQuery({
    queryKey: healthQueryKey,
    queryFn: getSystemHealth,
    refetchInterval: 30_000,
  });

  const toggleRestaurant = useMutation({
    mutationFn: ({ restaurantId, isOpen }: { restaurantId: string; isOpen: boolean }) =>
      updateRestaurantLiveState(restaurantId, isOpen),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["restaurants"] });
    },
  });

  if (controlCenter.isLoading || health.isLoading) {
    return (
      <div className="page-stack">
        <PageHeader title="Översikt" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="metric-card animate-pulse" style={{ minHeight: 140 }} />
          ))}
        </div>
      </div>
    );
  }

  if (controlCenter.isError || health.isError || !controlCenter.data || !health.data) {
    return (
      <div className="page-stack">
        <PageHeader title="Översikt" />
        <ErrorPanel
          title="Kunde inte ladda översikt"
          action={
            <Button
              variant="primary"
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

  const attentionList = data.restaurantSnapshots.filter(
    (r) => r.pendingOrders > 0 || !r.hasHours || r.reviewScore < 4.2,
  );
  const criticalAlerts = data.alerts.filter((a) => a.severity === "high" || a.severity === "medium");
  const totalAttention = attentionList.length + criticalAlerts.length;

  return (
    <div className="page-stack">
      <PageHeader
        title="Översikt"
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              void controlCenter.refetch();
              void health.refetch();
            }}
          >
            <RefreshCw size={13} /> Uppdatera
          </Button>
        }
      />

      {/* ── Three hero metrics ─────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Live ordrar"
          value={formatNumber(data.summary.liveOrders)}
          detail={
            healthData.operations.pendingOrders > 0
              ? `${formatNumber(healthData.operations.pendingOrders)} väntar accept`
              : "Inget i kö"
          }
        />
        <MetricCard
          label="Restauranger öppna"
          value={
            <>
              {formatNumber(data.summary.openRestaurants)}
              <span className="text-[var(--text-muted)] text-[26px] font-normal"> / {formatNumber(data.summary.totalRestaurants)}</span>
            </>
          }
          detail={data.summary.openRestaurants === data.summary.totalRestaurants ? "Alla igång" : `${data.summary.totalRestaurants - data.summary.openRestaurants} stängda`}
        />
        <MetricCard
          label="Kräver åtgärd"
          value={formatNumber(totalAttention)}
          detail={
            totalAttention === 0
              ? "Allt under kontroll"
              : `${attentionList.length} restauranger · ${criticalAlerts.length} alerts`
          }
        />
      </div>

      {/* ── Attention list — only if something needs action ── */}
      {totalAttention > 0 && (
        <Surface className="px-7 py-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="section-title">Vad behöver din uppmärksamhet</h2>
          </div>
          <div className="grid gap-2">
            {criticalAlerts.slice(0, 3).map((alert) => (
              <div
                key={alert.id}
                className="surface-muted flex items-start gap-3 px-5 py-4"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-[var(--danger)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{alert.title}</p>
                  <p className="mt-1 text-[13px] text-[var(--text-secondary)]">{alert.description}</p>
                </div>
                <Badge tone={alert.severity === "high" ? "danger" : "warning"}>{alert.severity}</Badge>
              </div>
            ))}
            {attentionList.slice(0, Math.max(0, 3 - criticalAlerts.length)).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => router.push(`/restaurants/${r.id}`)}
                className="surface-muted flex items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--bg-hover)]"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{r.name}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {r.pendingOrders > 0 && <Badge tone="warning">{r.pendingOrders} väntar</Badge>}
                  {!r.hasHours && <Badge tone="danger">Inga öppettider</Badge>}
                  {r.reviewScore < 4.2 && <Badge tone="neutral">{r.reviewScore.toFixed(1)} ★</Badge>}
                </div>
              </button>
            ))}
          </div>
          {totalAttention > 3 && (
            <p className="mt-4 text-[12px] text-[var(--text-muted)]">
              + {totalAttention - 3} fler — visas under &ldquo;Mer&rdquo;
            </p>
          )}
        </Surface>
      )}

      {/* ── Reveal: everything else ──────────────────── */}
      <button type="button" onClick={toggleMore} className="reveal-more">
        {showMore ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        {showMore ? "Dölj detaljer" : "Visa mer"}
      </button>

      {showMore && (
        <>
          {/* Secondary metrics */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Intäkt idag"
              value={formatCurrency(data.summary.todayRevenue)}
              detail={`${formatNumber(data.summary.todayOrders)} ordrar`}
            />
            <MetricCard
              label="Utbetalning (mån)"
              value={formatCurrency(data.summary.monthlyPayoutExposure)}
            />
            <MetricCard label="Snittorder" value={formatCurrency(data.summary.avgTicket)} />
            <MetricCard
              label="DB-latens"
              value={`${healthData.dbPingMs} ms`}
              detail={healthData.status}
            />
          </div>

          {/* Full restaurant grid */}
          <Surface className="px-7 py-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="section-title">Restauranger</h2>
              {toggleRestaurant.isPending && (
                <Loader2 size={14} className="animate-spin text-[var(--accent)]" />
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {data.restaurantSnapshots.map((r) => (
                <div
                  key={r.id}
                  className="surface-muted flex items-center gap-3 px-5 py-4"
                >
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      r.isOpen ? "bg-[var(--success)]" : "bg-[var(--text-muted)]"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{r.name}</p>
                    {(r.pendingOrders > 0 || r.liveOrders > 0) && (
                      <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                        {r.pendingOrders > 0 && <span className="text-[var(--warning)] font-semibold">{r.pendingOrders} väntar</span>}
                        {r.pendingOrders > 0 && r.liveOrders > 0 && " · "}
                        {r.liveOrders > 0 && `${r.liveOrders} live`}
                      </p>
                    )}
                  </div>
                  <Button
                    variant={r.isOpen ? "danger" : "primary"}
                    onClick={() =>
                      toggleRestaurant.mutate({
                        restaurantId: r.id,
                        isOpen: !r.manualIsOpen,
                      })
                    }
                  >
                    {r.isOpen ? "Stäng" : "Öppna"}
                  </Button>
                </div>
              ))}
            </div>
          </Surface>

          {/* Status + Top products */}
          <div className="grid gap-4 xl:grid-cols-2">
            <Surface className="px-7 py-6">
              <h2 className="section-title mb-5">Orderstatus</h2>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {Object.entries(data.liveStatusCounts).map(([status, count]) => (
                  <div
                    key={status}
                    className="surface-muted flex items-center justify-between px-4 py-3"
                  >
                    <Badge tone={orderStatusTone(status) as "neutral" | "success" | "danger" | "warning" | "info"}>
                      {orderStatusLabel(status)}
                    </Badge>
                    <span className="text-base font-semibold">{formatNumber(count)}</span>
                  </div>
                ))}
              </div>
            </Surface>

            <Surface className="px-7 py-6">
              <h2 className="section-title mb-5">Topprodukter</h2>
              <div className="grid gap-1.5">
                {data.topProducts.slice(0, 6).map((p, i) => (
                  <div
                    key={`${p.name}-${i}`}
                    className="surface-muted flex items-center justify-between px-4 py-3 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                    <div className="flex shrink-0 gap-3 text-[var(--text-secondary)]">
                      <span className="text-[12px]">{formatNumber(p.count)}×</span>
                      <span className="font-semibold text-[var(--text-primary)]">{formatCurrency(p.revenue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Surface>
          </div>

          {/* System health */}
          <Surface className="px-7 py-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">Systemstatus</h2>
              <Badge tone={healthData.status === "ONLINE" ? "success" : "danger"}>
                {healthData.status}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={healthData.services.auth ? "success" : "danger"}>Auth</Badge>
              <Badge tone={healthData.services.realtime ? "success" : "danger"}>Realtime</Badge>
              <Badge tone={healthData.services.uploads ? "success" : "warning"}>Uploads</Badge>
            </div>
          </Surface>
        </>
      )}
    </div>
  );
}
