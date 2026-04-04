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

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("platform_address");
      if (stored) setAddress(stored);
      const storedType = localStorage.getItem("platform_order_type");
      if (storedType === "PICKUP" || storedType === "DELIVERY") setOrderType(storedType as "DELIVERY" | "PICKUP");
    }

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
      const isGlobal = !nextSettings.slug && !nextSettings.restaurantId;
      const isMatch = nextSettings.slug === restaurantSlug || (restaurantId && nextSettings.restaurantId === restaurantId);
      
      if (isMatch || (isGlobal && (!restaurantSlug || restaurantSlug === "palmyra"))) {
        setRestaurant((prev: any) => ({
          ...prev,
          isOpen: nextSettings.isOpen ?? prev?.isOpen ?? true,
          deliveryFee: nextSettings.deliveryFee ?? prev?.deliveryFee ?? 49,
          minOrderAmount: nextSettings.minOrderAmount ?? prev?.minOrderAmount ?? 150,
          etaMinutes: nextSettings.estimatedDeliveryTime ?? nextSettings.etaMinutes ?? prev?.etaMinutes ?? 35,
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
    <div className="pb-32 bg-zinc-950">
      {/* Hero cover image (Foodora-style) */}
      {isStandalone && heroImage && (
        <div className="relative w-full h-52 overflow-hidden">
          <img src={heroImage} alt={restaurant?.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent" />
          <Link
            href="/"
            className="absolute top-4 left-4 flex items-center gap-1.5 text-zinc-100/80 hover:text-gold-600 text-xs font-black uppercase tracking-widest bg-white/80 backdrop-blur px-3 py-2 rounded-full transition-colors shadow-xl"
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
            className="inline-flex items-center gap-2 text-zinc-400 hover:text-gold-600 transition-colors text-xs font-bold uppercase tracking-widest mb-6"
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
              <div className="w-16 h-16 rounded-2xl overflow-hidden border border-white/5 shadow-xl shrink-0">
                <img
                  src={restaurant.slug === "palmyra" ? "/hero-palmyra.svg" : restaurant.imageUrl}
                  alt={restaurant.name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl md:text-4xl font-black tracking-tighter uppercase leading-none mb-1 text-zinc-100">
                {restaurant.name.split(" ")[0]}{" "}
                <span className="text-gold-600">{restaurant.name.split(" ").slice(1).join(" ")}</span>
              </h1>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest">
                  {restaurant.cuisine || "Restaurang"}
                </span>
                {restaurant.rating && (
                  <div className="flex items-center gap-1 text-gold-600 font-bold text-[10px]">
                    <Star size={10} className="fill-gold-600" />
                    {restaurant.rating}{" "}
                    <span className="text-zinc-400/50 font-medium">({restaurant.ratingCount})</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div
                className={`px-3 py-1.5 rounded-full border flex items-center gap-1.5 ${
                  restaurant.isOpen
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                    : "border-red-500/30 bg-red-500/10 text-red-600"
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
                  className="px-3 py-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-600 hover:bg-sky-500/20 transition-colors flex items-center gap-1.5 shadow-xl"
                >
                  <Phone size={14} />
                  <span className="text-[9px] font-black uppercase tracking-widest">Ring</span>
                </a>
              )}
              {/* Removign old ring button block since merged above */}
            </div>
          </motion.div>

          {restaurant.description && (
            <p className="text-zinc-400 text-sm leading-relaxed mb-4 max-w-lg">{restaurant.description}</p>
          )}

          {/* Info chips */}
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="px-3 py-1.5 rounded-xl border border-white/5 bg-zinc-900 flex items-center gap-1.5 shadow-xl">
              <Bike size={12} className="text-gold-600" />
              <span className="text-[9px] font-black text-zinc-400 uppercase tracking-wider">
                Leverans {restaurant.deliveryFee} kr
              </span>
            </div>
            <div className="px-3 py-1.5 rounded-xl border border-white/5 bg-zinc-900 flex items-center gap-1.5 shadow-xl">
              <Clock size={12} className="text-gold-600" />
              <span className="text-[9px] font-black text-zinc-400 uppercase tracking-wider">
                ~{restaurant.etaMinutes} min
              </span>
            </div>
            {restaurant.minOrderAmount > 0 && (
              <div className="px-3 py-1.5 rounded-xl border border-white/5 bg-zinc-900 flex items-center gap-1.5 shadow-xl">
                <Store size={12} className="text-gold-600" />
                <span className="text-[9px] font-black text-zinc-400 uppercase tracking-wider">
                  Min. order {restaurant.minOrderAmount} kr
                </span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 mt-6">
            {restaurant.phone && (
              <a
                href={`tel:${String(restaurant.phone).replace(/\\s+/g, "")}`}
                className="flex-1 py-3.5 rounded-2xl bg-zinc-900 border border-white/5 hover:border-sky-500/30 hover:bg-sky-500/10 hover:text-sky-400 transition-all text-zinc-300 font-black uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 shadow-xl"
              >
                <Phone size={16} />
                Ring restaurang
              </a>
            )}
            <button
              onClick={() => setShowInfoModal(true)}
              className="flex-1 py-3.5 rounded-2xl bg-zinc-900 border border-white/5 hover:border-gold-500/30 hover:bg-gold-500/10 hover:text-gold-400 transition-all text-zinc-300 font-black uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 shadow-xl"
            >
              <Info size={16} />
              Mer Info
            </button>
          </div>
        </div>

        {/* Deals */}
        {deals.length > 0 && restaurantSlug && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
            {deals.slice(0, 4).map((deal) => (
              <div
                key={deal.id}
                className="rounded-2xl border border-white/5 bg-zinc-900 p-4 relative overflow-hidden group hover:border-gold-600/20 transition-all shadow-xl"
              >
                <div className="flex items-start justify-between gap-3 relative z-10">
                  <div>
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-gold-400/20 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.2em] text-gold-600 mb-1.5">
                      <Sparkles size={8} />
                      {deal.badgeText || "Deal"}
                    </div>
                    <h3 className="text-sm font-black tracking-tight leading-none mb-0.5 text-zinc-100">{deal.title}</h3>
                    <p className="text-zinc-400 text-[9px] line-clamp-1">{deal.description || formatDealReward(deal)}</p>
                  </div>
                  <div className="text-lg font-black text-gold-600">{formatDealReward(deal)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Search + category nav */}
        <div className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-xl py-3 -mx-4 px-4 mb-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400/50" size={12} />
              <input
                type="text"
                placeholder="Sök i menyn..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-900 border border-white/5 rounded-lg py-2 pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-gold-500/30 transition-all placeholder:text-zinc-400/30 shadow-xl"
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
                      ? "bg-gold-500 text-white shadow-lg shadow-gold-500/20"
                      : "bg-zinc-900 text-zinc-400/60 hover:bg-zinc-800/50 shadow-xl border border-white/5"
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
                <h2 className="text-xl font-black uppercase tracking-widest text-zinc-100 whitespace-nowrap">
                  {cat.name}
                </h2>
                <div className="h-px bg-gradient-to-r from-light-500 to-transparent flex-1" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {cat.products.map((p: any) => (
                  <motion.div
                    key={p.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      if (!address.trim()) {
                        setPendingProduct(p);
                        setShowAddressModal(true);
                      } else {
                        setSelectedProduct(p);
                      }
                    }}
                    className="group bg-zinc-900 border border-white/5 rounded-2xl p-4 cursor-pointer hover:border-gold-500/30 hover:bg-light-100 transition-all flex items-center gap-4 active:scale-95 shadow-xl"
                  >
                    {p.imageUrl && (
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-zinc-800/50 flex-shrink-0 border border-white/5">
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-all duration-500"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-black truncate uppercase tracking-tight group-hover:text-gold-600 transition-colors leading-tight mb-0.5 text-zinc-100">
                        {p.name}
                      </h3>
                      <p className="text-zinc-400 text-[10px] line-clamp-2 leading-relaxed font-medium">
                        {p.description}
                      </p>
                      <div className="flex items-center gap-1.5 mt-2">
                        {p.isVegan && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Vegan" />}
                        {p.isVegetarian && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Vegetarian" />}
                        {p.isGlutenFree && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" title="Glutenfri" />}
                      </div>
                    </div>
                    <div className="text-xl font-black text-gold-600 group-hover:scale-110 transition-transform whitespace-nowrap ml-2">
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

      {/* Info Modal */}
      <AnimatePresence>
        {showInfoModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-xl p-4"
            onClick={() => setShowInfoModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="w-full max-w-sm bg-zinc-900 border border-white/10 rounded-[2rem] p-6 shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowInfoModal(false)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              >
                <ChevronLeft size={16} className="rotate-180" />
              </button>

              <div className="w-12 h-12 bg-gold-500/10 text-gold-500 rounded-2xl flex items-center justify-center mb-4">
                <Info size={24} />
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tight text-white mb-6">Om restaurangen</h2>

              <div className="space-y-4">
                {restaurant.address && (
                  <div className="flex items-start gap-3">
                    <MapPin className="text-zinc-500 mt-0.5" size={16} />
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">Adress</div>
                      <div className="text-sm font-bold text-zinc-300">{restaurant.address}</div>
                      <div className="text-sm font-bold text-zinc-300">{restaurant.zip} {restaurant.city}</div>
                    </div>
                  </div>
                )}

                {restaurant.phone && (
                  <div className="flex items-start gap-3">
                    <Phone className="text-zinc-500 mt-0.5" size={16} />
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">Telefon</div>
                      <a href={`tel:${restaurant.phone}`} className="text-sm font-bold text-gold-500 hover:underline">
                        {restaurant.phone}
                      </a>
                    </div>
                  </div>
                )}

                {(restaurant.description || restaurant.cuisine) && (
                  <div className="flex items-start gap-3">
                    <Sparkles className="text-zinc-500 mt-0.5" size={16} />
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">Om</div>
                      <div className="text-sm text-zinc-400">{restaurant.description || restaurant.cuisine}</div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <DealSpotlight deals={deals.filter((deal) => deal.popupEnabled)} subtotal={subtotal} productIds={productIds} floating />
      <FloatingCartButton />

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
        onFail={(reason) => {
          if (typeof window !== "undefined") {
            localStorage.setItem("platform_address_error", reason);
          }
          router.push("/");
        }}
        orderType={orderType}
        setOrderType={setOrderType}
      />
    </div>
  );
};

export default MenuContent;
