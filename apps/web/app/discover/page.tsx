"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import axios from "axios";
import { 
  Search, Sparkles, MapPin, Star, History, Compass, ArrowRight,
  Utensils, Coffee, Pizza, Bike, Clock, Heart, Filter, ChevronRight
} from "lucide-react";
import { API_URL } from "@/lib/api";

const getImageSrc = (path?: string) => {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  if (path.startsWith("/")) return `${API_URL}${path}`;
  return path;
};

const CATEGORIES = [
  { name: "Pizza", icon: Pizza, color: "bg-rose-500/10 text-rose-500" },
  { name: "Burgare", icon: Utensils, color: "bg-amber-500/10 text-amber-500" },
  { name: "Sallad", icon: Coffee, color: "bg-emerald-500/10 text-emerald-500" },
  { name: "Sushir", icon: Sparkles, color: "bg-blue-500/10 text-blue-500" },
  { name: "Kebab", icon: Utensils, color: "bg-orange-500/10 text-orange-500" },
  { name: "Snabbmat", icon: Bike, color: "bg-purple-500/10 text-purple-500" },
];

export default function DiscoverPage() {
  const [activeSearch, setActiveSearch] = useState("");
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  // Zone awareness: IDs that can deliver to the saved address (null = no address yet)
  const [deliverableIds, setDeliverableIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    const savedToken = localStorage.getItem("platform_user_token");
    setToken(savedToken);
    fetchData(savedToken);

    // Load zone data for the saved delivery address
    try {
      const storedCoords = localStorage.getItem("platform_coords");
      const storedType   = localStorage.getItem("platform_order_type");
      if (storedCoords && storedType !== "PICKUP") {
        const { lat, lng } = JSON.parse(storedCoords);
        axios.post(`${API_URL}/api/cities/validate-location`, { lat, lng })
          .then(res => {
            if (res.data.covered) {
              const ids = new Set<string>(
                res.data.cities.flatMap((c: any) => c.restaurants.map((r: any) => r.id))
              );
              setDeliverableIds(ids);
            } else {
              setDeliverableIds(new Set()); // covered=false → nothing delivers here
            }
          })
          .catch(() => setDeliverableIds(null)); // fail open
      }
    } catch {}
  }, []);

  const fetchData = async (authToken: string | null) => {
    try {
      const [restRes, ordersRes] = await Promise.all([
        axios.get(`${API_URL}/api/restaurants`),
        authToken ? axios.get(`${API_URL}/api/profile/orders`, { headers: { Authorization: `Bearer ${authToken}` } }) : Promise.resolve({ data: [] })
      ]);
      setRestaurants(restRes.data || []);
      setRecentOrders(ordersRes.data?.slice(0, 3) || []);
    } catch (err) {
      console.error("Discover fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredRestaurants = restaurants.filter(r => 
    r.name.toLowerCase().includes(activeSearch.toLowerCase()) ||
    r.categories?.some((c: any) => c.name.toLowerCase().includes(activeSearch.toLowerCase()))
  );

  const trendingRestaurants = [...restaurants].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 5);

  return (
    <div className="min-h-screen bg-obsidian text-white pb-32">
      {/* Header & Search */}
      <div className="bg-obsidian border-b border-white/5 pt-16 pb-8 px-6 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-black uppercase italic tracking-tighter">Upptäck <span className="text-gold-500">MatGo</span></h1>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mt-1">Hitta din nästa favoritupplevelse</p>
            </div>
            <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-gold-500">
               <Compass size={24} className="animate-spin-slow" />
            </div>
          </div>

          <div className="relative group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-gold-500 transition-colors" size={20} />
            <input 
              type="text"
              value={activeSearch}
              onChange={(e) => setActiveSearch(e.target.value)}
              placeholder="Sök restauranger, rätter eller smaker..."
              className="w-full bg-white/5 border border-white/10 rounded-3xl py-5 pl-14 pr-6 font-bold text-white placeholder:text-zinc-700 outline-none focus:ring-2 focus:ring-gold-500/30 transition-all shadow-2xl"
            />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 pt-8 space-y-12">
        

        {/* Categories Grid */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Bläddra Kategorier</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide px-2">
            {CATEGORIES.map((cat) => (
              <motion.button 
                key={cat.name}
                whileTap={{ scale: 0.95 }}
                onClick={() => setActiveSearch(cat.name)}
                className="flex items-center gap-3 px-6 py-4 bg-white/5 border border-white/5 rounded-full hover:bg-white/10 transition-all shrink-0 group"
              >
                <div className={`w-6 h-6 ${cat.color} rounded-lg flex items-center justify-center transition-transform group-hover:scale-110`}>
                  <cat.icon size={12} />
                </div>
                <p className="font-black text-[9px] uppercase tracking-widest text-zinc-400 group-hover:text-white transition-colors">{cat.name}</p>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Trending Restaurants */}
        {!activeSearch && (
          <section className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-3">
                <Sparkles className="text-gold-500" size={18} /> Populärt Just nu
              </h2>
            </div>
            <div className="space-y-4">
              {trendingRestaurants.map((rest) => (
                <Link 
                  key={rest.id}
                  href={`/restaurants/${rest.slug}`}
                  className="flex items-center gap-4 p-3 bg-white/5 border border-white/5 rounded-[2rem] hover:bg-white/10 transition-all group overflow-hidden relative"
                >
                  <div className="w-16 h-16 bg-zinc-900 rounded-[1.2rem] border border-white/5 flex items-center justify-center shrink-0 overflow-hidden">
                    <img src={getImageSrc(rest.imageUrl)} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-black uppercase italic truncate">{rest.name}</h3>
                      {rest.isOpen === false && <span className="bg-rose-500/10 text-rose-400 text-[7px] font-black px-2 py-0.5 rounded-full uppercase shrink-0">Stängd</span>}
                      {rest.isOpen !== false && rest.rating && <span className="bg-emerald-500/10 text-emerald-400 text-[7px] font-black px-2 py-0.5 rounded-full uppercase shrink-0">Öppet</span>}
                    </div>
                    <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                      <div className="flex items-center gap-1 text-gold-500">
                        <Star size={10} className="fill-gold-500" /> {rest.rating?.toFixed(1) || "NY"}
                      </div>
                      <span>•</span>
                      <span className="truncate">{rest.city}</span>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-zinc-600 group-hover:text-gold-500 transition-all shrink-0" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Search Results */}
        {activeSearch && (
          <section className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-sm font-black uppercase tracking-widest">Sökresultat för "{activeSearch}"</h2>
              <button 
                onClick={() => setActiveSearch("")}
                className="text-[10px] font-black uppercase text-zinc-600 hover:text-white"
              >
                Rensa
              </button>
            </div>
            <div className="space-y-4">
              {filteredRestaurants.length === 0 ? (
                <div className="py-20 text-center bg-white/2 rounded-[2.5rem] border border-dashed border-white/5">
                  <Utensils size={48} className="mx-auto mb-4 text-zinc-800" />
                  <p className="font-black uppercase text-zinc-600">Inga restauranger hittade</p>
                  <p className="text-xs text-zinc-800 mt-2">Prova att söka på något annat</p>
                </div>
              ) : (
                filteredRestaurants.map((rest) => {
                  const inZone = deliverableIds === null || deliverableIds.has(rest.id);
                  return (
                    <Link 
                      key={rest.id}
                      href={`/restaurants/${rest.slug}`}
                      className={`flex items-center gap-6 p-4 border rounded-[2.5rem] transition-all group relative overflow-hidden ${
                        inZone ? "bg-white/5 border-white/5 hover:bg-white/10" : "bg-white/2 border-white/5 opacity-50"
                      }`}
                    >
                      <div className="w-16 h-16 bg-zinc-900 rounded-[1.2rem] border border-white/5 flex items-center justify-center shrink-0 overflow-hidden">
                        <img src={getImageSrc(rest.imageUrl)} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-black uppercase italic text-sm truncate">{rest.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[9px] text-zinc-500 font-bold uppercase">{rest.city}</p>
                          {!inZone && deliverableIds !== null && (
                            <span className="text-[8px] font-black text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                              Levererar ej till din adress
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-zinc-700 group-hover:text-gold-500 transition-all shrink-0" />
                    </Link>
                  );
                })
              )}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
