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
  Sparkles,
  ArrowRight,
  X,
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

const cuisineFilters = [
  { label: "Alla", emoji: "🍽️" },
  { label: "Pizza", emoji: "🍕" },
  { label: "Sushi", emoji: "🍣" },
  { label: "Kebab", emoji: "🥙" },
  { label: "Burgare", emoji: "🍔" },
  { label: "Thai", emoji: "🌶️" },
  { label: "Indiskt", emoji: "🍛" },
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
  
  // Address modal state
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  
  // Closed restaurant popup state
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
    axios
      .get(`${API_URL}/api/restaurants`)
      .then((res) => setRestaurants(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const saveAddress = (value: string) => {
    setAddress(value);
    if (typeof window !== "undefined") {
      localStorage.setItem("platform_address", value);
    }
  };

  const toggleOrderType = (type: "DELIVERY" | "PICKUP") => {
    setOrderType(type);
    if (typeof window !== "undefined") {
      localStorage.setItem(ORDER_TYPE_KEY, type);
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
      return matchCuisine && matchQuery;
    });
  }, [restaurants, activeCuisine, query]);

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

    // Closed restaurant check
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
    <div className="min-h-screen text-zinc-100 bg-zinc-950">
      <div className="relative mx-auto max-w-[1600px] px-6 lg:px-16 pb-32 pt-12">

        {/* Header */}
        <header className="mb-12">
          <div className="flex items-center justify-between mb-8">
            <div>
              <p className="text-[12px] font-black uppercase tracking-[0.4em] text-gold-600 mb-2">Välkommen till plattformen</p>
              <h1 className="text-5xl lg:text-7xl font-black tracking-tighter uppercase leading-none">
                VAD VILL DU <span className="text-gold-600">ÄTA</span>?
              </h1>
            </div>
            <div className="hidden lg:flex h-20 w-20 items-center justify-center rounded-[2rem] bg-gold-400/20 border border-gold-500/20 text-gold-600 shadow-2xl">
              <Sparkles size={40} />
            </div>
          </div>

          {/* Order type toggle */}
          <div className="flex items-center gap-4 mb-10 p-2 bg-zinc-900 rounded-[2.5rem] border border-white/10 shadow-2xl max-w-xl mx-auto lg:mx-0">
            <button
              onClick={() => toggleOrderType("DELIVERY")}
              className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-3xl text-sm font-black uppercase tracking-widest transition-all ${
                orderType === "DELIVERY"
                  ? "bg-gold-500 text-white shadow-xl shadow-gold-500/25 scale-[1.02]"
                  : "text-zinc-500 hover:text-zinc-100"
              }`}
            >
              <Truck size={20} />
              Leverans
            </button>
            <button
              onClick={() => toggleOrderType("PICKUP")}
              className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-3xl text-sm font-black uppercase tracking-widest transition-all ${
                orderType === "PICKUP"
                  ? "bg-gold-500 text-white shadow-xl shadow-gold-500/25 scale-[1.02]"
                  : "text-zinc-500 hover:text-zinc-100"
              }`}
            >
              <Store size={20} />
              Avhämtning
            </button>
          </div>

          {/* Address + search */}
          <div className="grid gap-4 lg:grid-cols-[1fr,1.5fr]">
            <div className="flex items-center gap-4 rounded-2xl bg-zinc-900 border border-white/10 px-6 py-5 focus-within:border-gold-500 transition-all shadow-2xl">
              <MapPin className="text-gold-500 shrink-0" size={20} />
              <input
                value={address}
                onChange={(e) => saveAddress(e.target.value)}
                placeholder={orderType === "DELIVERY" ? "Var ska vi leverera maten?" : "Ange din stad..."}
                className="w-full bg-transparent text-lg placeholder:text-zinc-400/20 focus:outline-none font-bold text-zinc-100"
              />
              {address && (
                <button onClick={() => saveAddress("")} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                  <X size={14} />
                </button>
              )}
            </div>
            <Link href="/search" className="flex items-center gap-4 rounded-2xl bg-zinc-900 border border-white/10 px-6 py-5 hover:border-gold-500 transition-all cursor-pointer shadow-2xl">
              <Search size={22} className="text-zinc-400/30 shrink-0" />
              <span className="text-lg text-zinc-400/30 font-bold">Hitta restaurang, mat eller kategori...</span>
            </Link>
          </div>

          {address && (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold">
              <MapPin size={10} />
              {address}
            </div>
          )}
        </header>

        {/* Cuisine filter chips */}
        <section className="mb-12">
          <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
            {cuisineFilters.map((c) => (
              <button
                key={c.label}
                onClick={() => setActiveCuisine(c.label)}
                className={`whitespace-nowrap flex items-center gap-3 rounded-2xl px-6 py-3 text-xs font-black uppercase tracking-[0.2em] transition-all border-2 ${
                  activeCuisine === c.label
                    ? "bg-gold-500 text-white border-gold-500 shadow-2xl shadow-gold-500/20 scale-105"
                    : "bg-zinc-900 text-zinc-400/60 border-white/5 hover:bg-zinc-800/80"
                }`}
              >
                <span className="text-lg">{c.emoji}</span>
                {c.label}
              </button>
            ))}
          </div>
        </section>

        {/* Featured restaurants */}
        {featured.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Flame size={20} className="text-gold-600" />
                <h2 className="text-lg font-black uppercase tracking-[0.3em] text-zinc-100 italic">Populära val just nu</h2>
              </div>
            </div>
            <div className="flex lg:grid lg:grid-cols-4 gap-4 lg:gap-6 overflow-x-auto lg:overflow-visible pb-6 lg:pb-0 no-scrollbar -mx-6 px-6 lg:mx-0 lg:px-0">
              {featured.map((r) => (
                <a
                  key={r.id}
                  href={getRestaurantHref(r)}
                  onClick={(e) => handleRestaurantClick(e, r)}
                  className="group relative shrink-0 w-[280px] lg:w-auto rounded-[2rem] lg:rounded-[2.5rem] overflow-hidden border border-white/5 hover:border-gold-500/40 transition-all shadow-2xl cursor-pointer bg-zinc-900 hover:scale-[1.02] flex flex-col"
                >
                  {/* Cover image */}
                  <div className="h-44 lg:h-56 w-full bg-white/5 relative overflow-hidden">
                    {r.heroImageUrl || r.imageUrl ? (
                      <img
                        src={getCardImage(r)}
                        alt={r.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-5xl">🍽️</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    {r.isOpen === false && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <span className="px-3 py-1 rounded-full bg-red-500/80 text-white text-[9px] font-black uppercase tracking-wider">Stängt</span>
                      </div>
                    )}
                    <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/60 rounded-full px-2 py-0.5">
                      <Star size={10} className="fill-gold-500 text-gold-500" />
                      <span className="text-[10px] font-black text-white/90">{(r.rating ?? 4.6).toFixed(1)}</span>
                    </div>
                    {r.isOpen !== false && (
                      <div className="absolute top-3 left-3 flex items-center gap-1.5">
                        <div className="px-2 py-1 rounded-full bg-emerald-500/80 backdrop-blur-sm text-white text-[8px] font-black uppercase tracking-wider flex items-center gap-1">
                          <div className="w-1 h-1 rounded-full bg-white animate-pulse" />
                           Öppet
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="p-5 lg:p-6 bg-zinc-900 flex-1">
                    <div className="font-black uppercase tracking-tight text-lg lg:text-xl group-hover:text-gold-600 transition-colors leading-none mb-2 text-zinc-100 truncate">
                      {r.name}
                    </div>
                    <p className="text-[10px] lg:text-xs text-zinc-400 mb-4 font-bold uppercase tracking-widest truncate">{r.cuisine}</p>
                    <div className="flex items-center gap-4 text-[10px] lg:text-[11px] text-zinc-400/50 font-black uppercase tracking-wide">
                      <span className="flex items-center gap-2"><Clock size={12} />{r.etaMinutes ?? 30} MIN</span>
                      <span className="flex items-center gap-2"><Bike size={12} />{r.deliveryFee ?? 0} KR</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* All restaurants */}
        <section>
          <h2 className="text-lg font-black uppercase tracking-[0.4em] text-zinc-400/50 mb-8 flex items-center gap-4">
             <span className="w-12 h-[2px] bg-white/10" />
            {activeCuisine === "Alla" ? "Alla restauranger" : activeCuisine} · {filtered.length} st
          </h2>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 rounded-2xl bg-zinc-900 animate-pulse border border-white/5" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-zinc-400/30">
              <p className="text-4xl mb-4">😕</p>
              <p className="font-black uppercase tracking-widest">Inga restauranger hittades</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8">
              {filtered.map((r) => (
                <a
                  key={r.id}
                  href={getRestaurantHref(r)}
                  onClick={(e) => handleRestaurantClick(e, r)}
                  className="group flex flex-col lg:flex-row overflow-hidden rounded-[2rem] lg:rounded-[2.5rem] bg-zinc-900 border border-white/5 hover:border-gold-500/30 transition-all shadow-2xl cursor-pointer"
                >
                  {/* Cover image */}
                  <div className="w-full lg:w-64 h-48 lg:h-auto shrink-0 relative overflow-hidden">
                    {r.heroImageUrl || r.imageUrl ? (
                      <img
                        src={getCardImage(r)}
                        alt={r.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center bg-zinc-800/50 text-5xl">🍽️</div>
                    )}
                    {r.isOpen === false && (
                      <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                        <span className="text-xs font-black text-red-400 uppercase tracking-widest bg-dark-500/80 px-4 py-2 rounded-xl">Stängt</span>
                      </div>
                    )}
                    {/* Rating on mobile image */}
                    <div className="lg:hidden absolute top-4 right-4 flex items-center gap-1 bg-black/60 rounded-full px-3 py-1">
                      <Star size={12} className="fill-gold-500 text-gold-500" />
                      <span className="text-xs font-black text-white">{(r.rating ?? 4.6).toFixed(1)}</span>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 p-6 lg:p-8 min-w-0 flex flex-col justify-center">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <h3 className="text-xl lg:text-2xl font-black uppercase tracking-tight group-hover:text-gold-600 transition-colors truncate text-zinc-100">
                        {r.name}
                      </h3>
                      <div className="hidden lg:flex items-center gap-1.5 shrink-0 text-gold-500 text-sm font-black">
                        <Star size={18} className="fill-gold-500" />
                        {(r.rating ?? 4.6).toFixed(1)}
                        <span className="text-zinc-600 ml-1 font-bold">({r.ratingCount ?? 120})</span>
                      </div>
                    </div>
                    <p className="text-[10px] lg:text-xs text-zinc-400 font-bold uppercase tracking-widest line-clamp-1 mb-4 italic">
                      {r.description || r.cuisine}
                    </p>
                    <div className="flex items-center gap-4 lg:gap-6 text-[10px] font-black uppercase tracking-widest text-zinc-400/30 mb-5">
                      <span className="flex items-center gap-2"><Clock size={12} />{r.etaMinutes ?? 30} MIN</span>
                      <span className="flex items-center gap-2"><Bike size={12} />{r.deliveryFee ?? 0} KR</span>
                      <span className="hidden lg:inline text-zinc-800">|</span>
                      {(r.minOrderAmount ?? 0) > 0 && (
                        <span>MIN {r.minOrderAmount} KR</span>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3">
                      {r.tags && (Array.isArray(r.tags) ? r.tags : []).slice(0, 3).map((tag: string) => (
                        <span key={tag} className="text-[9px] lg:text-[10px] font-black text-white/20 bg-white/5 border border-white/5 px-3 py-1 rounded-full uppercase">
                          {tag}
                        </span>
                      ))}
                      <div className={`ml-auto px-4 py-1.5 rounded-full text-[9px] lg:text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 ${
                        r.isOpen !== false
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-red-500/10 text-red-400 border border-red-500/20"
                      }`}>
                         {r.isOpen !== false ? "Öppen" : "Stängd"}
                      </div>
                    </div>
                  </div>

                  <div className="hidden lg:flex items-center pr-8 text-zinc-800 group-hover:text-gold-500 transition-colors">
                    <ChevronRight size={32} />
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>

        {/* PWA promo */}
        <section className="mt-12 rounded-2xl border border-white/5 bg-zinc-900 p-6 flex items-center gap-4 shadow-xl">
          <div className="p-3 rounded-xl bg-gold-400/20 border border-gold-500/20 text-gold-600 shrink-0">
            <ArrowRight size={20} />
          </div>
          <div>
            <p className="text-sm font-black uppercase tracking-tight text-zinc-100">Installera MatGo</p>
            <p className="text-[10px] text-zinc-400 font-bold uppercase opacity-40">Snabb åtkomst till alla restauranger direkt från hemskärmen.</p>
          </div>
        </section>

        <div className="h-8" />
      </div>

      {/* Address modal */}
      <AddressModal
        isOpen={showAddressModal}
        onClose={() => { setShowAddressModal(false); setPendingHref(null); }}
        onConfirm={handleAddressConfirmed}
        orderType={orderType}
        setOrderType={toggleOrderType}
      />

      {/* Closed restaurant modal */}
      <AnimatePresence>
        {closedRestaurant && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-zinc-950/85 backdrop-blur-xl px-4 pb-6 sm:pb-0"
            onClick={(e) => { if (e.target === e.currentTarget) setClosedRestaurant(null); }}
          >
            <motion.div
              initial={{ scale: 0.96, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 30 }}
              className="w-full max-w-sm bg-zinc-900 border border-white/10 rounded-[2rem] p-6 shadow-2xl text-center"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gold-500 flex items-center justify-center text-dark-500 font-bold shadow-lg shadow-gold-500/20">
                   <span className="text-xl">🍣</span>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 leading-none mb-1">Admin Panel</div>
                  <div className="font-black tracking-tight text-white uppercase leading-none">MATGO <span className="text-gold-500">SUSHI</span></div>
                </div>
              </div>
              <p className="text-zinc-400 text-sm mb-6 font-medium">Restaurangen är stängd just nu. Vill du ändå se menyn?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setClosedRestaurant(null)}
                  className="flex-1 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-black transition-all"
                >
                  Avbryt
                </button>
                <button
                  onClick={() => {
                    const href = getRestaurantHref(closedRestaurant);
                    setClosedRestaurant(null);
                    router.push(href);
                  }}
                  className="flex-1 py-3 rounded-xl bg-gold-500 hover:bg-gold-400 text-white text-sm font-black transition-all"
                >
                  Visa menyn
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delivery Error Modal */}
      <AnimatePresence>
        {deliveryError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-950/85 backdrop-blur-xl px-4"
            onClick={() => setDeliveryError(null)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 30 }}
              className="w-full max-w-sm bg-zinc-900 border border-white/10 rounded-[2rem] p-6 shadow-2xl text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                <span className="text-3xl">😞</span>
              </div>
              <h2 className="text-xl font-black tracking-tight text-zinc-100 uppercase mb-2">Tyvärr!</h2>
              <p className="text-zinc-400 text-sm mb-6 font-medium">{deliveryError}</p>
              <button
                onClick={() => setDeliveryError(null)}
                className="w-full py-3 rounded-xl bg-gold-500 hover:bg-gold-400 text-white text-sm font-black transition-all shadow-lg"
              >
                Okej, jag förstår
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
