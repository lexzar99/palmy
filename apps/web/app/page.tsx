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
  isFeatured?: boolean;
  tags?: string[];
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

  const featured = filtered.filter((r) => r.isFeatured).slice(0, 3);
  const rest = filtered.filter((r) => !r.isFeatured || featured.findIndex((f) => f.id === r.id) === -1);

  const getRestaurantHref = (r: Restaurant) =>
    r.slug === "palmyra" ? "/menu" : `/restaurants/${r.slug}`;

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="relative mx-auto max-w-2xl px-4 pb-32 pt-8">

        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-500/60 mb-1">Välkommen</p>
              <h1 className="text-3xl font-black tracking-tighter uppercase leading-none">
                Vad vill du <span className="text-gold-500">äta</span>?
              </h1>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-500/10 border border-gold-500/20 text-gold-500">
              <Sparkles size={22} />
            </div>
          </div>

          {/* Order type toggle */}
          <div className="flex items-center gap-2 mb-4 p-1 bg-white/5 rounded-2xl border border-white/5">
            <button
              onClick={() => toggleOrderType("DELIVERY")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black uppercase tracking-wider transition-all ${
                orderType === "DELIVERY"
                  ? "bg-gold-500 text-dark-500 shadow-lg shadow-gold-500/20"
                  : "text-white/40 hover:text-white"
              }`}
            >
              <Truck size={16} />
              Leverans
            </button>
            <button
              onClick={() => toggleOrderType("PICKUP")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black uppercase tracking-wider transition-all ${
                orderType === "PICKUP"
                  ? "bg-gold-500 text-dark-500 shadow-lg shadow-gold-500/20"
                  : "text-white/40 hover:text-white"
              }`}
            >
              <Store size={16} />
              Avhämtning
            </button>
          </div>

          {/* Address + search */}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-3.5 focus-within:border-gold-500/30 transition-all">
              <MapPin className="text-gold-500 shrink-0" size={16} />
              <input
                value={address}
                onChange={(e) => saveAddress(e.target.value)}
                placeholder={orderType === "DELIVERY" ? "Din leveransadress..." : "Ange stad eller område..."}
                className="w-full bg-transparent text-sm placeholder:text-white/20 focus:outline-none font-medium"
              />
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-3.5 focus-within:border-gold-500/30 transition-all">
              <Search size={16} className="text-white/20 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Sök restaurang eller rätt..."
                className="w-full bg-transparent text-sm placeholder:text-white/20 focus:outline-none font-medium"
              />
            </div>
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
                    ? "bg-gold-500 text-dark-500 border-gold-500 shadow-lg shadow-gold-500/10"
                    : "bg-white/5 text-white/30 border-white/5 hover:bg-white/10"
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
                <Flame size={16} className="text-gold-500" />
                <h2 className="text-sm font-black uppercase tracking-widest text-white/80">Populära val</h2>
              </div>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {featured.map((r) => (
                <Link
                  key={r.id}
                  href={getRestaurantHref(r)}
                  className="group relative shrink-0 w-56 rounded-2xl overflow-hidden border border-white/5 hover:border-gold-500/30 transition-all shadow-xl"
                >
                  {/* Cover image */}
                  <div className="h-36 w-full bg-white/5 relative overflow-hidden">
                    {r.heroImageUrl || r.imageUrl ? (
                      <img
                        src={r.heroImageUrl || r.imageUrl}
                        alt={r.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-5xl">🍽️</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    {r.isOpen === false && (
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 text-red-400 text-[8px] font-black uppercase tracking-wider">
                        Stängt
                      </div>
                    )}
                    <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 rounded-full px-2 py-0.5">
                      <Star size={10} className="fill-gold-500 text-gold-500" />
                      <span className="text-[9px] font-black text-white">{(r.rating ?? 4.6).toFixed(1)}</span>
                    </div>
                  </div>
                  {/* Info */}
                  <div className="p-3 bg-[#0d0d0d]">
                    <div className="font-black uppercase tracking-tight text-sm group-hover:text-gold-500 transition-colors leading-tight mb-0.5">
                      {r.name}
                    </div>
                    <p className="text-[10px] text-white/30 mb-2">{r.cuisine}</p>
                    <div className="flex items-center gap-3 text-[9px] text-white/30 font-bold uppercase">
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
          <h2 className="text-sm font-black uppercase tracking-widest text-white/50 mb-4">
            {activeCuisine === "Alla" ? "Alla restauranger" : activeCuisine} · {filtered.length} st
          </h2>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 rounded-2xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-white/30">
              <p className="text-4xl mb-4">😕</p>
              <p className="font-bold uppercase">Inga restauranger hittades</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((r) => (
                <Link
                  key={r.id}
                  href={getRestaurantHref(r)}
                  className="group flex overflow-hidden rounded-2xl bg-[#0d0d0d] border border-white/5 hover:border-gold-500/20 transition-all"
                >
                  {/* Cover image */}
                  <div className="w-28 h-28 shrink-0 relative overflow-hidden">
                    {r.heroImageUrl || r.imageUrl ? (
                      <img
                        src={r.heroImageUrl || r.imageUrl}
                        alt={r.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center bg-white/5 text-4xl">🍽️</div>
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
                      <h3 className="font-black uppercase tracking-tight leading-tight group-hover:text-gold-500 transition-colors truncate">
                        {r.name}
                      </h3>
                      <div className="flex items-center gap-0.5 shrink-0 text-gold-500 text-[10px] font-black">
                        <Star size={11} className="fill-gold-500" />
                        {(r.rating ?? 4.6).toFixed(1)}
                        <span className="text-white/20 ml-0.5 font-medium">({r.ratingCount ?? 120})</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-white/30 font-medium line-clamp-1 mb-2">
                      {r.description || r.cuisine}
                    </p>
                    <div className="flex items-center gap-3 text-[9px] text-white/30 font-bold uppercase">
                      <span className="flex items-center gap-1"><Clock size={10} />{r.etaMinutes ?? 30} min</span>
                      <span className="flex items-center gap-1"><Bike size={10} />{r.deliveryFee ?? 0} kr leverans</span>
                      {(r.minOrderAmount ?? 0) > 0 && (
                        <span>Min {r.minOrderAmount} kr</span>
                      )}
                    </div>
                    {r.tags && r.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {r.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="text-[8px] font-bold text-white/20 bg-white/5 px-1.5 py-0.5 rounded-full">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center pr-4 text-white/10 group-hover:text-gold-500 transition-colors">
                    <ChevronRight size={18} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* PWA promo */}
        <section className="mt-12 rounded-2xl border border-white/5 bg-white/[0.03] p-6 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-gold-500/10 border border-gold-500/20 text-gold-500 shrink-0">
            <ArrowRight size={20} />
          </div>
          <div>
            <p className="text-sm font-black uppercase tracking-tight">Installera MatGo</p>
            <p className="text-[10px] text-white/30 font-medium">Snabb åtkomst till alla restauranger direkt från hemskärmen.</p>
          </div>
        </section>

        <div className="h-8" />
      </div>
    </div>
  );
}
