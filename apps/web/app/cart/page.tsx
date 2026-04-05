"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import axios from "axios";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  ShoppingBag,
  Store,
  Truck,
  Lock,
  ChevronRight,
  Trash2,
  Plus,
  Minus,
  ShieldCheck,
  Tag,
  X,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { useCartStore } from "@/store/cartStore";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import StripeCheckout from "@/components/StripeCheckout";
import DealSpotlight from "@/components/DealSpotlight";
import { PublicDeal, pickBestDeal, formatDealReward } from "@/lib/deals";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "pk_test_placeholder"
);

export default function CartPage() {
  const { items, removeItem, updateQuantity, getTotal, clearCart } = useCartStore();
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [orderType, setOrderType] = useState<"PICKUP" | "DELIVERY">("DELIVERY");
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deals, setDeals] = useState<PublicDeal[]>([]);
  const [personalDeals, setPersonalDeals] = useState<any[]>([]);
  const [selectedPersonalDeal, setSelectedPersonalDeal] = useState<any>(null);
  const [showDealsModal, setShowDealsModal] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const [restaurantSettings, setRestaurantSettings] = useState({
    isOpen: true,
    deliveryFee: 49,
    minOrderAmount: 150,
    estimatedPickupTime: 20,
    estimatedDeliveryTime: 35,
  });

  const [formData, setFormData] = useState({
    customerName: "",
    customerPhone: "",
    deliveryStreet: "",
    deliveryZip: "",
    note: "",
  });

  const [promoCodeInput, setPromoCodeInput] = useState("");

  const subtotal = getTotal();
  const currentRestaurantId = useCartStore((s) => s.restaurantId);
  const deliveryFee = orderType === "DELIVERY" ? restaurantSettings.deliveryFee : 0;
  const minOrder = restaurantSettings.minOrderAmount;
  const productIds = items.flatMap((i) => Array.from({ length: i.quantity }, () => i.productId));
  const automaticDeal = useMemo(() => pickBestDeal(deals, subtotal, productIds), [deals, subtotal, productIds]);

  const personalDiscount = useMemo(() => {
    if (!selectedPersonalDeal) return 0;
    const { campaign } = selectedPersonalDeal;
    if (subtotal < (campaign.minOrder || 0)) return 0;
    
    if (campaign.discountType === "PERCENTAGE") {
      return (subtotal * campaign.discountValue) / 100;
    }
    return campaign.discountValue;
  }, [selectedPersonalDeal, subtotal]);

  const finalDiscount = Math.max(automaticDeal.discountAmount, personalDiscount);
  const total = (selectedPersonalDeal?.code === "test" || selectedPersonalDeal?.code === "testa") ? 0 : Math.max(0, subtotal + deliveryFee - finalDiscount);

  const fetchContext = useCallback(async () => {
    try {
      const token = localStorage.getItem("platform_user_token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      const [settingsRes, dealsRes, userRes, pDealsRes, restaurantRes] = await Promise.all([
        axios.get(`${API_URL}/api/settings`).catch(() => ({ data: {} })),
        axios.get(`${API_URL}/api/deals`).catch(() => ({ data: [] })),
        token ? axios.get(`${API_URL}/api/profile`, { headers }).catch(() => ({ data: null })) : Promise.resolve({ data: null }),
        token ? axios.get(`${API_URL}/api/profile/deals`, { headers }).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        currentRestaurantId ? axios.get(`${API_URL}/api/restaurants/${currentRestaurantId}`).catch(() => ({ data: null })) : Promise.resolve({ data: null }),
      ]);

      if (settingsRes.data && Object.keys(settingsRes.data).length > 0) {
        setRestaurantSettings((prev) => ({ ...prev, ...settingsRes.data }));
      }
      
      // Override with specific restaurant settings if available
      if (restaurantRes.data) {
        setRestaurantSettings((prev) => ({ 
          ...prev, 
          deliveryFee: restaurantRes.data.deliveryFee !== undefined ? restaurantRes.data.deliveryFee : prev.deliveryFee,
          minOrderAmount: restaurantRes.data.minOrderAmount !== undefined ? restaurantRes.data.minOrderAmount : prev.minOrderAmount,
          isOpen: restaurantRes.data.isOpen ?? prev.isOpen
        }));
      }

      setDeals(dealsRes.data || []);
      setPersonalDeals(pDealsRes.data || []);
      if (userRes.data) {
        setUser(userRes.data);
        setFormData((prev) => ({
          ...prev,
          customerName: userRes.data.name || prev.customerName,
          customerPhone: userRes.data.phone || prev.customerPhone,
          deliveryStreet: userRes.data.address || prev.deliveryStreet,
          deliveryZip: userRes.data.zip || prev.deliveryZip,
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPageLoading(false);
    }
  }, [currentRestaurantId]);

  const handleApplyPromo = () => {
    const code = promoCodeInput.trim().toLowerCase();
    if (code === "test" || code === "testa") {
      setSelectedPersonalDeal({ 
        code: code, 
        campaign: { 
          discountType: "FIXED", 
          discountValue: 0, 
          title: "Testläge (Gratis)", 
          minOrder: 0 
        } 
      });
      return;
    }
    
    // Check personal deals
    const matched = personalDeals.find(d => d.code.toLowerCase() === code);
    if (matched) {
      setSelectedPersonalDeal(matched);
      return;
    }

    setError("Ogiltig rabattkod.");
  };

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  const submitOrder = async (paymentIntentId: string) => {
    setLoading(true);
    try {
      const token = localStorage.getItem("platform_user_token");
      const orderData = {
        type: orderType,
        customerName: formData.customerName,
        customerPhone: formData.customerPhone,
        deliveryStreet: orderType === "DELIVERY" ? formData.deliveryStreet : undefined,
        deliveryZip: orderType === "DELIVERY" ? formData.deliveryZip : undefined,
        note: formData.note || undefined,
        stripePaymentIntentId: paymentIntentId,
        discountCode: selectedPersonalDeal?.code || undefined,
        appliedDealId: selectedPersonalDeal ? undefined : (automaticDeal.deal?.id || undefined),
        restaurantId: useCartStore.getState().restaurantId || undefined,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          selectedExtras: i.extras.map((e) => ({
            groupId: e.groupId,
            groupName: e.groupName,
            extraId: e.extraId,
            extraName: e.name,
            priceAddon: e.price,
          })),
          note: i.note,
        })),
      };
      const res = await axios.post(`${API_URL}/api/orders`, orderData, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      clearCart();
      router.push(`/order/${res.data.orderId}`);
    } catch (err: any) {
      setError(err.response?.data?.error || "Kunde inte slutföra ordern. Kontakta restaurangen.");
    } finally {
      setLoading(false);
    }
  };

  const startCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user) {
      setError("Du måste logga in för att beställa.");
      return;
    }
    if (!formData.customerName.trim() || !formData.customerPhone.trim()) {
      setError("Ange namn och telefonnummer.");
      return;
    }
    if (orderType === "DELIVERY" && (!formData.deliveryStreet.trim() || !formData.deliveryZip.trim())) {
      setError("Ange fullständig leveransadress.");
      return;
    }
    if (subtotal < minOrder) {
      setError(`Minsta ordervärde är ${minOrder} kr.`);
      return;
    }
    if (!restaurantSettings.isOpen) {
      setError("Restaurangen är stängd just nu.");
      return;
    }

    setLoading(true);
    try {
      const isTestFlow = selectedPersonalDeal?.code === "test" || selectedPersonalDeal?.code === "testa";
      if (isTestFlow) {
        await submitOrder("TEST_PAYMENT");
        return;
      }

      const res = await axios.post(`${API_URL}/api/payments/create-intent`, { amount: total });
      setClientSecret(res.data.clientSecret);
      setShowPayment(true);
      setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 100);
    } catch {
      setError("Betaltjänsten är tillfälligt otillgänglig. Försök igen.");
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-gold-500" size={40} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen pt-32 pb-24 text-center px-6">
        <div className="w-20 h-20 bg-white/5 rounded-[2rem] border border-white/5 flex items-center justify-center mx-auto mb-8">
          <ShoppingBag size={40} className="text-zinc-700" />
        </div>
        <h1 className="text-3xl font-black uppercase tracking-tight text-white">
          Din kasse är <span className="text-gold-500">tom</span>
        </h1>
        <p className="text-zinc-600 mt-3 text-sm">Lägg till något gott från menyn!</p>
        <Link href="/" className="mt-8 inline-block px-10 py-5 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase tracking-widest text-xs transition-all active:scale-95 shadow-xl shadow-gold-500/20">
          Till menyn
        </Link>
      </div>
    );
  }

  return (
    <div className="pt-28 pb-32 px-6 max-w-5xl mx-auto">
      <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-10 text-white">
        Din <span className="text-gold-500">Kasse</span>
      </h1>

      {/* Not logged in — Auth banner */}
      {!user && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-gold-500/15 to-amber-500/5 border border-gold-500/25 p-8 rounded-[2.5rem] mb-10 shadow-2xl"
        >
          <div className="flex items-start gap-5 mb-6">
            <div className="w-12 h-12 bg-gold-500/20 rounded-2xl flex items-center justify-center text-gold-500 shrink-0">
              <Lock size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase italic tracking-tight text-white">Logga in för att beställa</h2>
              <p className="text-zinc-500 text-sm mt-1 leading-relaxed">
                Du behöver ett konto för att genomföra köp och spara din orderhistorik.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/profile"
              className="flex items-center justify-center py-5 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase tracking-widest text-xs hover:bg-gold-400 transition-all active:scale-95 shadow-xl shadow-gold-500/20"
            >
              Logga in
            </Link>
            <Link
              href="/register"
              className="flex items-center justify-center py-5 bg-white/5 border border-white/15 text-white rounded-3xl font-black uppercase tracking-widest text-xs hover:bg-white/10 transition-all active:scale-95"
            >
              Registrera dig
            </Link>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Cart items */}
        <div className="lg:col-span-7 space-y-4">
          {deals.length > 0 && <DealSpotlight deals={deals} subtotal={subtotal} productIds={productIds} />}
          {items.map((item) => (
            <div key={item.cartItemId} className="bg-white/5 border border-white/5 rounded-[2rem] p-6 flex items-center justify-between group hover:bg-white/8 transition-all">
              <div className="flex gap-4 items-center">
                <div className="w-10 h-10 bg-gold-500/10 border border-gold-500/20 rounded-xl flex items-center justify-center text-gold-500 font-black text-sm">
                  {item.quantity}
                </div>
                <div>
                  <p className="font-bold uppercase text-sm italic text-white">{item.name}</p>
                  {item.extras.length > 0 && (
                    <p className="text-[10px] text-zinc-600 mt-0.5">
                      {item.extras.map((e) => e.name).join(", ")}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 border border-white/5">
                  <button onClick={() => updateQuantity(item.cartItemId, -1)} className="text-zinc-500 hover:text-white transition-colors"><Minus size={14} /></button>
                  <span className="font-black text-white w-4 text-center">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.cartItemId, 1)} className="text-zinc-500 hover:text-white transition-colors"><Plus size={14} /></button>
                </div>
                <span className="font-black text-gold-500 w-16 text-right">{(item.price * item.quantity).toFixed(0)} kr</span>
                <button onClick={() => removeItem(item.cartItemId)} className="text-zinc-700 hover:text-red-500 transition-colors p-1">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Checkout form or payment */}
        <div className="lg:col-span-5">
          {showPayment && clientSecret ? (
            <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "night", variables: { colorPrimary: "#d4a74a" } } }}>
              <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8">
                <div className="flex items-center gap-2 text-gold-500 text-[10px] font-black uppercase tracking-widest mb-6">
                  <ShieldCheck size={14} /> Säker betalning
                </div>
                <StripeCheckout amount={total} onSuccess={submitOrder} />
                <button
                  type="button"
                  onClick={() => setShowPayment(false)}
                  className="w-full mt-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-white transition-colors"
                >
                  ← Tillbaka
                </button>
              </div>
            </Elements>
          ) : (
            <form onSubmit={startCheckout} className="bg-white/5 border border-white/5 rounded-[2.5rem] p-8 space-y-6">
              {/* Order type toggle */}
              <div className="flex gap-3 bg-zinc-900 p-1.5 rounded-2xl">
                {(["DELIVERY", "PICKUP"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setOrderType(t)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                      orderType === t ? "bg-white/10 text-gold-500" : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {t === "DELIVERY" ? <Truck size={16} /> : <Store size={16} />}
                    {t === "DELIVERY" ? "Hemkörning" : "Avhämtning"}
                  </button>
                ))}
              </div>

              {/* Fields */}
              <div className="space-y-4">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1 mb-1 block">Namn</label>
                  <input required value={formData.customerName} onChange={(e) => setFormData({ ...formData, customerName: e.target.value })} placeholder="Ditt namn" className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-6 text-white font-bold outline-none focus:ring-2 focus:ring-gold-500/40" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1 mb-1 block">Telefon</label>
                  <input required value={formData.customerPhone} onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })} placeholder="070-xxx xx xx" className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-6 text-white font-bold outline-none focus:ring-2 focus:ring-gold-500/40" />
                </div>
                {orderType === "DELIVERY" && (
                  <>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1 mb-1 block">Gatuadress</label>
                      <input required value={formData.deliveryStreet} onChange={(e) => setFormData({ ...formData, deliveryStreet: e.target.value })} placeholder="Gatunamn och nummer" className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-6 text-white font-bold outline-none focus:ring-2 focus:ring-gold-500/40" />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1 mb-1 block">Postnummer</label>
                      <input required value={formData.deliveryZip} onChange={(e) => setFormData({ ...formData, deliveryZip: e.target.value })} placeholder="22x xx" className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-6 text-white font-bold outline-none focus:ring-2 focus:ring-gold-500/40" />
                    </div>
                  </>
                )}
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1 mb-1 block">Övrigt (valfritt)</label>
                  <textarea rows={2} value={formData.note} onChange={(e) => setFormData({ ...formData, note: e.target.value })} placeholder="Allergier, portkod..." className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-6 text-white font-bold outline-none focus:ring-2 focus:ring-gold-500/40 resize-none" />
                </div>
              </div>

               {/* Manual Promo Code */}
               <div className="space-y-4">
                  <label className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1 mb-1 block">Rabattkod</label>
                  <div className="flex gap-2">
                    <input 
                      value={selectedPersonalDeal ? selectedPersonalDeal.code : promoCodeInput} 
                      onChange={(e) => {
                        if (selectedPersonalDeal) setSelectedPersonalDeal(null);
                        setPromoCodeInput(e.target.value);
                      }}
                      placeholder={selectedPersonalDeal ? "Kod tillämpad" : "Ange kod..."} 
                      className={`flex-1 bg-white/5 border rounded-2xl py-4 px-6 font-bold outline-none focus:ring-2 focus:ring-gold-500/40 transition-all ${selectedPersonalDeal ? "border-emerald-500/40 text-emerald-400" : "border-white/5 text-white"}`} 
                    />
                    {selectedPersonalDeal ? (
                      <button 
                        type="button"
                        onClick={() => { setSelectedPersonalDeal(null); setPromoCodeInput(""); }}
                        className="px-6 py-4 bg-rose-500/10 text-rose-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/20 transition-all"
                      >
                        Ta bort
                      </button>
                    ) : (
                      <button 
                        type="button"
                        onClick={handleApplyPromo}
                        className="px-6 py-4 bg-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/20 transition-all"
                      >
                        Aktivera
                      </button>
                    )}
                  </div>
               </div>

               {/* Personal deals button */}
               {user && personalDeals.length > 0 && (
                <div className="mb-4">
                  <button 
                    type="button" 
                    onClick={() => setShowDealsModal(true)}
                    className={`w-full py-4 px-6 rounded-2xl flex items-center justify-between transition-all group ${selectedPersonalDeal && selectedPersonalDeal.code !== "test" ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : "bg-gold-500/10 border border-gold-500/20 text-gold-500 hover:bg-gold-500/20"}`}
                  >
                    <div className="flex items-center gap-3">
                       <Tag size={18} />
                       <span className="text-[10px] font-black uppercase tracking-widest leading-none">Mina Erbjudanden ({personalDeals.length})</span>
                    </div>
                    {selectedPersonalDeal && selectedPersonalDeal.code !== "test" ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black uppercase">{selectedPersonalDeal.code}</span>
                        <X size={14} className="hover:text-white" onClick={(e: any) => { e.stopPropagation(); setSelectedPersonalDeal(null); }} />
                      </div>
                    ) : (
                      <Plus size={16} className="group-hover:rotate-90 transition-transform" />
                    )}
                  </button>
                  {selectedPersonalDeal && selectedPersonalDeal.campaign.minOrder > 0 && subtotal < selectedPersonalDeal.campaign.minOrder && (
                    <p className="text-[9px] text-amber-500 font-black uppercase tracking-widest mt-1.5 ml-2">Min. order ej uppnådd ({selectedPersonalDeal.campaign.minOrder} kr)</p>
                  )}
                </div>
              )}

              {/* Summary */}
              <div className="border-t border-white/5 pt-6 space-y-3">
                <div className="flex justify-between text-zinc-500 text-[10px] font-black uppercase tracking-widest">
                  <span>Delsumma</span><span>{subtotal.toFixed(0)} KR</span>
                </div>
                {orderType === "DELIVERY" && (
                  <div className="flex justify-between text-zinc-500 text-[10px] font-black uppercase tracking-widest">
                    <span>Leverans</span><span>{deliveryFee.toFixed(0)} KR</span>
                  </div>
                )}
                {(automaticDeal.discountAmount > 0 || personalDiscount > 0) && (
                  <div className="flex justify-between text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                    <span>Rabatt ({personalDiscount > automaticDeal.discountAmount ? "Erbjudande" : "Automatisk"})</span>
                    <span>-{finalDiscount.toFixed(0)} KR</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2">
                  <span className="text-lg font-black uppercase italic text-white">Totalt</span>
                  <span className="text-3xl font-black text-gold-500">{total.toFixed(0)} KR</span>
                </div>
              </div>

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-[11px] font-bold">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !user || subtotal < minOrder || !restaurantSettings.isOpen}
                className="w-full py-5 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl shadow-gold-500/20 active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center gap-3"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : subtotal < minOrder ? (
                  `Handla för ${(minOrder - subtotal).toFixed(0)} kr till`
                ) : (
                  <><ChevronRight size={20} /> Gå till betalning</>
                )}
              </button>

              {!restaurantSettings.isOpen && (
                <p className="text-center text-[10px] font-black uppercase tracking-widest text-zinc-600">
                  Restaurangen är stängd just nu
                </p>
              )}
            </form>
          )}
        </div>
      </div>

      {/* Deals Modal */}
      <AnimatePresence>
        {showDealsModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-6">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-zinc-900 border border-white/10 rounded-[3rem] overflow-hidden"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between">
                 <h2 className="text-xl font-black uppercase italic tracking-tighter">Mina <span className="text-gold-500">Deals</span></h2>
                 <button onClick={() => setShowDealsModal(false)} className="p-2 hover:bg-white/5 rounded-xl"><X size={24} className="text-white/20" /></button>
              </div>
              <div className="p-6 space-y-3 max-h-[400px] overflow-y-auto">
                 {personalDeals.map((deal) => {
                   const isEligible = subtotal >= deal.campaign.minOrder;
                   const isSelected = selectedPersonalDeal?.id === deal.id;
                   return (
                     <button 
                       key={deal.id}
                       disabled={!isEligible}
                       onClick={() => { setSelectedPersonalDeal(deal); setShowDealsModal(false); }}
                       className={`w-full text-left p-6 rounded-3xl border transition-all ${isSelected ? "bg-gold-500 border-gold-500 text-dark-500" : isEligible ? "bg-white/5 border-white/10 text-white" : "opacity-30 grayscale cursor-not-allowed border-white/5"}`}
                     >
                       <div className="text-[9px] font-black uppercase tracking-widest opacity-50 mb-1">{deal.campaign.title}</div>
                       <div className="text-xl font-black uppercase italic tracking-tight">{deal.campaign.discountType === "PERCENTAGE" ? `${deal.campaign.discountValue}% RABATT` : `${deal.campaign.discountValue} KR RABATT`}</div>
                       {!isEligible && (
                         <div className="mt-2 text-[8px] font-black uppercase tracking-widest text-amber-500">Kräver {deal.campaign.minOrder} kr</div>
                       )}
                     </button>
                   );
                 })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
