"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  ArrowRight,
  X,
  Sparkles,
  Percent,
  Info,
  Phone,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import AddressModal from "@/components/AddressModal";
import AddressPullDown from "@/components/AddressPullDown";
import DealFlipCard, { type DealCardData } from "@/components/DealFlipCard";
import SponsorCard, { type SponsorData } from "@/components/SponsorCard";
import DiscountedDishesSection from "@/components/DiscountedDishesSection";
import FreeDeliverySection from "@/components/FreeDeliverySection";
import { useCartStore } from "@/store/cartStore";

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
  featuredClass?: number;
  tags?: string[];
  phone?: string;
  address?: string;
  zip?: string;
}

interface City {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  deliveryMode: "ALL" | "ONLY_PICKUP" | "ONLY_DELIVERY";
}

const cuisineFilters = [
  { label: "Alla", emoji: "📋" },
  { label: "Pizza", emoji: "🍕" },
  { label: "Sushi", emoji: "🍣" },
  { label: "Kebab", emoji: "🥙" },
  { label: "Burgare", emoji: "🍔" },
  { label: "Pasta", emoji: "🍝" },
  { label: "Asiatiskt", emoji: "🥢" },
];

const ORDER_TYPE_KEY = "platform_order_type";
const PROMO_CARD_WIDTH = 260;
const PROMO_CARD_GAP = 12;
const PROMO_SNAP = PROMO_CARD_WIDTH + PROMO_CARD_GAP;

type PromoCardItem =
  | { id: string; kind: "deal"; deal: DealCardData }
  | { id: string; kind: "sponsor"; sponsor: SponsorData };

export default function HomePage() {
  const router = useRouter();
  const promoRailRef = useRef<HTMLDivElement | null>(null);
  const promoIndexRef = useRef(0);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [address, setAddress] = useState("");
  const [query, setQuery] = useState("");
  const [activeCuisine, setActiveCuisine] = useState("Alla");
  const [orderType, setOrderType] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false);
  
  const [cities, setCities] = useState<City[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [personalDeals, setPersonalDeals] = useState<any[]>([]);
  const [sponsors, setSponsors] = useState<SponsorData[]>([]);
  const [filteredByDeal, setFilteredByDeal] = useState<{ ids: string[]; title: string } | null>(null);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [selectedCity, setSelectedCity] = useState<City | null>(null);

  // Zone filtering – IDs of restaurants that can deliver to the user's saved coords
  const [zoneRestaurantIds, setZoneRestaurantIds] = useState<string[] | null>(null);
  const [zoneError, setZoneError] = useState<string | null>(null);
  // Zone-specific delivery info per restaurant (fee öre, minOrder öre, etaMinutes, zoneName)
  const [zoneDeliveryInfo, setZoneDeliveryInfo] = useState<Record<string, {
    deliveryFee: number; minOrder: number; etaMinutes?: number | null; zoneName?: string;
  }>>({});
  const setDeliveryOverrides = useCartStore((s) => s.setDeliveryOverrides);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [closedRestaurant, setClosedRestaurant] = useState<Restaurant | null>(null);
  const [infoRestaurant, setInfoRestaurant] = useState<Restaurant | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsLoggedIn(!!localStorage.getItem("platform_user_token"));
      const stored = localStorage.getItem("platform_address");
      if (stored) setAddress(stored);
      const storedType = localStorage.getItem(ORDER_TYPE_KEY);
      if (storedType === "PICKUP" || storedType === "DELIVERY") setOrderType(storedType as "DELIVERY" | "PICKUP");

      const err = localStorage.getItem("platform_address_error");
      if (err) {
        setDeliveryError(err);
        localStorage.removeItem("platform_address_error");
      }

      // Restore zone filtering from saved coords
      const storedCoords = localStorage.getItem("platform_coords");
      if (storedCoords && stored) {
        try {
          const coords = JSON.parse(storedCoords);
          validateZone(coords.lat, coords.lng);
        } catch (err) {
          console.warn("Failed to parse stored coords:", err);
        }
      }
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    const userToken = typeof window !== "undefined" ? localStorage.getItem("platform_user_token") : null;
    Promise.all([
      axios.get(`${API_URL}/api/restaurants`),
      axios.get(`${API_URL}/api/cities`),
      axios.get(`${API_URL}/api/deals`),
      axios.get(`${API_URL}/api/sponsors`).catch(() => ({ data: [] })),
      userToken
        ? axios.get(`${API_URL}/api/profile/deals`, { headers: { Authorization: `Bearer ${userToken}` } }).catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
    ]).then(([resRest, resCities, resDeals, resSponsors, resPersonal]) => {
      setRestaurants(resRest.data);
      setCities(resCities.data);
      setDeals(resDeals.data.filter((d: any) => d.isActive && d.showOnSite));
      setSponsors(resSponsors.data || []);
      setPersonalDeals(resPersonal.data || []);

      const initialAddress = localStorage.getItem("platform_address") || "";
      if (initialAddress) {
        const match = resCities.data.find((c: City) => c.name.toLowerCase() === initialAddress.toLowerCase());
        if (match) setSelectedCity(match);
      }
    }).catch(() => {
      setApiError(true);
    })
    .finally(() => setLoading(false));
  }, []);

  const validateZone = async (lat: number, lng: number) => {
    try {
      const res = await axios.post(`${API_URL}/api/cities/validate-location`, { lat, lng });
      if (res.data.covered) {
        const ids: string[] = [];
        const info: typeof zoneDeliveryInfo = {};
        const overrides: Record<string, { deliveryFee: number; minOrderAmount: number }> = {};
        res.data.cities.forEach((c: any) => {
          c.restaurants.forEach((r: any) => {
            ids.push(r.id);
            if (r.matchedZone) {
              const fee = (r.matchedZone.deliveryFee ?? 0) / 100;
              const min = (r.matchedZone.minOrder    ?? 0) / 100;
              info[r.id] = {
                deliveryFee: fee,
                minOrder:    min,
                etaMinutes:  r.matchedZone.etaMinutes  ?? null,
                zoneName:    r.matchedZone.name,
              };
              overrides[r.id] = { deliveryFee: fee, minOrderAmount: min };
            }
          });
        });
        setZoneRestaurantIds(ids);
        setZoneDeliveryInfo(info);
        setDeliveryOverrides(overrides);
        setZoneError(null);
      } else {
        setZoneRestaurantIds([]);
        setZoneDeliveryInfo({});
        setDeliveryOverrides({});
        setZoneError("Vi levererar inte till den här adressen ännu. Välj avhämtning eller prova en annan adress.");
      }
    } catch {
      setZoneRestaurantIds(null); // fail open — show all restaurants
      setZoneDeliveryInfo({});
      setDeliveryOverrides({});
    }
  };

  const saveAddress = (value: string) => {
    setAddress(value);
    if (typeof window !== "undefined") {
      localStorage.setItem("platform_address", value);
    }
  };

  const toggleOrderType = (type: "DELIVERY" | "PICKUP") => {
    if (selectedCity) {
      if (type === "DELIVERY" && selectedCity.deliveryMode === "ONLY_PICKUP") return;
      if (type === "PICKUP" && selectedCity.deliveryMode === "ONLY_DELIVERY") return;
    }

    setOrderType(type);
    if (typeof window !== "undefined") {
      localStorage.setItem(ORDER_TYPE_KEY, type);
    }
  };

  const handleAddressConfirm = async (addr: string, type: "DELIVERY" | "PICKUP", coords?: { lat: number; lng: number }) => {
    saveAddress(addr);
    setOrderType(type);
    localStorage.setItem(ORDER_TYPE_KEY, type);
    setShowAddressModal(false);
    setZoneError(null);

    if (coords) {
      localStorage.setItem("platform_coords", JSON.stringify(coords));
      if (type === "DELIVERY") {
        await validateZone(coords.lat, coords.lng);
      } else {
        // Pickup: show all restaurants, no zone check
        setZoneRestaurantIds(null);
      }
    } else {
      localStorage.removeItem("platform_coords");
      setZoneRestaurantIds(null);
    }

    if (pendingHref) {
      setPendingHref(null);
    }
  };

  const filtered = useMemo(() => {
    const list = restaurants.filter((r) => {
      const matchCuisine =
        activeCuisine === "Alla" ||
        (r.cuisine || "").toLowerCase().includes(activeCuisine.toLowerCase()) ||
        (r.tags || []).some((t) => t.toLowerCase().includes(activeCuisine.toLowerCase()));
      const matchQuery =
        query.trim().length === 0 ||
        r.name.toLowerCase().includes(query.toLowerCase()) ||
        (r.description || "").toLowerCase().includes(query.toLowerCase());
      
      // Zone handling: Mark as out of zone instead of filtering out
      const outOfZone = orderType === "DELIVERY" && zoneRestaurantIds !== null && !zoneRestaurantIds.includes(r.id);
      
      // We no longer filter out by zone here, we'll handle it in sorting and UI
      const matchZone = true; 

      // Deal filter — when user clicks a deal card
      const matchDeal = !filteredByDeal || filteredByDeal.ids.includes(r.id);

      // Pickup: filter by city if selected
      let matchCity = true;
      if (orderType === "PICKUP" && selectedCity) {
        matchCity = (r.city || "").toLowerCase() === selectedCity.name.toLowerCase();
      }

      return matchCuisine && matchQuery && matchZone && matchCity && matchDeal;
    });

    // Sort: 1) Open Premium, 2) Open, 3) Closed/OutOfZone
    return list.sort((a, b) => {
      const aInZone = zoneRestaurantIds === null || !orderType || orderType === "PICKUP" || zoneRestaurantIds.includes(a.id);
      const bInZone = zoneRestaurantIds === null || !orderType || orderType === "PICKUP" || zoneRestaurantIds.includes(b.id);
      
      // Prioritize in-zone
      if (aInZone !== bInZone) return aInZone ? -1 : 1;

      const aOpen = a.isOpen !== false ? 1 : 0;
      const bOpen = b.isOpen !== false ? 1 : 0;
      if (aOpen !== bOpen) return bOpen - aOpen;

      const aPremium = (a.featuredClass === 1 || a.featuredClass === 2) ? 1 : 0;
      const bPremium = (b.featuredClass === 1 || b.featuredClass === 2) ? 1 : 0;
      if (aPremium !== bPremium) return bPremium - aPremium;
      
      return a.name.localeCompare(b.name);
    });
  }, [restaurants, activeCuisine, query, orderType, zoneRestaurantIds, filteredByDeal]);

  const featured = filtered.filter((r) => r.featuredClass === 1 || r.featuredClass === 2).slice(0, 8);

  // Build DealFlipCard data array
  const allDealCards = useMemo<DealCardData[]>(() => {
    const personal: DealCardData[] = personalDeals.map(d => ({
      id: `personal-${d.id}`,
      badgeLabel: (d.campaign?.title || "").toLowerCase().includes("välkomst") ? "Välkomst" : "Personligt",
      title: d.campaign?.title || "Erbjudande",
      subtitle: d.code ? `Din kod: ${d.code}` : "Knutet till ditt konto",
      rewardLabel: d.campaign?.discountType === "PERCENTAGE"
        ? `${d.campaign.discountValue}% rabatt`
        : `${d.campaign?.discountValue || 0} kr rabatt`,
      description: d.campaign?.description || "Används automatiskt vid köp.",
      code: d.code,
      validUntil: d.campaign?.validUntil,
      minOrderText: d.campaign?.minOrder ? `Min ${d.campaign.minOrder} kr` : null,
      tone: (d.campaign?.title || "").toLowerCase().includes("välkomst") ? "orange" as const : "gold" as const,
      variant: "personal" as const,
    }));

    const pub: DealCardData[] = deals.map(d => {
      const related = [d.restaurantId, ...(d.applicableRestaurantIds || [])].filter(Boolean);
      return {
        id: d.id,
        badgeLabel: d.isGlobal ? "Globalt" : (d.restaurant?.name || "Erbjudande"),
        title: d.title,
        subtitle: d.description || (d.restaurant?.name ? `Hos ${d.restaurant.name}` : "Gäller alla restauranger"),
        rewardLabel: d.discountType === "PERCENTAGE" ? `${d.discountValue}%` : `${d.discountValue} kr`,
        description: d.description,
        code: d.code,
        validUntil: d.validUntil,
        minOrderText: d.minOrder ? `Min ${d.minOrder} kr` : null,
        tags: d.tags || [],
        tone: "purple" as const,
        variant: "public" as const,
        relatedRestaurantIds: related,
        onNavigateToFiltered: (ids, title) => setFilteredByDeal({ ids, title }),
      };
    });

    return [...personal, ...pub];
  }, [deals, personalDeals, restaurants]);

  const promoCards = useMemo<PromoCardItem[]>(() => {
    const dealItems = allDealCards.map((deal) => ({ id: deal.id, kind: "deal" as const, deal }));
    const sponsorItems = sponsors.map((sponsor) => ({ id: `sponsor-${sponsor.id}`, kind: "sponsor" as const, sponsor }));

    if (dealItems.length === 0) return sponsorItems;
    if (sponsorItems.length === 0) return dealItems;

    const merged: PromoCardItem[] = [];
    let sponsorIndex = 0;

    dealItems.forEach((item, index) => {
      merged.push(item);
      if ((index + 1) % 2 === 0 && sponsorIndex < sponsorItems.length) {
        merged.push(sponsorItems[sponsorIndex]);
        sponsorIndex += 1;
      }
    });

    while (sponsorIndex < sponsorItems.length) {
      merged.push(sponsorItems[sponsorIndex]);
      sponsorIndex += 1;
    }

    return merged;
  }, [allDealCards, sponsors]);

  const handlePromoScroll = useCallback(() => {
    const rail = promoRailRef.current;
    if (!rail) return;
    promoIndexRef.current = Math.max(
      0,
      Math.min(Math.round(rail.scrollLeft / PROMO_SNAP), Math.max(promoCards.length - 1, 0))
    );
  }, [promoCards.length]);

  useEffect(() => {
    promoIndexRef.current = 0;
    if (promoCards.length <= 1) return;

    const interval = window.setInterval(() => {
      const rail = promoRailRef.current;
      if (!rail) return;

      const nextIndex = (promoIndexRef.current + 1) % promoCards.length;
      promoIndexRef.current = nextIndex;
      rail.scrollTo({ left: nextIndex * PROMO_SNAP, behavior: "smooth" });
    }, 4000);

    return () => window.clearInterval(interval);
  }, [promoCards.length]);

  const getRestaurantHref = (r: Restaurant) => `/restaurants/${r.slug}`;

  const getImageSrc = (path?: string) => {
    if (!path) return "";
    if (path.startsWith("/")) return `${API_URL}${path}`;
    return path;
  };

  const getCardImage = (r: Restaurant) => {
    return getImageSrc(r.heroImageUrl || r.imageUrl || "");
  };

  const handleRestaurantClick = (e: React.MouseEvent, r: Restaurant) => {
    e.preventDefault();
    router.push(getRestaurantHref(r));
  };



  return (
    <div className="min-h-screen text-zinc-100 bg-[#171513] pt-4 pb-32">
      <div className="relative mx-auto max-w-6xl px-4 lg:px-10">
        {/* COMPACT HEADER – adresspil i toppen, toggle + sök komprimerad */}
        <header className="mb-6 relative">
          {/* Pull-down address selector – sitter längst upp som en pil man drar ner */}
          <div className="mb-3">
            <AddressPullDown
              currentAddress={address}
              onOpenFull={() => setShowAddressModal(true)}
              onSelect={(a) => {
                const full = [a.street, a.zip, a.city].filter(Boolean).join(", ");
                saveAddress(full);
                if (a.latitude != null && a.longitude != null) {
                  localStorage.setItem("platform_coords", JSON.stringify({ lat: a.latitude, lng: a.longitude }));
                  if (orderType === "DELIVERY") validateZone(a.latitude, a.longitude);
                }
              }}
            />
          </div>

          {/* Kompakt greeting + toggle + sök i en tät rad */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between gap-3 mb-3"
          >
            <div className="min-w-0">
              <h1 className="text-xl lg:text-2xl font-black tracking-tight leading-none text-white truncate">
                Vad blir det <span className="text-gold-500 italic">idag?</span>
              </h1>
              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-600 mt-1">
                Hitta snabbt · beställ enkelt
              </p>
            </div>

            <div className="relative p-0.5 glass-panel rounded-full flex items-center shrink-0">
              <div
                className="absolute inset-y-0.5 h-auto bg-gold-500 rounded-full transition-all duration-300"
                style={{ width: 'calc(50% - 2px)', left: orderType === 'DELIVERY' ? '2px' : '50%' }}
              />
              <button onClick={() => toggleOrderType("DELIVERY")} className={`relative z-10 flex items-center gap-1.5 px-4 py-2 text-[9px] font-black uppercase tracking-widest whitespace-nowrap ${orderType === 'DELIVERY' ? 'text-zinc-950' : 'text-zinc-500'}`}>
                <Truck size={12} /> Leverans
              </button>
              <button onClick={() => toggleOrderType("PICKUP")} className={`relative z-10 flex items-center gap-1.5 px-4 py-2 text-[9px] font-black uppercase tracking-widest whitespace-nowrap ${orderType === 'PICKUP' ? 'text-zinc-950' : 'text-zinc-500'}`}>
                <Store size={12} /> Hämtning
              </button>
            </div>
          </motion.div>

          <Link
            href="/search"
            className="flex items-center gap-2 rounded-2xl px-4 py-2.5 border hover:border-gold-500/50 transition-all group shadow-sm"
            style={{ backgroundColor: "#211C19", borderColor: "rgba(255,248,234,0.08)" }}
          >
            <Search size={14} className="shrink-0" style={{ color: "#B8AA95" }} />
            <span className="text-[11px] font-bold flex-1 truncate" style={{ color: "#B8AA95" }}>
              Sök restaurang eller maträtt
            </span>
            <div className="w-7 h-7 rounded-full bg-gold-500 flex items-center justify-center text-zinc-950 group-hover:rotate-12 transition-all shrink-0">
              <ArrowRight size={14} />
            </div>
          </Link>
        </header>

        {promoCards.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3 px-1">
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                  <Sparkles size={14} className="text-gold-500" /> Aktuellt
                </h2>
                <p className="text-zinc-600 text-[9px] font-black uppercase tracking-[0.25em] mt-0.5">
                  Kampanjer &amp; partners
                </p>
              </div>
            </div>
            <div
              ref={promoRailRef}
              onScroll={handlePromoScroll}
              className="flex gap-3 overflow-x-auto pb-3 no-scrollbar -mx-6 px-6 lg:mx-0 lg:px-0"
              style={{ scrollSnapType: "x mandatory" }}
            >
              {promoCards.map((item) => (
                <div key={item.id} style={{ scrollSnapAlign: "start" }}>
                  {item.kind === "sponsor" ? (
                    <SponsorCard sponsor={item.sponsor} />
                  ) : (
                    <DealFlipCard deal={item.deal} />
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* NYA SEKTIONER: rabatterade rätter + fri leverans */}
        <DiscountedDishesSection />
        <FreeDeliverySection />

        {filteredByDeal && (
          <section className="mb-10">
            <div className="flex items-center justify-between gap-4 rounded-[1.8rem] border px-5 py-4" style={{ backgroundColor: "#211C19", borderColor: "rgba(255,248,234,0.08)" }}>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.25em]" style={{ color: "#B8AA95" }}>Filtrerat erbjudande</p>
                <p className="text-sm font-black uppercase" style={{ color: "#FFF8EA" }}>{filteredByDeal.title}</p>
              </div>
              <button onClick={() => setFilteredByDeal(null)}
                className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl border"
                style={{ color: "#B8AA95", borderColor: "rgba(255,248,234,0.10)" }}>
                <X size={11} /> Rensa filter
              </button>
            </div>
          </section>
        )}

        {/* Cuisine Selector */}
        <section className="mb-16">
          <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
            {cuisineFilters.map((c, i) => (
              <motion.button
                key={c.label}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                onClick={() => setActiveCuisine(c.label)}
                className={`whitespace-nowrap flex items-center gap-2 rounded-[1.1rem] px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.15em] transition-all border-2 active:scale-95 ${
                  activeCuisine === c.label
                    ? "bg-gold-500 text-zinc-950 border-gold-500 shadow-[0_8px_16px_rgba(231,178,75,0.1)]"
                    : "text-zinc-500 border-white/5 hover:border-white/10 hover:text-zinc-100"
                }`}
              >
                <span className="text-base grayscale-[0.5] group-hover:grayscale-0">{c.emoji}</span>
                <span>{c.label === "Alla" ? "Alla Restauranger" : c.label}</span>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Featured Section */}
        {featured.length > 0 && (
          <section className="mb-20">
            <div className="flex items-end justify-between mb-8 px-4">
               <div>
                  <h2 className="text-gold-gradient text-3xl font-black tracking-tight leading-none italic uppercase">HETA LISTAN</h2>
                  <p className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.3em] mt-2">Toppvalen i din stad just nu</p>
               </div>
               <Link href="/search" className="text-[10px] font-black uppercase tracking-widest text-zinc-200 border-b border-gold-500/50 pb-1 hover:text-gold-500 transition-all">Visa Alla</Link>
            </div>
            <div className="flex lg:grid lg:grid-cols-4 gap-6 overflow-x-auto lg:overflow-visible pb-10 no-scrollbar -mx-6 px-6 lg:mx-0 lg:px-0">
              {featured.map((r, i) => {
                const inZone = orderType !== "DELIVERY" || zoneRestaurantIds === null || zoneRestaurantIds.includes(r.id);
                const dimmed = r.isOpen === false || !inZone;
                return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  whileTap={{ opacity: 0.7, scale: 0.99 }} transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  className={`transition-opacity duration-300 ${dimmed ? "opacity-75 grayscale-[20%]" : ""}`}
                >
                  <Link
                    href={getRestaurantHref(r)}
                    onClick={(e) => handleRestaurantClick(e, r)}
                    className="group relative block w-[300px] lg:w-auto h-full glass-card rounded-[3rem] p-4 flex flex-col"
                  >
                    <div className="h-44 lg:h-56 w-full rounded-[2.2rem] bg-obsidian/50 relative overflow-hidden mb-6">
                      {r.heroImageUrl || r.imageUrl ? (
                        <img src={getCardImage(r)} alt={r.name} className="h-full w-full object-cover transition-all duration-700 group-hover:scale-110 group-hover:rotate-1" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-4xl">🍴</div>
                      )}
                      
                      <div className="absolute top-4 left-4">
                        <div className={`px-4 py-1.5 rounded-full backdrop-blur-md border flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest ${r.isOpen !== false ? "bg-emerald-500/30 border-emerald-500/30 text-emerald-100" : "bg-rose-500/30 border-rose-500/30 text-rose-100"}`}>
                           <div className={`w-1 h-1 rounded-full ${r.isOpen !== false ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`} />
                           {r.isOpen !== false ? "Öppet" : "Stängt"}
                        </div>
                      </div>

                      <div className="absolute top-4 right-4 flex flex-col gap-2 items-end">
                        <button 
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setInfoRestaurant(r); }}
                          className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-zinc-100 border border-white/10 hover:bg-gold-500 hover:text-zinc-950 transition-all shadow-xl"
                        >
                          <Info size={16} />
                        </button>
                        <div className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md flex items-center gap-1 border border-white/10">
                          {r.rating ? (
                            <>
                              <Star size={12} className="fill-gold-500 text-gold-500" />
                              <span className="text-[10px] font-black italic text-zinc-100">{r.rating.toFixed(1)}</span>
                            </>
                          ) : (
                            <span className="text-[10px] font-black italic text-emerald-400">NY!</span>
                          )}
                        </div>
                        {deals.find(d => d.isGlobal || d.restaurantId === r.id) && (
                          <div className="px-3 py-1.5 rounded-full bg-emerald-500 text-dark-500 flex items-center gap-1 shadow-lg">
                             <Percent size={10} strokeWidth={4} />
                             <span className="text-[8px] font-black uppercase">{deals.find(d => d.isGlobal || d.restaurantId === r.id).title}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="px-3 pb-4">
                       <h3 className="text-xl font-black text-white group-hover:text-gold-500 transition-colors uppercase tracking-tight leading-none mb-2">{r.name}</h3>
                       <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-6 truncate">{r.description || r.cuisine}</p>
                       
                        <div className="flex items-center justify-between border-t border-white/5 pt-5">
                           {(() => {
                             const zi = zoneDeliveryInfo[r.id];
                             const fee = zi ? zi.deliveryFee : (r.deliveryFee ?? 0);
                             const eta = zi?.etaMinutes ?? r.etaMinutes ?? 30;
                             return (
                               <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-wider text-zinc-400">
                                 <span className="flex items-center gap-1.5"><Clock size={12} className="text-gold-500/50" /> {eta} MIN</span>
                                 <span className="flex items-center gap-1.5"><Bike size={12} className="text-gold-500/50" /> {fee === 0 ? "GRATIS" : `${fee} KR`}</span>
                               </div>
                             );
                           })()}
                           <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 group-hover:bg-gold-500 group-hover:text-zinc-950 transition-all">
                              <ChevronRight size={18} />
                           </div>
                        </div>
                    </div>
                  </Link>
                </motion.div>
                );
              })}
            </div>
          </section>
        )}

        {/* Dynamic List Section */}
        <section>
          {/* Loyalty banner — shown to guests when restaurant list has loaded */}
          {!isLoggedIn && !loading && !apiError && filtered.length > 0 && (
            <div className="mb-8 p-4 rounded-[2rem] border border-gold-500/15 bg-gold-500/5 flex flex-col sm:flex-row items-center gap-4">
              <div className="w-10 h-10 shrink-0 bg-gold-500/10 rounded-2xl border border-gold-500/20 flex items-center justify-center">
                <span className="text-xl">🎁</span>
              </div>
              <p className="text-[11px] font-bold text-zinc-400 text-center sm:text-left flex-1">
                Ta del av{" "}
                <span className="text-gold-400 font-black">personliga erbjudanden</span>, spara adresser och följ dina ordrar.{" "}
                <a href="/profile" className="text-gold-400 underline font-black hover:text-gold-300">Logga in gratis →</a>
              </p>
            </div>
          )}

          <div className="flex items-center justify-between mb-10 px-4">
            <h2 className="text-xl font-black tracking-[0.2em] uppercase text-zinc-600">
              {activeCuisine === "Alla" ? "Alla Restauranger" : activeCuisine} <span className="text-zinc-800 ml-2">/ {filtered.length} st</span>
            </h2>
          </div>

          {apiError ? (
            <div className="py-24 text-center">
              <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-rose-500/10">
                <X size={32} className="text-rose-500" />
              </div>
              <p className="text-2xl font-black uppercase tracking-tight text-white mb-2">Kan inte nå servern</p>
              <p className="text-zinc-600 text-[10px] font-black uppercase tracking-widest mb-6">Kontrollera din anslutning och försök igen.</p>
              <button
                onClick={() => { setApiError(false); setLoading(true); window.location.reload(); }}
                className="px-8 py-4 bg-gold-500 text-zinc-950 rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all"
              >
                Ladda om
              </button>
            </div>
          ) : loading ? (
            <div className="space-y-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-44 rounded-[3rem] glass-panel animate-pulse shadow-sm" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-24 text-center">
              <div className="w-20 h-20 bg-obsidian/60 rounded-full flex items-center justify-center mx-auto mb-8 border border-white/5">
                <Search size={32} className="text-zinc-800" />
              </div>
              <p className="text-2xl font-black uppercase tracking-tight text-white mb-2">Ingen träff</p>
              <p className="text-zinc-600 text-[10px] font-black uppercase tracking-widest">Här ekar det tomt just nu.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-1 xl:grid-cols-2 gap-8">
              {filtered.map((r, i) => {
                const isOutOfZone = orderType === "DELIVERY" && zoneRestaurantIds !== null && !zoneRestaurantIds.includes(r.id);
                const isClosed = r.isOpen === false;
                const dimmed = isClosed || isOutOfZone;
                return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileTap={{ opacity: 0.7, scale: 0.99 }} transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  className={`transition-opacity duration-300 ${dimmed ? "opacity-75 grayscale-[20%]" : ""}`}
                >
                  <Link
                    href={getRestaurantHref(r)}
                    onClick={(e) => handleRestaurantClick(e, r)}
                    className="group flex flex-col sm:flex-row glass-panel rounded-[3.5rem] p-6 gap-8 hover:border-gold-500/30 hover:bg-white/5 transition-all active:scale-[0.99] border border-white/5 shadow-2xl"
                  >
                    <div className="w-full sm:w-60 h-52 sm:h-52 shrink-0 rounded-[2.5rem] overflow-hidden relative shadow-inner bg-zinc-900">
                      {r.imageUrl || r.heroImageUrl ? (
                        <img src={getCardImage(r)} alt={r.name} className="h-full w-full object-cover group-hover:scale-110 transition-all duration-700" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center bg-obsidian text-4xl">🍱</div>
                      )}
                      
                      {/* Out of Zone / Closed Badge */}
                      {(isClosed || isOutOfZone) && (
                        <div className="absolute inset-0 bg-obsidian/85 backdrop-blur-md flex items-center justify-center flex-col gap-2">
                          {isOutOfZone && (
                            <div className="px-4 py-2 rounded-xl bg-rose-500/20 text-rose-400 text-[10px] font-black uppercase tracking-widest border border-rose-500/20">
                              Utanför zon
                            </div>
                          )}
                          {isClosed && (
                            <div className="px-4 py-2 rounded-xl bg-zinc-900/90 text-zinc-400 text-[10px] font-black uppercase tracking-widest border border-white/5">
                              Stängt
                            </div>
                          )}
                        </div>
                      )}

                      <div className="absolute top-4 left-4">
                        <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-gold-500 font-black italic shadow-xl">
                          <Star size={12} className="fill-gold-500" />
                          <span className="text-[10px]">{(r.rating ?? 4.6).toFixed(1)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 py-2 flex flex-col min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-3">
                         <h3 className="text-3xl font-black text-white group-hover:text-gold-500 transition-colors uppercase tracking-tighter leading-none italic">{r.name}</h3>
                         <button 
                           onClick={(e) => { e.preventDefault(); e.stopPropagation(); setInfoRestaurant(r); }}
                           className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-zinc-600 hover:text-gold-500 hover:bg-gold-500/10 transition-all active:scale-95 border border-white/5 shrink-0"
                         >
                           <Info size={16} />
                         </button>
                      </div>
                      
                      <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest leading-relaxed mb-auto mt-1 line-clamp-2">{r.description || r.cuisine || "MatGo Selection"}</p>
                      
                      <div className="mt-8 border-t border-white/5 pt-6">
                        {(() => {
                          const zi = zoneDeliveryInfo[r.id];
                          const fee    = zi ? zi.deliveryFee : (r.deliveryFee ?? 0);
                          const minOrd = zi ? zi.minOrder    : (r.minOrderAmount ?? 0);
                          const eta    = zi?.etaMinutes ?? r.etaMinutes ?? 30;
                          return (
                            <div className="flex items-center flex-wrap gap-5 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                              <span className="flex items-center gap-2"><Clock size={14} className="text-gold-500/50" /> {eta} MIN</span>
                              <span className="flex items-center gap-2"><Bike size={14} className="text-gold-500/50" /> {fee === 0 ? "GRATIS" : `${fee} KR`}</span>
                              <span className="text-zinc-700">MIN {minOrd} KR</span>
                              {zi?.zoneName && <span className="bg-gold-500/10 text-gold-600 px-3 py-1 rounded-full text-[8px] border border-gold-500/10 tracking-normal">{zi.zoneName}</span>}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </Link>
                </motion.div>
                );
              })}
            </div>
          )}
        </section>

        {/* Info Modal Implementation */}
        <AnimatePresence>
          {infoRestaurant && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center p-6 backdrop-blur-md" onClick={() => setInfoRestaurant(null)} style={{ backgroundColor: "rgba(23,21,19,0.95)" }}>
              <motion.div initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm glass-panel p-10 rounded-[3.5rem] relative" onClick={e => e.stopPropagation()}>
                <div className="w-16 h-16 bg-gold-500/10 rounded-[2rem] flex items-center justify-center mb-8 border border-gold-500/20 text-gold-500">
                    <Info size={32} />
                </div>
                <h2 className="text-3xl font-black uppercase italic text-white mb-2">{infoRestaurant.name}</h2>
                <p className="text-zinc-600 text-[10px] font-black uppercase tracking-widest mb-10">Restaurang Information</p>
                
                <div className="space-y-8">
                    {infoRestaurant.description && (
                      <div className="flex items-start gap-4">
                          <div className="min-w-0">
                            <div className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-600 mb-1">Beskrivning</div>
                            <p className="text-xs font-bold text-white/60 leading-relaxed uppercase tracking-wider italic">{infoRestaurant.description}</p>
                          </div>
                      </div>
                    )}
                    {(infoRestaurant.address || infoRestaurant.city) && (
                      <div className="flex items-start gap-4">
                        <MapPin className="text-zinc-700 mt-1" size={18} />
                        <div className="min-w-0">
                          <div className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-600 mb-1">Hitta Hit</div>
                          <div className="text-sm font-black text-white italic uppercase">{infoRestaurant.address}</div>
                          <div className="text-sm font-black text-white italic uppercase opacity-40">{infoRestaurant.zip} {infoRestaurant.city}</div>
                        </div>
                      </div>
                    )}
                    {infoRestaurant.phone && (
                      <div className="flex items-start gap-4">
                        <Phone className="text-zinc-700 mt-1" size={18} />
                        <div className="min-w-0">
                          <div className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-600 mb-1">Ring Oss</div>
                          <a href={`tel:${infoRestaurant.phone}`} className="text-lg font-black text-gold-500 hover:text-gold-400 transition-colors uppercase italic">{infoRestaurant.phone}</a>
                        </div>
                      </div>
                    )}
                </div>

                <button onClick={() => setInfoRestaurant(null)} className="absolute top-10 right-10 text-zinc-700 hover:text-white transition-colors">
                    <X size={24} />
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Promo Footer */}
        <section className="mt-24 rounded-[3.5rem] bg-gradient-to-r from-gold-500 to-amber-600 p-12 relative overflow-hidden group shadow-2xl shadow-gold-500/10">
           <div className="absolute right-[-50px] top-[-50px] w-[200px] h-[200px] bg-white/20 rounded-full blur-[80px]" />
           <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-10">
              <div className="text-center lg:text-left">
                 <h2 className="text-3xl lg:text-5xl font-black text-zinc-950 uppercase tracking-tighter leading-none mb-4 italic">BÄSTA MATEN <br /> I DIN TELEFON</h2>
                 <p className="text-zinc-950/60 text-[10px] font-black uppercase tracking-[0.2em]">Installera appen för en ännu snabbare upplevelse</p>
              </div>
              <button 
                onClick={() => window.dispatchEvent(new Event('trigger-pwa-install'))}
                className="px-10 py-5 bg-obsidian text-white rounded-3xl font-black uppercase tracking-[0.3em] text-[10px] shadow-2xl active:scale-95 transition-all group-hover:bg-zinc-900 border border-white/5"
              >
                Hämta Appen
              </button>
           </div>
        </section>
      </div>

      <AddressModal isOpen={showAddressModal} onClose={() => { setShowAddressModal(false); setPendingHref(null); }} onConfirm={handleAddressConfirm} orderType={orderType} setOrderType={setOrderType} />

      {/* Closed popup handling */}
      <AnimatePresence>
        {closedRestaurant && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center p-6 backdrop-blur-md" onClick={() => setClosedRestaurant(null)} style={{ backgroundColor: "rgba(23,21,19,0.95)" }}>
             <motion.div initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm glass-panel p-10 rounded-[3.5rem] text-center border border-white/10" onClick={e => e.stopPropagation()}>
                <div className="w-20 h-20 bg-rose-500/10 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 border border-rose-500/20 shadow-lg shadow-rose-500/10">
                   <span className="text-4xl text-rose-500 group-hover:scale-110 transition-transform">🌙</span>
                </div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tight italic mb-2">{closedRestaurant.name}</h3>
                <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-widest mb-10 leading-relaxed">Tyvärr är köket stängt för dagen. <br /> Vill du se menyn ändå?</p>
                <div className="flex flex-col gap-3">
                   <button onClick={() => { router.push(getRestaurantHref(closedRestaurant)); setClosedRestaurant(null); }} className="w-full py-5 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all">Se Meny</button>
                   <button onClick={() => setClosedRestaurant(null)} className="w-full py-5 text-zinc-500 font-black uppercase text-[10px] tracking-widest hover:text-zinc-300">Stäng</button>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
