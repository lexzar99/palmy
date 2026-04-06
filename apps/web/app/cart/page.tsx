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
  CreditCard,
  CheckCircle2,
  ArrowRight,
  MapPin,
  Home,
  Briefcase,
  DoorOpen,
  Bell,
  User as UserIcon,
  ParkingCircle,
  KeyRound,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { useCartStore } from "@/store/cartStore";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import StripeCheckout from "@/components/StripeCheckout";
import DealSpotlight from "@/components/DealSpotlight";
import { PublicDeal, pickBestDeal } from "@/lib/deals";

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
  const [deliveryCheck, setDeliveryCheck] = useState<any>(null);
  const [checkingDelivery, setCheckingDelivery] = useState(false);

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
    deliveryInstructions: "",
    note: "",
  });

  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);

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
        // Load saved addresses
        if (token) {
          try {
            const addrRes = await axios.get(`${API_URL}/api/profile/addresses`, { headers });
            setSavedAddresses(addrRes.data || []);
            const defaultAddr = (addrRes.data || []).find((a: any) => a.isDefault);
            if (defaultAddr && !userRes.data.address) {
              setFormData(prev => ({ ...prev, deliveryStreet: defaultAddr.street, deliveryZip: defaultAddr.zip }));
            }
          } catch {}
        }
      }

      // Delivery check if coords available
      if (orderType === "DELIVERY" && currentRestaurantId) {
        const storedCoords = localStorage.getItem("platform_coords");
        if (storedCoords) {
          const { lat, lng } = JSON.parse(storedCoords);
          setCheckingDelivery(true);
          try {
            const dRes = await axios.get(`${API_URL}/api/delivery/check`, { params: { lat, lng, restaurantId: currentRestaurantId } });
            setDeliveryCheck(dRes.data);
            if (dRes.data.available) {
              setRestaurantSettings(prev => ({ 
                ...prev, 
                deliveryFee: dRes.data.deliveryFee,
                minOrderAmount: dRes.data.minOrder
              }));
            }
          } catch {} finally { setCheckingDelivery(false); }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPageLoading(false);
    }
  }, [currentRestaurantId, orderType]);

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

  // Auto-fill delivery address from homepage selection
  useEffect(() => {
    const storedAddress = localStorage.getItem("platform_address");
    const storedType = localStorage.getItem("platform_order_type");
    
    if (storedAddress) {
      // Split by comma: "Street 1, 123 45 City, Country"
      const parts = storedAddress.split(',').map(p => p.trim());
      const street = parts[0] || "";
      
      // Try to find zip in the whole string first
      const zipMatch = storedAddress.match(/\b\d{3}\s?\d{2}\b/);
      const zip = zipMatch ? zipMatch[0] : "";
      
      setFormData(prev => ({
        ...prev,
        deliveryStreet: street,
        deliveryZip: zip || prev.deliveryZip
      }));
    }

    if (storedType === "PICKUP" || storedType === "DELIVERY") {
      setOrderType(storedType as "PICKUP" | "DELIVERY");
    }
  }, [pageLoading]); // Run when page content finishes initial loading

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
        deliveryInstructions: orderType === "DELIVERY" ? formData.deliveryInstructions || undefined : undefined,
        stripePaymentIntentId: paymentIntentId,
        discountCode: selectedPersonalDeal?.code || undefined,
        appliedDealId: selectedPersonalDeal ? undefined : (automaticDeal.deal?.id || undefined),
        restaurantId: useCartStore.getState().restaurantId || undefined,
        lat: localStorage.getItem("platform_coords") ? JSON.parse(localStorage.getItem("platform_coords")!).lat : undefined,
        lng: localStorage.getItem("platform_coords") ? JSON.parse(localStorage.getItem("platform_coords")!).lng : undefined,
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
        await submitOrder("FREE_PROMO");
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
      <div className="min-h-screen bg-obsidian flex flex-col items-center justify-center">
        <Loader2 className="animate-spin text-gold-500" size={40} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-obsidian flex flex-col items-center justify-center p-6 text-center">
        <div className="w-24 h-24 bg-obsidian/40 rounded-[3rem] border border-white/5 flex items-center justify-center mb-8">
          <ShoppingBag size={48} className="text-zinc-800" />
        </div>
        <h1 className="text-4xl font-black uppercase text-white italic tracking-tight mb-4">Din kasse är <span className="text-gold-500">tom</span></h1>
        <p className="text-zinc-600 text-xs font-bold uppercase tracking-[0.3em] mb-12">Det ser lite tomt ut här. Lägg till något gott!</p>
        <Link href="/" className="px-12 py-6 bg-gold-500 text-zinc-950 rounded-[2rem] font-black uppercase tracking-widest text-[11px] shadow-2xl shadow-gold-500/10 active:scale-95 transition-all">Gå till menyn</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-obsidian bg-dot-pattern pt-24 pb-48 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-end justify-between mb-12 px-4">
           <div>
              <h1 className="text-4xl md:text-6xl font-black text-white uppercase italic tracking-tighter leading-none mb-3">Din <span className="text-gold-gradient">Kasse</span></h1>
              <p className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.3em]">Granska dina val och slutför beställning</p>
           </div>
           <Link href="/menu" className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-colors flex items-center gap-2 mb-2 group">
              Lägg till mer <Plus size={14} className="group-hover:rotate-90 transition-transform" />
           </Link>
        </div>

        {!user && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-10 rounded-[3rem] mb-12 border-gold-500/10 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-[-20%] right-[-10%] w-[40%] h-[80%] bg-gold-500/5 blur-[80px] rounded-full" />
            <div className="flex flex-col sm:flex-row items-center gap-8 relative z-10">
               <div className="w-20 h-20 bg-gold-500/10 rounded-[2rem] border border-gold-500/20 flex items-center justify-center text-gold-500 shadow-xl shadow-gold-500/5 group-hover:scale-110 transition-transform">
                  <Lock size={32} />
               </div>
               <div className="text-center sm:text-left flex-1">
                  <h2 className="text-2xl font-black text-white uppercase italic tracking-tight mb-2">Logga in för att beställa</h2>
                  <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest leading-relaxed opacity-60">Du behöver ett konto för att slutföra ditt köp och för att kunna följa din order i realtid.</p>
               </div>
               <div className="flex gap-4 w-full sm:w-auto">
                  <Link href="/profile" className="px-8 py-5 bg-gold-500 text-zinc-950 rounded-[1.8rem] font-black uppercase tracking-widest text-[10px] shadow-xl shadow-gold-500/20 active:scale-95 transition-all">Logga In</Link>
                  <Link href="/register" className="px-8 py-5 border border-white/5 bg-white/3 text-white rounded-[1.8rem] font-black uppercase tracking-widest text-[10px] hover:bg-white/5 active:scale-95 transition-all">Skapa Konto</Link>
               </div>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* Cart items list */}
          <div className="lg:col-span-12 xl:col-span-7 space-y-4">
            {deals.length > 0 && <DealSpotlight deals={deals} subtotal={subtotal} productIds={productIds} />}
            <div className="space-y-4">
              {items.map((item) => (
                <motion.div key={item.cartItemId} layout className="glass-panel p-6 rounded-[2.5rem] flex flex-col sm:flex-row sm:items-center justify-between gap-6 hover:bg-white/5 transition-all group">
                   <div className="flex items-center gap-6">
                      <div className="w-14 h-14 bg-obsidian border border-white/5 rounded-3xl flex items-center justify-center text-gold-500 font-black italic text-lg shadow-inner">
                         {item.quantity}x
                      </div>
                      <div>
                         <h3 className="text-lg font-black text-white uppercase italic tracking-tight mb-1 group-hover:text-gold-500 transition-colors uppercase">{item.name}</h3>
                         {item.extras.length > 0 && (
                           <div className="flex flex-wrap gap-2">
                              {item.extras.map(e => (
                                 <span key={e.extraId} className="text-[8px] font-black uppercase tracking-[0.1em] text-zinc-700 bg-obsidian/40 px-2 py-0.5 rounded-md border border-white/5">{e.name}</span>
                              ))}
                           </div>
                         )}
                      </div>
                   </div>
                   <div className="flex items-center justify-between sm:justify-end gap-10">
                      <div className="flex items-center gap-6 glass-panel px-4 py-3 rounded-2xl border-white/5">
                         <button onClick={() => { if (item.quantity === 1) { removeItem(item.cartItemId); } else { updateQuantity(item.cartItemId, -1); } }} className="text-zinc-500 hover:text-white transition-colors active:scale-75"><Minus size={18} /></button>
                         <span className="text-base font-black text-white w-4 text-center italic">{item.quantity}</span>
                         <button onClick={() => updateQuantity(item.cartItemId, 1)} className="text-zinc-500 hover:text-white transition-colors active:scale-75"><Plus size={18} /></button>
                      </div>
                      <div className="flex items-center gap-8">
                         <div className="text-lg font-black italic text-white flex flex-col items-end">
                            <span className="text-gold-500">{(item.price * item.quantity).toFixed(0)}</span>
                            <span className="text-[8px] uppercase tracking-widest text-zinc-800 leading-none">SEK</span>
                         </div>
                         <button onClick={() => removeItem(item.cartItemId)} className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center text-zinc-500 hover:text-rose-500 hover:bg-rose-500/10 transition-all active:scale-90">
                            <Trash2 size={20} />
                         </button>
                      </div>
                   </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Form & Payment */}
          <div className="lg:col-span-12 xl:col-span-5">
             <AnimatePresence mode="wait">
               {showPayment && clientSecret ? (
                 <motion.div key="payment" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="glass-panel p-10 rounded-[3.5rem] border-white/10 shadow-2xl">
                    <div className="flex items-center gap-3 text-gold-500 text-[10px] font-black uppercase tracking-[0.4em] mb-10">
                       <CreditCard size={18} /> Betala Tryggt
                    </div>
                    <div className="bg-obsidian/40 rounded-3xl p-6 mb-10 border border-white/5">
                       <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'night', variables: { colorPrimary: '#e7b24b', colorBackground: '#09090b', colorText: '#ffffff' } } }}>
                          <StripeCheckout amount={total} onSuccess={submitOrder} />
                       </Elements>
                    </div>
                    <button onClick={() => setShowPayment(false)} className="w-full text-[10px] font-black uppercase tracking-widest text-zinc-700 hover:text-white transition-colors">← Tillbaka till uppgifter</button>
                 </motion.div>
               ) : (
                 <motion.div key="form" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-panel p-10 rounded-[3.5rem] shadow-2xl relative">
                    <div className="flex gap-4 p-1.5 glass-panel rounded-[1.8rem] mb-10">
                       {(['DELIVERY', 'PICKUP'] as const).map(type => (
                          <button key={type} type="button" onClick={() => setOrderType(type)} className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-[1.4rem] text-[10px] font-black uppercase tracking-widest transition-all ${orderType === type ? 'bg-gold-500 text-zinc-950 shadow-lg shadow-gold-500/20' : 'text-zinc-600 hover:text-zinc-200'}`}>
                             {type === 'DELIVERY' ? <Truck size={16} /> : <Store size={16} />}
                             {type === 'DELIVERY' ? 'Leverans' : 'Hämtning'}
                          </button>
                       ))}
                    </div>

                    <div className="space-y-8">
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div className="space-y-2">
                             <label className="text-[9px] font-black uppercase tracking-widest text-zinc-700 ml-3">Ditt Namn</label>
                             <input value={formData.customerName} onChange={e => setFormData({...formData, customerName: e.target.value})} className="w-full bg-obsidian/60 border border-white/5 rounded-2xl p-5 text-sm font-bold text-white focus:border-gold-500/40 outline-none transition-all" placeholder="Namn" />
                          </div>
                          <div className="space-y-2">
                             <label className="text-[9px] font-black uppercase tracking-widest text-zinc-700 ml-3">Telefon</label>
                             <input value={formData.customerPhone} onChange={e => setFormData({...formData, customerPhone: e.target.value})} className="w-full bg-obsidian/60 border border-white/5 rounded-2xl p-5 text-sm font-bold text-white focus:border-gold-500/40 outline-none transition-all" placeholder="Nummer" />
                          </div>
                       </div>

                       {orderType === 'DELIVERY' && (
                          <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                             { (savedAddresses.length > 0 || user?.address) && (
                               <div className="space-y-2">
                                 <label className="text-[9px] font-black uppercase tracking-widest text-zinc-700 ml-3">Snabbval</label>
                                 <div className="flex gap-2 flex-wrap">
                                   {user?.address && !savedAddresses.find(a => a.street === user.address) && (
                                      <button
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, deliveryStreet: user.address, deliveryZip: user.zip || "" }))}
                                        className={`flex items-center gap-2 px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all active:scale-95 ${
                                          formData.deliveryStreet === user.address
                                            ? 'bg-gold-500/10 border-gold-500/30 text-gold-500'
                                            : 'bg-white/3 border-white/5 text-zinc-500 hover:text-white hover:border-white/10'
                                        }`}
                                      >
                                        <Home size={12} /> Hemadress
                                      </button>
                                   )}
                                   {savedAddresses.map(addr => (
                                     <button
                                       key={addr.id}
                                       type="button"
                                       onClick={() => setFormData(prev => ({ ...prev, deliveryStreet: addr.street, deliveryZip: addr.zip }))}
                                       className={`flex items-center gap-2 px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all active:scale-95 ${
                                         formData.deliveryStreet === addr.street && formData.deliveryZip === addr.zip
                                           ? 'bg-gold-500/10 border-gold-500/30 text-gold-500'
                                           : 'bg-white/3 border-white/5 text-zinc-500 hover:text-white hover:border-white/10'
                                       }`}
                                     >
                                       {addr.label === 'Hem' ? <Home size={12} /> : addr.label === 'Jobb' ? <Briefcase size={12} /> : <MapPin size={12} />}
                                       {addr.label}
                                     </button>
                                   ))}
                                 </div>
                               </div>
                             )}
                             <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-zinc-700 ml-3">Gatuadress</label>
                                <input value={formData.deliveryStreet} onChange={e => setFormData({...formData, deliveryStreet: e.target.value})} className="w-full bg-obsidian/60 border border-white/5 rounded-2xl p-5 text-sm font-bold text-white focus:border-gold-500/40 outline-none transition-all" placeholder="Gatan 1" />
                             </div>
                             <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-zinc-700 ml-3">Postnummer</label>
                                <input value={formData.deliveryZip} onChange={e => setFormData({...formData, deliveryZip: e.target.value})} className="w-full bg-obsidian/60 border border-white/5 rounded-2xl p-5 text-sm font-bold text-white focus:border-gold-500/40 outline-none transition-all" placeholder="123 45" />
                             </div>

                             {/* Delivery Instructions Presets */}
                             <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-zinc-700 ml-3">Leveransinstruktioner</label>
                                <div className="grid grid-cols-2 gap-2">
                                  {[
                                    { value: 'RING_DOORBELL', label: 'Ring på dörren', icon: Bell },
                                    { value: 'LEAVE_AT_DOOR', label: 'Lämna vid dörren', icon: DoorOpen },
                                    { value: 'MEET_OUTSIDE', label: 'Möt mig utanför', icon: UserIcon },
                                    { value: 'ENTER_CODE', label: 'Portkod behövs', icon: KeyRound },
                                  ].map(opt => (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      onClick={() => setFormData(prev => ({ ...prev, deliveryInstructions: prev.deliveryInstructions === opt.value ? '' : opt.value }))}
                                      className={`flex items-center gap-2.5 px-4 py-3.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all active:scale-95 ${
                                        formData.deliveryInstructions === opt.value
                                          ? 'bg-gold-500/10 border-gold-500/30 text-gold-500'
                                          : 'bg-white/3 border-white/5 text-zinc-600 hover:text-zinc-300 hover:border-white/10'
                                      }`}
                                    >
                                      <opt.icon size={14} />
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                             </div>
                          </div>
                       )}

                       <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-widest text-zinc-700 ml-3">Extranotering</label>
                          <textarea rows={2} value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} className="w-full bg-obsidian/60 border border-white/5 rounded-2xl p-5 text-sm font-bold text-white focus:border-gold-500/40 outline-none transition-all resize-none" placeholder="T.ex. portkod 1234, ingen lök i kebaben..." />
                       </div>

                       {/* Promo Code Integrated */}
                       <div className="relative group flex items-center">
                          <Tag size={16} className="absolute left-6 text-gold-500/40 group-focus-within:text-gold-500 transition-colors pointer-events-none" />
                          <input 
                             value={selectedPersonalDeal ? selectedPersonalDeal.code : promoCodeInput} 
                             onChange={e => { if(selectedPersonalDeal) setSelectedPersonalDeal(null); setPromoCodeInput(e.target.value); }}
                             className={`w-full bg-obsidian/60 border rounded-2xl py-6 pl-14 pr-24 text-[11px] font-black uppercase tracking-widest outline-none transition-all ${selectedPersonalDeal ? "border-emerald-500/40 text-emerald-400" : "border-white/5 text-zinc-500 focus:border-gold-500/40"}`}
                             placeholder={selectedPersonalDeal ? "Tillämpad" : "Rabattkod"} 
                          />
                          <button 
                             type="button" 
                             onClick={selectedPersonalDeal ? () => { setSelectedPersonalDeal(null); setPromoCodeInput(""); } : handleApplyPromo}
                             className={`absolute right-3 px-6 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${selectedPersonalDeal ? "bg-rose-500/10 text-rose-500 hover:bg-rose-500/20" : "bg-white/10 text-gold-500 hover:bg-gold-500 hover:text-dark-500"}`}
                          >
                             {selectedPersonalDeal ? "Ta Bort" : "Kolla"}
                          </button>
                       </div>
                    </div>

                    <div className="border-t border-white/5 mt-10 pt-10 space-y-4">
                       <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-zinc-700"><span>Delsumma</span><span>{subtotal.toFixed(0)} KR</span></div>
                       {orderType === 'DELIVERY' && <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-zinc-700"><span>Frakt</span><span className="text-gold-500">{deliveryFee.toFixed(0)} KR</span></div>}
                       {finalDiscount > 0 && <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-emerald-500 italic"><span>Rabatt</span><span>-{finalDiscount.toFixed(0)} KR</span></div>}
                       <div className="flex justify-between items-center mt-6">
                          <span className="text-3xl font-black text-white italic uppercase tracking-tighter">TOTALT</span>
                          <span className="text-5xl font-black text-white italic tracking-tighter leading-none text-gold-gradient">{total.toFixed(0)} <span className="text-xs opacity-50 not-italic">SEK</span></span>
                       </div>
                    </div>

                    {error && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8 p-5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[10px] font-black uppercase tracking-widest text-center italic">{error}</motion.div>}

                    <button 
                       onClick={startCheckout} 
                       disabled={loading || !user || subtotal < minOrder || !restaurantSettings.isOpen}
                       className="w-full mt-10 py-6 bg-gold-500 hover:bg-gold-400 text-zinc-950 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs shadow-2xl shadow-gold-500/20 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-4 group"
                    >
                       {loading ? <Loader2 className="animate-spin" size={24} /> : subtotal < minOrder ? `Köp för ${minOrder - subtotal} kr till` : <>Slutför Köp <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform" /></>}
                    </button>
                 </motion.div>
               )}
             </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Modern Deals Modal */}
      <AnimatePresence>
        {showDealsModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-obsidian/95 backdrop-blur-md p-6" onClick={() => setShowDealsModal(false)}>
            <motion.div initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 30 }} className="w-full max-w-sm glass-panel p-10 rounded-[3.5rem] relative" onClick={e => e.stopPropagation()}>
               <button onClick={() => setShowDealsModal(false)} className="absolute top-8 right-8 p-2 text-zinc-800 hover:text-white transition-colors"><X size={24}/></button>
               <h2 className="text-2xl font-black uppercase text-white italic tracking-tight mb-8">Dina <span className="text-gold-gradient">Erbjudanden</span></h2>
               <div className="space-y-4 max-h-[400px] overflow-y-auto no-scrollbar">
                  {personalDeals.map(deal => {
                    const isEligible = subtotal >= deal.campaign.minOrder;
                    return (
                       <button key={deal.id} disabled={!isEligible} onClick={() => { setSelectedPersonalDeal(deal); setShowDealsModal(false); }} className={`w-full text-left p-6 rounded-[2.2rem] border transition-all ${isEligible ? "bg-white/3 border-white/5 hover:border-gold-500/40 group active:scale-[0.98]" : "opacity-30 border-white/2 grayscale"}`}>
                          <div className="flex items-center justify-between mb-4">
                             <div className="text-[9px] font-black uppercase tracking-widest text-zinc-700">{deal.campaign.title}</div>
                             {isEligible && <div className="px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-md text-[8px] font-black uppercase">REDO</div>}
                          </div>
                          <div className="text-2xl font-black text-white italic uppercase tracking-tighter leading-none mb-2 group-hover:text-gold-500 transition-colors">
                             {deal.campaign.discountType === "PERCENTAGE" ? `${deal.campaign.discountValue}% RABATT` : `${deal.campaign.discountValue} KR RABATT`}
                          </div>
                          <div className="text-[9px] font-bold text-zinc-800 uppercase tracking-widest">Gäller vid köp över {deal.campaign.minOrder} kr</div>
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
