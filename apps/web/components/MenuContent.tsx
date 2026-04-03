"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { io, Socket } from "socket.io-client";
import { Search, Loader2, Info, Sparkles, ChevronLeft, MapPin, Phone, Clock, Bike, Store, Star } from "lucide-react";
import { API_URL, SOCKET_URL } from "@/lib/api";
import ProductModal from "@/components/ProductModal";
import FloatingCartButton from "@/components/FloatingCartButton";
import DealSpotlight from "@/components/DealSpotlight";
import { useCartStore } from "@/store/cartStore";
import { PublicDeal, formatDealReward } from "@/lib/deals";
import Link from "next/link";

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
      if (!restaurantSlug || restaurantSlug === "palmyra") {
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
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-gold-500" size={40} />
      </div>
    );
  }

  if (error || (!restaurant && !loading)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="flex mb-6 items-center justify-center w-16 h-16 rounded-full bg-red-500/10 text-red-500">
          <Info size={32} />
        </div>
        <h2 className="text-xl font-bold mb-4 uppercase">Ett fel uppstod</h2>
        <p className="text-white/60 mb-8 max-w-sm">{error || "Restaurangen hittades inte"}</p>
        <Link
          href="/"
          className="px-8 py-4 bg-gold-500 hover:bg-gold-400 text-dark-500 rounded-xl font-bold uppercase tracking-wider transition-all"
        >
          Tillbaka till hem
        </Link>
      </div>
    );
  }

  const heroImage = restaurant?.heroImageUrl || restaurant?.imageUrl;

  return (
    <div className="pb-32">
      {/* Hero cover image (Foodora-style) */}
      {isStandalone && heroImage && (
        <div className="relative w-full h-52 overflow-hidden">
          <img src={heroImage} alt={restaurant?.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent" />
          <Link
            href="/"
            className="absolute top-4 left-4 flex items-center gap-1.5 text-white/80 hover:text-gold-500 text-xs font-black uppercase tracking-widest bg-black/40 backdrop-blur px-3 py-2 rounded-full transition-colors"
          >
            <ChevronLeft size={14} />
            Tillbaka
          </Link>
        </div>
      )}

      <div className={`px-4 max-w-4xl mx-auto ${isStandalone && heroImage ? "pt-6" : isStandalone ? "pt-12" : "pt-32"}`}>
        {isStandalone && !heroImage && (
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-white/40 hover:text-gold-500 transition-colors text-xs font-bold uppercase tracking-widest mb-6"
          >
            <ChevronLeft size={16} />
            Tillbaka
          </Link>
        )}

        {/* Restaurant header */}
        <div className="mb-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-4 mb-3"
          >
            {!heroImage && restaurant.imageUrl && (
              <div className="w-16 h-16 rounded-2xl overflow-hidden border border-white/10 shadow-2xl shrink-0">
                <img
                  src={restaurant.slug === "palmyra" ? "/hero-palmyra.svg" : restaurant.imageUrl}
                  alt={restaurant.name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl md:text-4xl font-black tracking-tighter uppercase leading-none mb-1">
                {restaurant.name.split(" ")[0]}{" "}
                <span className="text-gold-500">{restaurant.name.split(" ").slice(1).join(" ")}</span>
              </h1>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest">
                  {restaurant.cuisine || "Restaurang"}
                </span>
                {restaurant.rating && (
                  <div className="flex items-center gap-1 text-gold-500 font-bold text-[10px]">
                    <Star size={10} className="fill-gold-500" />
                    {restaurant.rating}{" "}
                    <span className="text-white/20 font-medium">({restaurant.ratingCount})</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div
                className={`px-3 py-1.5 rounded-full border flex items-center gap-1.5 ${
                  restaurant.isOpen
                    ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                    : "border-red-500/20 bg-red-500/5 text-red-400"
                }`}
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                    restaurant.isOpen ? "bg-emerald-500" : "bg-red-500"
                  }`}
                />
                <span className="text-[9px] font-black uppercase tracking-widest">
                  {restaurant.isOpen ? "Öppet" : "Stängt"}
                </span>
              </div>
              {restaurant.phone && (
                <a
                  href={`tel:${String(restaurant.phone).replace(/\\s+/g, "")}`}
                  className="px-3 py-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/15 transition-colors flex items-center gap-1.5"
                >
                  <Phone size={14} />
                  <span className="text-[9px] font-black uppercase tracking-widest">Ring</span>
                </a>
              )}
            </div>
          </motion.div>

          {restaurant.description && (
            <p className="text-white/40 text-sm leading-relaxed mb-4 max-w-lg">{restaurant.description}</p>
          )}

          {/* Info chips */}
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="px-3 py-1.5 rounded-xl border border-white/5 bg-white/5 flex items-center gap-1.5">
              <Bike size={12} className="text-gold-500" />
              <span className="text-[9px] font-black text-white/50 uppercase tracking-wider">
                Leverans {restaurant.deliveryFee} kr
              </span>
            </div>
            <div className="px-3 py-1.5 rounded-xl border border-white/5 bg-white/5 flex items-center gap-1.5">
              <Clock size={12} className="text-gold-500" />
              <span className="text-[9px] font-black text-white/50 uppercase tracking-wider">
                ~{restaurant.etaMinutes} min
              </span>
            </div>
            {restaurant.minOrderAmount > 0 && (
              <div className="px-3 py-1.5 rounded-xl border border-white/5 bg-white/5 flex items-center gap-1.5">
                <Store size={12} className="text-gold-500" />
                <span className="text-[9px] font-black text-white/50 uppercase tracking-wider">
                  Min. order {restaurant.minOrderAmount} kr
                </span>
              </div>
            )}
          </div>

          {/* Contact info */}
          {(restaurant.address || restaurant.phone) && (
            <div className="flex flex-wrap gap-3 text-[10px] text-white/30 font-medium">
              {restaurant.address && restaurant.city && (
                <span className="flex items-center gap-1">
                  <MapPin size={11} className="text-white/20" />
                  {restaurant.address}, {restaurant.city}
                </span>
              )}
              {restaurant.phone && (
                <a
                  href={`tel:${restaurant.phone}`}
                  className="flex items-center gap-1 hover:text-gold-500 transition-colors"
                >
                  <Phone size={11} className="text-white/20" />
                  {restaurant.phone}
                </a>
              )}
            </div>
          )}
        </div>

        {/* Deals */}
        {deals.length > 0 && restaurantSlug && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
            {deals.slice(0, 4).map((deal) => (
              <div
                key={deal.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 relative overflow-hidden group hover:border-gold-500/20 transition-all"
              >
                <div className="flex items-start justify-between gap-3 relative z-10">
                  <div>
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-gold-500/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.2em] text-gold-500 mb-1.5">
                      <Sparkles size={8} />
                      {deal.badgeText || "Deal"}
                    </div>
                    <h3 className="text-sm font-black tracking-tight leading-none mb-0.5">{deal.title}</h3>
                    <p className="text-white/30 text-[9px] line-clamp-1">{deal.description || formatDealReward(deal)}</p>
                  </div>
                  <div className="text-lg font-black text-gold-500">{formatDealReward(deal)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Search + category nav */}
        <div className="sticky top-0 z-40 bg-dark-500/70 backdrop-blur-xl py-3 -mx-4 px-4 mb-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={12} />
              <input
                type="text"
                placeholder="Sök i menyn..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-gold-500/30 transition-all placeholder:text-white/10"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveCategory(cat.id);
                    const element = document.getElementById(cat.id);
                    if (element) {
                      const offset = 120;
                      const bodyRect = document.body.getBoundingClientRect().top;
                      const elementRect = element.getBoundingClientRect().top;
                      const elementPosition = elementRect - bodyRect;
                      const offsetPosition = elementPosition - offset;
                      window.scrollTo({ top: offsetPosition, behavior: "smooth" });
                    }
                  }}
                  className={`whitespace-nowrap px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    activeCategory === cat.id
                      ? "bg-gold-500 text-dark-500 shadow-lg shadow-gold-500/20"
                      : "bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/60"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {cat.products.map((p: any) => (
                  <motion.div
                    key={p.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedProduct(p)}
                    className="group bg-white/[0.03] border border-white/5 rounded-2xl p-4 cursor-pointer hover:border-gold-500/30 hover:bg-white/[0.05] transition-all flex items-center gap-4 active:scale-95"
                  >
                    {p.imageUrl ? (
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-white/5 flex-shrink-0 border border-white/5">
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className="w-full h-full object-cover opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500"
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-white/5 flex items-center justify-center text-white/10 flex-shrink-0">
                        <Sparkles size={20} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-black truncate uppercase tracking-tight group-hover:text-gold-500 transition-colors leading-tight mb-0.5">
                        {p.name}
                      </h3>
                      <p className="text-white/20 text-[10px] line-clamp-2 leading-relaxed font-medium">
                        {p.description}
                      </p>
                      <div className="flex items-center gap-1.5 mt-2">
                        {p.isVegan && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Vegan" />}
                        {p.isVegetarian && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Vegetarian" />}
                        {p.isGlutenFree && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" title="Glutenfri" />}
                      </div>
                    </div>
                    <div className="text-xl font-black text-gold-500 group-hover:scale-110 transition-transform whitespace-nowrap ml-2">
                      {p.price}
                      <span className="text-[10px] ml-0.5 opacity-30">kr</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* Product Modal */}
      <AnimatePresence>
        {selectedProduct && (
          <ProductModal 
            product={selectedProduct} 
            restaurantId={restaurant?.id || "palmyra"}
            onClose={() => setSelectedProduct(null)} 
          />
        )}
      </AnimatePresence>

      <DealSpotlight deals={deals.filter((deal) => deal.popupEnabled)} subtotal={subtotal} productIds={productIds} floating />
      <FloatingCartButton />
    </div>
  );
};

export default MenuContent;
