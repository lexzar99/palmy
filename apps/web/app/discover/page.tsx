"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { Search, Heart, Star } from "lucide-react";
import { API_URL } from "@/lib/api";
import { useFavorites } from "@/lib/favoritesStore";
import { useTranslation } from "@/lib/i18n/LocaleProvider";

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
  deliveryFee?: number;
  isOpen?: boolean;
  openingHours?: Record<string, { closed?: boolean; shifts?: { open: string; close: string }[] }> | null;
}

// Nästa öppettid → "Öppnar 10:00" / "Öppnar imorgon 11:00" / "Öppnar tis 11:00".
// Samma logik som hemskärmens kort (app/page.tsx) för konsekvent UX.
const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY_SHORT = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];
function nextOpenLabel(oh: Restaurant["openingHours"]): string | null {
  if (!oh) return null;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayIdx = now.getDay();
  for (let offset = 0; offset < 7; offset++) {
    const dayIdx = (todayIdx + offset) % 7;
    const day = oh[WEEKDAY_KEYS[dayIdx]];
    if (!day || day.closed || !Array.isArray(day.shifts)) continue;
    for (const sh of day.shifts) {
      const [h, m] = (sh.open || "").split(":").map(Number);
      if (Number.isNaN(h)) continue;
      const openMin = h * 60 + (m || 0);
      if (offset === 0 && openMin <= nowMin) continue;
      if (offset === 0) return `Öppnar ${sh.open}`;
      if (offset === 1) return `Öppnar imorgon ${sh.open}`;
      return `Öppnar ${WEEKDAY_SHORT[dayIdx]} ${sh.open}`;
    }
  }
  return null;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

export default function FavoritesPage() {
  const { t } = useTranslation();
  const { favorites, toggle: toggleFavorite } = useFavorites();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

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
      {/* Scrim över stängda restaurangers bild. */}
      <style>{`.fav-closed-scrim{background:rgba(255,255,255,.45)}`}</style>

      {/* Header + search */}
      <div
        className="pt-16 md:pt-8 pb-6 px-5 sm:px-6 sticky md:static top-0 z-40"
        style={{ backgroundColor: "var(--bg-primary)", borderBottom: "1px solid var(--border-muted)" }}
      >
        <div className="max-w-2xl md:max-w-5xl 2xl:max-w-[1400px] mx-auto space-y-5">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
              {t("favorites.title")}
            </h1>
            <p className="text-[13.5px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
              {favorites.size > 0 ? t("favorites.count", { count: favorites.size }) : t("favorites.subtitle")}
            </p>
          </div>

          {favorites.size > 0 && (
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--text-secondary)" }} size={18} strokeWidth={2} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder={t("favorites.searchPlaceholder")}
                className="w-full h-12 rounded-xl pr-4 text-[15px] font-medium outline-none"
                style={{
                  backgroundColor: "var(--bg-deep)",
                  border: searchFocused ? "1px solid var(--text-primary)" : "1px solid transparent",
                  boxShadow: searchFocused ? "0 0 0 3px rgba(127,127,127,.12)" : "none",
                  color: "var(--text-primary)",
                  paddingLeft: "2.75rem",
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl md:max-w-5xl 2xl:max-w-[1400px] mx-auto px-5 sm:px-6 pt-7">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
            {[1, 2, 3].map((i) => <div key={i} className="skeleton h-64 rounded-xl" />)}
          </div>
        ) : favoriteRestaurants.length === 0 ? (
          <div className="flex flex-col items-center text-center pt-16 pb-10">
            {/* Samma line-art-språk som tomma varukorgen: guld-hjärta som
                ritas upp vid mount och svävar mjukt, med andande guld-skugga. */}
            <style>{`
              @keyframes favHeartDraw { from { stroke-dashoffset: 80; } to { stroke-dashoffset: 0; } }
              @keyframes favHeartFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
              @keyframes favShadowBreathe { 0%, 100% { transform: scaleX(1); opacity: 0.55; } 50% { transform: scaleX(0.8); opacity: 0.3; } }
              .fav-empty-heart path { stroke-dasharray: 80; animation: favHeartDraw 1s ease-out forwards; }
              .fav-empty-float { animation: favHeartFloat 5s ease-in-out 1.1s infinite; }
              .fav-empty-shadow { transform-origin: center; animation: favShadowBreathe 5s ease-in-out 1.1s infinite; }
              @media (prefers-reduced-motion: reduce) {
                .fav-empty-heart path { animation: none; stroke-dashoffset: 0; }
                .fav-empty-float, .fav-empty-shadow { animation: none; }
              }
            `}</style>
            <div className="fav-empty-float">
              <svg className="fav-empty-heart" width="64" height="60" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.51 4.04 3 5.5l7 7Z"
                  stroke="var(--color-gold-500, #F0531C)"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <svg className="fav-empty-shadow mt-1" width="60" height="9" viewBox="0 0 60 9" aria-hidden="true">
              <ellipse cx="30" cy="4.5" rx="25" ry="3.5" fill="var(--gold-soft)" />
            </svg>
            <h2 className="mt-5 text-[17px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
              {t("favorites.empty.title")}
            </h2>
            <p className="mt-1 text-[13.5px] max-w-[300px]" style={{ color: "var(--text-secondary)" }}>
              {t("favorites.empty.sub")}
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex items-center justify-center h-11 px-5 rounded-xl text-[14px] font-semibold"
              style={{ border: "1px solid var(--line-strong)", color: "var(--text-primary)" }}
            >
              {t("favorites.empty.cta")}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5">
            {favoriteRestaurants.map((r) => {
              const closed = r.isOpen === false;
              const openLabel = closed ? nextOpenLabel(r.openingHours) : null;
              return (
                <Link
                  key={r.id}
                  href={`/restaurants/${r.slug}`}
                  className="group block rounded-xl overflow-hidden relative transition-shadow hover:shadow-[0_4px_16px_rgba(20,20,22,0.08)]"
                  style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
                >
                  <div className="h-[210px] sm:h-56 w-full overflow-hidden relative" style={{ backgroundColor: "var(--bg-deep)" }}>
                    {r.imageUrl || r.heroImageUrl ? (
                      <img src={getImageSrc(r.heroImageUrl || r.imageUrl)} alt={r.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-[20px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                        {initials(r.name)}
                      </div>
                    )}
                    {closed && <div className="absolute inset-0 fav-closed-scrim" aria-hidden="true" />}
                    {closed && (
                      <span
                        className="absolute left-2.5 bottom-2.5 rounded-md px-2 py-1 text-[12px] font-semibold text-white"
                        style={{ backgroundColor: "rgba(20,20,22,0.78)" }}
                      >
                        {openLabel ?? "Stängt"}
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(r.id); }}
                      className="absolute top-2.5 right-2.5 z-10 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: "rgba(255,255,255,0.95)" }}
                      aria-label={t("home.favorite.remove")}
                    >
                      <Heart size={15} fill="#F0531C" stroke="#C83F12" strokeWidth={1} />
                    </button>
                  </div>
                  <div className="px-4 py-3">
                    <h3 className="text-[15.5px] font-semibold tracking-tight leading-tight truncate" style={{ color: "var(--text-primary)" }}>
                      {r.name}
                    </h3>
                    <div className="mt-1 flex items-center gap-1.5 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                      <span className="inline-flex items-center gap-1 font-semibold" style={{ color: "var(--text-primary)" }}>
                        <Star size={12} fill="currentColor" stroke="none" />
                        {(r.rating ?? 4.5).toFixed(1).replace(".", ",")}
                      </span>
                      <span className="opacity-50">·</span>
                      <span>{r.etaMinutes ?? 30} {t("home.minutes")}</span>
                      {typeof r.deliveryFee === "number" && (
                        <>
                          <span className="opacity-50">·</span>
                          <span>{r.deliveryFee} kr leverans</span>
                        </>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
