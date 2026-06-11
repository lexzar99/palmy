"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import axios from "axios";
import { Search, Heart, Star, Clock } from "lucide-react";
import { API_URL } from "@/lib/api";
import { useFavorites } from "@/lib/favoritesStore";
import { useTranslation } from "@/lib/i18n/LocaleProvider";
import EmptyState from "@/components/EmptyState";

const getImageSrc = (path?: string) => {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  if (path.startsWith("/")) return `${API_URL}${path}`;
  return path;
};

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string;
  heroImageUrl?: string;
  city?: string;
  rating?: number;
  etaMinutes?: number;
  isOpen?: boolean;
}

export default function FavoritesPage() {
  const { t } = useTranslation();
  const { favorites, toggle: toggleFavorite } = useFavorites();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${API_URL}/api/restaurants`)
      .then((res) => { if (!cancelled) setRestaurants(Array.isArray(res.data) ? res.data : []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const favoriteRestaurants = useMemo(() => {
    return restaurants
      .filter((r) => favorites.has(r.id))
      .filter((r) =>
        query.trim().length === 0 ||
        r.name.toLowerCase().includes(query.toLowerCase()) ||
        (r.city || "").toLowerCase().includes(query.toLowerCase()),
      );
  }, [restaurants, favorites, query]);

  return (
    <div className="min-h-screen pb-32 md:pt-20" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {/* Header + search */}
      <div
        className="pt-16 md:pt-8 pb-6 px-5 sm:px-6 sticky md:static top-0 z-40 backdrop-blur-md"
        style={{ backgroundColor: "var(--bg-primary)", borderBottom: "1px solid var(--border-muted)" }}
      >
        <div className="max-w-2xl md:max-w-5xl 2xl:max-w-[1400px] mx-auto space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                {t("favorites.title")} {t("favorites.titleAccent")}
              </h1>
              <p className="text-[13px] font-medium mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {favorites.size > 0 ? t("favorites.count", { count: favorites.size }) : t("favorites.subtitle")}
              </p>
            </div>
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-rose-500" style={{ backgroundColor: "var(--bg-deep)" }}>
              <Heart size={20} className="fill-rose-500" />
            </div>
          </div>

          {favorites.size > 0 && (
            <div className="relative group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 group-focus-within:text-gold-500 transition-colors" style={{ color: "var(--text-secondary)" }} size={18} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("favorites.searchPlaceholder")}
                className="w-full rounded-2xl py-4 pl-13 pr-5 text-base font-bold outline-none focus:ring-2 focus:ring-gold-500/30 transition-all shadow-sm"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)", paddingLeft: "3.25rem" }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl md:max-w-5xl 2xl:max-w-[1400px] mx-auto px-5 sm:px-6 pt-7">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
            {[1, 2, 3].map((i) => <div key={i} className="skeleton h-64 rounded-2xl" />)}
          </div>
        ) : favoriteRestaurants.length === 0 ? (
          <EmptyState
            icon={Heart}
            title={t("favorites.empty.title")}
            text={t("favorites.empty.sub")}
            ctaLabel={t("favorites.empty.cta")}
            ctaHref="/"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5">
            {favoriteRestaurants.map((r) => {
              const dimmed = r.isOpen === false;
              return (
                <div key={r.id} className={`transition-all ${dimmed ? "opacity-55 grayscale" : ""}`}>
                  <Link
                    href={`/restaurants/${r.slug}`}
                    className="group block rounded-2xl overflow-hidden hover:shadow-[0_12px_34px_rgba(17,17,19,0.12)] transition-all relative"
                    style={{ backgroundColor: "var(--bg-secondary)", boxShadow: "0 2px 12px rgba(17,17,19,0.06)" }}
                  >
                    <div className="h-[210px] sm:h-56 w-full overflow-hidden relative" style={{ backgroundColor: "var(--bg-deep)" }}>
                      {r.imageUrl || r.heroImageUrl ? (
                        <img src={getImageSrc(r.heroImageUrl || r.imageUrl)} alt={r.name} loading="lazy" decoding="async" className="h-full w-full object-cover group-hover:scale-105 transition-all duration-700" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-4xl">🍱</div>
                      )}
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(r.id); }}
                        className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 backdrop-blur-md"
                        style={{ backgroundColor: "rgba(255,255,255,0.92)", boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}
                        aria-label={t("home.favorite.remove")}
                      >
                        <svg viewBox="0 0 24 24" fill="#FF3B30" className="w-5 h-5"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                      </button>
                    </div>
                    <div className="px-4 py-3.5">
                      <h3 className="text-base sm:text-lg font-bold tracking-tight leading-tight truncate group-hover:text-gold-600 transition-colors" style={{ color: "var(--text-primary)" }}>{r.name}</h3>
                      <div className="mt-1.5 flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                        <span className="flex items-center gap-1">
                          <Star size={13} className="fill-gold-500 text-gold-500" />
                          <span className="font-black" style={{ color: "var(--text-primary)" }}>{(r.rating ?? 4.5).toFixed(1)}</span>
                        </span>
                        <span className="opacity-40">·</span>
                        <span className="flex items-center gap-1"><Clock size={12} /> {r.etaMinutes ?? 30} {t("home.minutes")}</span>
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
