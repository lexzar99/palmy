"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Bell,
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
import { Badge, Button, ErrorPanel, MetricCard, PageHeader, Surface } from "@/shared/components/ui";
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
  { key: "thisWeek", label: "Vecka" },
  { key: "thisMonth", label: "Månad" },
  { key: "lastMonth", label: "Förra mån" },
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

function displayName(sessionName?: string | null) {
  const name = (sessionName ?? "").trim();
  if (!name || /^admin$/i.test(name)) return "Jarir Alshaher";
  return name;
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "nyss";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} tim`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "igår" : `${days} d`;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function DashboardPage() {
  const router = useRouter();
  const session = useAdminSession();
  const openPalette = useUiStore((s) => s.setPaletteOpen);
  const [showMore, toggleMore] = useLocalBool("dashboard:show-more", false);
  const [notifOpen, setNotifOpen] = useState(false);
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

  const profileName = displayName(session.data?.name);
  const greeting = greetingForHour(new Date().getHours());
  const todayLabel = new Intl.DateTimeFormat("sv-SE", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

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
      {/* ── Topbar: hälsning · sök · notiser · profil ── */}
      <div className="dash-greeting">
        <div className="min-w-0">
          <h1 className="dash-greeting-title">{greeting}, {profileName.split(" ")[0]}! 👋</h1>
          <p className="dash-greeting-sub">{todayLabel}</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button type="button" className="dash-search" onClick={() => openPalette(true)}>
            <Search size={14} />
            Sök…
            <kbd>⌘K</kbd>
          </button>
          <select
            value={restaurantScope ?? ""}
            onChange={(e) => setRestaurantScope(e.target.value || null)}
            className="h-[40px] max-w-[180px] rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 text-[13px] font-semibold text-[var(--text-secondary)] outline-none transition-colors hover:border-[var(--border-strong)]"
            aria-label="Filtrera på restaurang"
          >
            <option value="">Alla restauranger</option>
            {(restaurantRefs.data || []).map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <button
            type="button"
            className="dash-bell"
            aria-label="Uppdatera"
            title="Uppdatera"
            onClick={() => {
              void controlCenter.refetch();
              void health.refetch();
            }}
          >
            <RefreshCw size={16} className={controlCenter.isFetching ? "animate-spin" : undefined} />
          </button>

          {/* Kräver åtgärd — klocka med dropdown */}
          <div className="notif-wrap">
            <button
              type="button"
              className="dash-bell"
              onClick={() => setNotifOpen((v) => !v)}
              aria-label={`Notiser (${totalAttention})`}
              aria-expanded={notifOpen}
            >
              <Bell size={16} />
              {totalAttention > 0 && <span className="dash-bell-badge">{totalAttention}</span>}
            </button>
            {notifOpen && (
              <>
                <button type="button" className="fixed inset-0 z-50 cursor-default" aria-label="Stäng notiser" onClick={() => setNotifOpen(false)} />
                <div className="notif-panel">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-extrabold uppercase tracking-[0.09em] text-[var(--text-muted)]">
                    Kräver åtgärd
                  </p>
                  {totalAttention === 0 ? (
                    <p className="px-3 py-6 text-center text-[13px] text-[var(--text-muted)]">Allt under kontroll ✨</p>
                  ) : (
                    <div className="grid gap-1">
                      {criticalAlerts.map((alert) => (
                        <div key={alert.id} className="flex items-start gap-2.5 rounded-[10px] px-3 py-2.5">
                          <AlertCircle size={15} className="mt-0.5 shrink-0" style={{ color: alert.severity === "high" ? "var(--danger)" : "var(--warning)" }} />
                          <div className="min-w-0">
                            <p className="text-[13px] font-bold text-[var(--text-primary)]">{alert.title}</p>
                            <p className="text-[12px] text-[var(--text-secondary)]">{shortText(alert.description, 70)}</p>
                          </div>
                        </div>
                      ))}
                      {attentionList.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            setNotifOpen(false);
                            router.push(`/restaurants/${r.id}`);
                          }}
                          className="flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left hover:bg-[var(--bg-hover)]"
                        >
                          <AlertCircle size={15} className="shrink-0 text-[var(--warning)]" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-bold text-[var(--text-primary)]">{r.name}</span>
                            <span className="block text-[12px] text-[var(--text-secondary)]">
                              {r.pendingOrders > 0
                                ? `${r.pendingOrders} väntande`
                                : !r.hasHours
                                  ? "Saknar öppettider"
                                  : `${r.reviewScore.toFixed(1)} ★`}
                            </span>
                          </span>
                          <ArrowRight size={13} className="shrink-0 text-[var(--text-muted)]" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <button type="button" className="dash-avatar" onClick={() => router.push("/users")} aria-label="Min profil" title={profileName}>
            {initials(profileName)}
          </button>
        </div>
      </div>

      {/* ── Rad 1: navy hero · kampanj · live ── */}
      <div className="grid gap-4 xl:grid-cols-12">
        <section className="hero-card xl:col-span-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="hero-stat-label">Intäkt · {data.period.label}</p>
              <p className="hero-value mt-2">{formatCurrency(data.summary.periodRevenue)}</p>
              <p className="mt-1.5 text-[12.5px] font-medium text-[rgba(254,247,240,0.65)]">
                {formatNumber(data.summary.periodOrders)} ordrar · snitt {formatCurrency(data.summary.avgTicket)}
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

          <div className="mt-4">
            <TrendChart points={data.trend} />
          </div>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-[rgba(254,247,240,0.14)] pt-4">
            <div className="flex flex-wrap gap-x-8 gap-y-3">
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
            <Button variant="primary" onClick={() => router.push("/finance")}>
              Rapport <ArrowRight size={14} />
            </Button>
          </div>
        </section>

        {/* Kampanj */}
        <Surface className="flex flex-col px-5 py-5 xl:col-span-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Pågår nu</p>
              <h2 className="section-title mt-1">Launch-kampanj</h2>
            </div>
            <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] bg-[var(--brand-navy-soft)] text-[var(--brand-navy-ink)]">
              <Gift size={17} />
            </span>
          </div>
          {campaign ? (
            <div className="mt-4 grid flex-1 content-start gap-3">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-semibold text-[var(--text-secondary)]">Leads 30d</span>
                <span className="font-extrabold text-[var(--text-primary)]">{formatNumber(campaign.totals.leadsInPeriod)}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-semibold text-[var(--text-secondary)]">Kuponger</span>
                <span className="font-extrabold text-[var(--text-primary)]">{formatNumber(campaign.totals.couponsSent)}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-semibold text-[var(--text-secondary)]">Snitt/dag</span>
                <span className="font-extrabold text-[var(--text-primary)]">{campaign.totals.averageDailyLeads.toFixed(1)}</span>
              </div>
              <div className="mt-1">
                <div className="mb-1.5 flex justify-between text-[11.5px] font-bold">
                  <span className="text-[var(--text-secondary)]">Skickade</span>
                  <span className="text-[var(--text-primary)]">{campaignSendRate}%</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${campaignSendRate}%` }} />
                </div>
              </div>
            </div>
          ) : (
            <p className="section-subtitle mt-3 flex-1">Laddar…</p>
          )}
          <button
            type="button"
            onClick={() => router.push("/launch-campaign")}
            className="mt-4 inline-flex items-center gap-1.5 self-start text-[13px] font-bold text-[var(--brand-navy-ink)] hover:underline"
          >
            Öppna <ArrowRight size={13} />
          </button>
        </Surface>

        {/* Live just nu — navy som Veloras tasks-kort */}
        <section className="hero-card flex flex-col xl:col-span-3" style={{ padding: "20px" }}>
          <h2 className="text-[15px] font-extrabold text-white">Live just nu</h2>
          <div className="mt-4 flex-1">
            <StatusDonut counts={data.liveStatusCounts} compact />
          </div>
          <p className="mt-4 border-t border-[rgba(254,247,240,0.14)] pt-3 text-[12px] font-semibold text-[rgba(254,247,240,0.65)]">
            {formatNumber(data.summary.openRestaurants)}/{formatNumber(data.summary.totalRestaurants)} öppna
            {pendingLiveOrders > 0 ? <span className="text-[var(--brand-orange-ink)]"> · {formatNumber(pendingLiveOrders)} väntar accept</span> : null}
          </p>
        </section>
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

      {/* ── Rad 2: topprestauranger · topprodukter · händelser ── */}
      <div className="grid gap-4 xl:grid-cols-12">
        <Surface className="px-5 py-5 xl:col-span-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="section-title">Topprestauranger</h2>
            <button type="button" onClick={() => router.push("/restaurants")} className="text-[12.5px] font-bold text-[var(--brand-navy-ink)] hover:underline">
              Alla
            </button>
          </div>
          {topRestaurants.length === 0 ? (
            <p className="section-subtitle">Ingen försäljning ännu.</p>
          ) : (
            <div className="grid gap-3.5">
              {topRestaurants.map((r, i) => (
                <button key={r.id} type="button" onClick={() => router.push(`/restaurants/${r.id}`)} className="group text-left">
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[13px] font-bold text-[var(--text-primary)] group-hover:underline">{r.name}</span>
                    <span className="flex-none text-[12px] font-bold text-[var(--text-secondary)]">{formatCurrency(r.scopedRevenue)}</span>
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

        <Surface className="px-5 py-5 xl:col-span-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="section-title">Topprodukter</h2>
            <span className="sidebar-section-count">{data.topProducts.length}</span>
          </div>
          {data.topProducts.length === 0 ? (
            <p className="section-subtitle">Inget sålt ännu.</p>
          ) : (
            <div className="grid gap-1">
              {data.topProducts.slice(0, 5).map((p, i) => (
                <div key={`${p.name}-${i}`} className="flex items-center gap-3 rounded-[10px] px-2 py-2">
                  <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[8px] bg-[var(--brand-navy-soft)] text-[11px] font-extrabold text-[var(--brand-navy-ink)]">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text-primary)]">{p.name}</span>
                  <span className="flex-none text-[12px] text-[var(--text-muted)]">{formatNumber(p.count)}×</span>
                  <span className="flex-none text-[12.5px] font-bold text-[var(--text-secondary)]">{formatCurrency(p.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </Surface>

        <Surface className="px-5 py-5 xl:col-span-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="section-title">Händelser</h2>
            <button type="button" onClick={() => router.push("/reviews")} className="text-[12.5px] font-bold text-[var(--brand-navy-ink)] hover:underline">
              Alla
            </button>
          </div>
          {data.recentReviews.length === 0 ? (
            <p className="section-subtitle">Inga recensioner ännu.</p>
          ) : (
            <div>
              {data.recentReviews.slice(0, 4).map((review) => (
                <div key={review.id} className="activity-row">
                  <span className="activity-avatar">{initials(review.customerName)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug">
                      <span className="font-bold text-[var(--text-primary)]">{review.customerName}</span>{" "}
                      <span className="text-[var(--text-secondary)]">
                        {review.rating} <Star size={11} className="-mt-0.5 inline" aria-hidden />
                        {review.restaurantName ? ` · ${review.restaurantName}` : ""}
                      </span>
                    </p>
                    {review.review ? <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{shortText(review.review, 60)}</p> : null}
                  </div>
                  <span className="flex-none text-[11px] font-semibold text-[var(--text-muted)]">{timeAgo(review.reviewedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </Surface>
      </div>

      {customerOverview.data ? (
        <Surface className="px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="section-title">Kunder</h2>
            <button type="button" onClick={() => router.push("/customers")} className="text-[12.5px] font-bold text-[var(--brand-navy-ink)] hover:underline">
              Alla
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="surface-muted px-4 py-4"><p className="card-label">Gäster</p><p className="mt-2 text-2xl font-black">{formatNumber(customerOverview.data.guests)}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{formatNumber(customerOverview.data.repeatGuests)} beställer om</p></div>
            <div className="surface-muted px-4 py-4"><p className="card-label">Gäst → kund</p><p className="mt-2 text-2xl font-black">{(customerOverview.data.guestConversionRate * 100).toFixed(1)} %</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{formatNumber(customerOverview.data.convertedFromGuest)} konverterade</p></div>
            <div className="surface-muted px-4 py-4"><p className="card-label">Registrerade</p><p className="mt-2 text-2xl font-black">{formatNumber(customerOverview.data.registered)}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{formatNumber(customerOverview.data.newThisWeek)} nya i veckan</p></div>
            <div className="surface-muted px-4 py-4"><p className="card-label">Återkommande</p><p className="mt-2 text-2xl font-black">{formatNumber(customerOverview.data.repeatRegistered)}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">minst två order</p></div>
          </div>
        </Surface>
      ) : null}

      {/* ── Reveal: systemdetaljer ── */}
      <button type="button" onClick={toggleMore} className="reveal-more">
        {showMore ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        {showMore ? "Dölj system" : "System"}
      </button>

      {showMore && (
        <div className="grid gap-4 sm:grid-cols-2">
          <MetricCard label="DB-latens" value={`${healthData.dbPingMs} ms`} detail={healthData.status} />
          <Surface className="px-5 py-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="section-title">Tjänster</h2>
              <Badge tone={healthData.status === "ONLINE" ? "success" : "danger"}>{healthData.status}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={healthData.services.auth ? "success" : "danger"}>Auth</Badge>
              <Badge tone={healthData.services.realtime ? "success" : "danger"}>Realtime</Badge>
              <Badge tone={healthData.services.uploads ? "success" : "warning"}>Uploads</Badge>
            </div>
          </Surface>
        </div>
      )}
    </div>
  );
}
