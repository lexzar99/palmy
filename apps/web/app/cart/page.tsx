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
  Trash2,
  Plus,
  Minus,
  Tag,
  X,
  CreditCard,
  CheckCircle2,
  ArrowRight,
  MapPin,
  Home,
  Briefcase,
  User as UserIcon,
  ParkingCircle,
  Gift,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronLeft,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { useCartStore } from "@/store/cartStore";
import BogoPickerModal from "@/components/BogoPickerModal";
import { rememberActiveOrder } from "@/lib/activeOrder";
// Betalning sker via provider-neutralt hosted checkout-flöde.
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
import {
  ACTIVE_USER_DEAL_ID_KEY,
  ACTIVE_USER_DEAL_SNAPSHOT_KEY,
  clearActiveUserDeal,
  readActiveUserDealId,
  readActiveUserDealSnapshot,
  writeActiveUserDeal,
} from "@/lib/appDeal";
import { getDeviceFingerprint } from "@/lib/deviceFingerprint";
import { useTranslation } from "@/lib/i18n/LocaleProvider";
import { LAST_CUSTOMER_ID_KEY } from "@/lib/platformSessionClient";

const TEST_ORDERS_ENABLED =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_ALLOW_TEST_ORDERS === "true";

const CHECKOUT_ATTEMPT_KEY = "viaeats.checkout.attempt.v1";

type CheckoutAttempt = { key: string; fingerprint: string };

function createCheckoutKey(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function checkoutFingerprint(payload: unknown): string {
  const input = JSON.stringify(payload);
  // FNV-1a: this is only a change detector, not a security primitive. We keep
  // the customer's address/phone out of localStorage while still rotating the
  // idempotency key whenever the actual checkout payload changes.
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function readCheckoutAttempt(): CheckoutAttempt | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(CHECKOUT_ATTEMPT_KEY) || "null") as CheckoutAttempt | null;
    return parsed?.key && parsed?.fingerprint ? parsed : null;
  } catch {
    return null;
  }
}

function writeCheckoutAttempt(fingerprint: string): CheckoutAttempt {
  const current = readCheckoutAttempt();
  if (current?.fingerprint === fingerprint) return current;
  const next = { key: createCheckoutKey(), fingerprint };
  try { localStorage.setItem(CHECKOUT_ATTEMPT_KEY, JSON.stringify(next)); } catch { /* private mode/quota */ }
  return next;
}

function clearCheckoutAttempt(): void {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(CHECKOUT_ATTEMPT_KEY); } catch { /* noop */ }
}

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
function computeDealComponentsKr(deal: UserAccountDeal, subtotal: number, deliveryFee: number = 0) {
  // Backward compat: legacy discountType=FREE_DELIVERY = bara leveransen
  const isLegacyFreeDel = deal.discountType === "FREE_DELIVERY";
  const wantsFreeDel = !!deal.freeDelivery || isLegacyFreeDel;

  let subtotalDiscount = 0;
  if (!isLegacyFreeDel) {
    if (deal.discountPercent && deal.discountPercent > 0) {
      subtotalDiscount = Math.round(subtotal * deal.discountPercent) / 100;
    } else if (deal.amountKr && deal.amountKr > 0) {
      subtotalDiscount = deal.amountKr;
    }
  }
  subtotalDiscount = Math.min(subtotalDiscount, subtotal);

  const deliveryDiscount = wantsFreeDel ? Math.max(0, deliveryFee) : 0;

  return { food: subtotalDiscount, delivery: deliveryDiscount, total: subtotalDiscount + deliveryDiscount };
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

// Betalning sker via Mollie hosted checkout (redirect + status-polling vid retur).
// Provider-väljaren bor i backend (PAYMENT_PROVIDER).

/**
 * CartCollapsibleRow — kollapsad länkrad (mockup): "Rabattkod ›" / "Dricks ·
 * 20 kr ›". Visar etikett + (valfri) hint om nuvarande val; expanderar inline
 * till kontrollerna. Default stängd, men öppnas automatiskt om defaultOpen
 * (t.ex. när en rabatt redan är aktiv). Behåller all befintlig kontroll-logik
 * — bara presentationen kollapsas, så sidan blir tätare som i mockupen.
 */
function CartCollapsibleRow({
  label,
  hint,
  icon,
  defaultOpen = false,
  first = false,
  children,
}: {
  label: string;
  hint?: string | null;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  first?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: first ? "none" : "1px solid var(--border-muted)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 py-3.5 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          {icon}
          <span className="text-[14.5px] font-semibold" style={{ color: "var(--text-primary)" }}>{label}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {hint && <span className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>{hint}</span>}
          <ChevronDown size={16} strokeWidth={2} className="transition-transform" style={{ color: "var(--text-secondary)", transform: open ? "rotate(180deg)" : "none" }} />
        </span>
      </button>
      {open && <div className="pb-3.5">{children}</div>}
    </div>
  );
}

export default function CartPage() {
  const { t } = useTranslation();
  const { items, removeItem, updateQuantity, updateItem, getTotal, clearCart, restaurantId: cartRestaurantId, restaurantSlug: cartRestaurantSlug } = useCartStore();
  // Namnet på restaurangen man beställer från — visas högst upp i kassan.
  const [cartRestaurantName, setCartRestaurantName] = useState<string | null>(null);
  const router = useRouter();
  const [embedMode, setEmbedMode] = useState(false);
  const [embedRestaurantFromUrl, setEmbedRestaurantFromUrl] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmbedMode(params.get("embed") === "1");
    setEmbedRestaurantFromUrl(params.get("restaurant"));
  }, []);
  const embedRestaurantSlug = embedRestaurantFromUrl || cartRestaurantSlug;
  const embedMenuHref = embedRestaurantSlug ? `/embed/${encodeURIComponent(embedRestaurantSlug)}` : "/";
  const [editingCartItem, setEditingCartItem] = useState<any>(null);
  const cartDiscountHydrationRef = useRef<Set<string>>(new Set());

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
  const [orderType, setOrderType] = useState<"PICKUP" | "DELIVERY">(() => {
    if (typeof window === "undefined") return "DELIVERY";
    // Startsidans grind är sanningen för leverans/avhämtning. Läs dess
    // platform_order_type först (faller tillbaka på cart_order_type för bakåt-
    // kompat) så valet syns direkt utan att blinka fel typ vid kall laddning.
    const stored = localStorage.getItem("platform_order_type") || localStorage.getItem("cart_order_type");
    return stored === "PICKUP" ? "PICKUP" : "DELIVERY";
  });
  // Komplettering till minimum är INTE förvald — kunden ska aktivt välja att
  // betala mellanskillnaden. Default visar i stället en uppmaning att beställa
  // för ytterligare X kr för att nå minsta beställning (se banner.short).
  const [topUpToMinimum, setTopUpToMinimum] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  // Hydrerings-grind: cart-store rehydreras synkront från localStorage på
  // klienten, men på servern är den tom. Vi får inte branch:a på items innan
  // mount (→ hydration-mismatch). Före mount visas alltid samma skeleton som
  // SSR; efter mount vet vi om varukorgen FAKTISKT är tom och kan visa rätt
  // tomt-läge istället för en falsk "full varukorg"-skeleton.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // En pågående order får INTE kapa kundvagnen: kunden ska kunna lägga en ny
  // beställning medan den gamla levereras. Tracking nås via LiveOrderBanner
  // och Mina beställningar istället för en tvingad redirect härifrån.
  const [error, setError] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  // True när kunden återvänt från Mollie och vi pollar orderns betalstatus.
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const idempotencyKey = useRef<string>("");
  const [deals, setDeals] = useState<PublicDeal[]>([]);
  const [personalDeals, setPersonalDeals] = useState<any[]>([]);
  const [selectedPersonalDeal, setSelectedPersonalDeal] = useState<any>(null);
  // Account-deals (WELCOME, REFERRAL_INVITER, REFERRAL_INVITEE) från
  // GET /api/account/deals. Endast ACTIVE-status räknas — kund kryssar i för
  // att applicera, vi skickar userDealId i order-payload.
  const [accountDeals, setAccountDeals] = useState<UserAccountDeal[]>([]);
  const [selectedAccountDealId, setSelectedAccountDealId] = useState<string | null>(null);
  // Aktiv deal-kontraktet (Swift-paritet): kassan läser viaeats.activeUserDealId
  // vid mount och förväljer dealen. Servern quotar rabatten (enda sanningen),
  // se appDealQuote-effekten nedan. Valet skrivs tillbaka till localStorage så
  // hemskärmen visar samma aktiva deal.
  const [appDealQuote, setAppDealQuote] = useState<{
    userDealId: string;
    applicable: boolean;
    reason?: string | null;
    minOrderKr?: number | null;
    discountAmountKr: number;
    dealTitle?: string | null;
  } | null>(null);
  // Feedback för vänkods-inlösen (Swift: referralRedeemMessage). ok styr
  // grön/orange ikonfärg.
  const [referralMessage, setReferralMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [applyingCode, setApplyingCode] = useState(false);
  useEffect(() => {
    // Förvälj aktiv deal från kontraktet (sätts av hemskärmens deals-rail,
    // rewards eller en tidigare vänkod). Kassan nollar snapshot när den själv
    // äger valet — Swift gör samma sak.
    const stored = readActiveUserDealId();
    if (stored) {
      setSelectedAccountDealId(stored);
      const snapshot = readActiveUserDealSnapshot<any>();
      if (snapshot) {
        setAccountDeals((current) => [{
          id: stored,
          type: snapshot.type || "REFERRAL_INVITER",
          status: "ACTIVE",
          amountKr: typeof snapshot.amountKr === "number" ? snapshot.amountKr : undefined,
          discountPercent: typeof snapshot.discountPercent === "number" ? snapshot.discountPercent : undefined,
          discountType: snapshot.discountType ?? null,
          freeDelivery: !!snapshot.freeDelivery,
          minOrderKr: typeof snapshot.minOrderKr === "number" ? snapshot.minOrderKr : 0,
          metadata: { title: snapshot.title || "Din deal" },
        }, ...current.filter((deal) => deal.id !== stored)]);
      }
    }
  }, []);
  useEffect(() => {
    const syncActiveUserDeal = (event: StorageEvent) => {
      if (event.key === LAST_CUSTOMER_ID_KEY || event.key === "dlv_logged_out") {
        setPersonalDeals([]);
        setSelectedPersonalDeal(null);
        setAccountDeals([]);
        setSelectedAccountDealId(null);
        setAppDealQuote(null);
        setReferralMessage(null);
        return;
      }
      if (event.key !== ACTIVE_USER_DEAL_ID_KEY && event.key !== ACTIVE_USER_DEAL_SNAPSHOT_KEY) return;
      const stored = readActiveUserDealId();
      setSelectedAccountDealId(stored || null);
      if (!stored) setAppDealQuote(null);
    };
    window.addEventListener("storage", syncActiveUserDeal);
    return () => window.removeEventListener("storage", syncActiveUserDeal);
  }, []);
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
    // True = gratis-varan plockas som en separat pris-0-rad (whitelist/annan
    // kategori). Rabatten realiseras då av raden → dra INTE av bogoDiscount
    // igen, och tvinga ett val innan kassan.
    isPickReward: boolean;
  } | null>(null);
  // Banner som visas när kundens BOGO-val plötsligt försvinner mitt-session
  // (deal-admin disablade, expiry passerade, eller kvalificerande artikel
  // togs bort). Tidigare nollades bogoChoice tyst → kund såg sin gratis-vara
  // försvinna utan förklaring → tror appen är trasig.
  const [bogoLostNotice, setBogoLostNotice] = useState<string | null>(null);
  // Lagrar senast checkade coords så vi inte hammrar validate-location när
  // status är "error" (out-of-zone) men ingen ny adress valts. Nollställs
  // i handleAddressSelect så ny adress alltid triggar färsk check.
  const lastCheckedCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  // Välkomsterbjudande från admin (GET /api/welcome-offer). Driver kassans
  // "FÖRSTA BESTÄLLNING"-toggle. eligible/discountKr beräknas server-side
  // utifrån audience + första-N-order (per telefon) + inloggning.
  const [welcomeOffer, setWelcomeOffer] = useState<{
    active: boolean;
    eligible: boolean;
    title: string;
    discountKr: number;
    minOrderKr: number;
    freeDelivery: boolean;
  } | null>(null);
  const [showBogoPicker, setShowBogoPicker] = useState(false);
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
    // Återställ senast valda leveransadress så den inte nollas vid navigering.
    let d = { deliveryStreet: "", deliveryZip: "", deliveryCity: "" };
    if (typeof window !== "undefined") {
      // Startsidans adress-grind är ENDA sanningen. Härled gata/zip/stad ur dess
      // display-sträng (platform_delivery_address/platform_address) så att ett
      // adressbyte på hem-sidan alltid slår igenom här. Legacy platform_delivery
      // (skrevs av den gamla kassa-editorn) används bara om grinden saknas helt.
      try {
        const stored = localStorage.getItem("platform_delivery_address") || localStorage.getItem("platform_address") || "";
        if (stored) {
          const p = parseStoredAddress(stored);
          d = { deliveryStreet: p.street, deliveryZip: p.zip, deliveryCity: p.city || localStorage.getItem("platform_delivery_city") || localStorage.getItem("platform_city") || "" };
        }
      } catch { /* ignore */ }
      if (!d.deliveryStreet) {
        try { const raw = localStorage.getItem("platform_delivery"); if (raw) d = { ...d, ...JSON.parse(raw) }; } catch { /* ignore */ }
      }
    }
    return {
      customerName: savedName,
      customerPhone: savedPhone,
      customerEmail: savedEmail,
      deliveryStreet: d.deliveryStreet || "",
      deliveryZip: d.deliveryZip || "",
      deliveryCity: d.deliveryCity || "",
      deliveryInstructions: "",
      note: typeof window !== "undefined" ? localStorage.getItem("cart_note") || "" : "",
    };
  });


  // Adressen ägs nu av startsidans grind (platform_delivery_address + coords).
  // Kassan skriver INTE längre platform_delivery — annars kunde en gammal
  // cart-skriven adress skugga grinden eller råka rensa coords. Legacy-nyckeln
  // läses bara som engångs-fallback i formData-initieringen ovan.

  // Vid retur till kassan: kör om zon-check från sparade coords så adressen
  // inte ser "ej validerad" ut efter navigering.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("platform_coords");
      if (raw) { const c = JSON.parse(raw); if (c?.lat && c?.lng) checkDeliverySpecific(c.lat, c.lng); }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dricks (paritet med RN CartScreen) — endast leverans
  const [tipAmount, setTipAmount] = useState<number>(0);
  const [showCustomTipInput, setShowCustomTipInput] = useState<boolean>(false);
  const [customTipText, setCustomTipText] = useState<string>("");

  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [quickAddresses, setQuickAddresses] = useState<QuickAddress[]>([]);

  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [addressInput, setAddressInput] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("platform_delivery_address") || localStorage.getItem("platform_address") || "";
  });
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

  // A15: When the menu changes for the restaurant we're checking out from,
  // revalidate each cart line. Any item that's been disabled or removed is
  // dropped from the cart with a friendly notice — beats the customer paying
  // for a non-existent item and getting a refund later.
  const [menuChangedNotice, setMenuChangedNotice] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onMenuChanged = async (e: Event) => {
      try {
        const evt = (e as CustomEvent<{ restaurantId?: string | null }>).detail || {};
        // If event scoped to a restaurant other than the cart's, ignore.
        if (evt.restaurantId && cartRestaurantId && evt.restaurantId !== cartRestaurantId) return;
        if (!items.length) return;
        const removed: string[] = [];
        // Fetch fresh product state for each unique productId in cart
        const uniqueIds = Array.from(new Set(items.map((it: any) => it.productId)));
        const fresh = await Promise.all(uniqueIds.map(async (pid) => {
          try {
            const r = await axios.get(`${API_URL}/api/menu/products/${pid}`);
            return { id: pid, isActive: r.data?.isActive !== false, name: r.data?.name as string };
          } catch {
            return { id: pid, isActive: false, name: '' };
          }
        }));
        const byId = new Map(fresh.map((p) => [p.id, p]));
        for (const it of items as any[]) {
          const f = byId.get(it.productId);
          if (!f || !f.isActive) {
            removeItem(it.cartItemId);
            removed.push(it.name || f?.name || 'En artikel');
          }
        }
        if (removed.length) {
          setMenuChangedNotice(
            removed.length === 1
              ? `${removed[0]} är inte längre tillgänglig och togs bort från din varukorg.`
              : `${removed.length} artiklar är inte längre tillgängliga och togs bort från din varukorg.`
          );
        }
      } catch {
        /* noop */
      }
    };
    window.addEventListener('viaeats:menu-changed', onMenuChanged as EventListener);
    return () => window.removeEventListener('viaeats:menu-changed', onMenuChanged as EventListener);
  }, [items, cartRestaurantId, removeItem]);

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

  // Leveransadressen sätts på startsidans adress-grind och är sanningen. I
  // kassan visas den bara (läs-bart) — vill kunden byta gör de det på hem-sidan.
  // Zon-check körs här på de sparade koordinaterna.
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

  useEffect(() => {
    const staleDiscountRows = items.filter((item: any) =>
      !item.bogoFreeFromDealId &&
      item.catalogDiscountApplied !== true &&
      !(typeof item.originalPrice === "number" && item.originalPrice > item.price) &&
      !cartDiscountHydrationRef.current.has(item.cartItemId)
    );
    if (staleDiscountRows.length === 0) return;

    let cancelled = false;
    staleDiscountRows.forEach((item: any) => {
      cartDiscountHydrationRef.current.add(item.cartItemId);
      axios.get(`${API_URL}/api/menu/products/${item.productId}`)
        .then((res) => {
          if (cancelled) return;
          const product = res.data || {};
          const originalPrice = typeof product.price === "number" ? product.price : null;
          if (originalPrice != null && originalPrice > item.price) {
            updateItem(item.cartItemId, {
              originalPrice,
              catalogDiscountApplied: true,
            });
          }
        })
        .catch(() => {
          cartDiscountHydrationRef.current.delete(item.cartItemId);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [items, updateItem]);

  const subtotal = getTotal();
  const discountableSubtotal = useMemo(() => {
    return items.reduce((sum, item: any) => {
      const extrasTotal = item.extras.reduce((extraSum: number, extra: any) => extraSum + extra.price * (extra.quantity ?? 1), 0);
      const alreadyDiscounted =
        !item.bogoFreeFromDealId &&
        (item.catalogDiscountApplied === true ||
          (typeof item.originalPrice === "number" && item.originalPrice > item.price));
      return sum + (alreadyDiscounted ? extrasTotal * item.quantity : (item.price + extrasTotal) * item.quantity);
    }, 0);
  }, [items]);
  const hasCatalogDiscountedItems = discountableSubtotal < subtotal;
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
  // Minsta orderbelopp gäller ENDAST leverans (zon-baserat koncept). För
  // avhämtning finns inget minimum → ingen top-up, och första-order-rabatten
  // (t.ex. 25%) neutraliseras inte längre av en påtvingad komplettering.
  const minOrder = orderType === "DELIVERY"
    ? (deliveryCheck?.minOrder ?? restaurantSettings.minOrderAmount)
    : 0;
  // minOrderTopUp definieras längre ner — den behöver finalDiscount och
  // effectiveMinOrder som båda är beroende av deals/rabatter beräknade nedan.
  const productIds = items.flatMap((i) => Array.from({ length: i.quantity }, () => i.productId));
  const automaticDeal = useMemo(
    () => hasCatalogDiscountedItems ? { deal: null, discountAmount: 0 } : pickBestDeal(deals, discountableSubtotal, productIds),
    [deals, discountableSubtotal, productIds, hasCatalogDiscountedItems],
  );

  // Hitta närmaste inaktiva deal för tröskel-nudge (max 100 kr kvar, inte redan aktiv)
  const dealNudge = useMemo(() => {
    if (hasCatalogDiscountedItems) return null;
    if (!deals.length) return null;
    let closest: { deal: PublicDeal; missing: number } | null = null;
    for (const deal of deals) {
      if (deal.minOrder <= 0) continue;
      const missing = Math.max(deal.minOrder - discountableSubtotal, 0);
      if (missing === 0) continue; // redan aktiv
      if (missing > 100) continue; // för långt ifrån
      if (!closest || missing < closest.missing) closest = { deal, missing };
    }
    return closest;
  }, [deals, discountableSubtotal, hasCatalogDiscountedItems]);

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
  const personalDeliveryDiscount = personalDiscount > 0 && selectedPersonalDeal && (
    selectedPersonalDeal.campaign?.discountType === "FREE_DELIVERY" ||
    selectedPersonalDeal.campaign?.freeDelivery
  ) ? Math.min(deliveryFee, personalDiscount) : 0;

  const bogoDiscount = !hasCatalogDiscountedItems && discountableSubtotal > 0 ? (bogoPreview?.discountKr ?? 0) : 0;
  // Antal gratis-varor kunden redan valt för den aktiva BOGO-dealen.
  // Räknas från cart-items med `bogoFreeFromDealId` matchande aktuell deal.
  // Används för att veta hur många fler gratis-varor som kan väljas
  // (för scaled-BOGO: t.ex. 2 kebabpizzor → 2 drycker tillåtna).
  const bogoPickedCount = bogoPreview?.dealId
    ? items.filter((i) => i.bogoFreeFromDealId === bogoPreview.dealId).reduce((sum, i) => sum + i.quantity, 0)
    : 0;
  const bogoMaxFreeItems = bogoPreview?.maxFreeItems ?? 0;
  const bogoPicksRemaining = Math.max(0, bogoMaxFreeItems - bogoPickedCount);
  // En PICK-REWARD-BOGO är upplåst men kunden har inte plockat sin gratis-vara
  // än → checkout blockeras tills den valts (man ska inte betala och missa
  // gratisen). Gäller bara pick-reward: samma-kategori-deals applicerar rabatt
  // automatiskt och ska inte tvinga ett val.
  const bogoMustPick = !!bogoPreview && bogoPreview.isPickReward
    && (bogoPreview.rewardProducts?.length ?? 0) > 0 && bogoPicksRemaining > 0;

  // Account-deal-rabatt: appliceras bara om vald + min-order är uppfyllt.
  // Stöder både percent (ny) och amountKr (legacy) via komponentberäkningen.
  const selectedAccountDeal = useMemo(
    () => accountDeals.find((d) => d.id === selectedAccountDealId) || null,
    [accountDeals, selectedAccountDealId],
  );
  // Server-quotad rabatt (Swift-paritet): POST /api/deals/app/quote är enda
  // sanningen för app-dealens belopp. Den lokala komponentberäkningen används
  // bara som direkt-preview tills quoten (för samma id) svarat — aldrig som facit.
  const accountDealDiscount = useMemo(() => {
    if (!selectedAccountDealId) return 0;
    if (appDealQuote && appDealQuote.userDealId === selectedAccountDealId) {
      return appDealQuote.applicable ? appDealQuote.discountAmountKr : 0;
    }
    if (!selectedAccountDeal) return 0;
    const minK = selectedAccountDeal.minOrderKr ?? 0;
    if (subtotal < minK) return 0;
    // deliveryFee skickas med för FREE_DELIVERY-deals så rabatten matchar
    // exakt det användaren skulle betalat i frakt.
    return computeDealComponentsKr(selectedAccountDeal, subtotal, deliveryFee).total;
  }, [selectedAccountDealId, appDealQuote, selectedAccountDeal, subtotal, deliveryFee]);
  const accountDeliveryDiscount = accountDealDiscount > 0 && selectedAccountDeal && (
    selectedAccountDeal.freeDelivery || selectedAccountDeal.discountType === "FREE_DELIVERY"
  ) ? Math.min(deliveryFee, accountDealDiscount) : 0;

  // A referral/user-deal minimum is an independent checkout gate. The
  // restaurant minimum can be lower (or zero), but an active 150 kr referral
  // coupon must never be allowed through below 150 kr. The customer can remove
  // the coupon and enter another code instead.
  const activeDealMinOrder = selectedAccountDealId
    ? Math.max(0, Number(selectedAccountDeal?.minOrderKr ?? appDealQuote?.minOrderKr ?? 0))
    : 0;
  const activeDealBelowMinimum = !!selectedAccountDealId && subtotal < activeDealMinOrder;

  // Quota vald deal mot servern när korgens belopp/läge/restaurang ändras.
  // Debounce 350 ms så stepper-klick inte hammrar API:t. Vid 404 (dealen
  // använd/utgången) släpps valet och kontraktet nollas; vid nätverksfel
  // behålls senaste quoten — servern validerar ändå vid order.
  useEffect(() => {
    if (!user || !selectedAccountDealId || subtotal <= 0) {
      setAppDealQuote(null);
      return;
    }
    const dealIdAtRequest = selectedAccountDealId;
    const timer = setTimeout(async () => {
      try {
        const res = await axios.post(`/api/platform/deals/app/quote`, {
          userDealId: dealIdAtRequest,
          subtotalKr: subtotal,
          deliveryFeeKr: orderType === "DELIVERY" ? deliveryFee : 0,
          orderMode: orderType,
          restaurantId: currentRestaurantId || undefined,
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPriceKr: item.price,
            originalPriceKr: item.originalPrice,
            catalogDiscountApplied: item.catalogDiscountApplied === true,
          })),
        });
        const d = res.data || {};
        setAppDealQuote({
          userDealId: dealIdAtRequest,
          applicable: !!d.applicable,
          reason: d.reason ?? null,
          minOrderKr: typeof d.minOrderKr === "number" ? d.minOrderKr : null,
          discountAmountKr: typeof d.discountAmountKr === "number" ? d.discountAmountKr : 0,
          dealTitle: d.deal?.title ?? null,
        });
      } catch (err: any) {
        if (err?.response?.status === 404) {
          setAppDealQuote(null);
          setSelectedAccountDealId((current) => (current === dealIdAtRequest ? null : current));
          if (readActiveUserDealId() === dealIdAtRequest) clearActiveUserDeal();
        }
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [user, selectedAccountDealId, subtotal, deliveryFee, orderType, currentRestaurantId, items]);

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
  // Välkomsterbjudandet (admin) är en avstängbar auto-deal precis som globala
  // pure-discount-deals. Den DRIVER toggeln: om den finns prioriteras dess
  // titel/belopp. Globala deals appliceras fortfarande (störst vinner), men
  // toggeln visar välkomsterbjudandet när det är aktivt.
  const welcomeFoodDiscount = welcomeOffer && welcomeOffer.eligible ? Math.min(welcomeOffer.discountKr || 0, discountableSubtotal) : 0;
  const welcomeDeliveryDiscount = welcomeOffer && welcomeOffer.eligible && welcomeOffer.freeDelivery ? deliveryFee : 0;
  const welcomeDiscount = welcomeFoodDiscount + welcomeDeliveryDiscount;
  // Pure-discount-bogo respekterar dismissal-flaggan; free-item-bogo gör inte det.
  const dismissibleAutoDiscount = automaticDealDismissed
    ? 0
    : Math.max(automaticDeal.discountAmount, bogoIsPureDiscount ? bogoDiscount : 0, welcomeDiscount);
  // Toggle-källa: välkomst först (om aktivt), annars global auto-deal/bogo.
  const autoDealAmount = Math.max(automaticDeal.discountAmount, bogoIsPureDiscount ? bogoDiscount : 0, welcomeDiscount);
  // Titeln följer den KÄLLA som faktiskt vinner (störst belopp), så texten
  // matchar beloppet på toggeln. Välkomst vinner toggeln när det är störst.
  const welcomeWinsToggle =
    welcomeDiscount > 0 &&
    welcomeDiscount > automaticDeal.discountAmount &&
    welcomeDiscount > (bogoIsPureDiscount ? bogoDiscount : 0);
  const autoDealTitle = welcomeWinsToggle
    ? (welcomeOffer?.title ?? null)
    : (automaticDeal.deal?.title ?? (bogoIsPureDiscount ? bogoPreview?.dealTitle : null));
  // Pick-reward: gratis-varan ligger redan som pris-0-rad i carten → rabatten
  // är realiserad där. Dra INTE av bogoDiscount igen (skulle dubbel-rabattera
  // mot serverns totalsumma). Endast pure-discount/samma-kategori subtraherar.
  const freeItemBogoDiscount = (bogoIsPureDiscount || bogoPreview?.isPickReward) ? 0 : bogoDiscount;
  const finalDiscount = hasUserExplicitChoice
    ? Math.max(personalDiscount, accountDealDiscount, freeItemBogoDiscount)
    : Math.max(dismissibleAutoDiscount, freeItemBogoDiscount);
  let deliveryDiscountComponent = 0;
  if (hasUserExplicitChoice) {
    if (personalDiscount >= accountDealDiscount && personalDiscount >= freeItemBogoDiscount) {
      deliveryDiscountComponent = personalDeliveryDiscount;
    } else if (accountDealDiscount >= freeItemBogoDiscount) {
      deliveryDiscountComponent = accountDeliveryDiscount;
    }
  } else if (
    !automaticDealDismissed &&
    welcomeWinsToggle &&
    welcomeDiscount >= freeItemBogoDiscount
  ) {
    deliveryDiscountComponent = welcomeDeliveryDiscount;
  }
  deliveryDiscountComponent = Math.min(deliveryDiscountComponent, finalDiscount);
  const foodDiscountComponent = Math.max(0, finalDiscount - deliveryDiscountComponent);
  // Rabatt-tolerans: när en rabatt är aktiv tillåter vi att totalen (efter
  // rabatten) hamnar upp till MIN_ORDER_TOLERANCE_KR under restaurangens
  // min-order. UTAN rabatt gäller den vanliga strikta gränsen — annars
  // skulle alla kunder smita undan minimi genom att lägga få varor.
  // Anti-bypass: drycker (~20 kr) klarar fortfarande inte den lägre
  // tröskeln även med 100%-rabatt eftersom basbeloppet är för litet.
  const MIN_ORDER_TOLERANCE_KR = 40;
  const hasActiveDiscount = foodDiscountComponent > 0;
  const effectiveMinOrder = hasActiveDiscount
    ? Math.max(0, minOrder - MIN_ORDER_TOLERANCE_KR)
    : minOrder;
  // Komplettering till minimum: kund kan välja att betala mellanskillnaden så
  // ordern går igenom. Med rabatt → komplettering räcker till effektiv min
  // (40 kr lägre). Utan rabatt → komplettering till FULL min, oförändrat.
  const valueForMinCheck = Math.max(0, subtotal - foodDiscountComponent);
  const minOrderTopUp = topUpToMinimum && subtotal > 0 && valueForMinCheck < effectiveMinOrder
    ? Math.max(0, effectiveMinOrder - valueForMinCheck)
    : 0;
  // Dricks läggs till total endast vid DELIVERY (RN-paritet — dricks är till leveranspersonen)
  const effectiveTip = orderType === "DELIVERY" ? Math.max(0, tipAmount) : 0;
  // Page-level isTestFlow så att både startCheckout-logiken och submit-
  // knappens disabled-villkor kan respektera test-bypass:en. Annars
  // räcker det inte att startCheckout släpper igenom — knappen är ändå
  // disable:d när restaurang stängd / under min-order / utan zone.
  const isTestFlow = TEST_ORDERS_ENABLED &&
    (selectedPersonalDeal?.code === "test" || selectedPersonalDeal?.code === "testa");
  // Runda endast till öre. Backend räknar i heltalsöre och tar exakt samma
  // belopp; kunden överdebiteras aldrig genom avrundning upp till hel krona.
  const total = isTestFlow
    ? 0
    : Math.round(Math.max(0, subtotal + deliveryFee + minOrderTopUp + effectiveTip - finalDiscount) * 100) / 100;

  // Moms enligt restaurangens EGEN momssats (aldrig hårdkodad). Totalen är
  // momsinklusive → vi extraherar andelen. Raden visas när restaurangen har
  // en momssats satt (vilket den alltid har i prod via restaurang-API:t).
  const vatPercent = restaurantSettings.vatPercent;
  const vatAmount = typeof vatPercent === "number" ? total * vatPercent / (100 + vatPercent) : 0;
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
        if (restaurantRes.data.name) setCartRestaurantName(restaurantRes.data.name);
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
      // Guests have no authenticated /account/deals session. Preserve a
      // phone-verified referral deal that was just redeemed locally; a
      // profile refresh may still return a guest profile, and replacing the
      // local list with [] here used to leave the coupon looking active while
      // dropping its userDealId before order creation (0 kr discount).
      setAccountDeals((current) => (acctDeals.length > 0 ? acctDeals : current));

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

  // Vänkods-fallback (Swift-paritet, CartView.applyCode): körs när rabatt-
  // koden inte gäller. POST /api/account/redeem-code skapar REFERRAL_INVITEE-
  // UserDeal direkt; svaret innehåller userDealId som appliceras i kassan.
  // Returnerar true om koden hanterades (succé ELLER eget servermeddelande)
  // så det generiska rabattkodsfelet döljs.
  const tryRedeemReferral = async (code: string): Promise<boolean> => {
    if (!code) return false;
    if (!formData.customerPhone?.trim()) {
      setError(null);
      setReferralMessage({ ok: false, text: "Fyll i telefonnumret för beställningen innan du använder vänkoden." });
      return true;
    }
    try {
      const res = await axios.post(`/api/platform/account/redeem-code`, {
        code,
        phone: formData.customerPhone,
        name: formData.customerName || undefined,
        deviceFingerprint: getDeviceFingerprint(),
      });
      const userDealId: string | undefined = res.data?.userDealId;
      if (!res.data?.ok || !userDealId) return false;
      const referralDeal = res.data?.deal || {};
      setAccountDeals((current) => {
        const localDeal: UserAccountDeal = {
          id: userDealId,
          type: "REFERRAL_INVITEE",
          status: "ACTIVE",
          amountKr: typeof referralDeal.amountKr === "number" ? referralDeal.amountKr : undefined,
          discountPercent: typeof referralDeal.discountPercent === "number" ? referralDeal.discountPercent : undefined,
          discountType: referralDeal.discountType ?? null,
          freeDelivery: !!referralDeal.freeDelivery,
          minOrderKr: typeof referralDeal.minOrderKr === "number" ? referralDeal.minOrderKr : 0,
          metadata: { title: referralDeal.title || "Vänrabatt" },
        };
        return [localDeal, ...current.filter((deal) => deal.id !== userDealId)];
      });
      // Dealen appliceras direkt + skrivs till aktiva deal-kontraktet.
      // Snapshot nollas när kassan själv sätter dealen (som i Swift).
      writeActiveUserDeal(userDealId);
      setSelectedAccountDealId(userDealId);
      setSelectedPersonalDeal(null);
      setPromoCodeInput("");
      setError(null);
      const name = res.data?.inviterName || "en vän";
      setReferralMessage({ ok: true, text: `Kod från ${name} aktiverad. Ha så gott!` });
      // Hämta om account-deals så vänrabatten även syns som rad i listan.
      void fetchContext();
      return true;
    } catch (err: any) {
      const data = err?.response?.data;
      const msg: string | undefined = data?.error;
      // "hittades inte" = ingen vänkod heller → behåll rabattkodens generiska
      // fel. Andra servermeddelanden (t.ex. "Du har redan använt en referral-
      // kod") visas ordagrant.
      if (msg && !/hittades inte/i.test(msg)) {
        setError(null);
        setReferralMessage({ ok: false, text: msg });
        return true;
      }
      return false;
    }
  };

  const handleApplyPromo = async () => {
    setReferralMessage(null);
    if (!promoCodeInput.trim()) {
      setError("Skriv en rabattkod först.");
      return;
    }
    const code = promoCodeInput.trim().toLowerCase();
    if (TEST_ORDERS_ENABLED && (code === "test" || code === "testa")) {
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

    setApplyingCode(true);
    try {
      // Använd page-level `subtotal` (= cartStore.getTotal()) istället för
      // att räkna ut lokalt. Tidigare lokal beräkning exkluderade extras
      // → om en rabattkod hade minOrder-krav kunde backend rejecta felaktigt
      // när kunden hade extras som faktiskt gjorde att de mötte minOrder.
      const res = await fetch(`${API_URL}/api/discount/validate`, {
        method: "POST",
        // X-Client-Type: web → backend kan neka app-only-rabattkoder på webben.
        headers: { "Content-Type": "application/json", "X-Client-Type": "web" },
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
            // minOrder från backend (kr) — tidigare hårdkodat 0, vilket gjorde
            // att pending-discount-raden aldrig triggades för manuella kupong-
            // koder (A2 Bilal-fynd). Nu visas "Aktiveras vid X kr" korrekt om
            // kunden tar bort varor och hamnar under tröskeln.
            minOrder: typeof data.minOrder === "number" ? data.minOrder : 0,
            freeDelivery: Boolean(data.freeDelivery),
          }
        });
        setSelectedAccountDealId(null);
      } else {
        // Rabattkoden gällde inte → Swift-fallbacken: prova väns referral-kod.
        const err = await res.json().catch(() => ({} as any));
        const handled = await tryRedeemReferral(promoCodeInput.trim());
        if (!handled) setError(err.error || t("cart.errors.invalidPromo"));
      }
    } catch {
      const handled = await tryRedeemReferral(promoCodeInput.trim());
      if (!handled) setError(t("cart.errors.invalidPromo"));
    } finally {
      setApplyingCode(false);
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
    // Leveransadressen läses ur platform_delivery_address (grindens kanoniska
    // leverans-nyckel). platform_address kan vara överskriven med pickup-staden,
    // så den används bara som fallback — annars kunde pickup-staden visas som
    // leveransadress efter en toggle.
    const storedDelivery = localStorage.getItem("platform_delivery_address");
    const storedAddress = storedDelivery || localStorage.getItem("platform_address");
    const storedType = localStorage.getItem("platform_order_type");
    const storedCoords = localStorage.getItem("platform_coords");

    if (storedType === "PICKUP" || storedType === "DELIVERY") {
      setOrderType(storedType as "PICKUP" | "DELIVERY");
    }

    if (storedAddress) {
      const { street, zip, city, clean } = parseStoredAddress(storedAddress);
      const cachedQuickAddress = findQuickAddressByText(clean) ?? findQuickAddressByText(storedAddress);

      // Normalisera bara den nyckel vi faktiskt läste, så pickup-stadens
      // platform_address inte skrivs över med en leveransgata.
      if (clean !== storedAddress) localStorage.setItem(storedDelivery ? "platform_delivery_address" : "platform_address", clean);
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
    if (hasCatalogDiscountedItems) {
      setBogoPreview(null);
      setBogoChoice(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await axios.post(`${API_URL}/api/deals/evaluate-cart`, {
          restaurantId: currentRestaurantId,
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        });
        const data = res.data;
        // Visa BOGO-preview när det finns rabatt ELLER när kunden har gratis-
        // varor kvar att plocka (pick-reward: discount=0 tills varan valts men
        // maxFreeItems>0 → pickern måste visas i kassan).
        const hasPicksToMake = (data.maxFreeItems ?? 0) > 0 && (data.rewardProducts?.length ?? 0) > 0;
        if ((data.discountAmountKr > 0 || hasPicksToMake) && data.dealTitle) {
          setBogoPreview({
            discountKr: data.discountAmountKr,
            dealTitle: data.dealTitle,
            dealId: data.dealId ?? null,
            rewardCategoryName: data.rewardCategoryName ?? null,
            rewardProducts: data.rewardProducts ?? [],
            bogoExcludedExtraIds: Array.isArray(data.bogoExcludedExtraIds) ? data.bogoExcludedExtraIds : [],
            maxFreeItems: typeof data.maxFreeItems === "number" && data.maxFreeItems > 0 ? data.maxFreeItems : 1,
            isPickReward: !!data.isPickReward,
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
  }, [items, currentRestaurantId, setBogoChoice, t, hasCatalogDiscountedItems]);

  // Välkomsterbjudande — hämta server-side beräknat erbjudande för kassan.
  // subtotal + telefon (för första-N-order) + inloggning skickas med så
  // backend kan avgöra eligibility. Debounce så telefon-typning inte hammrar.
  useEffect(() => {
    if (hasCatalogDiscountedItems || discountableSubtotal <= 0) { setWelcomeOffer(null); return; }
    const phone = (formData.customerPhone || "").trim();
    const timer = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ subtotal: String(discountableSubtotal) });
        if (phone) qs.set("phone", phone);
        if (user) qs.set("loggedIn", "1");
        const res = await axios.get(`${API_URL}/api/deals/welcome-offer?${qs.toString()}`);
        const d = res.data;
        if (d?.active) {
          setWelcomeOffer({
            active: true,
            eligible: !!d.eligible,
            title: d.title || "Välkomsterbjudande",
            discountKr: typeof d.discountKr === "number" ? d.discountKr : 0,
            minOrderKr: d.minOrderKr ?? 0,
            freeDelivery: !!d.freeDelivery,
          });
        } else {
          setWelcomeOffer(null);
        }
      } catch {
        setWelcomeOffer(null);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [discountableSubtotal, formData.customerPhone, user, hasCatalogDiscountedItems]);

  // Auto-dismiss BOGO-lost-notice efter 8s så banner inte hänger kvar
  // permanent på sidan.
  useEffect(() => {
    if (!bogoLostNotice) return;
    const timer = setTimeout(() => setBogoLostNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [bogoLostNotice]);

  // Hosted checkout recovery. Redirect till /cart är INTE bevis på betalning:
  // Mollie kan returnera hit innan webhooken hunnit fram. Återuppta även en
  // persisterad pending-order när kunden öppnar /cart igen efter en stängd flik.
  // Bara serverstatus PAID får tömma carten och gå till tracking.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const returnParam = params.get("payment_return");
    const returnOrderId = returnParam || localStorage.getItem("pending_order_id");
    if (!returnOrderId) return;

    const cancelled =
      params.get("payment_cancelled") === "1" ||
      ["failed", "canceled", "cancelled", "requires_payment_method"].includes(String(params.get("redirect_status") || "").toLowerCase());

    // Betalprovidern redirectade tillbaka hit efter kassan. Vi pollar orderns
    // betalstatus (webhooken är sanningskällan). Redirect är inte bevis på
    // betalning, så vi litar bara på PAID/FAILED från servern.
    paymentInFlightRef.current = false;
    if (cancelled) {
      void handlePaymentCancelled(returnOrderId);
      return;
    }
    // Passivt återupptagen order (ingen payment_return-param) får inte låsa
    // kassan med en lång poll-loop på varje besök — den gör en snabb koll och
    // släpper sedan varukorgen fri.
    void finishHostedPayment(returnOrderId, { passive: !returnParam });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Efter att betalningen slutförts (redirect-retur + poll). Redirect är
  // inte bevis på betalning, order-tracking-sidan pollar backend och visar rätt
  // status när webhooken finaliserat. Gäster använder den slumpade order-token
  // som ägarbevis; telefonnumret sparas bara som kontaktdata i historiken.
  const goToOrderTracking = async (orderId: string) => {
    paymentInFlightRef.current = false;
    const storedToken = (typeof window !== "undefined" && localStorage.getItem("pending_order_token")) || "";
    const storedPhone = (typeof window !== "undefined" && localStorage.getItem("pending_order_phone")) || "";
    const phone = ((formData.customerPhone || "").trim() || storedPhone).trim();
    // Hosted-payment recovery can come from an order created before the
    // HttpOnly flow was deployed. Exchange the temporary raw token in the
    // request body; never place it in a tracking URL.
    let sessionEstablished = !storedToken;
    if (storedToken) {
      try {
        await axios.post(`/api/platform/orders/${orderId}/session`, { accessToken: storedToken });
        sessionEstablished = true;
      } catch {
        // The create-response may already have established the cookie. Keep
        // the temporary recovery token until the order page confirms access.
      }
    }
    // Spara i lokal order-historik + registrera aktiv order så hemkortet och
    // ordersidan hittar ordern även för gäster utan konto.
    saveOrderToHistory({
      id: orderId,
      phone: phone,
      accessToken: null,
      createdAt: new Date().toISOString(),
      restaurantName: cartRestaurantSlug ?? null,
      restaurantSlug: cartRestaurantSlug ?? null,
      total: total,
    });
    rememberActiveOrder(orderId, { phone });
    clearCart();
    // Betald order förbrukar aktiva dealen — nolla kontraktets båda nycklar
    // (Swift: HomeView nollar efter betald order).
    clearActiveUserDeal();
    setSelectedAccountDealId(null);
    setAppDealQuote(null);
    try {
      if (sessionEstablished) {
        localStorage.removeItem("pending_order_id");
        localStorage.removeItem("pending_order_token");
        localStorage.removeItem("pending_order_phone");
      }
    } catch {
      /* noop */
    }
    clearCheckoutAttempt();
    router.replace(embedMode
      ? `/order/${orderId}?embed=1&restaurant=${encodeURIComponent(embedRestaurantSlug || "")}`
      : `/order/${orderId}`);
  };

  const clearPendingPaymentStorage = () => {
    try {
      localStorage.removeItem("pending_order_id");
      localStorage.removeItem("pending_order_token");
      localStorage.removeItem("pending_order_phone");
    } catch {
      /* noop */
    }
    clearCheckoutAttempt();
  };

  const clearCartReturnParams = () => {
    try {
      const next = new URL(window.location.href);
      next.searchParams.delete("payment_return");
      next.searchParams.delete("payment_cancelled");
      next.searchParams.delete("redirect_status");
      window.history.replaceState({}, "", `${next.pathname}${next.search}`);
    } catch { /* noop */ }
  };

  const handlePaymentCancelled = async (orderId: string) => {
    setVerifyingPayment(false);
    paymentInFlightRef.current = false;
    clearCartReturnParams();
    await abandonPendingOrder(orderId);
    clearPendingPaymentStorage();
    setPendingOrderId(null);
    setError("Betalningen avbröts. Din varukorg är kvar, så du kan försöka igen direkt.");
  };

  // Pollar orderns betalstatus efter provider-returen eller när en persisterad
  // Mollie-order återupptas vid reopen. Status-endpointen stämmer dessutom av
  // direkt mot PSP:n, så flödet återhämtar sig även efter en försenad webhook.
  // PAID → tracking.
  // Terminalt fel/cancel → abandon + behåll varukorg. Timeout/pending → behåll
  // cart och låt kunden försöka igen; skicka ALDRIG obetald order till tracking.
  const finishHostedPayment = async (orderId: string, opts: { passive?: boolean } = {}) => {
    // Passiv = ingen payment_return-param, bara en kvarlämnad pending_order_id
    // (stängd Mollie-flik el. dyl.). Då görs en snabb engångskoll: PAID går
    // till tracking som vanligt, allt annat städas bort tyst så kassan aldrig
    // låses av en gammal order.
    const passive = opts.passive === true;
    setVerifyingPayment(true);
    const recoveryToken = localStorage.getItem("pending_order_token") || "";
    if (recoveryToken) {
      try {
        await axios.post(`/api/platform/orders/${orderId}/session`, {
          accessToken: recoveryToken,
        });
      } catch {
        // Polling below will still work if checkout already set the cookie;
        // otherwise it reports a recoverable timeout without leaking a token.
      }
    }
    const maxAttempts = passive ? 1 : 8;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await axios.get(`/api/platform/payments/status/${orderId}`);
        const ps = String(res.data?.paymentStatus || "").toUpperCase();
        if (ps === "PAID") {
          clearCartReturnParams();
          await goToOrderTracking(orderId);
          return;
        }
        if (["FAILED", "EXPIRED", "CANCELED", "CANCELLED", "REQUIRES_PAYMENT_METHOD"].includes(ps)) {
          setVerifyingPayment(false);
          clearCartReturnParams();
          await abandonPendingOrder(orderId);
          clearPendingPaymentStorage();
          setPendingOrderId(null);
          // En gammal order som städas bort passivt ska inte skrämmas upp som
          // ett färskt betalfel.
          if (!passive) setError("Betalningen genomfördes inte. Din varukorg är kvar, försök igen eller välj ett annat betalsätt.");
          return;
        }
      } catch (err: unknown) {
        const responseStatus = (err as { response?: { status?: unknown } } | null)?.response?.status;
        if ([404, 410].includes(Number(responseStatus))) {
          setVerifyingPayment(false);
          clearCartReturnParams();
          clearPendingPaymentStorage();
          setPendingOrderId(null);
          if (!passive) setError("Den tidigare betalningen kunde inte återställas. Din varukorg är kvar, så du kan försöka igen.");
          return;
        }
        /* nätverksfel: fortsätt polla */
      }
      if (attempt < maxAttempts - 1) await new Promise((r) => setTimeout(r, 2000));
    }
    setVerifyingPayment(false);
    clearCartReturnParams();
    if (passive) {
      // Ordern är varken betald eller terminal — kunden lämnade kassan. Släpp
      // den gamla ordern (abandon är no-op server-side om den hunnit betalas,
      // webhooken finaliserar den ändå) så en ny beställning kan läggas direkt.
      await abandonPendingOrder(orderId);
      clearPendingPaymentStorage();
      setPendingOrderId(null);
      return;
    }
    setError("Vi väntar fortfarande på betalningsbekräftelsen. Din varukorg är kvar. Om betalningen gick igenom uppdateras ordern automatiskt, annars kan du försöka igen om en stund.");
  };

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
      customerEmail: formData.customerEmail.trim() || undefined,
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
      appliedDealId: selectedPersonalDeal || selectedAccountDealId || automaticDealDismissed || hasCatalogDiscountedItems
        ? undefined
        : (automaticDeal.deal?.id || undefined),
      // Skickas till backend så pickBestDeal hoppar över auto-pickup när
      // kunden valt EGEN rabatt (kupong eller välkomst) eller explicit stängt
      // av auto-dealen. Säkerställer att frontend-total === backend-total.
      skipAutomaticDeal: !!(selectedPersonalDeal || selectedAccountDealId || automaticDealDismissed || hasCatalogDiscountedItems),
      // App-deal (WELCOME/REFERRAL_*/CAMPAIGN) — backend matchar mot
      // UserDeal.id och markerar den som USED när ordern slutförs. Skickas
      // bara när serverns quote säger applicable (Swift-paritet); annars
      // skulle backend avvisa ordern på t.ex. minOrder.
      userDealId: (() => {
        if (!selectedAccountDealId) return undefined;
        if (appDealQuote?.userDealId === selectedAccountDealId) {
          return appDealQuote.applicable ? selectedAccountDealId : undefined;
        }
        return accountDealDiscount > 0 ? selectedAccountDealId : undefined;
      })(),
      restaurantId: useCartStore.getState().restaurantId || undefined,
      restaurantSlug: useCartStore.getState().restaurantSlug || undefined,
      lat: (() => { try { return JSON.parse(localStorage.getItem("platform_coords") || "null")?.lat; } catch { return undefined; } })(),
      lng: (() => { try { return JSON.parse(localStorage.getItem("platform_coords") || "null")?.lng; } catch { return undefined; } })(),
      tip: effectiveTip > 0 ? effectiveTip : undefined,
      items: items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPriceKr: i.price,
        originalPriceKr: i.originalPrice,
        catalogDiscountApplied: i.catalogDiscountApplied === true,
        selectedExtras: i.extras.map((e) => ({
          groupId: e.groupId,
          groupName: e.groupName,
          extraId: e.extraId,
          extraName: e.name,
          priceAddon: e.price,
          quantity: e.quantity ?? 1,
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
          accessToken: null,
          createdAt: new Date().toISOString(),
          restaurantName: cartRestaurantSlug ?? null,
          restaurantSlug: cartRestaurantSlug ?? null,
          total: total,
        });
        rememberActiveOrder(orderId, { phone: formData.customerPhone });
      }
      clearCart();
      // Nolla aktiva deal-kontraktet även i test-flödet (ordern är slutförd).
      clearActiveUserDeal();
      setSelectedAccountDealId(null);
      setAppDealQuote(null);
      if (orderId) {
        router.push(embedMode
          ? `/order/${orderId}?embed=1&restaurant=${encodeURIComponent(embedRestaurantSlug || "")}`
          : `/order/${orderId}`);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || t("cart.errors.orderFailed"));
    } finally {
      setLoading(false);
    }
  };

  // ── Abandon en pre-skapad AWAITING_PAYMENT-order ───────────────────────────
  // Anropas när kunden avbryter (Stripe redirect_status=failed/cancelled) eller
  // navigerar bort från cart-sidan utan att slutföra betalning. Backend gör
  // owner-check via accessToken eller inloggningscookie och stämmer av PSP:n.
  // Idempotent: säker att kalla flera gånger.
  const abandonPendingOrder = useCallback(async (orderId: string): Promise<void> => {
    try {
      const token = (typeof window !== "undefined" ? localStorage.getItem("pending_order_token") : "") || "";
      await axios.post(`/api/platform/orders/${orderId}/abandon`, {
        accessToken: token || undefined,
      });
    } catch {
      // Backend cleanup-cron (5 min) hanterar misslyckanden — kunden ska inte
      // se fel här. Race med webhook är också säkert eftersom abandon-route
      // re-assertar status=AWAITING_PAYMENT + paymentStatus != PAID.
    }
  }, []);

  // ── Tracka pågående betalning så pagehide-handlern inte abandonar ─────────
  // Sätts till true precis innan stripe.confirmPayment() körs (Stripe kan
  // synchronously redirecta browsern till Klarna/Swish/3DS). Återställs vid
  // success/error eller när kunden kommer tillbaka via return_url.
  const paymentInFlightRef = useRef(false);

  // Do not abandon on pagehide/reload. Hosted checkouts legitimately leave
  // this page, and a beacon racing the payment webhook can delete a real order.
  // The persisted attempt is resumed on retry; explicit provider cancel/fail
  // uses handlePaymentCancelled, while backend cleanup handles true orphans.

  // (Stripe-eran: handlePaymentSuccess fanns här och anropade /payments/confirm.
  //  Med Mollie finaliserar webhook/reconcile ordern; klienten routar bara till
  //  /order/{id} via redirect-recovery-effekten ovan.)

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

    // Obligatoriskt BOGO-val: en upplåst gratis-vara måste plockas innan
    // betalning (annars betalar kunden och missar gratisen). Öppna pickern.
    if (bogoMustPick) {
      setShowBogoPicker(true);
      return;
    }

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
    // E-post är frivilligt — gäster anger bara namn + telefon. Inloggade har den
    // förifylld ur profilen. Backend skickar e-posten som valfritt till Mollie.
    // Anges en e-post måste den vara giltig; tom tillåts och skickas som undefined.
    if (!isTestFlow) {
      const emailValue = formData.customerEmail.trim();
      if (emailValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
        setError(t("cart.errors.invalidEmail"));
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
      if (activeDealBelowMinimum) {
        setError(`Den aktiva kupongen kräver en beställning på minst ${activeDealMinOrder} kr. Ta bort kupongen för att använda en annan kod.`);
        return;
      }
      const afterDiscount = Math.max(0, subtotal - foodDiscountComponent);
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

      // Step 1: Create order first (pending payment). The attempt key is tied
      // to the complete payload and persisted across refresh/provider return.
      // Same payload retries the same order; changed cart/address/deal rotates
      // the key and abandons the obsolete unpaid order first.
      const pendingPayload = {
        ...buildOrderPayload(),
        pendingPayment: true,
      };
      const fingerprint = checkoutFingerprint(pendingPayload);
      const previousAttempt = readCheckoutAttempt();
      const previousOrderId = localStorage.getItem("pending_order_id");
      if (previousOrderId && (!previousAttempt || previousAttempt.fingerprint !== fingerprint)) {
        await abandonPendingOrder(previousOrderId);
        clearPendingPaymentStorage();
        setPendingOrderId(null);
      }
      const attempt = writeCheckoutAttempt(fingerprint);
      idempotencyKey.current = attempt.key;
      const orderRes = await axios.post(`/api/platform/orders`, pendingPayload, {
        headers: { "Idempotency-Key": `order-${attempt.key}` },
      });
      const orderId: string = orderRes.data.orderId;

      // The proxy has already converted the API-issued order session to an
      // HttpOnly cookie. Persist only the non-secret order id/phone needed to
      // resume a hosted checkout after a browser redirect. `pending_order_token`
      // is read elsewhere solely to migrate checkouts created by old clients.
      localStorage.setItem("pending_order_id", orderId);
      localStorage.setItem("pending_order_phone", (formData.customerPhone || "").trim());
      setPendingOrderId(orderId);

      // Step 2: Skapa hosted checkout och skicka kunden dit. Providern
      // redirectar tillbaka till returnUrl (?payment_return=orderId) efter
      // betalningen, där vi pollar orderstatus. Webhooken finaliserar ordern,
      // klienten flippar aldrig status själv. paymentInFlight hindrar pagehide
      // från att abandona ordern under redirect-flödet.
      paymentInFlightRef.current = true;
      const returnParams = new URLSearchParams({ payment_return: orderId });
      if (embedMode) {
        returnParams.set("embed", "1");
        if (embedRestaurantSlug) returnParams.set("restaurant", embedRestaurantSlug);
      }
      const returnUrl = `${window.location.origin}/cart?${returnParams.toString()}`;
      const payRes = await axios.post(`/api/platform/payments/create`, {
        orderId,
        returnUrl,
        channel: "Web",
      });
      if (payRes.data?.alreadyPaid === true || String(payRes.data?.paymentStatus || "").toUpperCase() === "PAID") {
        clearCartReturnParams();
        await goToOrderTracking(orderId);
        return;
      }
      const checkoutUrl: string | undefined = payRes.data?.checkoutUrl;
      if (!checkoutUrl) {
        paymentInFlightRef.current = false;
        throw new Error(payRes.data?.details || payRes.data?.error || t("cart.errors.paymentUnavailable"));
      }
      window.location.href = checkoutUrl;
      return;
    } catch (err: any) {
      paymentInFlightRef.current = false;
      if (err.response?.data?.code === "ORDER_REPLAY_EXPIRED") {
        // Rotate the stale idempotency key on the next click. The persisted
        // order id remains for one cycle so startCheckout can best-effort
        // abandon the obsolete unpaid order before creating a new attempt.
        clearCheckoutAttempt();
      }
      setError(err.response?.data?.error || t("cart.errors.paymentUnavailable"));
    } finally {
      setLoading(false);
    }
  };

  // Full-varukorg-skeleton: visas bara FÖRE mount (matchar SSR) eller när en
  // icke-tom varukorg fortfarande laddar. En TOM varukorg hoppar direkt till
  // tomt-läget nedan istället för att visa en falsk "full varukorg".
  if (!mounted || (pageLoading && items.length > 0)) {
    return (
      <div className="min-h-screen pb-32 pt-[env(safe-area-inset-top,0px)] md:pt-24" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 xl:px-16 pt-6">
          <div className="flex items-end justify-between mb-5 px-1">
            <div>
              <div className="skeleton h-8 w-36 rounded-xl mb-2" />
              <div className="skeleton h-4 w-56 rounded-lg" />
            </div>
            <div className="skeleton h-5 w-24 rounded-lg hidden sm:block" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] xl:grid-cols-[1fr_480px] gap-4 lg:gap-8 items-start">
            <div className="space-y-4">
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-muted)", backgroundColor: "var(--bg-secondary)" }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="px-3.5 py-3 flex items-center gap-3" style={{ borderTop: i === 0 ? "none" : "1px solid var(--border-muted)" }}>
                    <div className="skeleton h-8 w-20 rounded-full shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="skeleton h-4 w-3/4 rounded-lg mb-2" />
                      <div className="skeleton h-3 w-1/2 rounded-lg" />
                    </div>
                    <div className="skeleton h-4 w-14 rounded-lg shrink-0" />
                  </div>
                ))}
              </div>
              <div className="hidden lg:block rounded-2xl p-5 space-y-3" style={{ border: "1px solid var(--border-muted)", backgroundColor: "var(--bg-secondary)" }}>
                <div className="skeleton h-14 w-full rounded-xl" />
                <div className="skeleton h-14 w-full rounded-xl" />
                <div className="skeleton h-28 w-full rounded-xl" />
              </div>
            </div>
            <div className="rounded-2xl p-4 sm:p-5 space-y-3" style={{ border: "1px solid var(--border-muted)", backgroundColor: "var(--bg-secondary)" }}>
              <div className="skeleton h-12 w-full rounded-xl" />
              <div className="skeleton h-14 w-full rounded-xl" />
              <div className="skeleton h-14 w-full rounded-xl" />
              <div className="skeleton h-32 w-full rounded-xl" />
              <div className="skeleton h-12 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ backgroundColor: "var(--bg-primary)" }}>
        {/* Tom varukorg — line-art-kasse som ritas upp vid mount och sedan
            svävar mjukt; skugg-ellipsen andas i motfas. Ingen emoji,
            bara en lugn, omsorgsfull detalj. */}
        <style>{`
          @keyframes cartBagDraw { from { stroke-dashoffset: 260; } to { stroke-dashoffset: 0; } }
          @keyframes cartBagFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
          @keyframes cartShadowBreathe { 0%, 100% { transform: scaleX(1); opacity: 0.5; } 50% { transform: scaleX(0.82); opacity: 0.3; } }
          .cart-empty-bag path, .cart-empty-bag circle { stroke-dasharray: 260; animation: cartBagDraw 1.1s ease-out forwards; }
          .cart-empty-float { animation: cartBagFloat 5s ease-in-out 1.2s infinite; }
          .cart-empty-shadow { transform-origin: center; animation: cartShadowBreathe 5s ease-in-out 1.2s infinite; }
          @media (prefers-reduced-motion: reduce) {
            .cart-empty-bag path, .cart-empty-bag circle { animation: none; stroke-dashoffset: 0; }
            .cart-empty-float, .cart-empty-shadow { animation: none; }
          }
        `}</style>
        <div className="flex flex-col items-center">
          <div className="cart-empty-float">
            <svg className="cart-empty-bag" width="88" height="88" viewBox="0 0 64 64" fill="none" aria-hidden="true">
              <path d="M14 22h36l-3.2 30a4 4 0 0 1-4 3.6H21.2a4 4 0 0 1-4-3.6L14 22z" stroke="var(--color-gold-500, #F0531C)" strokeWidth="2" strokeLinejoin="round" fill="none" />
              <path d="M23 28v-9a9 9 0 0 1 18 0v9" stroke="var(--gold-ink)" strokeWidth="2" strokeLinecap="round" fill="none" />
              <circle cx="26" cy="40" r="1.4" fill="var(--gold-ink)" stroke="var(--gold-ink)" strokeWidth="0.5" />
              <circle cx="38" cy="40" r="1.4" fill="var(--gold-ink)" stroke="var(--gold-ink)" strokeWidth="0.5" />
              <path d="M26 46c2 2.4 10 2.4 12 0" stroke="var(--gold-ink)" strokeWidth="2" strokeLinecap="round" fill="none" />
            </svg>
          </div>
          <svg className="cart-empty-shadow mt-2" width="72" height="10" viewBox="0 0 72 10" aria-hidden="true">
            <ellipse cx="36" cy="5" rx="30" ry="4" fill="var(--gold-soft)" />
          </svg>
          <h2 className="mt-6 text-[17px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {t("cart.empty.titlePrefix")} {t("cart.empty.titleAccent")}
          </h2>
          <p className="mt-1.5 text-[13.5px] text-center max-w-[260px]" style={{ color: "var(--text-secondary)" }}>
            {t("cart.empty.subtitle")}
          </p>
          <Link
            href={embedMode ? embedMenuHref : "/"}
            className="mt-6 h-11 px-5 rounded-xl flex items-center text-[14.5px] font-semibold transition-all active:scale-95"
            style={{ border: "1px solid var(--line-strong)", color: "var(--text-primary)" }}
          >
            {t("cart.empty.cta")}
          </Link>
        </div>
      </div>
    );
  }

  // ── Delade render-block ────────────────────────────────────────────────
  // Desktop-vänsterkolumnen och mobil-flödet visade tidigare IDENTISK JSX som
  // var duplicerad (~150 rader ×2): account-deals, rabattkod, anteckning och
  // min-order-bannern. Nu EN definition per block — samma state/handlers,
  // bara olika placering i layouten.
  // Aktiv deal från kontraktet som inte finns i account-deals-listan (t.ex.
  // CAMPAIGN claimad på hemskärmen). Visas som egen rad med serverns quote
  // som belopp så kunden kan se/välja bort den i kassan.
  const activeExternalDeal =
    selectedAccountDealId && !accountDeals.some((d) => d.id === selectedAccountDealId)
      ? {
          id: selectedAccountDealId,
          title: (appDealQuote?.userDealId === selectedAccountDealId && appDealQuote?.dealTitle) || "Din deal",
        }
      : null;

  const renderAccountDeals = () => (accountDeals.length > 0 || activeExternalDeal) && (
    <div className="space-y-2">
      {activeExternalDeal && (
        <button
          type="button"
          onClick={() => { setSelectedAccountDealId(null); clearActiveUserDeal(); }}
          className="w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-all text-left active:scale-[0.99]"
          style={{ backgroundColor: "var(--gold-soft)", borderColor: "rgba(240,83,28,0.45)" }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Check size={16} strokeWidth={2.5} style={{ color: "var(--gold-ink)" }} className="shrink-0" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium truncate" style={{ color: "var(--gold-ink)" }}>{activeExternalDeal.title}</p>
              {appDealQuote && !appDealQuote.applicable && appDealQuote.reason === "MIN_ORDER" && (appDealQuote.minOrderKr ?? 0) > 0 && (
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  Handla för minst {appDealQuote.minOrderKr} kr
                </p>
              )}
            </div>
          </div>
          <span className="text-[12px] font-medium shrink-0" style={{ color: "var(--gold-ink)" }}>
            {t("cart.discount.promoRemove")}
          </span>
        </button>
      )}
      {accountDeals.map((d) => {
        const min = d.minOrderKr ?? 0;
        const meetsMin = subtotal >= min;
        const isActive = selectedAccountDealId === d.id;
        const blockedByPromo = !!selectedPersonalDeal && !isActive;
        // Keep the active deal clickable even below its minimum so the
        // customer can remove it and enter another code. Only inactive deals
        // are disabled while their minimum is unmet.
        const disabled = (!meetsMin && !isActive) || blockedByPromo;
        return (
          <button
            key={d.id}
            type="button"
            disabled={disabled}
            onClick={() => {
              // Valet speglas till aktiva deal-kontraktet (viaeats.active-
              // UserDealId) så hemskärmen visar samma val. Snapshot nollas
              // när kassan sätter/byter deal (Swift-paritet).
              if (isActive) { setSelectedAccountDealId(null); clearActiveUserDeal(); }
              else {
                setSelectedAccountDealId(d.id);
                setSelectedPersonalDeal(null);
                setPromoCodeInput("");
                writeActiveUserDeal(d.id);
              }
            }}
            className={`w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-all text-left ${disabled ? "opacity-40 cursor-not-allowed" : "active:scale-[0.99]"}`}
            style={{
              backgroundColor: isActive ? "var(--gold-soft)" : "var(--bg-deep)",
              borderColor: isActive ? "rgba(240,83,28,0.45)" : "var(--border-muted)",
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {isActive ? <Check size={16} strokeWidth={2.5} style={{ color: "var(--gold-ink)" }} className="shrink-0" /> : <Gift size={16} style={{ color: "var(--text-secondary)" }} className="shrink-0" />}
              <div className="min-w-0">
                <p className="text-[13px] font-medium truncate" style={{ color: isActive ? "var(--gold-ink)" : "var(--text-primary)" }}>
                  {isActive ? t("cart.discount.activeReward") : t("cart.discount.useReward", { type: dealTypeLabel(d.type, t), label: formatDealLabel(d, t) })}
                </p>
                {!meetsMin && min > 0 && (
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    {t("cart.discount.minOrderRequired", { min })}
                  </p>
                )}
                {blockedByPromo && meetsMin && (
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    {t("cart.discount.blockedByPromo")}
                  </p>
                )}
              </div>
            </div>
            <span className="text-[12px] font-medium shrink-0" style={{ color: isActive ? "var(--gold-ink)" : "var(--text-secondary)" }}>
              {isActive ? t("cart.discount.promoRemove") : `−${computeDealComponentsKr(d, subtotal, deliveryFee).total} ${t("common.kr")}`}
            </span>
          </button>
        );
      })}
      <div className="flex items-center gap-3 pt-0.5">
        <div className="flex-1 h-px" style={{ background: "var(--border-muted)" }} />
        <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{t("cart.discount.or")}</span>
        <div className="flex-1 h-px" style={{ background: "var(--border-muted)" }} />
      </div>
    </div>
  );

  const renderPromoInput = () => (
    <div className="space-y-2">
      <div className={`relative flex items-center transition-all ${selectedAccountDealId ? "opacity-40 pointer-events-none" : ""}`}>
        <Tag size={15} className="absolute left-4 pointer-events-none" style={{ color: "var(--text-secondary)" }} />
        <input
          value={selectedPersonalDeal ? selectedPersonalDeal.code : promoCodeInput}
          onChange={e => { if(selectedPersonalDeal) setSelectedPersonalDeal(null); setPromoCodeInput(e.target.value); setReferralMessage(null); }}
          disabled={!!selectedAccountDealId}
          className="w-full border rounded-xl h-12 pl-11 pr-24 text-[14px] font-medium outline-none transition-all disabled:cursor-not-allowed"
          style={{ backgroundColor: "var(--bg-deep)", borderColor: selectedPersonalDeal ? "rgba(240,83,28,0.45)" : "var(--border-muted)", color: selectedPersonalDeal ? "var(--gold-ink)" : "var(--text-primary)" }}
          placeholder={selectedAccountDealId ? t("cart.discount.promoBlockedByReward") : selectedPersonalDeal ? t("cart.discount.promoApplied") : t("cart.discount.promoPlaceholder")}
        />
        <button
          type="button"
          disabled={!!selectedAccountDealId || applyingCode}
          onClick={selectedPersonalDeal ? () => { setSelectedPersonalDeal(null); setPromoCodeInput(""); } : handleApplyPromo}
          className="absolute right-2 px-4 h-9 rounded-lg text-[13px] font-medium transition-all disabled:cursor-not-allowed active:scale-95"
          style={selectedPersonalDeal ? { color: "#C0392B" } : { color: "var(--text-primary)" }}
        >
          {applyingCode ? <Loader2 size={15} className="animate-spin" /> : selectedPersonalDeal ? t("cart.discount.promoRemove") : t("cart.discount.promoCheck")}
        </button>
      </div>
      {/* Vänkods-feedback (Swift: referralRedeemMessage) — grön vid succé,
          orange vid serverfel som "Du har redan använt en referral-kod". */}
      {referralMessage && (
        <p className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: referralMessage.ok ? "var(--success-ink, #1F6B41)" : "var(--gold-ink)" }}>
          {referralMessage.ok ? <CheckCircle2 size={14} className="shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
          {referralMessage.text}
        </p>
      )}
    </div>
  );

  const renderNoteField = () => (
    <>
      <label className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>{t("cart.fields.noteLabel")}</label>
      <textarea rows={2} value={formData.note} onChange={e => { setFormData({...formData, note: e.target.value}); localStorage.setItem("cart_note", e.target.value); }} className="w-full border rounded-xl p-3 text-[14px] font-medium placeholder:text-zinc-400 outline-none transition-all resize-none" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--line-strong)", color: "var(--text-primary)" }} placeholder={t("cart.fields.notePlaceholderExample")} />
    </>
  );

  // Dricks-grid (0/10/20/30 + eget) — extraherad så samma markup kan återanvändas
  // i både mobil- och desktop-layouten. keyPrefix undviker dubbla React-keys
  // (båda layouterna finns i DOM, en döljs via CSS).
  const renderTipGrid = (keyPrefix: string) => (
    <div className="space-y-3">
      <p className="text-[12.5px] leading-snug" style={{ color: "var(--text-secondary)" }}>{t("cart.tip.sub")}</p>
      <div className="grid grid-cols-5 gap-2">
        {[0, 10, 20, 30].map((amt) => {
          const isActive = !showCustomTipInput && tipAmount === amt;
          return (
            <button
              key={`${keyPrefix}-tip-${amt}`}
              type="button"
              onClick={() => { setShowCustomTipInput(false); setCustomTipText(""); setTipAmount(amt); }}
              className="py-2.5 rounded-xl text-[13px] font-semibold border transition-all active:scale-95"
              style={isActive
                ? { backgroundColor: "var(--text-primary)", borderColor: "var(--text-primary)", color: "var(--bg-primary)" }
                : { backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)", color: "var(--text-secondary)" }}
            >
              {amt === 0 ? t("cart.tip.none") : `+${amt}`}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            const next = !showCustomTipInput;
            setShowCustomTipInput(next);
            if (next) { setCustomTipText(tipAmount > 0 ? String(tipAmount) : ""); }
            else { setCustomTipText(""); setTipAmount(0); }
          }}
          className="py-2.5 rounded-xl text-[13px] font-semibold border transition-all active:scale-95"
          style={showCustomTipInput
            ? { backgroundColor: "var(--color-gold-500, #F0531C)", borderColor: "var(--color-gold-500, #F0531C)", color: "#141416" }
            : { backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)", color: "var(--text-secondary)" }}
        >
          {t("cart.tip.custom")}
        </button>
      </div>
      {showCustomTipInput && (
        <div className="relative">
          <input
            type="number" min={0} step={1} inputMode="numeric"
            value={customTipText}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, "");
              setCustomTipText(raw);
              const parsed = raw === "" ? 0 : parseInt(raw, 10);
              setTipAmount(Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
            }}
            placeholder={t("cart.tip.customPlaceholder")}
            className="w-full border rounded-xl p-3.5 text-[15px] font-medium placeholder:text-zinc-400 outline-none transition-all"
            style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--line-strong)", color: "var(--text-primary)" }}
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-medium text-zinc-500">{t("common.kr")}</span>
        </div>
      )}
    </div>
  );

  // Kollapsade extras-rader (mockup): dricks / rabatter / rabattkod / meddelande
  // som "Rabattkod ›"-rader i stället för tre alltid-öppna guldsektioner. De
  // viktiga uppgifterna (namn/adress/telefon/e-post) bor kvar synliga inline.
  const renderCartExtras = (keyPrefix: string) => {
    const tipHint = effectiveTip > 0 ? `${effectiveTip} ${t("common.kr")}` : null;
    // Rabattkod-raden rymmer BÅDE personliga/konto-deals OCH kupong-fältet, så
    // man kan välja en sparad belöning eller skriva en kod i samma expansion.
    const discountHint = selectedPersonalDeal
      ? t("cart.discount.promoApplied")
      : selectedAccountDealId
        ? t("cart.discount.activeReward")
        : accountDeals.length > 0
          ? t("cart.discount.available", { count: accountDeals.length })
          : null;
    const discountOpen = !!selectedPersonalDeal || !!selectedAccountDealId;
    const firstKey = orderType === "DELIVERY" ? "tip" : "promo";
    return (
      <div className="space-y-2.5">
        {/* Notering FÖRST (ovanför rabatter & dricks) — synligt inline-fält. */}
        <div className="space-y-1.5">{renderNoteField()}</div>
        {/* Sedan rabatter & dricks som kollapsade rader. */}
        <div className="rounded-xl px-4" style={{ border: "1px solid var(--border-muted)", backgroundColor: "var(--bg-secondary)" }}>
          {orderType === "DELIVERY" && (
            <CartCollapsibleRow first={firstKey === "tip"} label={t("cart.tip.label")} hint={tipHint} defaultOpen={effectiveTip > 0}>
              {renderTipGrid(keyPrefix)}
            </CartCollapsibleRow>
          )}
          <CartCollapsibleRow first={firstKey === "promo"} label={t("cart.discount.promoTitle")} hint={discountHint} defaultOpen={discountOpen}>
            <div className="space-y-3">
              {renderAccountDeals()}
              {renderPromoInput()}
            </div>
          </CartCollapsibleRow>
        </div>
      </div>
    );
  };

  const renderMinOrderBanner = (extraClass = "") =>
    subtotal > 0 && Math.max(0, subtotal - foodDiscountComponent) < effectiveMinOrder && addressZoneStatus !== "error" && (
      <div
        className={`rounded-2xl border px-4 py-3 ${extraClass}`}
        style={{
          background: topUpToMinimum ? "var(--bg-deep)" : "rgba(239,68,68,0.08)",
          borderColor: topUpToMinimum ? "var(--border-muted)" : "rgba(239,68,68,0.30)",
        }}
      >
        {(() => {
          const gapToEffective = Math.max(0, Math.ceil(effectiveMinOrder - Math.max(0, subtotal - foodDiscountComponent)));
          const progressBase = effectiveMinOrder > 0 ? effectiveMinOrder : minOrder;
          const progress = Math.min(((Math.max(0, subtotal - foodDiscountComponent)) / progressBase) * 100, 100);
          return (
            <>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[13px] font-medium" style={{ color: topUpToMinimum ? "var(--text-primary)" : "#E11D48" }}>
                  {topUpToMinimum ? t("cart.minOrder.banner.topUp", { amount: gapToEffective }) : t("cart.minOrder.banner.short", { amount: gapToEffective })}
                </p>
                <span className="text-[10px] font-bold" style={{ color: topUpToMinimum ? "var(--text-secondary)" : "#E11D48" }}>{subtotal.toFixed(0)} / {minOrder.toFixed(0)} {t("common.kr")}</span>
              </div>
              <div className="h-1.5 w-full rounded-full overflow-hidden mb-3" style={{ background: "var(--border-muted)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: topUpToMinimum ? "var(--text-primary)" : "#E11D48" }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={topUpToMinimum} onChange={(e) => setTopUpToMinimum(e.target.checked)} className="h-4 w-4 accent-gold-500 cursor-pointer" />
                <span className="text-[10px] font-bold leading-snug" style={{ color: "var(--text-secondary)" }}>
                  {t("cart.minOrder.toggleLabel", { amount: gapToEffective })}
                </span>
              </label>
            </>
          );
        })()}
      </div>
    );

  const renderFulfillmentStatus = () => {
    const isDelivery = orderType === "DELIVERY";
    const Icon = isDelivery ? Truck : Store;
    const title = isDelivery ? t("cart.deliveryType.delivery") : t("cart.deliveryType.pickup");
    const detail = isDelivery
      ? (addressInput || t("cart.fields.addressPlaceholderFull"))
      : (cartRestaurantName ? `${t("cart.deliveryType.pickup")} hos ${cartRestaurantName}` : t("cart.deliveryType.pickup"));
    const meta = isDelivery
      ? `~${restaurantSettings.estimatedDeliveryTime} min`
      : `~${restaurantSettings.estimatedPickupTime} min`;
    const statusColor = isDelivery && addressZoneStatus === "error"
      ? "#C0392B"
      : isDelivery && addressZoneStatus === "checking"
        ? "var(--text-secondary)"
        : "var(--gold-ink)";

    return (
      <div className="mb-4 rounded-2xl px-4 py-3 flex items-start gap-2.5" style={{ backgroundColor: "var(--gold-soft)", border: "1px solid rgba(240,83,28,0.18)" }}>
        <Icon size={18} strokeWidth={2.4} className="mt-0.5 shrink-0" style={{ color: "var(--gold-ink)" }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-[13px] font-bold" style={{ color: statusColor }}>{title}</p>
            <span className="text-[12px] font-semibold shrink-0" style={{ color: "var(--text-secondary)" }}>{meta}</span>
          </div>
          <p className="mt-0.5 text-[13px] font-medium truncate" style={{ color: "var(--text-primary)" }}>{detail}</p>
          {isDelivery && addressZoneStatus === "error" && (
            <p className="mt-1 text-[12px] font-medium" style={{ color: "#C0392B" }}>{t("cart.errors.zoneNotCoveredHome")}</p>
          )}
        </div>
        {isDelivery && (checkingDelivery || addressZoneStatus === "checking") ? (
          <Loader2 size={16} className="animate-spin shrink-0" style={{ color: "var(--text-secondary)" }} />
        ) : isDelivery && addressZoneStatus === "ok" ? (
          <Check size={17} strokeWidth={2.6} className="shrink-0" style={{ color: "var(--success-ink)" }} />
        ) : null}
      </div>
    );
  };

  return (
    <div className="min-h-screen pt-[calc(env(safe-area-inset-top,0px)+1rem)] sm:pt-12 md:pt-20 pb-36 px-3 sm:px-6 lg:px-10 xl:px-16" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="max-w-[1400px] mx-auto">
        <div className="flex items-end justify-between mb-4 lg:mb-8 px-1 sm:px-4">
           <div className="min-w-0">
              {embedMode && (
                <Link
                  href={embedMenuHref}
                  className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold hover:opacity-70"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <ChevronLeft size={16} /> Tillbaka till restaurangen
                </Link>
              )}
              {/* Titel "Varukorg" + subtitel = restaurang · leverans/avhämtning ~ETA
                  (enligt mockup). Restaurangnamnet är klickbart tillbaka till menyn. */}
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight mb-1" style={{ color: "var(--text-primary)" }}>{t("cart.heading.prefix")}</h1>
              <p className="text-[13.5px]" style={{ color: "var(--text-secondary)" }}>
                {cartRestaurantName ? (
                  <Link href={embedMode ? embedMenuHref : (cartRestaurantSlug ? `/restaurants/${cartRestaurantSlug}` : "/")} className="font-semibold hover:underline" style={{ color: "var(--text-primary)" }}>
                    {cartRestaurantName}
                  </Link>
                ) : null}
                {cartRestaurantName && <span className="mx-1.5" style={{ opacity: 0.5 }}>·</span>}
                {orderType === "DELIVERY"
                  ? `${t("cart.deliveryType.delivery")} ~${restaurantSettings.estimatedDeliveryTime} min`
                  : t("cart.deliveryType.pickup")}
              </p>
           </div>
           <Link href={embedMode ? embedMenuHref : (cartRestaurantSlug ? `/restaurants/${cartRestaurantSlug}` : "/menu")} className="text-[13.5px] font-semibold transition-colors flex items-center gap-1.5 mb-1 group shrink-0 ml-3 hover:opacity-70" style={{ color: "var(--text-primary)" }}>
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
          {menuChangedNotice && (
            <motion.div
              key="menu-changed"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-2xl mb-6 border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-start gap-3"
            >
              <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="flex-1 text-[11px] font-bold text-amber-200 leading-snug">
                {menuChangedNotice}
              </p>
              <button
                onClick={() => setMenuChangedNotice(null)}
                className="text-amber-300/60 hover:text-amber-200 transition-colors shrink-0"
                aria-label={t("common.close")}
              >
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] xl:grid-cols-[1fr_480px] gap-4 lg:gap-8 items-start">
          {/* Cart items list — kompakta en-rad-kort. Vänster kolumn växer
              med tillgänglig bredd; höger sidebar har fast bredd och blir
              sticky på desktop för att undvika scroll. */}
          <div className="min-w-0">
            {/* Flat lista med hårfina separatorer (mockup): stepper VÄNSTER,
                namn+extras i mitten (klickbart för att ändra), pris höger. */}
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-muted)" }}>
              {items.map((item, idx) => (
                <motion.div
                  key={item.cartItemId}
                  layout
                  className="px-3.5 py-3 flex items-center gap-3 group"
                  style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-muted)", backgroundColor: "var(--bg-secondary)" }}
                >
                  {/* Stepper — vänster, en samlad kontroll (− qty +) */}
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-full shrink-0" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)" }}>
                    <button
                      onClick={() => { if (item.quantity === 1) { removeItem(item.cartItemId); } else { updateQuantity(item.cartItemId, -1); } }}
                      className="w-6 h-6 rounded-full flex items-center justify-center active:scale-90 transition-all hover:opacity-100" style={{ color: "var(--text-secondary)" }}
                      aria-label={item.quantity === 1 ? "Ta bort" : "Minska antal"}
                    >
                      {item.quantity === 1 ? <Trash2 size={13} strokeWidth={2.2} /> : <Minus size={13} strokeWidth={2.5} />}
                    </button>
                    <span className="text-[13px] font-bold w-3 text-center" style={{ color: "var(--text-primary)" }}>{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.cartItemId, 1)}
                      className="w-6 h-6 rounded-full flex items-center justify-center active:scale-90 transition-all hover:opacity-70" style={{ color: "var(--text-primary)" }}
                      aria-label="Öka antal"
                    >
                      <Plus size={13} strokeWidth={2.5} />
                    </button>
                  </div>

                  {/* Namn + extras — klickbart för att redigera */}
                  <button
                    type="button"
                    onClick={() => handleEditCartItem(item)}
                    className="text-left flex-1 min-w-0"
                    aria-label={`${t("cart.tapToEdit")}: ${item.name}`}
                  >
                    <h3 className="text-[14.5px] font-semibold leading-snug line-clamp-2" style={{ color: "var(--text-primary)" }}>{item.name}</h3>
                    {item.extras.length > 0 && (
                      <p className="text-[12px] truncate mt-0.5" style={{ color: "var(--text-secondary)" }}>
                        {item.extras.map(e => (e.quantity ?? 1) > 1 ? `${e.name} ×${e.quantity}` : e.name).join(" · ")}
                      </p>
                    )}
                  </button>

                  {/* Pris — höger */}
                  <div className="text-right shrink-0">
                    {item.bogoFreeFromDealId ? (
                      <div className="inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--gold-ink)" }}>{t("cart.bogo.freeTag")}</div>
                    ) : item.catalogDiscountApplied && typeof item.originalPrice === "number" && item.originalPrice > item.price ? (
                      <div className="flex flex-col items-end gap-0.5" style={{ fontVariantNumeric: "tabular-nums" }}>
                        <div className="text-[14.5px] font-extrabold leading-none" style={{ color: "var(--orange, #F04F1A)" }}>
                          {(item.price * item.quantity).toFixed(0)} kr
                        </div>
                        <div className="text-[11.5px] font-semibold line-through leading-none" style={{ color: "var(--text-secondary)" }}>
                          {(item.originalPrice * item.quantity).toFixed(0)} kr
                        </div>
                      </div>
                    ) : (
                      <div className="text-[14.5px] font-semibold leading-none" style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{(item.price * item.quantity).toFixed(0)} kr</div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Desktop left column: delivery details + pricing */}
            <div className="hidden lg:block mt-5 space-y-4" id="desktop-left-extras">
              <div className="p-5 rounded-2xl space-y-5" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", boxShadow: "var(--card-shadow)" }}>

                {/* Kollapsade extras-rader (dricks/rabatter/rabattkod/meddelande)
                    enligt mockup — samma delade render-block som mobil-flödet. */}
                {renderCartExtras("dl")}
                {renderMinOrderBanner()}

                {/* Totals */}
                <div className="pt-6 space-y-4" style={{ borderTop: "1px solid var(--border-muted)" }}>
                  <div className="flex justify-between text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}><span>{t("cart.summary.subtotal")}</span><span>{subtotal.toFixed(0)} {t("common.sek")}</span></div>
                  {orderType === 'DELIVERY' && (
                    <div className="flex justify-between text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                      <span>{t("cart.summary.deliveryFee")}</span>
                      <span style={{ color: "var(--text-primary)" }}>{addressZoneStatus === "checking" ? t("cart.summary.deliveryCalculating") : `${deliveryFee.toFixed(0)} ${t("common.sek")}`}</span>
                    </div>
                  )}
                  {effectiveTip > 0 && <div className="flex justify-between text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}><span>{t("cart.summary.tip")}</span><span style={{ color: "var(--text-primary)" }}>+{effectiveTip.toFixed(0)} {t("common.sek")}</span></div>}
                  {minOrderTopUp > 0 && <div className="flex justify-between text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}><span>{t("cart.summary.minOrderTopUp")}</span><span style={{ color: "var(--text-primary)" }}>+{minOrderTopUp.toFixed(0)} {t("common.sek")}</span></div>}
                  {finalDiscount > 0 && (
                    <div className="flex justify-between text-[13px] font-semibold text-emerald-600">
                      <span>{t("cart.summary.discount")}</span>
                      <span>-{finalDiscount.toFixed(0)} {t("common.sek")}</span>
                    </div>
                  )}
                  {/* Promo applied men inte aktiverad än (subtotal under deal:s min-order).
                      Utan denna rad ser kunden bara "kod applied" i input-fältet utan att
                      förstå varför totalen inte ändras — Bilal A2 fynd. */}
                  {finalDiscount === 0 && selectedPersonalDeal && (selectedPersonalDeal.campaign.minOrder || 0) > subtotal && (
                    <div className="flex justify-between text-[12.5px] font-medium text-amber-600 leading-snug">
                      <span>{selectedPersonalDeal.code}</span>
                      <span>{t("cart.summary.discountPendingMin", { defaultValue: "Aktiveras vid {{amount}} kr", amount: (selectedPersonalDeal.campaign.minOrder || 0).toFixed(0) })}</span>
                    </div>
                  )}
                  {finalDiscount === 0 && selectedAccountDeal && (selectedAccountDeal.minOrderKr ?? 0) > subtotal && (
                    <div className="flex justify-between text-[12.5px] font-medium text-amber-600 leading-snug">
                      <span>{formatDealLabel(selectedAccountDeal, t)}</span>
                      <span>{t("cart.summary.discountPendingMin", { defaultValue: "Aktiveras vid {{amount}} kr", amount: (selectedAccountDeal.minOrderKr ?? 0).toFixed(0) })}</span>
                    </div>
                  )}
                  {typeof vatPercent === "number" && (
                    <div className="flex justify-between text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                      <span>{t("cart.summary.vat", { percent: vatPercent })}</span>
                      <span>{vatAmount.toFixed(0)} {t("common.sek")}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center mt-5 pt-4" style={{ borderTop: "1px solid var(--border-muted)" }}>
                    <span className="text-[16px] font-bold" style={{ color: "var(--text-primary)" }}>{t("cart.summary.total")}</span>
                    <span className="text-[20px] font-bold" style={{ color: "var(--gold-ink)", fontVariantNumeric: "tabular-nums" }}>{total.toFixed(0)} {t("common.sek")}</span>
                  </div>
                </div>

                {/* Guest banner */}
                {!user && (
                  <div className="p-4 rounded-2xl border flex items-center gap-3" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)" }}>
                    <UserIcon size={16} className="text-zinc-400 shrink-0" />
                    <p className="text-[10px] font-bold leading-snug flex-1" style={{ color: "var(--text-secondary)" }}>
                      {embedMode ? "Du beställer som gäst – inget konto behövs." : <>{t("cart.guest.banner")}{" "}
                        <Link href="/profile" className="underline hover:opacity-70" style={{ color: "var(--text-primary)" }}>{t("cart.guest.loginLink")}</Link>{" "}
                        {t("cart.guest.bannerSuffix")}</>}
                    </p>
                  </div>
                )}

                {error && <div className="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[13.5px] font-medium text-center leading-snug">{error}</div>}

                {/* Checkout button */}
                <button
                  onClick={startCheckout}
                  disabled={
                    loading
                    || bogoMustPick
                    || (!isTestFlow && activeDealBelowMinimum)
                    || (!isTestFlow && Math.max(0, subtotal - foodDiscountComponent) < effectiveMinOrder && !topUpToMinimum)
                    || (!isTestFlow && !restaurantSettings.isOpen)
                    || (!isTestFlow && addressZoneStatus === "error")
                    || (!isTestFlow && addressZoneStatus === "checking")
                  }
                  className="w-full h-[52px] px-5 bg-gold-500 rounded-xl text-[15.5px] font-semibold active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-3 group" style={{ color: "#FFFFFF" }}
                >
                  {loading
                    ? <Loader2 className="animate-spin" size={24} />
                    : bogoMustPick
                      ? t("cart.bogo.mustPick")
                      : addressZoneStatus === "checking"
                        ? <><Loader2 className="animate-spin" size={20} /> {t("cart.submit.checking")}</>
                        : (Math.max(0, subtotal - foodDiscountComponent) < effectiveMinOrder && !topUpToMinimum)
                          ? t("cart.submit.short", { amount: Math.ceil(effectiveMinOrder - Math.max(0, subtotal - foodDiscountComponent)) })
                          : addressZoneStatus === "error"
                            ? t("cart.submit.zoneError")
                            : <span className="w-full flex items-center justify-between gap-3">
                                <span className="flex items-center gap-2">{t("cart.submit")} <ArrowRight size={18} className="group-hover:translate-x-1.5 transition-transform" /></span>
                                <span style={{ fontVariantNumeric: "tabular-nums" }}>{total.toFixed(0)} {t("common.sek")}</span>
                              </span>}
                </button>
              </div>
            </div>
          </div>

          {/* Form & Payment — sticky på desktop. INGEN inre overflow-scroll
              (det skapade en container-scroll inuti sidan vilket användaren
              ogillade). Sticky-positionen följer dokumentscrollen istället. */}
          <div className="lg:sticky lg:top-24">
             <AnimatePresence mode="wait">
               {verifyingPayment ? (
                  <motion.div key="verifying" id="adyen-payment" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} className="p-5 sm:p-7 rounded-2xl relative" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-muted)", boxShadow: "var(--card-shadow)" }}>
                     <div className="mb-1 flex items-center gap-2 text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
                        <CreditCard size={16} style={{ color: "var(--text-secondary)" }} /> Betalning
                     </div>
                     <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                        <div className="h-7 w-7 animate-spin rounded-full" style={{ border: "2px solid var(--border-muted)", borderTopColor: "var(--text-primary)" }} />
                        <p className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>Verifierar betalningen</p>
                        <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>Det tar bara en liten stund, stäng inte sidan.</p>
                     </div>
                  </motion.div>
               ) : (
                  <motion.div key="form" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-4 sm:p-5 rounded-2xl relative" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", boxShadow: "var(--card-shadow)" }}>
                      {renderFulfillmentStatus()}


                       <div className="space-y-2.5">
                        {(() => {
                          const hair = <div style={{ height: 1, backgroundColor: "var(--border-muted)" }} />;
                          const lbl = (bad: boolean) => ({ width: 74, flexShrink: 0, fontSize: 13, fontWeight: 500 as const, whiteSpace: "nowrap" as const, color: bad ? "#C0392B" : "var(--text-secondary)" });
                          const inputCls = "flex-1 h-full bg-transparent outline-none text-[16px] sm:text-[15px] font-medium";
                          const inputStyle = { color: "var(--text-primary)", border: "none" as const };

                          // INLOGGAD: uppgifterna är redan kända → visa dem hopfällda
                          // och läs-bara (klicka för att se), som rabattkod-raden.
                          if (user) {
                            const readRow = (label: string, value: string) => value ? (
                              <div className="flex items-baseline gap-3 py-1.5">
                                <span style={{ width: 74, flexShrink: 0, fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>{label}</span>
                                <span className="flex-1 min-w-0 text-[14.5px] font-medium break-words" style={{ color: "var(--text-primary)" }}>{value}</span>
                              </div>
                            ) : null;
                            // INLOGGAD: namn/telefon/epost hopfällt (klick för att se).
                            // Leverans-/pickup-läget visas i den orange statusraden ovan.
                            return (
                              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-muted)", backgroundColor: "var(--bg-card)" }}>
                                <div className="px-4">
                                  <CartCollapsibleRow first label={t("cart.yourInfo.title")} hint={formData.customerName || "Inloggad"} icon={<UserIcon size={15} style={{ color: "var(--text-secondary)" }} />}>
                                    <div className="pt-0.5">
                                      {readRow(t("cart.fields.name"), formData.customerName)}
                                      {readRow(t("cart.fields.phone"), formData.customerPhone)}
                                      {readRow(t("cart.fields.email"), formData.customerEmail)}
                                    </div>
                                  </CartCollapsibleRow>
                                </div>
                              </div>
                            );
                          }

                          // GÄST: öppet formulär, endast namn + telefon. Ingen e-post,
                          // ingen portkod. Adressen visas bara i statusraden ovan.
                          const nameTouched = formData.customerName.length > 0;
                          const phoneTouched = formData.customerPhone.length > 0;
                          const nameInvalid = nameTouched && formData.customerName.trim().length < 2;
                          const phoneInvalid = phoneTouched && formData.customerPhone.replace(/\D/g, '').length < 8;
                          return (
                            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-muted)", backgroundColor: "var(--bg-card)" }}>
                              <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--border-muted)" }}>
                                <span className="text-[14px] font-bold" style={{ color: "var(--text-primary)" }}>{t("cart.yourInfo.title")}</span>
                                <span className="text-[11px] font-semibold rounded-full px-2.5 py-1" style={{ color: "var(--gold-ink)", backgroundColor: "var(--gold-soft)" }}>Gäst</span>
                              </div>
                              <div className="flex items-center min-h-[52px] px-4">
                                <span style={lbl(nameInvalid)}>{t("cart.fields.name")}</span>
                                <input value={formData.customerName} onChange={e => setFormData({ ...formData, customerName: e.target.value })} autoComplete="name" className={inputCls} style={inputStyle} placeholder={t("cart.fields.namePlaceholder")} />
                              </div>
                              {nameInvalid && <p className="px-4 pb-2 text-[12px] font-medium" style={{ color: "#C0392B" }}>{t("cart.errors.nameTooShort")}</p>}
                              {hair}
                              <div className="flex items-center min-h-[52px] px-4">
                                <span style={lbl(phoneInvalid)}>{t("cart.fields.phone")}</span>
                                <input value={formData.customerPhone} onChange={e => setFormData({ ...formData, customerPhone: e.target.value })} type="tel" inputMode="tel" autoComplete="tel" className={inputCls} style={inputStyle} placeholder="070 000 00 00" />
                              </div>
                              {phoneInvalid && <p className="px-4 pb-2 text-[12px] font-medium" style={{ color: "#C0392B" }}>{t("cart.errors.phoneTooShort")}</p>}
                            </div>
                          );
                        })()}

                        {orderType === "PICKUP" && (
                          <div className="rounded-xl border px-4 py-3 flex gap-3" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)" }}>
                            <Store size={17} className="shrink-0 mt-0.5" style={{ color: "var(--gold-ink)" }} />
                            <div className="min-w-0">
                              <p className="text-[13.5px] font-semibold" style={{ color: "var(--text-primary)" }}>Avhämtning vald</p>
                              <p className="text-[12px] leading-snug mt-0.5" style={{ color: "var(--text-secondary)" }}>
                                Du betalar här och hämtar ordern hos restaurangen när den är klar.
                              </p>
                            </div>
                          </div>
                        )}

                        {/* ── Mobile only: extras (desktop shows these in left column) ── */}
                        <div className="lg:hidden space-y-4">
                        {renderCartExtras("mb")}

                     {/* BOGO: påminn om gratisprodukt(er) om fler kan väljas.
                         För scaled-BOGO (maxFreeItems > 1): visar antal kvar.
                         "Välj N fler gratis varor" istället för bara "Välj". */}
                     {bogoPreview && bogoPicksRemaining > 0 && bogoPreview.rewardProducts.length > 0 && (
                       <motion.button
                         type="button"
                         initial={{ opacity: 0, y: 6 }}
                         animate={{ opacity: 1, y: 0 }}
                         onClick={() => setShowBogoPicker(true)}
                         className="mt-6 w-full rounded-2xl border px-4 py-3.5 text-left transition-all hover:brightness-[0.99] active:scale-[0.99]"
                         style={{
                           background: "var(--gold-soft)",
                           borderColor: "rgba(240,83,28,0.22)",
                         }}
                       >
                         <div className="flex items-center justify-between gap-2">
                           <div className="flex items-center gap-3 min-w-0">
                             <span
                               className="shrink-0 w-9 h-9 rounded-xl grid place-items-center"
                               style={{ backgroundColor: "rgba(240,83,28,0.16)" }}
                             >
                               <Gift size={17} strokeWidth={2.3} style={{ color: "var(--gold-ink)" }} />
                             </span>
                             <div className="min-w-0">
                               <p className="text-[12.5px] font-semibold" style={{ color: "var(--gold-ink)" }}>
                                 {bogoPickedCount > 0
                                   ? (bogoPicksRemaining === 1
                                       ? t("cart.bogo.pickMoreOne")
                                       : t("cart.bogo.pickMoreMany", { count: bogoPicksRemaining }))
                                   : t("cart.bogo.pickFree")}
                               </p>
                               <p className="text-xs font-bold mt-0.5 line-clamp-1" style={{ color: "var(--text-secondary)" }}>
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
                           <span
                             className="shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-semibold"
                             style={{ backgroundColor: "var(--text-primary)", color: "var(--bg-primary)" }}
                           >
                             {t("cart.bogo.choose")} <ArrowRight size={12} strokeWidth={3} />
                           </span>
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
                               <p className="text-[13px] font-medium text-emerald-400">
                                 {bogoMaxFreeItems === 1 ? t("cart.bogo.pickedOne") : t("cart.bogo.pickedMany", { count: bogoPickedCount })}
                               </p>
                               <p className="text-xs font-bold mt-0.5" style={{ color: "var(--text-secondary)" }}>
                                 {bogoPreview.dealTitle}
                               </p>
                             </div>
                           </div>
                           {/* Byt gratis-vara: ta bort nuvarande val → picker öppnas igen */}
                           <button
                             type="button"
                             onClick={() => {
                               items
                                 .filter((i) => i.bogoFreeFromDealId === bogoPreview.dealId)
                                 .forEach((i) => removeItem(i.cartItemId));
                               setShowBogoPicker(true);
                             }}
                             className="shrink-0 rounded-full border border-emerald-500/30 px-3 py-1.5 text-[13px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/10"
                           >
                             {t("cart.bogo.swap")}
                           </button>
                         </div>
                       </motion.div>
                     )}

                     {/* Deal tröskel-nudge — visas diskret om man är nära en deal */}
                     {dealNudge && (
                       <motion.div
                         initial={{ opacity: 0, y: 6 }}
                         animate={{ opacity: 1, y: 0 }}
                         className="mt-6 rounded-2xl border px-4 py-3"
                         style={{ background: "var(--bg-deep)", borderColor: "var(--border-muted)" }}
                       >
                         <div className="flex items-center justify-between gap-2 mb-2">
                           <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                             {t("cart.dealNudge.remaining", { amount: dealNudge.missing.toFixed(0), reward: formatDealReward(dealNudge.deal) })}
                           </p>
                           <Tag size={12} className="shrink-0" style={{ color: "var(--text-secondary)" }} />
                         </div>
                         <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "var(--border-muted)" }}>
                           <motion.div
                             className="h-full rounded-full"
                             style={{ backgroundColor: "var(--text-primary)" }}
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
                     {renderMinOrderBanner("mt-6")}

                     <div className="mt-6 pt-5 space-y-3" style={{ borderTop: "1px solid var(--border-muted)" }}>
                        <div className="flex justify-between text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}><span>{t("cart.summary.subtotal")}</span><span>{subtotal.toFixed(0)} {t("common.sek")}</span></div>
                        {orderType === 'DELIVERY' && (
                          <div className="flex justify-between text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                            <span>{t("cart.summary.deliveryFee")}</span>
                            <span style={{ color: "var(--text-primary)" }}>
                              {addressZoneStatus === "checking" ? t("cart.summary.deliveryCalculating") : `${deliveryFee.toFixed(0)} ${t("common.sek")}`}
                            </span>
                          </div>
                        )}
                        {effectiveTip > 0 && <div className="flex justify-between text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}><span>{t("cart.summary.tip")}</span><span style={{ color: "var(--text-primary)" }}>+{effectiveTip.toFixed(0)} {t("common.sek")}</span></div>}
                        {minOrderTopUp > 0 && <div className="flex justify-between text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}><span>{t("cart.summary.minOrderTopUp")}</span><span style={{ color: "var(--text-primary)" }}>+{minOrderTopUp.toFixed(0)} {t("common.sek")}</span></div>}
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
                              <div className="flex justify-between text-[13px] font-semibold text-emerald-600">
                                <span>{t("cart.summary.coupon", { code: selectedPersonalDeal.code })}</span>
                                <span>-{personalDiscount.toFixed(0)} {t("common.sek")}</span>
                              </div>
                            );
                          }
                          if (selectedAccountDealId) {
                            if (accountDealDiscount <= 0) return null;
                            return (
                              <div className="flex justify-between text-[13px] font-semibold text-emerald-600">
                                <span>{selectedAccountDeal ? dealTypeLabel(selectedAccountDeal.type, t) : t("cart.summary.reward")}</span>
                                <span>-{accountDealDiscount.toFixed(0)} {t("common.sek")}</span>
                              </div>
                            );
                          }
                          // Auto-källor (bara om inga user-val ovan)
                          // Välkomsterbjudandet visas först om det är den största
                          // auto-rabatten (= det som faktiskt dras på totalen).
                          if (
                            !automaticDealDismissed &&
                            welcomeDiscount > 0 &&
                            welcomeDiscount >= automaticDeal.discountAmount &&
                            welcomeDiscount >= bogoDiscount
                          ) {
                            return (
                              <div className="flex justify-between text-[13px] font-semibold text-emerald-600">
                                <span>{welcomeOffer?.title}</span>
                                <span>-{welcomeDiscount.toFixed(0)} {t("common.sek")}</span>
                              </div>
                            );
                          }
                          // Pick-reward visas INTE som rabattrad: gratis-varan
                          // ligger redan som "Gratis"-rad i artikellistan, och
                          // totalen subtraherar inte (skulle annars visa -95 mot
                          // en oförändrad total). Pure-discount + samma-kategori
                          // (rabatt faktiskt avdragen) visas däremot.
                          if (!automaticDealDismissed && bogoPreview && !bogoPreview.isPickReward && bogoDiscount > 0) {
                            return (
                              <div className="flex justify-between text-[13px] font-semibold text-emerald-600">
                                <span>{bogoIsPureDiscount ? "" : "🎁 "}{bogoChoice && !bogoIsPureDiscount ? bogoChoice.product.name : bogoPreview.dealTitle}</span>
                                <span>-{bogoDiscount.toFixed(0)} {t("common.sek")}</span>
                              </div>
                            );
                          }
                          if (!automaticDealDismissed && automaticDeal.deal && automaticDeal.discountAmount > 0) {
                            return (
                              <div className="flex justify-between text-[13px] font-semibold text-emerald-600">
                                <span>{automaticDeal.deal.title}</span>
                                <span>-{automaticDeal.discountAmount.toFixed(0)} {t("common.sek")}</span>
                              </div>
                            );
                          }
                          return null;
                        })()}
                        {typeof vatPercent === "number" && (
                          <div className="flex justify-between text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                            <span>{t("cart.summary.vat", { percent: vatPercent })}</span>
                            <span>{vatAmount.toFixed(0)} {t("common.sek")}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center mt-6">
                           <span className="text-[16px] font-bold" style={{ color: "var(--text-primary)" }}>{t("cart.summary.total")}</span>
                           <span className="text-[22px] font-bold tracking-tight leading-none" style={{ color: "var(--gold-ink)", fontVariantNumeric: "tabular-nums" }}>{total.toFixed(0)} <span className="text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>{t("common.sek")}</span></span>
                        </div>
                     </div>

                      {/* Guest info banner — not blocking, just informative */}
                      {!user && (
                        <div className="mt-8 p-4 rounded-2xl border flex items-center gap-3" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)" }}>
                          <UserIcon size={16} className="text-zinc-400 shrink-0" />
                          <p className="text-[10px] font-bold leading-snug flex-1" style={{ color: "var(--text-secondary)" }}>
                            {embedMode ? "Du beställer som gäst – inget konto behövs." : <>{t("cart.guest.banner")}{" "}
                              <Link href="/profile" className="underline hover:opacity-70" style={{ color: "var(--text-primary)" }}>{t("cart.guest.loginLink")}</Link>{" "}
                              {t("cart.guest.bannerSuffix")}</>}
                          </p>
                        </div>
                     )}
                        </div>{/* end lg:hidden mobile-only extras */}
                     </div>{/* end space-y-8 */}

                     {/* Mobile: checkout (desktop has this in left column) */}
                     <div className="lg:hidden">
                       {error && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8 p-5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[13.5px] font-medium text-center leading-snug">{error}</motion.div>}

                       {/* Sticky på mobil: knappen följer med ovanför bottennaven
                           tills man scrollat ner till dess naturliga plats —
                           kunden behöver aldrig leta efter "Slutför köp". */}
                       <div
                          className="sticky z-[90] mt-8"
                          style={{ bottom: "max(calc(env(safe-area-inset-bottom, 0px) + 64px), 86px)" }}
                       >
                       <button
                          onClick={startCheckout}
                          disabled={
                            loading
                            || bogoMustPick
                            || (!isTestFlow && activeDealBelowMinimum)
                            || (!isTestFlow && Math.max(0, subtotal - foodDiscountComponent) < effectiveMinOrder && !topUpToMinimum)
                            || (!isTestFlow && !restaurantSettings.isOpen)
                            || (!isTestFlow && addressZoneStatus === "error")
                            || (!isTestFlow && addressZoneStatus === "checking")
                          }
                          className="w-full h-[52px] px-5 bg-gold-500 rounded-xl text-[15.5px] font-semibold active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-3 group" style={{ color: "#FFFFFF" }}
                       >
                          {loading
                            ? <Loader2 className="animate-spin" size={24} />
                            : bogoMustPick
                              ? t("cart.bogo.mustPick")
                              : addressZoneStatus === "checking"
                                ? <><Loader2 className="animate-spin" size={20} /> {t("cart.submit.checking")}</>
                                : (Math.max(0, subtotal - foodDiscountComponent) < effectiveMinOrder && !topUpToMinimum)
                                  ? t("cart.submit.short", { amount: Math.ceil(effectiveMinOrder - Math.max(0, subtotal - foodDiscountComponent)) })
                                  : addressZoneStatus === "error"
                                    ? t("cart.submit.zoneError")
                                    : <span className="w-full flex items-center justify-between gap-3">
                                <span className="flex items-center gap-2">{t("cart.submit")} <ArrowRight size={18} className="group-hover:translate-x-1.5 transition-transform" /></span>
                                <span style={{ fontVariantNumeric: "tabular-nums" }}>{total.toFixed(0)} {t("common.sek")}</span>
                              </span>}
                       </button>
                       </div>
                     </div>
                 </motion.div>
               )}
             </AnimatePresence>
          </div>
        </div>
      </div>

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
