"use client";

import { useEffect, useMemo, useState } from "react";
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
  Flame,
  ArrowRight,
  X,
  Sparkles,
  Tag,
  Percent,
  Info,
  Phone,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import AddressModal from "@/components/AddressModal";
import DealFlipCard, { type DealCardData } from "@/components/DealFlipCard";
import SponsorCard, { type SponsorData } from "@/components/SponsorCard";

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

export default function HomePage() {
  const router = useRouter();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [address, setAddress] = useState("");
  const [query, setQuery] = useState("");
  const [activeCuisine, setActiveCuisine] = useState("Alla");
  const [orderType, setOrderType] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [loading, setLoading] = useState(true);
  
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
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [closedRestaurant, setClosedRestaurant] = useState<Restaurant | null>(null);
  const [infoRestaurant, setInfoRestaurant] = useState<Restaurant | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
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
        } catch {}
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
    }).catch(() => {})
    .finally(() => setLoading(false));
  }, []);

  const validateZone = async (lat: number, lng: number) => {
    try {
      const res = await axios.post(`${API_URL}/api/cities/validate-location`, { lat, lng });
      if (res.data.covered) {
        const ids: string[] = [];
        const info: typeof zoneDeliveryInfo = {};
        res.data.cities.forEach((c: any) => {
          c.restaurants.forEach((r: any) => {
            ids.push(r.id);
            if (r.matchedZone) {
              info[r.id] = {
                deliveryFee: r.matchedZone.deliveryFee ?? 0,
                minOrder:    r.matchedZone.minOrder    ?? 0,
                etaMinutes:  r.matchedZone.etaMinutes  ?? null,
                zoneName:    r.matchedZone.name,
              };
            }
          });
        });
        setZoneRestaurantIds(ids);
        setZoneDeliveryInfo(info);
        setZoneError(null);
      } else {
        setZoneRestaurantIds([]);
        setZoneDeliveryInfo({});
        setZoneError("Vi levererar inte till den här adressen ännu. Välj avhämtning eller prova en annan adress.");
      }
    } catch {
      setZoneRestaurantIds(null); // fail open — show all restaurants
      setZoneDeliveryInfo({});
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
      
      // Zone-based filtering (most precise) — only applies for DELIVERY with coordinates
      let matchZone = true;
      if (orderType === "DELIVERY" && zoneRestaurantIds !== null) {
        matchZone = zoneRestaurantIds.includes(r.id);
      }

      // Deal filter — when user clicks a deal card
      const matchDeal = !filteredByDeal || filteredByDeal.ids.includes(r.id);

      return matchCuisine && matchQuery && matchZone && matchDeal;
    });

    // Sort: 1) Open Premium, 2) Open, 3) Closed Premium, 4) Closed
    return list.sort((a, b) => {
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
    const restaurantById = new Map(restaurants.map(r => [r.id, r]));

    const personal: DealCardData[] = personalDeals.map(d => ({
      id: `personal-${d.id}`,
      badgeLabel: "Personligt",
      title: d.campaign?.title || "Erbjudande",
      subtitle: d.code ? `Din kod: ${d.code}` : "Knutet till ditt konto",
      rewardLabel: d.campaign?.discountType === "PERCENTAGE"
        ? `${d.campaign.discountValue}% rabatt`
        : `${d.campaign?.discountValue || 0} kr rabatt`,
      description: d.campaign?.description || "Används automatiskt vid köp.",
      code: d.code,
      validUntil: d.campaign?.validUntil,
      minOrderText: d.campaign?.minOrder ? `Min ${d.campaign.minOrder} kr` : null,
      tone: "emerald" as const,
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
        tone: "gold" as const,
        variant: "public" as const,
        relatedRestaurantIds: related,
        onNavigateToFiltered: (ids, title) => setFilteredByDeal({ ids, title }),
      };
    });

    return [...personal, ...pub];
  }, [deals, personalDeals, restaurants]);

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
    <div className="min-h-screen text-zinc-100 bg-[#18181b] pt-10 pb-32">
      <div className="relative mx-auto max-w-6xl px-6 lg:px-10">
        {/* Modern Header */}
        <header className="mb-12 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-10 mb-12">
            <motion.div 
               initial={{ opacity: 0, x: -20 }}
               animate={{ opacity: 1, x: 0 }}
               className="flex-1"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-500/10 border border-gold-500/20 text-gold-500 text-[10px] font-black uppercase tracking-[0.3em] mb-4">
                <Sparkles size={12} />
                <span>Smaka Framtiden</span>
              </div>
              <h1 className="text-5xl lg:text-7xl font-black tracking-tighter leading-[0.9] text-white">
                VAD VILL DU <br /> <span className="text-gold-gradient italic">ÄTA</span> IDAG?
              </h1>
            </motion.div>

            {/* Premium Order Type Toggle */}
            <div className="relative p-1 glass-panel rounded-[2rem] flex items-center lg:w-[340px] shrink-0 active:scale-[0.98] transition-transform">
               <div className="absolute inset-y-1 h-auto bg-gold-500 rounded-[1.8rem] transition-all duration-300 ease-out" 
                  style={{ 
                    width: 'calc(50% - 4px)', 
                    left: orderType === 'DELIVERY' ? '4px' : '50%'
                  }} 
               />
               <button onClick={() => toggleOrderType("DELIVERY")} className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${orderType === 'DELIVERY' ? 'text-zinc-950' : 'text-zinc-500'}`}>
                  <Truck size={16} /> Leverans
               </button>
               <button onClick={() => toggleOrderType("PICKUP")} className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${orderType === 'PICKUP' ? 'text-zinc-950' : 'text-zinc-500'}`}>
                  <Store size={16} /> Hämtning
               </button>
            </div>
          </div>

          {/* New Search & Address Bar */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col sm:grid sm:grid-cols-[1fr,1.3fr] gap-2 p-2 rounded-[2rem] glass-panel shadow-2xl relative z-20"
          >
            <div className="relative group">
              <motion.div 
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowAddressModal(true)}
                className="flex items-center gap-2 rounded-[1.5rem] bg-obsidian/40 px-4 py-3 border border-white/5 hover:border-gold-500/50 transition-all cursor-pointer"
              >
                <MapPin className="text-gold-500 shrink-0" size={16} />
                <span className={`w-full text-xs font-bold ${address ? 'text-white' : 'text-zinc-600'} truncate`}>
                  {address || "Ange din adress..."}
                </span>
              </motion.div>
            </div>


            <Link href="/search" className="flex items-center gap-2 rounded-[1.5rem] bg-obsidian/40 px-4 py-3 border border-white/5 hover:border-gold-500/50 transition-all group shadow-sm">
               <Search size={16} className="text-zinc-700 group-hover:text-gold-500/60 transition-colors shrink-0" />
               <span className="text-xs text-zinc-600 font-bold line-clamp-1 flex-1">Vilken restaurang eller maträtt?</span>
               <div className="ml-auto w-8 h-8 rounded-full bg-gold-500 flex items-center justify-center text-zinc-950 group-hover:rotate-12 transition-all shrink-0">
                  <ArrowRight size={18} />
               </div>
            </Link>
          </motion.div>
        </header>

        {/* Sponsors prominently displayed (Replaces old welcome section) */}
        {sponsors.length > 0 && (
          <section className="mb-16">
            <div className="flex items-center justify-between mb-6 px-1">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                  <Sparkles size={18} className="text-gold-500" /> Sponsrat
                </h2>
                <p className="text-zinc-600 text-[9px] font-black uppercase tracking-[0.3em] mt-1">
                  Exklusivt från våra partners • Flippa för info
                </p>
              </div>
            </div>
            <div className="flex gap-6 overflow-x-auto pb-8 no-scrollbar -mx-6 px-6 lg:mx-0 lg:px-0">
              {sponsors.map(s => (
                <SponsorCard key={s.id} sponsor={s} />
              ))}
            </div>
          </section>
        )}

        {/* ── Deals & Erbjudanden (RESTORED) ── */}
        {allDealCards.length > 0 && (
          <section className="mb-16">
            <div className="flex items-center justify-between mb-6 px-1">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                  <Tag size={18} className="text-gold-500" /> Erbjudanden
                </h2>
                <p className="text-zinc-600 text-[9px] font-black uppercase tracking-[0.3em] mt-1">
                  {filteredByDeal ? `Visar: ${filteredByDeal.title}` : "Flippa korten för mer info"}
                </p>
              </div>
              {filteredByDeal && (
                <button onClick={() => setFilteredByDeal(null)}
                  className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-all border border-white/10 px-3 py-1.5 rounded-xl">
                  <X size={11} /> Rensa filter
                </button>
              )}
            </div>
            <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar -mx-6 px-6 lg:mx-0 lg:px-0">
              {allDealCards.map(d => (
                <DealFlipCard key={d.id} deal={d} />
              ))}
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
                    : "bg-obsidian/20 text-zinc-500 border-white/5 hover:border-white/10 hover:text-zinc-100"
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
              {featured.map((r, i) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  whileTap={{ opacity: 0.7, scale: 0.99 }} transition={{ type: "spring", stiffness: 300, damping: 25 }}
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
                       <h3 className="text-xl font-black text-white group-hover:text-gold-500 transition-colors uppercase tracking-tight truncate leading-none mb-2">{r.name}</h3>
                       <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-6 truncate">{r.description || r.cuisine}</p>
                       
                        <div className="flex items-center justify-between border-t border-white/5 pt-5">
                           {(() => {
                             const zi = zoneDeliveryInfo[r.id];
                             const fee = zi ? Math.round(zi.deliveryFee / 100) : (r.deliveryFee ?? 0);
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
              ))}
            </div>
          </section>
        )}

        {/* Dynamic List Section */}
        <section>
          <div className="flex items-center justify-between mb-10 px-4">
            <h2 className="text-xl font-black tracking-[0.2em] uppercase text-zinc-600">
              {activeCuisine === "Alla" ? "Alla Restauranger" : activeCuisine} <span className="text-zinc-800 ml-2">/ {filtered.length} st</span>
            </h2>
          </div>

          {loading ? (
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
              {filtered.map((r, i) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileTap={{ opacity: 0.7, scale: 0.99 }} transition={{ type: "spring", stiffness: 300, damping: 25 }}
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
                      
                      {r.isOpen === false && (
                        <div className="absolute inset-0 bg-obsidian/85 backdrop-blur-md flex items-center justify-center">
                          <span className="text-[10px] font-black text-rose-400 bg-rose-500/10 uppercase tracking-[0.2em] border border-rose-500/20 px-5 py-2.5 rounded-2xl shadow-lg">Stängt</span>
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
                          const fee    = zi ? Math.round(zi.deliveryFee / 100) : (r.deliveryFee ?? 0);
                          const minOrd = zi ? Math.round(zi.minOrder    / 100) : (r.minOrderAmount ?? 0);
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
              ))}
            </div>
          )}
        </section>

        {/* Info Modal Implementation */}
        <AnimatePresence>
          {infoRestaurant && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center bg-obsidian/95 backdrop-blur-md p-6" onClick={() => setInfoRestaurant(null)}>
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center bg-obsidian/95 backdrop-blur-md p-6" onClick={() => setClosedRestaurant(null)}>
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
