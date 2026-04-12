"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { io, Socket } from "socket.io-client";
import { Search, Loader2, Info, Sparkles, ChevronLeft, MapPin, Phone, Clock, Bike, Store, Star, ShoppingBag, X } from "lucide-react";
import { API_URL, SOCKET_URL } from "@/lib/api";
import ProductModal from "@/components/ProductModal";
import FloatingCartButton from "@/components/FloatingCartButton";
import DealSpotlight from "@/components/DealSpotlight";
import { PublicDeal, formatDealReward } from "@/lib/deals";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AddressModal from "@/components/AddressModal";
import { useCartStore } from "@/store/cartStore";

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

  const router = useRouter();

  const items = useCartStore((state) => state.items);
  const subtotal = useCartStore((state) => state.getTotal());
  const productIds = items.flatMap((item) => Array.from({ length: item.quantity }, () => item.productId));

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params: any = {};
      if (restaurantId) params.restaurantId = restaurantId;
      if (restaurantSlug) params.slug = restaurantSlug;

      const [menuRes, restaurantRes, dealsRes] = await Promise.all([
        axios.get(`${API_URL}/api/menu/categories`, { params }),
        restaurantSlug ? axios.get(`${API_URL}/api/restaurants/${restaurantSlug}`) : Promise.resolve({ data: null }),
        axios.get(`${API_URL}/api/deals`, { params: restaurantId ? { restaurantId } : restaurantSlug ? { slug: restaurantSlug } : {} }),
      ]);

      setCategories(menuRes.data);
      setDeals(dealsRes.data);
      if (restaurantRes.data) {
        if (typeof window !== "undefined") {
          const storedCoords = localStorage.getItem("platform_coords");
          const storedType = localStorage.getItem("platform_order_type") || "DELIVERY";
          if (storedCoords && storedType === "DELIVERY") {
            try {
              const coords = JSON.parse(storedCoords);
              const checkRes = await axios.get(`${API_URL}/api/delivery/check`, {
                params: { lat: coords.lat, lng: coords.lng, restaurantId: restaurantRes.data.id }
              });
              if (checkRes.data) {
                restaurantRes.data.deliveryFee = checkRes.data.deliveryFee ?? restaurantRes.data.deliveryFee;
                restaurantRes.data.minOrderAmount = checkRes.data.minOrder ?? restaurantRes.data.minOrderAmount;
              }
            } catch {}
          }
        }
        setRestaurant(restaurantRes.data);
      } else {
        const settingsRes = await axios.get(`${API_URL}/api/settings`);
        setRestaurant({
          name: "MatGo Lund",
          isOpen: settingsRes.data.isOpen ?? true,
          deliveryFee: settingsRes.data.deliveryFee ?? 49,
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
  }, [restaurantId, restaurantSlug]);

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
        setRestaurant((prev: any) => ({
          ...prev,
          isOpen: nextSettings.isOpen ?? prev?.isOpen ?? true,
          deliveryFee: nextSettings.deliveryFee ?? prev?.deliveryFee ?? 49,
          minOrderAmount: nextSettings.minOrderAmount ?? prev?.minOrderAmount ?? 150,
          etaMinutes: nextSettings.estimatedDeliveryTime ?? nextSettings.etaMinutes ?? prev?.etaMinutes ?? 35,
        }));
      }
    });

    return () => { socket.disconnect(); };
  }, [restaurantSlug, restaurantId, fetchData]);

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
      <div className="min-h-screen bg-obsidian flex flex-col items-center justify-center">
        <div className="w-12 h-12 rounded-2xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center">
          <Loader2 className="animate-spin text-gold-500" size={24} />
        </div>
        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.4em] text-gold-500/60 animate-pulse">Laddar Menyn</p>
      </div>
    );
  }

  if (error || (!restaurant && !loading)) {
    return (
      <div className="min-h-screen bg-obsidian flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-rose-500/10 rounded-[2.5rem] border border-rose-500/20 flex items-center justify-center mb-8">
          <X size={40} className="text-rose-500" />
        </div>
        <h2 className="text-2xl font-black uppercase italic tracking-tight text-white mb-2">Ett fel uppstod</h2>
        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-10 max-w-sm">{error || "Restaurangen hittades inte"}</p>
        <Link href="/" className="px-10 py-5 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all">Gå Hem</Link>
      </div>
    );
  }

  const heroImage = restaurant?.heroImageUrl || restaurant?.imageUrl;

  return (
    <div className="pb-32 bg-obsidian selection:bg-gold-500/30">
      {/* Dynamic Cover Image with Parallax-ish feel */}
      <div className="relative w-full h-[50vh] overflow-hidden">
        {heroImage ? (
           <img src={heroImage} alt={restaurant?.name} className="w-full h-full object-cover scale-105" />
        ) : (
           <div className="w-full h-full bg-gradient-to-b from-zinc-900 to-obsidian" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/40 to-transparent" />
        
        {/* Glass Back Button */}
        <Link
          href="/"
          whileTap={{ scale: 0.95 }} className="absolute top-8 left-6 glass-panel px-5 py-3 rounded-2xl flex items-center gap-2 group transition-all opacity-90 hover:opacity-100"
        >
          <ChevronLeft size={16} className="text-gold-500 group-hover:-translate-x-1 transition-transform" />
          <span className="text-[10px] font-black uppercase tracking-widest text-white">Tillbaka</span>
        </Link>

        {/* Header Content in Overlap */}
        <div className="absolute bottom-10 left-0 w-full px-6 lg:px-12 flex flex-col lg:flex-row lg:items-end justify-between gap-8">
           <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="flex-1">
              <div className="flex items-center gap-4 mb-3">
                 <h1 className="text-4xl md:text-6xl font-black tracking-tight uppercase leading-[0.8] text-white italic">
                    {restaurant.name.split(" ")[0]}{" "}
                    <span className="text-gold-gradient">{restaurant.name.split(" ").slice(1).join(" ")}</span>
                 </h1>
                 <div className={`px-4 py-1.5 rounded-full border-[1px] flex items-center gap-2 ${restaurant.isOpen ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-rose-500/30 bg-rose-500/10 text-rose-400"}`}>
                    <div className={`w-1 h-1 rounded-full ${restaurant.isOpen ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`} />
                    <span className="text-[9px] font-black uppercase tracking-[0.2em]">{restaurant.isOpen ? "Öppen" : "Stängd"}</span>
                 </div>
              </div>
        <div className="flex items-center gap-5 flex-wrap">
           <p className="text-[10px] font-black uppercase italic tracking-widest text-white/40">{restaurant.cuisine || "Restaurang"}</p>
                 <div className="flex items-center gap-1.5 text-gold-500 font-bold italic text-[11px]">
                    <Star size={12} className="fill-gold-500" />
                    {(restaurant.rating || 4.6).toFixed(1)}
                    <span className="text-white/20 font-black ml-1">({restaurant.ratingCount || 120})</span>
                 </div>
              </div>
           </motion.div>

<motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3">
               <motion.button whileTap={{ scale: 0.95 }} onClick={() => setShowInfoModal(true)} className="glass-panel px-6 py-4 rounded-3xl text-[10px] font-black uppercase tracking-widest text-white flex items-center gap-3 hover:bg-white/5 shadow-xl transition-all">
                  <Info size={16} className="text-gold-500/60" /> Info
               </motion.button>
               {restaurant.phone && (
                  <motion.a whileTap={{ scale: 0.95 }} href={`tel:${String(restaurant.phone).replace(/\s+/g, "")}`} className="bg-gold-500 px-6 py-4 rounded-3xl text-[10px] font-black uppercase tracking-widest text-zinc-950 flex items-center gap-3 shadow-xl hover:bg-gold-400 transition-all">
                     <Phone size={16} /> Kontakt
                  </motion.a>
               )}
            </motion.div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 lg:px-12 pt-12 relative">

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-3 gap-3 mb-16">
           <div className="glass-panel rounded-[2rem] p-6 text-center flex flex-col items-center justify-center gap-2 group hover:border-gold-500/20 transition-all">
              <Bike size={18} className="text-gold-500/40 group-hover:text-gold-500 transition-colors" />
              <div className="text-[8px] font-black uppercase tracking-[0.3em] text-zinc-600">Avgift</div>
              <div className="text-sm font-black text-white italic uppercase tracking-tighter">{restaurant.deliveryFee} KR</div>
           </div>
           <div className="glass-panel rounded-[2rem] p-6 text-center flex flex-col items-center justify-center gap-2 group hover:border-gold-500/20 transition-all">
              <Clock size={18} className="text-gold-500/40 group-hover:text-gold-500 transition-colors" />
              <div className="text-[8px] font-black uppercase tracking-[0.3em] text-zinc-600">Väntetid</div>
              <div className="text-sm font-black text-white italic uppercase tracking-tighter">~{restaurant.etaMinutes} MIN</div>
           </div>
           <div className="glass-panel rounded-[2rem] p-6 text-center flex flex-col items-center justify-center gap-2 group hover:border-gold-500/20 transition-all">
              <Store size={18} className="text-gold-500/40 group-hover:text-gold-500 transition-colors" />
              <div className="text-[8px] font-black uppercase tracking-[0.3em] text-zinc-600">Minsta Order</div>
              <div className="text-sm font-black text-white italic uppercase tracking-tighter">{restaurant.minOrderAmount} KR</div>
           </div>
        </div>

        {/* Sticky Search & Categories Navigation */}
        <div className="sticky top-6 z-40 mb-16">
           <div className="glass-panel rounded-[2.5rem] p-2 flex items-center gap-3 shadow-2xl border-white/5">
              <div className="relative flex-1 group">
                 <Search size={16} className="absolute left-6 top-1/2 -translate-y-1/2 text-zinc-700 group-focus-within:text-gold-500 transition-colors" />
                 <input 
                    type="text" 
                    placeholder="Vad är du sugen på?" 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full bg-zinc-950/40 border-none rounded-[2rem] py-4 pl-14 pr-6 text-xs font-bold text-white focus:ring-0 focus:outline-none transition-all placeholder:text-zinc-800"
                 />
              </div>
<div className="flex gap-2 overflow-x-auto no-scrollbar pr-2 whitespace-nowrap">
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
                        className={`px-6 py-4 rounded-[2rem] text-[10px] font-black uppercase tracking-widest transition-all ${activeCategory === cat.id ? "bg-gold-500 text-zinc-950 shadow-lg shadow-gold-500/20" : "text-zinc-600 hover:text-zinc-300 hover:bg-white/5"}`}
                     >
                        {cat.name}
                     </motion.button>
                  ))}
               </div>
           </div>
        </div>

        {/* Menu Sections Grid */}
        <div className="space-y-24">
           {filteredCategories.length === 0 ? (
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 flex flex-col items-center justify-center text-center">
               <div className="w-20 h-20 bg-zinc-900 border border-white/10 rounded-[2.5rem] flex items-center justify-center mb-6 shadow-2xl">
                 <ShoppingBag size={32} className="text-zinc-600" />
               </div>
               <h3 className="text-2xl font-black uppercase text-white tracking-widest italic mb-2">Ingen meny ännu</h3>
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
                    <h2 className="text-3xl font-black tracking-tight text-white uppercase italic leading-none truncate max-w-[200px] lg:max-w-none">
                       {cat.name}
                    </h2>
                    <div className="h-px bg-white/5 flex-1 mx-8 hidden lg:block" />
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
                    {cat.products.map((p: any) => (
                       <motion.div
                          key={p.id}
                          onClick={() => {
                             if (!restaurant?.isOpen) return;
                             if (!address.trim()) {
                                setPendingProduct(p);
                                setShowAddressModal(true);
                             } else {
                                setSelectedProduct(p);
                             }
                          }}
                          whileTap={{ scale: 0.99 }} className={`group glass-card rounded-[2.5rem] p-5 flex items-center gap-6 transition-all ${!restaurant?.isOpen ? "opacity-50 grayscale cursor-not-allowed" : "cursor-pointer"}`}
                       >
                          {p.imageUrl && (
                             <div className="w-24 h-24 rounded-[1.8rem] overflow-hidden bg-zinc-950/50 shrink-0 relative">
                                <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover transition-all duration-700 group-hover:scale-110" />
                                <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                             </div>
                          )}
                          <div className="flex-1 min-w-0 py-2">
                             <div className="flex items-start justify-between gap-4 mb-2">
                                <h3 className="text-base font-black text-white group-hover:text-gold-500 transition-colors uppercase italic truncate leading-none">{p.name}</h3>
                                <div className="text-[11px] font-black text-gold-500 whitespace-nowrap bg-gold-400/10 px-3 py-1.5 rounded-lg border border-gold-500/20">{p.price} KR</div>
                             </div>
                             <p className="text-zinc-600 text-[10px] line-clamp-2 leading-relaxed font-bold uppercase tracking-widest mb-4">{p.description}</p>
                             
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
            onClose={() => setSelectedProduct(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showInfoModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-obsidian/95 backdrop-blur-md p-6" onClick={() => setShowInfoModal(false)}>
            <motion.div initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm glass-panel p-10 rounded-[3.5rem] relative" onClick={e => e.stopPropagation()}>
               <div className="w-16 h-16 bg-gold-500/10 rounded-[2rem] flex items-center justify-center mb-8 border border-gold-500/20 text-gold-500">
                  <Info size={32} />
               </div>
               <h2 className="text-3xl font-black uppercase italic text-white mb-8">Restaurang Info</h2>
               
               <div className="space-y-8">
                  {restaurant.description && (
                    <div className="flex items-start gap-4">
                       <div className="min-w-0">
                          <div className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-600 mb-1">Beskrivning</div>
                          <p className="text-xs font-bold text-white/60 leading-relaxed uppercase tracking-wider italic">{restaurant.description}</p>
                       </div>
                    </div>
                  )}
                  {restaurant.address && (
                    <div className="flex items-start gap-4">
                      <MapPin className="text-zinc-700 mt-1" size={18} />
                      <div className="min-w-0">
                        <div className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-600 mb-1">Hitta Hit</div>
                        <div className="text-sm font-black text-white italic uppercase">{restaurant.address}</div>
                        <div className="text-sm font-black text-white italic uppercase opacity-40">{restaurant.zip} {restaurant.city}</div>
                      </div>
                    </div>
                  )}
                  {restaurant.phone && (
                    <div className="flex items-start gap-4">
                      <Phone className="text-zinc-700 mt-1" size={18} />
                      <div className="min-w-0">
                        <div className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-600 mb-1">Ring Oss</div>
                        <a href={`tel:${restaurant.phone}`} className="text-lg font-black text-gold-500 hover:text-gold-400 transition-colors">{restaurant.phone}</a>
                      </div>
                    </div>
                  )}
               </div>

               <button onClick={() => setShowInfoModal(false)} className="absolute top-10 right-10 text-zinc-700 hover:text-white transition-colors">
                  <X size={24} />
               </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AddressModal
        isOpen={showAddressModal}
        onClose={() => { setShowAddressModal(false); setPendingProduct(null); }}
        onConfirm={(newAddress, newOrderType) => {
          setAddress(newAddress);
          setOrderType(newOrderType);
          if (typeof window !== "undefined") {
            localStorage.setItem("platform_address", newAddress);
            localStorage.setItem("platform_order_type", newOrderType);
          }
          setShowAddressModal(false);
          if (pendingProduct) {
            setSelectedProduct(pendingProduct);
            setPendingProduct(null);
          }
        }}
        orderType={orderType}
        setOrderType={setOrderType}
      />

      <DealSpotlight deals={deals.filter(d => d.popupEnabled)} subtotal={subtotal} productIds={productIds} floating />
      <FloatingCartButton />
    </div>
  );
};

export default MenuContent;
