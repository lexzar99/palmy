"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { io, Socket } from "socket.io-client";
import { Search, Loader2, Info, Sparkles } from "lucide-react";
import { API_URL, SOCKET_URL } from "@/lib/api";
import ProductModal from "@/components/ProductModal";
import FloatingCartButton from "@/components/FloatingCartButton";
import DealSpotlight from "@/components/DealSpotlight";
import { useCartStore } from "@/store/cartStore";
import { PublicDeal, formatDealReward } from "@/lib/deals";

const MenuPage = () => {
  const [categories, setCategories] = useState<any[]>([]);
  const [deals, setDeals] = useState<PublicDeal[]>([]);
  const [settings, setSettings] = useState({
    isOpen: true,
    deliveryFee: 49,
    minOrderAmount: 150,
    estimatedDeliveryTime: 35,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const items = useCartStore((state) => state.items);
  const subtotal = useCartStore((state) => state.getTotal());
  const productIds = items.flatMap((item) => Array.from({ length: item.quantity }, () => item.productId));

  useEffect(() => {
    const fetchMenu = async () => {
      try {
        const [menuRes, settingsRes, dealsRes] = await Promise.all([
          axios.get(`${API_URL}/api/menu/categories`),
          axios.get(`${API_URL}/api/settings`),
          axios.get(`${API_URL}/api/deals`),
        ]);
        setCategories(menuRes.data);
        setDeals(dealsRes.data);
        setSettings({
          isOpen: settingsRes.data.isOpen ?? true,
          deliveryFee: settingsRes.data.deliveryFee ?? 49,
          minOrderAmount: settingsRes.data.minOrderAmount ?? 150,
          estimatedDeliveryTime: settingsRes.data.estimatedDeliveryTime ?? 35,
        });
        if (menuRes.data.length > 0) setActiveCategory(menuRes.data[0].id);
      } catch (err) {
        console.error("Error fetching menu:", err);
        setError("Kunde inte ladda menyn. Kontrollera din anslutning eller försök igen senare.");
      } finally {
        setLoading(false);
      }
    };
    fetchMenu();

    const socket: Socket = io(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });
    socket.on("settings:updated", (nextSettings) => {
      setSettings({
        isOpen: nextSettings.isOpen ?? true,
        deliveryFee: nextSettings.deliveryFee ?? 49,
        minOrderAmount: nextSettings.minOrderAmount ?? 150,
        estimatedDeliveryTime: nextSettings.estimatedDeliveryTime ?? 35,
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const filteredCategories = categories.map(cat => ({
    ...cat,
    products: cat.products.filter((p: any) => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })).filter(cat => cat.products.length > 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-500">
        <Loader2 className="animate-spin text-gold-500" size={40} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-dark-500 p-6 text-center">
        <div className="flex mb-6 items-center justify-center w-16 h-16 rounded-full bg-red-500/10 text-red-500">
          <Info size={32} />
        </div>
        <h2 className="text-xl font-bold mb-4 uppercase">Ett fel uppstod</h2>
        <p className="text-white/60 mb-8 max-w-sm">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-8 py-4 bg-gold-500 hover:bg-gold-400 text-dark-500 rounded-xl font-bold uppercase tracking-wider transition-all"
        >
          Försök igen
        </button>
      </div>
    );
  }

  return (
    <div className="pt-32 pb-24 px-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-12">
        <div className="max-w-2xl">
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-4xl md:text-6xl font-bold tracking-tight mb-4"
          >
            Vår <span className="text-gold-500">Meny</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="text-white/40 text-lg"
          >
            Välj bland Lunds mest älskade pizzor och menyer.
          </motion.p>
        </div>

        <div className="relative group max-w-[260px] w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-gold-500 transition-colors" size={16} />
          <input 
            type="text"
            placeholder="Sök..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 focus:outline-none focus:ring-1 focus:ring-gold-500/30 transition-all text-sm placeholder:text-white/10"
          />
        </div>
      </div>

      {deals.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
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

      {/* Ultra Compact Info Bar */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        <div className={`px-4 py-2 rounded-xl border flex items-center gap-3 ${settings.isOpen ? "border-emerald-500/10 bg-emerald-500/5 text-emerald-400" : "border-red-500/10 bg-red-500/5 text-red-400"}`}>
          <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${settings.isOpen ? "bg-emerald-500" : "bg-red-500"}`} />
          <span className="text-[10px] font-black uppercase tracking-widest leading-none">{settings.isOpen ? "Öppet för beställning" : "Stängt"}</span>
        </div>
        <div className="px-4 py-2 rounded-xl border border-white/5 bg-white/5 flex items-center gap-2">
          <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Hemkörning</span>
          <span className="text-xs font-black text-gold-500">{settings.deliveryFee} kr</span>
        </div>
        <div className="px-4 py-2 rounded-xl border border-white/5 bg-white/5 flex items-center gap-2">
          <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Min. order</span>
          <span className="text-xs font-black text-gold-500">{settings.minOrderAmount} kr</span>
        </div>
      </div>

      {/* Category Nav */}
      <div className="sticky top-20 z-40 bg-dark-500/90 backdrop-blur-md py-3 -mx-6 px-6 mb-6 border-b border-white/5 overflow-x-auto no-scrollbar flex items-center gap-2">
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
            className={`whitespace-nowrap px-5 py-2 rounded-full text-[11px] font-black uppercase tracking-wider transition-all ${
              activeCategory === cat.id 
                ? 'bg-gold-500 text-dark-500 shadow-lg shadow-gold-500/20' 
                : 'bg-white/5 text-white/30 hover:bg-white/10'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Menu Grid */}
      <div className="space-y-16">
        {filteredCategories.map((cat) => (
          <section key={cat.id} id={cat.id} className="scroll-mt-32">
            <div className="mb-6 flex items-center gap-4">
              <h2 className="text-xl font-black uppercase tracking-widest text-white whitespace-nowrap">
                {cat.name}
              </h2>
              <div className="h-px bg-gradient-to-r from-white/10 to-transparent flex-1" />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cat.products.map((p: any) => (
                <motion.div
                  key={p.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedProduct(p)}
                  className="group bg-white/5 border border-white/5 rounded-2xl p-4 cursor-pointer hover:border-gold-500/20 hover:bg-white/[0.07] transition-all flex items-center gap-4"
                >
                  {p.imageUrl && (
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-white/5 flex-shrink-0">
                      <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold truncate uppercase tracking-wide group-hover:text-gold-500 transition-colors">{p.name}</h3>
                    <p className="text-white/25 text-[10px] line-clamp-1 leading-relaxed mt-0.5">{p.description}</p>
                  </div>
                  <div className="text-xl font-black text-white group-hover:text-gold-500 transition-colors whitespace-nowrap">
                    {p.price}<span className="text-[10px] ml-0.5 opacity-40">kr</span>
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
    </div>
  );
};

export default MenuPage;
