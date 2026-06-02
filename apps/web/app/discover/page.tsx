"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import axios from "axios";
import {
  Search, Sparkles, MapPin, Star, History, Compass, ArrowRight,
  Utensils, Coffee, Pizza, Bike, Clock, Heart, Filter, ChevronRight, AlertCircle
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { useFavorites } from "@/lib/favoritesStore";

const getImageSrc = (path?: string) => {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  if (path.startsWith("/")) return `${API_URL}${path}`;
  return path;
};

const CATEGORIES = [
  { name: "Pizza", icon: Pizza, color: "bg-rose-500/10 text-rose-500" },
  { name: "Burgare", icon: Utensils, color: "bg-amber-500/10 text-amber-500" },
  { name: "Sallad", icon: Coffee, color: "bg-emerald-500/10 text-emerald-500" },
  { name: "Sushir", icon: Sparkles, color: "bg-blue-500/10 text-blue-500" },
  { name: "Kebab", icon: Utensils, color: "bg-orange-500/10 text-orange-500" },
  { name: "Snabbmat", icon: Bike, color: "bg-purple-500/10 text-purple-500" },
];

export default function DiscoverPage() {
  const [activeSearch, setActiveSearch] = useState("");
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Zone awareness: IDs that can deliver to the saved address (null = no address yet)
  const [deliverableIds, setDeliverableIds] = useState<Set<string> | null>(null);
  // Flag som visas om zone-API failade. Vi vill INTE blockera browsing
  // (cart-checkout fångar adresser utanför zon med blockande felmeddelande),
  // men kunden ska veta att tillgänglighet inte är verifierad just nu så
  // de inte överraskas i kassan.
  const [zoneCheckFailed, setZoneCheckFailed] = useState(false);
  // Favoriter (paritet med RN — filtreras lokalt över både trending & sökresultat)
  const { favorites, toggle: toggleFavorite, isFavorite } = useFavorites();
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  // City-family filter — discover used to show every restaurant on the
  // platform regardless of where the customer is. We now mirror the home
  // page's matchesCityFamily logic so users only see restaurants for the
  // address they picked.
  const [cityFamilyIds, setCityFamilyIds] = useState<string[] | null>(null);
  const [cityFamilyNames, setCityFamilyNames] = useState<string[] | null>(null);
  const [detectedCityName, setDetectedCityName] = useState<string | null>(null);

  useEffect(() => {
    fetchData();

    // Resolve city-family from whichever city the customer last picked on
    // home (delivery → platform_city, pickup → platform_pickup_city).
    try {
      const storedType = localStorage.getItem("platform_order_type");
      const cityName = storedType === "PICKUP"
        ? localStorage.getItem("platform_pickup_city")
        : localStorage.getItem("platform_city");
      if (cityName) {
        setDetectedCityName(cityName);
        axios
          .get(`${API_URL}/api/cities/family-by-name`, { params: { name: cityName } })
          .then((res) => {
            const familyIds: string[] = Array.isArray(res.data?.familyIds) ? res.data.familyIds : [];
            const familyNames: string[] = Array.isArray(res.data?.familyNames) ? res.data.familyNames : [];
            setCityFamilyIds(familyIds.length > 0 ? familyIds : null);
            setCityFamilyNames(familyNames.length > 0 ? familyNames.map((n) => n.toLowerCase()) : null);
            if (res.data?.name) setDetectedCityName(res.data.name);
          })
          .catch(() => { setCityFamilyIds(null); setCityFamilyNames(null); });
      }
    } catch { /* localStorage unavailable — show everything */ }

    // Load zone data for the saved delivery address
    try {
      const storedCoords = localStorage.getItem("platform_coords");
      const storedType   = localStorage.getItem("platform_order_type");
      if (storedCoords && storedType !== "PICKUP") {
        const { lat, lng } = JSON.parse(storedCoords);
        axios.post(`${API_URL}/api/cities/validate-location`, { lat, lng })
          .then(res => {
            setZoneCheckFailed(false);
            if (res.data.covered) {
              const ids = new Set<string>(
                res.data.cities.flatMap((c: any) => c.restaurants.map((r: any) => r.id))
              );
              setDeliverableIds(ids);
            } else {
              setDeliverableIds(new Set()); // covered=false → nothing delivers here
            }
          })
          .catch(() => {
            // Tidigare tyst fail-open. Nu: sätt flag så banner visas och
            // användaren förstår att zone-info är osäker. Cart-checkout
            // verifierar adressen blockande, så det är inte en blocker —
            // bara en disclaimer.
            setDeliverableIds(null);
            setZoneCheckFailed(true);
          });
      }
    } catch (err) {
      console.warn("Failed to load zone data:", err);
    }
  }, []);

  const fetchData = async () => {
    try {
      const [restRes, ordersRes] = await Promise.all([
        axios.get(`${API_URL}/api/restaurants`),
        axios.get(`/api/platform/profile/orders`).catch(() => ({ data: [] }))
      ]);
      setRestaurants(restRes.data || []);
      setRecentOrders(ordersRes.data?.slice(0, 3) || []);
    } catch (err) {
      console.error("Discover fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Mirrors home's matchesCityFamily — but more permissive when the
  // family-by-name API hasn't resolved yet OR returned empty. Falls back
  // to a case-insensitive city-name match so the customer never sees an
  // empty discover page in the brief window between mount and API response.
  const matchesCityFamily = useCallback((r: any): boolean => {
    if (cityFamilyIds && cityFamilyIds.length > 0) {
      const rCityId = r.cityId as string | null | undefined;
      if (rCityId) return cityFamilyIds.includes(rCityId);
      // Ingen cityId → matcha mot hela familjens namn (parent + barn), inte
      // bara det valda namnet (annars tappas t.ex. Dalby under Lund).
      if (cityFamilyNames && cityFamilyNames.length > 0) {
        return cityFamilyNames.includes((r.city || "").toLowerCase());
      }
      if (detectedCityName) return (r.city || "").toLowerCase() === detectedCityName.toLowerCase();
      return false;
    }
    // API hasn't returned (or returned empty). If we have a city name,
    // fall back to a simple name match — better than rendering nothing.
    if (detectedCityName) {
      return (r.city || "").toLowerCase() === detectedCityName.toLowerCase();
    }
    // No address picked yet — show everything (browsing pre-onboarding).
    return true;
  }, [cityFamilyIds, cityFamilyNames, detectedCityName]);

  const filteredRestaurants = useMemo(() => {
    return restaurants.filter((r) => {
      const matchesSearch =
        r.name.toLowerCase().includes(activeSearch.toLowerCase()) ||
        r.categories?.some((c: any) => c.name.toLowerCase().includes(activeSearch.toLowerCase()));
      const matchesFavorites = !favoritesOnly || favorites.has(r.id);
      const matchesCity = matchesCityFamily(r);
      return matchesSearch && matchesFavorites && matchesCity;
    });
  }, [restaurants, activeSearch, favoritesOnly, favorites, matchesCityFamily]);

  const trendingRestaurants = useMemo(() => {
    const base = [...restaurants]
      .filter(matchesCityFamily)
      .sort((a, b) => (b.rating || 0) - (a.rating || 0));
    const filtered = favoritesOnly ? base.filter((r) => favorites.has(r.id)) : base;
    return filtered.slice(0, 5);
  }, [restaurants, favoritesOnly, favorites, matchesCityFamily]);

  return (
    <div className="min-h-screen pb-32 md:pt-20" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {/* Header & Search — pt-16 på mobil, pt-8 på desktop eftersom Navbar tar 80px */}
      <div className="pt-16 md:pt-8 pb-8 px-6 sticky md:static md:top-0 z-40 backdrop-blur-md" style={{ backgroundColor: "var(--bg-primary)", borderBottom: "1px solid var(--border-muted)" }}>
        <div className="max-w-2xl md:max-w-5xl 2xl:max-w-[1400px] mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-black uppercase italic tracking-tighter" style={{ color: "var(--text-primary)" }}>Upptäck <span className="text-gold-500">Levera</span></h1>
              <p className="text-[10px] font-black uppercase tracking-widest mt-1" style={{ color: "var(--text-secondary)" }}>Hitta din nästa favoritupplevelse</p>
            </div>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-gold-500" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
               <Compass size={24} className="animate-spin-slow" />
            </div>
          </div>

          <div className="relative group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 group-focus-within:text-gold-500 transition-colors" style={{ color: "var(--text-secondary)" }} size={20} />
            <input 
              type="text"
              value={activeSearch}
              onChange={(e) => setActiveSearch(e.target.value)}
              placeholder="Sök restauranger, rätter eller smaker..."
              className="w-full rounded-3xl py-5 pl-14 pr-6 font-bold outline-none focus:ring-2 focus:ring-gold-500/30 transition-all shadow-xl"
              style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
            />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 pt-8 space-y-12">
        {zoneCheckFailed && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
            <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] font-bold text-amber-200 leading-snug">
              Kunde inte verifiera leveransområde just nu. Restauranger visas men tillgängligheten bekräftas först i kassan.
            </p>
          </div>
        )}

        {/* Categories Grid */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Bläddra Kategorier</h2>
            {/*
              Favoriter-toggle — visa endast restauranger som finns i `platform_favorites`.
              Visas alltid (även med 0 favoriter), så användaren kan se den och förstå funktionen.
            */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setFavoritesOnly((v) => !v)}
              aria-pressed={favoritesOnly}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all shrink-0 border ${
                favoritesOnly
                  ? "bg-rose-500/15 border-rose-500/30 text-rose-500"
                  : "border-[var(--border-muted)] text-zinc-500 hover:text-rose-500 hover:border-rose-500/30"
              }`}
              style={{ backgroundColor: favoritesOnly ? undefined : "var(--bg-secondary)" }}
            >
              <Heart size={12} className={favoritesOnly ? "fill-rose-500" : ""} />
              Favoriter{favorites.size > 0 ? ` (${favorites.size})` : ""}
            </motion.button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide px-2">
            {CATEGORIES.map((cat) => (
              <motion.button
                key={cat.name}
                whileTap={{ scale: 0.95 }}
                onClick={() => setActiveSearch(cat.name)}
                className="flex items-center gap-3 px-6 py-4 rounded-full transition-all shrink-0 group shadow-sm"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
              >
                <div className={`w-6 h-6 ${cat.color} rounded-lg flex items-center justify-center transition-transform group-hover:scale-110`}>
                  <cat.icon size={12} />
                </div>
                <p className="font-black text-[9px] uppercase tracking-widest group-hover:text-gold-500 transition-colors" style={{ color: "var(--text-secondary)" }}>{cat.name}</p>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Trending Restaurants */}
        {!activeSearch && (
          <section className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-3" style={{ color: "var(--text-primary)" }}>
                <Sparkles className="text-gold-500" size={18} />
                {favoritesOnly ? "Dina Favoriter" : "Populärt Just nu"}
              </h2>
            </div>
            <div className="space-y-4">
              {trendingRestaurants.length === 0 ? (
                <div className="py-20 text-center rounded-[2.5rem] border border-dashed" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)" }}>
                  <Heart size={48} className="mx-auto mb-4 opacity-20" style={{ color: "var(--text-primary)" }} />
                  <p className="font-black uppercase" style={{ color: "var(--text-secondary)" }}>
                    {favoritesOnly ? "Inga favoriter ännu" : "Inga restauranger"}
                  </p>
                  <p className="text-xs mt-2" style={{ color: "var(--text-secondary)", opacity: 0.4 }}>
                    {favoritesOnly ? "Tryck på hjärtat på ett restaurangkort för att spara." : "Försök igen om en stund."}
                  </p>
                </div>
              ) : trendingRestaurants.map((rest) => {
                const fav = isFavorite(rest.id);
                return (
                <Link
                  key={rest.id}
                  href={`/restaurants/${rest.slug}`}
                  className="flex items-center gap-4 p-3 rounded-[2rem] transition-all group overflow-hidden relative shadow-sm"
                  style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
                >
                  <div className="w-16 h-16 rounded-[1.2rem] flex items-center justify-center shrink-0 overflow-hidden" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)" }}>
                    <img src={getImageSrc(rest.imageUrl)} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Name wraps to 2 lines if needed so the full restaurant
                        name shows on narrow phones instead of "Palmyra P…". */}
                    <h3
                      className="text-base font-black uppercase italic leading-tight mb-1.5 break-words"
                      style={{
                        color: "var(--text-primary)",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {rest.name}
                    </h3>
                    {/* Info row below — badge + rating + city */}
                    <div className="flex items-center gap-2 flex-wrap text-[9px] font-black uppercase tracking-widest text-zinc-500">
                      {rest.isOpen === false ? (
                        <span className="bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded-full border border-rose-500/20">
                          Stängd
                        </span>
                      ) : (
                        <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          Öppet
                        </span>
                      )}
                      {rest.rating && (
                        <span className="flex items-center gap-1 text-gold-500">
                          <Star size={9} className="fill-gold-500" /> {rest.rating.toFixed(1)}
                        </span>
                      )}
                      {rest.city && <span className="truncate opacity-50">{rest.city}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(rest.id); }}
                    className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 shrink-0 border"
                    style={{ borderColor: "var(--border-muted)", backgroundColor: fav ? "rgba(244,63,94,0.10)" : "transparent" }}
                    aria-label={fav ? "Ta bort favorit" : "Lägg till favorit"}
                  >
                    <Heart size={14} className={fav ? "fill-rose-500 text-rose-500" : "text-zinc-500"} />
                  </button>
                  <ChevronRight size={18} className="text-zinc-600 group-hover:text-gold-500 transition-all shrink-0" />
                </Link>
              ); })}
            </div>
          </section>
        )}

        {/* Search Results */}
        {activeSearch && (
          <section className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-sm font-black uppercase tracking-widest" style={{ color: "var(--text-primary)" }}>Sökresultat för "{activeSearch}"</h2>
              <button 
                onClick={() => setActiveSearch("")}
                className="text-[10px] font-black uppercase hover:text-gold-500"
                style={{ color: "var(--text-secondary)" }}
              >
                Rensa
              </button>
            </div>
            <div className="space-y-4">
              {filteredRestaurants.length === 0 ? (
                <div className="py-20 text-center rounded-[2.5rem] border border-dashed" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)" }}>
                  <Utensils size={48} className="mx-auto mb-4 opacity-10" style={{ color: "var(--text-primary)" }} />
                  <p className="font-black uppercase" style={{ color: "var(--text-secondary)" }}>Inga restauranger hittade</p>
                  <p className="text-xs mt-2" style={{ color: "var(--text-secondary)", opacity: 0.4 }}>Prova att söka på något annat</p>
                </div>
              ) : (
                filteredRestaurants.map((rest) => {
                  const inZone = deliverableIds === null || deliverableIds.has(rest.id);
                  const fav = isFavorite(rest.id);
                  return (
                    <Link
                      key={rest.id}
                      href={`/restaurants/${rest.slug}`}
                      className={`flex items-center gap-6 p-4 border rounded-[2.5rem] transition-all group relative overflow-hidden shadow-sm ${
                        inZone ? "" : "opacity-50"
                      }`}
                      style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
                    >
                      <div className="w-16 h-16 rounded-[1.2rem] flex items-center justify-center shrink-0 overflow-hidden" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)" }}>
                        <img src={getImageSrc(rest.imageUrl)} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3
                          className="font-black uppercase italic text-sm leading-tight break-words"
                          style={{
                            color: "var(--text-primary)",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {rest.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[9px] font-bold uppercase" style={{ color: "var(--text-secondary)" }}>{rest.city}</p>
                          {!inZone && deliverableIds !== null && (
                            <span className="text-[8px] font-black text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                              Levererar ej till din adress
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(rest.id); }}
                        className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 shrink-0 border"
                        style={{ borderColor: "var(--border-muted)", backgroundColor: fav ? "rgba(244,63,94,0.10)" : "transparent" }}
                        aria-label={fav ? "Ta bort favorit" : "Lägg till favorit"}
                      >
                        <Heart size={14} className={fav ? "fill-rose-500 text-rose-500" : "text-zinc-500"} />
                      </button>
                      <ChevronRight size={18} className="text-zinc-700 group-hover:text-gold-500 transition-all shrink-0" />
                    </Link>
                  );
                })
              )}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
