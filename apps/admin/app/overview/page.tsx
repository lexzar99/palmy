/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import Link from "next/link";
import {
  Loader2,
  ShoppingBag,
  CreditCard,
  Zap,
  TrendingUp,
  TrendingDown,
  Users,
  Store,
  ChevronRight,
  BarChart3,
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  Package,
  Bell,
  Tag,
  MapPin,
  MessageSquare,
  Sparkles,
  Shield,
  ArrowRight,
  Truck,
  RefreshCw,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { useRestaurantStore } from "@/store/restaurantStore";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type Range = "today" | "yesterday" | "7d" | "30d";

const RANGE_OPTIONS: { id: Range; label: string }[] = [
  { id: "today", label: "Idag" },
  { id: "yesterday", label: "Igår" },
  { id: "7d", label: "7 dagar" },
  { id: "30d", label: "30 dagar" },
];

const QUICK_LINKS = [
  { href: "/orders/new", label: "Nya ordrar", icon: Bell, color: "text-rose-400", bg: "bg-rose-500/10" },
  { href: "/restaurants", label: "Restauranger", icon: Store, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { href: "/deals", label: "Kampanjer", icon: Tag, color: "text-violet-400", bg: "bg-violet-500/10" },
  { href: "/coupons", label: "Rabattkoder", icon: Tag, color: "text-amber-400", bg: "bg-amber-500/10" },
  { href: "/customers", label: "Kunder", icon: Users, color: "text-sky-400", bg: "bg-sky-500/10" },
  { href: "/reviews", label: "Recensioner", icon: MessageSquare, color: "text-pink-400", bg: "bg-pink-500/10" },
  { href: "/cities", label: "Zoner", icon: MapPin, color: "text-teal-400", bg: "bg-teal-500/10" },
  { href: "/staff", label: "Personal", icon: Shield, color: "text-indigo-400", bg: "bg-indigo-500/10" },
];

export default function OverviewPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("today");
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const { selectedRestaurantId } = useRestaurantStore();

  const token = () =>
    typeof window !== "undefined" ? localStorage.getItem("matgo_token") || "" : "";

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const restaurantParam = selectedRestaurantId ? `&restaurantId=${selectedRestaurantId}` : "";
      const [ordersRes, restaurantsRes, customersRes] = await Promise.allSettled([
        axios.get(`${API_URL}/api/admin/orders?limit=1000${restaurantParam}`, {
          headers: { Authorization: `Bearer ${token()}` },
        }),
        axios.get(`${API_URL}/api/restaurants`),
        axios.get(`${API_URL}/api/customers`, {
          headers: { Authorization: `Bearer ${token()}` },
        }),
      ]);

      if (ordersRes.status === "fulfilled") setOrders(ordersRes.value.data.orders || []);
      if (restaurantsRes.status === "fulfilled") setRestaurants(restaurantsRes.value.data);
      if (customersRes.status === "fulfilled") setCustomers(customersRes.value.data);
      setLastRefresh(new Date());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [selectedRestaurantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const { current, prev, chartData } = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const d7 = new Date(today); d7.setDate(today.getDate() - 7);
    const d30 = new Date(today); d30.setDate(today.getDate() - 30);
    const d14 = new Date(today); d14.setDate(today.getDate() - 14);
    const d60 = new Date(today); d60.setDate(today.getDate() - 60);

    let curr: any[], cmp: any[];

    if (range === "today") {
      curr = orders.filter((o) => new Date(o.createdAt) >= today);
      cmp = orders.filter((o) => new Date(o.createdAt) >= yesterday && new Date(o.createdAt) < today);
    } else if (range === "yesterday") {
      curr = orders.filter((o) => new Date(o.createdAt) >= yesterday && new Date(o.createdAt) < today);
      const dayBefore = new Date(yesterday); dayBefore.setDate(dayBefore.getDate() - 1);
      cmp = orders.filter((o) => new Date(o.createdAt) >= dayBefore && new Date(o.createdAt) < yesterday);
    } else if (range === "7d") {
      curr = orders.filter((o) => new Date(o.createdAt) >= d7);
      const prev7 = new Date(d7); prev7.setDate(d7.getDate() - 7);
      cmp = orders.filter((o) => new Date(o.createdAt) >= prev7 && new Date(o.createdAt) < d7);
    } else {
      curr = orders.filter((o) => new Date(o.createdAt) >= d30);
      cmp = orders.filter((o) => new Date(o.createdAt) >= d60 && new Date(o.createdAt) < d30);
    }

    const rev = curr.reduce((s, o) => s + (o.total || 0), 0);
    const prevRev = cmp.reduce((s, o) => s + (o.total || 0), 0);
    const revDiff = prevRev > 0 ? ((rev - prevRev) / prevRev) * 100 : 0;
    const countDiff = cmp.length > 0 ? ((curr.length - cmp.length) / cmp.length) * 100 : 0;

    // Chart: group by hour (today) or by day (others)
    const chartMap: Record<string, { revenue: number; orders: number }> = {};
    if (range === "today" || range === "yesterday") {
      for (let h = 0; h < 24; h++) {
        chartMap[String(h).padStart(2, "0") + ":00"] = { revenue: 0, orders: 0 };
      }
      curr.forEach((o) => {
        const key = String(new Date(o.createdAt).getHours()).padStart(2, "0") + ":00";
        if (chartMap[key]) {
          chartMap[key].revenue += (o.total || 0) / 100;
          chartMap[key].orders += 1;
        }
      });
    } else {
      const days = range === "7d" ? 7 : 30;
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = d.toLocaleDateString("sv-SE", { month: "short", day: "numeric" });
        chartMap[key] = { revenue: 0, orders: 0 };
      }
      curr.forEach((o) => {
        const key = new Date(o.createdAt).toLocaleDateString("sv-SE", { month: "short", day: "numeric" });
        if (chartMap[key]) {
          chartMap[key].revenue += (o.total || 0) / 100;
          chartMap[key].orders += 1;
        }
      });
    }

    return {
      current: {
        rev, count: curr.length, avg: curr.length > 0 ? rev / curr.length : 0,
        revDiff, countDiff,
        delivered: curr.filter((o) => o.status === "DELIVERED").length,
        cancelled: curr.filter((o) => ["CANCELLED", "REJECTED"].includes(o.status)).length,
        pending: curr.filter((o) => o.status === "PENDING").length,
        recent: [...curr].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8),
      },
      prev: cmp,
      chartData: Object.entries(chartMap).map(([time, data]) => ({ time, ...data })),
    };
  }, [orders, range]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="animate-spin text-gold-500" size={32} />
        <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] animate-pulse">
          Laddar dashboard...
        </p>
      </div>
    );
  }

  const Diff = ({ value }: { value: number }) => (
    <div
      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-black ${
        value >= 0
          ? "bg-emerald-500/10 text-emerald-400"
          : "bg-rose-500/10 text-rose-400"
      }`}
    >
      {value >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {Math.abs(Math.round(value))}%
    </div>
  );

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[var(--text-primary)]">
            Dashboard
          </h1>
          <p className="text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-widest mt-1 flex items-center gap-2">
            Plattformsöversikt i realtid
            <span className="opacity-40">·</span>
            <span className="opacity-40 flex items-center gap-1">
              <Clock size={9} />
              Uppdaterad {lastRefresh.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAll}
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-gold-500 hover:border-gold-500/20 transition-all"
            title="Uppdatera"
          >
            <RefreshCw size={14} />
          </button>
          <div className="flex gap-1 p-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                  range === r.id
                    ? "bg-gold-gradient text-[#0d0d0d] glow-gold-sm"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Access Grid */}
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
        {QUICK_LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="flex flex-col items-center gap-2 p-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:border-gold-500/15 transition-all group"
            >
              <div className={`w-9 h-9 rounded-xl ${link.bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                <Icon size={16} className={link.color} />
              </div>
              <span className="text-[7px] font-black uppercase tracking-wider text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                {link.label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          {
            label: "Omsättning",
            value: `${Math.round(current.rev / 100).toLocaleString("sv-SE")} kr`,
            icon: CreditCard,
            color: "text-gold-500",
            bg: "bg-gold-500/10",
            diff: current.revDiff,
          },
          {
            label: "Beställningar",
            value: current.count,
            icon: ShoppingBag,
            color: "text-blue-400",
            bg: "bg-blue-500/10",
            diff: current.countDiff,
          },
          {
            label: "Snittorder",
            value: `${Math.round(current.avg / 100)} kr`,
            icon: Zap,
            color: "text-emerald-400",
            bg: "bg-emerald-500/10",
            diff: null,
          },
          {
            label: "Levererade",
            value: current.delivered,
            icon: CheckCircle2,
            color: "text-emerald-400",
            bg: "bg-emerald-500/10",
            diff: null,
          },
          {
            label: "Väntande",
            value: current.pending,
            icon: Clock,
            color: "text-amber-400",
            bg: "bg-amber-500/10",
            diff: null,
          },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] relative overflow-hidden group hover:border-gold-500/10 transition-all"
            >
              {/* Subtle glow on hover */}
              <div className="absolute inset-0 bg-gradient-to-br from-gold-500/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center`}>
                    <Icon size={16} className={s.color} />
                  </div>
                  {s.diff !== null && <Diff value={s.diff} />}
                </div>
                <div className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1">
                  {s.label}
                </div>
                <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Platform stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          {
            label: "Restauranger",
            value: restaurants.length,
            sub: `${restaurants.filter((r) => r.isOpen).length} öppna nu`,
            icon: Store,
            href: "/restaurants",
          },
          {
            label: "Kunder",
            value: customers.length,
            sub: `${customers.filter((c) => c.isActive).length} aktiva`,
            icon: Users,
            href: "/customers",
          },
          {
            label: "Avbokade",
            value: current.cancelled,
            sub: "Nekade + avbokade",
            icon: XCircle,
            href: "/history",
          },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.label}
              href={s.href}
              className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex items-center gap-4 hover:border-gold-500/15 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] group-hover:text-gold-500 transition-colors">
                <Icon size={17} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
                  {s.label}
                </div>
                <div className="text-xl font-black text-[var(--text-primary)]">{s.value}</div>
                <div className="text-[8px] text-[var(--text-secondary)] font-bold">{s.sub}</div>
              </div>
              <ChevronRight size={14} className="text-[var(--text-secondary)] group-hover:text-gold-500 transition-colors" />
            </Link>
          );
        })}
      </div>

      {/* Revenue chart */}
      <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)]">
            Omsättning
          </h3>
          <span className="text-[9px] font-bold text-[var(--text-secondary)]">
            {range === "today" ? "Per timme" : range === "yesterday" ? "Per timme (igår)" : range === "7d" ? "Senaste 7 dagarna" : "Senaste 30 dagarna"}
          </span>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#E7B24B" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#E7B24B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis
                dataKey="time"
                tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9, fontWeight: 700 }}
                axisLine={false}
                tickLine={false}
                interval={range === "today" || range === "yesterday" ? 3 : "preserveStartEnd"}
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9, fontWeight: 700 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-secondary)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 700,
                  boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
                }}
                formatter={(v: any) => [`${Math.round(v)} kr`, "Omsättning"]}
                labelStyle={{ color: "rgba(255,255,255,0.4)", fontSize: 9, fontWeight: 900, textTransform: "uppercase" }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#E7B24B"
                strokeWidth={2}
                fill="url(#revGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent orders */}
      <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)]">
            Senaste beställningar
          </h3>
          <Link
            href="/orders"
            className="text-[9px] font-black uppercase tracking-widest text-gold-500 hover:text-gold-400 flex items-center gap-1 transition-colors"
          >
            Visa alla <ChevronRight size={12} />
          </Link>
        </div>
        <div className="space-y-2">
          {current.recent.length === 0 ? (
            <p className="py-8 text-center text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-30">
              Inga beställningar
            </p>
          ) : (
            current.recent.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] hover:border-gold-500/10 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-center text-[8px] font-black text-[var(--text-secondary)]">
                    #{o.orderNumber}
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase text-[var(--text-primary)]">
                      {o.customerName}
                    </p>
                    <p className="text-[9px] font-bold text-[var(--text-secondary)]">
                      {o.restaurantName && `${o.restaurantName} · `}
                      {new Date(o.createdAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black text-gold-500">
                    {Math.round((o.total || 0) / 100)} kr
                  </span>
                  <span
                    className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded border ${
                      o.status === "DELIVERED"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : o.status === "PENDING"
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        : o.status === "PREPARING"
                        ? "bg-sky-500/10 text-sky-400 border-sky-500/20"
                        : "bg-[var(--border-subtle)] text-[var(--text-secondary)] border-[var(--border-subtle)]"
                    }`}
                  >
                    {o.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Restaurant status overview */}
      {restaurants.length > 0 && (
        <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)]">
              Restaurangstatus
            </h3>
            <Link
              href="/restaurants"
              className="text-[9px] font-black uppercase tracking-widest text-gold-500 hover:text-gold-400 flex items-center gap-1 transition-colors"
            >
              Hantera <ChevronRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {restaurants.map((r) => (
              <Link
                key={r.id}
                href={`/restaurants/${r.id}`}
                className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] hover:border-gold-500/15 transition-all group"
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${r.isOpen ? "bg-emerald-400 shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "bg-[var(--text-secondary)] opacity-30"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black uppercase truncate text-[var(--text-primary)]">{r.name}</p>
                  <p className="text-[8px] font-bold text-[var(--text-secondary)]">{r.isOpen ? "Öppen" : "Stängd"}</p>
                </div>
                <ChevronRight size={12} className="text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
