"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronDown, ChevronUp, Loader2, RefreshCw } from "lucide-react";
import {
  dashboardQueryKey,
  customerOverviewQueryKey,
  getControlCenter,
  getCustomerOverview,
  getRestaurantRefs,
  getSystemHealth,
  healthQueryKey,
  restaurantRefsQueryKey,
  updateRestaurantLiveState,
} from "@/modules/dashboard/api";
import { TrendChart } from "@/modules/dashboard/TrendChart";
import { Badge, Button, ErrorPanel, MetricCard, PageHeader, Sparkline, Surface } from "@/shared/components/ui";
import { AcceptingOrdersModeSelect } from "@/shared/components/restaurant-availability";
import type { AcceptingOrdersMode } from "@/shared/contracts/restaurants";
import { availabilityReasonLabel } from "@/shared/contracts/restaurants";
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
  // Scope: hela dashboarden kan filtreras per restaurang (backend stödjer det
  // redan via ?restaurantId). Trendfönstret styr bara grafen.
  const [restaurantScope, setRestaurantScope] = useState<string | null>(null);
  const [trendDays, setTrendDays] = useState<7 | 30 | 90>(7);

  const controlCenter = useQuery({
    queryKey: dashboardQueryKey({ restaurantId: restaurantScope, trendDays }),
    queryFn: () => getControlCenter({ restaurantId: restaurantScope, trendDays }),
    placeholderData: (prev) => prev,
  });
  const restaurantRefs = useQuery({ queryKey: restaurantRefsQueryKey, queryFn: getRestaurantRefs });
  const health = useQuery({
    queryKey: healthQueryKey,
    queryFn: getSystemHealth,
    refetchInterval: 30_000,
  });
  const customerOverview = useQuery({
    queryKey: customerOverviewQueryKey,
    queryFn: getCustomerOverview,
    refetchInterval: 60_000,
  });

  const toggleRestaurant = useMutation({
    mutationFn: ({ restaurantId, acceptingOrdersMode }: { restaurantId: string; acceptingOrdersMode: AcceptingOrdersMode }) =>
      updateRestaurantLiveState(restaurantId, acceptingOrdersMode),
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
        breadcrumb="Drift"
        actions={
          <>
            {/* Per-restaurang-vy: scopear ALLA siffror på sidan */}
            <select
              value={restaurantScope ?? ""}
              onChange={(e) => setRestaurantScope(e.target.value || null)}
              className="h-[38px] rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-page)] px-3 text-[13px] font-semibold text-[var(--text-secondary)] outline-none transition-colors hover:border-[var(--border-strong)]"
              aria-label="Filtrera på restaurang"
            >
              <option value="">Alla restauranger</option>
              {(restaurantRefs.data || []).map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--success-soft)] px-3 py-1.5 text-[11.5px] font-extrabold text-[var(--success-text)]">
              <span className="h-[7px] w-[7px] rounded-full bg-[var(--success)]" />
              Produktion
            </span>
            <Button
              variant="secondary"
              onClick={() => {
                void controlCenter.refetch();
                void health.refetch();
              }}
            >
              <RefreshCw size={13} /> Uppdatera
            </Button>
          </>
        }
      />

      {/* ── Hero: går det bra (intäkt + live), brinner något (åtgärd) ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Intäkt idag"
          value={formatCurrency(data.summary.todayRevenue)}
          sparkline={<Sparkline points="0,22 12,18 22,20 34,12 44,14 54,9 64,4" />}
          detail={`${formatNumber(data.summary.todayOrders)} ordrar · snitt ${formatCurrency(data.summary.avgTicket)}`}
        />
        <MetricCard
          label="Live ordrar"
          value={formatNumber(data.summary.liveOrders)}
          sparkline={<Sparkline points="0,24 10,20 20,22 30,14 40,16 52,8 64,5" />}
          detail={
            healthData.operations.pendingOrders > 0 ? (
              <span className="font-bold text-[var(--accent-ink)]">{formatNumber(healthData.operations.pendingOrders)} väntar accept</span>
            ) : (
              "Inget i kö"
            )
          }
        />
        <MetricCard
          label="Restauranger öppna"
          value={
            <>
              {formatNumber(data.summary.openRestaurants)}
              <small> / {formatNumber(data.summary.totalRestaurants)}</small>
            </>
          }
          sparkline={<Sparkline points="0,16 12,14 24,17 36,11 48,13 64,10" tone="success" />}
          detail={data.summary.openRestaurants === data.summary.totalRestaurants ? "Alla igång" : `${data.summary.totalRestaurants - data.summary.openRestaurants} stängda`}
        />
        <MetricCard
          label="Kräver åtgärd"
          value={formatNumber(totalAttention)}
          detail={
            totalAttention === 0 ? (
              <span className="font-bold text-[var(--success-text)]">Allt under kontroll</span>
            ) : (
              <span className="font-bold text-[var(--accent-ink)]">{`${attentionList.length} restauranger · ${criticalAlerts.length} alerts`}</span>
            )
          }
        />
      </div>

      {customerOverview.data ? (
        <Surface className="px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="section-title">Kundöversikt</h2>
              <p className="section-subtitle">Gäster, registreringar, konvertering och återköp</p>
            </div>
            <Button variant="secondary" onClick={() => router.push("/customers")}>Öppna kundflödet</Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="surface-muted px-4 py-4"><p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">Gästkunder</p><p className="mt-2 text-2xl font-black">{formatNumber(customerOverview.data.guests)}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{formatNumber(customerOverview.data.repeatGuests)} beställer om</p></div>
            <div className="surface-muted px-4 py-4"><p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">Gäst → kund</p><p className="mt-2 text-2xl font-black">{(customerOverview.data.guestConversionRate * 100).toFixed(1)} %</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{formatNumber(customerOverview.data.convertedFromGuest)} konverterade</p></div>
            <div className="surface-muted px-4 py-4"><p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">Registrerade kunder</p><p className="mt-2 text-2xl font-black">{formatNumber(customerOverview.data.registered)}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{formatNumber(customerOverview.data.newThisWeek)} nya denna vecka</p></div>
            <div className="surface-muted px-4 py-4"><p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">Återkommande kunder</p><p className="mt-2 text-2xl font-black">{formatNumber(customerOverview.data.repeatRegistered)}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">registrerade med minst två order</p></div>
          </div>
        </Surface>
      ) : null}

      {/* ── Trend: omsättning/ordrar per dag — alltid synlig ── */}
      <Surface className="px-5 py-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">Omsättning</h2>
            <p className="section-subtitle">Senaste {trendDays} dagarna</p>
          </div>
          <div className="segmented">
            {([7, 30, 90] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setTrendDays(days)}
                className={trendDays === days ? "is-active" : ""}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <TrendChart points={data.trend} />
        </div>
        <div className="mt-3 flex flex-wrap gap-5 text-[12px] text-[var(--text-secondary)]">
          <span>
            Period: <span className="font-semibold text-[var(--text-primary)]">{formatCurrency(data.trend.reduce((s, p) => s + p.revenue, 0))}</span>
          </span>
          <span>
            <span className="font-semibold text-[var(--text-primary)]">{formatNumber(data.trend.reduce((s, p) => s + p.orders, 0))}</span> ordrar
          </span>
          {restaurantScope && (
            <span className="text-[var(--text-muted)]">
              Visar: {(restaurantRefs.data || []).find((r) => r.id === restaurantScope)?.name ?? "vald restaurang"}
            </span>
          )}
        </div>
      </Surface>

      {/* ── Attention list — only if something needs action ── */}
      {totalAttention > 0 && (
        <Surface className="px-5 py-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-title">Kräver åtgärd</h2>
            <span className="rounded-[7px] bg-[var(--accent-soft)] px-2.5 py-0.5 text-[11px] font-extrabold text-[var(--accent-ink)]">
              {totalAttention}
            </span>
          </div>
          <div className="grid gap-2.5">
            {criticalAlerts.slice(0, 3).map((alert) => {
              const high = alert.severity === "high";
              return (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 rounded-xl border p-3"
                  style={{
                    background: high ? "var(--danger-soft)" : "var(--warning-soft)",
                    borderColor: high ? "color-mix(in srgb, var(--danger) 14%, transparent)" : "color-mix(in srgb, var(--warning) 14%, transparent)",
                  }}
                >
                  <span
                    className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px]"
                    style={{ background: high ? "color-mix(in srgb, var(--danger) 10%, transparent)" : "color-mix(in srgb, var(--warning) 10%, transparent)" }}
                  >
                    <AlertCircle size={15} style={{ color: high ? "var(--danger)" : "var(--warning)" }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-[var(--text-primary)]">{alert.title}</p>
                    <p className="mt-0.5 text-[12px] text-[var(--text-secondary)]">{alert.description}</p>
                  </div>
                </div>
              );
            })}
            {attentionList.slice(0, Math.max(0, 3 - criticalAlerts.length)).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => router.push(`/restaurants/${r.id}`)}
                className="flex items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--warning)_14%,transparent)] bg-[var(--warning-soft)] p-3 text-left"
              >
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]">
                  <AlertCircle size={15} className="text-[var(--warning)]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-[var(--text-primary)]">{r.name}</p>
                  <p className="mt-0.5 text-[12px] text-[var(--text-secondary)]">
                    {r.pendingOrders > 0 && `${r.pendingOrders} väntande ordrar`}
                    {!r.hasHours && (r.pendingOrders > 0 ? " · saknar öppettider" : "Saknar öppettider")}
                    {r.reviewScore < 4.2 && ` · ${r.reviewScore.toFixed(1)} ★`}
                  </p>
                </div>
                <span className="shrink-0 self-center text-[12px] font-bold text-[var(--accent-ink)]">Visa</span>
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
          {/* Secondary metrics — intäkt/snittorder bor numera i hero-raden */}
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard
              label="Utbetalning (mån)"
              value={formatCurrency(data.summary.monthlyPayoutExposure)}
            />
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
              {data.restaurantSnapshots.map((r) => {
                const avatar = r.imageUrl || r.heroImageUrl;
                return (
                <div
                  key={r.id}
                  className="surface-muted flex items-center gap-3 px-4 py-3"
                >
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatar}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-xl shrink-0">🍽️</div>
                  )}
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
                    <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
                      {availabilityReasonLabel[r.availabilityReason] ?? r.availabilityReason}
                    </p>
                  </div>
                  <AcceptingOrdersModeSelect
                    className="w-[150px] shrink-0 text-xs"
                    aria-label={`Beställningsläge för ${r.name}`}
                    value={r.acceptingOrdersMode}
                    disabled={toggleRestaurant.isPending}
                    compactLabels
                    onValueChange={(acceptingOrdersMode) => toggleRestaurant.mutate({
                      restaurantId: r.id,
                      acceptingOrdersMode,
                    })}
                  />
                </div>
                );
              })}
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
