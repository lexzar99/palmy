"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  BellRing,
  Building2,
  CreditCard,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useControlCenter } from "@/lib/use-control-center";
import { useRestaurantStore } from "@/store/restaurantStore";

const currency = (value: number) => `${Math.round(value).toLocaleString("sv-SE")} kr`;
const compact = (value: number) => Intl.NumberFormat("sv-SE", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const relativeDate = (value: string) =>
  new Intl.DateTimeFormat("sv-SE", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

const LAUNCHPAD = [
  {
    href: "/orders/new",
    label: "Nya ordrar",
    description: "Gå direkt till orderkön och svara innan SLA glider iväg.",
    icon: BellRing,
  },
  {
    href: "/restaurant-ops",
    label: "Restauranghub",
    description: "Samlad hub för öppettider, ETA och snabb driftstatus.",
    icon: Store,
  },
  {
    href: "/finance",
    label: "Finance HQ",
    description: "Utbetalningar, provisioner och payout-exponering per restaurang.",
    icon: Banknote,
  },
  {
    href: "/performance",
    label: "Performance",
    description: "Samlad analysyta istället för flera BI/stats/dashboards.",
    icon: TrendingUp,
  },
];

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Nya",
  ACCEPTED: "Bekräftade",
  PREPARING: "Tillagas",
  READY: "Klara",
  DELIVERING: "På väg",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#f59e0b",
  ACCEPTED: "#60a5fa",
  PREPARING: "#34d399",
  READY: "#a78bfa",
  DELIVERING: "#38bdf8",
};

const getAlertPlaybook = (alert: { domain: string; title: string; restaurantId?: string }) => {
  if (alert.domain === "security") {
    return {
      href: alert.restaurantId ? `/restaurant-ops?restaurantId=${alert.restaurantId}` : "/restaurant-ops",
      label: "Öppna restauranghubben",
      steps: [
        "Öppna restaurangens driftinställningar.",
        "Kontrollera att Business-kontot fungerar via slug och lösenord på restaurangsidan.",
        "Spara och bekräfta att drift- och logininformationen är uppdaterad.",
      ],
    };
  }

  if (alert.domain === "ops") {
    return {
      href: alert.restaurantId ? `/restaurant-ops?restaurantId=${alert.restaurantId}` : "/orders",
      label: alert.title.toLowerCase().includes("order") ? "Öppna orderflödet" : "Öppna restauranghubben",
      steps: [
        "Öppna rätt restaurang eller orderkö.",
        "Rätta status, schema eller ETA så att driftläget blir tydligt igen.",
        "Verifiera att signalen försvinner i kontrolltornet efter åtgärd.",
      ],
    };
  }

  if (alert.domain === "finance") {
    return {
      href: "/finance",
      label: "Öppna Finance HQ",
      steps: [
        "Öppna payout-detaljen för partnern.",
        "Kontrollera provision, justeringar och payout-readiness.",
        "Godkänn, sätt på hold eller markera som betald.",
      ],
    };
  }

  return {
    href: "/performance",
    label: "Öppna Performance",
    steps: [
      "Öppna kvalitetssidan för att se reviews och trenddata.",
      "Jämför score, väntande ordrar och senaste feedback.",
      "Följ upp partnern innan nästa payout eller kampanjstart.",
    ],
  };
};

export default function DashboardPage() {
  const { data, loading, error, refresh } = useControlCenter();
  const { selectedRestaurantName } = useRestaurantStore();

  if (loading) {
    return (
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="panel h-[320px] animate-pulse rounded-[32px]" />
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
          <div className="panel h-[150px] animate-pulse rounded-[32px]" />
          <div className="panel h-[150px] animate-pulse rounded-[32px]" />
        </div>
      </div>
    );
  }

  if (!data || error) {
    return (
      <div className="panel flex min-h-[360px] flex-col items-center justify-center gap-4 rounded-[32px] px-6 py-12 text-center">
        <AlertTriangle size={34} className="text-amber-300" />
        <div className="space-y-2">
          <h2 className="text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Kunde inte ladda kontrolltornet</h2>
          <p className="max-w-xl text-sm leading-6 text-[var(--text-secondary)]">{error || "Något gick fel när panelens nya översikt skulle laddas."}</p>
        </div>
        <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-5 py-3 text-[11px] font-black uppercase tracking-[0.24em] text-[#091018]">
          <RefreshCw size={14} /> Försök igen
        </button>
      </div>
    );
  }

  const metricCards = [
    {
      label: "Omsättning idag",
      value: currency(data.summary.todayRevenue),
      description: `${data.summary.todayOrders} ordrar idag`,
      icon: CreditCard,
    },
    {
      label: "Live-ordrar",
      value: String(data.summary.liveOrders),
      description: "Pågående flöden över alla restauranger",
      icon: BellRing,
    },
    {
      label: "Öppna restauranger",
      value: `${data.summary.openRestaurants}/${data.summary.totalRestaurants}`,
      description: "Effektiv öppetstatus efter schema + manuell override",
      icon: Building2,
    },
    {
      label: "Aktiva kunder",
      value: compact(data.summary.activeCustomers),
      description: `Registrerade totalt ${compact(data.summary.registeredCustomers || 0)}`,
      icon: Users,
    },
    {
      label: "Payout-exponering",
      value: currency(data.summary.monthlyPayoutExposure),
      description: "Preliminära utbetalningar denna månad",
      icon: Banknote,
    },
    {
      label: "Snittorder",
      value: currency(data.summary.avgTicket),
      description: `Plattformssnitt • rating ${data.summary.avgRating.toFixed(1)}`,
      icon: Sparkles,
    },
  ];

  const laneData = Object.entries(data.liveStatusCounts).map(([status, count]) => ({
    status,
    label: STATUS_LABELS[status] || status,
    count,
    fill: STATUS_COLORS[status] || "#f5bf5b",
  }));

  const paymentMix = data.paymentMix.map((entry, index) => ({
    ...entry,
    fill: ["#f5bf5b", "#60a5fa", "#34d399", "#a78bfa", "#f472b6"][index % 5],
  }));
  const hasPaymentMix = paymentMix.length > 0;
  const topAlertPlaybook = data.alerts[0] ? getAlertPlaybook(data.alerts[0]) : null;

  return (
    <div className="space-y-5 pb-16">
      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <section className="panel relative overflow-hidden rounded-[32px] px-6 py-6 sm:px-8 sm:py-8">
          <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,_rgba(245,191,91,0.2),_transparent_65%)]" />
          <div className="relative space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-3">
                <span className="control-chip">Ny plattformsöversikt</span>
                <div className="space-y-2">
                  <h2 className="text-3xl font-black tracking-[-0.06em] text-[var(--text-primary)] sm:text-5xl">
                    Ett kontrolltorn istället för fem dashboards.
                  </h2>
                  <p className="max-w-2xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
                    {selectedRestaurantName
                      ? `${selectedRestaurantName} är vald som scope. Alla kort, payouts och risker nedan är filtrerade till den restaurangen.`
                      : "Du ser nu en samlad desktop-yta för drift, payout, kundsignaler, kvalitet och säkerhetsläge utan överlappande stats-sidor."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void refresh()}
                className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-3 text-[11px] font-black uppercase tracking-[0.24em] text-[var(--text-primary)]"
              >
                <RefreshCw size={14} /> Uppdatera
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {LAUNCHPAD.map((entry) => {
                const Icon = entry.icon;
                return (
                  <Link key={entry.href} href={entry.href} className="panel-muted group rounded-[24px] px-4 py-4 hover:border-[var(--border-strong)]">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(245,191,91,0.14)] text-amber-200 transition group-hover:translate-y-[-2px]">
                      <Icon size={18} />
                    </div>
                    <div className="mt-4 space-y-2">
                      <p className="text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">{entry.label}</p>
                      <p className="text-sm leading-6 text-[var(--text-secondary)]">{entry.description}</p>
                    </div>
                    <div className="mt-4 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-amber-200">
                      Öppna <ArrowRight size={14} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
          <div className="panel rounded-[32px] px-6 py-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Säkerhetsläge</p>
                <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Hårdad adminyta</h3>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400/12 text-emerald-200">
                <ShieldCheck size={20} />
              </div>
            </div>
            <div className="mt-5 grid gap-2">
              {data.security.notes.map((note) => (
                <div key={note} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-3 text-sm leading-6 text-[var(--text-secondary)]">
                  {note}
                </div>
              ))}
            </div>
          </div>

          <div className="panel rounded-[32px] px-6 py-6">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Top alert</p>
            {data.alerts[0] ? (
              <div className="mt-4 rounded-[24px] border border-amber-300/18 bg-amber-300/10 px-5 py-5">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-100">{data.alerts[0].domain}</p>
                <h3 className="mt-2 text-xl font-black tracking-[-0.03em] text-[var(--text-primary)]">{data.alerts[0].title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{data.alerts[0].description}</p>
                {topAlertPlaybook ? (
                  <div className="mt-4 grid gap-2">
                    {topAlertPlaybook.steps.map((step, index) => (
                      <div key={step} className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm leading-6 text-[var(--text-secondary)]">
                        <span className="mr-2 font-black text-[var(--text-primary)]">{index + 1}.</span>
                        {step}
                      </div>
                    ))}
                    <Link href={topAlertPlaybook.href} className="control-chip w-fit">
                      {topAlertPlaybook.label} <ArrowRight size={13} />
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 rounded-[24px] border border-emerald-300/20 bg-emerald-300/10 px-5 py-5 text-sm leading-6 text-emerald-100">
                Inga kritiska signaler just nu. Panelen ser ren ut.
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {metricCards.map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.label} className="metric-card panel-muted">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">{metric.label}</p>
                  <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{metric.value}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(245,191,91,0.12)] text-amber-200">
                  <Icon size={18} />
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">{metric.description}</p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-5 2xl:grid-cols-[1.35fr_0.85fr_0.8fr]">
        <div className="panel rounded-[32px] px-6 py-6 sm:px-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Livekurva</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">7 dagars momentum</h3>
            </div>
            <span className="control-chip">Revenue + orders</span>
          </div>
          <div className="mt-6 h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend}>
                <defs>
                  <linearGradient id="dashboardRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f5bf5b" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#f5bf5b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "rgba(203,213,225,0.7)", fontSize: 12, fontWeight: 700 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "rgba(203,213,225,0.54)", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    background: "rgba(7,10,20,0.94)",
                    border: "1px solid rgba(148,163,184,0.18)",
                    borderRadius: 20,
                    color: "#f8fafc",
                  }}
                  formatter={(value: number, key) => [key === "revenue" ? currency(value) : value, key === "revenue" ? "Omsättning" : "Ordrar"]}
                />
                <Area type="monotone" dataKey="revenue" stroke="#f5bf5b" fill="url(#dashboardRevenue)" strokeWidth={3} />
                <Bar dataKey="orders" barSize={14} fill="rgba(96,165,250,0.8)" radius={[8, 8, 0, 0]} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel rounded-[32px] px-6 py-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Live queue</p>
            <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Status nu</h3>
          </div>
          <div className="mt-6 h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={laneData} layout="vertical" margin={{ left: 12, right: 12 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.1)" horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: "rgba(203,213,225,0.6)", fontSize: 11 }} />
                <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "rgba(248,250,252,0.82)", fontSize: 12, fontWeight: 700 }} width={96} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  contentStyle={{
                    background: "rgba(7,10,20,0.94)",
                    border: "1px solid rgba(148,163,184,0.18)",
                    borderRadius: 20,
                    color: "#f8fafc",
                  }}
                />
                <Bar dataKey="count" radius={[10, 10, 10, 10]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel rounded-[32px] px-6 py-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Betalmix</p>
            <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">30 dagar</h3>
          </div>
          <div className="mt-4 h-[210px] w-full">
            {hasPaymentMix ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={paymentMix} dataKey="revenue" nameKey="method" innerRadius={52} outerRadius={84} paddingAngle={3}>
                    {paymentMix.map((entry) => (
                      <Cell key={entry.method} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "rgba(7,10,20,0.94)",
                      border: "1px solid rgba(148,163,184,0.18)",
                      borderRadius: 20,
                      color: "#f8fafc",
                    }}
                    formatter={(value: number) => currency(value)}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">Ingen betaldata ännu</div>
            )}
          </div>
          <div className="mt-2 grid gap-2">
            {paymentMix.map((entry) => (
              <div key={entry.method} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: entry.fill }} />
                  <span className="text-sm font-bold text-[var(--text-primary)]">{entry.method}</span>
                </div>
                <span className="text-sm font-black text-[var(--text-secondary)]">{currency(entry.revenue)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 2xl:grid-cols-[1.2fr_0.95fr_0.85fr]">
        <div className="panel rounded-[32px] px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Alert center</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Vad kräver din uppmärksamhet?</h3>
            </div>
            <span className="control-chip">{data.alerts.length} aktiva signaler</span>
          </div>
          <div className="mt-5 grid gap-3">
            {data.alerts.length === 0 ? (
              <div className="rounded-[24px] border border-emerald-300/20 bg-emerald-300/10 px-5 py-4 text-sm leading-6 text-emerald-100">
                Inga öppna incidenter just nu. Kontrolltornet ser stabilt ut.
              </div>
            ) : (
              data.alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`rounded-[24px] border px-5 py-4 ${
                    alert.severity === "high"
                      ? "border-rose-300/20 bg-rose-300/10"
                      : alert.severity === "medium"
                      ? "border-amber-300/20 bg-amber-300/10"
                      : "border-sky-300/20 bg-sky-300/10"
                  }`}
                >
                  {(() => {
                    const playbook = getAlertPlaybook(alert);

                    return (
                      <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-primary)]">{alert.title}</p>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">{alert.domain}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{alert.description}</p>
                        <div className="mt-4 grid gap-2">
                          {playbook.steps.map((step, index) => (
                            <div key={step} className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm leading-6 text-[var(--text-secondary)]">
                              <span className="mr-2 font-black text-[var(--text-primary)]">{index + 1}.</span>
                              {step}
                            </div>
                          ))}
                          <Link href={playbook.href} className="control-chip w-fit">
                            {playbook.label} <ArrowRight size={13} />
                          </Link>
                        </div>
                      </>
                    );
                  })()}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel rounded-[32px] px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Payout queue</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Vem ska betalas ut?</h3>
            </div>
            <Link href="/finance" className="control-chip">Öppna Finance HQ</Link>
          </div>
          <div className="mt-5 grid gap-3">
            {data.payoutQueue.slice(0, 6).map((entry) => (
              <div key={entry.restaurantId} className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-black tracking-[-0.03em] text-[var(--text-primary)]">{entry.name}</p>
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">{entry.featuredLabel} • {entry.orderCount} ordrar</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${entry.readiness === "ready" ? "bg-emerald-300/12 text-emerald-100" : "bg-amber-300/12 text-amber-100"}`}>
                    {entry.readiness === "ready" ? "Redo" : "Åtgärd"}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-sm text-[var(--text-secondary)]">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Brutto</p>
                    <p className="mt-1 font-black text-[var(--text-primary)]">{currency(entry.grossSales)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Provision</p>
                    <p className="mt-1 font-black text-[var(--text-primary)]">{currency(entry.commission)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Utbetalning</p>
                    <p className="mt-1 font-black text-amber-200">{currency(entry.payout)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel rounded-[32px] px-6 py-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Kundwatch</p>
            <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Högst värde just nu</h3>
          </div>
          <div className="mt-5 grid gap-3">
            {data.customerSignals.slice(0, 6).map((customer) => (
              <div key={customer.id} className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-black tracking-[-0.03em] text-[var(--text-primary)]">{customer.label}</p>
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">{customer.favoriteRestaurant || "Okänd favorit"}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${customer.verified ? "bg-emerald-300/12 text-emerald-100" : "bg-slate-400/12 text-slate-200"}`}>
                    {customer.verified ? "Verifierad" : "Gäst"}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 text-sm text-[var(--text-secondary)]">
                  <span>{customer.orders} ordrar</span>
                  <span className="font-black text-[var(--text-primary)]">{currency(customer.totalSpent)}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">Senast aktiv {relativeDate(customer.lastOrderAt)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 2xl:grid-cols-[1.35fr_0.85fr]">
        <div className="panel rounded-[32px] px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Restaurant radar</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Driftläge per restaurang</h3>
            </div>
            <Link href="/restaurant-ops" className="control-chip">Öppna hubben</Link>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {data.restaurantSnapshots.slice(0, 8).map((restaurant) => (
              <div key={restaurant.id} className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-black tracking-[-0.04em] text-[var(--text-primary)]">{restaurant.name}</p>
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">
                      {restaurant.city || "Ingen stad"} • {restaurant.featuredLabel}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${restaurant.isOpen ? "bg-emerald-300/12 text-emerald-100" : "bg-rose-300/12 text-rose-100"}`}>
                    {restaurant.isOpen ? "Öppet" : "Stängt"}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Idag</p>
                    <p className="mt-1 text-lg font-black text-[var(--text-primary)]">{currency(restaurant.todayRevenue)}</p>
                    <p className="text-xs text-[var(--text-muted)]">{restaurant.todayOrders} ordrar</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Payout</p>
                    <p className="mt-1 text-lg font-black text-amber-200">{currency(restaurant.payoutEstimate)}</p>
                    <p className="text-xs text-[var(--text-muted)]">{restaurant.pendingOrders} väntande</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="control-chip">Focus: {restaurant.focus}</span>
                  <span className="control-chip">Rating {restaurant.reviewScore.toFixed(1)}</span>
                  <span className="control-chip">ETA {restaurant.etaMinutes} min</span>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 text-sm text-[var(--text-secondary)]">
                  <span>{restaurant.slug}</span>
                  <Link href={`/restaurants/${restaurant.id}`} className="inline-flex items-center gap-2 font-black uppercase tracking-[0.18em] text-amber-200">
                    Detalj <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel rounded-[32px] px-6 py-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Senaste recensioner</p>
            <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Kvalitet i realtid</h3>
          </div>
          <div className="mt-5 grid gap-3">
            {data.recentReviews.map((review) => (
              <div key={review.id} className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.18em] text-amber-200">{review.restaurantName || "MatGo"}</p>
                    <p className="mt-1 text-base font-black tracking-[-0.03em] text-[var(--text-primary)]">{review.customerName}</p>
                  </div>
                  <span className="rounded-full bg-[rgba(245,191,91,0.12)] px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-amber-100">
                    {review.rating}/5
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{review.review || "Ingen kommentar lämnad."}</p>
                <p className="mt-3 text-xs text-[var(--text-muted)]">{relativeDate(review.reviewedAt)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
