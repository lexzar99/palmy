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
  discountScope?: "PRODUCT" | "CATEGORY" | "RESTAURANT" | null;
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

interface Props {
  /**
   * "rail" = horisontell scroll (default, mobil/tablet).
   * "sidebar" = vertikal scrollbar lista (desktop sidebar).
   * "responsive" = horisontell på <lg, vertikal sidebar på lg+.
   */
  variant?: "rail" | "sidebar" | "responsive";
}

/**
 * Visar rabatterade produkter från flera restauranger.
 * - mobil/tablet: horisontell scroll med w-44 kort
 * - desktop sidebar: vertikal lista med full-bredd kort
 */
export default function DiscountedDishesSection({ variant = "rail" }: Props = {}) {
  const router = useRouter();
  const [dishes, setDishes] = useState<DiscountedDish[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${API_URL}/api/menu/discounted`, { params: { scope: "PRODUCT", v: "20260428" } })
      .then((r) => {
        if (cancelled) return;
        const nextDishes = Array.isArray(r.data) ? r.data : [];
        setDishes(nextDishes.filter((dish: DiscountedDish) => dish.discountScope === "PRODUCT"));
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

  // Container-klasser per variant
  const containerCls = (() => {
    switch (variant) {
      case "sidebar":
        return "flex flex-col gap-3 overflow-y-auto no-scrollbar pr-1 max-h-[640px]";
      case "responsive":
        return "flex gap-3 overflow-x-auto pb-3 no-scrollbar -mx-6 px-6 lg:mx-0 lg:px-0 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:max-h-[640px] lg:pr-1";
      case "rail":
      default:
        return "flex gap-3 overflow-x-auto pb-3 no-scrollbar -mx-6 px-6 lg:mx-0 lg:px-0";
    }
  })();

  // Kort-bredd per variant (sidebar = full bredd, rail = w-44)
  const cardCls = (() => {
    switch (variant) {
      case "sidebar":
        return "w-full rounded-2xl border overflow-hidden text-left group shadow-sm flex";
      case "responsive":
        return "shrink-0 w-44 lg:w-full rounded-2xl border overflow-hidden text-left group shadow-sm lg:flex";
      case "rail":
      default:
        return "shrink-0 w-44 rounded-2xl border overflow-hidden text-left group shadow-sm";
    }
  })();

  return (
    <section className={variant === "sidebar" ? "" : "mb-12"}>
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
        <div className={containerCls}>
          {dishes.map((d, i) => {
            const isHorizontalLayout = variant === "sidebar"; // alltid sida-vid-sida
            return (
              <motion.button
                key={d.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() =>
                  router.push(`/restaurants/${d.restaurant.slug}?highlight=${d.id}`)
                }
                className={cardCls}
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderColor: "rgba(231,178,75,0.16)",
                  boxShadow: "var(--card-shadow)",
                }}
              >
                <div
                  className={
                    isHorizontalLayout
                      ? "relative w-24 h-24 shrink-0 overflow-hidden"
                      : "relative w-full h-32 overflow-hidden lg:w-24 lg:h-24 lg:shrink-0"
                  }
                  style={{ backgroundColor: "var(--bg-deep)" }}
                >
                  {d.imageUrl ? (
                    <img
                      src={getImg(d.imageUrl)}
                      alt={d.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl">
                      🍽️
                    </div>
                  )}
                  <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-gold-500 text-zinc-950 text-[9px] font-black uppercase tracking-widest shadow-xl flex items-center gap-1">
                    <Tag size={10} />
                    {d.discountLabel ||
                      (d.discountPercent
                        ? `-${d.discountPercent}%`
                        : `-${Math.round(d.originalPrice - d.discountPrice)} kr`)}
                  </div>
                </div>
                <div className="p-3 flex-1 min-w-0">
                  <div
                    className="text-[8px] font-black uppercase tracking-[0.2em] truncate"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {d.restaurant.name}
                  </div>
                  <div
                    className="text-[12px] font-black truncate mt-0.5"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {d.name}
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-gold-500 font-black text-sm">
                      {d.discountPrice} kr
                    </span>
                    <span
                      className="text-[10px] line-through"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {d.originalPrice} kr
                    </span>
                    <ArrowRight
                      size={12}
                      className="ml-auto group-hover:text-gold-500 transition-colors"
                      style={{ color: "var(--text-secondary)" }}
                    />
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </section>
  );
}
