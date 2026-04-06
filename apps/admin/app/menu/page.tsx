/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { 
  Store, 
  Search, 
  ChevronRight, 
  Utensils, 
  Globe, 
  ArrowRight,
  TrendingUp,
  LayoutGrid,
  Package,
  Layers,
  Settings2
} from "lucide-react";
import { motion } from "framer-motion";
import { API_URL } from "@/lib/api";
import { useRestaurantStore } from "@/store/restaurantStore";

export default function MenuSelectionHub() {
  const router = useRouter();
  const { selectedRestaurantId, setRestaurant } = useRestaurantStore();
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("matgo_admin");
      const admin = raw ? JSON.parse(raw) : null;
      setIsSuperAdmin(admin?.role === "SUPER_ADMIN");
      
      // If regular admin, they usually have a fixed restaurant.
      if (admin && admin.role !== "SUPER_ADMIN" && admin.restaurantId) {
        router.replace(`/menu/${admin.restaurantId}`);
        return;
      }
    } catch { setIsSuperAdmin(false); }

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

  // If a restaurant is already selected in the store, we could redirect immediately.
  // But the user expressed they want to list ALL restaurants if none/all selected.
  
  const filtered = restaurants.filter(r => 
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.city?.name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
     return (
        <div className="min-h-screen glass flex items-center justify-center">
           <div className="w-10 h-10 border-2 border-gold-500/20 border-t-gold-500 rounded-full animate-spin" />
        </div>
     );
  }

  return (
    <div className="min-h-screen glass p-4 lg:p-10 text-[var(--text-primary)] font-sans">
      <div className="max-w-[1200px] mx-auto">
        
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-16">
          <div>
            <div className="flex items-center gap-3 mb-2 text-gold-500">
              <LayoutGrid size={20} />
              <span className="text-[10px] font-black uppercase tracking-[0.4em] leading-none text-gold-500/60 font-black">Management Portal</span>
            </div>
            <h1 className="text-4xl lg:text-6xl font-black tracking-tighter uppercase italic leading-none">
              MENY <span className="text-gold-500">HUBBEN</span>
            </h1>
            <p className="text-[var(--text-primary)]/20 text-[11px] font-black uppercase tracking-widest mt-4 ml-1">Välj en restaurang för att hantera produkter och kategorier</p>
          </div>

          <div className="relative group min-w-[300px]">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/20 group-focus-within:text-gold-500 transition-colors" size={18} />
            <input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök restaurang eller stad..."
              className="w-full glass border border-[var(--border-subtle)] rounded-2xl pl-14 pr-6 py-5 text-sm font-black focus:outline-none focus:border-gold-500/30 transition-all shadow-2xl"
            />
          </div>
        </div>

        {/* Global Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
           <div className="p-8 rounded-[3rem] bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20 group hover:border-emerald-500/40 transition-all relative overflow-hidden">
              <div className="relative z-10">
                 <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 mb-6 font-black"><Layers size={24} /></div>
                 <h3 className="text-2xl font-black uppercase italic tracking-tighter mb-2">Restaurangcenter</h3>
                 <p className="text-[11px] font-black uppercase text-[var(--text-primary)]/30 tracking-widest leading-relaxed max-w-[200px]">Hantera menyer och sortiment individuellt per restaurang.</p>
                 <button onClick={() => router.push('/restaurants')} className="mt-8 flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-emerald-500 hover:text-[var(--text-primary)] transition-all">Gå till Restauranger <ArrowRight size={14} /></button>
              </div>
              <Layers size={140} className="absolute -bottom-10 -right-10 text-emerald-500/5 rotate-12 group-hover:rotate-0 transition-transform duration-700" />
           </div>

           <div className="p-8 rounded-[3rem] bg-gradient-to-br from-gold-500/10 to-transparent border border-gold-500/20 group hover:border-gold-500/40 transition-all relative overflow-hidden text-right flex flex-col items-end">
              <div className="relative z-10">
                 <div className="w-12 h-12 bg-gold-500/10 rounded-2xl flex items-center justify-center text-gold-500 mb-6 font-black ml-auto"><Globe size={24} /></div>
                 <h3 className="text-2xl font-black uppercase italic tracking-tighter mb-2">Globala Inställningar</h3>
                 <p className="text-[11px] font-black uppercase text-[var(--text-primary)]/30 tracking-widest leading-relaxed max-w-[200px] ml-auto">Hantera priskonfigurationer och skatteinställningar för hela kedjan.</p>
                 <button onClick={() => router.push('/settings/global')} className="mt-8 flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-gold-500 hover:text-[var(--text-primary)] transition-all">Restauranginställningar <ArrowRight size={14} /></button>
              </div>
              <Globe size={140} className="absolute -bottom-10 -left-10 text-gold-500/5 -rotate-12 group-hover:rotate-0 transition-transform duration-700" />
           </div>
        </div>

        {/* Restaurant Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
           {filtered.map(r => (
             <button 
               key={r.id} 
               onClick={() => {
                  setRestaurant(r.id, r.name);
                  router.push(`/menu/${r.id}`);
               }}
               className="group text-left p-8 rounded-[2.5rem] glass border border-[var(--border-subtle)] hover:border-gold-500/30 transition-all hover:bg-gold-500/5 flex flex-col h-64 shadow-xl"
             >
                <div className="flex items-start justify-between mb-8">
                   <div className="p-4 bg-[var(--border-subtle)] rounded-2xl text-gold-500 group-hover:scale-110 transition-transform"><Store size={24} /></div>
                   <div className="flex flex-col items-end">
                      <span className="text-[10px] font-black uppercase text-[var(--text-primary)]/10 tracking-widest italic">{r.city?.name || "Lund"}</span>
                      <div className="h-1.5 w-1.5 bg-emerald-500 rounded-full mt-2 animate-pulse" />
                   </div>
                </div>
                <div className="mt-auto">
                   <h3 className="text-2xl font-black uppercase italic leading-none truncate group-hover:text-gold-500 transition-colors">{r.name}</h3>
                   <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center gap-4">
                         <div className="flex flex-col">
                            <span className="text-[8px] font-black uppercase text-[var(--text-primary)]/20 tracking-widest">Artiklar</span>
                            <span className="text-xs font-black text-[var(--text-primary)]/60">Hantera Meny</span>
                         </div>
                      </div>
                      <div className="w-10 h-10 rounded-full border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-primary)]/10 group-hover:bg-gold-500 group-hover:text-dark-500 group-hover:border-gold-500 transition-all">
                         <ChevronRight size={18} />
                      </div>
                   </div>
                </div>
             </button>
           ))}

           {filtered.length === 0 && (
              <div className="col-span-full py-32 text-center glass border border-dashed border-[var(--border-subtle)] rounded-[3rem]">
                 <p className="text-[11px] font-black uppercase tracking-[0.5em] text-[var(--text-primary)]/5">Inga restauranger matchar sökningen</p>
              </div>
           )}
        </div>
      </div>
    </div>
  );
}
