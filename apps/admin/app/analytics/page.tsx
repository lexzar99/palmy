"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "@/lib/api";
import { 
  TrendingUp, 
  ArrowUpRight, 
  ShoppingCart, 
  Users, 
  Wallet,
  Loader2,
  Percent,
  Star,
  Clock,
  Truck,
  Store,
  Calendar,
} from "lucide-react";
import { motion } from "framer-motion";

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const token = typeof window !== "undefined" ? localStorage.getItem("matgo_token") || "" : "";

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/admin/analytics`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setData(res.data);
      } catch (err: any) {
        console.error("Failed to fetch analytics", err);
        setError(err.response?.data?.error || "Kunde inte hämta data");
      } finally {
        setLoading(false);
      }
    };
    if (token) fetchData();
    else { setLoading(false); setError("Logga in först"); }
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6">
        <Loader2 className="animate-spin text-gold-500" size={48} />
        <p className="text-[var(--text-primary)]/40 font-black uppercase tracking-[0.3em] text-xs">Analyserar data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-10">
        <div className="text-4xl">📊</div>
        <p className="text-[var(--text-primary)]/40 font-black uppercase tracking-widest text-xs">{error}</p>
      </div>
    );
  }

  if (!data) return <div className="p-10 text-center uppercase font-black opacity-20">Ingen data tillgänglig</div>;

  const StatCard = ({ title, value, icon: Icon, sub, color = "gold" }: any) => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[2.5rem] p-8 shadow-sm"
    >
      <div className="flex justify-between items-start mb-6">
        <div className={`w-12 h-12 rounded-2xl bg-${color}-500/10 flex items-center justify-center text-${color}-500 border border-${color}-500/20`}>
          <Icon size={24} />
        </div>
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-primary)]/30 mb-2">{title}</p>
        <h3 className="text-3xl font-black italic tracking-tighter text-[var(--text-primary)]">{value}</h3>
        {sub && <p className="text-[10px] text-[var(--text-primary)]/20 mt-2 font-medium uppercase tracking-widest">{sub}</p>}
      </div>
    </motion.div>
  );

  const dayNames = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];

  return (
    <div className="space-y-10 pb-24">
      <div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter mb-2">Plattforms-analys</h1>
        <p className="text-[var(--text-primary)]/40 text-sm font-medium uppercase tracking-widest">Realtidsdata för din verksamhet.</p>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Idag" 
          value={`${Math.round(data.today?.revenue || 0)} kr`} 
          icon={Wallet} 
          sub={`${data.today?.orders || 0} ordrar`}
        />
        <StatCard 
          title="Senaste 7 dagar" 
          value={`${Math.round(data.week?.revenue || 0)} kr`} 
          icon={Calendar}
          sub={`${data.week?.orders || 0} ordrar`}
        />
        <StatCard 
          title="Senaste 30 dagar" 
          value={`${Math.round(data.month?.revenue || 0)} kr`} 
          icon={TrendingUp}
          sub={`${data.month?.orders || 0} ordrar`}
        />
        <StatCard 
          title="Snittorder" 
          value={`${Math.round(data.today?.avgOrder || data.week?.avgOrder || 0)} kr`} 
          icon={Percent} 
          sub={`Totalt ${data.allTime?.orders || 0} ordrar`}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Daily Revenue Chart */}
        <div className="lg:col-span-2 bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[3rem] p-10">
          <div className="flex items-center justify-between mb-10">
            <h3 className="text-xl font-black uppercase italic flex items-center gap-3">
              <Calendar className="text-gold-500" size={24} />
              Veckans Försäljning
            </h3>
          </div>
          
          <div className="h-64 flex items-end gap-3 px-4">
            {data.dailyRevenue?.length > 0 ? data.dailyRevenue.map((d: any, i: number) => {
              const max = Math.max(...data.dailyRevenue.map((x: any) => x.revenue));
              const height = max > 0 ? (d.revenue / max) * 100 : 5;
              const dayDate = new Date(d.date);
              const dayName = dayNames[dayDate.getDay()] || d.date;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-4 group">
                  <div className="relative w-full h-48 flex items-end">
                    <motion.div 
                      initial={{ height: 0 }} 
                      animate={{ height: `${Math.max(height, 5)}%` }}
                      transition={{ duration: 0.6, delay: i * 0.1 }}
                      className="w-full bg-gold-400/20 group-hover:bg-gold-500/40 rounded-t-xl transition-colors border-t border-x border-gold-500/20"
                    />
                    {d.revenue > 0 && (
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all bg-white text-dark-500 px-3 py-1 rounded-lg text-[10px] font-black whitespace-nowrap shadow-2xl z-10">
                        {Math.round(d.revenue)} kr
                      </div>
                    )}
                  </div>
                  <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[var(--text-primary)]/20">{dayName}</span>
                </div>
              );
            }) : (
              <div className="w-full flex items-center justify-center h-48 opacity-20 uppercase font-black text-xs tracking-widest">Ingen data ännu</div>
            )}
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[3rem] p-10 flex flex-col">
          <h3 className="text-xl font-black uppercase italic flex items-center gap-3 mb-10">
            <TrendingUp size={24} className="text-gold-500" />
            Populärt
          </h3>
          <div className="space-y-4 flex-1">
            {data.topProducts?.length > 0 ? data.topProducts.slice(0, 6).map((p: any, i: number) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-white/2 hover:bg-white/5 transition-all group">
                <div className="w-10 h-10 rounded-xl bg-dark-500 flex items-center justify-center font-black text-gold-500/50 group-hover:text-gold-500 transition-colors border border-white/5 text-xs italic">{i+1}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-tight text-white mb-0.5 truncate">{p.name}</div>
                  <div className="text-[9px] text-[var(--text-primary)]/20 font-black uppercase tracking-widest">{p.totalSold} sålda · {Math.round(p.revenue)} kr</div>
                </div>
              </div>
            )) : (
              <div className="flex-1 flex items-center justify-center opacity-20 uppercase font-black text-xs tracking-widest">Ingen data</div>
            )}
          </div>
        </div>
      </div>
      
      {/* Order Types & Hourly */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Order Types */}
        <div className="bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[3rem] p-10">
          <h3 className="text-xl font-black uppercase italic flex items-center gap-3 mb-8">
            <ShoppingCart size={24} className="text-gold-500" />
            Ordertyper (30 dagar)
          </h3>
          <div className="space-y-6">
            {data.orderTypes?.map((t: any, i: number) => (
              <div key={i} className="flex items-center gap-6">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${t.type === 'DELIVERY' ? 'bg-sky-500/10 border-sky-500/20 text-sky-500' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'}`}>
                  {t.type === 'DELIVERY' ? <Truck size={24} /> : <Store size={24} />}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-black uppercase tracking-tight">{t.type === 'DELIVERY' ? 'Leverans' : 'Avhämtning'}</div>
                  <div className="text-[10px] text-[var(--text-primary)]/20 font-bold uppercase tracking-widest">{t.count} ordrar</div>
                </div>
                <div className="text-2xl font-black italic text-gold-500">{t.count}</div>
              </div>
            ))}
            {(!data.orderTypes || data.orderTypes.length === 0) && (
              <div className="py-8 text-center opacity-20 uppercase font-black text-xs tracking-widest">Ingen data</div>
            )}
          </div>
        </div>

        {/* Peak Hours */}
        <div className="bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[3rem] p-10">
          <h3 className="text-xl font-black uppercase italic flex items-center gap-3 mb-8">
            <Clock size={24} className="text-gold-500" />
            Rusningstider (7 dagar)
          </h3>
          <div className="grid grid-cols-12 gap-1 h-40 items-end">
            {data.hourlyDistribution?.slice(8, 24).map((count: number, i: number) => {
              const max = Math.max(...(data.hourlyDistribution || [1]));
              const h = max > 0 ? (count / max) * 100 : 0;
              return (
                <div key={i} className="flex flex-col items-center gap-2 group relative">
                  <motion.div 
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(h, 3)}%` }}
                    transition={{ duration: 0.4, delay: i * 0.03 }}
                    className={`w-full rounded-t-md transition-colors ${h > 70 ? 'bg-gold-500/60' : h > 30 ? 'bg-gold-500/30' : 'bg-gold-500/10'} group-hover:bg-gold-500/50`}
                  />
                  {i % 2 === 0 && <span className="text-[7px] font-bold text-[var(--text-primary)]/15">{i + 8}</span>}
                  {count > 0 && (
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition bg-white text-dark-500 px-2 py-0.5 rounded text-[8px] font-black whitespace-nowrap shadow-xl z-10">
                      {count}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Reviews */}
      {data.recentReviews?.length > 0 && (
        <div className="bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[3rem] p-10">
          <h3 className="text-xl font-black uppercase italic flex items-center gap-3 mb-10">
            <Star size={24} className="text-gold-500" />
            Senaste Omdömen
          </h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.recentReviews.slice(0, 6).map((r: any, i: number) => (
              <div key={i} className="p-6 rounded-3xl bg-white/2 border border-white/5 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black uppercase tracking-widest text-gold-500/60">#{r.orderNumber} — {r.customerName || 'Kund'}</span>
                  <div className="flex gap-0.5 text-gold-500">
                    {[...Array(5)].map((_, j) => <Star key={j} size={10} fill={j < (r.rating || 0) ? "currentColor" : "none"} className={j < (r.rating || 0) ? "" : "opacity-20"} />)}
                  </div>
                </div>
                <p className="text-sm text-white/50 italic leading-relaxed line-clamp-3">&quot;{r.review || 'Inget meddelande'}&quot;</p>
                {r.reviewedAt && (
                  <div className="text-[8px] font-medium text-white/10 uppercase tracking-widest">{new Date(r.reviewedAt).toLocaleDateString('sv-SE')}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
