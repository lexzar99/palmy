/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import {
  Crown, Medal, Award, Calculator, Download, Loader2,
  TrendingUp, ShoppingCart, CreditCard, RefreshCw, ChevronDown,
  FileText, Calendar, Settings, Store, Check, Search,
} from "lucide-react";
import { motion } from "framer-motion";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { API_URL } from "@/lib/api";
import { useToast } from "@/components/Toast";

// ── Tier config stored in localStorage ───────────────────────────────────────
const LS_KEY = "matgo_billing_config";

interface TierConfig {
  subscriptionFee: number;   // kr/month
  commissionPct: number;     // % of order revenue
}

interface BillingConfig {
  gold: TierConfig;
  silver: TierConfig;
  standard: TierConfig;
}

const DEFAULT_CONFIG: BillingConfig = {
  gold:     { subscriptionFee: 1990, commissionPct: 8  },
  silver:   { subscriptionFee: 990,  commissionPct: 10 },
  standard: { subscriptionFee: 490,  commissionPct: 12 },
};

const TIER_META: Record<number, { label: string; key: keyof BillingConfig; icon: any; color: string; bg: string }> = {
  1: { label: "Guld",     key: "gold",     icon: Crown,  color: "text-gold-500",  bg: "bg-gold-500/10" },
  2: { label: "Silver",   key: "silver",   icon: Medal,  color: "text-blue-400",  bg: "bg-blue-500/10" },
  3: { label: "Standard", key: "standard", icon: Award,  color: "text-[var(--text-secondary)]", bg: "bg-[var(--border-subtle)]" },
};

// ── Period helpers ────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10);
};
const startOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const startOfLastMonth = () => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10);
};
const endOfLastMonth = () => {
  const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 10);
};

const PERIODS = [
  { label: "Idag", from: today(), to: today() },
  { label: "Senaste 7 dagar", from: daysAgo(7), to: today() },
  { label: "Senaste 30 dagar", from: daysAgo(30), to: today() },
  { label: "Denna månad", from: startOfMonth(), to: today() },
  { label: "Förra månaden", from: startOfLastMonth(), to: endOfLastMonth() },
];

const kr = (n: number) => `${n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;

// ── Component ─────────────────────────────────────────────────────────────────
export default function BillingPage() {
  const { error: toastError } = useToast();
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [reports, setReports] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState(3); // This month
  const [customFrom, setCustomFrom] = useState(daysAgo(30));
  const [customTo, setCustomTo] = useState(today());
  const [useCustom, setUseCustom] = useState(false);
  const [config, setConfig] = useState<BillingConfig>(DEFAULT_CONFIG);
  const [showConfig, setShowConfig] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [tierFilter, setTierFilter] = useState<number | "all">("all");

  const period = useCustom ? { from: customFrom, to: customTo } : PERIODS[selectedPeriodIndex];
  const token = () => localStorage.getItem("matgo_token") || "";

  // Load config from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(raw) });
    } catch { /* ignore */ }
  }, []);

  const saveConfig = () => {
    localStorage.setItem(LS_KEY, JSON.stringify(config));
    setShowConfig(false);
  };

  // Fetch restaurants
  useEffect(() => {
    axios.get(`${API_URL}/api/restaurants`).then((r) => setRestaurants(r.data)).catch(() => {});
  }, []);

  // Fetch reports for all restaurants
  const fetchReports = async () => {
    if (restaurants.length === 0) return;
    setLoading(true);
    try {
      const results = await Promise.allSettled(
        restaurants.map((r) =>
          axios.get(`${API_URL}/api/admin/reports/restaurant/${r.id}`, {
            params: { from: period.from, to: period.to },
            headers: { Authorization: `Bearer ${token()}` },
          })
        )
      );
      const map: Record<string, any> = {};
      results.forEach((res, i) => {
        if (res.status === "fulfilled") {
          map[restaurants[i].id] = res.value.data;
        }
      });
      setReports(map);
    } catch {
      toastError("Kunde inte hämta rapporter");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (restaurants.length > 0) fetchReports();
  }, [restaurants, period.from, period.to]);

  // Commission calculations per restaurant
  const rows = useMemo(() => {
    return restaurants
      .filter((r) => {
        const matchesSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesTier = tierFilter === "all" || r.featuredClass === tierFilter;
        return matchesSearch && matchesTier;
      })
      .map((r) => {
        const report = reports[r.id];
        const tierKey = TIER_META[r.featuredClass ?? 3]?.key ?? "standard";
        const tierCfg = config[tierKey];
        const totalRevenue = report?.summary?.totalRevenue ?? 0;
        const totalOrders = report?.summary?.totalOrders ?? 0;

        // Prorated subscription for the period
        const periodDays = Math.max(1, Math.round(
          (new Date(period.to).getTime() - new Date(period.from).getTime()) / (1000 * 60 * 60 * 24)
        ));
        const proratedSubscription = (tierCfg.subscriptionFee / 30) * periodDays;
        const commission = (totalRevenue * tierCfg.commissionPct) / 100;
        const totalPlatformIncome = proratedSubscription + commission;
        const restaurantPayout = totalRevenue - commission; // subscription is flat fee, not deducted from payout

        return {
          restaurant: r,
          report,
          tier: TIER_META[r.featuredClass ?? 3],
          tierCfg,
          totalRevenue,
          totalOrders,
          proratedSubscription,
          commission,
          totalPlatformIncome,
          restaurantPayout,
          periodDays,
        };
      });
  }, [restaurants, reports, config, period, searchTerm, tierFilter]);

  const totals = useMemo(() => ({
    revenue: rows.reduce((s, r) => s + r.totalRevenue, 0),
    orders: rows.reduce((s, r) => s + r.totalOrders, 0),
    subscriptions: rows.reduce((s, r) => s + r.proratedSubscription, 0),
    commission: rows.reduce((s, r) => s + r.commission, 0),
    platformTotal: rows.reduce((s, r) => s + r.totalPlatformIncome, 0),
    payout: rows.reduce((s, r) => s + r.restaurantPayout, 0),
  }), [rows]);

  const exportCSV = () => {
    const headers = ["Restaurang", "Tier", "Ordrar", "Omsättning", "Prenumeration", "Provision", "Plattformsintäkt", "Restaurangutbetalning"];
    const dataRows = rows.map((r) => [
      r.restaurant.name,
      r.tier?.label ?? "Standard",
      r.totalOrders,
      r.totalRevenue.toFixed(2),
      r.proratedSubscription.toFixed(2),
      r.commission.toFixed(2),
      r.totalPlatformIncome.toFixed(2),
      r.restaurantPayout.toFixed(2),
    ]);
    const csv = [headers, ...dataRows, ["TOTALT", "", totals.orders, totals.revenue.toFixed(2), totals.subscriptions.toFixed(2), totals.commission.toFixed(2), totals.platformTotal.toFixed(2), totals.payout.toFixed(2)]]
      .map((r) => r.join(","))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `matgo_fakturering_${period.from}_${period.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputCls = "bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-gold-500/30 w-full";

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[var(--text-primary)] flex items-center gap-3">
            <Calculator size={22} className="text-gold-500" /> Fakturering & Provisioner
          </h1>
          <p className="text-[var(--text-secondary)] text-[9px] font-bold uppercase tracking-widest mt-0.5">
            Beräkna plattformsintäkter, restaurangutbetalningar och provisioner per period
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchReports} disabled={loading}
            className="w-9 h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={() => setShowConfig(!showConfig)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all text-[9px] font-black uppercase ${showConfig ? "bg-gold-500/10 border-gold-500/30 text-gold-500" : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]"}`}>
            <Settings size={13} /> Prismodell
          </button>
          <button onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2.5 border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-gold-500 transition-all font-black uppercase tracking-widest text-[9px] rounded-xl">
            <Download size={13} /> Exportera CSV
          </button>
          <button 
            onClick={async () => {
              if (!confirm(`Vill du skicka rapporter till alla ${rows.length} restauranger i listan?`)) return;
              for (const row of rows) {
                try {
                  const email = row.restaurant.adminEmail || `${row.restaurant.slug}@matgo.se`;
                  await axios.post(`${API_URL}/api/admin/reports/restaurant/${row.restaurant.id}/send`, {
                    email,
                    period: `${period.from} - ${period.to}`
                  }, {
                    headers: { Authorization: `Bearer ${localStorage.getItem("matgo_token")}` }
                  });
                } catch (e) { console.error(e); }
              }
              alert("Klar! Rapporter skickade till alla i kön (MOCK).");
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[9px] rounded-xl shadow-lg shadow-emerald-500/20 transition-all">
            <RefreshCw size={13} /> Skicka till alla
          </button>
        </div>
      </div>

      {/* Pricing config panel */}
      {showConfig && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="p-5 rounded-2xl border border-gold-500/20 bg-gold-500/5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] font-black uppercase tracking-widest text-gold-500">Prismodell per Tier</h2>
            <button onClick={saveConfig}
              className="flex items-center gap-1.5 px-4 py-2 bg-gold-500 text-[#0d0d0d] rounded-xl text-[9px] font-black uppercase">
              <Check size={12} /> Spara
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {([
              { key: "gold" as const, label: "Guld", color: "text-gold-500" },
              { key: "silver" as const, label: "Silver", color: "text-blue-400" },
              { key: "standard" as const, label: "Standard", color: "text-[var(--text-secondary)]" },
            ]).map(({ key, label, color }) => (
              <div key={key} className="space-y-3">
                <p className={`text-[10px] font-black uppercase tracking-widest ${color}`}>{label}</p>
                <div>
                  <label className="text-[8px] font-black uppercase text-[var(--text-secondary)] block mb-1">Månadsavgift (kr)</label>
                  <input type="number" className={inputCls} value={config[key].subscriptionFee}
                    onChange={(e) => setConfig((p) => ({ ...p, [key]: { ...p[key], subscriptionFee: Number(e.target.value) } }))} />
                </div>
                <div>
                  <label className="text-[8px] font-black uppercase text-[var(--text-secondary)] block mb-1">Provision (%)</label>
                  <input type="number" className={inputCls} value={config[key].commissionPct} step={0.1}
                    onChange={(e) => setConfig((p) => ({ ...p, [key]: { ...p[key], commissionPct: Number(e.target.value) } }))} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[8px] text-[var(--text-secondary)] mt-3 font-bold">
            Månadsavgiften fördelas proportionellt om perioden är kortare/längre än 30 dagar.
          </p>
        </motion.div>
      )}

      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2">
        <Calendar size={14} className="text-[var(--text-secondary)]" />
        <div className="flex flex-wrap gap-1 p-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl">
          {PERIODS.map((p, i) => (
            <button key={p.label} onClick={() => { setSelectedPeriodIndex(i); setUseCustom(false); }}
              className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${!useCustom && selectedPeriodIndex === i ? "bg-gold-500 text-[#0d0d0d]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
              {p.label}
            </button>
          ))}
          <button onClick={() => setUseCustom(true)}
            className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${useCustom ? "bg-gold-500 text-[#0d0d0d]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
            Anpassad
          </button>
        </div>
        {useCustom && (
          <>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
              className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[10px] font-bold outline-none focus:border-gold-500/30" />
            <span className="text-[var(--text-secondary)] text-xs">–</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
              className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[10px] font-bold outline-none focus:border-gold-500/30" />
          </>
        )}
        <span className="text-[9px] font-black text-[var(--text-secondary)]">
          {period.from} → {period.to}
        </span>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Sök restaurang..."
            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl pl-9 pr-4 py-2.5 text-[11px] font-bold outline-none focus:border-gold-500/30 transition-all"
          />
        </div>
        <div className="flex gap-1 p-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl">
          <button onClick={() => setTierFilter("all")}
            className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${tierFilter === "all" ? "bg-gold-500 text-[#0d0d0d]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
            Alla Tiers
          </button>
          {[
            { value: 1, label: "Guld", color: "text-gold-500", bg: "bg-gold-500/10 border-gold-500/20" },
            { value: 2, label: "Silver", color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/20" },
            { value: 3, label: "Standard", color: "text-[var(--text-secondary)]", bg: "bg-[var(--border-subtle)]" },
          ].map((t) => (
            <button key={t.value} onClick={() => setTierFilter(t.value)}
              className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${tierFilter === t.value ? `${t.bg} ${t.color}` : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: "Total omsättning", value: kr(totals.revenue), icon: TrendingUp, color: "text-[var(--text-primary)]", sub: "Grovomsättning" },
          { label: "Totalt ordrar", value: totals.orders.toString(), icon: ShoppingCart, color: "text-blue-400", sub: "Volym per period" },
          { label: "Fast intäkt", value: kr(totals.subscriptions), icon: Calendar, color: "text-purple-400", sub: "Prenumerationer" },
          { label: "Rörlig intäkt", value: kr(totals.commission), icon: RefreshCw, color: "text-gold-500", sub: "Provisioner" },
          { label: "Plattform vinst", value: kr(totals.platformTotal), icon: CreditCard, color: "text-emerald-400", sub: "Total för plattformen", highlight: true },
          { label: "Utbetalning", value: kr(totals.payout), icon: Store, color: "text-rose-400", sub: "Till restauranger" },
        ].map((kpi) => (
          <div key={kpi.label} 
            className={`p-4 rounded-2xl border transition-all ${kpi.highlight ? "bg-emerald-500/5 border-emerald-500/20" : "bg-[var(--bg-secondary)] border-[var(--border-subtle)]"}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-secondary)]">{kpi.label}</span>
              <kpi.icon size={12} className={kpi.color} />
            </div>
            <p className={`text-lg font-black ${kpi.color}`}>{kpi.value}</p>
            <p className="text-[8px] font-medium text-[var(--text-secondary)] mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Per-restaurant table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3">
          <Loader2 className="animate-spin text-gold-500" size={24} />
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Beräknar...</span>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border-subtle)]">
          <table className="w-full text-[10px] font-bold">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
                {["Restaurang", "Tier", "Ordrar", "Omsättning", `Prenumeration (${rows[0]?.periodDays ?? "—"} dgr)`, "Provision", "Plattformens intäkt", "Restaurangens utbet."].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const Icon = row.tier?.icon ?? Award;
                return (
                  <tr key={row.restaurant.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Store size={13} className="text-[var(--text-secondary)] shrink-0" />
                          {row.totalRevenue > 0 && row.totalRevenue === Math.max(...rows.map(r => r.totalRevenue)) && (
                            <Crown size={8} className="absolute -top-1.5 -right-1.5 text-gold-500 fill-gold-500 animate-bounce" />
                          )}
                        </div>
                        <div>
                          <p className="font-black text-[var(--text-primary)]">{row.restaurant.name}</p>
                          <p className="text-[8px] text-[var(--text-secondary)] opacity-50">{row.restaurant.city || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1 w-fit px-2 py-1 rounded-lg ${row.tier?.bg ?? ""} ${row.tier?.color ?? ""} text-[8px] font-black uppercase`}>
                        <Icon size={10} /> {row.tier?.label ?? "Standard"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-black text-blue-400">{row.totalOrders}</td>
                    <td className="px-4 py-3 font-black text-[var(--text-primary)]">{kr(row.totalRevenue)}</td>
                    <td className="px-4 py-3 text-purple-400">{kr(row.proratedSubscription)}</td>
                    <td className="px-4 py-3 text-gold-500">
                      {kr(row.commission)}
                      <span className="text-[8px] text-[var(--text-secondary)] ml-1">({row.tierCfg.commissionPct}%)</span>
                    </td>
                    <td className="px-4 py-3 font-black text-gold-500">{kr(row.totalPlatformIncome)}</td>
                    <td className="px-4 py-3 font-black text-emerald-400">{kr(row.restaurantPayout)}</td>
                  </tr>
                );
              })}

              {/* Totals row */}
              <tr className="bg-gold-500/5 border-t-2 border-gold-500/20">
                <td className="px-4 py-3 font-black text-[var(--text-primary)] uppercase" colSpan={2}>TOTALT</td>
                <td className="px-4 py-3 font-black text-blue-400">{totals.orders}</td>
                <td className="px-4 py-3 font-black text-[var(--text-primary)]">{kr(totals.revenue)}</td>
                <td className="px-4 py-3 font-black text-purple-400">{kr(totals.subscriptions)}</td>
                <td className="px-4 py-3 font-black text-gold-500">{kr(totals.commission)}</td>
                <td className="px-4 py-3 font-black text-gold-500">{kr(totals.platformTotal)}</td>
                <td className="px-4 py-3 font-black text-emerald-400">{kr(totals.payout)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Per-restaurant detail cards */}
      <div className="space-y-4">
        <h2 className="text-[13px] font-black uppercase tracking-tight text-[var(--text-primary)]">Detaljerad per restaurang</h2>
        {rows.map((row) => (
          <RestaurantDetailCard key={row.restaurant.id} row={row} period={period} />
        ))}
      </div>
    </div>
  );
}

// ── Per-restaurant collapsible card ──────────────────────────────────────────
function RestaurantDetailCard({ row, period }: { row: any; period: any }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const { success, error: toastError } = useToast();

  const Icon = row.tier?.icon ?? Award;
  const report = row.report;

  const kr = (n: number) => `${n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;

  const exportRestaurantPDF = () => {
    if (typeof window === "undefined") return;
    const doc = new jsPDF();
    
    // Header & Logo simulation
    doc.setFillColor(13, 13, 13);
    doc.rect(0, 0, 210, 40, "F");
    
    doc.setTextColor(231, 178, 75); // Gold
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.text("MatGo", 14, 25);
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("UTBETALNINGSUNDERLAG / SJÄLVFAKTURA", 14, 32);
    
    // Right side header info
    doc.text([
      `Datum: ${new Date().toLocaleDateString("sv-SE")}`,
      `Period: ${period.from} till ${period.to}`
    ], 196, 20, { align: "right" });

    // Business Info
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("RESTAURANG", 14, 55);
    
    doc.setFontSize(18);
    doc.text(row.restaurant.name.toUpperCase(), 14, 65);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text([
      `Stad: ${row.restaurant.city || "Sverige"}`,
      `Partner-tier: ${row.tier?.label || "Standard"}`,
      `Dagar i perioden: ${row.periodDays} st`
    ], 14, 72);

    // Summary Table
    autoTable(doc, {
      startY: 90,
      head: [["BERÄKNINGSGRUND", "DETALJER", "SUMMA"]],
      body: [
        ["Total försäljning", `${row.totalOrders} st genomförda ordrar`, kr(row.totalRevenue)],
        ["Plattformsavgift", `Provision (${row.tierCfg.commissionPct}%) på försäljning`, `-${kr(row.commission)}`],
        ["Fast månadsavgift", `Prorata för perioden (${row.periodDays} dgr)`, `-${kr(row.proratedSubscription)}`],
      ],
      headStyles: { fillColor: [13, 13, 13], textColor: [231, 178, 75], fontStyle: "bold" },
      styles: { font: "helvetica", fontSize: 10 },
      columnStyles: { 2: { halign: "right", fontStyle: "bold" } }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;

    // Total Box
    doc.setFillColor(231, 178, 75, 0.1);
    doc.rect(120, finalY, 76, 30, "F");
    
    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("TOTAL UTBETALNING", 125, finalY + 12);
    
    doc.setFontSize(18);
    doc.setTextColor(34, 197, 94); // Emerald
    doc.text(kr(row.restaurantPayout), 125, finalY + 22);

    // Product insights (small table)
    if (report?.topProducts?.length > 0) {
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("TOPPSÄLJANDE PRODUKTER", 14, finalY + 12);
      
      autoTable(doc, {
        startY: finalY + 15,
        margin: { right: 100 },
        head: [["Produkt", "Antal", "Omsättning"]],
        body: report.topProducts.slice(0, 5).map((p: any) => [p.name, p.count, kr(p.revenue)]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [100, 100, 100] }
      });
    }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "italic");
    doc.text("Detta dokument fungerar som underlag för utbetalning. Utbetalning sker normalt inom 3-5 bankdagar efter periodens slut.", 14, 285);

    doc.save(`${row.restaurant.slug}_billing_${period.from}.pdf`);
  };

  const sendReport = async () => {
    if (!email || !email.includes("@")) {
      toastError("Ange en giltig e-postadress");
      return;
    }
    setSending(true);
    try {
      const token = localStorage.getItem("matgo_token") || "";
      await axios.post(`${API_URL}/api/admin/reports/restaurant/${row.restaurant.id}/send`, {
        email,
        period: `${period.from} - ${period.to}`
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      success(`Rapport skickad till ${email}`);
      setEmail("");
    } catch {
      toastError("Kunde inte skicka rapport");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-[var(--bg-primary)] transition-colors">
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-1 px-2 py-1 rounded-lg ${row.tier?.bg ?? ""} ${row.tier?.color ?? ""} text-[8px] font-black uppercase`}>
            <Icon size={10} /> {row.tier?.label ?? "Standard"}
          </span>
          <span className="font-black uppercase text-[var(--text-primary)]">{row.restaurant.name}</span>
          <span className="text-[9px] text-[var(--text-secondary)]">{row.totalOrders} ordrar · {kr(row.totalRevenue)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-black text-gold-500">Platform: {kr(row.totalPlatformIncome)}</span>
          <span className="text-[9px] font-black text-emerald-400">Rest.: {kr(row.restaurantPayout)}</span>
          <ChevronDown size={16} className={`text-[var(--text-secondary)] transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-[var(--border-subtle)]">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-4">
            {[
              { label: "Ordrar", value: row.totalOrders, color: "text-blue-400" },
              { label: "Omsättning", value: kr(row.totalRevenue), color: "text-[var(--text-primary)]" },
              { label: "Nya kunder", value: report?.summary?.newCustomers ?? "—", color: "text-purple-400" },
              { label: "Snitt-order", value: kr(report?.summary?.avgOrderValue ?? 0), color: "text-[var(--text-secondary)]" },
              { label: "Leverans-ordrar", value: report?.summary?.deliveryOrders ?? 0, color: "text-sky-400" },
              { label: "Avhämtning", value: report?.summary?.pickupOrders ?? 0, color: "text-sky-400" },
            ].map((s) => (
              <div key={s.label} className="p-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1">{s.label}</p>
                <p className={`text-sm font-black ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Billing breakdown */}
          <div className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-3">Fakturering</p>
            {[
              { label: `Prenumerationsavgift (${row.periodDays} dagar av ${row.tierCfg.subscriptionFee} kr/mån)`, value: kr(row.proratedSubscription), color: "text-purple-400" },
              { label: `Provision ${row.tierCfg.commissionPct}% × ${kr(row.totalRevenue)}`, value: kr(row.commission), color: "text-gold-500" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-[9px] text-[var(--text-secondary)]">{item.label}</span>
                <span className={`text-[10px] font-black ${item.color}`}>{item.value}</span>
              </div>
            ))}
            <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between">
              <span className="text-[10px] font-black text-[var(--text-primary)]">Plattformens intäkt</span>
              <span className="text-sm font-black text-gold-500">{kr(row.totalPlatformIncome)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-[var(--text-primary)]">Restaurangens utbetalning</span>
              <span className="text-sm font-black text-emerald-400">{kr(row.restaurantPayout)}</span>
            </div>
          </div>

          {/* Top products */}
          {report?.topProducts?.length > 0 && (
            <div className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
              <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-3">Toppsäljare</p>
              <div className="space-y-2">
                {report.topProducts.slice(0, 5).map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-lg bg-gold-500/10 text-gold-500 text-[8px] font-black flex items-center justify-center">{i + 1}</span>
                      <span className="text-[9px] font-bold text-[var(--text-primary)]">{p.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-black text-gold-500">{kr(p.revenue)}</span>
                      <span className="text-[8px] text-[var(--text-secondary)] ml-2">{p.count}st</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-4 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-4">
            <button onClick={exportRestaurantPDF}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] text-[9px] font-black uppercase text-[var(--text-secondary)] hover:text-gold-500 hover:border-gold-500/20 transition-all">
              <FileText size={13} /> Exportera (.txt)
            </button>
            <div className="flex items-center gap-2 flex-wrap">
              <input 
                type="email"
                placeholder="ange@epost.se" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[10px] font-bold outline-none focus:border-gold-500/30 transition-all placeholder:opacity-30"
              />
              <button 
                onClick={sendReport}
                disabled={sending}
                className="flex items-center gap-2 px-4 py-2 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[9px] rounded-xl shadow-lg shadow-gold-500/20 transition-all disabled:opacity-50"
              >
                {sending ? <Loader2 size={12} className="animate-spin" /> : "Skicka Rapport"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
