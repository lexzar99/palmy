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
  Gift,
  AlertCircle,
  Check,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { useCartStore } from "@/store/cartStore";
import BogoPickerModal from "@/components/BogoPickerModal";
import { rememberActiveOrder } from "@/components/LiveOrderBanner";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import StripeCheckout from "@/components/StripeCheckout";
import DealSpotlight from "@/components/DealSpotlight";
import ProductModal from "@/components/ProductModal";
import { saveOrderToHistory } from "@/lib/orderHistory";
import {
  type QuickAddress,
  findQuickAddressByText,
  formatQuickAddress,
  parseStoredAddress,
  readQuickAddresses,
  rememberQuickAddress,
  writeQuickAddresses,
} from "@/lib/quickAddresses";
import { PublicDeal, pickBestDeal, formatDealReward } from "@/lib/deals";
import { useTranslation } from "@/lib/i18n/LocaleProvider";

// Account-deal från GET /api/account/deals — vi använder ACTIVE-deals av typ
// WELCOME/REFERRAL_INVITER/REFERRAL_INVITEE som rabatt-checkbox i kassan.
type UserAccountDeal = {
  id: string;
  type: "WELCOME" | "REFERRAL_INVITER" | "REFERRAL_INVITEE" | string;
  status: "ACTIVE" | "USED" | "EXPIRED" | string;
  amountKr?: number;
  discountPercent?: number;
  discountType?: string | null; // NONE | PERCENTAGE | FIXED
  freeDelivery?: boolean; // Stackbar med discountType
  minOrderKr?: number;
  expiresAt?: string | null;
  metadata?: Record<string, any> | null;
};

// Räknar ut total rabatt-belopp i kr för en deal givet subtotal+deliveryFee.
// Stacks: subtotal-rabatt (percent/fixed) + fri-leverans (= deliveryFee).
function computeDealAmountKr(deal: UserAccountDeal, subtotal: number, deliveryFee: number = 0): number {
  // Backward compat: legacy discountType=FREE_DELIVERY = bara leveransen
  const isLegacyFreeDel = deal.discountType === "FREE_DELIVERY";
  const wantsFreeDel = !!deal.freeDelivery || isLegacyFreeDel;

  let subtotalDiscount = 0;
  if (!isLegacyFreeDel) {
    if (deal.discountPercent && deal.discountPercent > 0) {
      subtotalDiscount = Math.round((subtotal * deal.discountPercent) / 100);
    } else if (deal.amountKr && deal.amountKr > 0) {
      subtotalDiscount = deal.amountKr;
    }
  }
  subtotalDiscount = Math.min(subtotalDiscount, subtotal);

  const deliveryDiscount = wantsFreeDel ? Math.max(0, deliveryFee) : 0;

  return subtotalDiscount + deliveryDiscount;
}

// Formatterar rabatt-text för UI. Stackar:
//   "25%" / "50 kr" / "Fri leverans" / "25% + Fri leverans".
function formatDealLabel(deal: UserAccountDeal, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const isLegacyFreeDel = deal.discountType === "FREE_DELIVERY";
  const parts: string[] = [];
  if (!isLegacyFreeDel) {
    if (deal.discountPercent && deal.discountPercent > 0) parts.push(`${deal.discountPercent}%`);
    else if (deal.amountKr && deal.amountKr > 0) parts.push(`${deal.amountKr} ${t("common.kr")}`);
  }
  if (deal.freeDelivery || isLegacyFreeDel) parts.push(t("cart.dealLabel.freeDelivery"));
  return parts.length > 0 ? parts.join(" + ") : t("cart.dealLabel.fallback");
}

function dealTypeLabel(type: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  if (type === "WELCOME") return t("cart.dealType.welcome");
  if (type === "REFERRAL_INVITER") return t("cart.dealType.referralInviter");
  if (type === "REFERRAL_INVITEE") return t("cart.dealType.referralInvitee");
  return t("cart.dealType.fallback");
}

// Stripe-key måste vara satt i prod. Tidigare fallback till "pk_test_placeholder"
// betydde att en miss-deployad Vercel-build laddade Stripe med skräp-key →
// PaymentElement renderade tyst inget, "Betala X kr nu"-knappen gjorde inget
// vid klick. Nu: logga loud och returnera null så vi kan visa en tydlig
// felvy istället för en frozen checkout.
const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripeKeyMissing =
  !STRIPE_PUBLISHABLE_KEY || !STRIPE_PUBLISHABLE_KEY.startsWith("pk_");

if (stripeKeyMissing && typeof window !== "undefined") {
  console.error(
    "[stripe] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY saknas eller är ogiltig — betalning kommer inte fungera. Sätt env-var i Vercel.",
  );
}

const stripePromise = stripeKeyMissing
  ? null
  : loadStripe(STRIPE_PUBLISHABLE_KEY as string);

export default function CartPage() {
  const { t } = useTranslation();
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
  const [topUpToMinimum, setTopUpToMinimum] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const idempotencyKey = useRef<string>(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2)
  );
  const [deals, setDeals] = useState<PublicDeal[]>([]);
  const [personalDeals, setPersonalDeals] = useState<any[]>([]);
  const [selectedPersonalDeal, setSelectedPersonalDeal] = useState<any>(null);
  // Account-deals (WELCOME, REFERRAL_INVITER, REFERRAL_INVITEE) från
  // GET /api/account/deals. Endast ACTIVE-status räknas — kund kryssar i för
  // att applicera, vi skickar userDealId i order-payload.
  const [accountDeals, setAccountDeals] = useState<UserAccountDeal[]>([]);
  const [selectedAccountDealId, setSelectedAccountDealId] = useState<string | null>(null);
  // Kund kan välja att avbryta den automatiskt applicerade dealen (t.ex.
  // "25% första beställning") för att använda en egen rabattkod istället.
  // Default false → auto-deal appliceras som vanligt. Sätts true automatiskt
  // när en kod eller account-deal aktiveras så ingen dubbel-mutex behövs.
  const [automaticDealDismissed, setAutomaticDealDismissed] = useState(false);
  const [bogoPreview, setBogoPreview] = useState<{
    discountKr: number; dealTitle: string; dealId: string | null;
    rewardCategoryName: string | null;
    rewardProducts: { id: string; name: string; price: number; imageUrl: string | null }[];
    bogoExcludedExtraIds: string[];
    // Antal gratis-varor kunden kan välja. 1 för traditionell BOGO,
    // N för skalad (t.ex. 2 kebabpizzor → 2 gratis drycker).
    maxFreeItems: number;
  } | null>(null);
  // Banner som visas när kundens BOGO-val plötsligt försvinner mitt-session
  // (deal-admin disablade, expiry passerade, eller kvalificerande artikel
  // togs bort). Tidigare nollades bogoChoice tyst → kund såg sin gratis-vara
  // försvinna utan förklaring → tror appen är trasig.
  const [bogoLostNotice, setBogoLostNotice] = useState<string | null>(null);
  // Ref till payment-sektionen så vi kan scrolla DIT när Stripe öppnas
  // istället för till body-botten (vilket overshootade på korta viewports).
  const paymentSectionRef = useRef<HTMLDivElement | null>(null);
  // Lagrar senast checkade coords så vi inte hammrar validate-location när
  // status är "error" (out-of-zone) men ingen ny adress valts. Nollställs
  // i handleAddressSelect så ny adress alltid triggar färsk check.
  const lastCheckedCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const [showBogoPicker, setShowBogoPicker] = useState(false);
  const [showDealsModal, setShowDealsModal] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [deliveryCheck, setDeliveryCheck] = useState<any>(null);
  const [checkingDelivery, setCheckingDelivery] = useState(false);

  const [restaurantSettings, setRestaurantSettings] = useState<{
    isOpen: boolean;
    deliveryFee: number;
    minOrderAmount: number;
    estimatedPickupTime: number;
    estimatedDeliveryTime: number;
    pausedUntil?: string | null;
    isPaused?: boolean;
    vatPercent?: number | null;
  }>({
    isOpen: true,
    deliveryFee: 0,
    minOrderAmount: 150,
    estimatedPickupTime: 20,
    estimatedDeliveryTime: 35,
  });

  const [formData, setFormData] = useState(() => {
    const savedName = typeof window !== "undefined" ? localStorage.getItem("guest_name") || "" : "";
    const savedPhone = typeof window !== "undefined" ? localStorage.getItem("guest_phone") || "" : "";
    const savedEmail = typeof window !== "undefined" ? localStorage.getItem("guest_email") || "" : "";
    return {
      customerName: savedName,
      customerPhone: savedPhone,
      customerEmail: savedEmail,
      deliveryStreet: "",
      deliveryZip: "",
      deliveryCity: "",
      deliveryInstructions: "",
      note: "",
    };
  });

  const [scheduledFor, setScheduledFor] = useState<Date | null>(null);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [selDate, setSelDate] = useState("");
  const [selHour, setSelHour] = useState("12");
  const [selMin, setSelMin] = useState("00");

  // Dricks (paritet med RN CartScreen) — endast leverans
  const [tipAmount, setTipAmount] = useState<number>(0);
  const [showCustomTipInput, setShowCustomTipInput] = useState<boolean>(false);
  const [customTipText, setCustomTipText] = useState<string>("");

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
    // Ny adress vald → nollställ rate-limit-refen + status så zone-effekten
    // får köra färsk check. Annars skulle senast-checkade coords matcha och
    // skippas. Kritiskt vid byte mellan in-zone och out-of-zone-adress.
    lastCheckedCoordsRef.current = null;
    setAddressZoneStatus(null);

    const street = pred.description.split(",")[0] || pred.description;
    // Optimistic: extract zip from description text while geocode loads
    const zipMatchFallback = pred.description.match(/\b\d{3}\s?\d{2}\b/);
    const zipFallback = zipMatchFallback ? zipMatchFallback[0].replace(/\s/g, "") : "";
    setFormData(prev => ({ ...prev, deliveryStreet: street, deliveryZip: zipFallback }));

    try {
      const res = await fetch(`/api/places/geocode?place_id=${pred.place_id}&sessiontoken=${sessionToken.current}`);
      const data = await res.json();
      if (data.location) {
        const coords = { lat: data.location.lat, lng: data.location.lng };
        // Prefer authoritative postalCode/city from Google address_component
        const zip = (data.postalCode || zipFallback).replace(/\s/g, "");
        const city = data.city || "";
        const zipCity = zip && city ? `${zip} ${city}` : zip || city;
        const displayAddress = [street, zipCity].filter(Boolean).join(", ");
        localStorage.setItem("platform_coords", JSON.stringify(coords));
        localStorage.setItem("platform_address", displayAddress);
        setAddressInput(displayAddress);
        setFormData(prev => ({ ...prev, deliveryStreet: street, deliveryZip: zip, deliveryCity: city }));
        setQuickAddresses(
          rememberQuickAddress({
            street,
            latitude: coords.lat,
            longitude: coords.lng,
            zip,
            city,
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
  const bogoChoice = useCartStore((s) => s.bogoChoice);
  const setBogoChoice = useCartStore((s) => s.setBogoChoice);
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

  // Eager zone-check: kör direkt när vi har allt vi behöver (orderType=DELIVERY,
  // restaurantId, adress + coords) och status inte är "ok" än. Tidigare gick
  // detta bara på orderType-byte (deps=[orderType]) vilket missade fallet att
  // cart laddas i DELIVERY-mode default. Då fanns ingen zone-check förrän
  // kunden klickade "Slutför Köp" → fee:n hoppade abrupt upp och totalen
  // "glitchade". Nu kör zone-check så snart adressen blir tillgänglig.
  //
  // BUG-FIX (loop): tidigare hade guarden bara "ok" och "checking" — när
  // status hamnade på "error" (out-of-zone) gick effekten igenom igen, vilket
  // satte status checking → error → checking → error i evig loop som
  // hammrade API:t. Tre fixar:
  //   1. "error" lagts till i guard så vi inte re-checkar samma misslyckande
  //   2. useRef lagrar senast checkade coords → ny check bara om adress ändras
  //   3. Adress-byte nollställer refen explicit via handleAddressSelect
  useEffect(() => {
    if (orderType !== "DELIVERY") return;
    if (!currentRestaurantId) return;
    if (!formData.deliveryStreet) return;
    if (addressZoneStatus === "ok" || addressZoneStatus === "checking" || addressZoneStatus === "error") return;
    const storedCoords = localStorage.getItem("platform_coords");
    if (!storedCoords) return;
    try {
      const coords = JSON.parse(storedCoords);
      if (!coords?.lat || !coords?.lng) return;
      const last = lastCheckedCoordsRef.current;
      // Samma coords som senast → skippa (oavsett resultat). Detta + "error"-
      // guarden ovan stänger loopen även om en out-of-zone-adress står kvar.
      if (last && last.lat === coords.lat && last.lng === coords.lng) return;
      lastCheckedCoordsRef.current = { lat: coords.lat, lng: coords.lng };
      checkDeliverySpecific(coords.lat, coords.lng);
    } catch {}
    // checkDeliverySpecific är inte memoiserad, men dess closures är stabila
    // (läser från useCartStore.getState() + setState-setters). Listar inte
    // den i deps för att undvika onödiga re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderType, currentRestaurantId, formData.deliveryStreet, addressZoneStatus]);

  // Endast zone-checkad leveransavgift. Tidigare fallade vi tillbaka till
  // restaurantSettings.deliveryFee (som kunde innehålla stale data från
  // föregående zone-check eller deliveryOverrides från cartStore). Resultat:
  // kassan visade en fee som inte matchade kundens nuvarande adress, och
  // när zone-check kördes på "Slutför Köp"-klick uppdaterades fee:n abrupt
  // → "glitch" där totalen hoppade upp med 49 kr precis innan betalning.
  // Nu: 0 kr tills zone-check verifierat aktuell adress. UI visar
  // "Beräknar..." om vi är mitt i zone-check.
  const deliveryFee = orderType === "DELIVERY"
    ? (deliveryCheck?.deliveryFee ?? 0)
    : 0;
  const minOrder = deliveryCheck?.minOrder ?? restaurantSettings.minOrderAmount;
  // minOrderTopUp definieras längre ner — den behöver finalDiscount och
  // effectiveMinOrder som båda är beroende av deals/rabatter beräknade nedan.
  const productIds = items.flatMap((i) => Array.from({ length: i.quantity }, () => i.productId));
  const automaticDeal = useMemo(() => pickBestDeal(deals, subtotal, productIds), [deals, subtotal, productIds]);

  // Hitta närmaste inaktiva deal för tröskel-nudge (max 100 kr kvar, inte redan aktiv)
  const dealNudge = useMemo(() => {
    if (!deals.length) return null;
    let closest: { deal: PublicDeal; missing: number } | null = null;
    for (const deal of deals) {
      if (deal.minOrder <= 0) continue;
      const missing = Math.max(deal.minOrder - subtotal, 0);
      if (missing === 0) continue; // redan aktiv
      if (missing > 100) continue; // för långt ifrån
      if (!closest || missing < closest.missing) closest = { deal, missing };
    }
    return closest;
  }, [deals, subtotal]);

  const personalDiscount = useMemo(() => {
    if (!selectedPersonalDeal) return 0;
    const { campaign } = selectedPersonalDeal;
    if (subtotal < (campaign.minOrder || 0)) return 0;

    // Bas-rabatt: procent eller fast belopp.
    let amount = 0;
    if (campaign.discountType === "PERCENTAGE") {
      amount = (subtotal * campaign.discountValue) / 100;
    } else if (campaign.discountType === "FREE_DELIVERY") {
      // Standalone fri-leverans-kupong: rabatten = deliveryFee.
      amount = deliveryFee;
    } else {
      amount = Math.min(campaign.discountValue, subtotal);
    }

    // Stackbar fri leverans-flagga (Eriks bugg-fix): backend lagrar
    // freeDelivery=true på PERCENTAGE/FIXED-kuponger som ska kombinera
    // med fri leverans. Plussa på deliveryFee så cart-totalen visar
    // samma slutsumma som backend räknar fram. Redundant för
    // FREE_DELIVERY-typen (där flaggan ignoreras backend-side).
    if (
      campaign.freeDelivery &&
      campaign.discountType !== "FREE_DELIVERY" &&
      deliveryFee > 0
    ) {
      amount += deliveryFee;
    }

    return amount;
  }, [selectedPersonalDeal, subtotal, deliveryFee]);

  const bogoDiscount = bogoPreview?.discountKr ?? 0;
  // Antal gratis-varor kunden redan valt för den aktiva BOGO-dealen.
  // Räknas från cart-items med `bogoFreeFromDealId` matchande aktuell deal.
  // Används för att veta hur många fler gratis-varor som kan väljas
  // (för scaled-BOGO: t.ex. 2 kebabpizzor → 2 drycker tillåtna).
  const bogoPickedCount = bogoPreview?.dealId
    ? items.filter((i) => i.bogoFreeFromDealId === bogoPreview.dealId).reduce((sum, i) => sum + i.quantity, 0)
    : 0;
  const bogoMaxFreeItems = bogoPreview?.maxFreeItems ?? 0;
  const bogoPicksRemaining = Math.max(0, bogoMaxFreeItems - bogoPickedCount);

  // Account-deal-rabatt: appliceras bara om vald + min-order är uppfyllt.
  // Stöder både percent (ny) och amountKr (legacy) via computeDealAmountKr.
  const selectedAccountDeal = useMemo(
    () => accountDeals.find((d) => d.id === selectedAccountDealId) || null,
    [accountDeals, selectedAccountDealId],
  );
  const accountDealDiscount = useMemo(() => {
    if (!selectedAccountDeal) return 0;
    const minK = selectedAccountDeal.minOrderKr ?? 0;
    if (subtotal < minK) return 0;
    // deliveryFee skickas med för FREE_DELIVERY-deals så rabatten matchar
    // exakt det användaren skulle betalat i frakt.
    return computeDealAmountKr(selectedAccountDeal, subtotal, deliveryFee);
  }, [selectedAccountDeal, subtotal, deliveryFee]);

  // Prioritet:
  //   1. Användarens EXPLICITA VAL (selectedPersonalDeal ELLER selectedAccountDealId)
  //      — om något val finns används det ENDA värdet (även om det råkar vara
  //      0 kr för att koden inte uppfyller minOrder). Auto-källor smyger inte
  //      tillbaka in via Math.max.
  //   2. Annars: bästa av auto-deal/bogoPreview (om inte avdismissad).
  //
  // bogoPreview kan vara två olika saker:
  //   - PURE DISCOUNT (rewardProducts tom) — t.ex. "25% första beställning".
  //     Räknas som "auto-deal" och kan dismissas av kund.
  //   - FREE-ITEM BOGO (rewardProducts.length > 0) — kund plockar gratis-vara
  //     från en kategori. Kan INTE dismissas eftersom gratis-varan ligger i
  //     varukorgen; dismiss skulle dölja rabatten men inte ta bort items.
  const bogoIsPureDiscount = !!bogoPreview && (bogoPreview.rewardProducts?.length ?? 0) === 0;
  const hasUserExplicitChoice = !!selectedPersonalDeal || !!selectedAccountDealId;
  // Pure-discount-bogo respekterar dismissal-flaggan; free-item-bogo gör inte det.
  const dismissibleAutoDiscount = automaticDealDismissed
    ? 0
    : Math.max(automaticDeal.discountAmount, bogoIsPureDiscount ? bogoDiscount : 0);
  const freeItemBogoDiscount = bogoIsPureDiscount ? 0 : bogoDiscount;
  const finalDiscount = hasUserExplicitChoice
    ? Math.max(personalDiscount, accountDealDiscount, freeItemBogoDiscount)
    : Math.max(dismissibleAutoDiscount, freeItemBogoDiscount);
  // Rabatt-tolerans: när en rabatt är aktiv tillåter vi att totalen (efter
  // rabatten) hamnar upp till MIN_ORDER_TOLERANCE_KR under restaurangens
  // min-order. UTAN rabatt gäller den vanliga strikta gränsen — annars
  // skulle alla kunder smita undan minimi genom att lägga få varor.
  // Anti-bypass: drycker (~20 kr) klarar fortfarande inte den lägre
  // tröskeln även med 100%-rabatt eftersom basbeloppet är för litet.
  const MIN_ORDER_TOLERANCE_KR = 40;
  const hasActiveDiscount = finalDiscount > 0;
  const effectiveMinOrder = hasActiveDiscount
    ? Math.max(0, minOrder - MIN_ORDER_TOLERANCE_KR)
    : minOrder;
  // Komplettering till minimum: kund kan välja att betala mellanskillnaden så
  // ordern går igenom. Med rabatt → komplettering räcker till effektiv min
  // (40 kr lägre). Utan rabatt → komplettering till FULL min, oförändrat.
  const valueForMinCheck = Math.max(0, subtotal - finalDiscount);
  const minOrderTopUp = topUpToMinimum && subtotal > 0 && valueForMinCheck < effectiveMinOrder
    ? Math.max(0, effectiveMinOrder - valueForMinCheck)
    : 0;
  // Dricks läggs till total endast vid DELIVERY (RN-paritet — dricks är till leveranspersonen)
  const effectiveTip = orderType === "DELIVERY" ? Math.max(0, tipAmount) : 0;
  // Page-level isTestFlow så att både startCheckout-logiken och submit-
  // knappens disabled-villkor kan respektera test-bypass:en. Annars
  // räcker det inte att startCheckout släpper igenom — knappen är ändå
  // disable:d när restaurang stängd / under min-order / utan zone.
  const isTestFlow = selectedPersonalDeal?.code === "test" || selectedPersonalDeal?.code === "testa";
  // Avrunda UPP till hela kronor. JS-float-precision på rabatt-procent gör
  // att t.ex. "20% av 199 kr" blir 39.79999... → utan ceil hamnar totalen
  // som "154.28999999999996 kr" på Stripe-knappen. Ceil betyder kunden
  // betalar maximalt 1 kr mer än exakt — vi förlorar inte pengar, och
  // siffror blir rena. Backend matchar via samma Math.ceil i orders.ts.
  const total = isTestFlow ? 0 : Math.ceil(Math.max(0, subtotal + deliveryFee + minOrderTopUp + effectiveTip - finalDiscount));

  const fetchContext = useCallback(async () => {
    try {
      const [settingsRes, dealsRes, userRes, pDealsRes, restaurantRes, accountDealsRes] = await Promise.all([
        axios.get(`${API_URL}/api/settings`).catch(() => ({ data: {} })),
        axios.get(`${API_URL}/api/deals`, { params: currentRestaurantId ? { restaurantId: currentRestaurantId } : {} }).catch(() => ({ data: [] })),
        axios.get(`/api/platform/profile`).catch(() => ({ data: null })),
        axios.get(`/api/platform/profile/deals`).catch(() => ({ data: [] })),
        currentRestaurantId ? axios.get(`${API_URL}/api/restaurants/${currentRestaurantId}`).catch(() => ({ data: null })) : Promise.resolve({ data: null }),
        axios.get<{ deals: UserAccountDeal[] }>(`/api/platform/account/deals`).catch(() => ({ data: { deals: [] } })),
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
          // Bevara prev.vatPercent om restaurant-svaret inte explicit har en
          // siffra. Tidigare nullades alltid → även om global /api/settings
          // levererade en moms-procent försvann den när restaurant-svaret
          // saknade fältet (t.ex. äldre serializer-versioner som inte
          // returnerar vatPercent). Nu prioriteras restaurant > settings >
          // null, men aldrig "nulla ut" en redan-laddad procent.
          vatPercent: typeof restaurantRes.data.vatPercent === 'number'
            ? restaurantRes.data.vatPercent
            : prev.vatPercent,
        }));
      }

      setDeals(dealsRes.data || []);
      setPersonalDeals(pDealsRes.data || []);

      // Account-deals: filtrera ACTIVE av relevant typ. Ordna med "närmaste
      // utgång" först så användaren ser de mest tids-känsliga rabatterna.
      const acctDeals = ((accountDealsRes.data?.deals as UserAccountDeal[]) || [])
        .filter(
          (d) =>
            d.status === "ACTIVE" &&
            ["WELCOME", "REFERRAL_INVITER", "REFERRAL_INVITEE"].includes(d.type),
        )
        .sort((a, b) => {
          const ax = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
          const bx = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY;
          return ax - bx;
        });
      setAccountDeals(acctDeals);

      if (userRes.data) {
        setUser(userRes.data);
        setFormData((prev) => ({
          ...prev,
          customerName: userRes.data.name || prev.customerName,
          customerPhone: userRes.data.phone || prev.customerPhone,
          // Email pre-fyllt från inloggad profil (krävs av Klarna m.fl. server-
          // side, så tomt fält → Stripe rejectar mitt-flow). Pre-fyll bara om
          // användaren inte redan börjat editera fältet.
          customerEmail: prev.customerEmail || userRes.data.email || "",
          // Only pull from profile if form is currently empty
          deliveryStreet: prev.deliveryStreet || userRes.data.address || "",
          deliveryZip: prev.deliveryZip || userRes.data.zip || "",
        }));
        // Load saved addresses
        try {
          const addrRes = await axios.get(`/api/platform/profile/addresses`);
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

      // Delivery zone check is handled by the address useEffect below
    } catch (err) {
      console.error(err);
    } finally {
      setPageLoading(false);
    }
  }, [currentRestaurantId]);

  const handleApplyPromo = async () => {
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
      setSelectedAccountDealId(null);
      return;
    }

    const matched = personalDeals.find(d => d.code.toLowerCase() === code);
    if (matched) {
      setSelectedPersonalDeal(matched);
      // Rensa account-deal när en kupong-kod väljs — bara en rabatt åt gången
      setSelectedAccountDealId(null);
      return;
    }

    try {
      // Använd page-level `subtotal` (= cartStore.getTotal()) istället för
      // att räkna ut lokalt. Tidigare lokal beräkning exkluderade extras
      // → om en rabattkod hade minOrder-krav kunde backend rejecta felaktigt
      // när kunden hade extras som faktiskt gjorde att de mötte minOrder.
      const res = await fetch(`${API_URL}/api/discount/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCodeInput.trim(), subtotal }),
      });
      if (res.ok) {
        const data = await res.json();
        // discountType reflekterar backend-type:n exakt. freeDelivery är
        // en SEPARAT flagga som stackar på PERCENTAGE/FIXED. Tidigare
        // klassificerade vi felaktigt en FIXED+freeDelivery-kupong som
        // FREE_DELIVERY-typ → kunden såg bara fri leverans-rabatten,
        // inte den fasta rabatten på subtotal.
        setSelectedPersonalDeal({
          code: data.code,
          campaign: {
            discountType: data.type === "PERCENTAGE"
              ? "PERCENTAGE"
              : data.type === "FREE_DELIVERY"
                ? "FREE_DELIVERY"
                : "FIXED",
            discountValue: data.value,
            title: data.description || data.code,
            minOrder: 0,
            freeDelivery: Boolean(data.freeDelivery),
          }
        });
        setSelectedAccountDealId(null);
      } else {
        const err = await res.json();
        setError(err.error || t("cart.errors.invalidPromo"));
      }
    } catch {
      setError(t("cart.errors.invalidPromo"));
    }
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
      const { street, zip, city, clean } = parseStoredAddress(storedAddress);
      const cachedQuickAddress = findQuickAddressByText(clean) ?? findQuickAddressByText(storedAddress);

      if (clean !== storedAddress) localStorage.setItem("platform_address", clean);
      setAddressInput(clean);

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
            setQuickAddresses(rememberQuickAddress({ street, zip: zip || undefined, city: city || undefined, latitude: lat, longitude: lng }));
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
                const resolvedZip = (data.postalCode || zip).replace(/\s/g, "");
                const resolvedCity = data.city || city;
                localStorage.setItem("platform_coords", JSON.stringify(data.location));
                setQuickAddresses(
                  rememberQuickAddress({
                    street,
                    latitude: data.location.lat,
                    longitude: data.location.lng,
                    zip: resolvedZip || undefined,
                    city: resolvedCity || undefined,
                  }),
                );
                setFormData(prev => ({
                  ...prev,
                  deliveryStreet: street || prev.deliveryStreet,
                  deliveryZip: resolvedZip || prev.deliveryZip,
                  deliveryCity: resolvedCity || prev.deliveryCity
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

  // Restaurang-status-poll: om kund tillbringar 15-20 min i kassan och
  // restaurangen stängt under tiden vill vi upptäcka det innan de klickar
  // "Slutför köp". Pollar var 30s. Disabler submit-knappen via
  // restaurantSettings.isOpen som redan används i rad ~1541.
  useEffect(() => {
    if (!currentRestaurantId) return;
    const checkStatus = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/restaurants/${currentRestaurantId}`);
        if (res.data) {
          setRestaurantSettings((prev) => {
            const nextIsOpen = res.data.isOpen ?? prev.isOpen;
            // Om restaurang precis återöppnade (false → true) och vi har ett
            // "stängt"-fel på skärmen: clear det så knappen inte fortsätter
            // säga "stängd" parallellt med att den är aktivt enabled.
            if (!prev.isOpen && nextIsOpen) {
              setError((current) =>
                current && /stängd|pausad|återöppnar/i.test(current) ? null : current,
              );
            }
            return {
              ...prev,
              isOpen: nextIsOpen,
              pausedUntil: res.data.pausedUntil ?? prev.pausedUntil,
            };
          });
        }
      } catch {
        // Ignorerat — om vi inte når servern lämnar vi senaste värdet
      }
    };
    const interval = setInterval(checkStatus, 30_000);
    return () => clearInterval(interval);
  }, [currentRestaurantId]);

  // BOGO-förhandsgranskning: anropa server-side evaluate-cart när varukorgen ändras
  useEffect(() => {
    if (!currentRestaurantId || items.length === 0) {
      setBogoPreview(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await axios.post(`${API_URL}/api/deals/evaluate-cart`, {
          restaurantId: currentRestaurantId,
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        });
        const data = res.data;
        if (data.discountAmountKr > 0 && data.dealTitle) {
          setBogoPreview({
            discountKr: data.discountAmountKr,
            dealTitle: data.dealTitle,
            dealId: data.dealId ?? null,
            rewardCategoryName: data.rewardCategoryName ?? null,
            rewardProducts: data.rewardProducts ?? [],
            bogoExcludedExtraIds: Array.isArray(data.bogoExcludedExtraIds) ? data.bogoExcludedExtraIds : [],
            maxFreeItems: typeof data.maxFreeItems === "number" && data.maxFreeItems > 0 ? data.maxFreeItems : 1,
          });
          // Rensa bogoChoice om det gäller en annan deal — varna kunden
          // så de inte förvirras av att gratis-varan plötsligt byttes.
          const existing = useCartStore.getState().bogoChoice;
          if (existing && existing.dealId !== data.dealId) {
            setBogoChoice(null);
            setBogoLostNotice(t("cart.bogo.lostSwapped", { previous: existing.dealTitle, current: data.dealTitle }));
          }
        } else {
          setBogoPreview(null);
          const existing = useCartStore.getState().bogoChoice;
          if (existing) {
            // Varna ENDAST om kunden faktiskt hade valt en gratis-vara.
            // (Annars är "no deal" det normala tillståndet.)
            setBogoChoice(null);
            setBogoLostNotice(t("cart.bogo.lostGone", { previous: existing.dealTitle }));
          }
        }
      } catch {
        setBogoPreview(null);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [items, currentRestaurantId, setBogoChoice, t]);

  // Auto-dismiss BOGO-lost-notice efter 8s så banner inte hänger kvar
  // permanent på sidan.
  useEffect(() => {
    if (!bogoLostNotice) return;
    const timer = setTimeout(() => setBogoLostNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [bogoLostNotice]);

  // Stripe redirect recovery: när kunden återvänder från Klarna BankID /
  // Swish / 3DS. Stripe lägger på `payment_intent`, `payment_intent_client_secret`
  // och `redirect_status` på return_url:en. Vi sätter dessutom själva
  // `payment_success=true` (se StripeCheckout.tsx) som en extra fallback-flagga
  // om någon proxy strippar Stripe-paramen.
  //
  // Tidigare hanterade vi bara redirect_status `succeeded`/`failed`. Klarna
  // returnerar dock ofta `processing` (webhook bekräftar asynkront) och
  // `requires_payment_method` när kunden avbryter — båda hamnade i ett dött
  // läge där kunden blev kvar på kassan utan feedback. Vi fixar det nu genom
  // att routa till order-tracking även för `processing` (orderns pendingPayment
  // är då fortfarande true men /order/{id} pollar och flippar när webhook
  // hinner fram) och visa retry-error för failed/requires_payment_method.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const redirectStatus = params.get("redirect_status");
    const paymentIntent = params.get("payment_intent");
    const paymentSuccess = params.get("payment_success");
    const storedOrderId = localStorage.getItem("pending_order_id");

    // Triggar om något av Stripe:s signaler finns — eller vår egen flag
    // (payment_success=true) om Stripe-paramen saknas av någon anledning.
    const cameFromStripeRedirect = !!(redirectStatus || paymentIntent || paymentSuccess === "true");
    if (!cameFromStripeRedirect || !storedOrderId) return;

    const routeToOrder = () => {
      // Inkludera access-token + phone som auth-bevis i URL:n så order-
      // tracking-sidan kan läsa ordern utan inloggning. Båda är fallbacks
      // mot varandra (server accepterar antingen).
      const storedToken = localStorage.getItem("pending_order_token") || "";
      const phone = (formData.customerPhone || "").trim();
      const qs = new URLSearchParams();
      if (storedToken) qs.set("token", storedToken);
      if (phone) qs.set("phone", phone);
      const url = qs.toString() ? `/order/${storedOrderId}?${qs.toString()}` : `/order/${storedOrderId}`;
      clearCart();
      localStorage.removeItem("pending_order_id");
      localStorage.removeItem("pending_order_token");
      router.replace(url);
    };

    if (redirectStatus === "failed" || redirectStatus === "requires_payment_method") {
      // Kunden avbröt / banken nekade — låt dem retrya på kassan. Behåll
      // pending_order_id så att om de gör en ny PaymentIntent mot SAMMA
      // order så återanvänds den (backend matchar via orderId).
      setError(
        redirectStatus === "requires_payment_method"
          ? t("cart.errors.paymentCancelled")
          : t("cart.errors.paymentFailed"),
      );
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    // succeeded / processing / requires_action / inget redirectStatus
    // (men payment_success=true) → routa till order-tracking. /order/{id}
    // pollar backend så kunden får rätt status även om webhook ej hunnit
    // bekräfta än.
    routeToOrder();
  }, []);

  const buildOrderPayload = (paymentIntentId?: string) => {
    // Bake in dricks-anteckning till note/deliveryInstructions enligt RN-mönstret —
    // backend och kurir ser dricks-beloppet direkt i fritext utöver `tip`-fältet.
    const baseNote = formData.note || "";
    const baseDeliveryInstructions = orderType === "DELIVERY"
      ? (formData.deliveryInstructions || "")
      : "";
    const tipNote = effectiveTip > 0 ? `(Dricks gett: ${effectiveTip} kr i appen)` : "";
    const composedNote = tipNote
      ? `${tipNote}${baseNote ? ` ${baseNote}` : ""}`.trim()
      : baseNote;
    const composedDeliveryInstructions = orderType === "DELIVERY"
      ? (tipNote ? `${tipNote}${baseDeliveryInstructions ? ` ${baseDeliveryInstructions}` : ""}`.trim() : baseDeliveryInstructions)
      : undefined;

    return {
      type: orderType,
      customerName: formData.customerName,
      customerPhone: formData.customerPhone,
      customerEmail: formData.customerEmail || undefined,
      deliveryStreet: orderType === "DELIVERY" ? formData.deliveryStreet : undefined,
      deliveryZip: orderType === "DELIVERY" ? formData.deliveryZip : undefined,
      deliveryCity: orderType === "DELIVERY" ? (formData.deliveryCity || undefined) : undefined,
      // Coords sparas på ordern för per-zon-ETA-räkning i efterhand. Endast
      // för DELIVERY (PICKUP behöver inte kundens lat/lng).
      deliveryLatitude: orderType === "DELIVERY" ? (() => { try { return JSON.parse(localStorage.getItem("platform_coords") || "null")?.lat; } catch { return undefined; } })() : undefined,
      deliveryLongitude: orderType === "DELIVERY" ? (() => { try { return JSON.parse(localStorage.getItem("platform_coords") || "null")?.lng; } catch { return undefined; } })() : undefined,
      note: composedNote || undefined,
      deliveryInstructions: composedDeliveryInstructions || undefined,
      stripePaymentIntentId: paymentIntentId,
      discountCode: selectedPersonalDeal?.code || undefined,
      appliedDealId: selectedPersonalDeal || selectedAccountDealId || automaticDealDismissed
        ? undefined
        : (automaticDeal.deal?.id || undefined),
      // Skickas till backend så pickBestDeal hoppar över auto-pickup när
      // kunden valt EGEN rabatt (kupong eller välkomst) eller explicit stängt
      // av auto-dealen. Säkerställer att frontend-total === backend-total.
      skipAutomaticDeal: !!(selectedPersonalDeal || selectedAccountDealId || automaticDealDismissed),
      // Account-deal (WELCOME/REFERRAL_*) — backend matchar mot UserDeal.id
      // och markerar den som USED när ordern slutförs.
      userDealId: selectedAccountDeal?.id || undefined,
      restaurantId: useCartStore.getState().restaurantId || undefined,
      restaurantSlug: useCartStore.getState().restaurantSlug || undefined,
      lat: (() => { try { return JSON.parse(localStorage.getItem("platform_coords") || "null")?.lat; } catch { return undefined; } })(),
      lng: (() => { try { return JSON.parse(localStorage.getItem("platform_coords") || "null")?.lng; } catch { return undefined; } })(),
      scheduledFor: scheduledFor?.toISOString() || undefined,
      tip: effectiveTip > 0 ? effectiveTip : undefined,
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
      minOrderTopUp: minOrderTopUp > 0 ? minOrderTopUp : undefined,
    };
  };

  // Test/promo-flow (FREE_PROMO) — bypass Stripe helt och posta order
  // direkt. Backend ser stripePaymentIntentId === "FREE_PROMO" + discountCode
  // === "test"/"testa" → skippar Stripe-verifiering.
  const submitOrder = async (paymentIntentId: string) => {
    setLoading(true);
    try {
      const res = await axios.post(`/api/platform/orders`, buildOrderPayload(paymentIntentId));
      const orderId = res.data?.orderId;
      // Spara även för test-orders så vi kan testa /orders-history-flödet
      // (annars saknar testorders i guest-historik och vi kan inte verifiera
      // den vägen).
      if (orderId) {
        saveOrderToHistory({
          id: orderId,
          phone: formData.customerPhone,
          createdAt: new Date().toISOString(),
          restaurantName: cartRestaurantSlug ?? null,
          restaurantSlug: cartRestaurantSlug ?? null,
          total: total,
        });
        rememberActiveOrder(orderId);
      }
      clearCart();
      if (orderId) {
        // Test-flödet returnerar accessToken samma route som riktiga ordrar.
        const testToken = res.data?.accessToken;
        const qs = new URLSearchParams();
        if (testToken) qs.set("token", testToken);
        if (formData.customerPhone) qs.set("phone", formData.customerPhone);
        router.push(qs.toString() ? `/order/${orderId}?${qs.toString()}` : `/order/${orderId}`);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || t("cart.errors.orderFailed"));
    } finally {
      setLoading(false);
    }
  };

  // Called by StripeCheckout after payment succeeds — navigate to the pre-created order
  const handlePaymentSuccess = useCallback(async (_paymentIntentId: string) => {
    const orderId = pendingOrderId || localStorage.getItem("pending_order_id");
    if (!orderId) {
      // Fallback: shouldn't happen in normal flow
      setError(t("cart.errors.paymentSucceededOrderMissing"));
      return;
    }
    // Spara i lokal order-history så kunden (även icke-inloggad) kan hitta
    // ordern senare via /orders-sidan. phone används som ownership-bevis
    // mot backend (GET /api/orders/:id?phone=...).
    saveOrderToHistory({
      id: orderId,
      phone: formData.customerPhone,
      createdAt: new Date().toISOString(),
      restaurantName: cartRestaurantSlug ? cartRestaurantSlug : null,
      restaurantSlug: cartRestaurantSlug ?? null,
      total: total,
    });
    // Inkludera access-token + phone i tracking-URL:n så gäster kan se
    // ordern utan inloggning. Tokenen returnerades av POST /api/orders.
    const storedToken = typeof window !== "undefined" ? localStorage.getItem("pending_order_token") : null;
    const trackQs = new URLSearchParams();
    if (storedToken) trackQs.set("token", storedToken);
    if (formData.customerPhone) trackQs.set("phone", formData.customerPhone);
    const trackUrl = trackQs.toString() ? `/order/${orderId}?${trackQs.toString()}` : `/order/${orderId}`;
    clearCart();
    localStorage.removeItem("pending_order_id");
    localStorage.removeItem("pending_order_token");
    rememberActiveOrder(orderId);
    router.push(trackUrl);
  }, [pendingOrderId, clearCart, router, formData.customerPhone, cartRestaurantSlug, total]);

  // Persist guest name/phone/email across sessions
  useEffect(() => {
    if (user || typeof window === "undefined") return;
    if (formData.customerName) localStorage.setItem("guest_name", formData.customerName);
    if (formData.customerPhone) localStorage.setItem("guest_phone", formData.customerPhone);
    if (formData.customerEmail) localStorage.setItem("guest_email", formData.customerEmail);
  }, [user, formData.customerName, formData.customerPhone, formData.customerEmail]);

  const startCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Test-bypass: koden "test"/"testa" ska kunna gå rakt igenom utan
    // Klarna/Stripe så vi kan smoke-testa hela order-flödet snabbt.
    // Vi behåller basala fält (namn, telefon, ev. leveransadress) men
    // skippar email-krav, min-order och zone-check som annars blockar
    // testning på spontana adresser eller med tom-cart-state.
    // isTestFlow är redan computed på page-level för att kunna styra
    // submit-knappens disabled-villkor också.

    if (!formData.customerName.trim() || !formData.customerPhone.trim()) {
      setError(t("cart.errors.namePhoneRequired"));
      return;
    }
    if (!isTestFlow) {
      // Email krävs FÖRE Stripe öppnas — Klarna/Apple Pay m.fl. rejectar
      // server-side utan email och kunden får en obegriplig error mitt-flow.
      // Bättre att fånga upp här med tydligt meddelande.
      const emailValue = formData.customerEmail.trim();
      if (!emailValue || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
        setError(t("cart.errors.emailRequired"));
        return;
      }
    }
    if (orderType === "DELIVERY") {
      const hasStreet = !!formData.deliveryStreet.trim();

      if (!hasStreet) {
        setError(t("cart.errors.streetRequired"));
        return;
      }
    }
    // Min-order-check: använd POST-rabatt-värdet jämfört med effektiv min
    // (officiell min − 40 kr). Detta gör att rabatter kan dra ner totalen
    // upp till 40 kr under restaurangens min utan att blockera kunden, men
    // hindrar "dryck + 100%-rabatt"-bypass eftersom basbeloppet då är för
    // lågt för att klara även den lägre tröskeln.
    if (!isTestFlow) {
      const afterDiscount = Math.max(0, subtotal - finalDiscount);
      if (afterDiscount < effectiveMinOrder && minOrderTopUp === 0) {
        const shortfall = Math.ceil(effectiveMinOrder - afterDiscount);
        setError(
          t("cart.minOrder.errorWithDiscount", { min: minOrder, effective: effectiveMinOrder, short: shortfall }),
        );
        return;
      }
    }
    if (!isTestFlow && !restaurantSettings.isOpen) {
      const pausedUntilDate = restaurantSettings.pausedUntil
        ? new Date(restaurantSettings.pausedUntil)
        : null;
      const isPaused =
        pausedUntilDate !== null && pausedUntilDate.getTime() > Date.now();
      if (isPaused && pausedUntilDate) {
        const h = pausedUntilDate.getHours().toString().padStart(2, "0");
        const m = pausedUntilDate.getMinutes().toString().padStart(2, "0");
        setError(t("cart.errors.restaurantPaused", { time: `${h}:${m}` }));
      } else {
        setError(t("cart.errors.restaurantClosed"));
      }
      return;
    }

    // ── Zone check (last-mile safeguard for delivery) ────────────────────────
    // Skippas för test-flödet så vi kan testa till adresser utanför zone.
    if (!isTestFlow && orderType === "DELIVERY" && currentRestaurantId) {
      if (addressZoneStatus === "checking") {
        setError(t("cart.errors.zoneChecking"));
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
        setError(t("cart.errors.verifyingAddress"));
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
            setError(t("cart.errors.zoneNotCovered"));
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
        } catch (zoneErr: any) {
          // Tidigare "fail open" — släppte igenom ordern även om zon-API:n
          // failade. Konsekvens: kunden kunde beställa till en adress som
          // inte täcktes av leverans och få "kunde inte levereras"-mail i
          // efterhand. Bättre att blockera och be om retry — backend är
          // sanningskällan för zone-täckning.
          console.warn("[cart] zone check failed:", zoneErr?.message || zoneErr);
          setAddressZoneStatus("error");
          setError(t("cart.errors.zoneCheckFailed"));
          setLoading(false);
          return;
        }
      } else if (formData.deliveryStreet) {
        // Fallback-geocoden ovan (rad ~1015-1037) försökte hitta lat/lng från
        // den manuellt skrivna adressen via Google Places. Om vi hamnar HÄR
        // betyder det att autocomplete inte hittade någon match alls — vägledning
        // till kunden behöver vara konkret, inte "välj från listan" eftersom
        // ingen lista visades.
        setError(t("cart.errors.addressNotFound"));
        setLoading(false);
        return;
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    setLoading(true);
    try {
      // isTestFlow är redan beräknad ovan — testa-koden gör att vi
      // direktpostar order utan att gå via Stripe.
      if (isTestFlow) {
        await submitOrder("FREE_PROMO");
        return;
      }

      // Step 1: Create order first (pending payment)
      const orderRes = await axios.post(`/api/platform/orders`, {
        ...buildOrderPayload(),
        pendingPayment: true,
      }, {
        headers: { "Idempotency-Key": `order-${idempotencyKey.current}` },
      });
      const orderId: string = orderRes.data.orderId;
      const orderToken: string | undefined = orderRes.data.accessToken;

      // Save to localStorage for crash recovery (e.g. Swish/Klarna redirect).
      // Tokenen krävs för att gäster ska komma åt /order/{id} efter redirect
      // (5-min grace-loopholen togs bort av säkerhetsskäl).
      localStorage.setItem("pending_order_id", orderId);
      if (orderToken) localStorage.setItem("pending_order_token", orderToken);
      setPendingOrderId(orderId);

      // Step 2: Create payment intent linked to this order
      const intentRes = await axios.post(`${API_URL}/api/payments/create-intent`, {
        amount: total,
        orderId,
      }, {
        headers: { "Idempotency-Key": `intent-${idempotencyKey.current}` },
      });

      setClientSecret(intentRes.data.clientSecret);
      setShowPayment(true);
      // Scrolla till payment-sektionen (inte document.body.scrollHeight som
      // tidigare — den overshootade förbi formuläret på korta viewports och
      // kunden såg en tom area utan att förstå att Stripe-form fanns ovanför).
      setTimeout(() => {
        paymentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    } catch (err: any) {
      setError(err.response?.data?.error || t("cart.errors.paymentUnavailable"));
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
        <h1 className="text-4xl font-black uppercase italic tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>{t("cart.empty.titlePrefix")} <span className="text-gold-500">{t("cart.empty.titleAccent")}</span></h1>
        <p className="text-zinc-500 text-xs font-bold uppercase tracking-[0.3em] mb-12">{t("cart.empty.subtitle")}</p>
        <Link href="/" className="px-12 py-6 bg-gold-500 text-zinc-950 rounded-[2rem] font-black uppercase tracking-widest text-[11px] shadow-2xl shadow-gold-500/10 active:scale-95 transition-all">{t("cart.empty.cta")}</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dot-pattern pt-4 sm:pt-12 md:pt-20 pb-36 px-3 sm:px-6 lg:px-10 xl:px-16" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="max-w-[1400px] mx-auto">
        <div className="flex items-end justify-between mb-4 lg:mb-8 px-1 sm:px-4">
           <div className="min-w-0">
              <h1 className="text-2xl sm:text-4xl md:text-6xl font-black uppercase italic tracking-tight leading-[1.05] mb-1" style={{ color: "var(--text-primary)" }}>{t("cart.heading.prefix")} <span className="text-gold-500">{t("cart.heading.accent")}</span></h1>
              <p className="text-zinc-500 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">{t("cart.subtitle")}</p>
           </div>
           <Link href="/menu" className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-gold-600 hover:text-gold-700 transition-colors flex items-center gap-1.5 mb-1 group shrink-0 ml-3">
              {t("cart.addMore")} <Plus size={14} className="group-hover:rotate-90 transition-transform" />
           </Link>
        </div>

        {/* BOGO-deal lost — visas när kundens valda gratis-vara plötsligt
            försvinner pga expiry eller villkorsändring. */}
        <AnimatePresence>
          {bogoLostNotice && (
            <motion.div
              key="bogo-lost"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-2xl mb-6 border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-start gap-3"
            >
              <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="flex-1 text-[11px] font-bold text-amber-200 leading-snug">
                {bogoLostNotice}
              </p>
              <button
                onClick={() => setBogoLostNotice(null)}
                className="text-amber-300/60 hover:text-amber-200 transition-colors shrink-0"
                aria-label={t("common.close")}
              >
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Login prompt — soft, not blocking (guest can still order) */}
        {!user && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl mb-6 border border-gold-500/20 bg-gold-500/5 px-4 py-3 flex items-center gap-3">
            <UserIcon size={15} className="text-gold-500 shrink-0" />
            <p className="flex-1 text-[10px] font-bold text-zinc-500 leading-snug">
              <span className="text-gold-600 font-black">{t("cart.loginPrompt.cta")}</span> {t("cart.loginPrompt.body")}
            </p>
            <div className="flex gap-2 shrink-0">
              <Link href="/profile" className="px-3 py-1.5 bg-gold-500 text-zinc-950 rounded-xl font-black uppercase tracking-widest text-[9px] active:scale-95 transition-all">
                {t("cart.loginPrompt.cta")}
              </Link>
              <Link href="/register" className="px-3 py-1.5 border rounded-xl font-black uppercase tracking-widest text-[9px] active:scale-95 transition-all" style={{ borderColor: "var(--border-muted)", color: "var(--text-secondary)" }}>
                {t("cart.loginPrompt.account")}
              </Link>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] xl:grid-cols-[1fr_480px] gap-6 lg:gap-8 items-start">
          {/* Cart items list — kompakta en-rad-kort. Vänster kolumn växer
              med tillgänglig bredd; höger sidebar har fast bredd och blir
              sticky på desktop för att undvika scroll. */}
          <div className="space-y-2.5 min-w-0">
            <div className="space-y-2.5">
              {items.map((item) => (
                <motion.div
                  key={item.cartItemId}
                  layout
                  className="p-3 rounded-2xl flex items-center gap-3 transition-all group"
                  style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid rgba(28,28,30,0.08)", boxShadow: "0 2px 8px rgba(28,28,30,0.03)" }}
                >
                  <button
                    type="button"
                    onClick={() => handleEditCartItem(item)}
                    className="flex items-center gap-3 text-left flex-1 min-w-0"
                    aria-label={`${t("cart.tapToEdit")}: ${item.name}`}
                  >
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-gold-600 font-black italic text-sm shrink-0" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid rgba(231,178,75,0.18)" }}>
                      {item.quantity}×
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-black uppercase italic tracking-tight truncate group-hover:text-gold-600 transition-colors" style={{ color: "var(--text-primary)" }}>{item.name}</h3>
                      {item.extras.length > 0 && (
                        <p className="text-[11px] font-medium truncate mt-0.5" style={{ color: "var(--text-secondary)" }}>
                          {item.extras.map(e => e.name).join(" · ")}
                        </p>
                      )}
                    </div>
                  </button>

                  {/* Quantity-spinner kompakt + pris + radera inline */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid rgba(28,28,30,0.06)" }}>
                      <button
                        onClick={() => { if (item.quantity === 1) { removeItem(item.cartItemId); } else { updateQuantity(item.cartItemId, -1); } }}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-zinc-600 hover:bg-white hover:text-gold-600 active:scale-90 transition-all"
                        aria-label="Minska antal"
                      >
                        <Minus size={13} strokeWidth={2.5} />
                      </button>
                      <span className="text-xs font-black w-3 text-center" style={{ color: "var(--text-primary)" }}>{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.cartItemId, 1)}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-zinc-600 hover:bg-white hover:text-gold-600 active:scale-90 transition-all"
                        aria-label="Öka antal"
                      >
                        <Plus size={13} strokeWidth={2.5} />
                      </button>
                    </div>
                    <div className="text-right min-w-[3.5rem]">
                      <div className="text-sm font-black leading-none" style={{ color: "var(--text-primary)", fontFeatureSettings: "'tnum'" }}>{(item.price * item.quantity).toFixed(0)} kr</div>
                    </div>
                    <button
                      onClick={() => removeItem(item.cartItemId)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-rose-500 hover:bg-rose-50 active:scale-90 transition-all"
                      aria-label="Ta bort"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Form & Payment — sticky på desktop. INGEN inre overflow-scroll
              (det skapade en container-scroll inuti sidan vilket användaren
              ogillade). Sticky-positionen följer dokumentscrollen istället. */}
          <div className="lg:sticky lg:top-24">
             <AnimatePresence mode="wait">
               {showPayment && clientSecret && stripePromise ? (
                  <motion.div ref={paymentSectionRef} key="payment" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="glass-panel p-5 sm:p-8 lg:p-10 rounded-[2rem] sm:rounded-[3rem] lg:rounded-[3.5rem] shadow-2xl" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)", boxShadow: "var(--card-shadow)" }}>
                     <div className="flex items-center gap-3 text-gold-500 text-[10px] font-black uppercase tracking-[0.4em] mb-10">
                        <CreditCard size={18} /> {t("cart.payment.title")}
                     </div>
                     <div className="rounded-3xl p-6 mb-10 border" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)" }}>
                        <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe', variables: { colorPrimary: '#e7b24b', colorBackground: '#ffffff', colorText: '#1C1C1E', colorDanger: '#ef4444' } } }}>
                           <StripeCheckout amount={total} onSuccess={handlePaymentSuccess} />
                        </Elements>
                     </div>
                     <button onClick={() => setShowPayment(false)} className="w-full text-[10px] font-black uppercase tracking-widest hover:text-gold-500 transition-colors" style={{ color: "var(--text-secondary)" }}>{t("cart.payment.backToDetails")}</button>
                  </motion.div>
                ) : showPayment && stripeKeyMissing ? (
                  <motion.div key="stripe-missing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-8 rounded-[2rem] sm:rounded-[3rem] border" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)" }}>
                     <div className="flex items-center gap-3 text-rose-500 text-[10px] font-black uppercase tracking-[0.4em] mb-6">
                        <AlertCircle size={18} /> {t("cart.payment.missingTitle")}
                     </div>
                     <p className="text-sm font-bold leading-relaxed mb-6" style={{ color: "var(--text-primary)" }}>
                        {t("cart.payment.missingBody")}
                     </p>
                     <button onClick={() => setShowPayment(false)} className="text-[10px] font-black uppercase tracking-widest text-gold-500 hover:text-gold-600">
                        {t("cart.payment.back")}
                     </button>
                  </motion.div>
                ) : (
                  <motion.div key="form" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-5 sm:p-8 lg:p-10 rounded-[2rem] sm:rounded-[3rem] lg:rounded-[3.5rem] shadow-2xl relative" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", boxShadow: "var(--card-shadow)" }}>
                      <div className="flex gap-4 p-1.5 rounded-[1.8rem] mb-10" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)" }}>
                         {(['DELIVERY', 'PICKUP'] as const).map(type => (
                            <button key={type} type="button" onClick={() => setOrderType(type)} className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-[1.4rem] text-[10px] font-black uppercase tracking-widest transition-all ${orderType === type ? 'bg-gold-500 text-zinc-950 shadow-lg shadow-gold-500/20' : 'text-zinc-500 hover:text-gold-500'}`}>
                               {type === 'DELIVERY' ? <Truck size={16} /> : <Store size={16} />}
                               {type === 'DELIVERY' ? t("cart.deliveryType.delivery") : t("cart.deliveryType.pickup")}
                            </button>
                         ))}
                      </div>

                      {/* Schedule Toggle */}
                      <div className="flex gap-3 p-1.5 rounded-[1.8rem] mb-10" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)" }}>
                         <button type="button" onClick={() => setScheduledFor(null)} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[1.2rem] text-[10px] font-black uppercase tracking-widest transition-all ${!scheduledFor ? 'bg-gold-500 text-zinc-950 shadow-lg shadow-gold-500/20' : 'text-zinc-500 hover:text-gold-500'}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                            {t("cart.schedule.asap")}
                         </button>
                          <button type="button" onClick={() => { const min = new Date(Date.now() + 45 * 60 * 1000); setScheduledFor(min); setShowSchedulePicker(true); }} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[1.2rem] text-[10px] font-black uppercase tracking-widest transition-all ${scheduledFor ? 'bg-gold-500 text-zinc-950 shadow-lg shadow-gold-500/20' : 'text-zinc-500 hover:text-gold-500'}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            {t("cart.schedule.schedule")}
                         </button>
                      </div>

                       {scheduledFor && (
                          <div className="rounded-2xl p-5 mb-8 border flex items-center justify-between cursor-pointer hover:border-gold-500/30 transition-all" style={{ backgroundColor: "rgba(231,178,75,0.05)", borderColor: "rgba(231,178,75,0.2)" }} onClick={() => setShowSchedulePicker(true)}>
                             <div className="flex items-center gap-3">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gold-500"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                <div>
                                   <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
                                      {t("cart.schedule.today")} · {scheduledFor.toLocaleDateString("sv-SE", { day: "numeric", month: "short" })}
                                   </div>
                                   <div className="text-2xl font-black text-gold-500 italic">
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

                       {/* Schedule Picker Modal — endast IDAG. Kunder är på sidan
                           för att beställa snabbt, inte planera en vecka i förväg.
                           Datum-picker borttagen → kunden ser direkt vad som är
                           valbart. Timmar/minuter som är < nu+45min eller efter
                           midnatt är disabled (gråade ut) snarare än helt dolda
                           så kunden förstår *varför* en tid inte går att välja. */}
                       <AnimatePresence>
                          {showSchedulePicker && (() => {
                             const now = new Date();
                             const minDate = new Date(now.getTime() + 45 * 60 * 1000);
                             // Cutoff: 23:55 idag (sista 5-min-slot innan midnatt).
                             // Vi tillåter inte schemaläggning över midnatt — kunden
                             // får då välja "Snarast" eller komma tillbaka imorgon.
                             const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 55);

                             const todayVal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                             // Filtrera quickTimes så vi inte erbjuder offsets
                             // som rinner över midnatt (t.ex. "3 timmar" kl 22).
                             const quickTimes = [
                                { label: t("cart.schedule.quick.45min"), offset: 45 },
                                { label: t("cart.schedule.quick.1h"), offset: 60 },
                                { label: t("cart.schedule.quick.1_5h"), offset: 90 },
                                { label: t("cart.schedule.quick.2h"), offset: 120 },
                                { label: t("cart.schedule.quick.3h"), offset: 180 },
                             ].filter((qt) => new Date(now.getTime() + qt.offset * 60 * 1000) <= endOfToday);

                             const handleConfirm = () => {
                                // selDate kan endast vara idag i denna picker, men
                                // vi parsar ändå defensivt så framtida ändringar
                                // inte bryter.
                                const [y, m, day] = (selDate || todayVal).split('-').map(Number);
                                const combined = new Date(y, m - 1, day, parseInt(selHour), parseInt(selMin));
                                if (combined < minDate) {
                                   setError(t("cart.schedule.errorTooEarly"));
                                   return;
                                }
                                if (combined > endOfToday) {
                                   setError(t("cart.schedule.errorTomorrow"));
                                   return;
                                }
                                setScheduledFor(combined);
                                setShowSchedulePicker(false);
                             };

                             // Helpers för att avgöra om en given timme/minut är
                             // (a) inom valid-fönstret minDate → endOfToday, och
                             // (b) tillsammans med vald motpart bildar en valid tid.
                             const isHourValid = (hh: string) => {
                                const h = parseInt(hh);
                                // Tillgänglig om det finns *någon* minute-slot i denna timme
                                // som är >= minDate och <= endOfToday.
                                for (let mm = 0; mm < 60; mm += 5) {
                                   const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, mm);
                                   if (t >= minDate && t <= endOfToday) return true;
                                }
                                return false;
                             };
                             const isMinValid = (mm: string) => {
                                const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(selHour), parseInt(mm));
                                return t >= minDate && t <= endOfToday;
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
                                      <h3 className="text-lg font-black uppercase tracking-wider text-center mb-2" style={{ color: "var(--text-primary)" }}>
                                         {t("cart.schedule.pickerTitle")}
                                      </h3>
                                      <p className="text-[10px] font-bold uppercase tracking-widest text-center mb-6" style={{ color: "var(--text-secondary)" }}>
                                         {t("cart.schedule.pickerSub")}
                                      </p>

                                      {/* Quick times — bara de som ryms idag */}
                                      {quickTimes.length > 0 && (
                                         <div className="flex flex-wrap gap-2 mb-6 justify-center">
                                            {quickTimes.map((qt) => {
                                               const t = new Date(now.getTime() + qt.offset * 60 * 1000);
                                               const isActive =
                                                  selHour === String(t.getHours()).padStart(2, '0') &&
                                                  selMin === String(t.getMinutes()).padStart(2, '0');
                                               return (
                                                  <button key={qt.label} type="button" onClick={() => {
                                                     setSelDate(todayVal);
                                                     setSelHour(String(t.getHours()).padStart(2, '0'));
                                                     setSelMin(String(t.getMinutes()).padStart(2, '0'));
                                                  }} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${isActive ? 'bg-gold-500 text-zinc-950' : 'bg-[var(--bg-deep)] text-zinc-400 hover:text-gold-500 border border-[var(--border-muted)]'}`}>
                                                     {qt.label}
                                                  </button>
                                               );
                                            })}
                                         </div>
                                      )}

                                       {/* Idag-badge ersätter datum-pickern */}
                                       <div className="mb-6 flex justify-center">
                                          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gold-500/10 border border-gold-500/20">
                                             <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gold-500"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                             <span className="text-[11px] font-black uppercase tracking-widest text-gold-500">
                                                {t("cart.schedule.today")} {now.toLocaleDateString("sv-SE", { day: "numeric", month: "short" })}
                                             </span>
                                          </div>
                                       </div>

                                       {/* Time picker — hours/minutes utanför valid-fönster
                                           är disabled (gråade ut) istället för dolda. */}
                                       <div className="flex gap-3 mb-6">
                                          <div className="flex-1">
                                             <label className="text-[9px] font-black uppercase tracking-widest ml-3 block mb-2" style={{ color: "var(--text-secondary)" }}>{t("cart.schedule.hour")}</label>
                                             <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                                                {hours.map(h => {
                                                   const valid = isHourValid(h);
                                                   return (
                                                      <button
                                                         key={h}
                                                         type="button"
                                                         disabled={!valid}
                                                         onClick={() => setSelHour(h)}
                                                         className={`shrink-0 w-12 py-3 rounded-xl text-xs font-bold transition-all text-center ${
                                                            selHour === h
                                                               ? 'bg-gold-500 text-zinc-950'
                                                               : valid
                                                                  ? 'bg-[var(--bg-deep)] text-zinc-400 border border-[var(--border-muted)]'
                                                                  : 'bg-[var(--bg-deep)]/40 text-zinc-700 border border-[var(--border-muted)]/40 cursor-not-allowed opacity-40'
                                                         }`}
                                                      >
                                                         {h}
                                                      </button>
                                                   );
                                                })}
                                             </div>
                                          </div>
                                          <div className="flex items-end pb-3 text-2xl font-black" style={{ color: "var(--text-secondary)" }}>:</div>
                                          <div className="flex-1">
                                             <label className="text-[9px] font-black uppercase tracking-widest ml-3 block mb-2" style={{ color: "var(--text-secondary)" }}>{t("cart.schedule.minute")}</label>
                                             <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                                                {minutes.map(m => {
                                                   const valid = isMinValid(m);
                                                   return (
                                                      <button
                                                         key={m}
                                                         type="button"
                                                         disabled={!valid}
                                                         onClick={() => setSelMin(m)}
                                                         className={`shrink-0 w-12 py-3 rounded-xl text-xs font-bold transition-all text-center ${
                                                            selMin === m
                                                               ? 'bg-gold-500 text-zinc-950'
                                                               : valid
                                                                  ? 'bg-[var(--bg-deep)] text-zinc-400 border border-[var(--border-muted)]'
                                                                  : 'bg-[var(--bg-deep)]/40 text-zinc-700 border border-[var(--border-muted)]/40 cursor-not-allowed opacity-40'
                                                         }`}
                                                      >
                                                         {m}
                                                      </button>
                                                   );
                                                })}
                                             </div>
                                          </div>
                                       </div>

                                      <button type="button" onClick={handleConfirm} className="w-full rounded-2xl py-4 text-sm font-black uppercase tracking-widest bg-gold-500 text-zinc-950 hover:bg-gold-400 transition-all">
                                         {t("cart.schedule.confirm")}
                                      </button>
                                   </motion.div>
                                </motion.div>
                             );
                          })()}
                       </AnimatePresence>

                       <div className="space-y-8">
                        {(() => {
                          // Inline-validering: vi flagga fält som har varit "rört" och nu är ogiltigt.
                          // Definieras inline för att inte behöva nya useState.
                          const nameTouched = formData.customerName.length > 0;
                          const phoneTouched = formData.customerPhone.length > 0;
                          const emailTouched = formData.customerEmail.length > 0;
                          const nameInvalid = nameTouched && formData.customerName.trim().length < 2;
                          // Telefon: minst 8 siffror (svenska mobilnr utan landkod är 9-10 siffror, +46 ger fler)
                          const phoneDigits = formData.customerPhone.replace(/\D/g, '');
                          const phoneInvalid = phoneTouched && phoneDigits.length < 8;
                          const emailInvalid = emailTouched && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.customerEmail);
                          const errorBorder = "border-rose-500/60 focus:border-rose-500/80";
                          const okBorder = "focus:border-gold-500/40";
                          return (
                            <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                           <div className="space-y-2">
                              <label className="text-[9px] font-black uppercase tracking-widest ml-3" style={{ color: "var(--text-secondary)" }}>{t("cart.fields.name")}</label>
                              <input
                                value={formData.customerName}
                                onChange={e => setFormData({...formData, customerName: e.target.value})}
                                autoComplete="name"
                                aria-invalid={nameInvalid || undefined}
                                className={`w-full border rounded-2xl p-4 sm:p-5 text-base sm:text-sm font-bold placeholder:text-zinc-400 outline-none transition-all ${nameInvalid ? errorBorder : okBorder}`}
                                style={{ backgroundColor: "var(--bg-deep)", borderColor: nameInvalid ? undefined : "var(--border-muted)", color: "var(--text-primary)" }}
                                placeholder={t("cart.fields.namePlaceholder")}
                              />
                              {nameInvalid && <p className="text-[10px] font-bold text-rose-400 ml-3">{t("cart.errors.nameTooShort")}</p>}
                           </div>
                           <div className="space-y-2">
                              <label className="text-[9px] font-black uppercase tracking-widest ml-3" style={{ color: "var(--text-secondary)" }}>{t("cart.fields.phone")}</label>
                              <input
                                value={formData.customerPhone}
                                onChange={e => setFormData({...formData, customerPhone: e.target.value})}
                                type="tel"
                                autoComplete="tel"
                                inputMode="tel"
                                aria-invalid={phoneInvalid || undefined}
                                className={`w-full border rounded-2xl p-4 sm:p-5 text-base sm:text-sm font-bold placeholder:text-zinc-400 outline-none transition-all ${phoneInvalid ? errorBorder : okBorder}`}
                                style={{ backgroundColor: "var(--bg-deep)", borderColor: phoneInvalid ? undefined : "var(--border-muted)", color: "var(--text-primary)" }}
                                placeholder="+46 70 000 00 00"
                              />
                              {phoneInvalid && <p className="text-[10px] font-bold text-rose-400 ml-3">{t("cart.errors.phoneTooShort")}</p>}
                           </div>
                        </div>
                        <div className="space-y-2">
                           <label className="text-[9px] font-black uppercase tracking-widest ml-3" style={{ color: "var(--text-secondary)" }}>{t("cart.fields.email")}</label>
                           <input
                             value={formData.customerEmail}
                             onChange={e => setFormData({...formData, customerEmail: e.target.value})}
                             type="email"
                             autoComplete="email"
                             inputMode="email"
                             aria-invalid={emailInvalid || undefined}
                             className={`w-full border rounded-2xl p-4 sm:p-5 text-base sm:text-sm font-bold placeholder:text-zinc-400 outline-none transition-all ${emailInvalid ? errorBorder : okBorder}`}
                             style={{ backgroundColor: "var(--bg-deep)", borderColor: emailInvalid ? undefined : "var(--border-muted)", color: "var(--text-primary)" }}
                             placeholder={t("cart.fields.emailPlaceholderReceipt")}
                             required
                           />
                           {emailInvalid && <p className="text-[10px] font-bold text-rose-400 ml-3">{t("cart.errors.invalidEmail")}</p>}
                        </div>
                            </>
                          );
                        })()}

                        {orderType === 'DELIVERY' && (
                           <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                              {quickAddresses.length > 0 && (
                                 <div className="space-y-2">
                                   <label className="text-[9px] font-black uppercase tracking-widest ml-3" style={{ color: "var(--text-secondary)" }}>{t("cart.savedAddresses")}</label>
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
                                         {addr.isDefault && <span className="text-[8px] text-gold-500">• {t("cart.defaultBadge")}</span>}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="space-y-2 relative z-50">
                                 <label className="text-[9px] font-black uppercase tracking-widest ml-3" style={{ color: "var(--text-secondary)" }}>{t("cart.fields.address")}</label>
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
                                     placeholder={t("cart.fields.addressPlaceholderFull")}
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
                                  <p className="text-[10px] font-bold text-rose-400 ml-3 mt-1">{t("cart.errors.zoneNotCoveredInline")}</p>
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
                                 <label className="text-[9px] font-black uppercase tracking-widest ml-3" style={{ color: "var(--text-secondary)" }}>{t("cart.deliveryInstructions.label")}</label>
                                 <div className="grid grid-cols-2 gap-2">
                                   {[
                                     { value: 'RING_DOORBELL', label: t("cart.deliveryInstructions.ringDoorbell"), icon: Bell },
                                     { value: 'LEAVE_AT_DOOR', label: t("cart.deliveryInstructions.leaveAtDoor"), icon: DoorOpen },
                                    { value: 'MEET_OUTSIDE', label: t("cart.deliveryInstructions.meetOutside"), icon: UserIcon },
                                    { value: 'ENTER_CODE', label: t("cart.deliveryInstructions.enterCode"), icon: KeyRound },
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
                           <label className="text-[9px] font-black uppercase tracking-widest ml-3" style={{ color: "var(--text-secondary)" }}>{t("cart.fields.noteLabel")}</label>
                           <textarea rows={2} value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} className="w-full border rounded-2xl p-5 text-sm font-bold placeholder:text-zinc-400 focus:border-gold-500/40 outline-none transition-all resize-none" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)", color: "var(--text-primary)" }} placeholder={t("cart.fields.notePlaceholderExample")} />
                        </div>

                        {/*
                         * Dricks till leveranspersonen (paritet med RN CartScreen, raderna 1638-1675).
                         * Default = 0 kr så befintligt flöde är opåverkat.
                         * Belopp läggs både i `tip`-fältet och bakas in i `note`/`deliveryInstructions`
                         * som "(Dricks gett: X kr i appen)" — samma mönster som RN.
                         * Visas endast vid DELIVERY; vid PICKUP är dricks dolt.
                         */}
                        {orderType === 'DELIVERY' && (
                           <div className="space-y-3">
                              <div className="flex items-center gap-3 ml-3">
                                 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-gold-500"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                                 <label className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>{t("cart.tip.label")}</label>
                              </div>
                              <p className="text-[10px] font-bold leading-snug ml-3" style={{ color: "var(--text-secondary)" }}>
                                 {t("cart.tip.sub")}
                              </p>
                              <div className="grid grid-cols-5 gap-2">
                                 {[0, 10, 20, 30].map((amt) => {
                                    const isActive = !showCustomTipInput && tipAmount === amt;
                                    return (
                                       <button
                                          key={amt}
                                          type="button"
                                          onClick={() => { setShowCustomTipInput(false); setCustomTipText(""); setTipAmount(amt); }}
                                          className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 ${
                                             isActive
                                                ? "bg-gold-500 border-gold-500 text-zinc-950 shadow-lg shadow-gold-500/20"
                                                : "border-[var(--border-muted)] text-zinc-500 hover:text-gold-500 hover:border-gold-500/30"
                                          }`}
                                          style={{ backgroundColor: isActive ? undefined : "var(--bg-deep)" }}
                                       >
                                          {amt === 0 ? t("cart.tip.none") : `+${amt} ${t("common.kr")}`}
                                       </button>
                                    );
                                 })}
                                 <button
                                    type="button"
                                    onClick={() => {
                                       const next = !showCustomTipInput;
                                       setShowCustomTipInput(next);
                                       if (next) {
                                          setCustomTipText(tipAmount > 0 ? String(tipAmount) : "");
                                       } else {
                                          setCustomTipText("");
                                          setTipAmount(0);
                                       }
                                    }}
                                    className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 ${
                                       showCustomTipInput
                                          ? "bg-gold-500 border-gold-500 text-zinc-950 shadow-lg shadow-gold-500/20"
                                          : "border-[var(--border-muted)] text-zinc-500 hover:text-gold-500 hover:border-gold-500/30"
                                    }`}
                                    style={{ backgroundColor: showCustomTipInput ? undefined : "var(--bg-deep)" }}
                                 >
                                    {t("cart.tip.custom")}
                                 </button>
                              </div>
                              {showCustomTipInput && (
                                 <div className="relative">
                                    <input
                                       type="number"
                                       min={0}
                                       step={1}
                                       inputMode="numeric"
                                       value={customTipText}
                                       onChange={(e) => {
                                          const raw = e.target.value.replace(/[^0-9]/g, "");
                                          setCustomTipText(raw);
                                          const parsed = raw === "" ? 0 : parseInt(raw, 10);
                                          setTipAmount(Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
                                       }}
                                       placeholder={t("cart.tip.customPlaceholder")}
                                       className="w-full border rounded-2xl p-4 sm:p-5 text-base sm:text-sm font-bold placeholder:text-zinc-400 outline-none transition-all focus:border-gold-500/40"
                                       style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)", color: "var(--text-primary)" }}
                                    />
                                    <span className="absolute right-5 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-widest text-zinc-500">{t("common.kr")}</span>
                                 </div>
                              )}
                           </div>
                        )}

                        {/* Auto-applicerad rabatt (t.ex. "25% första beställning")
                            — visas som synlig, aktiv knapp som kund kan stänga av.
                            Klick frigör rabatt-platsen så kunden kan använda
                            egen kupong istället. Skriva i kupong-fältet stänger
                            den automatiskt också (skipAutomaticDeal-flagga går
                            till backend).
                            Två möjliga källor:
                              - automaticDeal (client-eval av publika deals)
                              - bogoPreview (server-eval via /evaluate-cart) — när
                                bogo är PURE DISCOUNT (rewardProducts tom) räknas
                                det som "vanlig" auto-deal och är dismissable. */}
                        {(() => {
                          const autoDealTitle = automaticDeal.deal?.title ?? (bogoIsPureDiscount ? bogoPreview?.dealTitle : null);
                          const autoDealAmount = Math.max(automaticDeal.discountAmount, bogoIsPureDiscount ? bogoDiscount : 0);
                          const shouldShow = !!autoDealTitle && autoDealAmount > 0 && !selectedPersonalDeal && !selectedAccountDealId;
                          if (!shouldShow) return null;
                          return (
                            <button
                              type="button"
                              onClick={() => setAutomaticDealDismissed((v) => !v)}
                              className="w-full flex items-center justify-between gap-3 rounded-2xl border px-5 py-4 transition-all text-left hover:brightness-110 active:scale-[0.98]"
                              style={{
                                backgroundColor: automaticDealDismissed ? "var(--bg-deep)" : "rgba(231,178,75,0.18)",
                                borderColor: automaticDealDismissed ? "var(--border-muted)" : "rgba(231,178,75,0.5)",
                              }}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all ${automaticDealDismissed ? "bg-gold-500/10 text-gold-500" : "bg-gold-500 text-zinc-950"}`}>
                                  {automaticDealDismissed ? <Tag size={16} /> : <Check size={16} strokeWidth={3} />}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[11px] font-black uppercase tracking-widest text-gold-500 truncate">
                                    {automaticDealDismissed
                                      ? t("cart.discount.autoDismissed", { title: autoDealTitle ?? "" })
                                      : t("cart.discount.autoActive", { title: autoDealTitle ?? "" })}
                                  </p>
                                  <p className="text-[9px] font-bold mt-0.5" style={{ color: "var(--text-secondary)" }}>
                                    {automaticDealDismissed
                                      ? t("cart.discount.autoDismissedSub")
                                      : t("cart.discount.autoActiveSub")}
                                  </p>
                                </div>
                              </div>
                              <span className="text-[11px] font-black text-gold-500 shrink-0">
                                -{autoDealAmount.toFixed(0)} {t("common.kr")}
                              </span>
                            </button>
                          );
                        })()}

                        {/* Account-deals (WELCOME / REFERRAL_*) — tydlig
                            klickbar knapp per deal istället för checkbox.
                            Mutex med rabattkod: knappen är disabled när en
                            kupong-kod är aktiv (och vice versa) så kunden
                            kan välja den BÄSTA av sina belöningar +
                            kupongkoder, inte stacka dem. Auto-rensar motsatt
                            sida vid val. */}
                        {accountDeals.length > 0 && (
                          <div className="space-y-2.5">
                            <p className="text-[9px] font-black uppercase tracking-[0.3em] mb-1" style={{ color: "var(--text-secondary)" }}>
                              <Gift size={11} className="inline mr-1.5 text-gold-500" />
                              {t("cart.discount.rewardsTitle")}
                            </p>
                            {accountDeals.map((d) => {
                              const min = d.minOrderKr ?? 0;
                              const meetsMin = subtotal >= min;
                              const isActive = selectedAccountDealId === d.id;
                              const blockedByPromo = !!selectedPersonalDeal && !isActive;
                              const disabled = !meetsMin || blockedByPromo;
                              return (
                                <button
                                  key={d.id}
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => {
                                    if (isActive) {
                                      setSelectedAccountDealId(null);
                                    } else {
                                      setSelectedAccountDealId(d.id);
                                      // Rensa promo-deal när account-deal väljs — bara en åt gången
                                      setSelectedPersonalDeal(null);
                                      setPromoCodeInput("");
                                    }
                                  }}
                                  className={`w-full flex items-center justify-between gap-3 rounded-2xl border px-5 py-4 transition-all text-left ${disabled ? "opacity-40 cursor-not-allowed" : "hover:brightness-110 active:scale-[0.98]"}`}
                                  style={{
                                    backgroundColor: isActive ? "rgba(231,178,75,0.18)" : "var(--bg-deep)",
                                    borderColor: isActive ? "rgba(231,178,75,0.5)" : "var(--border-muted)",
                                  }}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all ${isActive ? "bg-gold-500 text-zinc-950" : "bg-gold-500/10 text-gold-500"}`}>
                                      {isActive ? <Check size={16} strokeWidth={3} /> : <Gift size={16} />}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-[11px] font-black uppercase tracking-widest text-gold-500 truncate">
                                        {isActive ? t("cart.discount.activeReward") : t("cart.discount.useReward", { type: dealTypeLabel(d.type, t), label: formatDealLabel(d, t) })}
                                      </p>
                                      {!meetsMin && min > 0 && (
                                        <p className="text-[9px] font-bold mt-0.5" style={{ color: "var(--text-secondary)" }}>
                                          {t("cart.discount.minOrderRequired", { min })}
                                        </p>
                                      )}
                                      {blockedByPromo && meetsMin && (
                                        <p className="text-[9px] font-bold mt-0.5" style={{ color: "var(--text-secondary)" }}>
                                          {t("cart.discount.blockedByPromo")}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <span className="text-[11px] font-black text-gold-500 shrink-0">
                                    -{computeDealAmountKr(d, subtotal, deliveryFee)} {t("common.kr")}
                                  </span>
                                </button>
                              );
                            })}
                            <div className="flex items-center gap-3 pt-1">
                              <div className="flex-1 h-px" style={{ background: "var(--border-muted)" }} />
                              <span className="text-[9px] font-black uppercase tracking-[0.3em]" style={{ color: "var(--text-secondary)" }}>{t("cart.discount.or")}</span>
                              <div className="flex-1 h-px" style={{ background: "var(--border-muted)" }} />
                            </div>
                          </div>
                        )}

                        {/* Promo Code — disabled när en account-deal är aktiv. */}
                        <div className={`relative group flex items-center transition-all ${selectedAccountDealId ? "opacity-40 pointer-events-none" : ""}`}>
                          <Tag size={16} className="absolute left-6 text-gold-500/40 group-focus-within:text-gold-500 transition-colors pointer-events-none" />
                           <input
                              value={selectedPersonalDeal ? selectedPersonalDeal.code : promoCodeInput}
                              onChange={e => { if(selectedPersonalDeal) setSelectedPersonalDeal(null); setPromoCodeInput(e.target.value); }}
                              disabled={!!selectedAccountDealId}
                              className="w-full border rounded-2xl py-6 pl-14 pr-24 text-[11px] font-black uppercase tracking-widest placeholder:text-zinc-400 outline-none transition-all disabled:cursor-not-allowed"
                              style={{ backgroundColor: "var(--bg-deep)", borderColor: selectedPersonalDeal ? "rgba(16,185,129,0.4)" : "var(--border-muted)", color: selectedPersonalDeal ? "#34d399" : "var(--text-primary)" }}
                              placeholder={selectedAccountDealId ? t("cart.discount.promoBlockedByReward") : selectedPersonalDeal ? t("cart.discount.promoApplied") : t("cart.discount.promoPlaceholder")}
                           />
                           <button
                              type="button"
                              disabled={!!selectedAccountDealId}
                              onClick={selectedPersonalDeal ? () => { setSelectedPersonalDeal(null); setPromoCodeInput(""); } : handleApplyPromo}
                              className={`absolute right-3 px-6 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all disabled:cursor-not-allowed ${selectedPersonalDeal ? "bg-rose-500/10 text-rose-500 hover:bg-rose-500/20" : "bg-gold-500/10 text-gold-600 hover:bg-gold-500 hover:text-zinc-950"}`}
                           >
                              {selectedPersonalDeal ? t("cart.discount.promoRemove") : t("cart.discount.promoCheck")}
                           </button>
                        </div>
                     </div>

                     {/* BOGO: påminn om gratisprodukt(er) om fler kan väljas.
                         För scaled-BOGO (maxFreeItems > 1): visar antal kvar.
                         "Välj N fler gratis varor" istället för bara "Välj". */}
                     {bogoPreview && bogoPicksRemaining > 0 && bogoPreview.rewardProducts.length > 0 && (
                       <motion.button
                         type="button"
                         initial={{ opacity: 0, y: 6 }}
                         animate={{ opacity: 1, y: 0 }}
                         onClick={() => setShowBogoPicker(true)}
                         className="mt-6 w-full rounded-2xl border px-4 py-3.5 text-left transition-all hover:brightness-110 active:scale-[0.99]"
                         style={{ background: "rgba(16,185,129,0.08)", borderColor: "rgba(16,185,129,0.25)" }}
                       >
                         <div className="flex items-center justify-between gap-2">
                           <div className="flex items-center gap-2.5">
                             <span className="text-lg">🎁</span>
                             <div>
                               <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                                 {bogoPickedCount > 0
                                   ? (bogoPicksRemaining === 1
                                       ? t("cart.bogo.pickMoreOne")
                                       : t("cart.bogo.pickMoreMany", { count: bogoPicksRemaining }))
                                   : t("cart.bogo.pickFree")}
                               </p>
                               <p className="text-xs font-bold mt-0.5" style={{ color: "var(--text-secondary)" }}>
                                 {bogoPickedCount > 0
                                   ? t("cart.bogo.progress", { picked: bogoPickedCount, max: bogoMaxFreeItems })
                                   : bogoMaxFreeItems > 1
                                     ? t("cart.bogo.canPickMany", { max: bogoMaxFreeItems })
                                     : (bogoPreview.rewardCategoryName
                                         ? t("cart.bogo.notPickedNamed", { name: bogoPreview.rewardCategoryName.toLowerCase() })
                                         : t("cart.bogo.notPickedGeneric"))}
                               </p>
                             </div>
                           </div>
                           <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 shrink-0">{t("cart.bogo.choose")}</span>
                         </div>
                       </motion.button>
                     )}

                     {/* BOGO: alla gratisprodukter valda — visa lista */}
                     {bogoPreview && bogoPickedCount > 0 && bogoPicksRemaining === 0 && (
                       <motion.div
                         initial={{ opacity: 0, y: 6 }}
                         animate={{ opacity: 1, y: 0 }}
                         className="mt-6 rounded-2xl border px-4 py-3"
                         style={{ background: "rgba(16,185,129,0.08)", borderColor: "rgba(16,185,129,0.25)" }}
                       >
                         <div className="flex items-center justify-between gap-2">
                           <div className="flex items-center gap-2.5">
                             <span className="text-lg">🎁</span>
                             <div>
                               <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                                 {bogoMaxFreeItems === 1 ? t("cart.bogo.pickedOne") : t("cart.bogo.pickedMany", { count: bogoPickedCount })}
                               </p>
                               <p className="text-xs font-bold mt-0.5" style={{ color: "var(--text-secondary)" }}>
                                 {bogoPreview.dealTitle}
                               </p>
                             </div>
                           </div>
                         </div>
                       </motion.div>
                     )}

                     {/* Deal tröskel-nudge — visas diskret om man är nära en deal */}
                     {dealNudge && (
                       <motion.div
                         initial={{ opacity: 0, y: 6 }}
                         animate={{ opacity: 1, y: 0 }}
                         className="mt-6 rounded-2xl border px-4 py-3"
                         style={{ background: "rgba(234,181,69,0.08)", borderColor: "rgba(234,181,69,0.22)" }}
                       >
                         <div className="flex items-center justify-between gap-2 mb-2">
                           <p className="text-[10px] font-black uppercase tracking-widest text-gold-500">
                             {t("cart.dealNudge.remaining", { amount: dealNudge.missing.toFixed(0), reward: formatDealReward(dealNudge.deal) })}
                           </p>
                           <Tag size={12} className="text-gold-500 shrink-0" />
                         </div>
                         <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                           <motion.div
                             className="h-full rounded-full bg-gold-500"
                             initial={{ width: 0 }}
                             animate={{ width: `${Math.min((subtotal / dealNudge.deal.minOrder) * 100, 100)}%` }}
                             transition={{ duration: 0.5, ease: "easeOut" }}
                           />
                         </div>
                       </motion.div>
                     )}

                     {/* Min-order-banner med komplettering-toggle — default på,
                         kund betalar mellanskillnaden så ordern kan slutföras.
                         Göms vid zone-error eftersom det är meningslöst att
                         pressa kund att fylla upp beloppet när checkout
                         ändå är blockerad pga olevererbar adress.
                         Banner triggar nu bara när kunden ligger UNDER den
                         effektiva min-gränsen (min − 40 kr tolerans). Hamnar
                         kunden i 110-149-spannet på en 150-min: ingen banner,
                         ingen topUp, ordern går igenom direkt om de har en
                         rabatt eller om totalen efter rabatt fortfarande är ≥
                         effektiv min. */}
                     {subtotal > 0 && Math.max(0, subtotal - finalDiscount) < effectiveMinOrder && addressZoneStatus !== "error" && (
                       <motion.div
                         initial={{ opacity: 0, y: 6 }}
                         animate={{ opacity: 1, y: 0 }}
                         className="mt-6 rounded-2xl border px-4 py-3"
                         style={{
                           background: topUpToMinimum ? "rgba(231,178,75,0.08)" : "rgba(239,68,68,0.08)",
                           borderColor: topUpToMinimum ? "rgba(231,178,75,0.30)" : "rgba(239,68,68,0.30)",
                         }}
                       >
                         {(() => {
                           // Gap räknas mot effektiv min — kunden behöver bara
                           // klara den lägre gränsen (min − 40 kr) för att slippa
                           // topUp eller bli blockerad.
                           const gapToEffective = Math.max(0, Math.ceil(effectiveMinOrder - Math.max(0, subtotal - finalDiscount)));
                           const progressBase = effectiveMinOrder > 0 ? effectiveMinOrder : minOrder;
                           const progress = Math.min(((Math.max(0, subtotal - finalDiscount)) / progressBase) * 100, 100);
                           return (
                             <>
                               <div className="flex items-center justify-between gap-2 mb-2">
                                 <p className={`text-[10px] font-black uppercase tracking-widest ${topUpToMinimum ? "text-gold-500" : "text-rose-500"}`}>
                                   {topUpToMinimum
                                     ? t("cart.minOrder.banner.topUp", { amount: gapToEffective })
                                     : t("cart.minOrder.banner.short", { amount: gapToEffective })}
                                 </p>
                                 <span className={`text-[10px] font-black ${topUpToMinimum ? "text-gold-500" : "text-rose-500"}`}>{subtotal.toFixed(0)} / {minOrder.toFixed(0)} {t("common.kr")}</span>
                               </div>
                               <div className="h-1.5 w-full rounded-full overflow-hidden mb-3" style={{ background: "rgba(255,255,255,0.07)" }}>
                                 <motion.div
                                   className={`h-full rounded-full ${topUpToMinimum ? "bg-gold-500" : "bg-rose-500"}`}
                                   initial={{ width: 0 }}
                                   animate={{ width: `${progress}%` }}
                                   transition={{ duration: 0.5, ease: "easeOut" }}
                                 />
                               </div>
                               <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                 <input
                                   type="checkbox"
                                   checked={topUpToMinimum}
                                   onChange={(e) => setTopUpToMinimum(e.target.checked)}
                                   className="h-4 w-4 accent-gold-500 cursor-pointer"
                                 />
                                 <span className="text-[10px] font-bold leading-snug" style={{ color: "var(--text-secondary)" }}>
                                   {t("cart.minOrder.toggleLabel", { amount: gapToEffective })}
                                 </span>
                               </label>
                             </>
                           );
                         })()}
                       </motion.div>
                     )}

                     <div className="mt-10 pt-10 space-y-4" style={{ borderTop: "1px solid var(--border-muted)" }}>
                        <div className="flex justify-between text-[11px] font-black uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}><span>{t("cart.summary.subtotal")}</span><span>{subtotal.toFixed(0)} {t("common.sek")}</span></div>
                        {orderType === 'DELIVERY' && (
                          <div className="flex justify-between text-[11px] font-black uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
                            <span>{t("cart.summary.deliveryFee")}</span>
                            <span className="text-gold-500">
                              {addressZoneStatus === "checking" ? t("cart.summary.deliveryCalculating") : `${deliveryFee.toFixed(0)} ${t("common.sek")}`}
                            </span>
                          </div>
                        )}
                        {effectiveTip > 0 && <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-gold-500"><span>{t("cart.summary.tip")}</span><span>+{effectiveTip.toFixed(0)} {t("common.sek")}</span></div>}
                        {minOrderTopUp > 0 && <div className="flex justify-between text-[11px] font-black uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}><span>{t("cart.summary.minOrderTopUp")}</span><span className="text-gold-500">+{minOrderTopUp.toFixed(0)} {t("common.sek")}</span></div>}
                        {(() => {
                          // Display-källan ska matcha vad som FAKTISKT appliceras
                          // på totalen. Tidigare visades bogoPreview-raden så
                          // länge bogoDiscount >= finalDiscount, men finalDiscount
                          // använder userPickedDiscount först — då blev
                          // displayen lägre/högre än verkligt avdrag.
                          //
                          // Ordningen nedan matchar finalDiscount-prioriteten:
                          //   1. Användarens kupong (selectedPersonalDeal)
                          //   2. Vald account-deal (välkomst)
                          //   3. Pure-discount bogoPreview (om ej dismissad)
                          //   4. Free-item bogoPreview (alltid aktiv)
                          //   5. Client-side automaticDeal (om ej dismissad)
                          // Om kunden har skrivit/valt något — visa BARA det
                          // (inkl. 0 kr om koden inte är giltig för denna
                          // order). Auto-källor får aldrig kreepa tillbaka
                          // när kunden gjort ett explicit val.
                          if (selectedPersonalDeal) {
                            if (personalDiscount <= 0) return null;
                            return (
                              <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-emerald-500 italic">
                                <span>{t("cart.summary.coupon", { code: selectedPersonalDeal.code })}</span>
                                <span>-{personalDiscount.toFixed(0)} {t("common.sek")}</span>
                              </div>
                            );
                          }
                          if (selectedAccountDealId) {
                            if (accountDealDiscount <= 0) return null;
                            return (
                              <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-emerald-500 italic">
                                <span>{selectedAccountDeal ? dealTypeLabel(selectedAccountDeal.type, t) : t("cart.summary.reward")}</span>
                                <span>-{accountDealDiscount.toFixed(0)} {t("common.sek")}</span>
                              </div>
                            );
                          }
                          // Auto-källor (bara om inga user-val ovan)
                          if (!automaticDealDismissed && bogoPreview && bogoDiscount > 0) {
                            return (
                              <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-emerald-500 italic">
                                <span>{bogoIsPureDiscount ? "" : "🎁 "}{bogoChoice && !bogoIsPureDiscount ? bogoChoice.product.name : bogoPreview.dealTitle}</span>
                                <span>-{bogoDiscount.toFixed(0)} {t("common.sek")}</span>
                              </div>
                            );
                          }
                          if (!automaticDealDismissed && automaticDeal.deal && automaticDeal.discountAmount > 0) {
                            return (
                              <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-emerald-500 italic">
                                <span>{automaticDeal.deal.title}</span>
                                <span>-{automaticDeal.discountAmount.toFixed(0)} {t("common.sek")}</span>
                              </div>
                            );
                          }
                          return null;
                        })()}
                        {restaurantSettings.vatPercent ? (
                          <div className="flex justify-between text-[11px] font-black uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
                            <span>{t("cart.summary.vat", { percent: restaurantSettings.vatPercent })}</span>
                            <span>{(total * restaurantSettings.vatPercent / (100 + restaurantSettings.vatPercent)).toFixed(0)} {t("common.sek")}</span>
                          </div>
                        ) : null}
                        <div className="flex justify-between items-center mt-6">
                           <span className="text-2xl sm:text-3xl font-black italic uppercase tracking-tighter" style={{ color: "var(--text-primary)" }}>{t("cart.summary.total")}</span>
                           <span className="text-3xl sm:text-5xl font-black italic tracking-tighter leading-[1.15] text-gold-gradient">{total.toFixed(0)} <span className="text-xs opacity-50 not-italic" style={{ color: "var(--text-secondary)" }}>{t("common.sek")}</span></span>
                        </div>
                     </div>

                    {error && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8 p-5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[10px] font-black uppercase tracking-widest text-center italic">{error}</motion.div>}

                      {/* Guest info banner — not blocking, just informative */}
                      {!user && (
                        <div className="mt-8 p-4 rounded-2xl border flex items-center gap-3" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)" }}>
                          <UserIcon size={16} className="text-zinc-400 shrink-0" />
                          <p className="text-[10px] font-bold leading-snug flex-1" style={{ color: "var(--text-secondary)" }}>
                            {t("cart.guest.banner")}{" "}
                            <Link href="/profile" className="text-gold-400 hover:text-gold-300 underline">{t("cart.guest.loginLink")}</Link>{" "}
                            {t("cart.guest.bannerSuffix")}
                          </p>
                        </div>
                     )}

                     {/* Zone error summary line above checkout button */}
                     {addressZoneStatus === "error" && orderType === "DELIVERY" && (
                       <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-3">
                         <div className="w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center shrink-0">
                           <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 1l6 6M7 1L1 7" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>
                         </div>
                         <p className="text-[10px] font-bold text-rose-400 leading-snug">{t("cart.errors.zoneSummary")}</p>
                       </motion.div>
                     )}
                     {addressZoneStatus === "ok" && orderType === "DELIVERY" && (
                       <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 flex items-center justify-end">
                         <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.6)]" />
                       </motion.div>
                     )}

                      <button
                         onClick={startCheckout}
                         disabled={
                           loading
                           || (!isTestFlow && Math.max(0, subtotal - finalDiscount) < effectiveMinOrder && !topUpToMinimum)
                           || (!isTestFlow && !restaurantSettings.isOpen)
                           || (!isTestFlow && addressZoneStatus === "error")
                           || (!isTestFlow && addressZoneStatus === "checking")
                         }
                        className="w-full mt-8 py-5 sm:py-6 bg-gold-500 hover:bg-gold-400 text-zinc-950 rounded-[1.75rem] sm:rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs shadow-2xl shadow-gold-500/20 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-4 group"
                     >
                        {loading
                          ? <Loader2 className="animate-spin" size={24} />
                          : addressZoneStatus === "checking"
                            ? <><Loader2 className="animate-spin" size={20} /> {t("cart.submit.checking")}</>
                            : (Math.max(0, subtotal - finalDiscount) < effectiveMinOrder && !topUpToMinimum)
                              ? t("cart.submit.short", { amount: Math.ceil(effectiveMinOrder - Math.max(0, subtotal - finalDiscount)) })
                              : addressZoneStatus === "error"
                                ? t("cart.submit.zoneError")
                                : <>{t("cart.submit")} <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform" /></>}
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
                <h2 className="text-2xl font-black uppercase italic tracking-tight mb-8" style={{ color: "var(--text-primary)" }}>{t("cart.dealsModal.titlePrefix")} <span className="text-gold-gradient">{t("cart.dealsModal.titleAccent")}</span></h2>
                <div className="space-y-4 max-h-[400px] overflow-y-auto no-scrollbar">
                   {personalDeals.map(deal => {
                     const isEligible = subtotal >= deal.campaign.minOrder;
                     return (
                        <button key={deal.id} disabled={!isEligible} onClick={() => { setSelectedPersonalDeal(deal); setSelectedAccountDealId(null); setShowDealsModal(false); }} className={`w-full text-left p-6 rounded-[2.2rem] border transition-all group ${isEligible ? "active:scale-[0.98]" : "opacity-30 grayscale"}`} style={{ backgroundColor: "var(--bg-deep)", borderColor: isEligible ? "rgba(231,178,75,0.2)" : "var(--border-muted)" }}>
                           <div className="flex items-center justify-between mb-4">
                              <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>{deal.campaign.title}</div>
                              {isEligible && <div className="px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-md text-[8px] font-black uppercase">{t("cart.dealsModal.ready")}</div>}
                           </div>
                           <div className="text-2xl font-black italic uppercase tracking-tighter leading-[1.15] mb-2 group-hover:text-gold-500 transition-colors" style={{ color: "var(--text-primary)" }}>
                              {deal.campaign.discountType === "PERCENTAGE" ? t("cart.dealsModal.percentDiscount", { value: deal.campaign.discountValue }) : t("cart.dealsModal.amountDiscount", { value: deal.campaign.discountValue })}
                           </div>
                           <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>{t("cart.dealsModal.minOrder", { min: deal.campaign.minOrder })}</div>
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

      <AnimatePresence>
        {showBogoPicker && bogoPreview && bogoPreview.rewardProducts.length > 0 && (
          <BogoPickerModal
            dealId={bogoPreview.dealId ?? ""}
            dealTitle={bogoPreview.dealTitle}
            restaurantId={cartRestaurantId || ""}
            rewardCategoryName={bogoPreview.rewardCategoryName}
            products={bogoPreview.rewardProducts}
            onClose={() => setShowBogoPicker(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
