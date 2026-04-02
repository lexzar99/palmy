"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { API_URL } from "@/lib/api";
import { MapPin, Search, Star, Clock, Bike, ChevronRight, Download, Sparkles, Home, Mail, ShoppingBag, User } from "lucide-react";

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
  tags?: string[];
}

const cuisineFilters = ["Alla", "Pizza", "Sushi", "Kebab", "Hamburgare", "Indiskt"];

const discoveryCards = [
  { title: "Snabbt", subtitle: "Leverans", color: "from-[#ffcc6f] to-[#ff9f43]" },
  { title: "Godis", subtitle: "Late night", color: "from-[#ff8fb1] to-[#ff9f9f]" },
  { title: "Fräscht", subtitle: "Sallad", color: "from-[#9be7ff] to-[#7dd3fc]" },
  { title: "Extra", subtitle: "Dryck", color: "from-[#d8b4fe] to-[#f0abfc]" },
];
const BottomNav = () => (
  <div className="fixed bottom-4 left-0 right-0 mx-auto flex max-w-md items-center justify-between rounded-xl bg-[#0d0d0d] border border-white/10 px-8 py-4 text-white shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-50">
    <Link href="/" className="flex flex-col items-center gap-1 text-[10px] font-black uppercase tracking-widest text-gold-500">
      <Home size={20} />
      Hem
    </Link>
    <button className="flex flex-col items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-white/30 hover:text-white transition-colors">
      <Mail size={20} />
      Kontakt
    </button>
    <Link href="/cart" className="flex flex-col items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-white/30 hover:text-white transition-colors">
      <ShoppingBag size={20} />
      Kasse
    </Link>
    <button className="flex flex-col items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-white/30 hover:text-white transition-colors">
      <User size={20} />
      Profil
    </button>
  </div>
);

export default function HomePage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [address, setAddress] = useState("");
  const [query, setQuery] = useState("");
  const [activeCuisine, setActiveCuisine] = useState("Alla");
  const [suggestedDish, setSuggestedDish] = useState<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("palmyra_address");
      if (stored) setAddress(stored);
    }
  }, []);

  useEffect(() => {
    axios.get(`${API_URL}/api/restaurants`).then((res) => setRestaurants(res.data)).catch(() => {});
  }, []);

  const handleSuggestion = () => {
    // Slumpmässig restaurang och kategori/produkt (här simulerar vi en rolig interaktion)
    if (restaurants.length > 0) {
      const randomRest = restaurants[Math.floor(Math.random() * restaurants.length)];
      // I en riktig miljö skulle vi hämta menyn och välja en rätt
      alert(`Hur låter en specialitet från ${randomRest.name}? Kolla in deras meny!`);
      window.location.href = randomRest.slug === 'palmyra' ? '/menu' : `/restaurants/${randomRest.slug}`;
    }
  };

  const filtered = useMemo(() => {
    return restaurants.filter((r) => {
      const matchCuisine = activeCuisine === "Alla" || (r.cuisine || "").toLowerCase().includes(activeCuisine.toLowerCase());
      const matchQuery = query.trim().length === 0 || r.name.toLowerCase().includes(query.toLowerCase()) || (r.description || "").toLowerCase().includes(query.toLowerCase());
      return matchCuisine && matchQuery;
    });
  }, [restaurants, activeCuisine, query]);

  const popular = filtered.slice(0, 3);

  const saveAddress = (value: string) => {
    setAddress(value);
    if (typeof window !== "undefined") {
      localStorage.setItem("palmyra_address", value);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="relative mx-auto max-w-5xl px-6 pb-32 pt-24">
        <div className="absolute inset-x-6 top-16 z-0 h-48 rounded-3xl bg-gold-500/10 blur-3xl opacity-50" />

        <header className="relative z-10 rounded-2xl bg-[#0d0d0d] border border-white/5 p-8 shadow-2xl overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gold-500/10 blur-[60px] rounded-full group-hover:bg-gold-500/20 transition-all" />
          <div className="flex items-center justify-between relative z-10">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-500/60 mb-2">Välkommen tillbaka</p>
              <h1 className="text-4xl md:text-5xl font-black leading-tight tracking-tighter uppercase">
                Vad vill du <span className="text-gold-500 underline decoration-gold-500/30 underline-offset-8">äta</span> idag?
              </h1>
            </div>
            <button 
              onClick={handleSuggestion}
              className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-500 text-dark-500 shadow-xl shadow-gold-500/20 hover:scale-105 active:scale-95 transition-all"
            >
              <Sparkles size={28} />
            </button>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-3.5 focus-within:border-gold-500/30 transition-all">
              <MapPin className="text-gold-500" size={18} />
              <input
                value={address}
                onChange={(e) => saveAddress(e.target.value)}
                placeholder="Leveransadress i Lund..."
                className="w-full bg-transparent text-sm placeholder:text-white/20 focus:outline-none font-medium"
              />
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-3.5 focus-within:border-gold-500/30 transition-all">
              <Search size={18} className="text-white/20" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Sök restaurang..."
                className="w-full bg-transparent text-sm placeholder:text-white/20 focus:outline-none font-medium"
              />
            </div>
          </div>
        </header>

        <section className="relative z-10 mt-10">
          <div className="flex gap-2 overflow-x-auto pb-4 no-scrollbar">
            {cuisineFilters.map((c) => (
              <button
                key={c}
                onClick={() => setActiveCuisine(c)}
                className={`whitespace-nowrap rounded-xl px-5 py-2.5 text-[11px] font-black uppercase tracking-widest transition-all border ${
                  activeCuisine === c
                    ? "bg-gold-500 text-dark-500 border-gold-500 shadow-xl shadow-gold-500/10"
                    : "bg-white/5 text-white/30 border-white/5 hover:bg-white/10"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </section>

        <section className="relative z-10 mt-6 grid gap-4 sm:grid-cols-4">
          {discoveryCards.map((card) => (
            <div
              key={card.title}
              className={`rounded-2xl bg-gradient-to-br ${card.color} p-5 shadow-xl relative overflow-hidden group cursor-pointer`}
            >
              <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              <p className="text-[10px] font-black uppercase tracking-widest text-black/40 mb-1">{card.subtitle}</p>
              <h3 className="text-xl font-black text-black leading-none">{card.title}</h3>
            </div>
          ))}
        </section>

        <section className="relative z-10 mt-12">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-black uppercase tracking-widest">Populära val</h2>
            <div className="h-px bg-white/5 flex-1 mx-6" />
            <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Topprankade</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {popular.map((r) => (
              <Link
                key={r.id}
                href={r.slug === "palmyra" ? "/menu" : `/restaurants/${r.slug}`}
                className="group rounded-2xl bg-[#0d0d0d] border border-white/5 p-4 hover:border-gold-500/30 transition-all shadow-2xl"
              >
                <div className="h-32 w-full overflow-hidden rounded-xl bg-white/5 border border-white/5 relative">
                  {r.imageUrl && (
                    <img src={r.imageUrl} alt={r.name} className="h-full w-full object-cover transition-all duration-500 group-hover:scale-110 opacity-70 group-hover:opacity-100" />
                  )}
                </div>
                <div className="mt-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-black uppercase tracking-tight group-hover:text-gold-500 transition-colors leading-none mb-1">{r.name}</div>
                    <p className="text-[10px] font-medium text-white/30 uppercase tracking-widest">{r.cuisine}</p>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg bg-gold-500/10 px-2 py-1 text-[11px] font-black text-gold-500">
                    <Star size={12} className="fill-gold-500" />
                    {(r.rating ?? 4.6).toFixed(1)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="relative z-10 mt-16 space-y-4">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-black uppercase tracking-widest">Alla Restauranger</h2>
            <Link href="/menu" className="text-[10px] font-black text-gold-500 uppercase tracking-[0.2em] flex items-center gap-2 group hover:gap-3 transition-all">
              Visa Palmyra <ChevronRight size={14} />
            </Link>
          </div>

          {filtered.map((r) => (
            <Link
              key={r.id}
              href={r.slug === "palmyra" ? "/menu" : `/restaurants/${r.slug}`}
              className="flex items-center gap-5 rounded-2xl bg-[#0d0d0d] border border-white/5 p-4 transition-all hover:border-gold-500/30 hover:bg-white/[0.02] group"
            >
              <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-white/5 border border-white/5 relative">
                {r.imageUrl && <img src={r.imageUrl} alt={r.name} className="h-full w-full object-cover opacity-60 group-hover:opacity-100 transition-all duration-500 group-hover:scale-110" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-lg font-black uppercase tracking-tighter group-hover:text-gold-500 transition-colors">{r.name}</h3>
                  {r.slug === "palmyra" && (
                    <span className="rounded-full bg-gold-500/10 px-2.5 py-0.5 text-[8px] font-black text-gold-500 uppercase tracking-widest border border-gold-500/20">Direkt</span>
                  )}
                </div>
                <p className="text-[11px] font-medium text-white/20 line-clamp-1 mb-2 leading-tight">{r.description || r.cuisine}</p>
                <div className="flex items-center gap-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                  <span className="flex items-center gap-1.5"><Star size={14} className="text-gold-500" />{(r.rating ?? 4.6).toFixed(1)}</span>
                  <span className="flex items-center gap-1.5"><Clock size={14} />{r.etaMinutes ?? 30} min</span>
                  <span className="flex items-center gap-1.5"><Bike size={14} />{r.deliveryFee ?? 0} kr</span>
                </div>
              </div>
              <div className="p-3 rounded-full bg-white/5 group-hover:bg-gold-500 group-hover:text-dark-500 transition-all text-white/20">
                <ChevronRight size={20} />
              </div>
            </Link>
          ))}
        </section>

        <section className="relative z-10 mt-16 flex flex-col gap-4 rounded-3xl bg-white/5 border border-white/10 p-8 text-white relative overflow-hidden group">
          <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-gold-500/5 blur-3xl rounded-full" />
          <div className="flex items-center gap-4 relative z-10">
            <div className="p-4 rounded-2xl bg-gold-500 text-dark-500 shadow-xl shadow-gold-500/10">
              <Download size={24} />
            </div>
            <div>
              <p className="text-lg font-black uppercase tracking-tight">Redo för bättre mat?</p>
              <p className="text-white/40 text-xs font-medium max-w-xs">Installera plattformen som en app för snabbare beställning och orderstatus direkt i kassan.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-widest mt-2 relative z-10">
            <span className="rounded-lg bg-white/5 border border-white/5 px-3 py-1.5">PWA Ready</span>
            <span className="rounded-lg bg-white/5 border border-white/5 px-3 py-1.5">Snabb Checkout</span>
            <span className="rounded-lg bg-white/5 border border-white/5 px-3 py-1.5">Live Spårning</span>
          </div>
        </section>
      <BottomNav />
      </div>
    </div>
  );
}
