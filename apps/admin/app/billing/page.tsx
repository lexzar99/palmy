/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import {
  Crown, Medal, Award, Download, Loader2,
  TrendingUp, ShoppingCart, RefreshCw, ChevronDown,
  FileText, Calendar, Store, Search, Filter,
  CreditCard, Send, CheckCircle2, MoreVertical
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { useToast } from "@/components/Toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { motion, AnimatePresence } from "framer-motion";

// Configuration defaults
const LS_KEY = "matgo_billing_config_v2";
const DEFAULT_CONFIG = {
  gold: { subscriptionFee: 1990, commissionPct: 8 },
  silver: { subscriptionFee: 990, commissionPct: 10 },
  standard: { subscriptionFee: 490, commissionPct: 12 },
};

const TIER_META: Record<number, { label: string; key: keyof typeof DEFAULT_CONFIG; icon: any; color: string; bg: string }> = {
  1: { label: "Guld", key: "gold", icon: Crown, color: "text-amber-300", bg: "bg-amber-400/10 border-amber-400/20" },
  2: { label: "Silver", key: "silver", icon: Medal, color: "text-zinc-300", bg: "bg-zinc-400/10 border-zinc-400/20" },
  3: { label: "Standard", key: "standard", icon: Award, color: "text-[var(--text-secondary)]", bg: "bg-[var(--border-subtle)] border-[var(--border-subtle)]" },
};

// Period helpers
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const startOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const startOfLastMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); };
const endOfLastMonth = () => { const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 10); };

const PERIODS = [
  { label: "Månad hittills", from: startOfMonth(), to: today() },
  { label: "Förra månaden", from: startOfLastMonth(), to: endOfLastMonth() },
  { label: "Senaste 7", from: daysAgo(7), to: today() },
  { label: "Senaste 30", from: daysAgo(30), to: today() },
];

const kr = (n: number) => `${Math.round(n).toLocaleString("sv-SE")} kr`;

export default function AdvancedBillingPage() {
  const { success, error: toastError } = useToast();
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [reports, setReports] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  
  // Filters & State
  const [periodIdx, setPeriodIdx] = useState(0);
  const [search, setSearch] = useState("");
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const period = PERIODS[periodIdx];
  const token = () => localStorage.getItem("matgo_token") || "";

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(raw) });
    } catch { /* ignore */ }
    
    axios.get(`${API_URL}/api/restaurants`)
      .then((r) => setRestaurants(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
        if (res.status === "fulfilled") map[restaurants[i].id] = res.value.data;
      });
      setReports(map);
    } catch {
      toastError("Kunde inte hämta rapporter");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, [restaurants.length, period]);

  const data = useMemo(() => {
    return restaurants
      .filter((r) => !search || r.name.toLowerCase().includes(search.toLowerCase()))
      .map((r) => {
        const report = reports[r.id];
        const tier = TIER_META[r.featuredClass ?? 3] || TIER_META[3];
        const tierCfg = config[tier.key];
        
        const totalRevenue = report?.summary?.totalRevenue ?? 0;
        const totalOrders = report?.summary?.totalOrders ?? 0;
        
        const periodDays = Math.max(1, Math.round((new Date(period.to).getTime() - new Date(period.from).getTime()) / 86400000));
        const subFee = (tierCfg.subscriptionFee / 30) * periodDays;
        const commission = (totalRevenue * tierCfg.commissionPct) / 100;
        const platformIncome = subFee + commission;
        const payout = totalRevenue - commission; // Not deducting subFee from payout for visual clarity here

        return { r, report, tier, tierCfg, totalRevenue, totalOrders, periodDays, subFee, commission, platformIncome, payout };
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [restaurants, reports, config, period, search]);

  const totals = useMemo(() => ({
    revenue: data.reduce((s, d) => s + d.totalRevenue, 0),
    orders: data.reduce((s, d) => s + d.totalOrders, 0),
    platformIncome: data.reduce((s, d) => s + d.platformIncome, 0),
    payout: data.reduce((s, d) => s + d.payout, 0),
  }), [data]);

  const exportCSV = () => {
    const csv = [
      ["Restaurang", "Tier", "Ordrar", "Omsättning", "Vår Provision", "Vår Abonnemang", "Tot. Vår Intäkt", "Utbetalning Rest."],
      ...data.map(d => [d.r.name, d.tier.label, d.totalOrders, Math.round(d.totalRevenue), Math.round(d.commission), Math.round(d.subFee), Math.round(d.platformIncome), Math.round(d.payout)]),
      ["TOTALT", "", totals.orders, Math.round(totals.revenue), "", "", Math.round(totals.platformIncome), Math.round(totals.payout)]
    ].map(e => e.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `matgo_billing_${period.from}_${period.to}.csv`;
    a.click();
  };

  const handleGlobalSend = async () => {
    if (!confirm(`Detta skickar utbetalningsunderlag via e-post till ${data.length} separata restauranger. Fortsätt?`)) return;
    setLoading(true);
    let successCount = 0;
    for (const d of data) {
      if (!d.r.adminEmail) continue;
      try {
        await axios.post(`${API_URL}/api/admin/reports/restaurant/${d.r.id}/send`, {
          email: d.r.adminEmail,
          period: `${period.from} - ${period.to}`
        }, { headers: { Authorization: `Bearer ${token()}` } });
        successCount++;
      } catch (e) {}
    }
    setLoading(false);
    success(`Rapporter skickades till ${successCount} restauranger.`);
  };

  if (loading && data.length === 0) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 size={32} className="animate-spin text-gold-500 opacity-50" />
    </div>
  );

  return (
    <div className="space-y-8 pb-24 text-[var(--text-primary)]">
      {/* Dynamic Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight flex items-center gap-3">
            <CreditCard className="text-gold-500" size={28} /> Finansöversikt
          </h1>
          <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-[0.2em] mt-2">
            AI-Drivet Avräkningssystem · {data.length} Restauranger i urval
          </p>
        </div>

        {/* Global actions */}
        <div className="flex gap-2 p-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl">
          <button onClick={exportCSV} className="px-4 py-2 text-[10px] font-black uppercase text-[var(--text-secondary)] hover:text-white transition-colors rounded-xl flex items-center gap-2">
            <Download size={13} /> Ladda ner CSV
          </button>
          <button onClick={handleGlobalSend} className="px-5 py-2 bg-gold-500 text-zinc-950 text-[10px] font-black uppercase rounded-xl flex items-center gap-2 shadow-[0_0_15px_rgba(231,178,75,0.3)] hover:bg-gold-400 transition-colors">
            <Send size={13} /> Skicka alla rapporter
          </button>
        </div>
      </div>

      {/* Top Hero KPI Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4">
        {/* Main Platform Profit */}
        <div className="p-8 rounded-[2rem] bg-gradient-to-br from-gold-500/10 via-gold-500/5 to-transparent border border-gold-500/20 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <TrendingUp size={120} className="text-gold-500 -rotate-12 translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-700" />
          </div>
          <div className="relative z-10 w-full h-full flex flex-col justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-gold-400 shadow-[0_0_8px_rgba(251,191,36,1)] animate-pulse" />
              <p className="text-[10px] font-black uppercase tracking-widest text-gold-500">Plattformens Tot. Intäkter</p>
            </div>
            <div className="mt-8">
              <h2 className="text-5xl font-black text-white tracking-tighter" style={{ textShadow: "0 4px 24px rgba(231,178,75,0.3)" }}>
                {kr(totals.platformIncome)}
              </h2>
              <p className="text-xs font-bold text-gold-500/60 mt-2">Provision + Abonnemang</p>
            </div>
          </div>
        </div>

        {/* Breakdown Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
           {/* Gross revenue */}
           <div className="p-6 rounded-[2rem] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex flex-col justify-between">
             <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Total Omsättning</p>
             <div>
               <p className="text-3xl font-black text-white">{kr(totals.revenue)}</p>
               <p className="text-[10px] font-bold text-[var(--text-secondary)] mt-1 flex items-center gap-1">
                 <ShoppingCart size={11} className="text-sky-400" /> {totals.orders} genomförda ordrar
               </p>
             </div>
           </div>

           {/* Payout */}
           <div className="p-6 rounded-[2rem] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex flex-col justify-between">
             <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Rest. Utbetalning</p>
             <div>
               <p className="text-3xl font-black text-emerald-400">{kr(totals.payout)}</p>
               <p className="text-[10px] font-bold text-[var(--text-secondary)] mt-1 flex items-center gap-1">
                 <Store size={11} className="text-emerald-500/50" /> Till partners
               </p>
             </div>
           </div>

           {/* Period Filter Widget */}
           <div className="col-span-2 lg:col-span-1 p-6 rounded-[2rem] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex flex-col">
             <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-4 flex items-center gap-2">
                <Calendar size={12} /> Period
             </p>
             <div className="flex-1 flex flex-col gap-2">
                {PERIODS.map((p, i) => (
                  <button key={i} onClick={() => setPeriodIdx(i)}
                    className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      periodIdx === i ? "bg-[var(--bg-primary)] border border-gold-500/20 text-gold-500" : "hover:bg-[var(--bg-primary)] border border-transparent text-[var(--text-secondary)]"
                    }`}>
                    {p.label}
                    {periodIdx === i && <CheckCircle2 size={12} />}
                  </button>
                ))}
             </div>
           </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={16} />
        <input 
          placeholder="Sök på restaurangnamn..." 
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl py-4 pl-12 pr-6 text-sm font-bold outline-none focus:border-gold-500/30 transition-all placeholder:text-[var(--text-secondary)]/50"
        />
      </div>

      {/* Elegant Restaurant List */}
      <div className="space-y-3">
        {data.map((row) => {
          const isExpanded = expandedId === row.r.id;
          const Icon = row.tier.icon;

          return (
            <div key={row.r.id} className={`rounded-[2rem] border transition-all duration-300 overflow-hidden ${isExpanded ? "border-gold-500/20 bg-gold-500/[0.02]" : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:border-[var(--border-subtle)]"}`}>
              {/* Clickable Header */}
              <div 
                onClick={() => setExpandedId(isExpanded ? null : row.r.id)}
                className="w-full text-left px-6 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer"
              >
                <div className="flex items-center gap-5">
                   <div className="w-12 h-12 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] flex items-center justify-center text-lg font-black text-white shrink-0">
                     {row.r.name.charAt(0).toUpperCase()}
                   </div>
                   <div>
                     <h3 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                       {row.r.name}
                     </h3>
                     <div className="flex items-center gap-2 mt-1.5">
                       <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md border ${row.tier.bg} ${row.tier.color} text-[8px] font-black uppercase tracking-widest`}>
                         <Icon size={10} /> {row.tier.label}
                       </span>
                       <span className="text-[10px] font-bold text-[var(--text-secondary)]">· {row.totalOrders} ordrar</span>
                     </div>
                   </div>
                </div>

                <div className="flex items-center gap-8 md:ms-auto">
                   <div className="text-right hidden sm:block">
                     <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-0.5">Avräkning</p>
                     <p className="text-sm font-black text-emerald-400">{kr(row.payout)}</p>
                   </div>
                   <div className="text-right">
                     <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-0.5">Intäkt</p>
                     <p className="text-sm font-black text-gold-500">{kr(row.platformIncome)}</p>
                   </div>
                   <button className="w-8 h-8 rounded-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)]">
                     <ChevronDown size={14} className={`transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`} />
                   </button>
                </div>
              </div>

              {/* Collapsible Content */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-[var(--border-subtle)]"
                  >
                    <div className="p-6 lg:p-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                       {/* Sales Breakdown */}
                       <div className="space-y-4">
                         <h4 className="text-[10px] font-black uppercase tracking-widest text-white/50 flex items-center gap-2">
                           <ShoppingCart size={12} /> Försäljning
                         </h4>
                         <div className="p-5 rounded-2xl bg-[var(--bg-primary)] border border-white/5 space-y-3">
                           <div className="flex justify-between items-center text-xs">
                             <span className="font-bold text-[var(--text-secondary)]">Bruttoomsättning</span>
                             <span className="font-black text-white">{kr(row.totalRevenue)}</span>
                           </div>
                           <div className="flex justify-between items-center text-xs">
                             <span className="font-bold text-[var(--text-secondary)]">Antal Ordrar</span>
                             <span className="font-black text-white">{row.totalOrders} st</span>
                           </div>
                           {row.report?.summary?.avgOrderValue && (
                             <div className="flex justify-between items-center text-xs">
                               <span className="font-bold text-[var(--text-secondary)]">Snittorder</span>
                               <span className="font-black text-white">{kr(row.report.summary.avgOrderValue)}</span>
                             </div>
                           )}
                         </div>
                       </div>

                       {/* Platform Cut */}
                       <div className="space-y-4">
                         <h4 className="text-[10px] font-black uppercase tracking-widest text-gold-500/50 flex items-center gap-2">
                           <Award size={12} /> Plattformsintäkt
                         </h4>
                         <div className="p-5 rounded-2xl bg-gold-500/5 border border-gold-500/20 space-y-3">
                           <div className="flex justify-between items-center text-xs">
                             <span className="font-bold text-gold-500/60">Abonnemang ({row.periodDays} dgr)</span>
                             <span className="font-black text-gold-500">{kr(row.subFee)}</span>
                           </div>
                           <div className="flex justify-between items-center text-xs">
                             <span className="font-bold text-gold-500/60">Provision ({row.tierCfg.commissionPct}%)</span>
                             <span className="font-black text-gold-500">{kr(row.commission)}</span>
                           </div>
                           <div className="w-full h-px bg-gold-500/20 my-2" />
                           <div className="flex justify-between items-center text-sm">
                             <span className="font-black text-gold-500">Totalsumma</span>
                             <span className="font-black text-gold-400">{kr(row.platformIncome)}</span>
                           </div>
                         </div>
                       </div>

                       {/* Actions & Export */}
                       <div className="md:col-span-2 xl:col-span-1 space-y-4 flex flex-col justify-end">
                         <div className="p-5 rounded-2xl bg-[var(--bg-primary)] border border-emerald-500/20 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                              <Store size={80} />
                            </div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500/50 mb-1">Restaurangens Avräkning</p>
                            <p className="text-3xl font-black text-emerald-400">{kr(row.payout)}</p>
                         </div>

                         <div className="flex gap-2">
                           <button 
                             className="flex-1 py-3 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-primary)] hover:border-gold-500/30 text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] hover:text-white transition-all flex items-center justify-center gap-2"
                             onClick={() => {
                               const doc = new jsPDF();
                               doc.setFont("helvetica", "bold");
                               doc.setFontSize(22);
                               doc.text("MatGo Faktura underlag", 14, 25);
                               // Simplified PDF generation logic for presentation
                               doc.save(`${row.r.slug}_${period.from}.pdf`);
                             }}
                           >
                             <FileText size={14} /> PDF Underlag
                           </button>
                         </div>
                       </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {data.length === 0 && !loading && (
          <div className="py-20 flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-[var(--border-subtle)] opacity-50">
            <Search size={32} className="mb-4 text-[var(--text-secondary)]" />
            <p className="text-xs font-black uppercase tracking-widest text-[var(--text-secondary)]">Inga restauranger hittades</p>
          </div>
        )}
      </div>
    </div>
  );
}
