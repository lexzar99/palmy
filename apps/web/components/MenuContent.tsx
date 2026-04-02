"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { io, Socket } from "socket.io-client";
import { Search, Loader2, Info, Sparkles, ChevronLeft } from "lucide-react";
import { API_URL, SOCKET_URL } from "@/lib/api";
import ProductModal from "@/components/ProductModal";
import FloatingCartButton from "@/components/FloatingCartButton";
import DealSpotlight from "@/components/DealSpotlight";
import { useCartStore } from "@/store/cartStore";
import { PublicDeal, formatDealReward } from "@/lib/deals";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";

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
  
  const items = useCartStore((state) => state.items);
  const subtotal = useCartStore((state) => state.getTotal());
  const productIds = items.flatMap((item) => Array.from({ length: item.quantity }, () => item.productId));

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch categories for this specific restaurant
        const params: any = {};
        if (restaurantId) params.restaurantId = restaurantId;
        if (restaurantSlug) params.slug = restaurantSlug;

        const [menuRes, restaurantRes, dealsRes] = await Promise.all([
          axios.get(`${API_URL}/api/menu/categories`, { params }),
          restaurantSlug ? axios.get(`${API_URL}/api/restaurants/${restaurantSlug}`) : Promise.resolve({ data: null }),
          axios.get(`${API_URL}/api/deals`),
        ]);

        setCategories(menuRes.data);
        setDeals(dealsRes.data);
        if (restaurantRes.data) {
          setRestaurant(restaurantRes.data);
        } else {
          // Fallback to global settings if no specific restaurant
          const settingsRes = await axios.get(`${API_URL}/api/settings`);
          setRestaurant({
            name: "Palmyra Lund",
            isOpen: settingsRes.data.isOpen ?? true,
            deliveryFee: settingsRes.data.deliveryFee ?? 49,
            minOrderAmount: settingsRes.data.minOrderAmount ?? 150,
            etaMinutes: settingsRes.data.estimatedDeliveryTime ?? 35,
          });
        }

        if (menuRes.data.length > 0) setActiveCategory(menuRes.data[0].id);
      } catch (err) {
        console.error("Error fetching menu data:", err);
        setError("Kunde inte ladda menyn. Kontrollera din anslutning eller försök igen senare.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    const socket: Socket = io(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });

    socket.on("settings:updated", (nextSettings) => {
      if (!restaurantSlug || restaurantSlug === 'palmyra') {
        setRestaurant((prev: any) => ({
          ...prev,
          isOpen: nextSettings.isOpen ?? true,
          deliveryFee: nextSettings.deliveryFee ?? 49,
          minOrderAmount: nextSettings.minOrderAmount ?? 150,
          etaMinutes: nextSettings.estimatedDeliveryTime ?? 35,
        }));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [restaurantSlug, restaurantId]);

  const filteredCategories = categories.map(cat => ({
    ...cat,
    products: cat.products.filter((p: any) => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })).filter(cat => cat.products.length > 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050505]">
        <Loader2 className="animate-spin text-gold-500" size={40} />
      </div>
    );
  }

  if (error || (!restaurant && !loading)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#050505] p-6 text-center">
        <div className="flex mb-6 items-center justify-center w-16 h-16 rounded-full bg-red-500/10 text-red-500">
          <Info size={32} />
        </div>
        <h2 className="text-xl font-bold mb-4 uppercase">Ett fel uppstod</h2>
        <p className="text-white/60 mb-8 max-w-sm">{error || "Restaurangen hittades inte"}</p>
        <Link href="/" className="px-8 py-4 bg-gold-500 hover:bg-gold-400 text-dark-500 rounded-xl font-bold uppercase tracking-wider transition-all">
          Tillbaka till hem
        </Link>
      </div>
    );
  }

  return (
    <div className={`pb-24 px-6 max-w-7xl mx-auto ${isStandalone ? "pt-12" : "pt-32"}`}>
      {isStandalone && (
        <Link href="/" className="inline-flex items-center gap-2 text-white/40 hover:text-gold-500 transition-colors text-xs font-bold uppercase tracking-widest mb-8">
          <ChevronLeft size={16} />
          Tillbaka
        </Link>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-12">
        <div className="max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4 mb-4"
          >
            {restaurant.imageUrl && (
              <div className="w-16 h-16 rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                <img src={restaurant.imageUrl} alt={restaurant.name} className="w-full h-full object-cover" />
              </div>
            )}
            <div>
              <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-none">
                {restaurant.name.split(' ')[0]} <span className="text-gold-500">{restaurant.name.split(' ').slice(1).join(' ')}</span>
              </h1>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest">{restaurant.cuisine || "Restaurang"}</span>
                {restaurant.rating && (
                  <div className="flex items-center gap-1 text-gold-500 font-bold text-[10px]">
                    ★ {restaurant.rating} <span className="text-white/20 font-medium">({restaurant.ratingCount})</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
          
          <motion.p 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="text-white/40 text-sm md:text-base max-w-lg leading-relaxed"
          >
            {restaurant.description || "Välkommen till en värld av smaker. Beställ nu för snabb leverans."}
          </motion.p>
        </div>

        <div className="relative group max-w-[180px] w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-gold-500 transition-colors" size={14} />
          <input 
            type="text"
            placeholder="Sök i menyn..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg py-2.5 pl-9 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-gold-500/30 transition-all placeholder:text-white/10"
          />
        </div>
      </div>

      {/* Info Bar */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        <div className={`px-3 py-2 rounded-xl border flex items-center gap-2.5 ${restaurant.isOpen ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400" : "border-red-500/20 bg-red-500/5 text-red-400"}`}>
          <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${restaurant.isOpen ? "bg-emerald-500" : "bg-red-500"}`} />
          <span className="text-[10px] font-black uppercase tracking-widest">{restaurant.isOpen ? "ÖPPET NU" : "STÄNGT"}</span>
        </div>
        <div className="px-3 py-2 rounded-xl border border-white/5 bg-white/5 flex items-center gap-2">
          <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Utkörning</span>
          <span className="text-[11px] font-black text-gold-500">{restaurant.deliveryFee} kr</span>
        </div>
        <div className="px-3 py-2 rounded-xl border border-white/5 bg-white/5 flex items-center gap-2">
          <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Min. order</span>
          <span className="text-[11px] font-black text-gold-500">{restaurant.minOrderAmount} kr</span>
        </div>
        <div className="px-3 py-2 rounded-xl border border-white/5 bg-white/5 flex items-center gap-2">
          <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Tid</span>
          <span className="text-[11px] font-black text-gold-500">~{restaurant.etaMinutes} min</span>
        </div>
      </div>

      {deals.length > 0 && !restaurantSlug && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-12">
          {deals.map((deal) => (
            <div key={deal.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 relative overflow-hidden group hover:border-gold-500/20 transition-all">
              <div className="flex items-start justify-between gap-3 mb-2 relative z-10">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-gold-500/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.2em] text-gold-500 mb-2">
                    <Sparkles size={10} />
                    {deal.badgeText || "Deal"}
                  </div>
                  <h3 className="text-lg font-black tracking-tight leading-none mb-1">{deal.title}</h3>
                  <p className="text-white/30 text-[10px] leading-tight line-clamp-1">{deal.description || formatDealReward(deal)}</p>
                </div>
                <div className="text-xl font-black text-gold-500">{formatDealReward(deal)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Category Nav */}
      <div className="sticky top-0 md:top-20 z-40 bg-[#050505]/90 backdrop-blur-xl py-4 -mx-6 px-6 mb-8 border-b border-white/5 overflow-x-auto no-scrollbar flex items-center gap-3">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              setActiveCategory(cat.id);
              const element = document.getElementById(cat.id);
              if (element) {
                const offset = 140;
                const bodyRect = document.body.getBoundingClientRect().top;
                const elementRect = element.getBoundingClientRect().top;
                const elementPosition = elementRect - bodyRect;
                const offsetPosition = elementPosition - offset;
                window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
              }
            }}
            className={`whitespace-nowrap px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${
              activeCategory === cat.id 
                ? 'bg-gold-500 text-dark-500 shadow-xl shadow-gold-500/20' 
                : 'bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/60'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Menu Grid */}
      <div className="space-y-20">
        {filteredCategories.map((cat) => (
          <section key={cat.id} id={cat.id} className="scroll-mt-32">
            <div className="mb-8 flex items-center gap-6">
              <h2 className="text-2xl font-black uppercase tracking-widest text-white whitespace-nowrap">
                {cat.name}
              </h2>
              <div className="h-px bg-gradient-to-r from-white/10 to-transparent flex-1" />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {cat.products.map((p: any) => (
                <motion.div
                  key={p.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedProduct(p)}
                  className="group bg-[#0d0d0d] border border-white/5 rounded-2xl p-4 cursor-pointer hover:border-gold-500/30 hover:bg-white/[0.03] transition-all flex items-center gap-5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.6)] active:scale-95"
                >
                  {p.imageUrl ? (
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-white/5 flex-shrink-0 border border-white/5">
                      <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500" />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-white/5 flex items-center justify-center text-white/10 flex-shrink-0">
                      <Sparkles size={20} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm md:text-base font-black truncate uppercase tracking-tight group-hover:text-gold-500 transition-colors leading-tight mb-1">{p.name}</h3>
                    <p className="text-white/20 text-[10px] md:text-xs line-clamp-2 leading-relaxed font-medium">{p.description}</p>
                    
                    <div className="flex items-center gap-2 mt-3">
                      {p.isVegan && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Vegan" />}
                      {p.isVegetarian && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Vegetarian" />}
                      {p.isGlutenFree && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" title="Glutenfri" />}
                    </div>
                  </div>
                  <div className="text-xl md:text-2xl font-black text-gold-500 group-hover:scale-110 transition-transform whitespace-nowrap ml-2">
                    {p.price}<span className="text-[10px] ml-0.5 opacity-30">kr</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Product Modal */}
      <AnimatePresence>
        {selectedProduct && (
          <ProductModal 
            product={selectedProduct} 
            onClose={() => setSelectedProduct(null)} 
          />
        )}
      </AnimatePresence>

      <DealSpotlight deals={deals.filter((deal) => deal.popupEnabled)} subtotal={subtotal} productIds={productIds} floating />
      <FloatingCartButton />
      <BottomNav />
    </div>
  );
};

export default MenuContent;
