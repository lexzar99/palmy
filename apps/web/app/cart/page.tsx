"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import axios from "axios";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
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
  ChevronRight,
  Bike,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { ensureKioskAccess } from "@/lib/kioskAccessClient";
import { EMBED_PARENT_ORIGIN_PARAM, partnerOriginForRestaurant, readEmbedParentOrigin, trustedPartnerOrigin } from "@/lib/embedPartner";
import { checkDeliveryStreet, isDeliverableStreet } from "@/lib/deliveryAddress";
import { useCartStore } from "@/store/cartStore";
import { trackJourney } from "@/lib/journey";
import { orderAttributionContext } from "@/lib/orderAttribution";
import BogoPickerModal from "@/components/BogoPickerModal";
import { rememberActiveOrder } from "@/lib/activeOrder";
import { trackMetaInitiateCheckout } from "@/lib/metaEvents";
// Betalning sker via ett provider-neutralt checkout-flöde med exakt två val:
// direkt Swish (native app-hopp/QR) och EN hosted Stripe Checkout-sida som
// visar hela uppsättningen — Apple Pay, Klarna, kort och Google Pay — på
// Stripes egen, alltid domänverifierade, betalsida.
import ProductSheet from "@/components/restaurant/ProductSheet";
import PlainImage from "@/components/restaurant/PlainImage";
import { useDesignBackground } from "@/components/restaurant/useDesignBackground";
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
import { PublicDeal, pickBestDeal } from "@/lib/deals";
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
import { formatCheckoutSek as formatSekAmount } from "@/lib/checkoutMoney";
import {
  SWISH_POLLING_POLICY,
  classifyAbandonResponse,
  classifyPaymentStatus,
  clearPendingPaymentMetadata,
  isHandheldPaymentDevice,
  readPendingPaymentProvider,
  readPersistedSwishCheckout,
  swishBackoffDelayMs,
  writePendingPaymentProvider,
  writePersistedSwishCheckout,
  type AbandonOutcome,
} from "@/lib/swishCheckoutRecovery";

const TEST_ORDERS_ENABLED =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_ALLOW_TEST_ORDERS === "true";

const CHECKOUT_ATTEMPT_KEY = "viaeats.checkout.attempt.v1";
// Versionsnycklarna ingår i fingerprinten så en gammal pi_ aldrig återanvänds
// som cs_ (eller tvärtom) när kunden byter checkout-upplevelse.
const STRIPE_HOSTED_FLOW_VERSION = "stripe-hosted-v1";
const STRIPE_DEFERRED_FLOW_VERSION = "stripe-elements-deferred-v2";

type CheckoutAttempt = { key: string; fingerprint: string };
type HostedPaymentContext = {
  passive?: boolean;
  provider?: CheckoutPaymentProvider;
  embedded?: boolean;
  restaurantSlug?: string;
  parentOrigin?: string | null;
  pollAttempts?: number;
  initialPollDelayMs?: number;
  pollBackoffBaseMs?: number;
  pollMaxDelayMs?: number;
  pollJitterRatio?: number;
};

type CheckoutPaymentProvider = "mollie" | "swish" | "stripe" | "adyen";
type StripeCheckoutMethod = "klarna" | "apple_pay" | "google_pay" | "card";
// "stripe_all" = den samlade hosted-sidan; backend får ingen checkoutMethod
// och skapar EN Checkout-session med alla konfigurerade metoder.
type CheckoutMethod = "swish" | "stripe_all" | StripeCheckoutMethod;
type CheckoutExperience = "hosted" | "embedded";
type StartCheckoutOptions = { checkoutExperience?: CheckoutExperience };
type PreparedStripePayment =
  | { status: "prepared"; orderId: string; clientSecret: string; returnUrl: string }
  | { status: "paid"; orderId: string };

// Hur många gånger ett avbrott får försöka bekräftas hos providern innan
// kassan lämnar tillbaka kontrollen till kunden. 1+2+4 s ≈ 7 s väntan, sedan
// ett tydligt besked i stället för en spinner som aldrig tar slut.
const MAX_PAYMENT_CANCEL_ATTEMPTS = 4;

function checkoutPaymentProvider(value: unknown): CheckoutPaymentProvider | null {
  const provider = String(value || "").toLowerCase();
  return ["mollie", "swish", "stripe", "adyen"].includes(provider)
    ? provider as CheckoutPaymentProvider
    : null;
}

function hostedPaymentContext(
  provider: CheckoutPaymentProvider | null,
  context: HostedPaymentContext = {},
): HostedPaymentContext {
  if (provider !== "swish") return { ...context, provider: provider || context.provider };
  return {
    ...context,
    provider: "swish",
    ...SWISH_POLLING_POLICY,
  };
}

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
    else if (deal.amountKr && deal.amountKr > 0) parts.push(`${formatSekAmount(deal.amountKr)} ${t("common.kr")}`);
  }
  if (deal.freeDelivery || isLegacyFreeDel) parts.push(t("cart.dealLabel.freeDelivery"));
  return parts.length > 0 ? parts.join(" + ") : t("cart.dealLabel.fallback");
}

function formatCartDealReward(deal: PublicDeal): string {
  return deal.discountType === "FIXED"
    ? `${formatSekAmount(deal.discountValue)} kr rabatt`
    : `${deal.discountValue.toFixed(0)}% rabatt`;
}

function dealTypeLabel(type: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  if (type === "WELCOME") return t("cart.dealType.welcome");
  if (type === "REFERRAL_INVITER") return t("cart.dealType.referralInviter");
  if (type === "REFERRAL_INVITEE") return t("cart.dealType.referralInvitee");
  return t("cart.dealType.fallback");
}

// Checkouten är provider-neutral. Backend väljer och verifierar den faktiska
// providern; klienten markerar aldrig en order som betald.

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
    <div style={{ boxShadow: first ? undefined : "inset 0 0.5px 0 var(--ve-line)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="ve-row-press w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-3 min-w-0">
          {icon}
          <span className="text-[16px] font-medium" style={{ color: "var(--ve-ink)", letterSpacing: "-0.01em" }}>{label}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {hint && <span className="ve-tabular text-[14px] truncate max-w-[160px]" style={{ color: "var(--ve-ink-3)" }}>{hint}</span>}
          <ChevronDown size={17} strokeWidth={2.2} className="transition-transform duration-200" style={{ color: "var(--ve-ink-3)", transform: open ? "rotate(180deg)" : "none" }} />
        </span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

/**
 * Rekommenderade tillägg i kassan. Identisk logik med Swift-appen: bara varor
 * under 70 kr, tre prisspann (>=45, 25-45, <25), bilder först inom varje spann
 * och därefter varvat mellan spannen så listan aldrig blir en prisstege.
 */
const CART_RECOMMENDATION_MAX_PRICE = 70;
const CART_DRINK_KEYWORDS = ["dryck", "läsk", "cola", "fanta", "sprite", "vatten", "juice", "ramlösa", "loka", "zero", "champis", "trocadero"];

type CartMenuProduct = {
  id: string;
  name: string;
  price: number;
  imageUrl?: string | null;
  discountPrice?: number | null;
  discountPercent?: number | null;
};

function recommendationPrice(product: CartMenuProduct): number {
  const price = Number(product?.price) || 0;
  const discountPrice = Number(product?.discountPrice) || 0;
  if (discountPrice > 0 && discountPrice < price) return discountPrice;
  const discountPercent = Number(product?.discountPercent) || 0;
  if (discountPercent > 0) return Math.max(0, Math.round(price * (1 - discountPercent / 100)));
  return price;
}

function shuffledProducts(products: CartMenuProduct[]): CartMenuProduct[] {
  const list = [...products];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function prioritizedRecommendationBucket(products: CartMenuProduct[]): CartMenuProduct[] {
  const hasImage = (product: CartMenuProduct) => String(product?.imageUrl || "").trim().length > 0;
  return [
    ...shuffledProducts(products.filter(hasImage)),
    ...shuffledProducts(products.filter((product) => !hasImage(product))),
  ];
}

function cartRecommendations(products: CartMenuProduct[]): CartMenuProduct[] {
  const seen = new Set<string>();
  const eligible = products.filter((product) => {
    const price = recommendationPrice(product);
    if (!(price > 0 && price < CART_RECOMMENDATION_MAX_PRICE)) return false;
    if (!product?.id || seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });
  const buckets = [
    prioritizedRecommendationBucket(eligible.filter((product) => recommendationPrice(product) >= 45)),
    prioritizedRecommendationBucket(eligible.filter((product) => {
      const price = recommendationPrice(product);
      return price >= 25 && price < 45;
    })),
    prioritizedRecommendationBucket(eligible.filter((product) => recommendationPrice(product) < 25)),
  ];
  const ordered: CartMenuProduct[] = [];
  while (buckets.some((bucket) => bucket.length > 0)) {
    for (const bucket of buckets) {
      const next = bucket.shift();
      if (next) ordered.push(next);
    }
  }
  return ordered;
}

function containsDrink(name: string): boolean {
  const lowered = name.toLowerCase();
  return CART_DRINK_KEYWORDS.some((keyword) => lowered.includes(keyword));
}

export default function CartPage() {
  const { t } = useTranslation();
  const { items, removeItem, updateQuantity, updateItem, getTotal, clearCart, restaurantId: cartRestaurantId, restaurantSlug: cartRestaurantSlug } = useCartStore();
  // Namnet på restaurangen man beställer från — visas högst upp i kassan.
  const [cartRestaurantName, setCartRestaurantName] = useState<string | null>(null);
  // Avhämtning måste säga var maten hämtas — annars vet kunden bara att den
  // inte levereras.
  const [cartRestaurantAddress, setCartRestaurantAddress] = useState<string | null>(null);
  const router = useRouter();
  // Designsystemets grå yta ska nå ända ut i overscroll/safe-area (docs/DESIGN_SYSTEM.md).
  useDesignBackground();
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

  // /api/menu/products/:id saknar menyrabattfälten (discountActive/-Price/
  // -Percent). Utan dem skulle produktarket visa och spara ORDINARIE pris för
  // en rabatterad vara. Vi lägger tillbaka rabatten från menylistan (färskast)
  // eller, vid redigering, från raden i varukorgen.
  const menuProductsRef = useRef<CartMenuProduct[]>([]);
  const withCatalogDiscount = useCallback((product: any, knownPrice?: number | null) => {
    if (!product || typeof product.price !== "number") return product;
    const fromMenu = menuProductsRef.current.find((entry) => entry.id === product.id);
    const menuDiscountPrice = typeof fromMenu?.discountPrice === "number" && fromMenu.discountPrice > 0 && fromMenu.discountPrice < product.price ? fromMenu.discountPrice : null;
    const menuDiscountPercent = typeof fromMenu?.discountPercent === "number" && fromMenu.discountPercent > 0 ? fromMenu.discountPercent : null;
    if (menuDiscountPrice != null || menuDiscountPercent != null) {
      return { ...product, discountActive: true, discountPrice: menuDiscountPrice ?? undefined, discountPercent: menuDiscountPercent ?? undefined };
    }
    if (typeof knownPrice === "number" && knownPrice > 0 && knownPrice < product.price) {
      return { ...product, discountActive: true, discountPrice: knownPrice };
    }
    return product;
  }, []);

  /**
   * Öppnar befintlig ProductModal för redigering av en cart-rad. Hämtar produkten
   * med extras-grupper från API:et så användaren kan ändra val direkt från kassan.
   */
  // Går via same-origin-proxyn (/api/platform) precis som rekommendationsraden:
  // fungerar identiskt på localhost, viaeats.se och i partnerns iframe, utan
  // att bero på API:ts CORS-lista. Fel loggas så ett stängt ark inte blir tyst.
  const handleEditCartItem = useCallback(async (item: any) => {
    try {
      const res = await axios.get(`/api/platform/menu/products/${item.productId}`);
      const knownPrice = item.catalogDiscountApplied && typeof item.originalPrice === "number" && item.originalPrice > item.price ? item.price : null;
      setEditingCartItem({ product: withCatalogDiscount(res.data, knownPrice), item });
    } catch (err) {
      console.error("Kunde inte öppna produkten för redigering:", err);
    }
  }, [withCatalogDiscount]);

  // Rekommenderad vara öppnas i samma produktmodal som menyn använder, så
  // tillvalsgrupper och priser blir identiska med restaurangsidan.
  // En produktbild som 404:ar renderas annars som webbläsarens trasig-bild-
  // symbol (ett frågetecken på iOS). Tom yta är rätt fallback i kassan.
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
  const [addingProduct, setAddingProduct] = useState<any>(null);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const handleAddRecommended = useCallback(async (productId: string) => {
    setAddingProductId(productId);
    try {
      const res = await axios.get(`/api/platform/menu/products/${productId}`);
      setAddingProduct(withCatalogDiscount(res.data));
    } catch (err) {
      console.error("Kunde inte öppna rekommenderad produkt:", err);
    } finally {
      setAddingProductId(null);
    }
  }, [withCatalogDiscount]);

  // Menyn hämtas bara för rekommendationsraden i kassan. Samma normaliserade
  // payload som restaurangsidan använder, så inga extra fält behövs.
  const [menuProducts, setMenuProducts] = useState<CartMenuProduct[]>([]);
  useEffect(() => {
    if (!cartRestaurantSlug) {
      setMenuProducts([]);
      return;
    }
    let cancelled = false;
    axios
      .get(`/api/platform/menu/categories`, {
        params: {
          slug: cartRestaurantSlug,
          format: "normalized",
          ...(embedMode ? { channel: "partner_embed" } : {}),
        },
      })
      .then((res) => {
        if (cancelled) return;
        const categories = Array.isArray(res.data?.categories) ? res.data.categories : [];
        const flat = categories.flatMap((category: any) => (Array.isArray(category?.products) ? category.products : []));
        menuProductsRef.current = flat;
        setMenuProducts(flat);
      })
      .catch(() => {
        if (!cancelled) setMenuProducts([]);
      });
    return () => { cancelled = true; };
  }, [cartRestaurantSlug, embedMode]);

  // Ordningen slumpas en gång per meny — inte per render, annars skulle raden
  // hoppa runt varje gång kassan uppdateras.
  const recommendedProducts = useMemo(() => cartRecommendations(menuProducts).slice(0, 12), [menuProducts]);

  const [user, setUser] = useState<any>(null);
  const [profilePhone, setProfilePhone] = useState("");
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
  // Säker fallback för äldre partner-embedder: om föräldrasidan ännu inte
  // lyssnar på viaeats:open-payment får kunden en riktig target=_top-länk.
  // Ett användarklick på länken får lämna en cross-origin iframe, till skillnad
  // från en script-navigation efter asynkrona API-anrop.
  const [hostedCheckoutUrl, setHostedCheckoutUrl] = useState<string | null>(null);
  const [swishCheckout, setSwishCheckout] = useState<{
    orderId: string;
    appUrl: string;
    qrCode: string;
  } | null>(null);
  const [availablePaymentProviders, setAvailablePaymentProviders] = useState<CheckoutPaymentProvider[]>([]);
  const [stripePublishableKey, setStripePublishableKey] = useState("");
  const [paymentProvidersLoaded, setPaymentProvidersLoaded] = useState(false);
  const [paymentStepOpen, setPaymentStepOpen] = useState(false);
  const [selectedCheckoutMethod, setSelectedCheckoutMethod] = useState<CheckoutMethod | null>(null);
  // En inbäddad Stripe-order skapas först efter att wallet eller kortfält har
  // validerats. Håll den separat så Elements förblir monterat medan vi
  // skapar/bekräftar PaymentIntenten.
  const [embeddedStripeOrderId, setEmbeddedStripeOrderId] = useState<string | null>(null);
  const [embeddedStripeProcessing, setEmbeddedStripeProcessing] = useState(false);
  // ?paydebug=1 visar en diagnosrad i betalsteget — svarar på "varför syns
  // inte knappen?" utan devtools. Läses efter mount (SSR saknar query).
  const [payDebug, setPayDebug] = useState(false);
  useEffect(() => {
    try {
      setPayDebug(new URLSearchParams(window.location.search).get("paydebug") === "1");
    } catch { /* noop */ }
  }, []);
  // Sätts först efter mount — user agent finns inte vid SSR och skulle annars
  // ge hydration mismatch.
  const [isHandheld, setIsHandheld] = useState(false);
  useEffect(() => {
    setIsHandheld(isHandheldPaymentDevice({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
    }));
  }, []);
  // M-commerce: token-länken öppnar Swish-appen med belopp och mottagare redan
  // ifyllt. Kunden ska aldrig behöva knappa in ett Swish-nummer, så på mobil
  // hoppar vi direkt till appen i stället för att visa en QR-kod som ändå inte
  // går att skanna med samma telefon.
  //
  // I partner-embedden körs kassan i en cross-origin iframe, och browsern
  // blockerar tyst all navigation till ett custom-schema därifrån — både
  // location.href och en vanlig <a href="swish://">. Appen öppnas därför i två
  // spår: partnersidan (top-level) gör app-hoppet åt oss via postMessage, och
  // kundens egen knapp riktas mot _top så klicket blir en riktig
  // top-navigation med användaraktivering.
  const openSwishApp = useCallback((appUrl: string) => {
    if (typeof window === "undefined") return;
    if (window.parent !== window) {
      // Länken bär en engångskapabilitet i callbackurl. Den får bara skickas
      // till ett verifierat partner-origin, aldrig till "*". Samma fallback
      // som order-/tracking-vyerna: en rensad sessionStorage ska inte tysta
      // app-hoppet när restaurangen har en känd partnersida.
      const parentOrigin = readEmbedParentOrigin()
        || partnerOriginForRestaurant(embedRestaurantSlug);
      if (parentOrigin) {
        window.parent.postMessage({ type: "viaeats:open-swish", swishUrl: appUrl }, parentOrigin);
      }
      return;
    }
    window.location.href = appUrl;
  }, [embedRestaurantSlug]);
  const swishAutoOpenedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!swishCheckout || !isHandheld) return;
    if (swishAutoOpenedRef.current === swishCheckout.orderId) return;
    swishAutoOpenedRef.current = swishCheckout.orderId;
    openSwishApp(swishCheckout.appUrl);
  }, [swishCheckout, isHandheld, openSwishApp]);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  // True när kunden återvänt från en betalprovider och vi verifierar status.
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [cancellingPayment, setCancellingPayment] = useState(false);
  // Varje poll-loop äger en generation. Ny checkout, explicit avbryt eller
  // unmount invaliderar äldre loopar så ett sovande/avslutat anrop aldrig kan
  // skriva stale state eller navigera efteråt.
  const paymentPollGenerationRef = useRef(0);
  const paymentCancelRetryRef = useRef<{ orderId: string; attempt: number }>({ orderId: "", attempt: 0 });
  useEffect(() => () => { paymentPollGenerationRef.current += 1; }, []);
  const idempotencyKey = useRef<string>("");
  useEffect(() => {
    let active = true;
    axios.get(`/api/platform/payments/methods`)
      .then((response) => {
        if (!active) return;
        const providers = (Array.isArray(response.data?.methods) ? response.data.methods : [])
          .map((method: any) => String(method?.id || "").toLowerCase())
          .filter((id: string): id is CheckoutPaymentProvider =>
            id === "mollie" || id === "swish" || id === "stripe" || id === "adyen");
        if (providers.length > 0) {
          setAvailablePaymentProviders(providers);
        }
        const publishableKey = String(response.data?.stripePublishableKey || "").trim();
        if (/^pk_(?:live|test)_[A-Za-z0-9]+$/.test(publishableKey)) {
          setStripePublishableKey(publishableKey);
        }
      })
      .catch(() => { /* fail closed: visa inga metoder utan serverbesked */ })
      .finally(() => {
        if (active) setPaymentProvidersLoaded(true);
      });
    return () => { active = false; };
  }, []);
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
    if (!embedMode) return;
    setAccountDeals([]);
    setSelectedAccountDealId(null);
    setAppDealQuote(null);
  }, [embedMode]);
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
  // utifrån audience + första-N-order (per telefon) + verifierad profil.
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
            const r = await axios.get(`/api/platform/menu/products/${pid}`);
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
    // Ett förslag som inte är en gatuadress (postnummer, ort, stadsdel) får
    // inte bli kundens leveransadress — säg till direkt i stället för att
    // låta kassan stoppa den först vid betalning.
    const streetCheck = checkDeliveryStreet(street);
    if (!streetCheck.ok) {
      setFormData(prev => ({ ...prev, deliveryStreet: "", deliveryZip: "", deliveryCity: "" }));
      setError(streetCheck.message);
      setAddressLoading(false);
      return;
    }
    setError(null);
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
      axios.get(`/api/platform/menu/products/${item.productId}`)
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

    // Underlaget koden får bita på. excludeDiscountedItems → bara varor som
    // inte redan är nedsatta (samma regel som POST /api/orders). minOrder
    // mäts fortfarande mot hela subtotalen: tröskeln gäller vad kunden
    // handlar för, inte vad kupongen får bita på.
    const codeBase = campaign.excludeDiscountedItems ? discountableSubtotal : subtotal;

    // Bas-rabatt: procent eller fast belopp.
    let amount = 0;
    if (campaign.discountType === "PERCENTAGE") {
      amount = (codeBase * campaign.discountValue) / 100;
    } else if (campaign.discountType === "FREE_DELIVERY") {
      // Standalone fri-leverans-kupong: rabatten = deliveryFee.
      amount = deliveryFee;
    } else {
      amount = Math.min(campaign.discountValue, codeBase);
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
  }, [selectedPersonalDeal, subtotal, discountableSubtotal, deliveryFee]);
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
        axios.get(`${API_URL}/api/deals`, {
          params: {
            ...(currentRestaurantId ? { restaurantId: currentRestaurantId } : {}),
            ...(embedMode ? { channel: "partner_embed" } : {}),
          },
        }).catch(() => ({ data: [] })),
        axios.get(`/api/platform/profile`).catch(() => ({ data: null })),
        embedMode ? Promise.resolve({ data: [] }) : axios.get(`/api/platform/profile/deals`).catch(() => ({ data: [] })),
        currentRestaurantId ? axios.get(`${API_URL}/api/restaurants/${currentRestaurantId}`).catch(() => ({ data: null })) : Promise.resolve({ data: null }),
        embedMode ? Promise.resolve({ data: { deals: [] as UserAccountDeal[] } }) : axios.get<{ deals: UserAccountDeal[] }>(`/api/platform/account/deals`).catch(() => ({ data: { deals: [] } })),
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
        setCartRestaurantAddress((() => {
          const street = String(restaurantRes.data.address || "").trim();
          if (!street) return null;
          // Adressfältet innehåller ofta redan ort ("Kiliansgatan 14, Lund,
          // Sverige"). Lägg bara till ort/postnummer när de faktiskt saknas.
          const city = String(restaurantRes.data.city || "").trim();
          const zip = String(restaurantRes.data.zipCode || restaurantRes.data.postalCode || "").trim();
          const hasCity = city && street.toLowerCase().includes(city.toLowerCase());
          const tail = [zip, hasCity ? "" : city].filter(Boolean).join(" ").trim();
          return tail ? `${street}, ${tail}` : street;
        })());
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
      setPersonalDeals(embedMode ? [] : (pDealsRes.data || []));

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
      setAccountDeals((current) => embedMode ? [] : (acctDeals.length > 0 ? acctDeals : current));

      if (userRes.data) {
        setUser(userRes.data);
        setProfilePhone(userRes.data.phone || "");
        setFormData((prev) => ({
          ...prev,
          customerName: userRes.data.name || prev.customerName,
          customerPhone: userRes.data.phone || prev.customerPhone,
          // Email pre-fyllt från verifierad profil om det finns (krävs av Klarna m.fl. server-
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
  }, [currentRestaurantId, embedMode]);

  // Vänkods-fallback (Swift-paritet, CartView.applyCode): körs när rabatt-
  // koden inte gäller. POST /api/account/redeem-code skapar REFERRAL_INVITEE-
  // UserDeal direkt; svaret innehåller userDealId som appliceras i kassan.
  // Returnerar true om koden hanterades (succé ELLER eget servermeddelande)
  // så det generiska rabattkodsfelet döljs.
  const tryRedeemReferral = async (code: string): Promise<boolean> => {
    if (!code) return false;
    if (embedMode) {
      setError(null);
      setReferralMessage({ ok: false, text: "Vänkoder gäller när du beställer på viaeats.se eller i appen." });
      return true;
    }
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
      const res = await axios.post(`/api/platform/discount/validate`, {
        code: promoCodeInput.trim(),
        subtotal,
        discountableSubtotal,
      });
      if (res.status >= 200 && res.status < 300) {
        const data = res.data;
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
            // true = koden biter bara på varor som inte redan är nedsatta.
            // Sparas så rabatten räknas om på rätt underlag när kunden ändrar
            // i korgen efter att koden applicerats.
            excludeDiscountedItems: Boolean(data.excludeDiscountedItems),
          }
        });
        setSelectedAccountDealId(null);
      }
    } catch (error: any) {
      if (embedMode) {
        setError(error?.response?.data?.error || t("cart.errors.invalidPromo"));
        return;
      }
      const handled = await tryRedeemReferral(promoCodeInput.trim());
      if (!handled) setError(error?.response?.data?.error || t("cart.errors.invalidPromo"));
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

  // Kundresan: kassan är öppnad. Skiljer "övergav varukorgen" från "kom till
  // kassan och backade" — två helt olika problem att laga.
  useEffect(() => {
    trackJourney("CART_OPENED", { restaurantId: currentRestaurantId });
    // Endast vid mount: en omrendering är inte ett nytt besök i kassan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          ...(embedMode ? { channel: "partner_embed" } : {}),
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
  }, [items, currentRestaurantId, setBogoChoice, t, hasCatalogDiscountedItems, embedMode]);

  // Välkomsterbjudande — hämta server-side beräknat erbjudande för kassan.
  // subtotal + telefon (för första-N-order) + verifieringsstatus skickas med så
  // backend kan avgöra eligibility. Debounce så telefon-typning inte hammrar.
  useEffect(() => {
    if (embedMode) { setWelcomeOffer(null); return; }
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
  }, [discountableSubtotal, formData.customerPhone, user, hasCatalogDiscountedItems, embedMode]);

  // Auto-dismiss BOGO-lost-notice efter 8s så banner inte hänger kvar
  // permanent på sidan.
  useEffect(() => {
    if (!bogoLostNotice) return;
    const timer = setTimeout(() => setBogoLostNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [bogoLostNotice]);

  // Hosted checkout recovery. Redirect till /cart är INTE bevis på betalning:
  // En betalprovider kan returnera hit innan webhooken hunnit fram. Återuppta även en
  // persisterad pending-order när kunden öppnar /cart igen efter en stängd flik.
  // Bara serverstatus PAID får tömma carten och gå till tracking.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const returnParam = params.get("payment_return");
    const returnOrderId = returnParam || localStorage.getItem("pending_order_id");
    if (!returnOrderId) return;
    const paymentResumeToken = params.get("payment_resume") || "";
    const returnProvider = checkoutPaymentProvider(params.get("payment_provider"));
    const persistedProvider = readPendingPaymentProvider(localStorage);
    // Query-parametern väljer enbart säker poll-policy. Den är aldrig bevis på
    // betalning; endast backend-status PAID får slutföra checkouten.
    const recoveryProvider = returnProvider || persistedProvider;
    const returnEmbedded = params.get("embed") === "1";
    const returnRestaurantSlug = params.get("restaurant") || cartRestaurantSlug || "";
    // A partner return belongs only to an explicit embedded checkout. Never
    // reuse a previously remembered partner origin for a normal ViaEats cart.
    const returnParentOrigin = returnEmbedded
      ? trustedPartnerOrigin(params.get(EMBED_PARENT_ORIGIN_PARAM)) || readEmbedParentOrigin()
      : null;

    const cancelled =
      params.get("payment_cancelled") === "1" ||
      ["failed", "canceled", "cancelled", "requires_payment_method"].includes(String(params.get("redirect_status") || "").toLowerCase());

    // payment_resume är en kortlivad engångshemlighet. Alla värden ovan är nu
    // kopierade till minnet, så rensa den ur adressfält/browserhistorik innan
    // första nätverksanrop eller await.
    clearCartReturnParams();
    localStorage.setItem("pending_order_id", returnOrderId);
    setPendingOrderId(returnOrderId);
    if (recoveryProvider) writePendingPaymentProvider(localStorage, recoveryProvider);
    if (recoveryProvider === "swish") {
      setPaymentStepOpen(true);
      setSelectedCheckoutMethod("swish");
      // En app-retur betyder inte att requesten fortfarande kan betalas. Dölj
      // därför den gamla Swish-länken tills backend har verifierat utfallet, så
      // en DECLINED/CANCELLED request aldrig ligger kvar som en falsk CTA.
      setSwishCheckout(null);
    } else if (recoveryProvider === "stripe") {
      setPaymentStepOpen(true);
      // Metoden i UI:t är presentation, inte betalbevis. Statusen hämtas alltid
      // från backend; card ger bara en neutral rubrik under verifieringen.
      setSelectedCheckoutMethod("card");
    }

    // Betalprovidern redirectade tillbaka hit efter kassan. Vi pollar orderns
    // betalstatus (webhooken är sanningskällan). Redirect är inte bevis på
    // betalning, så vi litar bara på PAID/FAILED från servern.
    paymentInFlightRef.current = false;
    void (async () => {
      // En hosted betalprovider lämnar iframe:n. När kunden kommer tillbaka måste kiosk-proofen
      // därför skapas på nytt innan statusen eller trackingen hämtas.
      if (returnEmbedded && returnRestaurantSlug) {
        await ensureKioskAccess(returnRestaurantSlug);
      }
      if (paymentResumeToken) {
        try {
          await axios.post(`/api/platform/orders/${returnOrderId}/session`, {
            paymentResumeToken,
          });
        } catch {
          // Engångstoken kan redan vara förbrukad av samma browser. Den
          // ordinarie HttpOnly-sessionen provas fortfarande av statusanropet.
        }
      }
      if (cancelled) {
        await handlePaymentCancelled(returnOrderId);
        return;
      }
      // En passivt återupptagen vanlig hosted checkout gör en snabb koll.
      // Swish måste däremot behålla samma callback-first-policy även på reload.
      await finishHostedPayment(returnOrderId, hostedPaymentContext(recoveryProvider, {
        passive: !returnParam,
        embedded: returnEmbedded,
        restaurantSlug: returnRestaurantSlug,
        parentOrigin: returnParentOrigin,
      }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Efter att betalningen slutförts (redirect-retur + poll). Redirect är
  // inte bevis på betalning, order-tracking-sidan pollar backend och visar rätt
  // status när webhooken finaliserat. Gäster använder den slumpade order-token
  // som ägarbevis; telefonnumret sparas bara som kontaktdata i historiken.
  const goToOrderTracking = async (orderId: string, context: HostedPaymentContext = {}) => {
    paymentPollGenerationRef.current += 1;
    paymentInFlightRef.current = false;
    const trackingEmbedded = context.embedded ?? embedMode;
    const trackingRestaurantSlug = context.restaurantSlug || embedRestaurantSlug || cartRestaurantSlug || "";
    const trackingParentOrigin = trackingEmbedded
      ? trustedPartnerOrigin(context.parentOrigin) || readEmbedParentOrigin()
      : null;
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
      restaurantName: trackingRestaurantSlug || cartRestaurantSlug || null,
      restaurantSlug: trackingRestaurantSlug || cartRestaurantSlug || null,
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
        localStorage.removeItem("pending_order_value");
      }
    } catch {
      /* noop */
    }
    try { clearPendingPaymentMetadata(localStorage); } catch { /* noop */ }
    clearCheckoutAttempt();
    const trackingUrl = trackingEmbedded
      ? `/order/${orderId}?embed=1&restaurant=${encodeURIComponent(trackingRestaurantSlug)}&${EMBED_PARENT_ORIGIN_PARAM}=${encodeURIComponent(trackingParentOrigin || "")}`
      : `/order/${orderId}`;

    if (trackingEmbedded && trackingParentOrigin && window.parent === window) {
      const partnerReturn = new URL("/meny.html", trackingParentOrigin);
      partnerReturn.searchParams.set("order", orderId);
      partnerReturn.searchParams.set("restaurant", trackingRestaurantSlug);
      window.location.replace(partnerReturn.toString());
      return;
    }
    if (trackingEmbedded && window.parent !== window) {
      window.parent.postMessage(
        { type: "viaeats:payment-complete", orderId, restaurantSlug: trackingRestaurantSlug },
        trackingParentOrigin || "*",
      );
    }
    router.replace(trackingUrl);
  };

  const clearPendingPaymentStorage = () => {
    try {
      localStorage.removeItem("pending_order_id");
      localStorage.removeItem("pending_order_token");
      localStorage.removeItem("pending_order_phone");
      localStorage.removeItem("pending_order_value");
      clearPendingPaymentMetadata(localStorage);
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
      next.searchParams.delete("stripe_session_id");
      next.searchParams.delete("payment_resume");
      next.searchParams.delete("payment_provider");
      window.history.replaceState({}, "", `${next.pathname}${next.search}`);
    } catch { /* noop */ }
  };

  const handlePaymentCancelled = async (orderId: string) => {
    const cancelGeneration = ++paymentPollGenerationRef.current;
    // Dölj alla återöppnings-/confirm-kontroller direkt när cancel börjar. En
    // användare ska inte kunna starta samma request igen medan backend avgör
    // om PAID redan hann vinna eller om providern bekräftar avbrottet.
    setVerifyingPayment(true);
    setCancellingPayment(true);
    setSwishCheckout(null);
    setHostedCheckoutUrl(null);
    setEmbeddedStripeOrderId(null);
    setEmbeddedStripeProcessing(false);
    paymentInFlightRef.current = false;
    clearCartReturnParams();
    const outcome = await abandonPendingOrder(orderId);
    if (cancelGeneration !== paymentPollGenerationRef.current) return;
    if (outcome === "paid") {
      paymentCancelRetryRef.current = { orderId: "", attempt: 0 };
      setVerifyingPayment(false);
      setCancellingPayment(false);
      await goToOrderTracking(orderId);
      return;
    }
    if (outcome === "terminal") {
      paymentCancelRetryRef.current = { orderId: "", attempt: 0 };
      setVerifyingPayment(false);
      setCancellingPayment(false);
      setSelectedCheckoutMethod(null);
      setPaymentStepOpen(true);
      clearPendingPaymentStorage();
      setPendingOrderId(null);
      setError(null);
      return;
    }

    // PSP:n eller nätet kunde inte bekräfta cancel i detta anrop. Bevara
    // underlaget, visa inga gamla betalningskontroller och försök automatiskt
    // igen med bounded backoff tills Swish/Stripe ger terminal status. Kunden
    // behöver aldrig öppna den gamla requesten eller manuellt trycka retry.
    setPaymentStepOpen(true);
    setPendingOrderId(orderId);
    setError(null);
    const previousRetry = paymentCancelRetryRef.current.orderId === orderId
      ? paymentCancelRetryRef.current.attempt
      : 0;
    const nextAttempt = previousRetry + 1;
    paymentCancelRetryRef.current = { orderId, attempt: nextAttempt };
    if (nextAttempt >= MAX_PAYMENT_CANCEL_ATTEMPTS) {
      // Backoffen är bounded, inte oändlig. Utan tak snurrade "Avslutar
      // betalningsförsöket" för alltid så fort avbrottet inte gick att
      // bekräfta — t.ex. i en inbäddad kassa där orderns cookie blockeras.
      // Ge tillbaka kontrollen i stället: ordern och dess proof bevaras,
      // backend reconcile/cleanup stänger PSP-försöket, och kunden kan
      // trycka avbryt igen när providern svarar.
      setVerifyingPayment(false);
      setCancellingPayment(false);
      setError("Vi kunde inte bekräfta avbrottet hos betaltjänsten. Din varukorg är kvar och ingen ny betalning har startats – vänta en stund och avbryt igen.");
      return;
    }
    const retryDelayMs = Math.min(1_000 * (2 ** Math.min(previousRetry, 4)), 10_000);
    window.setTimeout(() => {
      if (
        cancelGeneration === paymentPollGenerationRef.current &&
        paymentCancelRetryRef.current.orderId === orderId
      ) {
        void handlePaymentCancelled(orderId);
      }
    }, retryDelayMs);
  };

  // Pollar orderns betalstatus efter provider-returen eller när en persisterad
  // provider-order återupptas vid reopen. Status-endpointen stämmer dessutom av
  // direkt mot PSP:n, så flödet återhämtar sig även efter en försenad webhook.
  // PAID → tracking.
  // Terminalt fel/cancel → rensa proof + behåll varukorg. Timeout/pending →
  // bevara proof/order tills provider-cancel har bekräftats; skicka ALDRIG en
  // obetald order till tracking och skapa aldrig ett parallellt betalningsförsök.
  const finishHostedPayment = async (orderId: string, opts: HostedPaymentContext = {}) => {
    const pollGeneration = ++paymentPollGenerationRef.current;
    paymentCancelRetryRef.current = { orderId: "", attempt: 0 };
    setCancellingPayment(false);
    const isCurrentPoll = () => pollGeneration === paymentPollGenerationRef.current;
    // Passiv = ingen payment_return-param, bara en kvarlämnad pending_order_id.
    // Icke-Swish gör en snabb engångskoll. Swish behåller alltid sin officiella
    // 10→20/40/80-policy även efter callback-return eller reload.
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
    if (!isCurrentPoll()) return;
    const maxAttempts = passive && opts.provider !== "swish" ? 1 : (opts.pollAttempts ?? 8);
    const waitBeforePoll = async (baseDelayMs: number, withJitter: boolean) => {
      const jitterRatio = Math.max(0, Math.min(opts.pollJitterRatio ?? 0, 0.5));
      const jitter = withJitter ? baseDelayMs * jitterRatio * ((Math.random() * 2) - 1) : 0;
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, baseDelayMs + jitter)));
      return isCurrentPoll();
    };
    if (!passive && (opts.initialPollDelayMs ?? 0) > 0) {
      // Ingen negativ jitter här: första Swish-GET får aldrig ske före 10 s.
      if (!await waitBeforePoll(opts.initialPollDelayMs!, false)) return;
    } else if (passive && opts.provider === "swish" && (opts.initialPollDelayMs ?? 0) > 0) {
      if (!await waitBeforePoll(opts.initialPollDelayMs!, false)) return;
    }
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (!isCurrentPoll()) return;
      try {
        const res = await axios.get(`/api/platform/payments/status/${orderId}`);
        if (!isCurrentPoll()) return;
        const paymentOutcome = classifyPaymentStatus(res.data?.paymentStatus);
        if (paymentOutcome === "paid") {
          clearCartReturnParams();
          await goToOrderTracking(orderId, opts);
          return;
        }
        if (paymentOutcome === "terminal") {
          // Kundresan: kunden kom hela vägen och betalningen sa nej. Skiljs
          // från "lämnade mitt i betalningen" — det ena är vårt fel, det andra
          // kundens ändrade sig.
          trackJourney("PAYMENT_FAILED", {
            orderId,
            phone: formData.customerPhone || null,
            meta: { paymentStatus: res.data?.paymentStatus ?? null, passive },
          });
          setVerifyingPayment(false);
          setSwishCheckout(null);
          setHostedCheckoutUrl(null);
          setSelectedCheckoutMethod(null);
          setPaymentStepOpen(true);
          clearCartReturnParams();
          clearPendingPaymentStorage();
          setPendingOrderId(null);
          setEmbeddedStripeOrderId(null);
          // En gammal order som städas bort passivt ska inte skrämmas upp som
          // ett färskt betalfel.
          if (!passive) setError("Betalningen genomfördes inte. Din varukorg är kvar, försök igen eller välj ett annat betalsätt.");
          return;
        }
      } catch (err: unknown) {
        if (!isCurrentPoll()) return;
        const responseStatus = (err as { response?: { status?: unknown } } | null)?.response?.status;
        if (Number(responseStatus) === 410) {
          setVerifyingPayment(false);
          setSwishCheckout(null);
          setHostedCheckoutUrl(null);
          setSelectedCheckoutMethod(null);
          setPaymentStepOpen(true);
          clearCartReturnParams();
          clearPendingPaymentStorage();
          setPendingOrderId(null);
          setEmbeddedStripeOrderId(null);
          if (!passive) setError("Den tidigare betalningen kunde inte återställas. Din varukorg är kvar, så du kan försöka igen.");
          return;
        }
        if (Number(responseStatus) === 404) {
          // Status-endpointen använder även 404 när order-sessionen saknas.
          // Det är inte bevis på terminal PSP-status: bevara recovery-underlag.
          setVerifyingPayment(false);
          setPendingOrderId(orderId);
          if (!passive) setError("Betalningen finns kvar men orderåtkomsten kunde inte återställas. Ladda om sidan eller vänta en stund – starta inte en ny betalning.");
          return;
        }
        /* nätverksfel: fortsätt polla */
      }
      if (attempt < maxAttempts - 1) {
        const delayMs = opts.provider === "swish"
          ? swishBackoffDelayMs(attempt, Math.random(), opts.pollJitterRatio)
          : opts.pollBackoffBaseMs
            ? Math.min(
                opts.pollBackoffBaseMs * (2 ** attempt),
                opts.pollMaxDelayMs ?? Number.POSITIVE_INFINITY,
              )
            : 2000;
        // Swish-helpern har redan applicerat jitter; generisk polling gör det här.
        if (!await waitBeforePoll(delayMs, opts.provider !== "swish")) return;
      }
    }
    if (!isCurrentPoll()) return;
    setVerifyingPayment(false);
    clearCartReturnParams();
    setPendingOrderId(orderId);
    // En retur eller kvarlämnad recovery som fortfarande är okänd efter sitt
    // poll-fönster ska inte lämna kunden med en återöppningsbar request. Försök därför cancel hos
    // providern. handlePaymentCancelled öppnar ett nytt försök endast efter
    // bekräftad terminal status; PAID vinner alltid och okänt förblir blockerat.
    await handlePaymentCancelled(orderId);
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
      attribution: orderAttributionContext(),
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
        if (embedMode) return undefined;
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
      // Defense-in-depth: backend räknar alltid priserna på nytt men stoppar
      // checkout om serverbeloppet avviker mer än 1 kr från det kunden såg.
      expectedTotalKr: total,
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
  // owner-check via accessToken eller platform-cookie och stämmer av PSP:n.
  // Idempotent: säker att kalla flera gånger. Resultatet är medvetet
  // fail-closed: nätfel/okänd status betyder pending och proof måste bevaras.
  const abandonPendingOrder = useCallback(async (orderId: string): Promise<AbandonOutcome> => {
    try {
      const token = (typeof window !== "undefined" ? localStorage.getItem("pending_order_token") : "") || "";
      const response = await axios.post(`/api/platform/orders/${orderId}/abandon`, {
        accessToken: token || undefined,
      });
      const outcome = classifyAbandonResponse(response.data);
      if (outcome !== "pending") return outcome;

      // `skipped:not-awaiting` kan betyda att en sen webhook just betalade
      // ordern. Läs status innan något lokalt proof rensas.
      if (response.data?.skipped) {
        try {
          const statusResponse = await axios.get(`/api/platform/payments/status/${orderId}`);
          return classifyPaymentStatus(statusResponse.data?.paymentStatus);
        } catch {
          return "pending";
        }
      }
      return "pending";
    } catch {
      return "pending";
    }
  }, []);

  // ── Tracka pågående betalning så pagehide-handlern inte abandonar ─────────
  // Sätts till true precis innan browsern lämnar sidan för en hosted provider.
  // Återställs vid fel eller när kunden kommer tillbaka via return_url.
  const paymentInFlightRef = useRef(false);

  // Do not abandon on pagehide/reload. Hosted checkouts legitimately leave
  // this page, and a beacon racing the payment webhook can delete a real order.
  // The persisted attempt is resumed on retry; explicit provider cancel/fail
  // uses handlePaymentCancelled, while backend cleanup handles true orphans.

  // Webhook/reconcile finaliserar ordern; klienten routar bara till
  // /order/{id} efter att backend har verifierat betalstatusen.

  // Har gästen redan beställt en gång ligger namn/telefon/e-post kvar. Då
  // ska kassan inte be om dem igen — bara visa dem hopfällda.
  const [guestDetailsKnown, setGuestDetailsKnown] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setGuestDetailsKnown(Boolean(
      localStorage.getItem("guest_name")
      && localStorage.getItem("guest_phone")
      && localStorage.getItem("guest_email"),
    ));
  }, []);

  // Persist guest name/phone/email across sessions
  useEffect(() => {
    if (user || typeof window === "undefined") return;
    if (formData.customerName) localStorage.setItem("guest_name", formData.customerName);
    if (formData.customerPhone) localStorage.setItem("guest_phone", formData.customerPhone);
    if (formData.customerEmail) localStorage.setItem("guest_email", formData.customerEmail);
  }, [user, formData.customerName, formData.customerPhone, formData.customerEmail]);

  // Swish startar på kundens metodknapp. Stripes inbäddade wallets, Klarna och
  // kortfält validerar däremot först och anropar sedan denna funktion
  // för att skapa den frysta ordern + PaymentIntenten. Det gör att native
  // wallet-sheet och kortfält visas direkt, utan en tom förberedelsevy.
  const startCheckout = async (
    e: { preventDefault: () => void },
    checkoutMethod: CheckoutMethod,
    options: StartCheckoutOptions = {},
  ): Promise<PreparedStripePayment | void> => {
    e.preventDefault();

    // Kundresan: kunden har fyllt i sina uppgifter och tryckt på betala. Allt
    // som händer efter den här punkten är hinder vi själva reser — zonen,
    // betalningen — och det är dem tratten ska kunna peka ut.
    trackJourney("ORDER_TYPE_CHOSEN", {
      restaurantId: currentRestaurantId,
      meta: { orderType },
    });
    if (formData.customerPhone) {
      trackJourney("CONTACT_ENTERED", {
        restaurantId: currentRestaurantId,
        phone: formData.customerPhone,
        email: formData.customerEmail || null,
      });
    }

    const checkoutExperience = options.checkoutExperience || "hosted";
    const deferredStripePayment = checkoutExperience === "embedded" && checkoutMethod !== "swish";
    const rejectCheckout = (message: string) => {
      if (deferredStripePayment) throw new Error(message);
      setError(message);
    };
    let preserveLoadingForNavigation = false;
    paymentPollGenerationRef.current += 1;
    if (!deferredStripePayment) {
      setError(null);
      setHostedCheckoutUrl(null);
      setSwishCheckout(null);
      setSelectedCheckoutMethod(checkoutMethod);
    }
    const checkoutProvider: CheckoutPaymentProvider = checkoutMethod === "swish" ? "swish" : "stripe";

    // Refresh the Palmyra-scoped kiosk credential immediately before the first
    // order/payment request. This also covers browsers that block iframe
    // cookies, where the axios interceptor uses the returned signed proof.
    if (embedMode) {
      const kioskReady = await ensureKioskAccess(embedRestaurantSlug || cartRestaurantSlug || "");
      if (!kioskReady) {
        rejectCheckout("Embedded beställningsåtkomst saknas. Ladda om menyn och försök igen.");
        return;
      }
    }

    // Obligatoriskt BOGO-val: en upplåst gratis-vara måste plockas innan
    // betalning (annars betalar kunden och missar gratisen). Öppna pickern.
    if (bogoMustPick) {
      setShowBogoPicker(true);
      if (deferredStripePayment) throw new Error("Välj din kostnadsfria vara innan du betalar.");
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
      rejectCheckout(t("cart.errors.namePhoneRequired"));
      return;
    }
    // E-post är frivilligt — gäster anger bara namn + telefon. Verifierade profiler har den
    // förifylld ur profilen. Backend skickar e-posten som valfritt till betalprovidern.
    // Anges en e-post måste den vara giltig; tom tillåts och skickas som undefined.
    if (!isTestFlow) {
      const emailValue = formData.customerEmail.trim();
      if (emailValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
        rejectCheckout(t("cart.errors.invalidEmail"));
        return;
      }
    }
    if (orderType === "DELIVERY") {
      const hasStreet = !!formData.deliveryStreet.trim();

      if (!hasStreet) {
        rejectCheckout(t("cart.errors.streetRequired"));
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
        rejectCheckout(`Den aktiva kupongen kräver en beställning på minst ${formatSekAmount(activeDealMinOrder)} kr. Ta bort kupongen för att använda en annan kod.`);
        return;
      }
      const afterDiscount = Math.max(0, subtotal - foodDiscountComponent);
      if (afterDiscount < effectiveMinOrder && minOrderTopUp === 0) {
        const shortfall = Math.ceil(effectiveMinOrder - afterDiscount);
        rejectCheckout(
          t("cart.minOrder.errorWithDiscount", {
            min: formatSekAmount(minOrder),
            effective: formatSekAmount(effectiveMinOrder),
            short: formatSekAmount(shortfall),
          }),
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
        rejectCheckout(t("cart.errors.restaurantPaused", { time: `${h}:${m}` }));
      } else {
        rejectCheckout(t("cart.errors.restaurantClosed"));
      }
      return;
    }

    // ── Zone check (last-mile safeguard for delivery) ────────────────────────
    // Skippas för test-flödet så vi kan testa till adresser utanför zone.
    if (!isTestFlow && orderType === "DELIVERY" && currentRestaurantId) {
      // Adressen måste vara en gatuadress INNAN vi bryr oss om zonen. Ett
      // postnummer har en centroid som ligger i zonen, så zon-checken sa ja
      // till "224 76" och restaurangen fick en order utan adress.
      const deliveryAddressCheck = checkDeliveryStreet(formData.deliveryStreet);
      if (!deliveryAddressCheck.ok) {
        rejectCheckout(deliveryAddressCheck.message);
        return;
      }
      if (addressZoneStatus === "checking") {
        rejectCheckout(t("cart.errors.zoneChecking"));
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
        if (!deferredStripePayment) {
          setLoading(true);
          setError(t("cart.errors.verifyingAddress"));
        }
        try {
          const aRes = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(formData.deliveryStreet)}&sessiontoken=${sessionToken.current}`);
          const aData = await aRes.json();
          // Den här sista-chans-geokodningen tog förut FÖRSTA träffen rakt av.
          // Skrev kunden "224 76" blev det postnumrets centroid, zonen sa ja
          // och ordern gick igenom utan adress. Nu accepteras bara en träff
          // som faktiskt är en gatuadress.
          const bestMatch = (aData.predictions || []).find(
            (prediction: any) => isDeliverableStreet(String(prediction?.description || "").split(",")[0]),
          );
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
            // Kundresan: den här kunden ville beställa och vi sa nej. Adressen
            // sparas så adminvyn kan visa VAR vi tappar folk geografiskt —
            // det är underlaget för att veta vilken zon som ska utökas.
            trackJourney("ADDRESS_REJECTED", {
              restaurantId: currentRestaurantId,
              phone: formData.customerPhone || null,
              meta: { rejectedAddress: formData.deliveryStreet || null, reason: "utanför zonen" },
            });
            rejectCheckout(t("cart.errors.zoneNotCovered"));
            if (!deferredStripePayment) setLoading(false);
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
          trackJourney("ADDRESS_ACCEPTED", {
            restaurantId: currentRestaurantId,
            phone: formData.customerPhone || null,
            meta: { deliveryFee: freshFee },
          });
        } catch (zoneErr: any) {
          // Tidigare "fail open" — släppte igenom ordern även om zon-API:n
          // failade. Konsekvens: kunden kunde beställa till en adress som
          // inte täcktes av leverans och få "kunde inte levereras"-mail i
          // efterhand. Bättre att blockera och be om retry — backend är
          // sanningskällan för zone-täckning.
          console.warn("[cart] zone check failed:", zoneErr?.message || zoneErr);
          setAddressZoneStatus("error");
          // Också ett avhopp orsakat av oss, men av annan sort än "vi kör inte
          // dit" — reason skiljer dem åt i rapporten.
          trackJourney("ADDRESS_REJECTED", {
            restaurantId: currentRestaurantId,
            phone: formData.customerPhone || null,
            meta: { rejectedAddress: formData.deliveryStreet || null, reason: "zonkollen svarade inte" },
          });
          rejectCheckout(t("cart.errors.zoneCheckFailed"));
          if (!deferredStripePayment) setLoading(false);
          return;
        }
      } else if (formData.deliveryStreet) {
        // Fallback-geocoden ovan (rad ~1015-1037) försökte hitta lat/lng från
        // den manuellt skrivna adressen via Google Places. Om vi hamnar HÄR
        // betyder det att autocomplete inte hittade någon match alls — vägledning
        // till kunden behöver vara konkret, inte "välj från listan" eftersom
        // ingen lista visades.
        rejectCheckout(t("cart.errors.addressNotFound"));
        if (!deferredStripePayment) setLoading(false);
        return;
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    // Alla kontroller är gjorda: nu först lämnar vi kassan för det fokuserade
    // betalsteget. Ett valideringsfel ska stanna kvar hos fälten kunden ska rätta.
    if (!deferredStripePayment) {
      setPaymentStepOpen(true);
      setLoading(true);
    }
    try {
      // isTestFlow är redan beräknad ovan — testa-koden gör att vi
      // direktpostar order utan att gå via Stripe.
      if (isTestFlow) {
        if (deferredStripePayment) throw new Error("Stripe-betalning används inte i testläget.");
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
        paymentProvider: checkoutProvider,
      };
      const fingerprint = checkoutFingerprint({
        // Analysdata får aldrig skapa ett nytt betalningsförsök.
        pendingPayload: { ...pendingPayload, attribution: undefined },
        checkoutMethod,
        ...(checkoutProvider === "stripe"
          ? {
              checkoutFlowVersion: deferredStripePayment
                ? STRIPE_DEFERRED_FLOW_VERSION
                : STRIPE_HOSTED_FLOW_VERSION,
            }
          : {}),
      });
      const previousAttempt = readCheckoutAttempt();
      const previousOrderId = localStorage.getItem("pending_order_id");
      const previousProvider = readPendingPaymentProvider(localStorage);
      const sameCheckoutAttempt = Boolean(
        previousOrderId && previousAttempt?.fingerprint === fingerprint,
      );
      if (previousOrderId && sameCheckoutAttempt) {
        // Samma kundpayload + samma provider betyder samma PSP-request. Skapa
        // aldrig blint om den (Swish svarar RP09); återställ proof och stäm av
        // status när vi har tokenlänken kvar.
        const restoredCheckout = previousProvider === "swish"
          ? readPersistedSwishCheckout(localStorage, previousOrderId)
          : null;
        if (restoredCheckout) {
          // Länken kan ha blivit terminal medan sidan var borta. Presentera den
          // inte igen förrän statusen är verifierad; kunden kan avbryta säkert
          // och skapa ett nytt försök om requesten fortfarande är pending.
          setSwishCheckout(null);
          setSelectedCheckoutMethod("swish");
          setPaymentStepOpen(true);
          setPendingOrderId(previousOrderId);
          await finishHostedPayment(previousOrderId, hostedPaymentContext(previousProvider, {
            embedded: embedMode,
            restaurantSlug: embedRestaurantSlug || undefined,
            parentOrigin: embedMode ? readEmbedParentOrigin() : null,
          }));
          return;
        }
        // Om create-svaret tappades finns ingen återöppningslänk. Fortsätt med
        // samma idempotenta order. För Swish verifierar backend den reserverade
        // requesten och roterar säkert vid behov; hosted providers returnerar
        // sin befintliga checkout-URL igen.
      }
      if (previousOrderId && !sameCheckoutAttempt) {
        // Ny payload/provider får en ny request först efter verifierad terminal
        // cancel. PAID vinner alltid; pending/nätfel bevarar original-proof.
        const cancellation = await abandonPendingOrder(previousOrderId);
        if (cancellation === "paid") {
          if (deferredStripePayment) {
            return { status: "paid", orderId: previousOrderId };
          }
          await goToOrderTracking(previousOrderId);
          return;
        }
        if (cancellation === "pending") {
          setSwishCheckout(null);
          setPaymentStepOpen(true);
          if (deferredStripePayment) setEmbeddedStripeOrderId(previousOrderId);
          else setPendingOrderId(previousOrderId);
          rejectCheckout("Den tidigare betalningen kan fortfarande behandlas och kunde inte avbrytas säkert. Vänta på status eller avbryt säkert igen innan du ändrar betalsätt.");
          return;
        }
        clearPendingPaymentStorage();
        setPendingOrderId(null);
        setEmbeddedStripeOrderId(null);
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
      // Ordervärdet överlever redirecten till betalningen, så Purchase kan
      // rapporteras med rätt belopp även när kunden kommer tillbaka till en
      // omladdad sida med tömd varukorg.
      localStorage.setItem("pending_order_value", String(total));
      trackMetaInitiateCheckout({ orderId, value: total });
      // Kundresan: ordern finns nu i databasen. Att den ännu inte är betald är
      // just poängen — nästa steg avgör om den blir en beställning eller ett
      // avhopp mitt i betalningen.
      trackJourney("ORDER_PLACED", {
        orderId,
        restaurantId: currentRestaurantId,
        phone: formData.customerPhone || null,
        email: formData.customerEmail || null,
        meta: { total, orderType, provider: checkoutProvider },
      });
      writePendingPaymentProvider(localStorage, checkoutProvider);
      if (deferredStripePayment) setEmbeddedStripeOrderId(orderId);
      else setPendingOrderId(orderId);

      // Step 2: Skapa hosted checkout och skicka kunden dit. Providern
      // redirectar tillbaka till returnUrl (?payment_return=orderId) efter
      // betalningen, där vi pollar orderstatus. Webhooken finaliserar ordern,
      // klienten flippar aldrig status själv. paymentInFlight hindrar pagehide
      // från att abandona ordern under redirect-flödet.
      if (!deferredStripePayment) paymentInFlightRef.current = true;
      const currentParams = new URLSearchParams(window.location.search);
      const checkoutEmbedded = currentParams.get("embed") === "1";
      const returnParams = new URLSearchParams({ payment_return: orderId });
      returnParams.set("payment_provider", checkoutProvider);
      if (checkoutEmbedded) {
        returnParams.set("embed", "1");
        if (embedRestaurantSlug) returnParams.set("restaurant", embedRestaurantSlug);
      }
      // Palmyra is a return shell only for a checkout that is currently
      // running as an embed. A normal ViaEats checkout always returns to the
      // ViaEats cart, even if this tab previously visited an embedded menu.
      const embedParentOrigin = checkoutEmbedded
        ? trustedPartnerOrigin(currentParams.get(EMBED_PARENT_ORIGIN_PARAM)) || readEmbedParentOrigin()
        : null;
      if (embedParentOrigin) returnParams.set(EMBED_PARENT_ORIGIN_PARAM, embedParentOrigin);
      // Hosted betalning ska tillbaka till restaurangens sida, inte lämna kunden på en
      // fristående ViaEats-cart. Palmyras embed.js läser payment_return och
      // laddar samma säkra statuspollning inuti iframe:n igen.
      // Swish växlar till sin egen app och öppnar sedan retur-URL:en som en
      // vanlig https-länk. Pekar den på /cart fångar iOS den som universal
      // link och kastar in webbkunden i ViaEats-appen — efter både godkänd
      // och avbruten betalning. /pay/back är inte registrerad för appen och
      // skickar vidare till kassan inuti webbläsaren. Partner-embedden
      // återvänder till partnerns egen domän, som appen aldrig gör anspråk på.
      const swishAppSwitchReturn = checkoutProvider === "swish" && !embedParentOrigin;
      const returnUrl = embedParentOrigin
        ? `${embedParentOrigin}/meny.html?${returnParams.toString()}`
        : `${window.location.origin}/${swishAppSwitchReturn ? "pay/back" : "cart"}?${returnParams.toString()}`;
      trackJourney("PAYMENT_STARTED", {
        orderId,
        restaurantId: currentRestaurantId,
        phone: formData.customerPhone || null,
        meta: { provider: checkoutProvider, method: checkoutMethod },
      });
      const payRes = await axios.post(`/api/platform/payments/create`, {
        orderId,
        returnUrl,
        channel: "Web",
        checkoutExperience,
        // "stripe_all" skickar ingen metod — backend skapar då EN hosted
        // Checkout-session med hela den konfigurerade uppsättningen.
        checkoutMethod: checkoutProvider === "stripe" && checkoutMethod !== "stripe_all" ? checkoutMethod : undefined,
      });
      if (payRes.data?.alreadyPaid === true || String(payRes.data?.paymentStatus || "").toUpperCase() === "PAID") {
        if (deferredStripePayment) {
          return { status: "paid", orderId };
        }
        clearCartReturnParams();
        await goToOrderTracking(orderId);
        return;
      }
      if (deferredStripePayment) {
        const clientSecret = String(payRes.data?.clientSecret || "");
        if (!clientSecret.startsWith("pi_") || !clientSecret.includes("_secret_")) {
          throw new Error("Stripe-betalningen saknar en giltig bekräftelsenyckel");
        }
        return { status: "prepared", orderId, clientSecret, returnUrl };
      }
      if (String(payRes.data?.provider || "").toLowerCase() === "swish") {
        const appUrl = String(payRes.data?.swishUrl || "");
        const qrCode = String(payRes.data?.swishQrCode || "");
        if (!appUrl.startsWith("swish://") || !qrCode.startsWith("data:image/")) {
          paymentInFlightRef.current = false;
          throw new Error("Swish-betalningen saknar öppningslänk eller QR-kod");
        }
        const checkout = { orderId, appUrl, qrCode };
        writePersistedSwishCheckout(localStorage, checkout);
        writePendingPaymentProvider(localStorage, "swish");
        setSwishCheckout(checkout);
        setSelectedCheckoutMethod("swish");
        setPaymentStepOpen(true);
        void finishHostedPayment(orderId, hostedPaymentContext("swish", {
          embedded: checkoutEmbedded,
          restaurantSlug: embedRestaurantSlug || undefined,
          parentOrigin: embedParentOrigin,
          // Swish callback är normalflödet. Om den dröjer följer vi deras
          // rekommenderade 10, 20, 40, 80…-pollning med jitter för att undvika
          // 429 och synkroniserade klienttoppar.
        }));
        return;
      }
      const checkoutUrl: string | undefined = payRes.data?.checkoutUrl;
      if (!checkoutUrl) {
        paymentInFlightRef.current = false;
        throw new Error(payRes.data?.details || payRes.data?.error || t("cart.errors.paymentUnavailable"));
      }
      // Hosted provider pages cannot safely be rendered inside our iframe. A cross-origin iframe
      // is also not allowed to navigate window.top after these async API calls,
      // so let the trusted Palmyra parent perform the top-level navigation.
      // The partner embed validates both this frame's origin and the provider host.
      if (embedMode && window.parent !== window) {
        const parentOrigin = embedParentOrigin || "*";
        setHostedCheckoutUrl(checkoutUrl);
        window.parent.postMessage(
          { type: "viaeats:open-payment", checkoutUrl },
          parentOrigin,
        );
        return;
      }
      // `finally` körs direkt efter location.assign, innan browsern hinner
      // lämna sidan. Behåll därför laddningsläget tills navigationen sker så
      // den gamla "väntande betalning"-varningen aldrig blinkar fram.
      preserveLoadingForNavigation = true;
      window.location.assign(checkoutUrl);
      return;
    } catch (err: any) {
      paymentInFlightRef.current = false;
      if (err.response?.data?.code === "ORDER_REPLAY_EXPIRED") {
        // Rotate the stale idempotency key on the next click. The persisted
        // order id remains for one cycle so startCheckout can best-effort
        // abandon the obsolete unpaid order before creating a new attempt.
        clearCheckoutAttempt();
      }
      if (deferredStripePayment) {
        const message = err.response?.data?.error || err.message || t("cart.errors.paymentUnavailable");
        throw new Error(message);
      }
      setSwishCheckout(null);
      setSelectedCheckoutMethod(null);
      setPaymentStepOpen(false);
      setError(err.response?.data?.error || t("cart.errors.paymentUnavailable"));
    } finally {
      if (!deferredStripePayment && !preserveLoadingForNavigation) setLoading(false);
    }
  };

  // Full-varukorg-skeleton: visas bara FÖRE mount (matchar SSR) eller när en
  // icke-tom varukorg fortfarande laddar. En TOM varukorg hoppar direkt till
  // tomt-läget nedan istället för att visa en falsk "full varukorg".
  if (!mounted || (pageLoading && items.length > 0)) {
    return (
      <div className="ve-root min-h-screen pb-32 md:pt-20">
        <div className="max-w-[680px] mx-auto px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] md:pt-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="ve-skeleton h-10 w-10 rounded-full" />
            <div>
              <div className="ve-skeleton h-7 w-32 rounded-lg mb-2" />
              <div className="ve-skeleton h-3.5 w-48 rounded-md" />
            </div>
          </div>
          <div className="ve-card overflow-hidden">
            {[0, 1, 2].map((i) => (
              <div key={i} className="mx-4 flex items-center gap-3 py-3.5" style={{ boxShadow: i === 0 ? undefined : "inset 0 0.5px 0 var(--ve-line)" }}>
                <div className="ve-skeleton h-14 w-14 rounded-[12px] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="ve-skeleton h-4 w-3/4 rounded-md mb-2" />
                  <div className="ve-skeleton h-3 w-1/2 rounded-md" />
                </div>
                <div className="ve-skeleton h-8 w-20 rounded-full shrink-0" />
              </div>
            ))}
          </div>
          <div className="ve-card mt-6 h-[72px]" />
          <div className="ve-card mt-6 h-[160px]" />
          <div className="ve-card mt-6 h-[200px]" />
          <div className="ve-card mt-6 h-[132px]" />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="ve-root min-h-screen flex flex-col items-center justify-center px-6">
        {/* Tom varukorg — line-art-kasse som ritas upp vid mount och sedan
            svävar mjukt; skugg-ellipsen andas i motfas. */}
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
              <path d="M14 22h36l-3.2 30a4 4 0 0 1-4 3.6H21.2a4 4 0 0 1-4-3.6L14 22z" stroke="var(--ve-ink)" strokeWidth="2" strokeLinejoin="round" fill="none" />
              <path d="M23 28v-9a9 9 0 0 1 18 0v9" stroke="var(--ve-ink-2)" strokeWidth="2" strokeLinecap="round" fill="none" />
              <circle cx="26" cy="40" r="1.4" fill="var(--ve-ink)" stroke="var(--ve-ink)" strokeWidth="0.5" />
              <circle cx="38" cy="40" r="1.4" fill="var(--ve-ink)" stroke="var(--ve-ink)" strokeWidth="0.5" />
              <path d="M26 46c2 2.4 10 2.4 12 0" stroke="var(--ve-ink)" strokeWidth="2" strokeLinecap="round" fill="none" />
            </svg>
          </div>
          <svg className="cart-empty-shadow mt-2" width="72" height="10" viewBox="0 0 72 10" aria-hidden="true">
            <ellipse cx="36" cy="5" rx="30" ry="4" fill="var(--ve-fill-2)" />
          </svg>
          <h2 className="mt-6 text-[22px] font-semibold" style={{ color: "var(--ve-ink)", letterSpacing: "-0.02em" }}>
            {t("cart.empty.titlePrefix")} {t("cart.empty.titleAccent")}
          </h2>
          <p className="mt-1.5 text-[15px] text-center max-w-[280px]" style={{ color: "var(--ve-ink-2)" }}>
            {t("cart.empty.subtitle")}
          </p>
          <Link
            href={embedMode ? embedMenuHref : "/"}
            className="ve-press mt-7 h-12 px-7 rounded-full flex items-center text-[16px] font-semibold"
            style={{ backgroundColor: "var(--ve-cta)", color: "var(--ve-cta-ink)" }}
          >
            {t("cart.empty.cta")}
          </Link>
        </div>
      </div>
    );
  }

  // ── Delade render-block ────────────────────────────────────────────────
  // Kassan är EN kolumn (max 680 px) på alla skärmar — samma rytm som
  // restaurangsidan: vita kort på grå bakgrund, hårfina avdelare, en svart
  // handling. Alla block nedan delar samma state/handlers som förut.
  const hairline = "inset 0 0.5px 0 var(--ve-line)";
  const sectionTitle = (text: string, right?: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 px-1 mb-2.5">
      <h2 className="m-0 text-[17px] font-semibold" style={{ color: "var(--ve-ink)", letterSpacing: "-0.015em" }}>{text}</h2>
      {right}
    </div>
  );

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

  const dealRowStyle = (active: boolean, disabled: boolean) => ({
    backgroundColor: active ? "var(--ve-ink)" : "var(--ve-card-2)",
    color: active ? "#fff" : "var(--ve-ink)",
    boxShadow: active ? "none" : "inset 0 0 0 0.5px var(--ve-line)",
    opacity: disabled ? 0.45 : 1,
  });

  const renderAccountDeals = () => (accountDeals.length > 0 || activeExternalDeal) && (
    <div className="space-y-2">
      {activeExternalDeal && (
        <button
          type="button"
          onClick={() => { setSelectedAccountDealId(null); clearActiveUserDeal(); }}
          className="ve-press w-full flex items-center justify-between gap-3 rounded-[14px] px-4 py-3 text-left"
          style={dealRowStyle(true, false)}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <Check size={16} strokeWidth={2.6} className="shrink-0" />
            <span className="min-w-0">
              <span className="block text-[15px] font-medium truncate">{activeExternalDeal.title}</span>
              {appDealQuote && !appDealQuote.applicable && appDealQuote.reason === "MIN_ORDER" && (appDealQuote.minOrderKr ?? 0) > 0 && (
                <span className="block text-[12.5px] mt-0.5 opacity-70">Handla för minst {formatSekAmount(appDealQuote.minOrderKr ?? 0)} kr</span>
              )}
            </span>
          </span>
          <span className="text-[13px] font-medium shrink-0 opacity-80">{t("cart.discount.promoRemove")}</span>
        </button>
      )}
      {accountDeals.map((d) => {
        const min = d.minOrderKr ?? 0;
        const meetsMin = subtotal >= min;
        const isActive = selectedAccountDealId === d.id;
        const blockedByPromo = !!selectedPersonalDeal && !isActive;
        const disabled = (!meetsMin && !isActive) || blockedByPromo;
        return (
          <button
            key={d.id}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (isActive) { setSelectedAccountDealId(null); clearActiveUserDeal(); }
              else {
                setSelectedAccountDealId(d.id);
                setSelectedPersonalDeal(null);
                setPromoCodeInput("");
                writeActiveUserDeal(d.id);
              }
            }}
            className={`w-full flex items-center justify-between gap-3 rounded-[14px] px-4 py-3 text-left ${disabled ? "cursor-not-allowed" : "ve-press"}`}
            style={dealRowStyle(isActive, disabled)}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              {isActive ? <Check size={16} strokeWidth={2.6} className="shrink-0" /> : <Gift size={16} strokeWidth={2} className="shrink-0" style={{ color: "var(--ve-ink-3)" }} />}
              <span className="min-w-0">
                <span className="block text-[15px] font-medium truncate">
                  {isActive ? t("cart.discount.activeReward") : t("cart.discount.useReward", { type: dealTypeLabel(d.type, t), label: formatDealLabel(d, t) })}
                </span>
                {!meetsMin && min > 0 && (
                  <span className="block text-[12.5px] mt-0.5" style={{ color: isActive ? "rgba(255,255,255,0.7)" : "var(--ve-ink-3)" }}>{t("cart.discount.minOrderRequired", { min: formatSekAmount(min) })}</span>
                )}
                {blockedByPromo && meetsMin && (
                  <span className="block text-[12.5px] mt-0.5" style={{ color: "var(--ve-ink-3)" }}>{t("cart.discount.blockedByPromo")}</span>
                )}
              </span>
            </span>
            <span className="ve-tabular text-[13px] font-medium shrink-0" style={{ color: isActive ? "rgba(255,255,255,0.8)" : "var(--ve-ink-2)" }}>
              {isActive ? t("cart.discount.promoRemove") : `−${formatSekAmount(computeDealComponentsKr(d, subtotal, deliveryFee).total)} ${t("common.kr")}`}
            </span>
          </button>
        );
      })}
    </div>
  );

  const renderPromoInput = () => (
    <div className="space-y-2">
      <div className={`relative flex items-center ${selectedAccountDealId ? "opacity-40 pointer-events-none" : ""}`}>
        <Tag size={15} strokeWidth={2.2} className="absolute left-4 pointer-events-none" style={{ color: selectedPersonalDeal ? "var(--ve-success)" : "var(--ve-ink-3)" }} />
        <input
          value={selectedPersonalDeal ? selectedPersonalDeal.code : promoCodeInput}
          onChange={e => { if(selectedPersonalDeal) setSelectedPersonalDeal(null); setPromoCodeInput(e.target.value); setReferralMessage(null); }}
          disabled={!!selectedAccountDealId}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="ve-input w-full h-12 rounded-full pl-11 pr-24 font-medium outline-none disabled:cursor-not-allowed"
          style={{ backgroundColor: "var(--ve-fill)", color: selectedPersonalDeal ? "var(--ve-success)" : "var(--ve-ink)", letterSpacing: "0.02em" }}
          placeholder={selectedAccountDealId ? t("cart.discount.promoBlockedByReward") : selectedPersonalDeal ? t("cart.discount.promoApplied") : t("cart.discount.promoPlaceholder")}
        />
        <button
          type="button"
          disabled={!!selectedAccountDealId || applyingCode}
          onClick={selectedPersonalDeal ? () => { setSelectedPersonalDeal(null); setPromoCodeInput(""); } : handleApplyPromo}
          className="ve-press absolute right-1.5 h-9 px-4 rounded-full text-[14px] font-semibold disabled:cursor-not-allowed"
          style={selectedPersonalDeal ? { color: "var(--ve-ink-2)" } : { backgroundColor: "var(--ve-ink)", color: "#fff" }}
        >
          {applyingCode ? <Loader2 size={15} className="animate-spin" /> : selectedPersonalDeal ? t("cart.discount.promoRemove") : t("cart.discount.promoCheck")}
        </button>
      </div>
      {referralMessage && (
        <p className="flex items-center gap-1.5 px-1 text-[13px] font-medium" style={{ color: referralMessage.ok ? "var(--ve-success)" : "var(--ve-danger)" }}>
          {referralMessage.ok ? <CheckCircle2 size={14} className="shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
          {referralMessage.text}
        </p>
      )}
    </div>
  );

  const renderNoteField = () => (
    <textarea
      rows={2}
      value={formData.note}
      onChange={e => { setFormData({...formData, note: e.target.value}); localStorage.setItem("cart_note", e.target.value); }}
      className="ve-input w-full rounded-[14px] px-4 py-3 font-medium outline-none resize-none"
      style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}
      placeholder={t("cart.fields.notePlaceholderExample")}
    />
  );

  // Dricks (0/10/20/30 + eget) som pills; vald = svart.
  const renderTipGrid = (keyPrefix: string) => (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-2">
        {[0, 10, 20, 30].map((amt) => {
          const isActive = !showCustomTipInput && tipAmount === amt;
          return (
            <button
              key={`${keyPrefix}-tip-${amt}`}
              type="button"
              onClick={() => { setShowCustomTipInput(false); setCustomTipText(""); setTipAmount(amt); }}
              className="ve-chip ve-tabular h-10 rounded-full text-[14px] font-semibold"
              style={isActive
                ? { backgroundColor: "var(--ve-ink)", color: "#fff" }
                : { backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}
            >
              {amt === 0 ? t("cart.tip.none") : `${formatSekAmount(amt)} kr`}
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
          className="ve-chip h-10 rounded-full text-[14px] font-semibold"
          style={showCustomTipInput
            ? { backgroundColor: "var(--ve-ink)", color: "#fff" }
            : { backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}
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
            className="ve-input ve-tabular w-full h-12 rounded-full px-4 pr-12 font-medium outline-none"
            style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-medium" style={{ color: "var(--ve-ink-3)" }}>{t("common.kr")}</span>
        </div>
      )}
    </div>
  );

  // "Mer"-kortet: meddelande, dricks och rabatter som kollapsade rader.
  const renderCartExtras = (keyPrefix: string) => {
    const tipHint = effectiveTip > 0 ? `${formatSekAmount(effectiveTip)} ${t("common.kr")}` : null;
    const discountHint = selectedPersonalDeal
      ? t("cart.discount.promoApplied")
      : selectedAccountDealId
        ? t("cart.discount.activeReward")
        : accountDeals.length > 0
          ? t("cart.discount.available", { count: accountDeals.length })
          : null;
    const discountOpen = !!selectedPersonalDeal || !!selectedAccountDealId;
    const noteHint = formData.note.trim() ? formData.note.trim() : null;
    return (
      <div className="ve-card overflow-hidden">
        <CartCollapsibleRow first label={t("cart.fields.noteLabel")} hint={noteHint} defaultOpen={!!formData.note.trim()}>
          {renderNoteField()}
        </CartCollapsibleRow>
        {orderType === "DELIVERY" && (
          <CartCollapsibleRow label={t("cart.tip.label")} hint={tipHint} defaultOpen={effectiveTip > 0}>
            {renderTipGrid(keyPrefix)}
          </CartCollapsibleRow>
        )}
        <CartCollapsibleRow label={t("cart.discount.promoTitle")} hint={discountHint} defaultOpen={discountOpen}>
          <div className="space-y-3">
            {renderAccountDeals()}
            {renderPromoInput()}
          </div>
        </CartCollapsibleRow>
      </div>
    );
  };

  // "Ofta köpta med" — samma rubrikval som appen: saknas dryck i varukorgen
  // men finns bland förslagen blir det en påminnelse i stället.
  const cartHasDrink = items.some((item: any) => containsDrink(String(item?.name || "")));
  const recommendationsHaveDrink = recommendedProducts.some((product) => containsDrink(product.name));
  const renderRecommendedRail = () => {
    if (recommendedProducts.length === 0) return null;
    return (
      <section className="mt-7">
        {sectionTitle(!cartHasDrink && recommendationsHaveDrink ? "Har du glömt något?" : "Ofta köpta med")}
        <div className="ve-no-scrollbar -mx-4 px-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1">
          {recommendedProducts.map((product) => {
            const price = recommendationPrice(product);
            const image = String(product.imageUrl || "").trim();
            const showImage = image && !failedImageIds.has(product.id);
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => { void handleAddRecommended(product.id); }}
                disabled={addingProductId === product.id}
                className="ve-press w-[128px] shrink-0 snap-start overflow-hidden rounded-[18px] text-left disabled:opacity-60"
                style={{ backgroundColor: "var(--ve-card)", boxShadow: "inset 0 0 0 0.5px var(--ve-line), var(--ve-shadow-card)" }}
              >
                <span className="block h-[96px] w-full overflow-hidden" style={{ backgroundColor: "#EBEBEE" }}>
                  {showImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                      onError={() => {
                        setFailedImageIds((previous) => {
                          if (previous.has(product.id)) return previous;
                          const next = new Set(previous);
                          next.add(product.id);
                          return next;
                        });
                      }}
                    />
                  ) : null}
                </span>
                <span className="block px-3 pt-2.5 pb-3">
                  <span className="line-clamp-2 block min-h-[34px] text-[13px] font-semibold leading-[17px]" style={{ color: "var(--ve-ink)", letterSpacing: "-0.01em" }}>
                    {product.name}
                  </span>
                  <span className="mt-1.5 flex items-center justify-between gap-1">
                    <span className="ve-tabular text-[13.5px] font-semibold" style={{ color: "var(--ve-ink)" }}>{formatSekAmount(price)} kr</span>
                    <span className="w-6 h-6 rounded-full grid place-items-center" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}>
                      {addingProductId === product.id ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} strokeWidth={2.6} />}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  const renderMinOrderBanner = (extraClass = "") =>
    subtotal > 0 && Math.max(0, subtotal - foodDiscountComponent) < effectiveMinOrder && addressZoneStatus !== "error" && (
      <div className={`ve-card px-4 py-3.5 ${extraClass}`} style={topUpToMinimum ? undefined : { backgroundColor: "var(--ve-danger-soft)" }}>
        {(() => {
          const gapToEffective = Math.max(0, Math.ceil(effectiveMinOrder - Math.max(0, subtotal - foodDiscountComponent)));
          const progressBase = effectiveMinOrder > 0 ? effectiveMinOrder : minOrder;
          const progress = Math.min(((Math.max(0, subtotal - foodDiscountComponent)) / progressBase) * 100, 100);
          return (
            <>
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <p className="m-0 text-[14px] font-medium" style={{ color: topUpToMinimum ? "var(--ve-ink)" : "var(--ve-danger)" }}>
                  {topUpToMinimum
                    ? t("cart.minOrder.banner.topUp", { amount: formatSekAmount(gapToEffective) })
                    : t("cart.minOrder.banner.short", { amount: formatSekAmount(gapToEffective) })}
                </p>
                <span className="ve-tabular text-[12.5px] font-medium shrink-0" style={{ color: topUpToMinimum ? "var(--ve-ink-3)" : "var(--ve-danger)" }}>{formatSekAmount(subtotal)} / {formatSekAmount(minOrder)} {t("common.kr")}</span>
              </div>
              <div className="h-1 w-full rounded-full overflow-hidden mb-3" style={{ backgroundColor: topUpToMinimum ? "var(--ve-fill-2)" : "rgba(215,0,21,0.15)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: topUpToMinimum ? "var(--ve-ink)" : "var(--ve-danger)" }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <span className="relative inline-flex h-[26px] w-[44px] shrink-0 items-center rounded-full transition-colors" style={{ backgroundColor: topUpToMinimum ? "var(--ve-success)" : "var(--ve-fill-2)" }}>
                  <input type="checkbox" checked={topUpToMinimum} onChange={(e) => setTopUpToMinimum(e.target.checked)} className="peer sr-only" />
                  <span className="absolute left-[2px] h-[22px] w-[22px] rounded-full bg-white transition-transform" style={{ transform: topUpToMinimum ? "translateX(18px)" : "none", boxShadow: "0 2px 4px rgba(0,0,0,0.18)" }} />
                </span>
                <span className="text-[13.5px] font-medium leading-snug" style={{ color: "var(--ve-ink-2)" }}>
                  {t("cart.minOrder.toggleLabel", { amount: formatSekAmount(gapToEffective) })}
                </span>
              </label>
            </>
          );
        })()}
      </div>
    );

  // Leverans/avhämtning som ETT kort: ikonplatta, titel + tid, adress, status.
  const renderFulfillmentStatus = () => {
    const isDelivery = orderType === "DELIVERY";
    const Icon = isDelivery ? Bike : Store;
    const title = isDelivery ? t("cart.deliveryType.delivery") : t("cart.deliveryType.pickup");
    const detail = isDelivery
      ? (addressInput || t("cart.fields.addressPlaceholderFull"))
      : (cartRestaurantName ? `Hämtas hos ${cartRestaurantName}` : t("cart.deliveryType.pickup"));
    const meta = isDelivery
      ? `~${restaurantSettings.estimatedDeliveryTime} min`
      : `~${restaurantSettings.estimatedPickupTime} min`;
    const zoneError = isDelivery && addressZoneStatus === "error";
    const zoneChecking = isDelivery && (checkingDelivery || addressZoneStatus === "checking");
    return (
      <section className="ve-card px-4 py-3.5 flex items-start gap-3.5">
        <span className="w-10 h-10 rounded-full grid place-items-center shrink-0" style={{ backgroundColor: zoneError ? "var(--ve-danger-soft)" : "var(--ve-fill)" }}>
          <Icon size={18} strokeWidth={2} style={{ color: zoneError ? "var(--ve-danger)" : "var(--ve-ink)" }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="m-0 text-[16px] font-semibold" style={{ color: "var(--ve-ink)", letterSpacing: "-0.01em" }}>{title}</p>
            <span className="ve-tabular text-[13px]" style={{ color: "var(--ve-ink-3)" }}>{meta}</span>
          </div>
          <p className="m-0 mt-0.5 text-[14px] truncate" style={{ color: "var(--ve-ink-2)" }}>{detail}</p>
          {!isDelivery && cartRestaurantAddress ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${cartRestaurantName || ""} ${cartRestaurantAddress}`.trim())}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 block text-[13px] font-medium truncate"
              style={{ color: "var(--ve-ink-3)" }}
            >
              {cartRestaurantAddress}
            </a>
          ) : null}
          {zoneError && (
            <p className="m-0 mt-1 text-[13px] font-medium" style={{ color: "var(--ve-danger)" }}>{t("cart.errors.zoneNotCoveredHome")}</p>
          )}
        </div>
        {zoneChecking ? (
          <Loader2 size={17} className="animate-spin shrink-0 mt-2.5" style={{ color: "var(--ve-ink-3)" }} />
        ) : isDelivery && addressZoneStatus === "ok" ? (
          <span className="w-6 h-6 rounded-full grid place-items-center shrink-0 mt-2" style={{ backgroundColor: "var(--ve-success)" }}>
            <Check size={13} strokeWidth={3} style={{ color: "#fff" }} />
          </span>
        ) : null}
      </section>
    );
  };

  // Dina uppgifter — iOS-grupperade formulärrader utan hjälptexter.
  const renderCustomerDetails = () => {
    const lbl = (bad: boolean) => ({ width: 76, flexShrink: 0, fontSize: 14, fontWeight: 500 as const, whiteSpace: "nowrap" as const, color: bad ? "var(--ve-danger)" : "var(--ve-ink-2)" });
    const inputCls = "ve-input flex-1 min-w-0 h-full bg-transparent outline-none font-medium";
    const inputStyle = { color: "var(--ve-ink)" };
    const errorLine = (text: string) => (
      <p className="m-0 px-4 pb-2.5 -mt-1 text-[12.5px] font-medium" style={{ color: "var(--ve-danger)" }}>{text}</p>
    );

    if (user) {
      const phoneInvalid = formData.customerPhone.length > 0 && formData.customerPhone.replace(/\D/g, '').length < 8;
      return (
        <div className="ve-card overflow-hidden">
          {formData.customerName ? (
            <div className="flex items-center min-h-[52px] px-4">
              <span style={lbl(false)}>{t("cart.fields.name")}</span>
              <span className="flex-1 min-w-0 text-[16px] font-medium truncate" style={{ color: "var(--ve-ink)" }}>{formData.customerName}</span>
            </div>
          ) : null}
          <div className="flex items-center min-h-[52px] px-4" style={{ boxShadow: formData.customerName ? hairline : undefined }}>
            <span style={lbl(phoneInvalid)}>{t("cart.fields.phone")}</span>
            <input value={formData.customerPhone} onChange={e => setFormData({ ...formData, customerPhone: e.target.value })} type="tel" inputMode="tel" autoComplete="tel" className={inputCls} style={inputStyle} placeholder="070 000 00 00" />
            {profilePhone && formData.customerPhone.trim() !== profilePhone.trim() ? (
              <button type="button" onClick={() => setFormData({ ...formData, customerPhone: profilePhone })} className="shrink-0 text-[13px] font-semibold" style={{ color: "var(--ve-accent)" }}>
                Mitt nummer
              </button>
            ) : null}
          </div>
          {phoneInvalid && errorLine(t("cart.errors.phoneTooShort"))}
          <div className="flex items-center min-h-[52px] px-4" style={{ boxShadow: hairline }}>
            <span style={lbl(false)}>E-post</span>
            <input value={formData.customerEmail} onChange={e => setFormData({ ...formData, customerEmail: e.target.value })} type="email" inputMode="email" autoComplete="email" className={inputCls} style={inputStyle} placeholder="För kvittot" />
          </div>
        </div>
      );
    }

    const nameTouched = formData.customerName.length > 0;
    const phoneTouched = formData.customerPhone.length > 0;
    const nameInvalid = nameTouched && formData.customerName.trim().length < 2;
    const phoneInvalid = phoneTouched && formData.customerPhone.replace(/\D/g, '').length < 8;
    const emailInvalid = formData.customerEmail.trim().length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.customerEmail.trim());
    const fields = (
      <>
        <div className="flex items-center min-h-[52px] px-4">
          <span style={lbl(nameInvalid)}>{t("cart.fields.name")}</span>
          <input value={formData.customerName} onChange={e => setFormData({ ...formData, customerName: e.target.value })} autoComplete="name" className={inputCls} style={inputStyle} placeholder={t("cart.fields.namePlaceholder")} />
        </div>
        {nameInvalid && errorLine(t("cart.errors.nameTooShort"))}
        <div className="flex items-center min-h-[52px] px-4" style={{ boxShadow: hairline }}>
          <span style={lbl(phoneInvalid)}>{t("cart.fields.phone")}</span>
          <input value={formData.customerPhone} onChange={e => setFormData({ ...formData, customerPhone: e.target.value })} type="tel" inputMode="tel" autoComplete="tel" className={inputCls} style={inputStyle} placeholder="070 000 00 00" />
        </div>
        {phoneInvalid && errorLine(t("cart.errors.phoneTooShort"))}
        <div className="flex items-center min-h-[52px] px-4" style={{ boxShadow: hairline }}>
          <span style={lbl(emailInvalid)}>E-post</span>
          <input value={formData.customerEmail} onChange={e => setFormData({ ...formData, customerEmail: e.target.value })} type="email" inputMode="email" autoComplete="email" className={inputCls} style={inputStyle} placeholder="För kvittot" />
        </div>
        {emailInvalid && errorLine(t("cart.errors.invalidEmail"))}
      </>
    );
    // Efter första beställningen är uppgifterna redan ifyllda — då räcker en
    // kollapsad rad. Första gången visas fälten direkt.
    if (guestDetailsKnown) {
      return (
        <div className="ve-card overflow-hidden">
          <CartCollapsibleRow
            first
            label={t("cart.yourInfo.title")}
            hint={formData.customerName.trim() || formData.customerPhone.trim() || null}
            icon={<UserIcon size={16} strokeWidth={2} style={{ color: "var(--ve-ink-3)" }} />}
          >
            <div className="-mx-4 -mb-4 overflow-hidden" style={{ boxShadow: "inset 0 0.5px 0 var(--ve-line)" }}>
              {fields}
            </div>
          </CartCollapsibleRow>
        </div>
      );
    }
    return <div className="ve-card overflow-hidden">{fields}</div>;
  };

  const returnFromPayment = () => {
    // En väntande Swish-request ska avbrytas säkert även från Tillbaka-knappen
    // — kunden ska inte behöva hitta den separata Avbryt-knappen.
    if (swishCheckout) {
      void handlePaymentCancelled(swishCheckout.orderId);
      return;
    }
    if (embeddedStripeOrderId) {
      void handlePaymentCancelled(embeddedStripeOrderId);
      return;
    }
    if (pendingOrderId) {
      void handlePaymentCancelled(pendingOrderId);
      return;
    }
    if (selectedCheckoutMethod) {
      setSelectedCheckoutMethod(null);
      setSwishCheckout(null);
      setHostedCheckoutUrl(null);
      setError(null);
      return;
    }
    setPaymentStepOpen(false);
    setError(null);
  };

  const paymentMethods: Array<{
    id: CheckoutMethod;
    label: string;
    hint: string;
    provider: "swish" | "stripe";
  }> = [
    { id: "swish", label: "Swish", hint: "Betala direkt", provider: "swish" },
    { id: "stripe_all", label: "Kort och mer", hint: "Apple Pay, Klarna, kort, Google Pay", provider: "stripe" },
  ];

  // Betalmärken: Swish-loggan i en vit platta; för den samlade Stripe-sidan
  // en rad små, lugna varumärkesmarkeringar (Apple Pay · Klarna · Visa ·
  // Mastercard · G Pay) så kunden ser i förväg vad som väntar.
  const renderMethodMark = (method: CheckoutMethod) => {
    if (method === "swish") {
      return (
        <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-white overflow-hidden" style={{ boxShadow: "inset 0 0 0 0.5px var(--ve-line)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/swish-logo.svg" alt="" className="h-auto w-[34px]" />
        </span>
      );
    }
    return (
      <span aria-hidden="true" className="flex items-center gap-1.5">
        <span className="inline-flex h-[22px] items-center gap-0.5 rounded-[6px] bg-black px-1.5 text-[9px] font-semibold tracking-[-0.03em] text-white">
          <svg viewBox="0 0 384 512" focusable="false" className="h-[11px] w-[9px] fill-current" role="presentation">
            <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.7-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.6-90-61.6-91.9zm-57.5-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
          </svg>
          <span>Pay</span>
        </span>
        <span className="inline-flex h-[22px] items-center rounded-[6px] bg-[#FFB3C7] px-1.5 text-[9px] font-black tracking-[-0.04em] text-black">Klarna.</span>
        <span className="inline-flex h-[22px] items-center rounded-[6px] bg-white px-1.5 text-[10px] font-black italic tracking-[-0.08em] text-[#1434CB]" style={{ boxShadow: "inset 0 0 0 0.5px var(--ve-line)" }}>VISA</span>
        <span className="inline-flex h-[22px] items-center rounded-[6px] bg-white px-1.5" style={{ boxShadow: "inset 0 0 0 0.5px var(--ve-line)" }}>
          <span className="relative h-[13px] w-[21px]">
            <span className="absolute left-0 top-0 h-[13px] w-[13px] rounded-full bg-[#EB001B]" />
            <span className="absolute right-0 top-0 h-[13px] w-[13px] rounded-full bg-[#F79E1B] opacity-90" />
          </span>
        </span>
        <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-[6px] bg-white px-1.5 text-[9px] font-semibold tracking-[-0.04em] text-[#3C4043]" style={{ boxShadow: "inset 0 0 0 0.5px var(--ve-line)" }}><span className="text-[#4285F4]">G</span> Pay</span>
      </span>
    );
  };

  const choosePaymentMethod = (
    event: { preventDefault: () => void },
    method: CheckoutMethod,
  ) => {
    void startCheckout(event, method);
  };

  // En betalrad: märke · titel + undertext · chevron. Kort-raden visar
  // varumärkena under texten.
  const renderPaymentMethodChoice = (method: (typeof paymentMethods)[number], keyPrefix = "", last = false) => (
    <button
      key={`${keyPrefix}${method.id}`}
      type="button"
      onClick={(event) => { choosePaymentMethod(event, method.id); }}
      disabled={loading || embeddedStripeProcessing}
      className="ve-row-press flex w-full items-center gap-3.5 px-4 py-3.5 text-left disabled:opacity-50"
      style={{ boxShadow: last ? undefined : hairline }}
    >
      {method.id === "swish" ? renderMethodMark(method.id) : (
        <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px]" style={{ backgroundColor: "var(--ve-fill)" }}>
          <CreditCard size={19} strokeWidth={2} style={{ color: "var(--ve-ink)" }} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold" style={{ color: "var(--ve-ink)", letterSpacing: "-0.01em" }}>{method.label}</span>
        <span className="mt-0.5 block text-[13px]" style={{ color: "var(--ve-ink-2)" }}>{method.hint}</span>
        {method.id !== "swish" && <span className="mt-2 block">{renderMethodMark(method.id)}</span>}
      </span>
      <ChevronRight size={18} strokeWidth={2.2} className="shrink-0" style={{ color: "var(--ve-ink-3)" }} />
    </button>
  );

  // Kunden väljer betalsätt direkt i kassan. Först när ett val är gjort byter
  // sidan till det fokuserade betalsteget (Swish-väntan eller Stripe-redirect).
  const checkoutBelowMinimum = Math.max(0, subtotal - foodDiscountComponent) < effectiveMinOrder && !topUpToMinimum;
  const checkoutBlocked =
    loading
    || bogoMustPick
    || (!isTestFlow && activeDealBelowMinimum)
    || (!isTestFlow && checkoutBelowMinimum)
    || (!isTestFlow && !restaurantSettings.isOpen)
    || (!isTestFlow && addressZoneStatus === "error")
    || (!isTestFlow && addressZoneStatus === "checking");

  const renderCheckoutMethods = (keyPrefix: string) => {
    const methods = paymentMethods.filter((method) => availablePaymentProviders.includes(method.provider));
    if (checkoutBlocked) {
      return (
        <button
          type="button"
          disabled
          className="flex h-[54px] w-full items-center justify-center gap-2.5 rounded-full px-5 text-[16px] font-semibold"
          style={{ backgroundColor: "var(--ve-fill-2)", color: "var(--ve-ink-3)" }}
        >
          {loading
            ? <Loader2 className="animate-spin" size={20} />
            : bogoMustPick
              ? t("cart.bogo.mustPick")
              : addressZoneStatus === "checking"
                ? <><Loader2 className="animate-spin" size={18} /> {t("cart.submit.checking")}</>
                : checkoutBelowMinimum
                  ? t("cart.submit.short", { amount: formatSekAmount(Math.ceil(effectiveMinOrder - Math.max(0, subtotal - foodDiscountComponent))) })
                  : addressZoneStatus === "error"
                    ? t("cart.submit.zoneError")
                    : t("cart.submit")}
        </button>
      );
    }
    return (
      <div className="space-y-3">
        {methods.length > 0 && (
          <div className="ve-card overflow-hidden">
            {methods.map((method, i) => renderPaymentMethodChoice(method, keyPrefix, i === methods.length - 1))}
          </div>
        )}
        {!paymentProvidersLoaded && (
          <p className="ve-card m-0 flex items-center justify-center gap-2 px-4 py-3.5 text-[14px]" style={{ color: "var(--ve-ink-3)" }}>
            <Loader2 size={16} className="animate-spin" /> Hämtar betalsätt…
          </p>
        )}
        {paymentProvidersLoaded && methods.length === 0 && (
          <p className="m-0 rounded-[18px] px-4 py-3.5 text-[14px] font-medium" style={{ backgroundColor: "var(--ve-danger-soft)", color: "var(--ve-danger)" }}>
            Inget betalsätt är tillgängligt just nu.
          </p>
        )}
      </div>
    );
  };

  const renderErrorCard = (extraClass = "") => error ? (
    <div role="alert" className={`rounded-[18px] px-4 py-3.5 text-[14px] leading-5 ${extraClass}`} style={{ backgroundColor: "var(--ve-danger-soft)", color: "var(--ve-danger)" }}>
      <p className="m-0 font-medium">{error}</p>
      {pendingOrderId && (
        <button type="button" onClick={() => { void handlePaymentCancelled(pendingOrderId); }} className="ve-press mt-3 h-9 rounded-full px-4 text-[13.5px] font-semibold" style={{ backgroundColor: "var(--ve-danger)", color: "#fff" }}>
          Avbryt väntande betalning säkert
        </button>
      )}
    </div>
  ) : null;

  const renderPaymentStep = () => {
    // Hosted-sidan behöver ingen publishable key i klienten — Stripe äger
    // hela betalsidan. Endast providerlistan från servern styr synligheten.
    const methods = paymentMethods.filter((method) =>
      availablePaymentProviders.includes(method.provider),
    );
    const heading = selectedCheckoutMethod ? paymentMethods.find((method) => method.id === selectedCheckoutMethod)?.label || "Betalning" : "Välj betalsätt";
    return (
      <div className="mx-auto w-full max-w-[680px]">
        <div className="flex items-center gap-3 mb-5">
          <button
            type="button"
            onClick={returnFromPayment}
            // Under en väntande Swish-request pågår statuspollning
            // (verifyingPayment) — då ska Tillbaka ändå fungera och göra samma
            // säkra avbryt som Avbryt-knappen, inte vara en död knapp.
            disabled={loading || embeddedStripeProcessing || cancellingPayment || (verifyingPayment && !swishCheckout)}
            aria-label={selectedCheckoutMethod || pendingOrderId ? "Tillbaka till betalsätt" : "Tillbaka till kassan"}
            className="ve-press w-10 h-10 rounded-full grid place-items-center disabled:opacity-40"
            style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}
          >
            <ChevronLeft size={20} strokeWidth={2.4} className="-ml-0.5" />
          </button>
          <div className="min-w-0">
            <h1 className="m-0 text-[24px] font-semibold leading-tight" style={{ color: "var(--ve-ink)", letterSpacing: "-0.022em" }}>{heading}</h1>
            <p className="m-0 mt-0.5 text-[13.5px] truncate" style={{ color: "var(--ve-ink-3)" }}>
              {cartRestaurantName ? `${cartRestaurantName} · ` : ""}{orderType === "DELIVERY" ? "Leverans" : "Avhämtning"}
            </p>
          </div>
          <div className="ml-auto text-right shrink-0">
            <p className="m-0 text-[12px]" style={{ color: "var(--ve-ink-3)" }}>Att betala</p>
            <p className="ve-tabular m-0 text-[20px] font-semibold leading-tight" style={{ color: "var(--ve-ink)", letterSpacing: "-0.02em" }}>{formatSekAmount(total)} kr</p>
          </div>
        </div>

        {renderErrorCard("mb-4")}

        {swishCheckout ? (
          <section className="ve-card px-5 py-7 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-[16px] bg-white" style={{ boxShadow: "inset 0 0 0 0.5px var(--ve-line)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/swish-logo.svg" alt="Swish" className="h-auto w-[42px]" />
            </div>
            <p className="mx-auto mt-4 max-w-sm text-[15px] leading-[1.45]" style={{ color: "var(--ve-ink-2)" }}>
              {isHandheld
                ? "Godkänn belopp och mottagare i Swish. Om appen inte öppnades kan du använda knappen nedan."
                : "Skanna QR-koden med Swish-appen. Beloppet är redan ifyllt och betalningen verifieras automatiskt."}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {!isHandheld && <img src={swishCheckout.qrCode} alt="QR-kod för Swish-betalningen" className="mx-auto mt-5 h-52 w-52 rounded-[20px] bg-white p-2" style={{ boxShadow: "inset 0 0 0 0.5px var(--ve-line)" }} />}
            {/* target="_top" i embedden: en cross-origin iframe får bara
                lämna till ett custom-schema via en top-navigation med
                användaraktivering. onClick ber dessutom partnersidan göra
                hoppet, så knappen fungerar även om browsern stoppar det
                ena spåret. Swish visar samma betalning oavsett vilket som
                vinner — token:en är densamma. */}
            <a
              href={swishCheckout.appUrl}
              target={embedMode ? "_top" : undefined}
              rel="noopener"
              onClick={() => { if (embedMode) openSwishApp(swishCheckout.appUrl); }}
              className="ve-press mt-6 flex h-[54px] w-full items-center justify-center gap-2 rounded-full px-5 text-[16px] font-semibold"
              style={{ backgroundColor: "var(--ve-cta)", color: "var(--ve-cta-ink)" }}
            >
              {isHandheld ? "Öppna Swish" : "Öppna Swish på den här enheten"} <ArrowRight size={18} />
            </a>
            <button type="button" onClick={() => { void handlePaymentCancelled(swishCheckout.orderId); }} className="mt-3 h-10 px-4 text-[14px] font-medium" style={{ color: "var(--ve-ink-2)" }}>
              Avbryt betalningen säkert
            </button>
          </section>
        ) : verifyingPayment ? (
          <section className="ve-card flex min-h-64 flex-col items-center justify-center gap-3 px-5 py-10 text-center">
            <Loader2 size={28} className="animate-spin" style={{ color: "var(--ve-ink)" }} />
            <h2 className="m-0 text-[18px] font-semibold" style={{ color: "var(--ve-ink)", letterSpacing: "-0.015em" }}>{cancellingPayment ? "Avslutar betalningsförsöket" : "Verifierar betalningen"}</h2>
            <p className="m-0 max-w-sm text-[14px] leading-5" style={{ color: "var(--ve-ink-2)" }}>
              {cancellingPayment
                ? "Vi stänger det gamla försöket automatiskt. När avbrottet är bekräftat visas betalsätten igen med varukorgen kvar."
                : "Väntar på betalningsbekräftelse."}
            </p>
          </section>
        ) : hostedCheckoutUrl ? (
          <section className="ve-card px-5 py-7 text-center">
            <p className="m-0 text-[15px] leading-[1.45]" style={{ color: "var(--ve-ink-2)" }}>Betalningen öppnas på den översta sidan för att fungera i restaurangens inbäddade kassa.</p>
            <a href={hostedCheckoutUrl} target="_top" rel="noopener" className="ve-press mt-6 flex h-[54px] w-full items-center justify-center gap-2 rounded-full px-5 text-[16px] font-semibold" style={{ backgroundColor: "var(--ve-cta)", color: "var(--ve-cta-ink)" }}>Öppna säker betalning <ArrowRight size={18} /></a>
          </section>
        ) : selectedCheckoutMethod && loading ? (
          <section className="ve-card flex min-h-56 flex-col items-center justify-center gap-3 px-5 py-8 text-center">
            <Loader2 size={26} className="animate-spin" style={{ color: "var(--ve-ink)" }} />
            <p className="m-0 text-[14px]" style={{ color: "var(--ve-ink-2)" }}>Öppnar säker betalning…</p>
          </section>
        ) : pendingOrderId ? (
          <section className="ve-card flex min-h-56 flex-col items-center justify-center gap-3 px-5 py-8 text-center">
            <span className="w-11 h-11 rounded-full grid place-items-center" style={{ backgroundColor: "var(--ve-accent-soft)" }}>
              <AlertCircle size={22} style={{ color: "var(--ve-accent)" }} />
            </span>
            <p className="m-0 max-w-md text-[14px] leading-5" style={{ color: "var(--ve-ink-2)" }}>Det tidigare betalningsförsöket kan fortfarande behandlas. Öppningslänken är dold för att undvika en oavsiktlig debitering. Vänta på status eller avbryt säkert.</p>
            <button type="button" onClick={() => { void handlePaymentCancelled(pendingOrderId); }} className="ve-press mt-1 h-10 rounded-full px-5 text-[14px] font-semibold" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}>Avbryt väntande betalning säkert</button>
          </section>
        ) : (
          <div className="space-y-3">
            {/* Valen görs i kassan. Hamnar man ändå här utan aktivt försök
                (t.ex. efter en avbruten retur) leder raderna tillbaka dit. */}
            <div className="ve-card overflow-hidden">
              {methods.map((method, i) => renderPaymentMethodChoice(method, "step-", i === methods.length - 1))}
            </div>
            {payDebug && (
              <p className="m-0 rounded-[12px] px-3 py-2 text-center font-mono text-[10.5px]" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink-2)" }}>
                paydebug · pk: {stripePublishableKey ? (stripePublishableKey.startsWith("pk_live_") ? "live" : "test") : "saknas"}
                {" · "}providers: {availablePaymentProviders.join("+") || "inga"}
                {" · "}embed: {embedMode ? "ja" : "nej"}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  // Summering — rader i ett kort, totalen tydlig i bläck (inte orange).
  const summaryRow = (label: React.ReactNode, value: React.ReactNode, tone: "default" | "success" | "warn" = "default") => (
    <div className="flex items-baseline justify-between gap-4 text-[15px]" style={{ color: tone === "success" ? "var(--ve-success)" : tone === "warn" ? "var(--ve-accent)" : "var(--ve-ink-2)" }}>
      <span className="min-w-0 truncate">{label}</span>
      <span className="ve-tabular shrink-0 font-medium" style={{ color: tone === "default" ? "var(--ve-ink)" : undefined }}>{value}</span>
    </div>
  );

  const renderDiscountRow = () => {
    // Display-källan ska matcha vad som FAKTISKT appliceras på totalen.
    // Ordningen matchar finalDiscount-prioriteten:
    //   1. Användarens kupong  2. Vald account-deal  3. Pure-discount BOGO
    //   4. Free-item BOGO (visas som Gratis-rad i listan, inte här)
    //   5. Client-side automaticDeal
    // Har kunden gjort ett explicit val visas BARA det.
    if (selectedPersonalDeal) {
      if (personalDiscount <= 0) {
        return (selectedPersonalDeal.campaign.minOrder || 0) > subtotal
          ? summaryRow(selectedPersonalDeal.code, t("cart.summary.discountPendingMin", { amount: formatSekAmount(selectedPersonalDeal.campaign.minOrder || 0) }), "warn")
          : null;
      }
      return summaryRow(t("cart.summary.coupon", { code: selectedPersonalDeal.code }), `−${formatSekAmount(personalDiscount)} kr`, "success");
    }
    if (selectedAccountDealId) {
      if (accountDealDiscount <= 0) {
        return selectedAccountDeal && (selectedAccountDeal.minOrderKr ?? 0) > subtotal
          ? summaryRow(formatDealLabel(selectedAccountDeal, t), t("cart.summary.discountPendingMin", { amount: formatSekAmount(selectedAccountDeal.minOrderKr ?? 0) }), "warn")
          : null;
      }
      return summaryRow(selectedAccountDeal ? dealTypeLabel(selectedAccountDeal.type, t) : t("cart.summary.reward"), `−${formatSekAmount(accountDealDiscount)} kr`, "success");
    }
    if (!automaticDealDismissed && welcomeDiscount > 0 && welcomeDiscount >= automaticDeal.discountAmount && welcomeDiscount >= bogoDiscount) {
      return summaryRow(welcomeOffer?.title, `−${formatSekAmount(welcomeDiscount)} kr`, "success");
    }
    if (!automaticDealDismissed && bogoPreview && !bogoPreview.isPickReward && bogoDiscount > 0) {
      return summaryRow(bogoChoice && !bogoIsPureDiscount ? bogoChoice.product.name : bogoPreview.dealTitle, `−${formatSekAmount(bogoDiscount)} kr`, "success");
    }
    if (!automaticDealDismissed && automaticDeal.deal && automaticDeal.discountAmount > 0) {
      return summaryRow(automaticDeal.deal.title, `−${formatSekAmount(automaticDeal.discountAmount)} kr`, "success");
    }
    return null;
  };

  const renderSummary = () => (
    <section className="ve-card px-4 py-4 space-y-2.5">
      {summaryRow(t("cart.summary.subtotal"), `${formatSekAmount(subtotal)} kr`)}
      {orderType === "DELIVERY" && summaryRow(t("cart.summary.deliveryFee"), addressZoneStatus === "checking" ? t("cart.summary.deliveryCalculating") : (deliveryFee === 0 ? "Gratis" : `${formatSekAmount(deliveryFee)} kr`))}
      {effectiveTip > 0 && summaryRow(t("cart.summary.tip"), `${formatSekAmount(effectiveTip)} kr`)}
      {minOrderTopUp > 0 && summaryRow(t("cart.summary.minOrderTopUp"), `${formatSekAmount(minOrderTopUp)} kr`)}
      {renderDiscountRow()}
      {typeof vatPercent === "number" && summaryRow(t("cart.summary.vat", { percent: vatPercent }), `${formatSekAmount(vatAmount)} kr`)}
      <div className="flex items-baseline justify-between gap-4 pt-3 mt-1" style={{ boxShadow: "inset 0 0.5px 0 var(--ve-line)" }}>
        <span className="text-[17px] font-semibold" style={{ color: "var(--ve-ink)", letterSpacing: "-0.015em" }}>{t("cart.summary.total")}</span>
        <span className="ve-tabular text-[22px] font-semibold" style={{ color: "var(--ve-ink)", letterSpacing: "-0.02em" }}>{formatSekAmount(total)} kr</span>
      </div>
    </section>
  );

  const menuHref = embedMode ? embedMenuHref : (cartRestaurantSlug ? `/restaurants/${cartRestaurantSlug}` : "/");

  // Varukorgsrad: bild · namn + tillval (tryck = ändra) · pris + stepper.
  const renderCartItem = (item: (typeof items)[number], idx: number) => {
    const last = idx === items.length - 1;
    const extrasText = item.extras.map((e) => ((e.quantity ?? 1) > 1 ? `${e.name} ×${e.quantity}` : e.name)).join(" · ");
    const lineTotal = item.price * item.quantity;
    return (
      <motion.div key={item.cartItemId} layout className="mx-4 flex items-center gap-3 py-3" style={{ boxShadow: last ? undefined : hairline }}>
        {item.imageUrl ? (
          <span className="relative shrink-0 w-[60px] h-[60px] rounded-[14px] overflow-hidden" style={{ backgroundColor: "#EBEBEE" }}>
            <PlainImage src={item.imageUrl} alt="" width={128} className="absolute inset-0 w-full h-full object-cover" />
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => handleEditCartItem(item)}
          className="text-left flex-1 min-w-0 py-0.5"
          aria-label={`${t("cart.tapToEdit")}: ${item.name}`}
        >
          <span className="block text-[16px] font-semibold leading-snug line-clamp-2" style={{ color: "var(--ve-ink)", letterSpacing: "-0.015em" }}>{item.name}</span>
          {extrasText && (
            <span className="block text-[13px] truncate mt-0.5" style={{ color: "var(--ve-ink-2)" }}>{extrasText}</span>
          )}
          {item.note && (
            <span className="block text-[12.5px] truncate mt-0.5 italic" style={{ color: "var(--ve-ink-3)" }}>{item.note}</span>
          )}
        </button>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {item.bogoFreeFromDealId ? (
            <span className="text-[13px] font-semibold rounded-full px-2 py-0.5" style={{ backgroundColor: "var(--ve-accent-soft)", color: "var(--ve-accent)" }}>{t("cart.bogo.freeTag")}</span>
          ) : item.catalogDiscountApplied && typeof item.originalPrice === "number" && item.originalPrice > item.price ? (
            <span className="ve-tabular flex items-baseline gap-1.5">
              <span className="text-[15px] font-semibold" style={{ color: "var(--ve-ink)" }}>{formatSekAmount(lineTotal)} kr</span>
              <span className="text-[12.5px] line-through" style={{ color: "var(--ve-ink-3)" }}>{formatSekAmount(item.originalPrice * item.quantity)}</span>
            </span>
          ) : (
            <span className="ve-tabular text-[15px] font-semibold" style={{ color: "var(--ve-ink)" }}>{formatSekAmount(lineTotal)} kr</span>
          )}
          <div className="flex items-center h-8 rounded-full" style={{ backgroundColor: "var(--ve-fill)" }}>
            <button
              type="button"
              onClick={() => { if (item.quantity === 1) { removeItem(item.cartItemId); } else { updateQuantity(item.cartItemId, -1); } }}
              className="w-8 h-8 rounded-full grid place-items-center transition-opacity active:opacity-60"
              style={{ color: "var(--ve-ink)" }}
              aria-label={item.quantity === 1 ? "Ta bort" : "Minska antal"}
            >
              {item.quantity === 1 ? <Trash2 size={13} strokeWidth={2.2} /> : <Minus size={13} strokeWidth={2.6} />}
            </button>
            <span className="ve-tabular min-w-[16px] text-center text-[14px] font-semibold" style={{ color: "var(--ve-ink)" }}>{item.quantity}</span>
            <button
              type="button"
              onClick={() => updateQuantity(item.cartItemId, 1)}
              className="w-8 h-8 rounded-full grid place-items-center transition-opacity active:opacity-60"
              style={{ color: "var(--ve-ink)" }}
              aria-label="Öka antal"
            >
              <Plus size={13} strokeWidth={2.6} />
            </button>
          </div>
        </div>
      </motion.div>
    );
  };

  const renderNotice = (key: string, text: string, onClose: () => void) => (
    <motion.div
      key={key}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="mb-4 rounded-[18px] px-4 py-3 flex items-start gap-3"
      style={{ backgroundColor: "var(--ve-accent-soft)" }}
    >
      <AlertCircle size={16} className="shrink-0 mt-0.5" style={{ color: "var(--ve-accent)" }} />
      <p className="m-0 flex-1 text-[14px] font-medium leading-snug" style={{ color: "var(--ve-ink)" }}>{text}</p>
      <button onClick={onClose} className="shrink-0 w-6 h-6 rounded-full grid place-items-center" style={{ backgroundColor: "rgba(240,79,26,0.12)", color: "var(--ve-accent)" }} aria-label={t("common.close")}>
        <X size={12} strokeWidth={3} />
      </button>
    </motion.div>
  );

  return (
    <div className="ve-root min-h-screen pb-32 md:pt-20">
      <div className="max-w-[680px] mx-auto px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] md:pt-6">
        {paymentStepOpen ? renderPaymentStep() : (
          <>
            {/* Rubrik: tillbaka · Varukorg · restaurang + leveranssätt */}
            <header className="flex items-center gap-3 mb-5">
              <Link href={menuHref} aria-label={t("common.back")} className="ve-press w-10 h-10 rounded-full grid place-items-center shrink-0" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}>
                <ChevronLeft size={20} strokeWidth={2.4} className="-ml-0.5" />
              </Link>
              <div className="min-w-0 flex-1">
                <h1 className="m-0 text-[26px] font-semibold leading-tight" style={{ color: "var(--ve-ink)", letterSpacing: "-0.024em" }}>{t("cart.heading.prefix")}</h1>
                <p className="m-0 mt-0.5 text-[13.5px] truncate" style={{ color: "var(--ve-ink-3)" }}>
                  {cartRestaurantName ? (
                    <Link href={menuHref} className="font-medium" style={{ color: "var(--ve-ink-2)" }}>{cartRestaurantName}</Link>
                  ) : null}
                  {cartRestaurantName && <span className="mx-1.5">·</span>}
                  {orderType === "DELIVERY"
                    ? `${t("cart.deliveryType.delivery")} ~${restaurantSettings.estimatedDeliveryTime} min`
                    : t("cart.deliveryType.pickup")}
                </p>
              </div>
            </header>

            <AnimatePresence>
              {bogoLostNotice && renderNotice("bogo-lost", bogoLostNotice, () => setBogoLostNotice(null))}
              {menuChangedNotice && renderNotice("menu-changed", menuChangedNotice, () => setMenuChangedNotice(null))}
            </AnimatePresence>

            {/* Varorna */}
            <section className="ve-card overflow-hidden">
              {items.map((item, idx) => renderCartItem(item, idx))}
              <Link href={menuHref} className="ve-row-press flex items-center gap-3 px-4 py-3.5" style={{ boxShadow: hairline }}>
                <span className="w-8 h-8 rounded-full grid place-items-center shrink-0" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}>
                  <Plus size={15} strokeWidth={2.6} />
                </span>
                <span className="flex-1 text-[15px] font-medium" style={{ color: "var(--ve-ink)" }}>{t("cart.addMore")}</span>
                <ChevronRight size={17} strokeWidth={2.2} style={{ color: "var(--ve-ink-3)" }} />
              </Link>
            </section>

            {renderRecommendedRail()}

            {/* BOGO: välj gratisvara / valda gratisvaror */}
            {bogoPreview && bogoPicksRemaining > 0 && bogoPreview.rewardProducts.length > 0 && (
              <motion.button
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setShowBogoPicker(true)}
                className="ve-press ve-card mt-6 w-full px-4 py-3.5 text-left flex items-center gap-3.5"
                style={{ backgroundColor: "var(--ve-ink)", color: "#fff" }}
              >
                <span className="shrink-0 w-10 h-10 rounded-full grid place-items-center" style={{ backgroundColor: "rgba(255,255,255,0.14)" }}>
                  <Gift size={18} strokeWidth={2.2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold" style={{ letterSpacing: "-0.01em" }}>
                    {bogoPickedCount > 0
                      ? (bogoPicksRemaining === 1 ? t("cart.bogo.pickMoreOne") : t("cart.bogo.pickMoreMany", { count: bogoPicksRemaining }))
                      : t("cart.bogo.pickFree")}
                  </span>
                  <span className="block text-[13px] mt-0.5 line-clamp-1 opacity-70">
                    {bogoPickedCount > 0
                      ? t("cart.bogo.progress", { picked: bogoPickedCount, max: bogoMaxFreeItems })
                      : bogoMaxFreeItems > 1
                        ? t("cart.bogo.canPickMany", { max: bogoMaxFreeItems })
                        : (bogoPreview.rewardCategoryName
                            ? t("cart.bogo.notPickedNamed", { name: bogoPreview.rewardCategoryName.toLowerCase() })
                            : t("cart.bogo.notPickedGeneric"))}
                  </span>
                </span>
                <ChevronRight size={18} strokeWidth={2.2} className="shrink-0 opacity-70" />
              </motion.button>
            )}
            {bogoPreview && bogoPickedCount > 0 && bogoPicksRemaining === 0 && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="ve-card mt-6 px-4 py-3.5 flex items-center gap-3.5">
                <span className="shrink-0 w-10 h-10 rounded-full grid place-items-center" style={{ backgroundColor: "var(--ve-success-soft)" }}>
                  <Gift size={18} strokeWidth={2.2} style={{ color: "var(--ve-success)" }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold" style={{ color: "var(--ve-ink)" }}>
                    {bogoMaxFreeItems === 1 ? t("cart.bogo.pickedOne") : t("cart.bogo.pickedMany", { count: bogoPickedCount })}
                  </span>
                  <span className="block text-[13px] mt-0.5 truncate" style={{ color: "var(--ve-ink-3)" }}>{bogoPreview.dealTitle}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    items.filter((i) => i.bogoFreeFromDealId === bogoPreview.dealId).forEach((i) => removeItem(i.cartItemId));
                    setShowBogoPicker(true);
                  }}
                  className="ve-press shrink-0 h-9 rounded-full px-4 text-[13.5px] font-semibold"
                  style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}
                >
                  {t("cart.bogo.swap")}
                </button>
              </motion.div>
            )}

            {/* Deal-tröskel */}
            {dealNudge && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="ve-card mt-6 px-4 py-3.5">
                <div className="flex items-center justify-between gap-3 mb-2.5">
                  <p className="m-0 text-[14px] font-medium" style={{ color: "var(--ve-ink)" }}>
                    {t("cart.dealNudge.remaining", { amount: formatSekAmount(dealNudge.missing), reward: formatCartDealReward(dealNudge.deal) })}
                  </p>
                  <Tag size={14} className="shrink-0" style={{ color: "var(--ve-ink-3)" }} />
                </div>
                <div className="h-1 w-full rounded-full overflow-hidden" style={{ backgroundColor: "var(--ve-fill-2)" }}>
                  <motion.div className="h-full rounded-full" style={{ backgroundColor: "var(--ve-ink)" }} initial={{ width: 0 }} animate={{ width: `${Math.min((subtotal / dealNudge.deal.minOrder) * 100, 100)}%` }} transition={{ duration: 0.5, ease: "easeOut" }} />
                </div>
              </motion.div>
            )}

            {/* Leverans / avhämtning */}
            <div className="mt-6">{renderFulfillmentStatus()}</div>

            {/* Dina uppgifter */}
            <section className="mt-7">
              {sectionTitle(t("cart.yourInfo.title"))}
              {renderCustomerDetails()}
            </section>

            {/* Meddelande · dricks · rabatter */}
            <section className="mt-7">
              {renderCartExtras("mb")}
            </section>

            {/* Min-order-banner: bara när kunden ligger UNDER effektiv min-gräns
                (min − tolerans) och adressen inte redan blockerar. */}
            {renderMinOrderBanner("mt-6")}

            {/* Summering */}
            <div className="mt-7">{renderSummary()}</div>

            {renderErrorCard("mt-4")}

            {/* Betala med — Swish eller kort via hostad sida. Extra bottenluft
                så raderna klarar hemindikatorn i den installerade PWA:n. */}
            <section className="mt-7" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)" }}>
              {!checkoutBlocked && sectionTitle("Betala med")}
              {renderCheckoutMethods("mb-")}
            </section>
          </>
        )}
      </div>

      <AnimatePresence>
        {addingProduct && (
          <ProductSheet
            product={addingProduct}
            restaurantId={cartRestaurantId || addingProduct.restaurantId}
            restaurantSlug={cartRestaurantSlug || undefined}
            onClose={() => setAddingProduct(null)}
          />
        )}
      </AnimatePresence>

      {/* Cart item edit */}
      <AnimatePresence>
        {editingCartItem && (
          <ProductSheet
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
