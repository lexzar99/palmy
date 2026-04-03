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
  Phone,
} from "lucide-react";

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

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("platform_address");
      if (stored) setAddress(stored);
      const storedType = localStorage.getItem(ORDER_TYPE_KEY);
      if (storedType === "PICKUP" || storedType === "DELIVERY") setOrderType(storedType);
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

  // Populära val är de med featuredClass 1 eller 2 (Premium/Standard)
  const featured = filtered.filter((r) => r.featuredClass === 1 || r.featuredClass === 2).slice(0, 8);

  const getRestaurantHref = (r: Restaurant) =>
    r.slug === "palmyra" ? "/menu" : `/restaurants/${r.slug}`;

  const getImageSrc = (path?: string) => {
    if (!path) return "";
    if (path.startsWith("/")) return `${API_URL}${path}`;
    return path;
  };

  const getCardImage = (r: Restaurant) => {
    if (r.slug === "palmyra") return getImageSrc("/hero-palmyra.svg");
    return getImageSrc(r.heroImageUrl || r.imageUrl || "");
  };

  return (
    <div className="min-h-screen text-zinc-100 bg-zinc-950">
      <div className="relative mx-auto max-w-2xl px-4 pb-32 pt-8">

        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-600 mb-1">Välkommen</p>
              <h1 className="text-3xl font-black tracking-tighter uppercase leading-none">
                Vad vill du <span className="text-gold-600">äta</span>?
              </h1>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-400/20 border border-gold-500/20 text-gold-600 shadow-xl">
              <Sparkles size={22} />
            </div>
          </div>

          {/* Order type toggle */}
          <div className="flex items-center gap-2 mb-6 p-1 bg-zinc-800/50 rounded-2xl border border-white/5 shadow-xl">
            <button
              onClick={() => toggleOrderType("DELIVERY")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                orderType === "DELIVERY"
                  ? "bg-gold-500 text-white shadow-lg shadow-gold-500/20"
                  : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              <Truck size={16} />
              Leverans
            </button>
            <button
              onClick={() => toggleOrderType("PICKUP")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                orderType === "PICKUP"
                  ? "bg-gold-500 text-white shadow-lg shadow-gold-500/20"
                  : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              <Store size={16} />
              Avhämtning
            </button>
          </div>

          {/* Address + search */}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl bg-zinc-900 border border-white/5 px-4 py-3.5 focus-within:border-gold-500 transition-all shadow-xl">
              <MapPin className="text-gold-500 shrink-0" size={16} />
              <input
                value={address}
                onChange={(e) => saveAddress(e.target.value)}
                placeholder={orderType === "DELIVERY" ? "Din leveransadress..." : "Ange stad eller område..."}
                className="w-full bg-transparent text-sm placeholder:text-zinc-400/30 focus:outline-none font-bold text-zinc-100"
              />
            </div>
            <Link href="/search" className="flex items-center gap-3 rounded-xl bg-zinc-900 border border-white/5 px-4 py-3.5 hover:border-gold-500 transition-all cursor-pointer shadow-xl">
              <Search size={16} className="text-zinc-400/30 shrink-0" />
              <span className="text-sm text-zinc-400/30 font-bold">Sök restaurang eller rätt...</span>
            </Link>
          </div>
        </header>

        {/* Cuisine filter chips */}
        <section className="mb-8">
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {cuisineFilters.map((c) => (
              <button
                key={c.label}
                onClick={() => setActiveCuisine(c.label)}
                className={`whitespace-nowrap flex items-center gap-1.5 rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-widest transition-all border ${
                  activeCuisine === c.label
                    ? "bg-gold-500 text-white border-gold-500 shadow-lg shadow-gold-500/10"
                    : "bg-zinc-900 text-zinc-400/60 border-white/5 hover:bg-zinc-800/50"
                }`}
              >
                <span>{c.emoji}</span>
                {c.label}
              </button>
            ))}
          </div>
        </section>

        {/* Featured restaurants */}
        {featured.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Flame size={16} className="text-gold-600" />
                <h2 className="text-sm font-black uppercase tracking-widest text-zinc-100">Populära val</h2>
              </div>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {featured.map((r) => (
                <Link
                  key={r.id}
                  href={getRestaurantHref(r)}
                  className="group relative shrink-0 w-56 rounded-2xl overflow-hidden border border-white/5 hover:border-gold-500/30 transition-all shadow-xl shadow-xl"
                >
                  {/* Cover image */}
                  <div className="h-36 w-full bg-white/5 relative overflow-hidden">
                    {r.heroImageUrl || r.imageUrl ? (
                      <img
                        src={getCardImage(r)}
                        alt={r.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-5xl">🍽️</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    {r.isOpen === false && (
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 text-red-400 text-[8px] font-black uppercase tracking-wider">
                        Stängt
                      </div>
                    )}
                    <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 rounded-full px-2 py-0.5">
                      <Star size={10} className="fill-gold-500 text-gold-500" />
                      <span className="text-[9px] font-black text-white/90">{(r.rating ?? 4.6).toFixed(1)}</span>
                    </div>
                    {r.isOpen !== false && (
                      <div className="absolute top-2 left-2 flex items-center gap-1.5">
                        <div className="px-2 py-0.5 rounded-full bg-emerald-500/80 backdrop-blur-sm text-white text-[8px] font-black uppercase tracking-wider flex items-center gap-1">
                          <div className="w-1 h-1 rounded-full bg-zinc-900 animate-pulse" />
                           Öppet
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="p-3 bg-zinc-900">
                    <div className="font-black uppercase tracking-tighter text-sm group-hover:text-gold-600 transition-colors leading-tight mb-0.5 text-zinc-100">
                      {r.name}
                    </div>
                    <p className="text-[10px] text-zinc-400 mb-2 font-bold uppercase">{r.cuisine}</p>
                    <div className="flex items-center gap-3 text-[9px] text-zinc-400/50 font-black uppercase">
                      <span className="flex items-center gap-1"><Clock size={10} />{r.etaMinutes ?? 30} min</span>
                      <span className="flex items-center gap-1"><Bike size={10} />{r.deliveryFee ?? 0} kr</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* All restaurants – Foodora style */}
        <section>
          <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400/50 mb-4">
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
            <div className="space-y-3">
              {filtered.map((r) => (
                <Link
                  key={r.id}
                  href={getRestaurantHref(r)}
                  className="group flex overflow-hidden rounded-2xl bg-zinc-900 border border-white/5 hover:border-gold-500/20 transition-all shadow-xl"
                >
                  {/* Cover image */}
                  <div className="w-28 h-28 shrink-0 relative overflow-hidden">
                    {r.heroImageUrl || r.imageUrl ? (
                      <img
                        src={getCardImage(r)}
                        alt={r.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center bg-zinc-800/50 text-4xl">🍽️</div>
                    )}
                    {r.isOpen === false && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <span className="text-[8px] font-black text-red-400 uppercase">Stängt</span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 px-4 py-3 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <h3 className="font-black uppercase tracking-tighter leading-tight group-hover:text-gold-600 transition-colors truncate text-zinc-100">
                        {r.name}
                      </h3>
                      <div className="flex items-center gap-0.5 shrink-0 text-gold-600 text-[10px] font-black">
                        <Star size={11} className="fill-gold-600" />
                        {(r.rating ?? 4.6).toFixed(1)}
                        <span className="text-zinc-400/50 ml-0.5 font-bold">({r.ratingCount ?? 120})</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-zinc-400 font-bold uppercase line-clamp-1 mb-2">
                      {r.description || r.cuisine}
                    </p>
                    <div className="flex items-center gap-3 text-[9px] text-zinc-400/40 font-black uppercase">
                      <span className="flex items-center gap-1"><Clock size={10} />{r.etaMinutes ?? 30} min</span>
                      <span className="flex items-center gap-1"><Bike size={10} />{r.deliveryFee ?? 0} kr leverans</span>
                      {(r.minOrderAmount ?? 0) > 0 && (
                        <span>Min {r.minOrderAmount} kr</span>
                      )}
                    </div>
                    {r.tags && (Array.isArray(r.tags) ? r.tags : JSON.parse(r.tags as any || "[]")).length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <div className="flex flex-wrap gap-1">
                          {(Array.isArray(r.tags) ? r.tags : JSON.parse(r.tags as any || "[]")).slice(0, 3).map((tag: any) => (
                            <span key={tag} className="text-[8px] font-black text-zinc-400/40 bg-zinc-800/50 px-1.5 py-0.5 rounded-full uppercase">
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5 ml-auto">
                          <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider flex items-center gap-1 ${
                            r.isOpen !== false 
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                              : "bg-red-500/10 text-red-400 border border-red-500/20"
                          }`}>
                            <div className={`w-1 h-1 rounded-full ${r.isOpen !== false ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                            {r.isOpen !== false ? "Öppet" : "Stängt"}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center pr-4 text-light-500 group-hover:text-gold-600 transition-colors">
                    <ChevronRight size={18} />
                  </div>
                </Link>
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
    </div>
  );
}
