"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Gift,
  RefreshCw,
  Store,
} from "lucide-react";
import {
  getDashboardOverview,
  overviewQueryKey,
  type DashboardOverviewAction,
} from "@/modules/dashboard/api";
import { Badge, Button, ErrorPanel, MetricCard, PageHeader, Surface } from "@/shared/components/ui";
import {
  formatCurrencyExact as formatCurrency,
  formatNumber,
  orderStatusLabel,
} from "@/shared/utils/format";

const QUICK_ACTIONS = [
  { href: "/orders", label: "Liveordrar", icon: ClipboardList },
  { href: "/restaurants/new", label: "Ny restaurang", icon: Store },
  { href: "/deals/kampanj/new", label: "Ny kampanj", icon: Gift },
] as const;

const LIVE_STATUS_ORDER = ["PENDING", "ACCEPTED", "PREPARING", "READY", "DELIVERING"];

function actionTone(severity: DashboardOverviewAction["severity"]): "danger" | "warning" | "info" {
  if (severity === "high") return "danger";
  if (severity === "medium") return "warning";
  return "info";
}

function actionLabel(severity: DashboardOverviewAction["severity"]) {
  if (severity === "high") return "Nu";
  if (severity === "medium") return "Se över";
  return "Info";
}

function updatedTime(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function DashboardPage() {
  const router = useRouter();
  const [restaurantScope, setRestaurantScope] = useState<string | null>(null);
  const overview = useQuery({
    queryKey: overviewQueryKey({ restaurantId: restaurantScope }),
    queryFn: () => getDashboardOverview({ restaurantId: restaurantScope }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  if (overview.isLoading) {
    return (
      <div className="page-stack">
        <PageHeader title="Översikt" breadcrumb="Drift just nu" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="metric-card min-h-[126px] animate-pulse" />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="surface min-h-[280px] animate-pulse" />
          <div className="surface min-h-[280px] animate-pulse" />
        </div>
      </div>
    );
  }

  if (overview.isError || !overview.data) {
    return (
      <div className="page-stack">
        <PageHeader title="Översikt" />
        <ErrorPanel
          title="Kunde inte ladda översikten"
          action={
            <Button variant="primary" onClick={() => void overview.refetch()}>
              <RefreshCw size={14} /> Försök igen
            </Button>
          }
        />
      </div>
    );
  }

  const data = overview.data;
  const maxTrendSales = Math.max(1, ...data.trend7d.map((point) => point.netSales));
  const trendSales = data.trend7d.reduce((sum, point) => sum + point.netSales, 0);
  const trendOrders = data.trend7d.reduce((sum, point) => sum + point.orders, 0);
  const liveEntries = Object.entries(data.liveStatusCounts)
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => {
      const leftIndex = LIVE_STATUS_ORDER.indexOf(left);
      const rightIndex = LIVE_STATUS_ORDER.indexOf(right);
      return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex);
    });

  return (
    <div className="page-stack">
      <PageHeader
        title="Översikt"
        breadcrumb={`Uppdaterad ${updatedTime(data.generatedAt)}`}
        actions={
          <>
            <select
              value={restaurantScope ?? ""}
              onChange={(event) => setRestaurantScope(event.target.value || null)}
              className="h-[40px] max-w-[220px] rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 text-[13px] font-semibold text-[var(--text-secondary)] outline-none transition-colors hover:border-[var(--border-strong)]"
              aria-label="Filtrera på restaurang"
            >
              <option value="">Alla restauranger</option>
              {data.restaurantRefs.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>
              ))}
            </select>
            <Button
              aria-label="Uppdatera översikten"
              title="Uppdatera"
              loading={overview.isFetching}
              onClick={() => void overview.refetch()}
            >
              {!overview.isFetching ? <RefreshCw size={14} /> : null}
              Uppdatera
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Försäljning idag"
          value={formatCurrency(data.today.netSales)}
          detail="Betalt, efter återbetalningar"
        />
        <MetricCard
          label="Ordrar idag"
          value={formatNumber(data.today.orders)}
          detail={`${formatNumber(data.today.liveOrders)} live just nu`}
        />
        <MetricCard
          label="Väntar på svar"
          value={formatNumber(data.today.pendingOrders)}
          detail={data.today.pendingOrders > 0 ? "Öppna liveordrar" : "Ingen kö"}
        />
        <MetricCard
          label="Öppna restauranger"
          value={`${formatNumber(data.restaurants.open)}/${formatNumber(data.restaurants.total)}`}
          detail={restaurantScope ? "Vald restaurang" : "Publicerade restauranger"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Surface className="px-5 py-5 xl:col-span-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Prioriterat</p>
              <h2 className="section-title mt-1">Behöver åtgärd</h2>
            </div>
            {data.actions.length > 0 ? <Badge tone="warning">{data.actions.length}</Badge> : null}
          </div>

          {data.actions.length === 0 ? (
            <div className="mt-5 flex min-h-[180px] flex-col items-center justify-center rounded-[14px] bg-[var(--bg-page)] px-5 text-center">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--success-soft)] text-[var(--success-text)]">
                <CheckCircle2 size={21} />
              </span>
              <p className="mt-3 text-[14px] font-extrabold text-[var(--text-primary)]">Allt under kontroll</p>
              <p className="mt-1 text-[12px] text-[var(--text-muted)]">Inget kräver åtgärd just nu.</p>
            </div>
          ) : (
            <div className="mt-4 grid gap-2">
              {data.actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => router.push(action.href)}
                  className="flex w-full items-center gap-3 rounded-[12px] border border-[var(--border-subtle)] px-3.5 py-3 text-left transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-[var(--brand-orange-soft)] text-[var(--brand-orange-ink)]">
                    <AlertTriangle size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[13px] font-extrabold text-[var(--text-primary)]">{action.title}</span>
                      <Badge tone={actionTone(action.severity)}>{actionLabel(action.severity)}</Badge>
                    </span>
                    <span className="mt-0.5 block text-[12px] text-[var(--text-secondary)]">{action.detail}</span>
                  </span>
                  <ArrowRight size={14} className="flex-none text-[var(--text-muted)]" />
                </button>
              ))}
            </div>
          )}
        </Surface>

        <Surface className="px-5 py-5 xl:col-span-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Just nu</p>
              <h2 className="section-title mt-1">Liveordrar</h2>
            </div>
            <p className="text-3xl font-black tracking-tight text-[var(--text-primary)]">{formatNumber(data.today.liveOrders)}</p>
          </div>

          {liveEntries.length === 0 ? (
            <div className="mt-5 flex min-h-[180px] items-center justify-center rounded-[14px] bg-[var(--bg-page)] text-[13px] font-semibold text-[var(--text-muted)]">
              Inga aktiva ordrar
            </div>
          ) : (
            <div className="mt-5 grid gap-2">
              {liveEntries.map(([status, count]) => (
                <div key={status} className="flex items-center justify-between rounded-[11px] bg-[var(--bg-page)] px-3.5 py-3">
                  <span className="text-[13px] font-semibold text-[var(--text-secondary)]">{orderStatusLabel(status)}</span>
                  <span className="text-[14px] font-black text-[var(--text-primary)]">{formatNumber(count)}</span>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => router.push("/orders")}
            className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--brand-navy-ink)] hover:underline"
          >
            Öppna liveordrar <ArrowRight size={13} />
          </button>
        </Surface>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Surface className="px-5 py-5 xl:col-span-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Senaste 7 dagarna</p>
              <h2 className="section-title mt-1">Försäljning</h2>
            </div>
            <div className="text-right">
              <p className="text-[17px] font-black text-[var(--text-primary)]">{formatCurrency(trendSales)}</p>
              <p className="text-[11px] font-semibold text-[var(--text-muted)]">{formatNumber(trendOrders)} ordrar</p>
            </div>
          </div>
          <div className="mt-6 flex h-[190px] items-end gap-2 sm:gap-3" role="img" aria-label="Försäljning de senaste sju dagarna">
            {data.trend7d.map((point, index) => {
              const height = point.netSales > 0 ? Math.max(8, (point.netSales / maxTrendSales) * 100) : 3;
              const isToday = index === data.trend7d.length - 1;
              return (
                <div key={point.date} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                  <div className="mb-2 text-center text-[10px] font-bold text-[var(--text-muted)]">
                    {point.orders > 0 ? formatNumber(point.orders) : ""}
                  </div>
                  <div className="flex h-[145px] items-end rounded-[9px] bg-[var(--bg-page)] p-1">
                    <div
                      className="w-full rounded-[6px] transition-[height] duration-500"
                      style={{
                        height: `${height}%`,
                        background: isToday ? "var(--brand-orange)" : "var(--brand-navy-bar)",
                      }}
                      title={`${point.label}: ${formatCurrency(point.netSales)} · ${formatNumber(point.orders)} ordrar`}
                    />
                  </div>
                  <span className={`mt-2 text-center text-[11px] font-bold ${isToday ? "text-[var(--brand-orange-ink)]" : "text-[var(--text-muted)]"}`}>
                    {point.label}
                  </span>
                </div>
              );
            })}
          </div>
        </Surface>

        <Surface className="px-5 py-5 xl:col-span-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Drift</p>
              <h2 className="section-title mt-1">Restauranger</h2>
            </div>
            <button type="button" onClick={() => router.push("/restaurants")} className="text-[12.5px] font-bold text-[var(--brand-navy-ink)] hover:underline">
              Visa alla
            </button>
          </div>
          <div className="mt-4 grid gap-1.5">
            {data.restaurantStatus.slice(0, 6).map((restaurant) => (
              <button
                key={restaurant.id}
                type="button"
                onClick={() => router.push(`/restaurants/${restaurant.id}`)}
                className="flex items-center gap-3 rounded-[11px] px-2.5 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
              >
                <span className={`h-2.5 w-2.5 flex-none rounded-full ${restaurant.isOpen ? "bg-[var(--success)]" : "bg-[var(--text-muted)]"}`} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[var(--text-primary)]">{restaurant.name}</span>
                {restaurant.pendingOrders > 0 ? (
                  <Badge tone="warning">{restaurant.pendingOrders} väntar</Badge>
                ) : restaurant.liveOrders > 0 ? (
                  <Badge tone="info">{restaurant.liveOrders} live</Badge>
                ) : (
                  <span className="text-[11px] font-semibold text-[var(--text-muted)]">{restaurant.isOpen ? "Öppen" : "Stängd"}</span>
                )}
                <ArrowRight size={13} className="flex-none text-[var(--text-muted)]" />
              </button>
            ))}
            {data.restaurantStatus.length === 0 ? (
              <p className="py-12 text-center text-[13px] text-[var(--text-muted)]">Inga restauranger i urvalet.</p>
            ) : null}
          </div>
        </Surface>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.href}
            type="button"
            onClick={() => router.push(action.href)}
            className="surface group flex items-center gap-3 px-4 py-4 text-left transition-transform hover:-translate-y-0.5"
          >
            <span className="grid h-10 w-10 flex-none place-items-center rounded-[11px] bg-[var(--brand-navy-soft)] text-[var(--brand-navy-ink)]">
              <action.icon size={18} />
            </span>
            <span className="min-w-0 flex-1 text-[13px] font-extrabold text-[var(--text-primary)]">{action.label}</span>
            <ArrowRight size={14} className="flex-none text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>
    </div>
  );
}
