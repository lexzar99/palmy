"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import axios from "axios";
import { API_URL } from "@/lib/api";
import { Search as SearchIcon, Star, Clock, Bike, ChevronRight, Utensils } from "lucide-react";
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
    <div className="min-h-screen text-white">
      <div className="mx-auto max-w-2xl px-4 pt-8 pb-32">
        <header className="mb-8">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-500/60 mb-2">Sök i plattformen</p>
          <h1 className="text-3xl font-black uppercase tracking-tight mb-6">Upptäck <span className="text-gold-500">mat</span></h1>
          
          <div className="relative group">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gold-500/40 group-focus-within:text-gold-500 transition-colors">
              <SearchIcon size={20} />
            </div>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Sök restaurang eller matkategori..."
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-lg font-medium placeholder:text-white/20 focus:outline-none focus:border-sky-500/50 focus:bg-white/[0.07] transition-all shadow-2xl shadow-black/50"
            />
          </div>
        </header>

        <section>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-28 bg-white/5 animate-pulse rounded-2xl" />
              ))}
            </div>
          ) : query.trim() ? (
            <div className="space-y-4">
               <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">Hittade {filtered.length} resultat</p>
               {filtered.length > 0 ? (
                 filtered.map(r => (
                   <Link
                     key={r.id}
                     href={r.slug === "palmyra" ? "/menu" : `/restaurants/${r.slug}`}
                     className="group flex overflow-hidden rounded-2xl bg-white/[0.03] border border-white/5 hover:border-gold-500/20 transition-all p-3"
                   >
                     <div className="w-24 h-24 shrink-0 relative rounded-xl overflow-hidden bg-white/5">
                       {r.heroImageUrl || r.imageUrl ? (
                         <img
                           src={
                             r.slug === "palmyra"
                               ? getImageSrc("/hero-palmyra.svg")
                               : getImageSrc(r.heroImageUrl || r.imageUrl || "")
                           }
                           className="h-full w-full object-cover"
                         />
                       ) : <div className="h-full w-full flex items-center justify-center text-3xl opacity-20"><Utensils /></div>}
                     </div>
                     <div className="flex-1 px-4 py-1">
                       <h3 className="font-black uppercase tracking-tight group-hover:text-gold-500 transition-colors">{r.name}</h3>
                       <p className="text-[10px] text-white/30 mb-2">{r.cuisine}</p>
                       <div className="flex items-center gap-3 text-[9px] text-white/30 font-bold uppercase mt-auto">
                         <span className="flex items-center gap-1"><Clock size={10} />{r.etaMinutes || 30} min</span>
                         <span className="flex items-center gap-1 text-gold-500/80"><Star size={10} className="fill-gold-500/80 translate-y-[-0.5px]" />{(r.rating || 4.6).toFixed(1)}</span>
                       </div>
                     </div>
                     <div className="flex items-center text-white/10 group-hover:text-gold-500 pr-2">
                       <ChevronRight size={20} />
                     </div>
                   </Link>
                 ))
               ) : (
                 <div className="py-12 text-center text-white/20">
                   <p className="text-3xl mb-2">🛸</p>
                   <p className="text-sm font-bold uppercase">Inga matchningar för "{query}"</p>
                 </div>
               )}
            </div>
          ) : (
            <div className="py-12 text-center text-white/20">
              <div className="inline-flex p-4 rounded-full bg-white/5 border border-white/5 mb-4">
                <SearchIcon size={24} className="text-gold-500/40" />
              </div>
              <p className="text-sm font-bold uppercase tracking-widest">Börja söka efter din nästa måltid</p>
              <p className="text-[10px] text-white/10 mt-2 font-medium uppercase tracking-tight">Kebab, Sushi, Pasta eller din favoritrestaurang</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
