"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";
import {
  MapPin,
  Search,
  Star,
  Clock,
  Bike,
  ChevronRight,
  Store,
  Truck,
  Flame,
  ArrowRight,
  X,
  Sparkles,
  Tag,
  Percent,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import AddressModal from "@/components/AddressModal";

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  cuisine?: string;
  description?: string;
  city?: string;
  imageUrl?: string;
  heroImageUrl?: string;
  rating?: number;
  ratingCount?: number;
  deliveryFee?: number;
  minOrderAmount?: number;
  etaMinutes?: number;
  isOpen?: boolean;
  featuredClass?: number;
  tags?: string[];
  phone?: string;
}

interface City {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  deliveryMode: "ALL" | "ONLY_PICKUP" | "ONLY_DELIVERY";
}

const cuisineFilters = [
  { label: "Alla", emoji: "📋" },
  { label: "Pizza", emoji: "🍕" },
  { label: "Sushi", emoji: "🍣" },
  { label: "Kebab", emoji: "🥙" },
  { label: "Burgare", emoji: "🍔" },
  { label: "Pasta", emoji: "🍝" },
  { label: "Asiatiskt", emoji: "🥢" },
];

const ORDER_TYPE_KEY = "platform_order_type";

export default function HomePage() {
  const router = useRouter();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [address, setAddress] = useState("");
  const [query, setQuery] = useState("");
  const [activeCuisine, setActiveCuisine] = useState("Alla");
  const [orderType, setOrderType] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [loading, setLoading] = useState(true);
  
  const [cities, setCities] = useState<City[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [selectedCity, setSelectedCity] = useState<City | null>(null);

  const [showAddressModal, setShowAddressModal] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [closedRestaurant, setClosedRestaurant] = useState<Restaurant | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("platform_address");
      if (stored) setAddress(stored);
      const storedType = localStorage.getItem(ORDER_TYPE_KEY);
      if (storedType === "PICKUP" || storedType === "DELIVERY") setOrderType(storedType as "DELIVERY" | "PICKUP");

      const err = localStorage.getItem("platform_address_error");
      if (err) {
        setDeliveryError(err);
        localStorage.removeItem("platform_address_error");
      }
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      axios.get(`${API_URL}/api/restaurants`),
      axios.get(`${API_URL}/api/cities`),
      axios.get(`${API_URL}/api/deals`)
    ]).then(([resRest, resCities, resDeals]) => {
      setRestaurants(resRest.data);
      setCities(resCities.data);
      setDeals(resDeals.data.filter((d: any) => d.isActive && d.showOnSite));
      
      const initialAddress = localStorage.getItem("platform_address") || "";
      if (initialAddress) {
        const match = resCities.data.find((c: City) => c.name.toLowerCase() === initialAddress.toLowerCase());
        if (match) setSelectedCity(match);
      }
    }).catch(() => {})
    .finally(() => setLoading(false));
  }, []);

  const saveAddress = (value: string) => {
    setAddress(value);
    if (typeof window !== "undefined") {
      localStorage.setItem("platform_address", value);
    }
  };

  const toggleOrderType = (type: "DELIVERY" | "PICKUP") => {
    if (selectedCity) {
      if (type === "DELIVERY" && selectedCity.deliveryMode === "ONLY_PICKUP") return;
      if (type === "PICKUP" && selectedCity.deliveryMode === "ONLY_DELIVERY") return;
    }

    setOrderType(type);
    if (typeof window !== "undefined") {
      localStorage.setItem(ORDER_TYPE_KEY, type);
    }
  };

  const handleCitySelect = (city: City) => {
    saveAddress(city.name);
    setSelectedCity(city);
    setShowCityDropdown(false);
    
    if (city.deliveryMode === "ONLY_PICKUP" && orderType === "DELIVERY") {
      toggleOrderType("PICKUP");
    } else if (city.deliveryMode === "ONLY_DELIVERY" && orderType === "PICKUP") {
      toggleOrderType("DELIVERY");
    }
  };

  const filtered = useMemo(() => {
    return restaurants.filter((r) => {
      const matchCuisine =
        activeCuisine === "Alla" ||
        (r.cuisine || "").toLowerCase().includes(activeCuisine.toLowerCase()) ||
        (r.tags || []).some((t) => t.toLowerCase().includes(activeCuisine.toLowerCase()));
      const matchQuery =
        query.trim().length === 0 ||
        r.name.toLowerCase().includes(query.toLowerCase()) ||
        (r.description || "").toLowerCase().includes(query.toLowerCase());
      
      let matchCity = true;
      if (address && selectedCity) {
        const restaurantCity = (r.city || "").trim().toLowerCase();
        matchCity = restaurantCity === selectedCity.name.toLowerCase();
      }

      return matchCuisine && matchQuery && matchCity;
    });
  }, [restaurants, activeCuisine, query, address]);

  const featured = filtered.filter((r) => r.featuredClass === 1 || r.featuredClass === 2).slice(0, 8);

  const getRestaurantHref = (r: Restaurant) =>
    r.slug === "palmyra" ? "/menu" : `/restaurants/${r.slug}`;

  const getImageSrc = (path?: string) => {
    if (!path) return "";
    if (path.startsWith("/")) return `${API_URL}${path}`;
    return path;
  };

  const getCardImage = (r: Restaurant) => {
    return getImageSrc(r.heroImageUrl || r.imageUrl || "");
  };

  const handleRestaurantClick = (e: React.MouseEvent, r: Restaurant) => {
    e.preventDefault();
    if (r.isOpen === false) {
      setClosedRestaurant(r);
      return;
    }
    router.push(getRestaurantHref(r));
  };

  const handleAddressConfirmed = (newAddress: string, newOrderType: "DELIVERY" | "PICKUP") => {
    saveAddress(newAddress);
    toggleOrderType(newOrderType);
    setShowAddressModal(false);
    if (pendingHref) {
      router.push(pendingHref);
      setPendingHref(null);
    }
  };

  return (
    <div className="min-h-screen text-zinc-100 bg-[#18181b] pt-10 pb-32">
      <div className="relative mx-auto max-w-6xl px-6 lg:px-10">
        {/* Modern Header */}
        <header className="mb-12 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-10 mb-12">
            <motion.div 
               initial={{ opacity: 0, x: -20 }}
               animate={{ opacity: 1, x: 0 }}
               className="flex-1"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-500/10 border border-gold-500/20 text-gold-500 text-[10px] font-black uppercase tracking-[0.3em] mb-4">
                <Sparkles size={12} />
                <span>Smaka Framtiden</span>
              </div>
              <h1 className="text-5xl lg:text-7xl font-black tracking-tighter leading-[0.9] text-white">
                VAD VILL DU <br /> <span className="text-gold-gradient italic">ÄTA</span> IDAG?
              </h1>
            </motion.div>

            {/* Premium Order Type Toggle */}
            <div className="relative p-1 glass-panel rounded-[2rem] flex items-center lg:w-[340px] shrink-0 active:scale-[0.98] transition-transform">
               <div className="absolute inset-y-1 h-auto bg-[#FF6B35] rounded-[1.8rem] transition-all duration-300 ease-out" 
                  style={{ 
                    width: 'calc(50% - 4px)', 
                    left: orderType === 'DELIVERY' ? '4px' : '50%'
                  }} 
               />
               <button onClick={() => toggleOrderType("DELIVERY")} className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${orderType === 'DELIVERY' ? 'text-zinc-950' : 'text-zinc-500'}`}>
                  <Truck size={16} /> Leverans
               </button>
               <button onClick={() => toggleOrderType("PICKUP")} className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${orderType === 'PICKUP' ? 'text-zinc-950' : 'text-zinc-500'}`}>
                  <Store size={16} /> Hämtning
               </button>
            </div>
          </div>

          {/* New Search & Address Bar */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid lg:grid-cols-[1fr,1.3fr] gap-3 p-2 rounded-[2.5rem] glass-panel shadow-2xl relative z-20"
          >
            <div className="relative group">
              <div className="flex items-center gap-3 rounded-[2rem] bg-obsidian/40 px-6 py-4 border border-white/5 group-focus-within:border-gold-500/50 transition-all">
                <MapPin className="text-gold-500 shrink-0" size={18} />
                <input
                  value={address}
                  onFocus={() => setShowCityDropdown(true)}
                  onChange={(e) => {
                    saveAddress(e.target.value);
                    const match = cities.find(c => c.name.toLowerCase() === e.target.value.toLowerCase());
                    if (match) setSelectedCity(match);
                    else setSelectedCity(null);
                  }}
                  placeholder="Hitta din stad..."
                  className="w-full bg-transparent text-sm placeholder:text-zinc-600 focus:outline-none font-bold text-white"
                />
              </div>
              
              <AnimatePresence>
                {showCityDropdown && cities.filter(c => c.name.toLowerCase().includes(address.toLowerCase())).length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute z-50 left-0 right-0 mt-2 p-2 glass-panel rounded-[2rem] shadow-2xl overflow-hidden"
                  >
                    {cities.filter(c => c.name.toLowerCase().includes(address.toLowerCase())).map(city => (
                      <button key={city.id} onClick={() => handleCitySelect(city)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 rounded-2xl transition-colors group">
                        <span className="text-xs font-black uppercase tracking-widest">{city.name}</span>
                        <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0" />
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Link href="/search" className="flex items-center gap-3 rounded-[2rem] bg-obsidian/40 px-6 py-4 border border-white/5 hover:border-gold-500/50 transition-all group shadow-sm">
               <Search size={18} className="text-zinc-700 group-hover:text-gold-500/60 transition-colors" />
               <span className="text-sm text-zinc-600 font-bold">Vilken restaurang eller maträtt söker du?</span>
               <div className="ml-auto w-10 h-10 rounded-full bg-gold-500 flex items-center justify-center text-zinc-950 group-hover:rotate-12 transition-all">
                  <ArrowRight size={20} />
               </div>
            </Link>
          </motion.div>
        </header>

        {/* Deals Selector */}
        {deals.length > 0 && (
          <section className="mb-10">
            <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
              {deals.map((deal, i) => (
                <motion.div
                  key={deal.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="shrink-0"
                >
                  <div className="flex flex-col gap-1 p-4 rounded-[1.8rem] bg-emerald-500/10 border border-emerald-500/20 w-[240px] relative overflow-hidden group">
                     <div className="absolute top-[-20px] right-[-20px] w-20 h-20 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition-all" />
                     <div className="flex items-center gap-2 mb-1">
                        <div className="w-6 h-6 rounded-lg bg-emerald-500 flex items-center justify-center text-dark-500">
                           <Percent size={12} strokeWidth={3} />
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">Erbjudande</span>
                     </div>
                     <h4 className="text-sm font-black text-white uppercase italic tracking-tighter leading-none">{deal.title}</h4>
                     <p className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest mt-1">{deal.restaurant?.name || "Gäller alla kök"}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Cuisine Selector */}
        <section className="mb-16">
          <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
            {cuisineFilters.map((c, i) => (
              <motion.button
                key={c.label}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                onClick={() => setActiveCuisine(c.label)}
                className={`whitespace-nowrap flex items-center gap-2 rounded-[1.1rem] px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.15em] transition-all border-2 active:scale-95 ${
                  activeCuisine === c.label
                    ? "bg-gold-500 text-zinc-950 border-gold-500 shadow-[0_8px_16px_rgba(231,178,75,0.1)]"
                    : "bg-obsidian/20 text-zinc-500 border-white/5 hover:border-white/10 hover:text-zinc-100"
                }`}
              >
                <span className="text-base grayscale-[0.5] group-hover:grayscale-0">{c.emoji}</span>
                <span>{c.label === "Alla" ? "Alla Restauranger" : c.label}</span>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Featured Section */}
        {featured.length > 0 && (
          <section className="mb-20">
            <div className="flex items-end justify-between mb-8 px-4">
               <div>
                  <h2 className="text-gold-gradient text-3xl font-black tracking-tight leading-none italic uppercase">HETA LISTAN</h2>
                  <p className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.3em] mt-2">Toppvalen i din stad just nu</p>
               </div>
               <Link href="/search" className="text-[10px] font-black uppercase tracking-widest text-zinc-200 border-b border-gold-500/50 pb-1 hover:text-gold-500 transition-all">Visa Alla</Link>
            </div>
            <div className="flex lg:grid lg:grid-cols-4 gap-6 overflow-x-auto lg:overflow-visible pb-10 no-scrollbar -mx-6 px-6 lg:mx-0 lg:px-0">
              {featured.map((r, i) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <Link
                    href={getRestaurantHref(r)}
                    onClick={(e) => handleRestaurantClick(e, r)}
                    className="group relative block w-[300px] lg:w-auto h-full glass-card rounded-[3rem] p-4 flex flex-col"
                  >
                    <div className="h-44 lg:h-56 w-full rounded-[2.2rem] bg-obsidian/50 relative overflow-hidden mb-6">
                      {r.heroImageUrl || r.imageUrl ? (
                        <img src={getCardImage(r)} alt={r.name} className="h-full w-full object-cover transition-all duration-700 group-hover:scale-110 group-hover:rotate-1" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-4xl">🍴</div>
                      )}
                      
                      <div className="absolute top-4 left-4">
                        <div className={`px-4 py-1.5 rounded-full backdrop-blur-md border flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest ${r.isOpen !== false ? "bg-emerald-500/30 border-emerald-500/30 text-emerald-100" : "bg-rose-500/30 border-rose-500/30 text-rose-100"}`}>
                           <div className={`w-1 h-1 rounded-full ${r.isOpen !== false ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`} />
                           {r.isOpen !== false ? "Live Nu" : "Väntar"}
                        </div>
                      </div>

                      <div className="absolute top-4 right-4 flex flex-col gap-2 items-end">
                        <div className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md flex items-center gap-1 border border-white/10">
                          <Star size={12} className="fill-gold-500 text-gold-500" />
                          <span className="text-[10px] font-black italic text-zinc-100">{(r.rating ?? 4.6).toFixed(1)}</span>
                        </div>
                        {deals.find(d => d.isGlobal || d.restaurantId === r.id) && (
                          <div className="px-3 py-1.5 rounded-full bg-emerald-500 text-dark-500 flex items-center gap-1 shadow-lg">
                             <Percent size={10} strokeWidth={4} />
                             <span className="text-[8px] font-black uppercase">{deals.find(d => d.isGlobal || d.restaurantId === r.id).title}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="px-3 pb-4">
                       <h3 className="text-xl font-black text-white group-hover:text-gold-500 transition-colors uppercase tracking-tight truncate leading-none mb-2">{r.name}</h3>
                       <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-6 truncate">{r.description || r.cuisine}</p>
                       
                       <div className="flex items-center justify-between border-t border-white/5 pt-5">
                          <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-wider text-zinc-400">
                             <span className="flex items-center gap-1.5"><Clock size={12} className="text-gold-500/50" /> {r.etaMinutes ?? 30} MIN</span>
                             <span className="flex items-center gap-1.5"><Bike size={12} className="text-gold-500/50" /> {r.deliveryFee ?? 0} KR</span>
                          </div>
                          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 group-hover:bg-gold-500 group-hover:text-zinc-950 transition-all">
                             <ChevronRight size={18} />
                          </div>
                       </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Dynamic List Section */}
        <section>
          <div className="flex items-center justify-between mb-10 px-4">
            <h2 className="text-xl font-black tracking-[0.2em] uppercase text-zinc-600">
              {activeCuisine === "Alla" ? "Alla Restauranger" : activeCuisine} <span className="text-zinc-800 ml-2">/ {filtered.length} st</span>
            </h2>
          </div>

          {loading ? (
            <div className="space-y-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-44 rounded-[3rem] glass-panel animate-pulse shadow-sm" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-24 text-center">
              <div className="w-20 h-20 bg-obsidian/60 rounded-full flex items-center justify-center mx-auto mb-8 border border-white/5">
                <Search size={32} className="text-zinc-800" />
              </div>
              <p className="text-2xl font-black uppercase tracking-tight text-white mb-2">Ingen träff</p>
              <p className="text-zinc-600 text-[10px] font-black uppercase tracking-widest">Här ekar det tomt just nu.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-1 xl:grid-cols-2 gap-8">
              {filtered.map((r, i) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    href={getRestaurantHref(r)}
                    onClick={(e) => handleRestaurantClick(e, r)}
                    className="group flex flex-col sm:flex-row glass-panel rounded-[3rem] p-4 gap-6 hover:border-gold-500/20 hover:bg-white/5 transition-all active:scale-[0.99]"
                  >
                    <div className="w-full sm:w-52 h-44 sm:h-auto shrink-0 rounded-[2.5rem] overflow-hidden relative">
                      {r.imageUrl ? (
                        <img src={getCardImage(r)} alt={r.name} className="h-full w-full object-cover group-hover:scale-105 transition-all" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center bg-obsidian text-4xl">🍱</div>
                      )}
                      
                      {r.isOpen === false && (
                        <div className="absolute inset-0 bg-obsidian/80 backdrop-blur-sm flex items-center justify-center">
                          <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest border border-rose-500/30 px-5 py-2 rounded-2xl">Stängt för dagen</span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 py-4 pr-6 flex flex-col justify-center min-w-0">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-2xl font-black text-white group-hover:text-gold-500 transition-colors uppercase tracking-tight leading-none truncate">{r.name}</h3>
                        <div className="flex flex-col items-end gap-2">
                           <div className="flex items-center gap-1.5 text-gold-500 font-black italic">
                             <Star size={14} className="fill-gold-500" />
                             <span className="text-xs">{(r.rating ?? 4.6).toFixed(1)}</span>
                           </div>
                           {deals.find(d => d.isGlobal || d.restaurantId === r.id) && (
                             <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[8px] font-black uppercase tracking-widest shadow-sm">
                                {deals.find(d => d.isGlobal || d.restaurantId === r.id).title}
                             </div>
                           )}
                        </div>
                      </div>
                      
                      <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest line-clamp-1 mb-8">{r.description || r.cuisine}</p>
                      
                      <div className="flex items-center flex-wrap gap-4 text-[9px] font-black uppercase text-zinc-500 bg-white/5 p-4 rounded-3xl border border-white/5">
                        <span className="flex items-center gap-2"><Clock size={12} className="text-gold-500/50" /> {r.etaMinutes ?? 30} MIN</span>
                        <span className="flex items-center gap-2"><Bike size={12} className="text-gold-500/50" /> {r.deliveryFee ?? 0} KR</span>
                        <span>MIN {r.minOrderAmount ?? 0} KR</span>
                        {deals.find(d => d.isGlobal || d.restaurantId === r.id) && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-zinc-800" />
                            <span className="flex items-center gap-2 text-emerald-500">
                               <Tag size={12} /> {deals.find(d => d.isGlobal || d.restaurantId === r.id).title}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {/* Promo Footer */}
        <section className="mt-24 rounded-[3.5rem] bg-gradient-to-r from-gold-500 to-amber-600 p-12 relative overflow-hidden group shadow-2xl shadow-gold-500/10">
           <div className="absolute right-[-50px] top-[-50px] w-[200px] h-[200px] bg-white/20 rounded-full blur-[80px]" />
           <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-10">
              <div className="text-center lg:text-left">
                 <h2 className="text-3xl lg:text-5xl font-black text-zinc-950 uppercase tracking-tighter leading-none mb-4 italic">BÄSTA MATEN <br /> I DIN TELEFON</h2>
                 <p className="text-zinc-950/60 text-[10px] font-black uppercase tracking-[0.2em]">Installera appen för en ännu snabbare upplevelse</p>
              </div>
              <button className="px-10 py-5 bg-obsidian text-white rounded-3xl font-black uppercase tracking-[0.3em] text-[10px] shadow-2xl active:scale-95 transition-all group-hover:bg-zinc-900 border border-white/5">Hämta Appen</button>
           </div>
        </section>
      </div>

      <AddressModal isOpen={showAddressModal} onClose={() => { setShowAddressModal(false); setPendingHref(null); }} onConfirm={handleAddressConfirmed} orderType={orderType} setOrderType={toggleOrderType} />

      {/* Closed popup handling */}
      <AnimatePresence>
        {closedRestaurant && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center bg-obsidian/95 backdrop-blur-md p-6" onClick={() => setClosedRestaurant(null)}>
             <motion.div initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm glass-panel p-10 rounded-[3.5rem] text-center border border-white/10" onClick={e => e.stopPropagation()}>
                <div className="w-20 h-20 bg-rose-500/10 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 border border-rose-500/20 shadow-lg shadow-rose-500/10">
                   <span className="text-4xl text-rose-500 group-hover:scale-110 transition-transform">🌙</span>
                </div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tight italic mb-2">{closedRestaurant.name}</h3>
                <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-widest mb-10 leading-relaxed">Tyvärr är köket stängt för dagen. <br /> Vill du se menyn ändå?</p>
                <div className="flex flex-col gap-3">
                   <button onClick={() => { router.push(getRestaurantHref(closedRestaurant)); setClosedRestaurant(null); }} className="w-full py-5 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all">Se Meny</button>
                   <button onClick={() => setClosedRestaurant(null)} className="w-full py-5 text-zinc-500 font-black uppercase text-[10px] tracking-widest hover:text-zinc-300">Stäng</button>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
