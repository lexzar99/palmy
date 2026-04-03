"use client";

import { useMemo, useState, useEffect } from "react";
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
} from "lucide-react";
import { API_URL } from "@/lib/api";
import DealSpotlight from "@/components/DealSpotlight";
import { PublicDeal, formatDealReward, pickBestDeal } from "@/lib/deals";
import { useCartStore } from "@/store/cartStore";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import StripeCheckout from "@/components/StripeCheckout";

// Replace with your actual publishable key or use an env variable
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "pk_test_placeholder");


const ORDER_HISTORY_KEY = "palmyra_order_history_v2";
const ORDER_DRAFT_KEY = "palmyra_order_draft_v1";
const ORDER_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

type StoredOrderDraft = {
  draftId: string;
  createdAt: number;
};

const saveDraftIdToStorage = (draftId: string) => {
  try {
    const payload: StoredOrderDraft = { draftId, createdAt: Date.now() };
    localStorage.setItem(ORDER_DRAFT_KEY, JSON.stringify(payload));
  } catch (storageError) {
    console.warn("Could not persist draft id:", storageError);
  }
};

const getDraftIdFromStorage = (): string | null => {
  try {
    const raw = localStorage.getItem(ORDER_DRAFT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredOrderDraft>;
    if (!parsed?.draftId || !parsed?.createdAt) {
      localStorage.removeItem(ORDER_DRAFT_KEY);
      return null;
    }

    if (Date.now() - parsed.createdAt > ORDER_DRAFT_TTL_MS) {
      localStorage.removeItem(ORDER_DRAFT_KEY);
      return null;
    }

    return parsed.draftId;
  } catch {
    localStorage.removeItem(ORDER_DRAFT_KEY);
    return null;
  }
};

const clearDraftIdFromStorage = () => {
  localStorage.removeItem(ORDER_DRAFT_KEY);
};

const SOFT_DRINK_MATCHERS = [
  { label: "Cola", matcher: /^(coca[\s-]?cola|cola)$/i },
  { label: "Cola Zero", matcher: /cola\s*zero/i },
  { label: "Fanta", matcher: /fanta/i },
  { label: "Sprite", matcher: /sprite/i },
];

type MenuProduct = {
  id: string;
  name: string;
  price: number;
  extraGroups?: {
    id: string;
    name: string;
    extras: {
      id: string;
      name: string;
      priceAddon: number;
      isDefault?: boolean;
    }[];
  }[];
};

const getDefaultExtras = (product: MenuProduct, preferredSize?: string) => {
  const extras: {
    groupId: string;
    groupName: string;
    extraId: string;
    name: string;
    price: number;
  }[] = [];

  for (const group of product.extraGroups || []) {
    if (!group.extras?.length) continue;

    const preferred =
      preferredSize && /volym|storlek/i.test(group.name)
        ? group.extras.find((extra) => extra.name.toLowerCase() === preferredSize.toLowerCase())
        : null;
    const fallback = group.extras.find((extra) => extra.isDefault) || group.extras[0];
    const selected = preferred || fallback;

    if (!selected) continue;

    extras.push({
      groupId: group.id,
      groupName: group.name,
      extraId: selected.id,
      name: selected.name,
      price: selected.priceAddon,
    });
  }

  return extras;
};

const CartPage = () => {
  const { items, removeItem, updateQuantity, getTotal, clearCart, addItem } = useCartStore();
  const router = useRouter();

  const [orderType, setOrderType] = useState<"PICKUP" | "DELIVERY">("DELIVERY");
  const [addressPrefilled, setAddressPrefilled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deals, setDeals] = useState<PublicDeal[]>([]);
  const [menuProducts, setMenuProducts] = useState<MenuProduct[]>([]);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [upsellHandled, setUpsellHandled] = useState(false);
  const [pendingSubmission, setPendingSubmission] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);


  const [formData, setFormData] = useState({
    customerName: "",
    customerPhone: "",
    deliveryStreet: "",
    deliveryZip: "",
    note: "",
  });

  // Pre-fill from homepage selections
  useEffect(() => {
    if (typeof window !== "undefined" && !addressPrefilled) {
      const savedType = localStorage.getItem("platform_order_type");
      if (savedType === "PICKUP" || savedType === "DELIVERY") setOrderType(savedType);
      const savedAddress = localStorage.getItem("platform_address");
      if (savedAddress) {
        const parts = savedAddress.split(",").map(s => s.trim());
        setFormData(prev => ({ ...prev, deliveryStreet: parts[0] || prev.deliveryStreet }));
      }
      setAddressPrefilled(true);
    }
  }, [addressPrefilled]);

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
  const [activeDiscount, setActiveDiscount] = useState<{ type: string; value: number; code: string; desc: string } | null>(null);

  useEffect(() => {
    const fetchCheckoutContext = async () => {
      try {
        const [settingsRes, dealsRes, menuRes] = await Promise.all([
          axios.get(`${API_URL}/api/settings`),
          axios.get(`${API_URL}/api/deals`),
          axios.get(`${API_URL}/api/menu/categories`),
        ]);

        setRestaurantSettings({
          isOpen: settingsRes.data.isOpen ?? true,
          deliveryFee: settingsRes.data.deliveryFee ?? 49,
          minOrderAmount: settingsRes.data.minOrderAmount ?? 150,
          estimatedPickupTime: settingsRes.data.estimatedPickupTime ?? 20,
          estimatedDeliveryTime: settingsRes.data.estimatedDeliveryTime ?? 35,
        });
        setDeals(dealsRes.data || []);
        setMenuProducts((menuRes.data || []).flatMap((category: any) => category.products || []));
      } catch (fetchError) {
        console.error("Error loading checkout context:", fetchError);
      }
    };

    fetchCheckoutContext();

    // Check for payment redirect recovery
    const urlParams = new URLSearchParams(window.location.search);
    const paymentIntent = urlParams.get("payment_intent");
    const status = urlParams.get("redirect_status");
    const paymentSuccess = urlParams.get("payment_success");

    if (paymentIntent && (status === "succeeded" || paymentSuccess === "true")) {
      const redirectDraftId = urlParams.get("draftId") || getDraftIdFromStorage();
      if (redirectDraftId) {
        handleRedirectRecovery(redirectDraftId, paymentIntent);
      } else {
        setError("Betalningen lyckades, men vi kunde inte hitta orderutkastet. Kontakta restaurangen omedelbart!");
      }
    }
  }, []);

  const handleRedirectRecovery = async (draftId: string, paymentIntentId: string) => {
    setLoading(true);
    setError("Slutför din beställning...");
    
    try {
      // Get draft from backend
      const resDraft = await axios.get(`${API_URL}/api/orders/draft/${draftId}`);
      const draft = resDraft.data;
      
      // Submit the real order using draft data
      const orderData = {
        ...draft,
        stripePaymentIntentId: paymentIntentId,
      };

      const res = await axios.post(`${API_URL}/api/orders`, orderData);
      const savedOrders = JSON.parse(localStorage.getItem(ORDER_HISTORY_KEY) || "[]");
      localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify([res.data.orderId, ...savedOrders].slice(0, 10)));
      clearDraftIdFromStorage();
      
      // Success! Clear cart
      clearCart();
      router.push(`/order/${res.data.orderId}`);
    } catch (err: any) {
      console.error("Redirect recovery failed:", err);
      if (err.response?.data?.details) {
        console.error("Validation details:", JSON.stringify(err.response.data.details, null, 2));
      }
      const backendMessage =
        err.response?.data?.error ||
        err.response?.data?.details?.[0]?.message ||
        null;
      setError(
        backendMessage
          ? `Betalningen lyckades, men ordern kunde inte slutföras automatiskt: ${backendMessage}. Kontakta restaurangen omedelbart!`
          : "Betalningen lyckades, men ordern kunde inte slutföras automatiskt. Kontakta restaurangen omedelbart!"
      );
    } finally {
      setLoading(false);
    }
  };

  const minOrder = restaurantSettings.minOrderAmount;
  const subtotal = getTotal();
  const deliveryFee = orderType === "DELIVERY" ? restaurantSettings.deliveryFee : 0;
  const productIds = items.flatMap((item) => Array.from({ length: item.quantity }, () => item.productId));

  const calculateManualDiscount = () => {
    if (!activeDiscount) return 0;
    if (activeDiscount.type === "PERCENTAGE") {
      return (subtotal * activeDiscount.value) / 100;
    }
    return Math.min(activeDiscount.value, subtotal);
  };

  const manualDiscountAmount = calculateManualDiscount();
  const automaticDeal = useMemo(() => pickBestDeal(deals, subtotal, productIds), [deals, subtotal, productIds]);
  const automaticDiscountAmount = automaticDeal.discountAmount;

  const appliedDiscountAmount = manualDiscountAmount >= automaticDiscountAmount ? manualDiscountAmount : automaticDiscountAmount;
  const appliedDealTitle = manualDiscountAmount >= automaticDiscountAmount
    ? activeDiscount?.desc || activeDiscount?.code || null
    : automaticDeal.deal?.title || null;

  const total = subtotal - appliedDiscountAmount + deliveryFee;

  const drinkOptions = useMemo(() => {
    return SOFT_DRINK_MATCHERS.map((entry) => {
      const product = menuProducts.find((candidate) => entry.matcher.test(candidate.name));
      return product ? { ...product, displayName: entry.label } : null;
    }).filter(Boolean) as (MenuProduct & { displayName: string })[];
  }, [menuProducts]);

  const hasDrinkInCart = items.some((item) =>
    /cola|fanta|sprite|loka|mer|dryck/i.test(item.name)
  );
  const canOfferUpsell = items.length > 0 && !hasDrinkInCart && drinkOptions.length > 0;

  const validateDiscount = async () => {
    setDiscountError("");
    setDiscountSuccess("");
    if (!discountCode.trim()) return;

    try {
      const res = await axios.post(`${API_URL}/api/orders/validate-discount`, {
        code: discountCode,
        subtotal,
      });
      setActiveDiscount({
        type: res.data.type,
        value: res.data.value,
        code: discountCode.toUpperCase(),
        desc: res.data.description,
      });
      setDiscountSuccess(`Kampanj: ${res.data.description}`);
    } catch (err: any) {
      setActiveDiscount(null);
      setDiscountError(err.response?.data?.error || "Ogiltig kod");
    }
  };

  const removeDiscount = () => {
    setActiveDiscount(null);
    setDiscountCode("");
    setDiscountSuccess("");
  };

  const submitOrder = async (paymentIntentId: string) => {
    setError(null);
    setLoading(true);

    try {
      const orderData = {
        type: orderType,
        customerName: formData.customerName,
        customerPhone: formData.customerPhone,
        deliveryStreet: formData.deliveryStreet || undefined,
        deliveryZip: formData.deliveryZip || undefined,
        note: formData.note || undefined,
        discountCode: activeDiscount?.code || undefined,
        stripePaymentIntentId: paymentIntentId,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          selectedExtras: item.extras.map((extra) => ({
            groupId: extra.groupId,
            groupName: extra.groupName,
            extraId: extra.extraId,
            extraName: extra.name,
            priceAddon: extra.price,
          })),
          note: item.note,
        })),
      };

      const res = await axios.post(`${API_URL}/api/orders`, orderData);
      const savedOrders = JSON.parse(localStorage.getItem(ORDER_HISTORY_KEY) || "[]");
      localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify([res.data.orderId, ...savedOrders].slice(0, 10)));
      clearDraftIdFromStorage();
      clearCart();
      router.push(`/order/${res.data.orderId}`);
    } catch (err: any) {
      const message =
        err.response?.data?.error ||
        err.response?.data?.details?.[0]?.message ||
        "Kunde inte spara din order. Betalningen gick dock igenom - kontakta oss!";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const startCheckout = async () => {
    setError(null);
    
    // Basic form validation
    if (!formData.customerName || !formData.customerPhone) {
      setError("Ange namn och telefonnummer.");
      return;
    }
    if (orderType === "DELIVERY" && (!formData.deliveryStreet || !formData.deliveryZip)) {
      setError("Ange fullständig adress för hemkörning.");
      return;
    }

    if (!restaurantSettings.isOpen) {
      setError("Restaurangen är stängd just nu.");
      return;
    }

    if (subtotal < minOrder) {
      setError(`Minsta ordervärde är ${minOrder} kr.`);
      return;
    }

    setLoading(true);

    try {
      // 1. Save order draft to DB before starting checkout
      const draftData = {
        type: orderType,
        customerName: formData.customerName,
        customerPhone: formData.customerPhone,
        deliveryStreet: formData.deliveryStreet || undefined,
        deliveryZip: formData.deliveryZip || undefined,
        note: formData.note || undefined,
        discountCode: activeDiscount?.code || undefined,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          selectedExtras: item.extras.map((extra) => ({
            groupId: extra.groupId,
            groupName: extra.groupName,
            extraId: extra.extraId,
            extraName: extra.name,
            priceAddon: extra.price,
          })),
          note: item.note,
        })),
      };

      const draftRes = await axios.post(`${API_URL}/api/orders/draft`, draftData);
      const newDraftId = draftRes.data.draftId;
      setDraftId(newDraftId);
      saveDraftIdToStorage(newDraftId);

      // 2. Create Payment Intent with draftId in metadata
      const res = await axios.post(`${API_URL}/api/payments/create-intent`, {
        amount: total,
        metadata: {
          draftId: newDraftId,
          customerName: formData.customerName,
          orderType: orderType,
        }
      });


      setClientSecret(res.data.clientSecret);
      setShowPayment(true);
      // Ensure we scroll to the payment section
      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      }, 100);
    } catch (err: any) {
      if (err.response?.status === 401) {
        setError("Stripe API-nycklar saknas eller är ogiltiga. Kontrollera dina .env-filer.");
      } else {
        setError("Kunde inte starta betalningen. Försök igen.");
      }
      console.error("Stripe Intent Error:", err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (canOfferUpsell && !upsellHandled) {
      setUpsellOpen(true);
      setPendingSubmission(true);
      return;
    }

    await startCheckout();
  };


  const handleUpsellSkip = async () => {
    setUpsellHandled(true);
    setUpsellOpen(false);

    if (pendingSubmission) {
      await startCheckout();
    }
  };


  const handleUpsellSelect = (product: MenuProduct & { displayName: string }) => {
    addItem({
      productId: product.id,
      name: product.displayName,
      price: product.price,
      quantity: 1,
      extras: getDefaultExtras(product, "33cl"),
    });
    setUpsellHandled(true);
    setUpsellOpen(false);
    setPendingSubmission(false);
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen pt-32 pb-24 px-6 flex flex-col items-center justify-center text-center">
        <div className="w-24 h-24 bg-white/5 rounded-3xl flex items-center justify-center text-gold-500 mb-8 border border-white/5">
          <ShoppingBag size={48} />
        </div>
        <h1 className="text-4xl font-bold mb-4">Din varukorg är tom</h1>
        <p className="text-white/40 max-w-md mx-auto mb-10 text-lg">Lägg till något gott från menyn!</p>
        <Link href="/menu" className="px-8 py-4 bg-gold-500 text-dark-500 font-bold rounded-2xl hover:bg-gold-400 transition-all uppercase tracking-widest">
          Visa menyn
        </Link>
      </div>
    );
  }

  return (
    <div className="pt-32 pb-24 px-6 max-w-7xl mx-auto">
      <h1 className="text-4xl md:text-6xl font-black mb-12 uppercase tracking-tight">Varukorg</h1>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-7 space-y-6">
          {deals.length > 0 && (
            <DealSpotlight deals={deals} subtotal={subtotal} productIds={productIds} />
          )}

          <AnimatePresence mode="popLayout">
            {items.map((item) => (
              <motion.div
                key={item.cartItemId}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col md:flex-row gap-6 md:items-center justify-between group"
              >
                <div>
                  <h3 className="text-xl font-bold uppercase group-hover:text-gold-500 transition-colors">{item.name}</h3>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {item.extras.map((extra) => (
                      <span key={extra.extraId} className="text-[10px] font-bold text-white/40 uppercase bg-white/5 px-2 py-0.5 rounded-full">
                        {extra.name}
                      </span>
                    ))}
                  </div>
                  {item.note && <p className="text-sm text-white/30 mt-3">{item.note}</p>}
                </div>

                <div className="flex items-center justify-between md:justify-end gap-x-8">
                  <div className="flex items-center gap-4 bg-white/5 p-1 px-4 rounded-xl border border-white/5">
                    <button onClick={() => updateQuantity(item.cartItemId, -1)} className="p-1 text-white/40 hover:text-white transition-colors">
                      <Minus size={16} />
                    </button>
                    <span className="font-bold w-4 text-center">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.cartItemId, 1)} className="p-1 text-white/40 hover:text-white transition-colors">
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="text-xl font-black text-gold-500 w-24 text-right">
                    {((item.price + item.extras.reduce((sum, extra) => sum + extra.price, 0)) * item.quantity).toFixed(0)} kr
                  </div>
                  <button onClick={() => removeItem(item.cartItemId)} className="p-2 text-white/20 hover:text-red-500 transition-colors">
                    <Trash2 size={20} />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="lg:col-span-5">
            {!showPayment ? (
              <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-[2rem] p-8 md:p-10 sticky top-32">
                <div className="flex gap-4 mb-8 p-1.5 bg-dark-500 rounded-2xl border border-white/5">
                  {(["PICKUP", "DELIVERY"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setOrderType(type)}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm uppercase transition-all ${
                        orderType === type ? "bg-white/10 text-gold-500 shadow-xl" : "text-white/40 hover:bg-white/5"
                      }`}
                    >
                      {type === "PICKUP" ? <Store size={18} /> : <Truck size={18} />}
                      {type === "PICKUP" ? "Avhämtning" : "Hemkörning"}
                    </button>
                  ))}
                </div>

                <div className="space-y-6 mb-10">
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/70">
                    {orderType === "DELIVERY"
                      ? `Hemkörning ${deliveryFee.toFixed(0)} kr. Minsta order ${minOrder.toFixed(0)} kr.`
                      : `Avhämtning redo om cirka ${restaurantSettings.estimatedPickupTime} min.`}
                  </div>

                  <div>
                    <label className="block text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2 ml-1">Namn</label>
                    <input required type="text" value={formData.customerName} onChange={(e) => setFormData({ ...formData, customerName: e.target.value })} placeholder="För- och efternamn" className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-gold-500/50 transition-all font-medium" />
                  </div>

                  <div>
                    <label className="block text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2 ml-1">Telefon</label>
                    <input required type="tel" value={formData.customerPhone} onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })} placeholder="070-000 00 00" className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-gold-500/50 transition-all font-medium" />
                  </div>

                  <AnimatePresence>
                    {orderType === "DELIVERY" && (
                      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                        <div>
                          <label className="block text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2 ml-1">Gatuadress</label>
                          <input required type="text" value={formData.deliveryStreet} onChange={(e) => setFormData({ ...formData, deliveryStreet: e.target.value })} placeholder="Gatunamn och nummer" className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-gold-500/50 transition-all font-medium" />
                        </div>
                        <div>
                          <label className="block text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2 ml-1">Postnummer</label>
                          <input required type="text" value={formData.deliveryZip} onChange={(e) => setFormData({ ...formData, deliveryZip: e.target.value })} placeholder="Ange valfritt postnummer" className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-gold-500/50 transition-all font-medium" />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div>
                    <label className="block text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2 ml-1">Övrigt (valfritt)</label>
                    <textarea rows={2} value={formData.note} onChange={(e) => setFormData({ ...formData, note: e.target.value })} placeholder="Allergier, portkod, önskemål..." className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-gold-500/50 transition-all font-medium resize-none" />
                  </div>
                </div>

                <div className="mb-10">
                  <label className="block text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2 ml-1">Rabattkod</label>
                  {!activeDiscount ? (
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Tag className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={16} />
                        <input
                          type="text"
                          value={discountCode}
                          onChange={(e) => setDiscountCode(e.target.value)}
                          placeholder="Ange kod"
                          className="w-full bg-white/5 border border-white/5 rounded-2xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-gold-500/50 transition-all font-medium uppercase"
                        />
                      </div>
                      <button type="button" onClick={validateDiscount} className="bg-white/10 hover:bg-white/20 text-white font-bold px-6 rounded-2xl transition-colors">
                        Använd
                      </button>
                    </div>
                  ) : (
                    <div className="relative bg-gold-500/10 border border-gold-500/20 text-gold-500 rounded-2xl py-3 px-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Tag size={16} />
                        <span className="font-bold uppercase tracking-wider">{activeDiscount.code}</span>
                      </div>
                      <button type="button" onClick={removeDiscount} className="text-white/40 hover:text-white p-1">
                        <X size={16} />
                      </button>
                    </div>
                  )}
                  {discountError && <p className="text-red-400 text-xs mt-2 ml-1 font-medium">{discountError}</p>}
                  {discountSuccess && <p className="text-green-400 text-xs mt-2 ml-1 font-medium">{discountSuccess}</p>}
                </div>

                <div className="space-y-4 border-t border-white/5 pt-8 mb-8">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-white/40 uppercase font-bold tracking-widest">Delsumma</span>
                    <span className="font-bold">{subtotal.toFixed(0)} KR</span>
                  </div>

                  {appliedDiscountAmount > 0 && (
                    <div className="flex justify-between items-center text-sm text-gold-500">
                      <div>
                        <div className="uppercase font-bold tracking-widest">Deal</div>
                        {appliedDealTitle && <div className="text-[11px] text-white/35 font-bold normal-case tracking-normal">{appliedDealTitle}</div>}
                      </div>
                      <span className="font-bold">-{appliedDiscountAmount.toFixed(0)} KR</span>
                    </div>
                  )}

                  {automaticDeal.deal && manualDiscountAmount < automaticDiscountAmount && (
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
                      Aktiv deal: {automaticDeal.deal.title} · {formatDealReward(automaticDeal.deal)}
                    </div>
                  )}

                  {orderType === "DELIVERY" && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-white/40 uppercase font-bold tracking-widest">Leverans</span>
                      <span className="font-bold">{deliveryFee.toFixed(0)} KR</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-4">
                    <span className="text-xl font-black uppercase tracking-tight">Totalt</span>
                    <span className="text-3xl font-black text-gold-500">{total.toFixed(0)} KR</span>
                  </div>
                </div>

                {error && (
                  <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm font-medium">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || subtotal < minOrder || !restaurantSettings.isOpen}
                  className="w-full py-5 bg-gold-500 hover:bg-gold-400 disabled:opacity-50 disabled:cursor-not-allowed text-dark-500 font-extrabold rounded-2xl transition-all shadow-[0_10px_40px_rgba(212,167,74,0.3)] hover:shadow-[0_15px_60px_rgba(212,167,74,0.4)] flex items-center justify-between px-10 group"
                >
                  {loading ? (
                    <div className="flex items-center gap-3 mx-auto uppercase">
                      <Loader2 className="animate-spin" size={20} />
                      Bearbetar...
                    </div>
                  ) : (
                    <>
                      <span className="uppercase tracking-widest text-sm">
                        {subtotal < minOrder ? `Köp för ${(minOrder - subtotal).toFixed(0)} kr till` : "Fortsätt till betalning"}
                      </span>
                      {subtotal >= minOrder && <ArrowRight size={22} className="group-hover:translate-x-1 transition-transform" />}
                    </>
                  )}
                </button>
              </form>
            ) : clientSecret ? (
              <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8 md:p-10 sticky top-32 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-between items-center mb-8 border-b border-white/5 pb-6">
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-tight italic">Slutför Betalning</h2>
                    <p className="text-[10px] text-white/40 uppercase font-black tracking-widest mt-1">Order Total: {total.toFixed(0)} KR</p>
                  </div>
                </div>

                <Elements 
                  stripe={stripePromise} 
                  options={{ 
                    clientSecret,
                    appearance: {
                      theme: 'night',
                      variables: {
                        colorPrimary: '#d4a74a',
                        colorBackground: '#1a1a1a',
                        colorText: '#ffffff',
                        borderRadius: '16px',
                        fontFamily: 'Inter, system-ui, sans-serif',
                      }
                    }
                  }}
                >
                  <StripeCheckout amount={total} onSuccess={submitOrder} draftId={draftId || undefined} />
                </Elements>
                
                <button 
                  type="button"
                  onClick={() => setShowPayment(false)}
                  className="w-full mt-8 p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-white/40 text-[10px] font-bold uppercase tracking-widest transition-all"
                >
                  ← Tillbaka till uppgifter
                </button>
              </div>
            ) : (

              <div className="flex justify-center p-8">
                <Loader2 className="animate-spin text-gold-500" size={32} />
              </div>
            )}

        </div>
      </div>


      <AnimatePresence>
        {upsellOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-dark-500/90 px-6 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.96, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 16 }}
              className="w-full max-w-xl rounded-[2.5rem] border border-white/10 bg-dark-400 p-6 md:p-10 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-6 mb-6 md:mb-8">
                <div>
                  <div className="inline-flex rounded-full border border-gold-500/20 bg-gold-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.3em] text-gold-500 mb-2 md:mb-4">
                    Snabbt tillägg
                  </div>
                  <h2 className="text-xl md:text-3xl font-black tracking-tight mb-2">Vill du lägga till en dryck?</h2>
                  <p className="text-white/45 text-xs md:text-base leading-relaxed">
                    Välj en 33cl för 15 kr innan du skickar ordern.
                  </p>
                </div>
                <button 
                  onClick={handleUpsellSkip} 
                  className="p-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors shrink-0"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 md:gap-4 mb-6">
                {drinkOptions.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleUpsellSelect(product)}
                    className="rounded-2xl md:rounded-[1.75rem] border border-white/10 bg-white/5 p-4 md:p-5 text-left transition-all hover:border-gold-500/30 active:scale-[0.98]"
                  >
                    <div className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] text-white/25 mb-1">33cl deal</div>
                    <div className="text-base md:text-xl font-black truncate">{product.displayName}</div>
                    <div className="text-gold-500 font-black mt-2 text-sm md:text-base">15 kr</div>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleUpsellSkip}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-[10px] md:text-sm font-black uppercase tracking-[0.25em] text-white/40 transition-all hover:bg-white/10"
              >
                Nej tack, fortsätt utan dryck
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};


export default CartPage;
