"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  BellRing,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Gift,
  RefreshCw,
  Search,
  Star,
  Store,
  TicketPercent,
} from "lucide-react";
import {
  dashboardQueryKey,
  type DashboardPeriodKey,
  customerOverviewQueryKey,
  getControlCenter,
  getCustomerOverview,
  getLaunchCampaign,
  getRestaurantRefs,
  getSystemHealth,
  healthQueryKey,
  launchCampaignQueryKey,
  restaurantRefsQueryKey,
} from "@/modules/dashboard/api";
import { TrendChart } from "@/modules/dashboard/TrendChart";
import { StatusDonut } from "@/modules/dashboard/StatusDonut";
import { Badge, Button, ErrorPanel, MetricCard, PageHeader, Sparkline, Surface } from "@/shared/components/ui";
import { useAdminSession } from "@/shared/hooks/use-admin-session";
import { useUiStore } from "@/shared/store/ui-store";
import {
  formatCurrencyExact as formatCurrency,
  formatNumber,
  shortText,
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

const PERIOD_OPTIONS: Array<{ key: DashboardPeriodKey; label: string }> = [
  { key: "today", label: "Idag" },
  { key: "yesterday", label: "Igår" },
  { key: "thisWeek", label: "Denna vecka" },
  { key: "lastWeek", label: "Förra veckan" },
  { key: "thisMonth", label: "Denna månad" },
  { key: "lastMonth", label: "Förra månaden" },
];

const QUICK_ACTIONS = [
  { href: "/restaurants/new", label: "Ny restaurang", icon: Store, primary: false },
  { href: "/deals/kampanj/new", label: "Ny kampanj", icon: Gift, primary: true },
  { href: "/coupons", label: "Kuponger", icon: TicketPercent, primary: false },
  { href: "/push", label: "Push-notis", icon: BellRing, primary: false },
  { href: "/orders", label: "Liveordrar", icon: ClipboardList, primary: false },
];

function greetingForHour(hour: number) {
  if (hour >= 5 && hour < 10) return "God morgon";
  if (hour >= 10 && hour < 18) return "God dag";
  return "God kväll";
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "nyss";
  if (minutes < 60) return `${minutes} min sedan`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} tim sedan`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "igår" : `${days} dgr sedan`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export function DashboardPage() {
  const router = useRouter();
  const session = useAdminSession();
  const openPalette = useUiStore((s) => s.setPaletteOpen);
  const [showMore, toggleMore] = useLocalBool("dashboard:show-more", false);
  // Scope: hela dashboarden kan filtreras per restaurang (backend stödjer det
  // redan via ?restaurantId). Periodfiltret styr bara statistik och grafer.
  const [restaurantScope, setRestaurantScope] = useState<string | null>(null);
  const [period, setPeriod] = useState<DashboardPeriodKey>("thisMonth");

  const controlCenter = useQuery({
    queryKey: dashboardQueryKey({ restaurantId: restaurantScope, period }),
    queryFn: () => getControlCenter({ restaurantId: restaurantScope, period }),
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
  const launchCampaign = useQuery({
    queryKey: launchCampaignQueryKey({ days: 30, limit: 1 }),
    queryFn: () => getLaunchCampaign({ days: 30, limit: 1 }),
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
    (r) => r.pendingOrders > 0 || (!r.isOpen && r.liveOrders > 0) || r.reviewScore < 4.2,
  );
  const criticalAlerts = data.alerts.filter((a) => a.severity === "high" || a.severity === "medium");
  const totalAttention = attentionList.length + criticalAlerts.length;
  const pendingLiveOrders = data.liveStatusCounts.PENDING || 0;

  const firstName = session.data?.name?.split(/\s+/)[0];
  const greeting = greetingForHour(new Date().getHours());
  const todayLabel = new Intl.DateTimeFormat("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  const topRestaurants = [...data.restaurantSnapshots]
    .map((r) => ({ ...r, scopedRevenue: r.periodRevenue ?? r.monthRevenue }))
    .sort((a, b) => b.scopedRevenue - a.scopedRevenue)
    .slice(0, 5);
  const topRevenueMax = Math.max(1, ...topRestaurants.map((r) => r.scopedRevenue));

  const campaign = launchCampaign.data;
  const campaignSendRate = campaign && campaign.totals.leads > 0
    ? Math.min(100, Math.round((campaign.totals.couponsSent / campaign.totals.leads) * 100))
    : 0;

  return (
    <div className="page-stack">
      {/* ── Hälsning + sök + scope ── */}
      <div className="dash-greeting">
        <div className="min-w-0">
          <h1 className="dash-greeting-title">
            {greeting}{firstName ? `, ${firstName}` : ""}!
          </h1>
          <p className="dash-greeting-sub">{todayLabel} · Här är läget för viaeats just nu.</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button type="button" className="dash-search" onClick={() => openPalette(true)}>
            <Search size={14} />
            Sök i admin…
            <kbd>⌘K</kbd>
          </button>
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
        </div>
      </div>

      {/* ── Live/ops-KPI:er: påverkas inte av rapportperioden ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Live ordrar"
          value={formatNumber(data.summary.liveOrders)}
          sparkline={<Sparkline points="0,24 10,20 20,22 30,14 40,16 52,8 64,5" />}
          detail={
            pendingLiveOrders > 0 ? (
              <span className="font-bold text-[var(--accent-ink)]">{formatNumber(pendingLiveOrders)} väntar accept</span>
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
          label="Väntar accept"
          value={formatNumber(pendingLiveOrders)}
          detail={pendingLiveOrders > 0 ? "Kräver svar från partner" : "Ingen väntande order"}
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

      {/* ── Hero: intäkt i navy + högerkolumn med kampanj & orderstatus ── */}
      <div className="grid gap-4 xl:grid-cols-12">
        <section className="hero-card xl:col-span-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="hero-stat-label">Intäkt · {data.period.label}</p>
              <p className="hero-value mt-2.5">{formatCurrency(data.summary.periodRevenue)}</p>
              <p className="mt-2 text-[12.5px] font-medium text-[rgba(254,247,240,0.7)]">
                {formatNumber(data.summary.periodOrders)} betalda order · snitt {formatCurrency(data.summary.avgTicket)}
              </p>
            </div>
            <div className="segmented">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setPeriod(option.key)}
                  className={period === option.key ? "is-active" : ""}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <TrendChart points={data.trend} />
          </div>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-[rgba(254,247,240,0.14)] pt-4">
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="hero-stat-label">Provision</p>
                <p className="hero-stat-value">{formatCurrency(data.summary.periodCommission)}</p>
              </div>
              <div>
                <p className="hero-stat-label">Att överföra</p>
                <p className="hero-stat-value">{formatCurrency(data.summary.periodPayoutExposure)}</p>
              </div>
              <div>
                <p className="hero-stat-label">Återbetalt</p>
                <p className="hero-stat-value">{formatCurrency(data.summary.periodRefundAmount)}</p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => router.push("/finance")}>
              Visa ekonomi <ArrowRight size={14} />
            </Button>
          </div>
        </section>

        <div className="grid content-start gap-4 xl:col-span-4">
          {/* Kampanjkort — launch-kampanjens 30-dagarsläge */}
          <Surface className="px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Pågående kampanj</p>
                <h2 className="section-title mt-1.5">Launch-kampanj</h2>
              </div>
              <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] bg-[var(--brand-navy-soft)] text-[var(--brand-navy-ink)]">
                <Gift size={17} />
              </span>
            </div>
            {campaign ? (
              <>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div>
                    <p className="card-label">Leads 30d</p>
                    <p className="mt-1 text-lg font-extrabold">{formatNumber(campaign.totals.leadsInPeriod)}</p>
                  </div>
                  <div>
                    <p className="card-label">Kuponger</p>
                    <p className="mt-1 text-lg font-extrabold">{formatNumber(campaign.totals.couponsSent)}</p>
                  </div>
                  <div>
                    <p className="card-label">Snitt/dag</p>
                    <p className="mt-1 text-lg font-extrabold">{campaign.totals.averageDailyLeads.toFixed(1)}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-[11.5px] font-bold">
                    <span className="text-[var(--text-secondary)]">Kuponger skickade</span>
                    <span className="text-[var(--text-primary)]">{campaignSendRate}%</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${campaignSendRate}%` }} />
                  </div>
                </div>
              </>
            ) : (
              <p className="section-subtitle mt-3">Laddar kampanjdata…</p>
            )}
            <button
              type="button"
              onClick={() => router.push("/launch-campaign")}
              className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--brand-navy-ink)] hover:underline"
            >
              Öppna kampanjen <ArrowRight size={13} />
            </button>
          </Surface>

          {/* Orderstatus-donut */}
          <Surface className="px-5 py-5">
            <h2 className="section-title mb-4">Orderstatus live</h2>
            <StatusDonut counts={data.liveStatusCounts} />
          </Surface>
        </div>
      </div>

      {/* ── Snabbåtgärder ── */}
      <div className="quick-actions">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.href}
            type="button"
            onClick={() => router.push(action.href)}
            className={`quick-action${action.primary ? " is-primary" : ""}`}
          >
            <span className="quick-action-icon">
              <action.icon size={19} />
            </span>
            {action.label}
          </button>
        ))}
      </div>

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

      {/* ── Topprestauranger + händelseflöde ── */}
      <div className="grid gap-4 xl:grid-cols-12">
        <Surface className="px-5 py-5 xl:col-span-7">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="section-title">Topprestauranger</h2>
              <p className="section-subtitle">Omsättning · {data.period.label}</p>
            </div>
            <Button variant="secondary" onClick={() => router.push("/restaurants")}>Alla restauranger</Button>
          </div>
          {topRestaurants.length === 0 ? (
            <p className="section-subtitle">Ingen försäljning i perioden.</p>
          ) : (
            <div className="grid gap-4">
              {topRestaurants.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => router.push(`/restaurants/${r.id}`)}
                  className="group text-left"
                >
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[13.5px] font-bold text-[var(--text-primary)] group-hover:underline">
                      {r.name}
                    </span>
                    <span className="flex-none text-[12.5px] font-bold text-[var(--text-secondary)]">
                      {formatCurrency(r.scopedRevenue)}
                    </span>
                  </div>
                  <div className="progress-track">
                    <div
                      className={`progress-fill${i === 0 ? " is-leader" : ""}`}
                      style={{ width: `${Math.max(3, (r.scopedRevenue / topRevenueMax) * 100)}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
        </Surface>

        <Surface className="px-5 py-5 xl:col-span-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="section-title">Senaste händelser</h2>
            <Button variant="secondary" onClick={() => router.push("/reviews")}>Recensioner</Button>
          </div>
          {data.recentReviews.length === 0 ? (
            <p className="section-subtitle">Inga nya recensioner ännu.</p>
          ) : (
            <div>
              {data.recentReviews.slice(0, 5).map((review) => (
                <div key={review.id} className="activity-row">
                  <span className="activity-avatar">{initials(review.customerName)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug">
                      <span className="font-bold text-[var(--text-primary)]">{review.customerName}</span>{" "}
                      <span className="text-[var(--text-secondary)]">
                        gav {review.rating} <Star size={11} className="inline -mt-0.5" aria-hidden />
                        {review.restaurantName ? ` till ${review.restaurantName}` : ""}
                      </span>
                    </p>
                    {review.review ? (
                      <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{shortText(review.review, 80)}</p>
                    ) : null}
                  </div>
                  <span className="flex-none text-[11px] font-semibold text-[var(--text-muted)]">
                    {timeAgo(review.reviewedAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Surface>
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

      {/* ── Reveal: everything else ──────────────────── */}
      <button type="button" onClick={toggleMore} className="reveal-more">
        {showMore ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        {showMore ? "Dölj detaljer" : "Visa mer"}
      </button>

      {showMore && (
        <>
          {/* Secondary metrics */}
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard
              label="DB-latens"
              value={`${healthData.dbPingMs} ms`}
              detail={healthData.status}
            />
          </div>

          {/* Top products */}
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
