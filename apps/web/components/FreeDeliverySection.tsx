"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Bike, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { API_URL } from "@/lib/api";

interface FreeDeliveryRestaurant {
  id: string;
  slug: string;
  name: string;
  imageUrl?: string | null;
  heroImageUrl?: string | null;
  cuisine?: string | null;
  city?: string | null;
  rating?: number;
  etaMinutes?: number;
  isFullyFree: boolean;
  freeDeliveryAbove?: number | null;
  minOrder?: number;
}

/**
 * Visar enbart om det finns restauranger med gratis leverans (antingen direkt
 * eller över ett visst ordervärde). Läser från `/api/menu/free-delivery`.
 * Sektionen renderas inte alls om listan är tom.
 */
export default function FreeDeliverySection() {
  const router = useRouter();
  const [restaurants, setRestaurants] = useState<FreeDeliveryRestaurant[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    axios
      .get(`${API_URL}/api/menu/free-delivery`)
      .then((r) => setRestaurants(r.data || []))
      .catch(() => setRestaurants([]))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || restaurants.length === 0) return null;

  const getImg = (p?: string | null) => {
    if (!p) return "";
    if (p.startsWith("/")) return `${API_URL}${p}`;
    return p;
  };

  return (
    <section className="mb-12">
      <div className="flex items-end justify-between mb-4 px-1">
        <div>
          <h2 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
            <Bike size={16} className="text-emerald-400" /> Fri leverans
          </h2>
          <p className="text-zinc-600 text-[9px] font-black uppercase tracking-[0.25em] mt-1">
            Restauranger som bjuder på hemkörningen
          </p>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3 no-scrollbar -mx-6 px-6 lg:mx-0 lg:px-0">
        {restaurants.map((r, i) => (
          <motion.button
            key={r.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => router.push(`/restaurants/${r.slug}`)}
            className="shrink-0 w-56 rounded-2xl border overflow-hidden text-left group"
            style={{ backgroundColor: "#211C19", borderColor: "rgba(255,248,234,0.08)" }}
          >
            <div className="relative w-full h-28 bg-obsidian/50 overflow-hidden">
              {r.heroImageUrl || r.imageUrl ? (
                <img src={getImg(r.heroImageUrl || r.imageUrl)} alt={r.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl">🍽️</div>
              )}
              <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-emerald-500 text-zinc-950 text-[9px] font-black uppercase tracking-widest shadow-xl flex items-center gap-1">
                <Bike size={10} />
                {r.isFullyFree ? "Fri leverans" : `Fri över ${r.freeDeliveryAbove} kr`}
              </div>
            </div>
            <div className="p-3">
              <div className="text-[8px] font-black uppercase tracking-[0.2em] text-zinc-500 truncate">
                {r.cuisine || r.city || "Restaurang"}
              </div>
              <div className="text-[12px] font-black text-white truncate mt-0.5 flex items-center justify-between">
                <span className="truncate">{r.name}</span>
                <ArrowRight size={12} className="text-zinc-600 group-hover:text-emerald-400 transition-colors shrink-0 ml-2" />
              </div>
              <div className="text-[9px] text-zinc-500 mt-1">
                {r.etaMinutes ?? 30} min · {r.rating ? `${r.rating.toFixed(1)}★` : "Ny"}
              </div>
            </div>
          </motion.button>
        ))}
      </div>
    </section>
  );
}
