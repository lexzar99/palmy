"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import axios from "axios";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  Store,
  Tag,
  Trash2,
  Truck,
  X,
  Lock
} from "lucide-react";
import { API_URL } from "@/lib/api";
import DealSpotlight from "@/components/DealSpotlight";
import { PublicDeal, formatDealReward, pickBestDeal } from "@/lib/deals";
import { useCartStore } from "@/store/cartStore";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import StripeCheckout from "@/components/StripeCheckout";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "pk_test_placeholder");

const ORDER_HISTORY_KEY = "palmyra_order_history_v2";
const ORDER_DRAFT_KEY = "palmyra_order_draft_v1";
const ORDER_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

const CartPage = () => {
  const { items, removeItem, updateQuantity, getTotal, clearCart, addItem } = useCartStore();
  const router = useRouter();

  const [orderType, setOrderType] = useState<"PICKUP" | "DELIVERY">("DELIVERY");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deals, setDeals] = useState<PublicDeal[]>([]);
  const [menuProducts, setMenuProducts] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    customerName: "",
    customerPhone: "",
    deliveryStreet: "",
    deliveryZip: "",
    note: "",
  });

  const [restaurantSettings, setRestaurantSettings] = useState({
    isOpen: true,
    deliveryFee: 49,
    minOrderAmount: 150,
    estimatedPickupTime: 20,
    estimatedDeliveryTime: 35,
  });

  const [discountCode, setDiscountCode] = useState("");
  const [discountError, setDiscountError] = useState("");
  const [discountSuccess, setDiscountSuccess] = useState("");
  const [activeDiscount, setActiveDiscount] = useState<any>(null);

  const subtotal = getTotal();
  const deliveryFee = orderType === "DELIVERY" ? restaurantSettings.deliveryFee : 0;
  const minOrder = restaurantSettings.minOrderAmount;

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem("platform_user_token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const [settingsRes, dealsRes, menuRes, userRes] = await Promise.all([
        axios.get(`${API_URL}/api/settings`),
        axios.get(`${API_URL}/api/deals`),
        axios.get(`${API_URL}/api/menu/categories`),
        token ? axios.get(`${API_URL}/api/profile`, { headers }) : Promise.resolve({ data: null })
      ]);

      setRestaurantSettings(settingsRes.data);
      setDeals(dealsRes.data || []);
      setMenuProducts(menuRes.data?.flatMap((c: any) => c.products) || []);
      
      if (userRes.data) {
        setUser(userRes.data);
        setFormData(prev => ({
          ...prev,
          customerName: userRes.data.name || prev.customerName,
          customerPhone: userRes.data.phone || prev.customerPhone,
          deliveryStreet: userRes.data.address || prev.deliveryStreet,
          deliveryZip: userRes.data.zip || prev.deliveryZip,
        }));
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const submitOrder = async (paymentIntentId: string) => {
    setLoading(true);
    try {
      const orderData = {
        type: orderType,
        customerName: formData.customerName,
        customerPhone: formData.customerPhone,
        deliveryStreet: formData.deliveryStreet,
        deliveryZip: formData.deliveryZip,
        note: formData.note,
        stripePaymentIntentId: paymentIntentId,
        items: items.map(i => ({
          productId: i.productId,
          quantity: i.quantity,
          selectedExtras: i.extras,
          note: i.note
        }))
      };

      const res = await axios.post(`${API_URL}/api/orders`, orderData, {
        headers: { Authorization: `Bearer ${localStorage.getItem("platform_user_token")}` }
      });
      clearCart();
      router.push(`/order/${res.data.orderId}`);
    } catch (err: any) {
      setError(err.response?.data?.error || "Kunde inte slutföra ordern");
    } finally {
      setLoading(false);
    }
  };

  const startCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user) {
      setError("Logga in för att beställa");
      setTimeout(() => router.push("/profile"), 1500);
      return;
    }

    if (subtotal < minOrder) {
      setError(`Minsta order är ${minOrder} kr`);
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/payments/create-intent`, {
        amount: subtotal - (activeDiscount?.value || 0) + deliveryFee,
      });
      setClientSecret(res.data.clientSecret);
      setShowPayment(true);
    } catch (err) {
      setError("Kunde inte starta betalning");
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen pt-32 text-center">
        <ShoppingBag size={64} className="mx-auto mb-6 text-zinc-800" />
        <h1 className="text-3xl font-black uppercase">Vagnen är tom</h1>
        <Link href="/" className="mt-8 inline-block text-gold-500 font-bold uppercase tracking-widest text-xs">Tillbaka till menyn</Link>
      </div>
    );
  }

  return (
    <div className="pt-32 pb-32 px-6 max-w-4xl mx-auto">
      <h1 className="text-5xl font-black uppercase mb-12 tracking-tight">Kassa</h1>
      
      {!user && (
        <div className="bg-gold-500/10 border border-gold-500/20 p-8 rounded-[2rem] text-center space-y-6 mb-12">
           <Lock size={40} className="mx-auto text-gold-500" />
           <h2 className="text-xl font-black uppercase">Inloggning krävs</h2>
           <p className="text-zinc-500 text-sm">Du behöver vara inloggad för att kunna genomföra ditt köp och se din historik.</p>
           <Link href="/profile" className="block w-full py-5 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase tracking-widest text-sm transition-all active:scale-95 shadow-xl shadow-gold-500/20">
              Logga in nu
           </Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <div className="space-y-6">
           {items.map(item => (
             <div key={item.cartItemId} className="bg-white/5 border border-white/5 p-6 rounded-[2rem] flex justify-between items-center">
                <div>
                   <div className="font-bold uppercase text-sm">{item.quantity}x {item.name}</div>
                   <div className="text-[10px] text-zinc-500 uppercase tracking-widest">{item.price} kr/st</div>
                </div>
                <div className="font-black text-gold-500">{item.price * item.quantity} kr</div>
             </div>
           ))}
        </div>

        <div>
           {showPayment && clientSecret ? (
              <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'night' } }}>
                 <div className="bg-white/5 p-8 rounded-[2rem] border border-white/5">
                    <h2 className="text-xl font-black uppercase mb-6 italic">Betalning</h2>
                    <StripeCheckout amount={subtotal + deliveryFee} onSuccess={submitOrder} />
                 </div>
              </Elements>
           ) : (
             <form onSubmit={startCheckout} className="bg-white/5 border border-white/5 p-8 rounded-[2.5rem] space-y-6">
                <div className="space-y-4">
                   <input required value={formData.customerName} onChange={e => setFormData({...formData, customerName: e.target.value})} placeholder="Namn" className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-gold-500/50" />
                   <input required value={formData.customerPhone} onChange={e => setFormData({...formData, customerPhone: e.target.value})} placeholder="Telefon" className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-gold-500/50" />
                   {orderType === "DELIVERY" && (
                     <>
                        <input required value={formData.deliveryStreet} onChange={e => setFormData({...formData, deliveryStreet: e.target.value})} placeholder="Gata" className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-gold-500/50" />
                        <input required value={formData.deliveryZip} onChange={e => setFormData({...formData, deliveryZip: e.target.value})} placeholder="Postnummer (Lund)" className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-gold-500/50" />
                     </>
                   )}
                </div>

                <div className="pt-6 border-t border-white/5 space-y-3">
                   <div className="flex justify-between text-zinc-500 text-[10px] font-black uppercase tracking-widest">
                      <span>Delsumma</span>
                      <span>{subtotal} KR</span>
                   </div>
                   <div className="flex justify-between text-zinc-500 text-[10px] font-black uppercase tracking-widest">
                      <span>Leverans</span>
                      <span>{deliveryFee} KR</span>
                   </div>
                   <div className="flex justify-between items-center pt-2">
                      <span className="text-xl font-black uppercase">Totalt</span>
                      <span className="text-3xl font-black text-gold-500">{subtotal + deliveryFee} KR</span>
                   </div>
                </div>

                {error && <p className="text-red-500 text-xs text-center font-bold">{error}</p>}

                <button 
                  type="submit"
                  disabled={loading || !user || subtotal < minOrder}
                  className="w-full py-5 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl shadow-gold-500/20 active:scale-95 transition-all disabled:opacity-30"
                >
                   {loading ? <Loader2 className="animate-spin mx-auto" /> : "Gå till betalning"}
                </button>
             </form>
           )}
        </div>
      </div>
    </div>
  );
};

export default CartPage;
