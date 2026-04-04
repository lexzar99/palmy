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
  Target
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { useRestaurantStore } from "@/store/restaurantStore";

const OverviewPage = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedRestaurantId } = useRestaurantStore();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("palmyra_admin");
      const admin = raw ? JSON.parse(raw) : null;
      setIsSuperAdmin(admin?.role === "SUPER_ADMIN");
    } catch {
      setIsSuperAdmin(false);
    }
  }, []);

  const getToken = () => typeof window !== "undefined" ? localStorage.getItem("palmyra_token") || "" : "";

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const restaurantParam = isSuperAdmin ? (selectedRestaurantId ? `&restaurantId=${selectedRestaurantId}` : "") : `&restaurantId=${selectedRestaurantId}`;
      const res = await axios.get(`${API_URL}/api/admin/orders?limit=200${restaurantParam}`, {
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

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const todayOrders = orders.filter(o => new Date(o.createdAt) >= today);
    const yesterdayOrders = orders.filter(o => {
      const d = new Date(o.createdAt);
      return d >= yesterday && d < today;
    });

    const todayRev = todayOrders.reduce((sum, o) => sum + o.total, 0);
    const yesterdayRev = yesterdayOrders.reduce((sum, o) => sum + o.total, 0);

    const revDiff = yesterdayRev > 0 ? ((todayRev - yesterdayRev) / yesterdayRev) * 100 : 0;
    const countDiff = yesterdayOrders.length > 0 ? ((todayOrders.length - yesterdayOrders.length) / yesterdayOrders.length) * 100 : 0;

    return {
      today: { count: todayOrders.length, rev: todayRev },
      yesterday: { count: yesterdayOrders.length, rev: yesterdayRev },
      diff: { rev: revDiff, count: countDiff }
    };
  }, [orders]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-48 gap-6 text-white/20">
        <Loader2 className="animate-spin text-gold-500" size={60} />
        <p className="font-black uppercase tracking-[0.3em] text-sm text-center">Analyserar prestanda...</p>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-gold-400/10 rounded-[1.5rem] border border-gold-400/20 flex items-center justify-center text-gold-500">
             <BarChart3 size={32} />
          </div>
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tight mb-1">Daglig <span className="text-gold-500">Översikt</span></h1>
            <p className="text-white/30 text-[10px] font-black uppercase tracking-[0.4em]">Resultat för idag och igår</p>
          </div>
        </div>
        <button onClick={fetchData} className="p-5 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 transition-all">
          <Calendar size={22} className="text-white/40" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="relative group overflow-hidden bg-gradient-to-br from-white/[0.05] to-transparent border-2 border-white/5 rounded-[3rem] p-12">
           <div className="absolute top-0 right-0 w-64 h-64 bg-gold-500/5 blur-[100px] -mr-32 -mt-32 rounded-full" />
           <div className="relative z-10">
              <div className="flex items-center gap-3 mb-8">
                 <div className="px-3 py-1 bg-gold-500/10 border border-gold-500/20 rounded-full text-[10px] font-black text-gold-500 uppercase tracking-widest">Idag</div>
                 <div className="w-1.5 h-1.5 rounded-full bg-gold-500 animate-pulse" />
              </div>
              <div className="flex flex-col gap-2">
                 <div className="text-7xl font-black text-white tracking-tighter uppercase">{stats.today.rev.toFixed(0)} <span className="text-2xl text-gold-500">KR</span></div>
                 <div className="text-sm font-bold text-white/30 uppercase tracking-widest border-l-2 border-white/10 pl-4">{stats.today.count} Beställningar</div>
              </div>
              <div className="mt-12 flex items-center gap-6">
                 <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${stats.diff.rev >= 0 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                    {stats.diff.rev >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {Math.abs(stats.diff.rev).toFixed(1)}% vs igår
                 </div>
              </div>
           </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
           <div className="bg-dark-400 border border-white/5 rounded-[2.5rem] p-8 flex flex-col justify-between">
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-white/20 mb-6">
                 <Target size={24} />
              </div>
              <div>
                 <div className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-1">Gårdagen</div>
                 <div className="text-3xl font-black text-white">{stats.yesterday.rev.toFixed(0)} KR</div>
                 <div className="text-xs font-bold text-white/30 uppercase mt-2">{stats.yesterday.count} ordrar</div>
              </div>
           </div>
           <div className="bg-dark-400 border border-white/5 rounded-[2.5rem] p-8 flex flex-col justify-between">
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-white/20 mb-6">
                 <Zap size={24} />
              </div>
              <div>
                 <div className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-1">Orderökning</div>
                 <div className={`text-3xl font-black ${stats.diff.count >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {stats.diff.count >= 0 ? "+" : ""}{stats.diff.count.toFixed(0)}%
                 </div>
              </div>
           </div>
           <div className="bg-dark-400 border border-white/5 rounded-[2.5rem] p-8 sm:col-span-2 flex items-center justify-between">
              <div className="flex items-center gap-6">
                 <div className="w-12 h-12 bg-gold-400/5 rounded-2xl flex items-center justify-center text-gold-500/40">
                    <CalendarDays size={24} />
                 </div>
                 <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-1">Kapacitet</div>
                    <div className="text-sm font-bold uppercase tracking-widest text-white/60">Fungerande</div>
                 </div>
              </div>
              <div className="text-right">
                 <div className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-1">Intäkt 48h</div>
                 <div className="text-xl font-black text-gold-500">{(stats.today.rev + stats.yesterday.rev).toFixed(0)} KR</div>
              </div>
           </div>
        </div>
      </div>

      <div className="bg-white/[0.02] border border-white/5 rounded-[3rem] p-10 overflow-hidden">
         <div className="flex items-center justify-between mb-8">
            <div className="text-[11px] font-black uppercase tracking-[0.3em] text-white/30">Senaste Ordrar (Idag)</div>
            <Link href="/history" className="text-[10px] font-black uppercase tracking-widest text-gold-500 hover:text-white transition-colors">Visa alla &rarr;</Link>
         </div>
         <div className="space-y-4">
            {orders.filter(o => new Date(o.createdAt) >= (new Date().setHours(0,0,0,0))).slice(0, 5).map(order => (
               <div key={order.id} className="flex items-center justify-between p-6 bg-white/[0.03] rounded-2xl border border-white/5">
                  <div className="flex items-center gap-6">
                     <span className="text-sm font-black text-white/20">#{order.orderNumber}</span>
                     <div>
                        <div className="text-sm font-bold uppercase tracking-tight">{order.customerName}</div>
                        <div className="text-[10px] font-bold text-white/20 uppercase">{order.restaurantName}</div>
                     </div>
                  </div>
                  <div className="font-black text-gold-500">{order.total.toFixed(0)} KR</div>
               </div>
            ))}
         </div>
      </div>
    </div>
  );
};

export default OverviewPage;
