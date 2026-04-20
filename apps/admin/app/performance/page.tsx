"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  Loader2,
  RefreshCw,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-storage";
import { useControlCenter } from "@/lib/use-control-center";
import { useRestaurantStore } from "@/store/restaurantStore";

const currency = (value: number) => `${Math.round(value).toLocaleString("sv-SE")} kr`;
const compact = (value: number) => Intl.NumberFormat("sv-SE", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const relativeDate = (value: string) => new Intl.DateTimeFormat("sv-SE", { month: "short", day: "numeric" }).format(new Date(value));

type BiReport = {
  summary: {
    totalOrders: number;
    newCustomersSinceStart: number;
    currentMonthRevenue: number;
    prevMonthRevenue: number;
  };
  chartData: Array<{ month: string; revenue: number; orders: number }>;
  topProducts: Array<{ name: string; count: number; revenue: number }>;
};

type CustomerReport = {
  total: number;
  newlyRegistered: number;
  activeLastPeriod: number;
  retentionRate: number;
};

export default function PerformancePage() {
  const { data, loading, error, refresh, selectedRestaurantId } = useControlCenter();
  const { selectedRestaurantName } = useRestaurantStore();
  const [biData, setBiData] = useState<BiReport | null>(null);
  const [customerData, setCustomerData] = useState<CustomerReport | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadDetailData = async () => {
    const token = getStoredToken();
    if (!token) {
      setDetailError("Ingen admin-session hittades.");
      setDetailLoading(false);
      return;
    }

    setDetailLoading(true);
    setDetailError(null);

    try {
      const requests = [
        axios.get(`${API_URL}/api/admin/reports/bi`, {
          headers: { Authorization: `Bearer ${token}` },
          params: selectedRestaurantId ? { restaurantId: selectedRestaurantId, months: 6 } : { months: 6 },
        }),
      ];

      if (!selectedRestaurantId) {
        requests.push(
          axios.get(`${API_URL}/api/admin/reports/customers`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { days: 30 },
          })
        );
      }

      const [biResponse, customerResponse] = await Promise.all(requests);
      setBiData(biResponse.data);
      setCustomerData((customerResponse as { data?: CustomerReport } | undefined)?.data || null);
    } catch (err: any) {
      setDetailError(err.response?.data?.error || "Kunde inte ladda performance-data.");
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadDetailData();
  }, [selectedRestaurantId]);

  const revenueDelta = useMemo(() => {
    if (!biData?.summary.prevMonthRevenue) return 0;
    return ((biData.summary.currentMonthRevenue - biData.summary.prevMonthRevenue) / biData.summary.prevMonthRevenue) * 100;
  }, [biData]);

  if (loading || detailLoading) {
    return (
      <div className="panel flex min-h-[360px] items-center justify-center rounded-[32px] px-6 py-12">
        <div className="flex items-center gap-3 text-[var(--text-secondary)]">
          <Loader2 className="animate-spin text-amber-200" size={18} />
          <span className="text-sm font-bold">Laddar samlad performance-vy…</span>
        </div>
      </div>
    );
  }

  if (!data || !biData || error || detailError) {
    return (
      <div className="panel flex min-h-[360px] flex-col items-center justify-center gap-4 rounded-[32px] px-6 py-12 text-center">
        <TrendingUp size={34} className="text-amber-200" />
        <h2 className="text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Performance kunde inte laddas</h2>
        <p className="max-w-xl text-sm leading-6 text-[var(--text-secondary)]">{error || detailError || "Något gick fel när analysytan skulle laddas."}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-3 text-[11px] font-black uppercase tracking-[0.24em] text-[var(--text-primary)]">
            <RefreshCw size={14} /> Ladda kontrollcenter
          </button>
          <button type="button" onClick={() => void loadDetailData()} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.24em] text-[#091018]">
            <ArrowUpRight size={14} /> Ladda om analyser
          </button>
        </div>
      </div>
    );
  }

  const highlights = [
    {
      label: selectedRestaurantName ? "Omsättning för vald restaurang" : "Omsättning denna månad",
      value: currency(biData.summary.currentMonthRevenue),
      description: `${revenueDelta >= 0 ? "+" : ""}${revenueDelta.toFixed(1)}% mot föregående månad`,
      icon: Wallet,
    },
    {
      label: selectedRestaurantName ? "Ordrar 6 månader" : "Totala ordrar",
      value: compact(biData.summary.totalOrders),
      description: `Snittorder ${currency(data.summary.avgTicket)}`,
      icon: Sparkles,
    },
    {
      label: selectedRestaurantName ? "Aktiva kunder" : "Kundretention 30 dagar",
      value: selectedRestaurantName ? compact(data.summary.activeCustomers) : `${(customerData?.retentionRate || 0).toFixed(0)}%`,
      description: selectedRestaurantName
        ? `${data.customerSignals.length} värdesignaler i scope`
        : `${customerData?.activeLastPeriod || 0} aktiva kunder senaste 30 dagarna`,
      icon: Users,
    },
    {
      label: "Topp-produkt",
      value: biData.topProducts[0]?.name || "Ingen data",
      description: biData.topProducts[0] ? `${currency(biData.topProducts[0].revenue)} • ${biData.topProducts[0].count} sålda` : "Saknar försäljningsdata",
      icon: Star,
    },
  ];

  return (
    <div className="space-y-5 pb-16">
      <section className="grid gap-4 xl:grid-cols-4">
        {highlights.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.label} className="metric-card panel-muted">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">{item.label}</p>
                  <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{item.value}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(245,191,91,0.12)] text-amber-200">
                  <Icon size={18} />
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">{item.description}</p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-5 2xl:grid-cols-[1.2fr_0.8fr]">
        <div className="panel rounded-[32px] px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Månadsutveckling</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">6 månader i en vy</h3>
            </div>
            <button type="button" onClick={() => void loadDetailData()} className="control-chip">
              <RefreshCw size={13} /> Ladda om
            </button>
          </div>
          <div className="mt-6 h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={biData.chartData}>
                <defs>
                  <linearGradient id="performanceRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f5bf5b" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#f5bf5b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "rgba(203,213,225,0.7)", fontSize: 12, fontWeight: 700 }} />
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
                <Area type="monotone" dataKey="revenue" stroke="#f5bf5b" fill="url(#performanceRevenue)" strokeWidth={3} />
                <Bar dataKey="orders" barSize={16} fill="rgba(96,165,250,0.72)" radius={[8, 8, 0, 0]} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel rounded-[32px] px-6 py-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Topp-produkter</p>
            <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Vad driver omsättningen?</h3>
          </div>
          <div className="mt-5 grid gap-3">
            {biData.topProducts.slice(0, 8).map((product, index) => (
              <div key={product.name} className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(245,191,91,0.12)] text-sm font-black text-amber-200">
                      {index + 1}
                    </div>
                    <div>
                      <p className="text-base font-black tracking-[-0.03em] text-[var(--text-primary)]">{product.name}</p>
                      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">{product.count} sålda</p>
                    </div>
                  </div>
                  <span className="text-sm font-black text-amber-200">{currency(product.revenue)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 2xl:grid-cols-[1.05fr_0.95fr_0.85fr]">
        <div className="panel rounded-[32px] px-6 py-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Restaurant leaderboard</p>
            <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Vinnare och tappare</h3>
          </div>
          <div className="mt-5 grid gap-3">
            {data.restaurantSnapshots.slice(0, 8).map((restaurant) => (
              <div key={restaurant.id} className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-black tracking-[-0.03em] text-[var(--text-primary)]">{restaurant.name}</p>
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">{restaurant.featuredLabel} • {restaurant.city || "Ingen stad"}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${restaurant.isOpen ? "bg-emerald-300/12 text-emerald-100" : "bg-rose-300/12 text-rose-100"}`}>
                    {restaurant.isOpen ? "Öppet" : "Stängt"}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">30 dagar</p>
                    <p className="mt-1 font-black text-[var(--text-primary)]">{currency(restaurant.monthRevenue)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Snitt</p>
                    <p className="mt-1 font-black text-[var(--text-primary)]">{currency(restaurant.avgOrderValue)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Focus</p>
                    <p className="mt-1 font-black text-amber-200">{restaurant.focus}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel rounded-[32px] px-6 py-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Kunder</p>
            <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Vem kommer tillbaka?</h3>
          </div>
          <div className="mt-5 grid gap-3">
            {data.customerSignals.slice(0, 6).map((customer) => (
              <div key={customer.id} className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-black tracking-[-0.03em] text-[var(--text-primary)]">{customer.label}</p>
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">{customer.favoriteRestaurant || "Ingen favorit än"}</p>
                  </div>
                  <span className="text-sm font-black text-amber-200">{currency(customer.totalSpent)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-sm text-[var(--text-secondary)]">
                  <span>{customer.orders} ordrar</span>
                  <span>{relativeDate(customer.lastOrderAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel rounded-[32px] px-6 py-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Reviews</p>
            <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Vad säger kunderna?</h3>
          </div>
          <div className="mt-5 grid gap-3">
            {data.recentReviews.slice(0, 6).map((review) => (
              <div key={review.id} className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.18em] text-amber-200">{review.restaurantName || "MatGo"}</p>
                    <p className="mt-1 text-base font-black tracking-[-0.03em] text-[var(--text-primary)]">{review.customerName}</p>
                  </div>
                  <span className="rounded-full bg-[rgba(245,191,91,0.12)] px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-amber-100">{review.rating}/5</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{review.review || "Ingen kommentar lämnad."}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel rounded-[32px] px-6 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Betalmix</p>
            <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Vilka betalflöden bär plattformen?</h3>
          </div>
          <span className="control-chip">30 dagars mix</span>
        </div>
        <div className="mt-6 h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.paymentMix}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
              <XAxis dataKey="method" tickLine={false} axisLine={false} tick={{ fill: "rgba(203,213,225,0.7)", fontSize: 12, fontWeight: 700 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "rgba(203,213,225,0.54)", fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  background: "rgba(7,10,20,0.94)",
                  border: "1px solid rgba(148,163,184,0.18)",
                  borderRadius: 20,
                  color: "#f8fafc",
                }}
                formatter={(value: number) => currency(value)}
              />
              <Bar dataKey="revenue" radius={[10, 10, 0, 0]} fill="#f5bf5b" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
