"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { io, Socket } from "socket.io-client";
import { Search, Loader2, Info, Tag, Sparkles } from "lucide-react";
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

        <div className="relative group max-w-md w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-gold-500 transition-colors" size={20} />
          <input 
            type="text"
            placeholder="Sök i menyn..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-6 focus:outline-none focus:ring-2 focus:ring-gold-500/50 focus:border-gold-500 transition-all text-white placeholder:text-white/20"
          />
        </div>
      </div>

      {deals.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          {deals.map((deal) => (
            <div key={deal.id} className="rounded-[2rem] border border-white/10 bg-white/5 p-6 relative overflow-hidden group hover:border-gold-500/30 transition-all">
              <div className="flex items-start justify-between gap-4 mb-4 relative z-10">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-gold-500/20 bg-gold-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-gold-500 mb-3">
                    <Sparkles size={12} />
                    {deal.badgeText || "Deal"}
                  </div>
                  <h3 className="text-2xl font-black tracking-tight">{deal.title}</h3>
                  <p className="text-white/45 text-sm mt-2 leading-relaxed">{deal.description || formatDealReward(deal)}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black uppercase tracking-[0.2em] text-white/25">Belöning</div>
                  <div className="text-xl font-black text-gold-500">{formatDealReward(deal)}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-white/35">
                {deal.minOrder > 0 && <span className="rounded-full bg-white/5 px-3 py-1 uppercase tracking-[0.2em]">Från {deal.minOrder} kr</span>}
                {deal.validUntil && <span className="rounded-full bg-white/5 px-3 py-1 uppercase tracking-[0.2em]">Till {new Date(deal.validUntil).toLocaleDateString("sv-SE")}</span>}
                {deal.maxUsesPerCustomer ? <span className="rounded-full bg-white/5 px-3 py-1 uppercase tracking-[0.2em]">{deal.maxUsesPerCustomer} per kund</span> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        <div className={`rounded-3xl border px-6 py-5 ${settings.isOpen ? "border-emerald-500/20 bg-emerald-500/10" : "border-red-500/20 bg-red-500/10"}`}>
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 mb-2">Status</div>
          <div className={`text-xl font-black uppercase ${settings.isOpen ? "text-emerald-300" : "text-red-300"}`}>
            {settings.isOpen ? "Öppet för beställning" : "Stängt just nu"}
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 mb-2">Hemkörning</div>
          <div className="text-xl font-black text-gold-500">{settings.deliveryFee} kr</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 mb-2">Minimiorder</div>
          <div className="text-xl font-black text-gold-500">{settings.minOrderAmount} kr</div>
        </div>
      </div>

      {/* Category Nav */}
      <div className="sticky top-20 z-40 bg-dark-500/95 backdrop-blur-xl py-4 -mx-6 px-6 mb-8 border-b border-white/5 overflow-x-auto no-scrollbar flex items-center gap-2 touch-pan-x">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              setActiveCategory(cat.id);
              const element = document.getElementById(cat.id);
              if (element) {
                const offset = 160; // Header(80) + CategoryNav(80)
                const bodyRect = document.body.getBoundingClientRect().top;
                const elementRect = element.getBoundingClientRect().top;
                const elementPosition = elementRect - bodyRect;
                const offsetPosition = elementPosition - offset;

                window.scrollTo({
                  top: offsetPosition,
                  behavior: 'smooth'
                });
              }
            }}
            className={`whitespace-nowrap px-6 py-2.5 rounded-full text-[13px] font-black uppercase tracking-wider transition-all active:scale-95 ${
              activeCategory === cat.id 
                ? 'bg-gold-500 text-dark-500 shadow-[0_0_20px_rgba(212,167,74,0.3)]' 
                : 'bg-white/5 text-white/40 hover:bg-white/10'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Menu Grid */}
      <div className="space-y-20">
        {filteredCategories.map((cat) => (
          <section key={cat.id} id={cat.id} className="scroll-mt-40">
            <div className="mb-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5">
              {cat.imageUrl && (
                <div className="relative aspect-[4/3] min-h-[220px] w-full overflow-hidden bg-[#120d08] sm:aspect-[21/8] sm:min-h-0">
                  <img
                    src={cat.imageUrl}
                    alt={cat.name}
                    className="absolute inset-0 h-full w-full object-contain object-center p-2 sm:p-4"
                  />
                </div>
              )}
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-2 flex items-center gap-4">
                  {cat.name}
                  <div className="h-px bg-white/10 flex-1" />
                </h2>
                {cat.description && <p className="text-white/40 max-w-3xl">{cat.description}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {cat.products.map((p: any) => (
                <motion.div
                  key={p.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedProduct(p)}
                  className="group bg-white/5 border border-white/10 rounded-2xl p-4 cursor-pointer hover:border-gold-500/40 hover:shadow-[0_0_30px_rgba(212,167,74,0.1)] transition-all touch-manipulation"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold mb-1 group-hover:text-gold-500 transition-colors uppercase">{p.name}</h3>
                      <p className="text-white/40 text-[11px] line-clamp-2 leading-relaxed mb-3">{p.description || "Ingen beskrivning tillgänglig."}</p>
                      <div className="text-lg font-bold text-gold-500">{p.price} kr</div>
                    </div>
                    {p.imageUrl && (
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-white/5 relative flex-shrink-0">
                        <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                      </div>
                    )}
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
