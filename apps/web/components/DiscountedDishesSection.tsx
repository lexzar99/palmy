"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Percent, Tag, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { API_URL } from "@/lib/api";

interface DiscountedDish {
  id: string;
  name: string;
  description?: string;
  originalPrice: number;
  discountPrice: number;
  discountPercent?: number | null;
  discountLabel?: string | null;
  imageUrl?: string | null;
  restaurant: {
    id: string;
    slug: string;
    name: string;
    imageUrl?: string | null;
    city?: string | null;
    cuisine?: string | null;
  };
}

/**
 * Horisontell rail som visar rabatterade produkter från flera restauranger.
 * Klick på en kort tar användaren till restaurangens sida – där öppnas produkten.
 * Admin kan välja produktbild, etikett, procent eller fast pris per rätt.
 */
export default function DiscountedDishesSection() {
  const router = useRouter();
  const [dishes, setDishes] = useState<DiscountedDish[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${API_URL}/api/menu/discounted`)
      .then((r) => {
        if (!cancelled) setDishes(r.data || []);
      })
      .catch(() => {
        if (!cancelled) setDishes([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && dishes.length === 0) return null;

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
            <Percent size={16} className="text-gold-500" /> Rea &amp; Rabatter
          </h2>
          <p className="text-zinc-600 text-[9px] font-black uppercase tracking-[0.25em] mt-1">
            Utvalda rätter till nedsatt pris
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-x-auto no-scrollbar">
          {[1, 2, 3].map((i) => (
            <div key={i} className="shrink-0 w-48 h-64 rounded-2xl glass-panel animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-3 no-scrollbar -mx-6 px-6 lg:mx-0 lg:px-0">
          {dishes.map((d, i) => (
            <motion.button
              key={d.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => router.push(`/restaurants/${d.restaurant.slug}?highlight=${d.id}`)}
              className="shrink-0 w-44 rounded-2xl border overflow-hidden text-left group shadow-sm"
              style={{ backgroundColor: "var(--bg-secondary)", borderColor: "rgba(231,178,75,0.16)", boxShadow: "var(--card-shadow)" }}
            >
              <div className="relative w-full h-32 overflow-hidden" style={{ backgroundColor: "var(--bg-deep)" }}>
                {d.imageUrl ? (
                  <img src={getImg(d.imageUrl)} alt={d.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl">🍽️</div>
                )}
                <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-gold-500 text-zinc-950 text-[9px] font-black uppercase tracking-widest shadow-xl flex items-center gap-1">
                  <Tag size={10} />
                  {d.discountLabel ||
                    (d.discountPercent
                      ? `-${d.discountPercent}%`
                      : `-${Math.round(d.originalPrice - d.discountPrice)} kr`)}
                </div>
              </div>
              <div className="p-3">
                <div className="text-[8px] font-black uppercase tracking-[0.2em] truncate" style={{ color: "var(--text-secondary)" }}>
                  {d.restaurant.name}
                </div>
                <div className="text-[12px] font-black truncate mt-0.5" style={{ color: "var(--text-primary)" }}>{d.name}</div>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-gold-500 font-black text-sm">{d.discountPrice} kr</span>
                  <span className="text-[10px] line-through" style={{ color: "var(--text-secondary)" }}>{d.originalPrice} kr</span>
                  <ArrowRight size={12} className="ml-auto group-hover:text-gold-500 transition-colors" style={{ color: "var(--text-secondary)" }} />
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </section>
  );
}
