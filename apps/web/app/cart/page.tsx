"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
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
import ProductModal from "@/components/ProductModal";
import {
  type QuickAddress,
  findQuickAddressByText,
  formatQuickAddress,
  readQuickAddresses,
  rememberQuickAddress,
  writeQuickAddresses,
} from "@/lib/quickAddresses";
import { PublicDeal, pickBestDeal } from "@/lib/deals";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "pk_test_placeholder"
);

export default function CartPage() {
  const { items, removeItem, updateQuantity, getTotal, clearCart, restaurantId: cartRestaurantId, restaurantSlug: cartRestaurantSlug } = useCartStore();
  const router = useRouter();
  const [editingCartItem, setEditingCartItem] = useState<any>(null);

  /**
   * Öppnar befintlig ProductModal för redigering av en cart-rad. Hämtar produkten
   * med extras-grupper från API:et så användaren kan ändra val direkt från kassan.
   */
  const handleEditCartItem = useCallback(async (item: any) => {
    try {
      const res = await axios.get(`${API_URL}/api/menu/products/${item.productId}`);
      setEditingCartItem({ product: res.data, item });
    } catch {
      /* noop */
    }
  }, []);

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
    deliveryFee: 0,
    minOrderAmount: 150,
    estimatedPickupTime: 20,
    estimatedDeliveryTime: 35,
  });

  const [formData, setFormData] = useState({
    customerName: "",
    customerPhone: "",
    deliveryStreet: "",
    deliveryZip: "",
    deliveryCity: "",
    deliveryInstructions: "",
    note: "",
  });

  const [scheduledFor, setScheduledFor] = useState<Date | null>(null);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [selDate, setSelDate] = useState("");
  const [selHour, setSelHour] = useState("12");
  const [selMin, setSelMin] = useState("00");

  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [quickAddresses, setQuickAddresses] = useState<QuickAddress[]>([]);

  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [addressInput, setAddressInput] = useState("");
  const [predictions, setPredictions] = useState<any[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressZoneStatus, setAddressZoneStatus] = useState<"ok" | "error" | "checking" | null>(null);
  const debounceRef = useRef<any>(null);
  const sessionToken = useRef<string>("");

  useEffect(() => {
    sessionToken.current = (typeof crypto !== 'undefined' && crypto.randomUUID) 
      ? crypto.randomUUID() 
      : Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
  }, []);

  useEffect(() => {
    if (showSchedulePicker) {
      const d = scheduledFor || new Date(Date.now() + 45 * 60 * 1000);
      setSelDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      setSelHour(String(d.getHours()).padStart(2, '0'));
      const roundedMin = Math.min(Math.round(d.getMinutes() / 5) * 5, 55);
      setSelMin(String(roundedMin).padStart(2, '0'));
    }
  }, [showSchedulePicker]);

  const fetchPredictions = useCallback(async (text: string) => {
    if (text.length < 3) { setPredictions([]); return; }
    setAddressLoading(true);
    try {
      const res = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(text)}&sessiontoken=${sessionToken.current}`);
      const data = await res.json();
      setPredictions(data.predictions || []);
    } catch {
      setPredictions([]);
    } finally {
      setAddressLoading(false);
    }
  }, []);

  const handleAddressChange = (val: string) => {
    setAddressInput(val);
    setFormData(prev => ({ ...prev, deliveryStreet: val, deliveryZip: "" }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPredictions(val), 350);
  };

  const loadQuickAddresses = useCallback(() => {
    setQuickAddresses(readQuickAddresses());
  }, []);

  useEffect(() => {
    loadQuickAddresses();
  }, [loadQuickAddresses]);

  const checkDeliverySpecific = async (lat: number, lng: number) => {
    if (!currentRestaurantId) return;
    setCheckingDelivery(true);
    setAddressZoneStatus("checking");
    try {
      // Use the same zone validation endpoint as the React app
      // This checks ALL city zones and returns per-restaurant zone fees
      const res = await axios.post(`${API_URL}/api/cities/validate-location`, { lat, lng });

      if (!res.data?.covered || !Array.isArray(res.data.cities)) {
        setDeliveryCheck({ available: false });
        setAddressZoneStatus("error");
        return;
      }

      // Find the current restaurant in the zone results
      let foundRestaurant: any = null;
      for (const city of res.data.cities) {
        if (Array.isArray(city.restaurants)) {
          const match = city.restaurants.find((r: any) => r.id === currentRestaurantId);
          if (match) {
            foundRestaurant = match;
            break;
          }
        }
      }

      if (!foundRestaurant) {
        setDeliveryCheck({ available: false });
        setAddressZoneStatus("error");
        return;
      }

      // Zone fees are in öre from validate-location, convert to kr
      const fee = (foundRestaurant.matchedZone?.deliveryFee ?? 0) / 100;
      const min = (foundRestaurant.matchedZone?.minOrder ?? 0) / 100;

      // Update global store so future syncs or page loads use this new address's fee
      useCartStore.getState().updateDeliveryOverride(currentRestaurantId, fee, min);

      // Also update overrides for ALL restaurants in the result (like React app does)
      const overrides: Record<string, { deliveryFee: number; minOrderAmount: number }> = {};
      for (const city of res.data.cities) {
        if (Array.isArray(city.restaurants)) {
          for (const r of city.restaurants) {
            if (r.matchedZone) {
              overrides[r.id] = {
                deliveryFee: (r.matchedZone.deliveryFee || 0) / 100,
                minOrderAmount: (r.matchedZone.minOrder || 0) / 100,
              };
            }
          }
        }
      }
      if (Object.keys(overrides).length > 0) {
        useCartStore.getState().setDeliveryOverrides(overrides);
      }

      const finalData = { available: true, deliveryFee: fee, minOrder: min };
      setDeliveryCheck(finalData);
      setAddressZoneStatus("ok");
      setRestaurantSettings(prev => ({
        ...prev,
        deliveryFee: fee,
        minOrderAmount: min,
      }));
    } catch {
      setAddressZoneStatus(null);
    } finally {
      setCheckingDelivery(false);
    }
  };

  const handleAddressSelect = async (pred: any) => {
    setPredictions([]);
    setAddressInput(pred.description);
    setAddressLoading(true);
    
    const zipMatch = pred.description.match(/\b\d{3}\s?\d{2}\b/);
    const zip = zipMatch ? zipMatch[0].replace(/\s/g, '') : "";
    const street = pred.description.split(",")[0] || pred.description;

    setFormData(prev => ({ ...prev, deliveryStreet: street, deliveryZip: zip }));

    try {
      const res = await fetch(`/api/places/geocode?place_id=${pred.place_id}&sessiontoken=${sessionToken.current}`);
      const data = await res.json();
      if (data.location) {
        const coords = { lat: data.location.lat, lng: data.location.lng };
        localStorage.setItem("platform_coords", JSON.stringify(coords));
        localStorage.setItem("platform_address", pred.description);
        setQuickAddresses(
          rememberQuickAddress({
            street: pred.description,
            latitude: coords.lat,
            longitude: coords.lng,
          }),
        );
        sessionToken.current = (typeof crypto !== 'undefined' && crypto.randomUUID) 
          ? crypto.randomUUID() 
          : Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
        checkDeliverySpecific(coords.lat, coords.lng);
      }
    } catch (err) {
      console.warn("Failed to load address coords:", err);
    } finally {
      setAddressLoading(false);
    }
  };

  const handleQuickAddressSelect = useCallback((address: QuickAddress) => {
    const full = formatQuickAddress(address);
    setQuickAddresses(rememberQuickAddress(address));
    setAddressInput(full);
    setFormData((prev) => ({
      ...prev,
      deliveryStreet: address.street || full,
      deliveryZip: address.zip || "",
      deliveryCity: address.city || "",
    }));
    localStorage.setItem("platform_address", full);

    if (address.latitude != null && address.longitude != null) {
      localStorage.setItem(
        "platform_coords",
        JSON.stringify({ lat: address.latitude, lng: address.longitude }),
      );
      void checkDeliverySpecific(address.latitude, address.longitude);
    } else {
      setAddressZoneStatus(null);
    }
  }, [checkDeliverySpecific]);

  useEffect(() => {
    // Keep internal string in sync with storage loading
    if ((formData.deliveryStreet || formData.deliveryZip) && !addressInput) {
      setAddressInput(`${formData.deliveryStreet}${formData.deliveryZip ? `, ${formData.deliveryZip}` : ''}`);
    }
  }, [formData.deliveryStreet, formData.deliveryZip]);

  const subtotal = getTotal();
  const currentRestaurantId = useCartStore((s) => s.restaurantId);
  const deliveryOverrides = useCartStore((s) => s.deliveryOverrides);
  const ovr = currentRestaurantId ? deliveryOverrides[currentRestaurantId] : undefined;

  // Sync delivery fees from global overrides (set by home page zone check or previous cart session)
  // These are always zone-based fees, so they're safe to use as the starting point
  useEffect(() => {
    if (currentRestaurantId && ovr && orderType === "DELIVERY") {
      setRestaurantSettings(prev => ({
        ...prev,
        deliveryFee: ovr.deliveryFee,
        minOrderAmount: ovr.minOrderAmount
      }));
    }
  }, [currentRestaurantId, ovr, orderType]);

  // Reset delivery check when switching to DELIVERY and we have a saved address
  useEffect(() => {
    if (orderType === "DELIVERY" && currentRestaurantId && formData.deliveryStreet && addressZoneStatus !== "ok") {
      // Try to re-check delivery when switching to delivery mode
      const storedCoords = localStorage.getItem("platform_coords");
      if (storedCoords) {
        try {
          const coords = JSON.parse(storedCoords);
          checkDeliverySpecific(coords.lat, coords.lng);
        } catch {}
      }
    }
  }, [orderType]);

  // Fee priority: zone check result → restaurant default
  const deliveryFee = orderType === "DELIVERY"
    ? (deliveryCheck?.deliveryFee ?? restaurantSettings.deliveryFee)
    : 0;
  const minOrder = deliveryCheck?.minOrder ?? restaurantSettings.minOrderAmount;
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
        axios.get(`${API_URL}/api/deals`, { params: currentRestaurantId ? { restaurantId: currentRestaurantId } : {} }).catch(() => ({ data: [] })),
        token ? axios.get(`${API_URL}/api/profile`, { headers }).catch(() => ({ data: null })) : Promise.resolve({ data: null }),
        token ? axios.get(`${API_URL}/api/profile/deals`, { headers }).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        currentRestaurantId ? axios.get(`${API_URL}/api/restaurants/${currentRestaurantId}`).catch(() => ({ data: null })) : Promise.resolve({ data: null }),
      ]);

      // Only spread non-fee fields from global settings to avoid overwriting zone-specific fees
      if (settingsRes.data && Object.keys(settingsRes.data).length > 0) {
        const { deliveryFee: _df, minOrderAmount: _mo, ...nonFeeSettings } = settingsRes.data;
        setRestaurantSettings((prev) => ({ ...prev, ...nonFeeSettings }));
      }
      
      // Restaurant-specific settings: only update isOpen. NEVER overwrite delivery fees here
      // because zone-based fees should always come from /api/delivery/check, not the restaurant default.
      // The restaurant default fee is a fallback that only applies when no zone is configured,
      // and in that case the zone check endpoint already returns the restaurant default.
      if (restaurantRes.data) {
        setRestaurantSettings((prev) => ({
          ...prev,
          isOpen: restaurantRes.data.isOpen ?? prev.isOpen,
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
          // Only pull from profile if form is currently empty
          deliveryStreet: prev.deliveryStreet || userRes.data.address || "",
          deliveryZip: prev.deliveryZip || userRes.data.zip || "",
        }));
        // Load saved addresses
        if (token) {
          try {
            const addrRes = await axios.get(`${API_URL}/api/profile/addresses`, { headers });
            setSavedAddresses(addrRes.data || []);
            if (readQuickAddresses().length === 0) {
              const bootstrap = (addrRes.data || [])
                .slice(0, 3)
                .map((address: any, index: number) => ({
                  label: address.label,
                  street: address.street,
                  city: address.city,
                  zip: address.zip,
                  isDefault: address.isDefault ?? index === 0,
                }));
              if (bootstrap.length > 0) {
                writeQuickAddresses(bootstrap);
                setQuickAddresses(bootstrap);
              }
            }
            const defaultAddr = (addrRes.data || []).find((a: any) => a.isDefault);
            if (defaultAddr && !userRes.data.address) {
              setFormData(prev => ({ 
                ...prev, 
                deliveryStreet: prev.deliveryStreet || defaultAddr.street, 
                deliveryZip: prev.deliveryZip || defaultAddr.zip 
              }));
            }
          } catch (err) {
            console.warn("Failed to load default address:", err);
          }
        }
      }

      // Delivery zone check is handled by the address useEffect below
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
    
    const matched = personalDeals.find(d => d.code.toLowerCase() === code);
    if (matched) {
      setSelectedPersonalDeal(matched);
      return;
    }

    setError("Ogiltig rabattkod.");
  };

  useEffect(() => {
    fetchContext();
    // Failsafe: om API är långsamt så ska inte kassan snurra i evighet.
    const safety = setTimeout(() => setPageLoading(false), 8000);
    return () => clearTimeout(safety);
  }, [fetchContext]);

  // Auto-fill address from localStorage and run zone check
  const initialZoneCheckDone = useRef(false);
  useEffect(() => {
    const storedAddress = localStorage.getItem("platform_address");
    const storedType = localStorage.getItem("platform_order_type");
    const storedCoords = localStorage.getItem("platform_coords");
    
    if (storedType === "PICKUP" || storedType === "DELIVERY") {
      setOrderType(storedType as "PICKUP" | "DELIVERY");
    }

    if (storedAddress) {
      setAddressInput(storedAddress);
      const cachedQuickAddress = findQuickAddressByText(storedAddress);
      
      const parts = storedAddress.split(',').map((p: string) => p.trim());
      const street = parts[0] || "";
      const zipMatch = storedAddress.match(/\b\d{3}\s?\d{2}\b/);
      const zip = zipMatch ? zipMatch[0].replace(/\s/g, '') : "";
      const city = parts.length > 1 ? parts[1].replace(/\d+/g, '').trim() : "";
      
      // ALWAYS set the address from localStorage
      setFormData(prev => ({
        ...prev,
        deliveryStreet: street || prev.deliveryStreet,
        deliveryZip: zip || prev.deliveryZip,
        deliveryCity: city || prev.deliveryCity,
      }));

      // Run zone check — guards against running before restaurantId is available
      if (storedType !== "PICKUP" && currentRestaurantId && !initialZoneCheckDone.current) {
        initialZoneCheckDone.current = true;
        if (storedCoords) {
          try {
            const { lat, lng } = JSON.parse(storedCoords);
            setQuickAddresses(rememberQuickAddress({ street: storedAddress, latitude: lat, longitude: lng }));
            // Run zone check immediately — fetchContext no longer overwrites fee/min
            checkDeliverySpecific(lat, lng);
          } catch (err) {
            console.warn("Failed to parse stored coords:", err);
          }
        } else if (cachedQuickAddress?.latitude != null && cachedQuickAddress?.longitude != null) {
          localStorage.setItem(
            "platform_coords",
            JSON.stringify({ lat: cachedQuickAddress.latitude, lng: cachedQuickAddress.longitude }),
          );
          setQuickAddresses(rememberQuickAddress(cachedQuickAddress));
          checkDeliverySpecific(cachedQuickAddress.latitude, cachedQuickAddress.longitude);
        } else {
          // If address exists but no coords, try to geocode
          setAddressLoading(true);
          fetch(`/api/places/autocomplete?input=${encodeURIComponent(storedAddress)}&sessiontoken=${sessionToken.current}`)
            .then(r => r.json())
            .then(data => {
              const bestMatch = data.predictions?.[0];
              if (bestMatch) {
                return fetch(`/api/places/geocode?place_id=${bestMatch.place_id}&sessiontoken=${sessionToken.current}`);
              }
              throw new Error("No match");
            })
            .then(r => r.json())
            .then(data => {
              if (data.location) {
                localStorage.setItem("platform_coords", JSON.stringify(data.location));
                setQuickAddresses(
                  rememberQuickAddress({
                    street: storedAddress,
                    latitude: data.location.lat,
                    longitude: data.location.lng,
                  }),
                );
                setFormData(prev => ({
                  ...prev,
                  deliveryStreet: street || prev.deliveryStreet,
                  deliveryZip: zip || prev.deliveryZip,
                  deliveryCity: city || prev.deliveryCity
                }));
                checkDeliverySpecific(data.location.lat, data.location.lng);
              }
            })
            .catch(() => {})
            .finally(() => setAddressLoading(false));
        }
      }
    }
  }, [currentRestaurantId]);

  const submitOrder = async (paymentIntentId: string) => {
    setLoading(true);
    try {
      // Refresh Supabase token before submitting to ensure userId is linked
      let token = localStorage.getItem("platform_user_token");
      if (token) {
        try {
          const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
          const supabase = createSupabaseBrowserClient();
          const { data } = await supabase.auth.getSession();
          if (data.session?.access_token) {
            token = data.session.access_token;
            localStorage.setItem("platform_user_token", token);
          }
        } catch {
          // Fall back to existing token
        }
      }
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
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
        restaurantSlug: useCartStore.getState().restaurantSlug || undefined,
        lat: localStorage.getItem("platform_coords") ? JSON.parse(localStorage.getItem("platform_coords")!).lat : undefined,
        lng: localStorage.getItem("platform_coords") ? JSON.parse(localStorage.getItem("platform_coords")!).lng : undefined,
        scheduledFor: scheduledFor?.toISOString() || undefined,
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
      const res = await axios.post(`${API_URL}/api/orders`, orderData, { headers });
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
    if (orderType === "DELIVERY") {
      const hasStreet = !!formData.deliveryStreet.trim();
      
      if (!hasStreet) {
        setError("Ange fullständig leveransadress.");
        return;
      }
    }
    if (subtotal < minOrder) {
      setError(`Minsta ordervärde är ${minOrder} kr.`);
      return;
    }
    if (!restaurantSettings.isOpen) {
      setError("Restaurangen är stängd just nu.");
      return;
    }

    // ── Zone check (last-mile safeguard for delivery) ────────────────────────
    if (orderType === "DELIVERY" && currentRestaurantId) {
      if (addressZoneStatus === "checking") {
        setError("Vänligen vänta, vi kontrollerar din leveransadress...");
        return;
      }

      let lat: number | null = null;
      let lng: number | null = null;

      const storedCoords = localStorage.getItem("platform_coords");
      if (storedCoords) {
        try {
          const parsed = JSON.parse(storedCoords);
          lat = parsed.lat;
          lng = parsed.lng;
        } catch (err) {
          console.warn("Failed to parse coords:", err);
        }
      }

      // If still no coords but we have a street, try one last time to get them
      if ((!lat || !lng) && formData.deliveryStreet) {
        setLoading(true);
        setError("Veriferar adress...");
        try {
          const aRes = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(formData.deliveryStreet)}&sessiontoken=${sessionToken.current}`);
          const aData = await aRes.json();
          const bestMatch = aData.predictions?.[0];
          if (bestMatch) {
            const gRes = await fetch(`/api/places/geocode?place_id=${bestMatch.place_id}&sessiontoken=${sessionToken.current}`);
            const gData = await gRes.json();
            if (gData.location) {
              lat = gData.location.lat;
              lng = gData.location.lng;
              localStorage.setItem("platform_coords", JSON.stringify(gData.location));
            }
          }
        } catch {
          // Ignore geocode failure here, will fallback to generic error below
        }
      }

      if (lat && lng) {
        try {
          const zRes = await axios.get(`${API_URL}/api/delivery/check`, {
            params: { lat, lng, restaurantId: currentRestaurantId },
          });
          if (!zRes.data.available) {
            setAddressZoneStatus("error");
            setError("Den här restaurangen levererar tyvärr inte till din adress. Välj avhämtning eller ange en ny adress.");
            setLoading(false);
            return;
          }
          // ALWAYS update the fee from the fresh zone check result
          const freshFee = zRes.data.deliveryFee ?? 0;
          const freshMin = zRes.data.minOrder ?? 0;
          useCartStore.getState().updateDeliveryOverride(currentRestaurantId, freshFee, freshMin);
          setDeliveryCheck({ available: true, deliveryFee: freshFee, minOrder: freshMin });
          setRestaurantSettings(prev => ({
            ...prev,
            deliveryFee: freshFee,
            minOrderAmount: freshMin,
          }));
          setAddressZoneStatus("ok");
        } catch { /* Fail open — don't block if network error */ }
      } else if (formData.deliveryStreet) {
        setError("Kunde inte verifiera din adress. Vänligen välj den från listan.");
        setLoading(false);
        return;
      }
    }
    // ────────────────────────────────────────────────────────────────────────

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
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: "var(--bg-primary)" }}>
        <Loader2 className="animate-spin text-gold-500" size={40} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="w-24 h-24 rounded-[3rem] flex items-center justify-center mb-8" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)" }}>
          <ShoppingBag size={48} className="text-gold-500/30" />
        </div>
        <h1 className="text-4xl font-black uppercase italic tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>Din kasse är <span className="text-gold-500">tom</span></h1>
        <p className="text-zinc-500 text-xs font-bold uppercase tracking-[0.3em] mb-12">Det ser lite tomt ut här. Lägg till något gott!</p>
        <Link href="/" className="px-12 py-6 bg-gold-500 text-zinc-950 rounded-[2rem] font-black uppercase tracking-widest text-[11px] shadow-2xl shadow-gold-500/10 active:scale-95 transition-all">Gå till menyn</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dot-pattern pt-24 pb-48 px-6" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-end justify-between mb-12 px-4">
           <div>
              <h1 className="text-4xl md:text-6xl font-black uppercase italic tracking-tighter leading-none mb-3" style={{ color: "var(--text-primary)" }}>Din <span className="text-gold-gradient">Kasse</span></h1>
              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.3em]">Granska dina val och slutför beställning</p>
           </div>
           <Link href="/menu" className="text-[10px] font-black uppercase tracking-widest text-gold-500 hover:text-gold-600 transition-colors flex items-center gap-2 mb-2 group">
              Lägg till mer <Plus size={14} className="group-hover:rotate-90 transition-transform" />
           </Link>
        </div>

        {/* Login prompt — soft, not blocking (guest can still order) */}
        {!user && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="rounded-[2.5rem] mb-10 border border-gold-500/20 bg-gold-500/5 backdrop-blur-sm p-6 flex flex-col sm:flex-row items-center gap-6">
            <div className="w-12 h-12 shrink-0 bg-gold-500/10 rounded-2xl border border-gold-500/20 flex items-center justify-center">
              <UserIcon size={20} className="text-gold-500" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <p className="text-[12px] font-black uppercase tracking-widest text-gold-600 mb-0.5">
                Lojalitetsprogram
              </p>
              <p className="text-[11px] font-bold text-zinc-500 leading-relaxed">
                Logga in för att spara adresser, se orderhistorik och ta del av personliga erbjudanden.
                Du kan även betala som gäst.
              </p>
            </div>
            <div className="flex gap-3 shrink-0">
              <Link
                href="/profile"
                className="px-5 py-3 bg-gold-500 text-zinc-950 rounded-2xl font-black uppercase tracking-widest text-[9px] shadow-lg shadow-gold-500/20 active:scale-95 transition-all"
              >
                Logga in
              </Link>
              <Link
                href="/register"
                className="px-5 py-3 border rounded-2xl font-black uppercase tracking-widest text-[9px] hover:bg-zinc-50 active:scale-95 transition-all"
                style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border-muted)", color: "var(--text-secondary)" }}
              >
                Skapa konto
              </Link>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* Cart items list */}
          <div className="lg:col-span-12 xl:col-span-7 space-y-4">
            {deals.length > 0 && <DealSpotlight deals={deals} subtotal={subtotal} productIds={productIds} />}
            <div className="space-y-4">
              {items.map((item) => (
                <motion.div key={item.cartItemId} layout className="p-6 rounded-[2.5rem] flex flex-col sm:flex-row sm:items-center justify-between gap-6 transition-all group shadow-sm" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", boxShadow: "var(--card-shadow)" }}>
                   <button
                     type="button"
                     onClick={() => handleEditCartItem(item)}
                     className="flex items-center gap-6 text-left flex-1 min-w-0"
                   >
                       <div className="w-14 h-14 border rounded-3xl flex items-center justify-center text-gold-500 font-black italic text-lg shadow-inner" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)" }}>
                          {item.quantity}x
                       </div>
                       <div className="min-w-0">
                          <h3 className="text-lg font-black uppercase italic tracking-tight mb-1 group-hover:text-gold-500 transition-colors uppercase truncate" style={{ color: "var(--text-primary)" }}>{item.name}</h3>
                          {item.extras.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                               {item.extras.map(e => (
                                  <span key={e.extraId} className="text-[8px] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded-md border" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)", color: "var(--text-secondary)" }}>{e.name}</span>
                               ))}
                            </div>
                          )}
                          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-gold-500/70 mt-2 inline-block">Tryck för att redigera</span>
                       </div>
                    </button>
                    <div className="flex items-center justify-between sm:justify-end gap-10">
                       <div className="flex items-center gap-6 px-4 py-3 rounded-2xl" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)" }}>
                          <button onClick={() => { if (item.quantity === 1) { removeItem(item.cartItemId); } else { updateQuantity(item.cartItemId, -1); } }} className="text-zinc-500 hover:text-gold-500 transition-colors active:scale-75"><Minus size={18} /></button>
                          <span className="text-base font-black w-4 text-center italic" style={{ color: "var(--text-primary)" }}>{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.cartItemId, 1)} className="text-zinc-500 hover:text-gold-500 transition-colors active:scale-75"><Plus size={18} /></button>
                       </div>
                       <div className="flex items-center gap-8">
                          <div className="text-lg font-black italic flex flex-col items-end" style={{ color: "var(--text-primary)" }}>
                             <span className="text-gold-500">{(item.price * item.quantity).toFixed(0)}</span>
                             <span className="text-[8px] uppercase tracking-widest leading-none" style={{ color: "var(--text-secondary)" }}>SEK</span>
                          </div>
                          <button onClick={() => removeItem(item.cartItemId)} className="w-12 h-12 rounded-2xl border flex items-center justify-center text-zinc-500 hover:text-rose-500 hover:bg-rose-500/10 transition-all active:scale-90" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)" }}>
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
                  <motion.div key="payment" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="glass-panel p-10 rounded-[3.5rem] shadow-2xl" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)", boxShadow: "var(--card-shadow)" }}>
                     <div className="flex items-center gap-3 text-gold-500 text-[10px] font-black uppercase tracking-[0.4em] mb-10">
                        <CreditCard size={18} /> Betala Tryggt
                     </div>
                     <div className="rounded-3xl p-6 mb-10 border" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)" }}>
                        <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe', variables: { colorPrimary: '#e7b24b', colorBackground: '#ffffff', colorText: '#1C1C1E', colorDanger: '#ef4444' } } }}>
                           <StripeCheckout amount={total} onSuccess={submitOrder} />
                        </Elements>
                     </div>
                     <button onClick={() => setShowPayment(false)} className="w-full text-[10px] font-black uppercase tracking-widest hover:text-gold-500 transition-colors" style={{ color: "var(--text-secondary)" }}>← Tillbaka till uppgifter</button>
                  </motion.div>
                ) : (
                  <motion.div key="form" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-10 rounded-[3.5rem] shadow-2xl relative" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", boxShadow: "var(--card-shadow)" }}>
                      <div className="flex gap-4 p-1.5 rounded-[1.8rem] mb-10" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)" }}>
                         {(['DELIVERY', 'PICKUP'] as const).map(type => (
                            <button key={type} type="button" onClick={() => setOrderType(type)} className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-[1.4rem] text-[10px] font-black uppercase tracking-widest transition-all ${orderType === type ? 'bg-gold-500 text-zinc-950 shadow-lg shadow-gold-500/20' : 'text-zinc-500 hover:text-gold-500'}`}>
                               {type === 'DELIVERY' ? <Truck size={16} /> : <Store size={16} />}
                               {type === 'DELIVERY' ? 'Leverans' : 'Hämtning'}
                            </button>
                         ))}
                      </div>

                      {/* Schedule Toggle */}
                      <div className="flex gap-3 p-1.5 rounded-[1.8rem] mb-10" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)" }}>
                         <button type="button" onClick={() => setScheduledFor(null)} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[1.2rem] text-[10px] font-black uppercase tracking-widest transition-all ${!scheduledFor ? 'bg-gold-500 text-zinc-950 shadow-lg shadow-gold-500/20' : 'text-zinc-500 hover:text-gold-500'}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                            Snarast
                         </button>
                          <button type="button" onClick={() => { const min = new Date(Date.now() + 45 * 60 * 1000); setScheduledFor(min); setShowSchedulePicker(true); }} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[1.2rem] text-[10px] font-black uppercase tracking-widest transition-all ${scheduledFor ? 'bg-gold-500 text-zinc-950 shadow-lg shadow-gold-500/20' : 'text-zinc-500 hover:text-gold-500'}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            Schemalägg
                         </button>
                      </div>

                       {scheduledFor && (
                          <div className="rounded-2xl p-5 mb-8 border flex items-center justify-between cursor-pointer hover:border-gold-500/30 transition-all" style={{ backgroundColor: "rgba(231,178,75,0.05)", borderColor: "rgba(231,178,75,0.2)" }} onClick={() => setShowSchedulePicker(true)}>
                             <div className="flex items-center gap-3">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gold-500"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                <div>
                                   <div className="text-sm font-black" style={{ color: "var(--text-primary)" }}>
                                      {scheduledFor.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" })}
                                   </div>
                                   <div className="text-lg font-black text-gold-500">
                                      {scheduledFor.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
                                   </div>
                                </div>
                             </div>
                             <div className="flex gap-2 items-center">
                                <button type="button" onClick={(e) => { e.stopPropagation(); setScheduledFor(null); }} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-red-500/20 transition-all" style={{ backgroundColor: "rgba(255,59,48,0.12)" }}>
                                   <X size={14} className="text-red-500" />
                                </button>
                             </div>
                          </div>
                       )}

                       {/* Schedule Picker Modal */}
                       <AnimatePresence>
                          {showSchedulePicker && (() => {
                             const now = new Date();
                             const minDate = new Date(now.getTime() + 45 * 60 * 1000);
                             const maxDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                             const days: Date[] = [];
                             for (let d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); d <= maxDate; d.setDate(d.getDate() + 1)) {
                                if (d >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) days.push(new Date(d));
                             }
                             const quickTimes = [
                                { label: "45 min", offset: 45 },
                                { label: "1 timme", offset: 60 },
                                { label: "1.5 timmar", offset: 90 },
                                { label: "2 timmar", offset: 120 },
                                { label: "3 timmar", offset: 180 },
                             ];

                             const handleConfirm = () => {
                                const [y, m, day] = selDate.split('-').map(Number);
                                const combined = new Date(y, m - 1, day, parseInt(selHour), parseInt(selMin));
                                if (combined < minDate) {
                                   setError("Tiden måste vara minst 45 minuter fram i tiden.");
                                   return;
                                }
                                setScheduledFor(combined);
                                setShowSchedulePicker(false);
                             };

                             const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
                             const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

                             return (
                                <motion.div
                                   key="schedule-modal"
                                   initial={{ opacity: 0 }}
                                   animate={{ opacity: 1 }}
                                   exit={{ opacity: 0 }}
                                   className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
                                   onClick={() => setShowSchedulePicker(false)}
                                >
                                   <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                                   <motion.div
                                      initial={{ y: 100, opacity: 0 }}
                                      animate={{ y: 0, opacity: 1 }}
                                      exit={{ y: 100, opacity: 0 }}
                                      transition={{ type: "spring", damping: 25, stiffness: 300 }}
                                      className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 pb-8 shadow-2xl"
                                      style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
                                      onClick={(e) => e.stopPropagation()}
                                   >
                                      <div className="w-10 h-1 rounded-full mx-auto mb-6 sm:hidden" style={{ backgroundColor: "var(--border-muted)" }} />
                                      <h3 className="text-lg font-black uppercase tracking-wider text-center mb-6" style={{ color: "var(--text-primary)" }}>
                                         Välj leveranstid
                                      </h3>

                                      {/* Quick times */}
                                      <div className="flex flex-wrap gap-2 mb-6 justify-center">
                                         {quickTimes.map((qt) => {
                                            const t = new Date(now.getTime() + qt.offset * 60 * 1000);
                                            const isActive = selDate === `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}` &&
                                               selHour === String(t.getHours()).padStart(2, '0') &&
                                               selMin === String(t.getMinutes()).padStart(2, '0');
                                            return (
                                               <button key={qt.label} type="button" onClick={() => {
                                                  setSelDate(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`);
                                                  setSelHour(String(t.getHours()).padStart(2, '0'));
                                                  setSelMin(String(t.getMinutes()).padStart(2, '0'));
                                               }} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${isActive ? 'bg-gold-500 text-zinc-950' : 'bg-[var(--bg-deep)] text-zinc-400 hover:text-gold-500 border border-[var(--border-muted)]'}`}>
                                                  {qt.label}
                                               </button>
                                            );
                                         })}
                                      </div>

                                       {/* Date picker */}
                                       <div className="mb-4">
                                          <label className="text-[9px] font-black uppercase tracking-widest ml-3 block mb-2" style={{ color: "var(--text-secondary)" }}>Datum</label>
                                          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                                             {days.filter(d => d >= new Date(now.getFullYear(), now.getMonth(), now.getDate())).map((d) => {
                                                const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                                                const isActive = selDate === val;
                                                return (
                                                   <button key={val} type="button" onClick={() => setSelDate(val)} className={`shrink-0 px-4 py-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${isActive ? 'bg-gold-500 text-zinc-950' : 'bg-[var(--bg-deep)] text-zinc-400 border border-[var(--border-muted)]'}`}>
                                                      {d.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" })}
                                                   </button>
                                                );
                                             })}
                                          </div>
                                       </div>

                                       {/* Time picker */}
                                       <div className="flex gap-3 mb-6">
                                          <div className="flex-1">
                                             <label className="text-[9px] font-black uppercase tracking-widest ml-3 block mb-2" style={{ color: "var(--text-secondary)" }}>Timme</label>
                                             <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                                                {hours.map(h => (
                                                   <button key={h} type="button" onClick={() => setSelHour(h)} className={`shrink-0 w-12 py-3 rounded-xl text-xs font-bold transition-all text-center ${selHour === h ? 'bg-gold-500 text-zinc-950' : 'bg-[var(--bg-deep)] text-zinc-400 border border-[var(--border-muted)]'}`}>
                                                      {h}
                                                   </button>
                                                ))}
                                             </div>
                                          </div>
                                          <div className="flex items-end pb-3 text-2xl font-black" style={{ color: "var(--text-secondary)" }}>:</div>
                                          <div className="flex-1">
                                             <label className="text-[9px] font-black uppercase tracking-widest ml-3 block mb-2" style={{ color: "var(--text-secondary)" }}>Minut</label>
                                             <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                                                {minutes.map(m => (
                                                   <button key={m} type="button" onClick={() => setSelMin(m)} className={`shrink-0 w-12 py-3 rounded-xl text-xs font-bold transition-all text-center ${selMin === m ? 'bg-gold-500 text-zinc-950' : 'bg-[var(--bg-deep)] text-zinc-400 border border-[var(--border-muted)]'}`}>
                                                      {m}
                                                   </button>
                                                ))}
                                             </div>
                                          </div>
                                       </div>

                                      <button type="button" onClick={handleConfirm} className="w-full rounded-2xl py-4 text-sm font-black uppercase tracking-widest bg-gold-500 text-zinc-950 hover:bg-gold-400 transition-all">
                                         Bekräfta tid
                                      </button>
                                   </motion.div>
                                </motion.div>
                             );
                          })()}
                       </AnimatePresence>

                       <div className="space-y-8">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                           <div className="space-y-2">
                              <label className="text-[9px] font-black uppercase tracking-widest ml-3" style={{ color: "var(--text-secondary)" }}>Ditt Namn</label>
                              <input value={formData.customerName} onChange={e => setFormData({...formData, customerName: e.target.value})} className="w-full border rounded-2xl p-5 text-sm font-bold placeholder:text-zinc-400 focus:border-gold-500/40 outline-none transition-all" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)", color: "var(--text-primary)" }} placeholder="Namn" />
                           </div>
                           <div className="space-y-2">
                              <label className="text-[9px] font-black uppercase tracking-widest ml-3" style={{ color: "var(--text-secondary)" }}>Telefon</label>
                              <input value={formData.customerPhone} onChange={e => setFormData({...formData, customerPhone: e.target.value})} className="w-full border rounded-2xl p-5 text-sm font-bold placeholder:text-zinc-400 focus:border-gold-500/40 outline-none transition-all" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)", color: "var(--text-primary)" }} placeholder="Nummer" />
                           </div>
                        </div>

                        {orderType === 'DELIVERY' && (
                           <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                              {quickAddresses.length > 0 && (
                                 <div className="space-y-2">
                                   <label className="text-[9px] font-black uppercase tracking-widest ml-3" style={{ color: "var(--text-secondary)" }}>3 sparade adresser</label>
                                   <div className="flex gap-2 flex-wrap">
                                     {quickAddresses.map(addr => (
                                       <button
                                         key={`${addr.street}-${addr.zip || ''}-${addr.city || ''}`}
                                         type="button"
                                         onClick={() => handleQuickAddressSelect(addr)}
                                         className={`flex items-center gap-2 px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all active:scale-95 ${
                                           formatQuickAddress(addr) === addressInput
                                             ? 'bg-gold-500/10 border-gold-500/30 text-gold-500'
                                            : 'bg-[var(--bg-deep)] border-[var(--border-muted)] text-zinc-500 hover:text-gold-500 hover:border-gold-500/20'
                                         }`}
                                       >
                                         {addr.label === 'Hem' ? <Home size={12} /> : addr.label === 'Jobb' ? <Briefcase size={12} /> : <MapPin size={12} />}
                                         {formatQuickAddress(addr)}
                                         {addr.isDefault && <span className="text-[8px] text-gold-500">• Standard</span>}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="space-y-2 relative z-50">
                                 <label className="text-[9px] font-black uppercase tracking-widest ml-3" style={{ color: "var(--text-secondary)" }}>Leveransadress</label>
                                 <div className="relative">
                                   <input 
                                     value={addressInput} 
                                     onChange={e => handleAddressChange(e.target.value)} 
                                     className="w-full border rounded-2xl p-5 text-sm font-bold placeholder:text-zinc-400 focus:outline-none transition-all pl-12 pr-12"
                                     style={{
                                       backgroundColor: "var(--bg-deep)",
                                       color: "var(--text-primary)",
                                       borderColor:
                                         addressZoneStatus === "error"
                                           ? "rgba(244,63,94,0.6)"
                                         : addressZoneStatus === "ok"
                                             ? "rgba(16,185,129,0.4)"
                                            : "var(--border-muted)",
                                     }}
                                     placeholder="Din Gatuadress, Postnummer..." 
                                   />
                                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gold-500/50" size={18} />
                                  {addressLoading || checkingDelivery || addressZoneStatus === "checking" ? (
                                    <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 text-gold-500 animate-spin" size={18} />
                                  ) : addressZoneStatus === "ok" ? (
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    </div>
                                  ) : addressZoneStatus === "error" ? (
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center">
                                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 1l6 6M7 1L1 7" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>
                                    </div>
                                  ) : null}
                                </div>
                                {addressZoneStatus === "error" && (
                                  <p className="text-[10px] font-bold text-rose-400 ml-3 mt-1">Restaurangen levererar inte till denna adress.</p>
                                )}

                                 <AnimatePresence>
                                   {predictions.length > 0 && (
                                     <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="absolute left-0 right-0 top-full mt-2 rounded-2xl overflow-hidden shadow-2xl z-50" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", boxShadow: "var(--card-shadow)" }}>
                                       {predictions.map(pred => (
                                         <button key={pred.place_id} type="button" onClick={() => handleAddressSelect(pred)} className="w-full text-left px-5 py-4 transition-all border-b last:border-none flex flex-col gap-1 hover:bg-[var(--bg-deep)]" style={{ borderColor: "var(--border-muted)" }}>
                                           <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{pred.description.split(",")[0]}</span>
                                           <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{pred.description.split(",").slice(1).join(",").trim()}</span>
                                         </button>
                                       ))}
                                     </motion.div>
                                   )}
                                 </AnimatePresence>
                             </div>

                             {/* Delivery Instructions Presets */}
                             <div className="space-y-2">
                                 <label className="text-[9px] font-black uppercase tracking-widest ml-3" style={{ color: "var(--text-secondary)" }}>Leveransinstruktioner</label>
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
                                          : 'bg-[var(--bg-deep)] border-[var(--border-muted)] text-zinc-600 hover:text-gold-500 hover:border-gold-500/20'
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
                           <label className="text-[9px] font-black uppercase tracking-widest ml-3" style={{ color: "var(--text-secondary)" }}>Extranotering</label>
                           <textarea rows={2} value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} className="w-full border rounded-2xl p-5 text-sm font-bold placeholder:text-zinc-400 focus:border-gold-500/40 outline-none transition-all resize-none" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)", color: "var(--text-primary)" }} placeholder="T.ex. portkod 1234, ingen lök i kebaben..." />
                        </div>

                        {/* Promo Code Integrated */}
                        <div className="relative group flex items-center">
                          <Tag size={16} className="absolute left-6 text-gold-500/40 group-focus-within:text-gold-500 transition-colors pointer-events-none" />
                           <input 
                              value={selectedPersonalDeal ? selectedPersonalDeal.code : promoCodeInput} 
                              onChange={e => { if(selectedPersonalDeal) setSelectedPersonalDeal(null); setPromoCodeInput(e.target.value); }}
                              className="w-full border rounded-2xl py-6 pl-14 pr-24 text-[11px] font-black uppercase tracking-widest placeholder:text-zinc-400 outline-none transition-all"
                              style={{ backgroundColor: "var(--bg-deep)", borderColor: selectedPersonalDeal ? "rgba(16,185,129,0.4)" : "var(--border-muted)", color: selectedPersonalDeal ? "#34d399" : "var(--text-primary)" }}
                              placeholder={selectedPersonalDeal ? "Tillämpad" : "Rabattkod"} 
                           />
                           <button 
                              type="button" 
                              onClick={selectedPersonalDeal ? () => { setSelectedPersonalDeal(null); setPromoCodeInput(""); } : handleApplyPromo}
                              className={`absolute right-3 px-6 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${selectedPersonalDeal ? "bg-rose-500/10 text-rose-500 hover:bg-rose-500/20" : "bg-gold-500/10 text-gold-600 hover:bg-gold-500 hover:text-zinc-950"}`}
                           >
                              {selectedPersonalDeal ? "Ta Bort" : "Kolla"}
                           </button>
                        </div>
                     </div>

                     <div className="mt-10 pt-10 space-y-4" style={{ borderTop: "1px solid var(--border-muted)" }}>
                        <div className="flex justify-between text-[11px] font-black uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}><span>Delsumma</span><span>{subtotal.toFixed(0)} KR</span></div>
                        {orderType === 'DELIVERY' && <div className="flex justify-between text-[11px] font-black uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}><span>Leveransavgift</span><span className="text-gold-500">{deliveryFee.toFixed(0)} KR</span></div>}
                        {finalDiscount > 0 && <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-emerald-500 italic"><span>Rabatt</span><span>-{finalDiscount.toFixed(0)} KR</span></div>}
                        <div className="flex justify-between items-center mt-6">
                           <span className="text-3xl font-black italic uppercase tracking-tighter" style={{ color: "var(--text-primary)" }}>TOTALT</span>
                           <span className="text-5xl font-black italic tracking-tighter leading-none text-gold-gradient">{total.toFixed(0)} <span className="text-xs opacity-50 not-italic" style={{ color: "var(--text-secondary)" }}>SEK</span></span>
                        </div>
                     </div>

                    {error && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8 p-5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[10px] font-black uppercase tracking-widest text-center italic">{error}</motion.div>}

                      {/* Guest info banner — not blocking, just informative */}
                      {!user && (
                        <div className="mt-8 p-4 rounded-2xl border flex items-center gap-3" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)" }}>
                          <UserIcon size={16} className="text-zinc-400 shrink-0" />
                          <p className="text-[10px] font-bold leading-snug flex-1" style={{ color: "var(--text-secondary)" }}>
                            Du handlar som gäst.{" "}
                            <Link href="/profile" className="text-gold-400 hover:text-gold-300 underline">Logga in</Link>{" "}
                            för sparade adresser och personliga erbjudanden.
                          </p>
                        </div>
                     )}

                     {/* Zone error summary line above checkout button */}
                     {addressZoneStatus === "error" && orderType === "DELIVERY" && (
                       <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-3">
                         <div className="w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center shrink-0">
                           <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 1l6 6M7 1L1 7" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>
                         </div>
                         <p className="text-[10px] font-bold text-rose-400 leading-snug">Restaurangen levererar inte till den angivna adressen. Ändra adressen ovan.</p>
                       </motion.div>
                     )}
                     {addressZoneStatus === "ok" && orderType === "DELIVERY" && (
                       <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 flex items-center justify-end">
                         <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.6)]" />
                       </motion.div>
                     )}

                      <button 
                         onClick={startCheckout} 
                         disabled={loading || subtotal < minOrder || !restaurantSettings.isOpen || addressZoneStatus === "error"}
                        className="w-full mt-10 py-6 bg-gold-500 hover:bg-gold-400 text-zinc-950 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs shadow-2xl shadow-gold-500/20 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-4 group"
                     >
                        {loading ? <Loader2 className="animate-spin" size={24} /> : subtotal < minOrder ? `Köp för ${(minOrder - subtotal).toFixed(0)} kr till` : addressZoneStatus === "error" ? "Fel leveransadress" : <>Slutför Köp <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform" /></>}
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
           <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 backdrop-blur-md" onClick={() => setShowDealsModal(false)} style={{ backgroundColor: "rgba(23,21,19,0.95)" }}>
             <motion.div initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 30 }} className="w-full max-w-sm glass-panel p-10 rounded-[3.5rem] relative" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)", boxShadow: "var(--card-shadow)" }} onClick={e => e.stopPropagation()}>
                <button onClick={() => setShowDealsModal(false)} className="absolute top-8 right-8 p-2 hover:text-gold-500 transition-colors" style={{ color: "var(--text-secondary)" }}><X size={24}/></button>
                <h2 className="text-2xl font-black uppercase italic tracking-tight mb-8" style={{ color: "var(--text-primary)" }}>Dina <span className="text-gold-gradient">Erbjudanden</span></h2>
                <div className="space-y-4 max-h-[400px] overflow-y-auto no-scrollbar">
                   {personalDeals.map(deal => {
                     const isEligible = subtotal >= deal.campaign.minOrder;
                     return (
                        <button key={deal.id} disabled={!isEligible} onClick={() => { setSelectedPersonalDeal(deal); setShowDealsModal(false); }} className={`w-full text-left p-6 rounded-[2.2rem] border transition-all group ${isEligible ? "active:scale-[0.98]" : "opacity-30 grayscale"}`} style={{ backgroundColor: "var(--bg-deep)", borderColor: isEligible ? "rgba(231,178,75,0.2)" : "var(--border-muted)" }}>
                           <div className="flex items-center justify-between mb-4">
                              <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>{deal.campaign.title}</div>
                              {isEligible && <div className="px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-md text-[8px] font-black uppercase">REDO</div>}
                           </div>
                           <div className="text-2xl font-black italic uppercase tracking-tighter leading-none mb-2 group-hover:text-gold-500 transition-colors" style={{ color: "var(--text-primary)" }}>
                              {deal.campaign.discountType === "PERCENTAGE" ? `${deal.campaign.discountValue}% RABATT` : `${deal.campaign.discountValue} KR RABATT`}
                           </div>
                           <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>Gäller vid köp över {deal.campaign.minOrder} kr</div>
                        </button>
                     );
                   })}
                </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cart item edit */}
      <AnimatePresence>
        {editingCartItem && (
          <ProductModal
            product={editingCartItem.product}
            restaurantId={cartRestaurantId || editingCartItem.item.restaurantId}
            restaurantSlug={cartRestaurantSlug || undefined}
            editCartItemId={editingCartItem.item.cartItemId}
            initialQuantity={editingCartItem.item.quantity}
            initialExtras={editingCartItem.item.extras}
            initialNote={editingCartItem.item.note}
            onClose={() => setEditingCartItem(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
