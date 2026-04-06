/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { 
  Clock, 
  Search, 
  ChevronRight, 
  Store, 
  CalendarDays,
  Settings2,
  ArrowRight
} from "lucide-react";
import { motion } from "framer-motion";
import { API_URL } from "@/lib/api";
import { useRestaurantStore } from "@/store/restaurantStore";

export default function HoursSelectionHub() {
  const router = useRouter();
  const { setRestaurant } = useRestaurantStore();
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem("matgo_admin");
    const admin = raw ? JSON.parse(raw) : null;
    if (admin?.role !== "SUPER_ADMIN") {
      router.replace("/orders");
      return;
    }

    const fetchRestaurants = async () => {
      try {
        const token = localStorage.getItem("matgo_token");
        const res = await axios.get(`${API_URL}/api/restaurants`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setRestaurants(res.data);
      } catch { } finally { setLoading(false); }
    };
    fetchRestaurants();
  }, [router]);

  const filtered = restaurants.filter(r => 
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.city?.name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="min-h-screen glass flex items-center justify-center"><div className="w-10 h-10 border-2 border-gold-500/20 border-t-gold-500 rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen glass p-4 lg:p-10 text-[var(--text-primary)] font-sans">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-16">
          <div>
            <div className="flex items-center gap-3 mb-2 text-gold-500">
              <CalendarDays size={20} />
              <span className="text-[10px] font-black uppercase tracking-[0.4em] leading-none text-gold-500/60">Global Control</span>
            </div>
            <h1 className="text-4xl lg:text-6xl font-black tracking-tighter uppercase italic leading-none">
              ÖPPETTIDER <span className="text-gold-500">HUB</span>
            </h1>
            <p className="text-[var(--text-primary)]/20 text-[11px] font-black uppercase tracking-widest mt-4 ml-1">Hantera scheman och speciella öppettider för alla enheter</p>
          </div>

          <div className="relative group min-w-[300px]">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/20 group-focus-within:text-gold-500 transition-colors" size={18} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sök restaurang..." className="w-full glass border border-[var(--border-subtle)] rounded-2xl pl-14 pr-6 py-5 text-sm font-black focus:outline-none focus:border-gold-500/30 transition-all shadow-2xl" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
           {filtered.map(r => (
             <button 
               key={r.id} 
               onClick={() => {
                  setRestaurant(r.id, r.name);
                  router.push(`/settings/hours/${r.id}`);
               }}
               className="group text-left p-8 rounded-[2.5rem] glass border border-[var(--border-subtle)] hover:border-gold-500/30 transition-all hover:bg-gold-500/5 flex flex-col h-64 shadow-xl"
             >
                <div className="flex items-start justify-between mb-8">
                   <div className="p-4 bg-[var(--border-subtle)] rounded-2xl text-gold-500 group-hover:scale-110 transition-transform"><Clock size={24} /></div>
                   <div className="text-right">
                      <span className="text-[10px] font-black uppercase text-[var(--text-primary)]/10 tracking-widest italic">{r.city?.name || "Lund"}</span>
                   </div>
                </div>
                <div className="mt-auto">
                   <h3 className="text-2xl font-black uppercase italic leading-none truncate group-hover:text-gold-500 transition-colors">{r.name}</h3>
                   <div className="flex items-center justify-between mt-4">
                      <span className="text-[10px] font-black uppercase text-[var(--text-primary)]/20 tracking-widest">Hantera Schema</span>
                      <div className="w-10 h-10 rounded-full border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-primary)]/10 group-hover:bg-gold-500 group-hover:text-dark-500 group-hover:border-gold-500 transition-all">
                         <ChevronRight size={18} />
                      </div>
                   </div>
                </div>
             </button>
           ))}
        </div>
      </div>
    </div>
  );
}
