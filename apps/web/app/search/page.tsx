"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import axios from "axios";
import { API_URL } from "@/lib/api";
import { Search as SearchIcon, Star, Clock, Bike, ChevronRight, Utensils, Phone } from "lucide-react";
import { motion } from "framer-motion";

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  cuisine?: string;
  description?: string;
  imageUrl?: string;
  heroImageUrl?: string;
  rating?: number;
  ratingCount?: number;
  deliveryFee?: number;
  minOrderAmount?: number;
  etaMinutes?: number;
  isOpen?: boolean;
  phone?: string;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    axios.get(`${API_URL}/api/restaurants`)
      .then(res => setRestaurants(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    return restaurants.filter(r => 
      r.name.toLowerCase().includes(query.toLowerCase()) ||
      (r.cuisine || "").toLowerCase().includes(query.toLowerCase()) ||
      (r.description || "").toLowerCase().includes(query.toLowerCase())
    );
  }, [query, restaurants]);

  const getImageSrc = (path?: string) => {
    if (!path) return "";
    if (path.startsWith("/")) return `${API_URL}${path}`;
    return path;
  };

  return (
    <div className="min-h-screen text-dark-text bg-light-200">
      <div className="mx-auto max-w-2xl px-4 pt-8 pb-32">
        <header className="mb-8">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-600 mb-2">Sök i plattformen</p>
          <h1 className="text-3xl font-black uppercase tracking-tighter mb-6">Upptäck <span className="text-gold-600">mat</span></h1>
          
          <div className="relative group">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-dark-sub/30 group-focus-within:text-gold-600 transition-colors">
              <SearchIcon size={20} />
            </div>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Sök restaurang eller matkategori..."
              className="w-full bg-white border border-light-400 rounded-2xl py-4 pl-12 pr-4 text-lg font-bold placeholder:text-dark-sub/20 focus:outline-none focus:border-gold-500 transition-all shadow-xl premium-shadow text-dark-text"
            />
          </div>
        </header>

        <section>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-28 bg-white animate-pulse rounded-2xl border border-light-400" />
              ))}
            </div>
          ) : query.trim() ? (
            <div className="space-y-4">
               <p className="text-[10px] font-black uppercase tracking-widest text-dark-sub/40 mb-2">Hittade {filtered.length} resultat</p>
               {filtered.length > 0 ? (
                 filtered.map(r => (
                   <Link
                     key={r.id}
                     href={r.slug === "palmyra" ? "/menu" : `/restaurants/${r.slug}`}
                     className="group flex overflow-hidden rounded-2xl bg-white border border-light-400 hover:border-gold-500/20 transition-all p-3 premium-shadow"
                   >
                     <div className="w-24 h-24 shrink-0 relative rounded-xl overflow-hidden bg-light-300">
                       {r.heroImageUrl || r.imageUrl ? (
                         <img
                           src={
                             r.slug === "palmyra"
                               ? getImageSrc("/hero-palmyra.svg")
                               : getImageSrc(r.heroImageUrl || r.imageUrl || "")
                           }
                           className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                         />
                       ) : <div className="h-full w-full flex items-center justify-center text-3xl opacity-20"><Utensils /></div>}
                     </div>
                     <div className="flex-1 px-4 py-1">
                       <h3 className="font-black uppercase tracking-tighter group-hover:text-gold-600 transition-colors text-dark-text">{r.name}</h3>
                       <p className="text-[10px] text-dark-sub/60 mb-2 font-bold uppercase">{r.cuisine}</p>
                       <div className="flex items-center gap-3 text-[9px] text-dark-sub/40 font-black uppercase mt-auto">
                         <span className="flex items-center gap-1"><Clock size={10} />{r.etaMinutes || 30} min</span>
                         <span className="flex items-center gap-1 text-gold-600"><Star size={10} className="fill-gold-600 translate-y-[-0.5px]" />{(r.rating || 4.6).toFixed(1)}</span>
                       </div>
                       <div className="flex items-center gap-1.5 mt-3">
                        <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider flex items-center gap-1 ${
                          r.isOpen !== false 
                            ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" 
                            : "bg-red-500/10 text-red-600 border border-red-500/20"
                        }`}>
                          <div className={`w-1 h-1 rounded-full ${r.isOpen !== false ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                          {r.isOpen !== false ? "Öppet" : "Stängt"}
                        </div>
                      </div>
                     </div>
                     <div className="flex items-center text-light-500 group-hover:text-gold-600 pr-2 transition-colors">
                       <ChevronRight size={20} />
                     </div>
                   </Link>
                 ))
               ) : (
                 <div className="py-12 text-center text-dark-sub/20">
                   <p className="text-3xl mb-2">🛸</p>
                   <p className="text-sm font-black uppercase tracking-widest">Inga matchningar för "{query}"</p>
                 </div>
               )}
            </div>
          ) : (
            <div className="py-12 text-center text-dark-sub/20">
              <div className="inline-flex p-4 rounded-full bg-white border border-light-400 mb-4 premium-shadow">
                <SearchIcon size={24} className="text-gold-600/40" />
              </div>
              <p className="text-sm font-black uppercase tracking-widest">Börja söka efter din nästa måltid</p>
              <p className="text-[10px] text-dark-sub/30 mt-2 font-bold uppercase tracking-tight">Kebab, Sushi, Pasta eller din favoritrestaurang</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
