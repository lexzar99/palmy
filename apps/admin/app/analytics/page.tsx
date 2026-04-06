"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "@/lib/api";
import { 
  BarChart3, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight, 
  ShoppingCart, 
  Users, 
  Wallet,
  Calendar,
  Loader2,
  Percent,
  Star
} from "lucide-react";
import { motion } from "framer-motion";

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const token = typeof window !== "undefined" ? localStorage.getItem("matgo_token") || "" : "";

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/admin/analytics`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setData(res.data);
      } catch (err) {
        console.error("Failed to fetch analytics", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6">
        <Loader2 className="animate-spin text-gold-500" size={48} />
        <p className="text-[var(--text-primary)]/40 font-black uppercase tracking-[0.3em] text-xs">Analysear data...</p>
      </div>
    );
  }

  if (!data) return <div className="p-10 text-center uppercase font-black opacity-20">Ingen data tillgänglig</div>;

  const StatCard = ({ title, value, icon: Icon, trend, sub }: any) => (
    <div className="bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[2.5rem] p-8 shadow-sm">
      <div className="flex justify-between items-start mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gold-500/10 flex items-center justify-center text-gold-500 border border-gold-500/20">
          <Icon size={24} />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-[10px] font-black px-3 py-1.5 rounded-full ${trend > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
            {trend > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-primary)]/30 mb-2">{title}</p>
        <h3 className="text-3xl font-black italic tracking-tighter text-[var(--text-primary)]">{value}</h3>
        {sub && <p className="text-[10px] text-[var(--text-primary)]/20 mt-2 font-medium uppercase tracking-widest">{sub}</p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-10 pb-24">
      <div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter mb-2">Plattforms-analys</h1>
        <p className="text-[var(--text-primary)]/40 text-sm font-medium uppercase tracking-widest">Realtidsdata för din verksamhet.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Omsättning" 
          value={`${(data.revenue.total / 100).toLocaleString('sv-SE')} kr`} 
          icon={Wallet} 
          trend={12.5}
        />
        <StatCard 
          title="Antal Ordrar" 
          value={data.orders.total} 
          icon={ShoppingCart} 
          trend={8.2}
          sub={`${data.orders.today} idag`}
        />
        <StatCard 
          title="Snittorder" 
          value={`${(data.revenue.average / 100).toLocaleString('sv-SE')} kr`} 
          icon={Percent} 
        />
        <StatCard 
          title="Kunder" 
          value={data.customers.total} 
          icon={Users} 
          sub={`${data.customers.newToday} nya idag`}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[3rem] p-10">
          <div className="flex items-center justify-between mb-10">
            <h3 className="text-xl font-black uppercase italic italic flex items-center gap-3">
              <Calendar className="text-gold-500" size={24} />
              Veckans Försäljning
            </h3>
          </div>
          
          <div className="h-64 flex items-end gap-3 px-4">
             {data.revenue.daily?.map((d: any, i: number) => {
                const max = Math.max(...data.revenue.daily.map((x: any) => x.amount));
                const height = max > 0 ? (d.amount / max) * 100 : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-4 group">
                    <div className="relative w-full">
                       <motion.div 
                         initial={{ height: 0 }} 
                         animate={{ height: `${height}%` }}
                         className="w-full bg-gold-400/20 group-hover:bg-gold-500/40 rounded-t-xl transition-all border-t border-x border-gold-500/20"
                       />
                       {d.amount > 0 && (
                         <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all bg-white text-dark-500 px-3 py-1 rounded-lg text-[10px] font-black whitespace-nowrap shadow-2xl">
                           {Math.round(d.amount/100)} kr
                         </div>
                       )}
                    </div>
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[var(--text-primary)]/20">{d.day}</span>
                  </div>
                )
             })}
          </div>
        </div>

        <div className="bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[3rem] p-10 flex flex-col">
          <h3 className="text-xl font-black uppercase italic flex items-center gap-3 mb-10">
            <TrendingUp size={24} className="text-gold-500" />
            Populärt
          </h3>
          <div className="space-y-6 flex-1">
             {data.products.popular?.slice(0, 5).map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-white/2 hover:bg-white/5 transition-all group">
                   <div className="w-10 h-10 rounded-xl bg-dark-500 flex items-center justify-center font-black text-gold-500/50 group-hover:text-gold-500 transition-colors border border-white/5 text-xs italic">{i+1}</div>
                   <div className="flex-1">
                      <div className="text-[10px] font-black uppercase tracking-tight text-white mb-0.5">{p.name}</div>
                      <div className="text-[9px] text-[var(--text-primary)]/20 font-black uppercase tracking-widest">{p.sales} sålda</div>
                   </div>
                </div>
             ))}
          </div>
        </div>
      </div>
      
      <div className="bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[3rem] p-10 overflow-hidden">
         <h3 className="text-xl font-black uppercase italic flex items-center gap-3 mb-10">
            <Star size={24} className="text-gold-500" />
            Senaste Omdömen
         </h3>
         <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.reviews?.slice(0, 6).map((r: any, i: number) => (
              <div key={i} className="p-6 rounded-3xl bg-white/2 border border-white/5 space-y-4">
                 <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black uppercase tracking-widest text-gold-500/60">{r.customerName || 'Kund'}</span>
                    <div className="flex gap-0.5 text-gold-500">
                       {[...Array(5)].map((_, j) => <Star key={j} size={10} fill={j < r.rating ? "currentColor" : "none"} className={j < r.rating ? "" : "opacity-20"} />)}
                    </div>
                 </div>
                 <p className="text-sm text-white/50 italic leading-relaxed line-clamp-3">"{r.review || 'Inget meddelande'}"</p>
                 <div className="text-[8px] font-medium text-white/10 uppercase tracking-widest">{new Date(r.createdAt).toLocaleDateString()}</div>
              </div>
            ))}
         </div>
      </div>
    </div>
  );
}
