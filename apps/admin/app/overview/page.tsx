/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { 
  Loader2, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight, 
  Zap,
  BarChart3,
  CalendarDays,
  Target,
  History as HistoryIcon,
  Clock,
  TrendingUp,
  ShoppingBag,
  Users,
  CreditCard,
  ChevronRight,
  TrendingDown
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { useRestaurantStore } from "@/store/restaurantStore";

type TimeRange = "today" | "yesterday" | "7d" | "30d" | "all";

const OverviewPage = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>("today");
  const { selectedRestaurantId } = useRestaurantStore();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("matgo_admin");
      const admin = raw ? JSON.parse(raw) : null;
      setIsSuperAdmin(admin?.role === "SUPER_ADMIN");
    } catch {
      setIsSuperAdmin(false);
    }
  }, []);

  const getToken = () => typeof window !== "undefined" ? localStorage.getItem("matgo_token") || "" : "";

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // For all time overview, we might need more data. 
      // Current limit is 1000 for overview to be safe.
      const restaurantParam = isSuperAdmin ? (selectedRestaurantId ? `&restaurantId=${selectedRestaurantId}` : "") : `&restaurantId=${selectedRestaurantId}`;
      const res = await axios.get(`${API_URL}/api/admin/orders?limit=1000${restaurantParam}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setOrders(res.data.orders || []);
    } catch (err) {
      console.error("Error fetching overview data:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedRestaurantId, isSuperAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredData = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let filtered = orders;
    let compare = orders;

    if (timeRange === "today") {
      filtered = orders.filter(o => new Date(o.createdAt) >= today);
      compare = orders.filter(o => new Date(o.createdAt) >= yesterday && new Date(o.createdAt) < today);
    } else if (timeRange === "yesterday") {
      filtered = orders.filter(o => new Date(o.createdAt) >= yesterday && new Date(o.createdAt) < today);
      const dayBeforeYesterday = new Date(yesterday);
      dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 1);
      compare = orders.filter(o => new Date(o.createdAt) >= dayBeforeYesterday && new Date(o.createdAt) < yesterday);
    } else if (timeRange === "7d") {
      filtered = orders.filter(o => new Date(o.createdAt) >= sevenDaysAgo);
      const prevSevenDays = new Date(sevenDaysAgo);
      prevSevenDays.setDate(prevSevenDays.getDate() - 7);
      compare = orders.filter(o => new Date(o.createdAt) >= prevSevenDays && new Date(o.createdAt) < sevenDaysAgo);
    } else if (timeRange === "30d") {
      filtered = orders.filter(o => new Date(o.createdAt) >= thirtyDaysAgo);
      const prevThirtyDays = new Date(thirtyDaysAgo);
      prevThirtyDays.setDate(prevThirtyDays.getDate() - 30);
      compare = orders.filter(o => new Date(o.createdAt) >= prevThirtyDays && new Date(o.createdAt) < thirtyDaysAgo);
    }

    const currentRev = filtered.reduce((sum, o) => sum + o.total, 0);
    const prevRev = compare.reduce((sum, o) => sum + o.total, 0);
    const revDiff = prevRev > 0 ? ((currentRev - prevRev) / prevRev) * 100 : 0;

    const currentCount = filtered.length;
    const prevCount = compare.length;
    const countDiff = prevCount > 0 ? ((currentCount - prevCount) / prevCount) * 100 : 0;

    const avgOrderValue = currentCount > 0 ? currentRev / currentCount : 0;

    return {
      currentRev,
      currentCount,
      revDiff,
      countDiff,
      avgOrderValue,
      orders: filtered.slice(0, 10)
    };
  }, [orders, timeRange]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-48 gap-6 text-[var(--text-primary)]/20">
        <div className="w-16 h-16 border-4 border-gold-500/10 border-t-gold-500 rounded-full animate-spin" />
        <p className="font-black uppercase tracking-[0.3em] text-xs">Uppdaterar dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-32 max-w-[1200px]">
      
      {/* Header with selector */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
        <div>
           <div className="flex items-center gap-3 mb-2 text-gold-500">
              <Zap size={18} />
              <span className="text-[10px] font-black uppercase tracking-[0.4em] leading-none">Matgo Insights</span>
           </div>
           <h1 className="text-4xl lg:text-6xl font-black tracking-tighter uppercase italic leading-none">
              DASHBOARD <span className="text-gold-500">HUBSPOT</span>
           </h1>
        </div>

        <div className="flex gap-2 p-1.5 glass border border-[var(--border-subtle)] rounded-2xl shadow-2xl">
           {[
              { id: "today", label: "Idag" },
              { id: "yesterday", label: "Igår" },
              { id: "7d", label: "7 Dagar" },
              { id: "30d", label: "30 Dagar" },
              { id: "all", label: "Allt" }
           ].map(r => (
              <button 
                key={r.id} 
                onClick={() => setTimeRange(r.id as TimeRange)}
                className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${timeRange === r.id ? "bg-gold-500 text-dark-500 shadow-xl" : "text-[var(--text-primary)]/20 hover:text-[var(--text-primary)]/40 hover:bg-[var(--border-subtle)]"}`}
              >
                 {r.label}
              </button>
           ))}
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
         
         {/* Total Revenue */}
         <div className="p-8 rounded-[2.5rem] glass border border-[var(--border-subtle)] relative overflow-hidden group">
            <div className="relative z-10">
               <div className="flex items-center justify-between mb-8">
                  <div className="w-12 h-12 rounded-2xl bg-gold-500/10 flex items-center justify-center text-gold-500"><CreditCard size={20} /></div>
                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black ${filteredData.revDiff >= 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>
                     {filteredData.revDiff >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                     {Math.abs(Math.round(filteredData.revDiff))}%
                  </div>
               </div>
               <div className="text-[10px] font-black uppercase text-[var(--text-primary)]/20 tracking-widest mb-1">Total Omsättning</div>
               <div className="text-4xl font-black italic tracking-tighter text-[var(--text-primary)]">{(filteredData.currentRev / 100).toLocaleString()} <span className="text-sm font-black uppercase not-italic text-[var(--text-primary)]/40 ml-1">kr</span></div>
            </div>
            <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-gold-500/10 blur-[50px] group-hover:bg-gold-500/10 transition-all" />
         </div>

         {/* Total Orders */}
         <div className="p-8 rounded-[2.5rem] glass border border-[var(--border-subtle)] relative overflow-hidden group">
            <div className="relative z-10">
               <div className="flex items-center justify-between mb-8">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500"><ShoppingBag size={20} /></div>
                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black ${filteredData.countDiff >= 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>
                     {filteredData.countDiff >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                     {Math.abs(Math.round(filteredData.countDiff))}%
                  </div>
               </div>
               <div className="text-[10px] font-black uppercase text-[var(--text-primary)]/20 tracking-widest mb-1">Antal Beställningar</div>
               <div className="text-4xl font-black italic tracking-tighter text-[var(--text-primary)]">{filteredData.currentCount.toLocaleString()} <span className="text-sm font-black uppercase not-italic text-[var(--text-primary)]/40 ml-1">st</span></div>
            </div>
            <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-emerald-500/10 blur-[50px] group-hover:bg-emerald-500/20 transition-all" />
         </div>

         {/* Average Order Value */}
         <div className="p-8 rounded-[2.5rem] glass border border-[var(--border-subtle)] relative overflow-hidden group">
            <div className="relative z-10">
               <div className="flex items-center justify-between mb-8">
                  <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-500"><Zap size={20} /></div>
               </div>
               <div className="text-[10px] font-black uppercase text-[var(--text-primary)]/20 tracking-widest mb-1">Snittorder</div>
               <div className="text-4xl font-black italic tracking-tighter text-[var(--text-primary)]">{Math.round(filteredData.avgOrderValue / 100).toLocaleString()} <span className="text-sm font-black uppercase not-italic text-[var(--text-primary)]/40 ml-1">kr</span></div>
            </div>
            <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-rose-500/10 blur-[50px] group-hover:bg-rose-500/20 transition-all" />
         </div>

         {/* Active Campaigns - placeholder logic */}
         <div className="p-8 rounded-[2.5rem] glass border border-[var(--border-subtle)] relative overflow-hidden group">
            <div className="relative z-10">
               <div className="flex items-center justify-between mb-8">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--border-subtle)] flex items-center justify-center text-[var(--text-primary)]/40"><Target size={20} /></div>
               </div>
               <div className="text-[10px] font-black uppercase text-[var(--text-primary)]/20 tracking-widest mb-1">Aktiva Kampanjer</div>
               <div className="text-4xl font-black italic tracking-tighter text-[var(--text-primary)]">4 <span className="text-sm font-black uppercase not-italic text-[var(--text-primary)]/40 ml-1">st</span></div>
            </div>
            <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-[var(--border-subtle)] blur-[50px] group-hover:bg-white/10 transition-all" />
         </div>
      </div>

      {/* Recent Activity Mini-Section */}
      <div className="glass border border-[var(--border-subtle)] rounded-[3rem] p-10">
         <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-xl bg-[var(--border-subtle)] flex items-center justify-center text-[var(--text-primary)]/40"><HistoryIcon size={20} /></div>
               <h2 className="text-xl font-black uppercase tracking-tight italic">Senaste <span className="text-gold-500">Händelserna</span></h2>
            </div>
            <Link href="/orders" className="text-[9px] font-black uppercase tracking-[0.2em] text-gold-500 hover:text-[var(--text-primary)] transition-all flex items-center gap-2">Visa alla ordrar <ChevronRight size={14} /></Link>
         </div>

         <div className="space-y-4">
            {filteredData.orders.map((o) => (
               <div key={o.id} className="p-6 rounded-2xl bg-white/2 border border-[var(--border-subtle)] flex items-center justify-between">
                  <div className="flex items-center gap-4">
                     <div className="w-10 h-10 rounded-xl bg-white/2 flex items-center justify-center text-[10px] font-black text-[var(--text-primary)]/20 italic">#{o.orderNumber}</div>
                     <div>
                        <div className="text-xs font-black uppercase tracking-tight">{o.customerName}</div>
                        <div className="text-[9px] font-black uppercase text-[var(--text-primary)]/10 tracking-widest">{new Date(o.createdAt).toLocaleTimeString()} • {o.total / 100} kr</div>
                     </div>
                  </div>
                  <div className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest ${o.status === "DELIVERED" ? "bg-emerald-500/10 text-emerald-500" : "bg-gold-500/10 text-gold-500"}`}>
                     {o.status}
                  </div>
               </div>
            ))}
            {filteredData.orders.length === 0 && (
               <div className="py-20 text-center opacity-10 uppercase font-black tracking-widest text-xs">Ingen data för vald period</div>
            )}
         </div>
      </div>
    </div>
  );
};

export default OverviewPage;
