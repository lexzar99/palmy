"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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

      <div className="flex gap-2 overflow-x-auto pb-4 no-scrollbar -mx-6 px-6 lg:mx-0 lg:px-0">
        {restaurants.map((r, i) => (
          <motion.button
            key={r.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => router.push(`/restaurants/${r.slug}`)}
            className="shrink-0 w-72 rounded-[1.8rem] border overflow-hidden text-left group shadow-sm"
            style={{ backgroundColor: "var(--bg-secondary)", borderColor: "rgba(16,185,129,0.14)", boxShadow: "var(--card-shadow)" }}
          >
            <div className="relative w-full h-40 overflow-hidden" style={{ backgroundColor: "var(--bg-deep)" }}>
              {r.heroImageUrl || r.imageUrl ? (
                <Image
                  src={getImg(r.heroImageUrl || r.imageUrl)}
                  alt={r.name}
                  fill
                  sizes="288px"
                  loading="lazy"
                  className="object-cover group-hover:scale-110 transition-transform duration-700"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl">🍽️</div>
              )}
              <div className="absolute top-3 left-3 px-2.5 py-1.5 rounded-lg bg-emerald-500 text-zinc-950 text-[10px] font-black uppercase tracking-widest shadow-xl flex items-center gap-1.5">
                <Bike size={12} />
                {r.isFullyFree ? "Fri leverans" : `Fri över ${r.freeDeliveryAbove} kr`}
              </div>
            </div>
            <div className="p-4">
              <div className="text-[9px] font-black uppercase tracking-[0.2em] truncate" style={{ color: "var(--text-secondary)" }}>
                {r.cuisine || r.city || "Restaurang"}
              </div>
              <div className="text-[16px] font-black truncate flex items-center justify-between mt-1" style={{ color: "var(--text-primary)" }}>
                <span className="truncate">{r.name}</span>
                <ArrowRight size={14} className="group-hover:text-emerald-400 transition-colors shrink-0 ml-2" style={{ color: "var(--text-secondary)" }} />
              </div>
              <div className="text-[11px] font-bold mt-2" style={{ color: "var(--text-secondary)" }}>
                {r.etaMinutes ?? 30} min <span className="opacity-50 mx-1">•</span> {r.rating ? `${r.rating.toFixed(1)}★` : "Ny"}
              </div>
            </div>
          </motion.button>
        ))}
      </div>
    </section>
  );
}
