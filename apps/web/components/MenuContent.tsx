"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { io, Socket } from "socket.io-client";
import { Search, Loader2, Info, Sparkles, ChevronLeft, ChevronRight, MapPin, Phone, Clock, Bike, Store, Star, ShoppingBag, X, AlertTriangle } from "lucide-react";
import { API_URL, SOCKET_URL } from "@/lib/api";
import ProductModal from "@/components/ProductModal";
import FloatingCartButton from "@/components/FloatingCartButton";
import DealSpotlight from "@/components/DealSpotlight";
import { PublicDeal, formatDealReward } from "@/lib/deals";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AddressModal from "@/components/AddressModal";
import PreviouslyOrderedBar from "@/components/PreviouslyOrderedBar";
import DealBannerStrip from "@/components/DealBannerStrip";
import { useCartStore } from "@/store/cartStore";
import BogoPickerModal, { type BogoPickerProduct } from "@/components/BogoPickerModal";

interface MenuContentProps {
  restaurantSlug?: string;
  restaurantId?: string;
  isStandalone?: boolean;
}

const MenuContent = ({ restaurantSlug, restaurantId, isStandalone = false }: MenuContentProps) => {
  const [categories, setCategories] = useState<any[]>([]);
  const [deals, setDeals] = useState<PublicDeal[]>([]);
  const [restaurant, setRestaurant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  const [address, setAddress] = useState("");
  const [orderType, setOrderType] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<any>(null);
  // Zone check state
  const [zoneAvailable, setZoneAvailable] = useState<boolean | null>(null); // null = not checked yet
  const [checkingZone, setCheckingZone] = useState(false);

  const router = useRouter();

  const items = useCartStore((state) => state.items);
  const updateDeliveryOverride = useCartStore((state) => state.updateDeliveryOverride);
  const subtotal = useCartStore((state) => state.getTotal());
  const productIds = items.flatMap((item) => Array.from({ length: item.quantity }, () => item.productId));
  const bogoChoice = useCartStore((state) => state.bogoChoice);
  const setBogoChoice = useCartStore((state) => state.setBogoChoice);

  // BOGO picker state
  const [bogoPicker, setBogoPicker] = useState<{
    dealId: string;
    dealTitle: string;
    rewardCategoryName: string | null;
    products: BogoPickerProduct[];
  } | null>(null);

  // Track zone-availability in a ref so the socket handler always reads the latest value
  const zoneAvailableRef = useRef<boolean | null>(null);
  useEffect(() => { zoneAvailableRef.current = zoneAvailable; }, [zoneAvailable]);

  /**
   * Check delivery zone using validate-location (same endpoint as homepage).
   * - Gives consistent zone-specific fees (not affected by GPS missing on restaurant).
   * - validate-location only returns OPEN restaurants, so:
   *     • Open restaurant, address outside zone  → zoneAvailable = false  (show banner)
   *     • Closed restaurant, not in results      → zoneAvailable = null   (no banner)
   *     • Address outside all city zones         → zoneAvailable = false (only for open restaurants)
   * - Does NOT depend on deliveryOverrides to avoid an infinite update loop:
   *     updateDeliveryOverride → deliveryOverrides changes → checkZone recreated
   *     → fetchData recreated → useEffect refires → infinite loop.
   *   Instead, updateDeliveryOverride is a stable Zustand action reference.
   */
  const checkZone = useCallback(async (restaurantData: any): Promise<boolean | null> => {
    if (typeof window === "undefined") return null;
    const storedCoords = localStorage.getItem("platform_coords");
    const storedType = localStorage.getItem("platform_order_type") || "DELIVERY";
    if (!storedCoords || storedType !== "DELIVERY" || !restaurantData?.id) {
      setZoneAvailable(null);
      return null;
    }
    setCheckingZone(true);
    try {
      const coords = JSON.parse(storedCoords);
      // POST validate-location — same as homepage, gives authoritative zone fees
      const res = await axios.post(`${API_URL}/api/cities/validate-location`, {
        lat: coords.lat,
        lng: coords.lng,
      });

      if (!res.data.covered) {
        // Entire address is outside all city zones
        // Only flag as out-of-zone for open restaurants (closed ones show closed state instead)
        const result = restaurantData?.isOpen ? false : null;
        setZoneAvailable(result);
        return result;
      }

      const allRestaurants: any[] = (res.data.cities || []).flatMap((c: any) => c.restaurants || []);
      const thisRest = allRestaurants.find((r: any) => r.id === restaurantData.id);

      if (!thisRest) {
        // Not in results — either closed (filtered out by validate-location) or outside zone
        if (!restaurantData?.isOpen) {
          setZoneAvailable(null); // Closed: zone check not applicable
          return null;
        }
        setZoneAvailable(false); // Open but outside this restaurant's zone
        return false;
      }

      // In zone — fees are in öre from the API → convert to kr
      const fee = (thisRest.matchedZone?.deliveryFee ?? 0) / 100;
      const min = (thisRest.matchedZone?.minOrder ?? 0) / 100;

      setZoneAvailable(true);
      setRestaurant((prev: any) =>
        prev ? { ...prev, deliveryFee: fee, minOrderAmount: min } : null
      );
      // Update cart store so checkout shows the same zone fee
      // updateDeliveryOverride is a stable Zustand action — safe to call without adding to deps
      updateDeliveryOverride(restaurantData.id, fee, min);
      return true;
    } catch {
      setZoneAvailable(null); // fail open
      return null;
    } finally {
      setCheckingZone(false);
    }
  // ↓ Only stable Zustand action — no deliveryOverrides in deps (prevents infinite loop)
  }, [updateDeliveryOverride]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params: any = {};
      if (restaurantId) params.restaurantId = restaurantId;
      if (restaurantSlug) params.slug = restaurantSlug;
      const menuParams = { ...params, v: "20260428" };

      const [menuRes, restaurantRes, dealsRes] = await Promise.all([
        axios.get(`${API_URL}/api/menu/categories`, { params: menuParams }),
        restaurantSlug ? axios.get(`${API_URL}/api/restaurants/${restaurantSlug}`) : Promise.resolve({ data: null }),
        axios.get(`${API_URL}/api/deals`, { params: restaurantId ? { restaurantId } : restaurantSlug ? { slug: restaurantSlug } : {} }),
      ]);

      setCategories(menuRes.data);
      setDeals(dealsRes.data);
      if (restaurantRes.data) {
        setRestaurant(restaurantRes.data);
        // Run zone check after setting restaurant
        await checkZone(restaurantRes.data);
      } else {
        const settingsRes = await axios.get(`${API_URL}/api/settings`);
        setRestaurant({
          name: "MatGo Lund",
          isOpen: settingsRes.data.isOpen ?? true,
          deliveryFee: settingsRes.data.deliveryFee ?? 0,
          minOrderAmount: settingsRes.data.minOrderAmount ?? 150,
          etaMinutes: settingsRes.data.estimatedDeliveryTime ?? 35,
        });
      }

      if (menuRes.data.length > 0) setActiveCategory(menuRes.data[0].id);
    } catch (err) {
      console.error("Error fetching menu data:", err);
      setError("Kunde inte ladda menyn. Kontrollera din anslutning.");
    } finally {
      setLoading(false);
    }
  }, [restaurantId, restaurantSlug, checkZone]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("platform_address");
      if (stored) setAddress(stored);
      const storedType = localStorage.getItem("platform_order_type");
      if (storedType === "PICKUP" || storedType === "DELIVERY") setOrderType(storedType as "DELIVERY" | "PICKUP");
    }

    fetchData();

    const socket: Socket = io(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });

    socket.on("settings:updated", (nextSettings) => {
      const isGlobal = !nextSettings.slug && !nextSettings.restaurantId;
      const isMatch = nextSettings.slug === restaurantSlug || (restaurantId && nextSettings.restaurantId === restaurantId);
      
      if (isMatch || (isGlobal && !restaurantSlug)) {
        setRestaurant((prev: any) => {
          if (!prev) return prev;
          const zoneWasChecked = zoneAvailableRef.current === true;
          return {
            ...prev,
            isOpen: nextSettings.isOpen ?? prev.isOpen ?? true,
            // Don't overwrite zone-checked fee with socket base fee
            // (socket sends the restaurant's base fee; zone fee takes priority)
            deliveryFee: zoneWasChecked ? prev.deliveryFee : (nextSettings.deliveryFee ?? prev.deliveryFee ?? 0),
            minOrderAmount: zoneWasChecked ? prev.minOrderAmount : (nextSettings.minOrderAmount ?? prev.minOrderAmount ?? 150),
            etaMinutes: nextSettings.estimatedDeliveryTime ?? nextSettings.etaMinutes ?? prev.etaMinutes ?? 35,
          };
        });
      }
    });

    return () => { socket.disconnect(); };
  }, [restaurantSlug, restaurantId, fetchData]);

  // Måste definieras FÖRE early returns — Rules of Hooks
  const checkBogoTrigger = useCallback(() => {
    const bogoDeal = deals.find((d) => d.triggerType === "BOGO_CATEGORY");
    if (!bogoDeal) return;

    const currentItems = useCartStore.getState().items;
    const existingChoice = useCartStore.getState().bogoChoice;
    if (existingChoice?.dealId === bogoDeal.id) return;

    const needed = bogoDeal.triggerQuantity ?? 2;
    let triggered = false;

    if (bogoDeal.bogoTriggerProductIds && bogoDeal.bogoTriggerProductIds.length > 0) {
      const count = currentItems
        .filter((i) => bogoDeal.bogoTriggerProductIds!.includes(i.productId))
        .reduce((s, i) => s + i.quantity, 0);
      triggered = count >= needed;
    } else if (bogoDeal.triggerCategoryId) {
      const catProducts = new Set(
        (categories.find((c) => c.id === bogoDeal.triggerCategoryId)?.products ?? []).map((p: any) => p.id)
      );
      const count = currentItems
        .filter((i) => catProducts.has(i.productId))
        .reduce((s, i) => s + i.quantity, 0);
      triggered = count >= needed;
    } else if (bogoDeal.bogoMinOrderAmountOre) {
      triggered = useCartStore.getState().getTotal() * 100 >= bogoDeal.bogoMinOrderAmountOre;
    }

    if (!triggered) return;

    const rewardCatId = bogoDeal.rewardCategoryId || bogoDeal.triggerCategoryId;
    const allowedRewardIds = new Set(bogoDeal.bogoRewardProductIds ?? []);
    let rewardProducts: BogoPickerProduct[] = [];
    let rewardCategoryName: string | null = null;

    const applyWhitelist = (prods: BogoPickerProduct[]) =>
      allowedRewardIds.size > 0 ? prods.filter((p) => allowedRewardIds.has(p.id)) : prods;

    if (rewardCatId) {
      const cat = categories.find((c) => c.id === rewardCatId);
      if (cat) {
        rewardCategoryName = cat.name;
        rewardProducts = applyWhitelist(
          (cat.products ?? []).map((p: any) => ({ id: p.id, name: p.name, price: p.price, imageUrl: p.imageUrl ?? null }))
        );
      }
    } else {
      rewardProducts = applyWhitelist(
        categories.flatMap((c) =>
          (c.products ?? []).map((p: any) => ({ id: p.id, name: p.name, price: p.price, imageUrl: p.imageUrl ?? null }))
        )
      );
    }

    if (rewardProducts.length === 0) return;
    setBogoPicker({ dealId: bogoDeal.id, dealTitle: bogoDeal.title, rewardCategoryName, products: rewardProducts });
  }, [deals, categories]);

  const filteredCategories = categories
    .map((cat) => ({
      ...cat,
      products: cat.products.filter(
        (p: any) =>
          p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.description?.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    }))
    .filter((cat) => cat.products.length > 0);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="w-12 h-12 rounded-2xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center">
          <Loader2 className="animate-spin text-gold-500" size={24} />
        </div>
        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.4em] text-gold-500/60 animate-pulse">Laddar Menyn</p>
      </div>
    );
  }

  if (error || (!restaurant && !loading)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="w-20 h-20 bg-rose-500/10 rounded-[2.5rem] border border-rose-500/20 flex items-center justify-center mb-8">
          <X size={40} className="text-rose-500" />
        </div>
        <h2 className="text-2xl font-black uppercase italic tracking-tight mb-2" style={{ color: "var(--text-primary)" }}>Ett fel uppstod</h2>
        <p className="text-xs font-bold uppercase tracking-widest mb-10 max-w-sm" style={{ color: "var(--text-secondary)" }}>{error || "Restaurangen hittades inte"}</p>
        <Link href="/" className="px-10 py-5 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all">Gå Hem</Link>
      </div>
    );
  }

  const restaurantDisplayTitle = restaurant?.name || "Laddar...";
  const titleParts = restaurantDisplayTitle.split(" ");
  const firstWord = titleParts[0];
  const restOfTitle = titleParts.slice(1).join(" ");

  const heroImage = restaurant?.heroImageUrl || restaurant?.imageUrl;

  return (
    <div className="pb-32 selection:bg-gold-500/30" style={{ backgroundColor: "var(--bg-primary)" }}>
      {/* Dynamic Cover Image with Parallax-ish feel */}
      <div className="relative w-full h-[50vh] overflow-hidden">
        {heroImage ? (
           <img src={heroImage} alt={restaurant?.name} className="w-full h-full object-cover scale-105" />
        ) : (
           <div className="w-full h-full bg-gradient-to-b" style={{ backgroundImage: "linear-gradient(to bottom, var(--bg-deep), var(--bg-primary))" }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t" style={{ background: "linear-gradient(to top, var(--bg-primary), rgba(252,252,249,0.4), transparent)" }} />
        
        {/* Glass Back Button */}
        <Link
          href="/"
          className="absolute top-8 left-6 glass-panel px-5 py-3 rounded-2xl flex items-center gap-2 group transition-all opacity-90 hover:opacity-100 active:scale-95 shadow-sm"
          style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)" }}
        >
          <ChevronLeft size={16} className="text-gold-500 group-hover:-translate-x-1 transition-transform" />
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--text-primary)" }}>Tillbaka</span>
        </Link>

         {/* Header Content in Overlap */}
         <div className="absolute bottom-10 left-0 w-full px-4 sm:px-6 lg:px-12 flex flex-col lg:flex-row lg:items-end justify-between gap-6 sm:gap-8">
           <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="flex-1">
               <div className="flex items-center gap-2 sm:gap-4 mb-3">
                <h1 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tight uppercase leading-[0.8] italic" style={{ color: "var(--text-primary)" }}>
                     {firstWord}{" "}
                     <span className="text-gold-gradient">{restOfTitle}</span>
                  </h1>
                 <div className={`px-4 py-1.5 rounded-full border-[1px] flex items-center gap-2 ${restaurant?.isOpen ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : "border-rose-500/30 bg-rose-500/10 text-rose-600"}`}>
                    <div className={`w-1 h-1 rounded-full ${restaurant?.isOpen ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                    <span className="text-[9px] font-black uppercase tracking-[0.2em]">{restaurant?.isOpen ? "Öppen" : "Stängd"}</span>
                 </div>
              </div>
         <div className="flex items-center gap-3 sm:gap-5 flex-wrap">
            <p className="text-[9px] sm:text-[10px] font-black uppercase italic tracking-widest" style={{ color: "var(--text-secondary)" }}>{restaurant.cuisine || "Restaurang"}</p>
                  <Link href={`/r/${restaurantSlug || restaurant.slug}/reviews`} className="flex items-center gap-1.5 text-gold-500 font-bold italic text-[10px] sm:text-[11px] hover:opacity-75 transition-opacity">
                     <Star size={12} className="fill-gold-500" />
                     {(restaurant.rating || 4.6).toFixed(1)}
                     <span className="font-black ml-1" style={{ color: "var(--text-secondary)", opacity: 0.4 }}>({restaurant.ratingCount || 120})</span>
                     <ChevronRight size={10} className="opacity-40" />
                  </Link>
              </div>
           </motion.div>

<motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => setShowInfoModal(true)} className="glass-panel px-3 py-2.5 sm:px-6 sm:py-4 rounded-2xl sm:rounded-3xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 sm:gap-3 shadow-sm hover:bg-gold-500/5 transition-all" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)", color: "var(--text-primary)" }}>
                   <Info size={14} className="text-gold-500/60" /> <span className="hidden xs:inline">Info</span>
                </motion.button>
                {restaurant.phone && (
                   <motion.a whileTap={{ scale: 0.95 }} href={`tel:${String(restaurant.phone).replace(/\s+/g, "")}`} className="bg-gold-500 px-3 py-2.5 sm:px-6 sm:py-4 rounded-2xl sm:rounded-3xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-zinc-950 flex items-center gap-1.5 sm:gap-3 shadow-xl hover:bg-gold-400 transition-all">
                      <Phone size={14} /> Kontakt
                   </motion.a>
                )}
             </motion.div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 lg:px-12 pt-12 relative">

        {/* Out-of-zone banner — only shown for OPEN restaurants; closed ones are handled by the closed state */}
        <AnimatePresence>
          {zoneAvailable === false && restaurant?.isOpen && orderType === "DELIVERY" && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 p-6 rounded-[2rem] bg-rose-500/10 border border-rose-500/30 flex flex-col sm:flex-row items-start sm:items-center gap-4"
            >
              <div className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} className="text-rose-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-black uppercase tracking-widest text-rose-600 mb-1">
                  Levererar inte till din adress
                </p>
                <p className="text-[11px] font-bold text-rose-600/70 leading-relaxed">
                  {address
                    ? `Den här restaurangen levererar tyvärr inte till "${address}".`
                    : "Den här restaurangen levererar tyvärr inte till din adress."}{" "}
                  Ange en ny adress eller gå tillbaka till startsidan.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => setShowAddressModal(true)}
                  className="px-4 py-2.5 bg-rose-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-rose-600 transition-all active:scale-95"
                >
                  Ny adress
                </button>
                <Link
                  href="/"
                  className="px-4 py-2.5 bg-rose-500/20 border border-rose-500/30 text-rose-700 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-rose-500/30 transition-all"
                >
                  Tillbaka
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Infobanner — admin-konfigurerbar text per restaurang */}
        {restaurant?.announcementText ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-5 py-4"
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
            <p className="text-[12px] font-bold leading-relaxed text-amber-700 dark:text-amber-400">
              {restaurant.announcementText}
            </p>
          </motion.div>
        ) : null}

        {/* Aktuella deal-banners för den här restaurangen */}
        {(restaurantSlug || restaurant?.slug) ? (
          <div className="mb-5 -mx-4 sm:-mx-6">
            <DealBannerStrip slug={restaurantSlug || restaurant?.slug} />
          </div>
        ) : null}

        {/* Previously ordered bar (inloggade kunder) */}
        {restaurant?.id && (
          <PreviouslyOrderedBar restaurantId={restaurant.id} restaurantSlug={restaurantSlug || restaurant.slug} />
        )}

         {/* Quick Stats Grid */}
         <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-12 sm:mb-16">
           <div className="rounded-[2rem] p-6 text-center flex flex-col items-center justify-center gap-2 group hover:border-gold-500/20 transition-all" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", boxShadow: "var(--card-shadow)" }}>
              <Bike size={18} className="text-gold-500/40 group-hover:text-gold-500 transition-colors" />
              <div className="text-[8px] font-black uppercase tracking-[0.3em]" style={{ color: "var(--text-secondary)" }}>Avgift</div>
               <div className="text-sm font-black italic uppercase tracking-tighter" style={{ color: "var(--text-primary)" }}>
                 {(zoneAvailable === false && restaurant?.isOpen)
                   ? "–"
                   : (restaurant.deliveryFee === 0 ? "GRATIS" : `${restaurant.deliveryFee} KR`)}
               </div>
           </div>
           <div className="rounded-[2rem] p-6 text-center flex flex-col items-center justify-center gap-2 group hover:border-gold-500/20 transition-all" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", boxShadow: "var(--card-shadow)" }}>
              <Clock size={18} className="text-gold-500/40 group-hover:text-gold-500 transition-colors" />
              <div className="text-[8px] font-black uppercase tracking-[0.3em]" style={{ color: "var(--text-secondary)" }}>Väntetid</div>
              <div className="text-sm font-black italic uppercase tracking-tighter" style={{ color: "var(--text-primary)" }}>~{restaurant.etaMinutes} MIN</div>
           </div>
           <div className="rounded-[2rem] p-6 text-center flex flex-col items-center justify-center gap-2 group hover:border-gold-500/20 transition-all" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", boxShadow: "var(--card-shadow)" }}>
              <Store size={18} className="text-gold-500/40 group-hover:text-gold-500 transition-colors" />
              <div className="text-[8px] font-black uppercase tracking-[0.3em]" style={{ color: "var(--text-secondary)" }}>Minsta Order</div>
              <div className="text-sm font-black italic uppercase tracking-tighter" style={{ color: "var(--text-primary)" }}>{restaurant.minOrderAmount} KR</div>
           </div>
        </div>

        {/* Sticky Search */}
        <div className="sticky top-0 z-40 mb-2">
          <div className="rounded-[2.5rem] p-2 shadow-xl" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
            <div className="relative group">
              <Search size={16} className="absolute left-6 top-1/2 -translate-y-1/2 group-focus-within:text-gold-500 transition-colors" style={{ color: "var(--text-secondary)" }} />
              <input
                type="text"
                placeholder="Vad är du sugen på?"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full border-none rounded-[2rem] py-3 sm:py-4 pl-12 sm:pl-14 pr-4 sm:pr-6 text-xs font-bold focus:ring-0 focus:outline-none transition-all placeholder:text-zinc-400"
                style={{ backgroundColor: "var(--bg-deep)", color: "var(--text-primary)" }}
              />
            </div>
          </div>
        </div>

        {/* Sticky Categories — breaks out of parent px-6 so scroll is never clipped */}
        {categories.length > 0 && (
          <div className="sticky z-40 mb-16 -mx-6 lg:-mx-12" style={{ top: "3.5rem" }}>
            <div
              className="flex gap-2 no-scrollbar px-6 lg:px-12"
              style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" as any, paddingRight: "1.5rem" }}
            >
              {categories.map(cat => (
                <motion.button
                  key={cat.id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setActiveCategory(cat.id);
                    const element = document.getElementById(cat.id);
                    if (element) {
                      const offset = 120;
                      window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - offset, behavior: "smooth" });
                    }
                  }}
                  className={`px-5 py-3 rounded-[2rem] text-[10px] font-black uppercase tracking-wider transition-all shrink-0 whitespace-nowrap ${
                    activeCategory === cat.id
                      ? "bg-gold-500 text-zinc-950 shadow-lg shadow-gold-500/20"
                      : "text-zinc-400 hover:text-zinc-600"
                  }`}
                  style={activeCategory === cat.id ? {} : { backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
                >
                  {cat.name}
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* Discounted Products Rail */}
        {(() => {
          const discountedProducts = filteredCategories
            .flatMap(cat => cat.products)
            .filter((p: any) => p.discountActive && p.discountScope === "PRODUCT");
          if (discountedProducts.length === 0) return null;
          return (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 px-4">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-gold-500">REKOMMENDERAS</span>
                <div className="h-px bg-gold-500/20 flex-1" />
              </div>
              <div className="flex gap-4 overflow-x-auto no-scrollbar py-2">
                {discountedProducts.map((p: any) => (
                  <motion.div
                    key={p.id}
                    onClick={() => {
                      if (!restaurant?.isOpen) return;
                      if (zoneAvailable === false) {
                        window.scrollTo({ top: 0, behavior: "smooth" });
                        return;
                      }
                      if (!address.trim() || orderType === "DELIVERY" && !localStorage.getItem("platform_coords")) {
                        setPendingProduct(p);
                        setShowAddressModal(true);
                      } else {
                        setSelectedProduct(p);
                      }
                    }}
                    whileTap={{ scale: 0.95 }}
                    className="shrink-0 w-56 rounded-2xl p-4 flex items-center gap-4 transition-all cursor-pointer shadow-sm"
                    style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid rgba(231,178,75,0.2)" }}
                  >
                    {p.imageUrl && (
                      <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0">
                        <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-black uppercase italic truncate leading-none mb-1" style={{ color: "var(--text-primary)" }}>{p.name}</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-zinc-500 line-through">{p.price} KR</span>
                        <span className="text-[11px] font-black text-gold-500">{p.discountPrice || p.price - (p.price * (p.discountPercent || 0) / 100)} KR</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          );
        })()}

        {/* Menu Sections Grid */}
        <div className="space-y-24">
           {filteredCategories.length === 0 ? (
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 flex flex-col items-center justify-center text-center">
               <div className="w-20 h-20 rounded-[2.5rem] flex items-center justify-center mb-6 shadow-sm" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)" }}>
                 <ShoppingBag size={32} className="text-gold-500/50" />
               </div>
               <h3 className="text-2xl font-black uppercase tracking-widest italic mb-2" style={{ color: "var(--text-primary)" }}>Ingen meny ännu</h3>
               <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs max-w-sm">
                 Vi har inte lagt till några rätter ännu. Kom tillbaka senare eller kontakta oss!
               </p>
             </motion.div>
           ) : (
             filteredCategories.map((cat, catIdx) => (
                <motion.section 
                   key={cat.id} 
                   id={cat.id} 

                 initial={{ opacity: 0, y: 20 }}
                 whileInView={{ opacity: 1, y: 0 }}
                 viewport={{ once: true }}
                 transition={{ delay: catIdx * 0.1 }}
              >
                 <div className="flex items-center justify-between mb-10 px-4">
                    <h2 className="text-3xl font-black tracking-tight uppercase italic leading-none" style={{ color: "var(--text-primary)" }}>
                       {cat.name}
                    </h2>
                    <div className="h-px bg-zinc-200 flex-1 mx-8 hidden lg:block" />
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
                    {cat.products.map((p: any) => (
                        <motion.div
                           key={p.id}
                           onClick={() => {
                              if (!restaurant?.isOpen) return;
                              if (zoneAvailable === false) {
                                 // Scroll to the out-of-zone banner
                                 window.scrollTo({ top: 0, behavior: "smooth" });
                                 return;
                              }
                              if (!address.trim() || orderType === "DELIVERY" && !localStorage.getItem("platform_coords")) {
                                 setPendingProduct(p);
                                 setShowAddressModal(true);
                              } else {
                                 setSelectedProduct(p);
                              }
                           }}
                           whileTap={{ scale: 0.99 }} className={`group rounded-[2.5rem] p-5 flex items-center gap-6 transition-all ${!restaurant?.isOpen ? "opacity-50 grayscale cursor-not-allowed" : (restaurant?.isOpen && zoneAvailable === false) ? "opacity-40 grayscale-[60%] cursor-not-allowed pointer-events-none" : "cursor-pointer"}`}
                           style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", boxShadow: "var(--card-shadow)" }}
                       >
                           {p.imageUrl && (
                              <div className="w-24 h-24 rounded-[1.8rem] overflow-hidden shrink-0 relative" style={{ backgroundColor: "var(--bg-deep)" }}>
                                 <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover transition-all duration-700 group-hover:scale-110" />
                                 <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                           )}
                          <div className="flex-1 min-w-0 py-2">
<div className="flex items-start justify-between gap-4 mb-2">
                                 <h3 className="text-base font-black group-hover:text-gold-500 transition-colors uppercase italic truncate leading-none" style={{ color: "var(--text-primary)" }}>{p.name}</h3>
                                  {p.discountActive ? (
                                    <div className="flex flex-col items-end">
                                      <span className="text-[9px] font-black text-zinc-400 line-through">{p.price} KR</span>
                                      <span className="text-[11px] font-black text-gold-500 whitespace-nowrap bg-gold-400/10 px-3 py-1.5 rounded-lg border border-gold-500/20">{p.discountPrice || Math.round(p.price - p.price * (p.discountPercent || 0) / 100)} KR</span>
                                    </div>
                                 ) : (
                                   <div className="text-[11px] font-black text-gold-500 whitespace-nowrap bg-gold-400/10 px-3 py-1.5 rounded-lg border border-gold-500/20">{p.price} KR</div>
                                 )}
                              </div>
                             <p className="text-[10px] line-clamp-2 leading-relaxed font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-secondary)" }}>{p.description}</p>
                             
                             <div className="flex items-center gap-1.5 opacity-40">
                                {p.isVegan && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                                {p.isVegetarian && <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                                {p.isGlutenFree && <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                             </div>
                          </div>
                       </motion.div>
                    ))}
                 </div>
              </motion.section>
             ))
           )}
        </div>
      </div>

      {/* Overlays / Modals */}
      <AnimatePresence>
        {selectedProduct && (
          <ProductModal
            product={selectedProduct}
            restaurantId={restaurant?.id || ""}
            restaurantSlug={restaurantSlug}
            onClose={() => {
              setSelectedProduct(null);
              // Kontrollera om BOGO-deal triggas efter att produkten lagts i korgen
              setTimeout(() => checkBogoTrigger(), 50);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {bogoPicker && (
          <BogoPickerModal
            dealId={bogoPicker.dealId}
            dealTitle={bogoPicker.dealTitle}
            restaurantId={restaurant?.id || ""}
            rewardCategoryName={bogoPicker.rewardCategoryName}
            products={bogoPicker.products}
            onClose={() => setBogoPicker(null)}
          />
        )}
      </AnimatePresence>

       <AnimatePresence>
        {showInfoModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/40 backdrop-blur-md p-6" onClick={() => setShowInfoModal(false)}>
            <motion.div initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm glass-panel p-10 rounded-[3.5rem] relative shadow-2xl" onClick={e => e.stopPropagation()} style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)" }}>
               <div className="w-16 h-16 bg-gold-500/10 rounded-[2rem] flex items-center justify-center mb-8 border border-gold-500/20 text-gold-500">
                  <Info size={32} />
               </div>
               <h2 className="text-3xl font-black uppercase italic mb-8" style={{ color: "var(--text-primary)" }}>Restaurang Info</h2>
               
               <div className="space-y-8">
                  {restaurant?.description && (
                    <div className="flex items-start gap-4">
                       <div className="min-w-0">
                          <div className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-400 mb-1">Beskrivning</div>
                          <p className="text-xs font-bold leading-relaxed uppercase tracking-wider italic" style={{ color: "var(--text-secondary)" }}>{restaurant.description}</p>
                       </div>
                    </div>
                  )}
                  {restaurant?.address && (
                    <div className="flex items-start gap-4">
                      <MapPin className="text-zinc-300 mt-1" size={18} />
                      <div className="min-w-0">
                        <div className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-400 mb-1">Hitta Hit</div>
                        <div className="text-sm font-black italic uppercase" style={{ color: "var(--text-primary)" }}>{restaurant.address}</div>
                        <div className="text-sm font-black italic uppercase opacity-40" style={{ color: "var(--text-secondary)" }}>{restaurant.zip} {restaurant.city}</div>
                      </div>
                    </div>
                  )}
                  {restaurant?.phone && (
                    <div className="flex items-start gap-4">
                      <Phone className="text-zinc-300 mt-1" size={18} />
                      <div className="min-w-0">
                        <div className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-400 mb-1">Ring Oss</div>
                        <a href={`tel:${restaurant.phone}`} className="text-lg font-black text-gold-500 hover:text-gold-600 transition-colors uppercase italic">{restaurant.phone}</a>
                      </div>
                    </div>
                  )}
               </div>

               <button onClick={() => setShowInfoModal(false)} className="absolute top-10 right-10 text-zinc-400 hover:text-zinc-600 transition-colors">
                  <X size={24} />
               </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AddressModal
        isOpen={showAddressModal}
        onClose={() => { setShowAddressModal(false); setPendingProduct(null); }}
        onConfirm={async (newAddress, newOrderType, coords, postalCode, city) => {
          setAddress(newAddress);
          setOrderType(newOrderType);
          if (typeof window !== "undefined") {
            localStorage.setItem("platform_address", newAddress);
            localStorage.setItem("platform_order_type", newOrderType);
            if (coords) {
              localStorage.setItem("platform_coords", JSON.stringify(coords));
              const { rememberQuickAddress } = await import("@/lib/quickAddresses");
              rememberQuickAddress({ street: newAddress.split(",")[0].trim(), latitude: coords.lat, longitude: coords.lng, zip: postalCode, city });
            }
          }
          setShowAddressModal(false);
          // Re-check zone — checkZone returns the result directly (avoids stale state)
          let zoneOk: boolean | null = null;
          if (restaurant && newOrderType === "DELIVERY") {
            zoneOk = await checkZone(restaurant);
          } else {
            setZoneAvailable(null);
            zoneOk = null;
          }
          // Only open product modal if zone check didn't fail
          if (pendingProduct && zoneOk !== false) {
            setSelectedProduct(pendingProduct);
          }
          setPendingProduct(null);
        }}
        orderType={orderType}
        setOrderType={setOrderType}
      />

      {/* DealSpotlight på restaurang-sidan borttagen — användaren ska bara
          se discountade priser direkt i menyn, inte en separat banner. */}
      <FloatingCartButton />
    </div>
  );
};

export default MenuContent;
