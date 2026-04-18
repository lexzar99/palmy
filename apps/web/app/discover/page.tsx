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
    } catch (err) {
      console.warn("Failed to load zone data:", err);
    }
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
    <div className="min-h-screen pb-32" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {/* Header & Search */}
      <div className="pt-16 pb-8 px-6 sticky top-0 z-40 backdrop-blur-md" style={{ backgroundColor: "var(--bg-primary)", borderBottom: "1px solid var(--border-muted)" }}>
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-black uppercase italic tracking-tighter" style={{ color: "var(--text-primary)" }}>Upptäck <span className="text-gold-500">MatGo</span></h1>
              <p className="text-[10px] font-black uppercase tracking-widest mt-1" style={{ color: "var(--text-secondary)" }}>Hitta din nästa favoritupplevelse</p>
            </div>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-gold-500" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
               <Compass size={24} className="animate-spin-slow" />
            </div>
          </div>

          <div className="relative group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 group-focus-within:text-gold-500 transition-colors" style={{ color: "var(--text-secondary)" }} size={20} />
            <input 
              type="text"
              value={activeSearch}
              onChange={(e) => setActiveSearch(e.target.value)}
              placeholder="Sök restauranger, rätter eller smaker..."
              className="w-full rounded-3xl py-5 pl-14 pr-6 font-bold outline-none focus:ring-2 focus:ring-gold-500/30 transition-all shadow-xl"
              style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
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
                className="flex items-center gap-3 px-6 py-4 rounded-full transition-all shrink-0 group shadow-sm"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
              >
                <div className={`w-6 h-6 ${cat.color} rounded-lg flex items-center justify-center transition-transform group-hover:scale-110`}>
                  <cat.icon size={12} />
                </div>
                <p className="font-black text-[9px] uppercase tracking-widest group-hover:text-gold-500 transition-colors" style={{ color: "var(--text-secondary)" }}>{cat.name}</p>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Trending Restaurants */}
        {!activeSearch && (
          <section className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-3" style={{ color: "var(--text-primary)" }}>
                <Sparkles className="text-gold-500" size={18} /> Populärt Just nu
              </h2>
            </div>
            <div className="space-y-4">
              {trendingRestaurants.map((rest) => (
                <Link 
                  key={rest.id}
                  href={`/restaurants/${rest.slug}`}
                  className="flex items-center gap-4 p-3 rounded-[2rem] transition-all group overflow-hidden relative shadow-sm"
                  style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
                >
                  <div className="w-16 h-16 rounded-[1.2rem] flex items-center justify-center shrink-0 overflow-hidden" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)" }}>
                    <img src={getImageSrc(rest.imageUrl)} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Name — full row, truncates cleanly */}
                    <h3 className="text-base font-black uppercase italic truncate leading-tight mb-1.5" style={{ color: "var(--text-primary)" }}>
                      {rest.name}
                    </h3>
                    {/* Info row below — badge + rating + city */}
                    <div className="flex items-center gap-2 flex-wrap text-[9px] font-black uppercase tracking-widest text-zinc-500">
                      {rest.isOpen === false ? (
                        <span className="bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded-full border border-rose-500/20">
                          Stängd
                        </span>
                      ) : (
                        <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          Öppet
                        </span>
                      )}
                      {rest.rating && (
                        <span className="flex items-center gap-1 text-gold-500">
                          <Star size={9} className="fill-gold-500" /> {rest.rating.toFixed(1)}
                        </span>
                      )}
                      {rest.city && <span className="truncate opacity-50">{rest.city}</span>}
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
              <h2 className="text-sm font-black uppercase tracking-widest" style={{ color: "var(--text-primary)" }}>Sökresultat för "{activeSearch}"</h2>
              <button 
                onClick={() => setActiveSearch("")}
                className="text-[10px] font-black uppercase hover:text-gold-500"
                style={{ color: "var(--text-secondary)" }}
              >
                Rensa
              </button>
            </div>
            <div className="space-y-4">
              {filteredRestaurants.length === 0 ? (
                <div className="py-20 text-center rounded-[2.5rem] border border-dashed" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)" }}>
                  <Utensils size={48} className="mx-auto mb-4 opacity-10" style={{ color: "var(--text-primary)" }} />
                  <p className="font-black uppercase" style={{ color: "var(--text-secondary)" }}>Inga restauranger hittade</p>
                  <p className="text-xs mt-2" style={{ color: "var(--text-secondary)", opacity: 0.4 }}>Prova att söka på något annat</p>
                </div>
              ) : (
                filteredRestaurants.map((rest) => {
                  const inZone = deliverableIds === null || deliverableIds.has(rest.id);
                  return (
                    <Link 
                      key={rest.id}
                      href={`/restaurants/${rest.slug}`}
                      className={`flex items-center gap-6 p-4 border rounded-[2.5rem] transition-all group relative overflow-hidden shadow-sm ${
                        inZone ? "" : "opacity-50"
                      }`}
                      style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
                    >
                      <div className="w-16 h-16 rounded-[1.2rem] flex items-center justify-center shrink-0 overflow-hidden" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)" }}>
                        <img src={getImageSrc(rest.imageUrl)} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-black uppercase italic text-sm truncate" style={{ color: "var(--text-primary)" }}>{rest.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-secondary)" }}>{rest.city}</p>
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
