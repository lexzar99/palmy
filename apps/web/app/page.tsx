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
  <div className="fixed bottom-4 left-0 right-0 mx-auto flex max-w-md items-center justify-between rounded-3xl bg-[#18181b] px-6 py-3 text-white shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
    <Link href="/" className="flex flex-col items-center text-xs font-semibold text-[#fbbf24]">
      <Home size={18} />
      Hem
    </Link>
    <button className="flex flex-col items-center text-xs text-white/60">
      <Mail size={18} />
      Meddelanden
    </button>
    <Link href="/cart" className="flex flex-col items-center text-xs text-white/60">
      <ShoppingBag size={18} />
      Varukorg
    </Link>
    <button className="flex flex-col items-center text-xs text-white/60">
      <User size={18} />
      Konto
    </button>
  </div>
);

export default function HomePage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [address, setAddress] = useState("");
  const [query, setQuery] = useState("");
  const [activeCuisine, setActiveCuisine] = useState("Alla");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("palmyra_address");
      if (stored) setAddress(stored);
    }
  }, []);

  useEffect(() => {
    axios.get(`${API_URL}/api/restaurants`).then((res) => setRestaurants(res.data)).catch(() => {});
  }, []);

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
    <div className="min-h-screen bg-gradient-to-b from-[#fff3d1] via-[#ffe3a0] to-[#fef7e8] text-[#1c160f]">
      <div className="relative mx-auto max-w-5xl px-4 pb-28 pt-24">
        <div className="absolute inset-x-6 top-16 z-0 h-48 rounded-3xl bg-gradient-to-br from-[#ffdb70] via-[#ffc861] to-[#ffad66] blur-3xl opacity-70" />

        <header className="relative z-10 rounded-3xl bg-gradient-to-b from-[#ffd86a] via-[#ffc347] to-[#fbbf24] p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#5f4100]">Hej!</p>
              <h1 className="text-3xl font-black leading-tight">Vad är du sugen på idag?</h1>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 shadow-md">
              <Sparkles className="text-[#d97706]" size={24} />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/90 px-4 py-3 shadow-inner">
            <MapPin className="text-[#d97706]" size={18} />
            <input
              value={address}
              onChange={(e) => saveAddress(e.target.value)}
              placeholder="Skriv din adress"
              className="w-full bg-transparent text-sm placeholder:text-[#a16207] focus:outline-none"
            />
            <button
              onClick={() => saveAddress(address)}
              className="rounded-full bg-[#18181b] px-3 py-2 text-xs font-bold text-white"
            >
              Spara
            </button>
          </div>

          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-[#2b2420]/70 px-4 py-3 text-white">
            <Search size={18} className="text-white/70" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Sök efter restaurang eller rätt"
              className="w-full bg-transparent text-sm placeholder:text-white/60 focus:outline-none"
            />
          </div>
        </header>

        <section className="relative z-10 mt-6">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {cuisineFilters.map((c) => (
              <button
                key={c}
                onClick={() => setActiveCuisine(c)}
                className={`rounded-full px-4 py-2 text-xs font-bold shadow-sm transition-all ${
                  activeCuisine === c
                    ? "bg-[#1f1c2e] text-white shadow-lg shadow-[#fbbf24]/30"
                    : "bg-white text-[#3f2a00]"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </section>

        <section className="relative z-10 mt-4 grid gap-3 sm:grid-cols-2">
          {discoveryCards.map((card) => (
            <div
              key={card.title}
              className={`rounded-2xl bg-gradient-to-br ${card.color} p-4 shadow-lg shadow-black/10`}
            >
              <p className="text-sm font-semibold text-[#4a3425]">{card.subtitle}</p>
              <h3 className="text-xl font-black text-[#2b1d14]">{card.title}</h3>
            </div>
          ))}
        </section>

        <section className="relative z-10 mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-black text-[#2c1b12]">Populära just nu</h2>
            <span className="text-xs font-semibold text-[#a16207]">{popular.length} val</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {popular.map((r) => (
              <Link
                key={r.id}
                href={r.slug === "palmyra" ? "/menu" : `/restaurants/${r.slug}`}
                className="group rounded-2xl bg-white p-3 shadow-[0_12px_32px_rgba(0,0,0,0.08)]"
              >
                <div className="h-28 w-full overflow-hidden rounded-xl bg-gradient-to-br from-[#fff7e6] to-[#ffe2b3]">
                  {r.imageUrl && (
                    <img src={r.imageUrl} alt={r.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-black text-[#1f2937]">{r.name}</div>
                    <p className="text-xs text-[#6b7280]">{r.cuisine}</p>
                  </div>
                  <div className="flex items-center gap-1 rounded-full bg-[#fef3c7] px-2 py-1 text-xs font-bold text-[#92400e]">
                    <Star size={14} className="fill-[#fbbf24] text-[#fbbf24]" />
                    {(r.rating ?? 4.6).toFixed(1)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="relative z-10 mt-8 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-[#1f130b]">Restauranger nära dig</h2>
            <Link href="/restaurants/palmyra" className="text-xs font-bold text-[#a16207] flex items-center gap-1">
              Se Palmyra <ChevronRight size={14} />
            </Link>
          </div>

          {filtered.map((r) => (
            <Link
              key={r.id}
              href={r.slug === "palmyra" ? "/menu" : `/restaurants/${r.slug}`}
              className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-[0_12px_30px_rgba(0,0,0,0.06)] transition hover:-translate-y-0.5"
            >
              <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-[#fff7e6] to-[#ffe2b3]">
                {r.imageUrl && <img src={r.imageUrl} alt={r.name} className="h-full w-full object-cover" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-[#1f2937]">{r.name}</h3>
                  {r.slug === "palmyra" && (
                    <span className="rounded-full bg-[#fbbf24]/30 px-2 py-0.5 text-[10px] font-black text-[#92400e]">Direktorder</span>
                  )}
                </div>
                <p className="text-xs text-[#6b7280] line-clamp-1">{r.description || r.cuisine}</p>
                <div className="mt-1 flex items-center gap-3 text-xs font-semibold text-[#4b5563]">
                  <span className="flex items-center gap-1"><Star size={14} className="text-[#fbbf24]" />{(r.rating ?? 4.6).toFixed(1)}</span>
                  <span className="flex items-center gap-1"><Clock size={14} />{r.etaMinutes ?? 30} min</span>
                  <span className="flex items-center gap-1"><Bike size={14} />{r.deliveryFee ?? 0} kr</span>
                </div>
              </div>
              <ChevronRight size={18} className="text-[#d1d5db]" />
            </Link>
          ))}
        </section>

        <section className="relative z-10 mt-10 flex flex-col gap-3 rounded-3xl bg-[#1f1c2e] p-5 text-white">
          <div className="flex items-center gap-3">
            <Download size={20} className="text-[#fbbf24]" />
            <div>
              <p className="text-sm font-semibold text-white/80">Installera som app</p>
              <p className="text-xs text-white/60">Få Foodora-liknande upplevelse offline och snabbare.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-white/10 px-3 py-1">PWA</span>
            <span className="rounded-full bg-white/10 px-3 py-1">Offline-ready</span>
            <span className="rounded-full bg-white/10 px-3 py-1">Hemskärmsikon</span>
          </div>
        </section>
      </div>

      <BottomNav />
    </div>
  );
}
