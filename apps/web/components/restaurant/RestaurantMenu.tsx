"use client";

import { useEffect, useState, useCallback, useRef, useMemo, type ReactNode } from "react";
import axios from "axios";
import type { Socket } from "socket.io-client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import {
  Search, Info, ChevronLeft, MapPin, Phone, Mail, Clock, Star, X,
  AlertTriangle, Heart, Plus, Utensils, Store, Bike, ChevronRight,
} from "lucide-react";
import { API_URL, SOCKET_URL } from "@/lib/api";
import { ensureKioskAccess } from "@/lib/kioskAccessClient";
import { EMBED_PARENT_ORIGIN_PARAM, rememberEmbedParentOrigin, trustedPartnerOrigin } from "@/lib/embedPartner";
import { useDesignBackground } from "./useDesignBackground";
import "./restaurant.css";
import { menuWithDeals, DEALS_CATEGORY_ID } from "@/lib/menuDealCategory";
import { PublicDeal } from "@/lib/deals";
import { useCartStore } from "@/store/cartStore";
import { useFavorites } from "@/lib/favoritesStore";
import { type BogoPickerProduct } from "@/components/BogoPickerModal";
import { useTranslation } from "@/lib/i18n/LocaleProvider";
import { trackJourney } from "@/lib/journey";
import { rehydrateMenuCategories, MENU_FORMAT_PARAM } from "@/lib/menu";
import { optimizedImageUrl, RESTAURANT_HERO_IMAGE_QUALITY, RESTAURANT_HERO_IMAGE_WIDTH } from "@/lib/imageOptimization";
import PreviouslyOrderedBar from "@/components/PreviouslyOrderedBar";
import PlainImage from "./PlainImage";
import CartBar from "./CartBar";

const ProductSheet = dynamic(() => import("./ProductSheet"), { ssr: false });
const AddressModal = dynamic(() => import("@/components/AddressModal"), { ssr: false });
const BogoPickerModal = dynamic(() => import("@/components/BogoPickerModal"), { ssr: false });

/**
 * RestaurantMenu — den fristående restaurangsidan (/restaurants/[slug]).
 *
 * Ersatte MenuContent på den publika sidan 2026-09-16 (ny design, se
 * docs/DESIGN_SYSTEM.md). Logiken (zonkoll, adressgrind, leverans/avhämtning,
 * socket-uppdateringar, scroll-spy, BOGO, deeplink ?product=) är porterad rad
 * för rad från MenuContent, som lever kvar för partner-embedden (/embed/[slug]).
 */
interface InitialData { categories?: any[]; deals?: PublicDeal[]; restaurant?: any }
interface Props {
  restaurantSlug: string;
  initialData?: InitialData | null;
  /** Partner-embed (/embed/[slug]): håller kunden i iframe-flödet, döljer
   *  discovery-/profilfunktioner och märker anropen med channel=partner_embed. */
  embedMode?: boolean;
}

type OrderType = "DELIVERY" | "PICKUP";

// Lokalt (localhost) går klientanropen via Next-proxyn (/api → API_PROXY_TARGET)
// så CORS inte stoppar dem; i drift används samma absoluta API som resten av
// sajten. Socketen följer samma regel — via proxyn tvingas polling först
// eftersom dev-servern inte vidarebefordrar WebSocket-uppgraderingar.
const isLocalHost = () => typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
const apiBase = () => (isLocalHost() ? "" : API_URL);
const socketTarget = () =>
  isLocalHost()
    ? { url: window.location.origin, transports: ["polling", "websocket"] }
    : { url: SOCKET_URL, transports: ["websocket", "polling"] };

// ─── Pris-helpers ──────────────────────────────────────────────────────────
function getDisplayPrice(p: any): { final: number; original: number | null } {
  if (typeof p.discountPrice === "number" && p.discountPrice > 0 && p.discountPrice < p.price) return { final: p.discountPrice, original: p.price };
  if (typeof p.discountPercent === "number" && p.discountPercent > 0) {
    const final = Math.max(0, Math.round(p.price - (p.price * p.discountPercent) / 100));
    if (final < p.price) return { final, original: p.price };
  }
  return { final: p.price, original: null };
}

/** "från" visas bara när priset faktiskt kan öka via ett obligatoriskt val. */
function hasVariablePrice(p: any): boolean {
  return (p.extraGroups ?? []).some((g: any) => g?.required && (g.extras ?? []).some((e: any) => (e.priceAddon ?? 0) > 0));
}

function PriceLine({ product, size = "md" }: { product: any; size?: "sm" | "md" }) {
  const { final, original } = getDisplayPrice(product);
  const pct = original != null && original > final ? Math.round((1 - final / original) * 100) : 0;
  const variable = hasVariablePrice(product);
  const main = size === "sm" ? "text-[14px]" : "text-[15px]";
  return (
    <div className="ve-tabular flex items-baseline gap-2 min-w-0 flex-wrap">
      <span className={`${main} font-semibold`} style={{ color: "var(--ve-ink)" }}>
        {variable && <span className="font-medium" style={{ color: "var(--ve-ink-3)" }}>från </span>}
        {final} kr
      </span>
      {pct > 0 && (
        <>
          <span className="text-[13px] line-through" style={{ color: "var(--ve-ink-3)" }}>{original} kr</span>
          <span className="text-[11.5px] font-semibold rounded-full px-1.5 py-[2px]" style={{ backgroundColor: "var(--ve-accent-soft)", color: "var(--ve-accent)" }}>−{pct} %</span>
        </>
      )}
    </div>
  );
}

function DietTags({ product, className = "" }: { product: any; className?: string }) {
  const { t } = useTranslation();
  const tags = [
    product.isVegan && t("menu.diet.vegan"),
    product.isVegetarian && !product.isVegan && t("menu.diet.vegetarian"),
    product.isGlutenFree && t("menu.diet.glutenFree"),
  ].filter(Boolean) as string[];
  if (!tags.length) return null;
  return (
    <span className={`flex items-center gap-1 ${className}`}>
      {tags.map((tag) => (
        <span key={tag} className="text-[11px] font-medium rounded-full px-1.5 py-[2px]" style={{ backgroundColor: "var(--ve-success-soft)", color: "var(--ve-success)" }}>{tag}</span>
      ))}
    </span>
  );
}

// ─── Produktrader ──────────────────────────────────────────────────────────
function ProductRow({ product, onClick, disabled, last }: { product: any; onClick: () => void; disabled: boolean; last: boolean }) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => { setImgFailed(false); }, [product.imageUrl]);
  const hasImage = Boolean(product.imageUrl) && !imgFailed;
  const showDescription = Boolean(product.description) && !product.hideDescription;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={`ve-row-press w-full text-left ${disabled ? "cursor-not-allowed" : ""}`}
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <span className="mx-4 flex items-center gap-4 py-3.5" style={{ boxShadow: last ? undefined : "inset 0 -0.5px 0 var(--ve-line)" }}>
        <span className="flex-1 min-w-0 flex flex-col gap-1 py-0.5">
          <span className="text-[16px] font-semibold leading-snug line-clamp-2" style={{ color: "var(--ve-ink)", letterSpacing: "-0.015em" }}>{product.name}</span>
          {showDescription && (
            <span className="text-[13.5px] leading-snug line-clamp-2" style={{ color: "var(--ve-ink-2)" }}>{product.description}</span>
          )}
          <span className="mt-1 flex items-center gap-2 flex-wrap">
            <PriceLine product={product} />
            <DietTags product={product} />
          </span>
        </span>
        {hasImage ? (
          <span className="relative shrink-0 w-[88px] h-[88px] rounded-[16px] overflow-hidden" style={{ backgroundColor: "#EBEBEE" }}>
            <PlainImage src={product.imageUrl} alt={product.name} width={256} className="absolute inset-0 w-full h-full object-cover" onFail={() => setImgFailed(true)} />
            <span aria-hidden className="absolute right-1.5 bottom-1.5 w-7 h-7 rounded-full grid place-items-center" style={{ backgroundColor: "rgba(255,255,255,0.92)", color: "var(--ve-ink)", boxShadow: "0 1px 4px rgba(0,0,0,0.14)" }}>
              <Plus size={15} strokeWidth={2.4} />
            </span>
          </span>
        ) : (
          <span aria-hidden className="shrink-0 w-8 h-8 rounded-full grid place-items-center" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}>
            <Plus size={15} strokeWidth={2.4} />
          </span>
        )}
      </span>
    </button>
  );
}

function CompactCard({ product, onClick, disabled }: { product: any; onClick: () => void; disabled: boolean }) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => { setImgFailed(false); }, [product.imageUrl]);
  const hasImage = Boolean(product.imageUrl) && !imgFailed;
  const { final, original } = getDisplayPrice(product);
  const pct = original != null && original > final ? Math.round((1 - final / original) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className="ve-press w-full text-left flex flex-col rounded-[18px] overflow-hidden"
      style={{ backgroundColor: "var(--ve-card-2)", boxShadow: "inset 0 0 0 0.5px var(--ve-line)", opacity: disabled ? 0.45 : 1 }}
    >
      <span className="relative w-full aspect-square overflow-hidden" style={{ backgroundColor: "#EBEBEE" }}>
        {hasImage ? (
          <PlainImage src={product.imageUrl} alt={product.name} width={384} className="absolute inset-0 w-full h-full object-cover" onFail={() => setImgFailed(true)} />
        ) : (
          <span className="absolute inset-0 grid place-items-center"><Utensils size={26} strokeWidth={1.6} style={{ color: "var(--ve-ink-3)", opacity: 0.5 }} /></span>
        )}
        <span aria-hidden className="absolute right-2 bottom-2 w-7 h-7 rounded-full grid place-items-center" style={{ backgroundColor: "rgba(255,255,255,0.92)", color: "var(--ve-ink)", boxShadow: "0 1px 4px rgba(0,0,0,0.14)" }}>
          <Plus size={15} strokeWidth={2.4} />
        </span>
        {pct > 0 && (
          <span className="absolute left-2 top-2 text-[11px] font-semibold px-1.5 py-[3px] rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.92)", color: "var(--ve-accent)" }}>−{pct} %</span>
        )}
      </span>
      <span className="flex flex-col gap-1 px-3 py-2.5">
        <span className="text-[14px] font-semibold leading-snug line-clamp-1" style={{ color: "var(--ve-ink)", letterSpacing: "-0.01em" }}>{product.name}</span>
        <PriceLine product={product} size="sm" />
      </span>
    </button>
  );
}

function renderProducts(products: any[], onOpen: (p: any) => void, disabled: boolean): ReactNode[] {
  const rows: ReactNode[] = [];
  let i = 0;
  while (i < products.length) {
    const p = products[i];
    if (p.displayMode === "COMPACT") {
      const group: any[] = [];
      while (i < products.length && products[i].displayMode === "COMPACT") group.push(products[i++]);
      const isLast = i >= products.length;
      rows.push(
        <div key={`compact-${group[0].id}`} className="mx-4 grid grid-cols-2 gap-3 py-3" style={{ boxShadow: isLast ? undefined : "inset 0 -0.5px 0 var(--ve-line)" }}>
          {group.map((cp) => <CompactCard key={cp.id} product={cp} onClick={() => onOpen(cp)} disabled={disabled} />)}
        </div>,
      );
    } else {
      rows.push(<ProductRow key={p.id} product={p} onClick={() => onOpen(p)} disabled={disabled} last={i === products.length - 1} />);
      i++;
    }
  }
  return rows;
}

// ─── Öppettider (dagens) ───────────────────────────────────────────────────
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function todayHours(openingHours: any): string | null {
  if (!openingHours || typeof openingHours !== "object") return null;
  const day = openingHours[WEEKDAYS[new Date().getDay()]];
  if (!day || day.closed || !Array.isArray(day.shifts) || day.shifts.length === 0) return null;
  return day.shifts.map((s: any) => `${s.open}–${s.close}`).join(", ");
}

// ─── Segmentkontroll (iOS-stil) ────────────────────────────────────────────
function Segmented({ value, onChange, labels }: { value: OrderType; onChange: (v: OrderType) => void; labels: Record<OrderType, string> }) {
  return (
    <div className="relative grid grid-cols-2 p-[3px] rounded-[12px]" style={{ backgroundColor: "var(--ve-fill)" }} role="tablist">
      {(["DELIVERY", "PICKUP"] as const).map((type) => {
        const active = value === type;
        const Icon = type === "DELIVERY" ? Bike : Store;
        return (
          <button
            key={type}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(type)}
            className="relative z-10 h-[38px] rounded-[10px] flex items-center justify-center gap-2 text-[14px] transition-colors"
            style={{ color: active ? "var(--ve-ink)" : "var(--ve-ink-2)", fontWeight: active ? 600 : 500, letterSpacing: "-0.01em" }}
          >
            {active && (
              <motion.span
                layoutId="ve-segment-thumb"
                className="absolute inset-0 rounded-[10px]"
                style={{ backgroundColor: "var(--ve-card)", boxShadow: "var(--ve-shadow-thumb)", zIndex: -1 }}
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <Icon size={15} strokeWidth={2} />
            {labels[type]}
          </button>
        );
      })}
    </div>
  );
}

// ─── Huvudkomponent ────────────────────────────────────────────────────────
export default function RestaurantMenu({ restaurantSlug, initialData = null, embedMode = false }: Props) {
  const { t } = useTranslation();
  const router = useRouter();

  if (restaurantSlug === 'palmyra-pizzeria-lund') initialData = null; // Kanalpriset hämtas innan menyn visas.
  const [categories, setCategories] = useState<any[]>(initialData?.categories ?? []);
  const [isFramed, setIsFramed] = useState(false);
  useEffect(() => { setIsFramed(window.parent !== window); }, []);
  const scopedCategories = useMemo(() => menuWithDeals(categories, embedMode || isFramed), [categories, embedMode, isFramed]);
  const [deals, setDeals] = useState<PublicDeal[]>(initialData?.deals ?? []);
  const [restaurant, setRestaurant] = useState<any>(initialData?.restaurant ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(initialData?.categories?.[0]?.id ?? null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [address, setAddress] = useState("");
  const [orderType, setOrderType] = useState<OrderType>("DELIVERY");
  const [hydrated, setHydrated] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Förladda adressmodalen och Leaflet när sidan är klar, så kartan är
  // redo när kunden trycker på adressraden i stället för att laddas då.
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const preload = () => {
      void import("@/components/AddressModal");
      void import("@/lib/leaflet").then((m) => m.loadLeaflet()).catch(() => {});
    };
    const useIdle = typeof w.requestIdleCallback === "function";
    const handle = useIdle ? w.requestIdleCallback!(preload, { timeout: 2500 }) : window.setTimeout(preload, 1200);
    return () => { if (useIdle && typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(handle); else window.clearTimeout(handle); };
  }, []);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  // Lås bakgrundsscrollen medan infoarket är öppet (html + body för iOS).
  useEffect(() => {
    if (!showInfoModal) return;
    const prevHtml = document.documentElement.style.overflowY;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflowY = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflowY = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, [showInfoModal]);

  const [pendingProduct, setPendingProduct] = useState<any>(null);
  const [zoneAvailable, setZoneAvailable] = useState<boolean | null>(null);
  const [checkingZone, setCheckingZone] = useState(false);
  const [stuck, setStuck] = useState(false);
  // 0 = heron helt synlig, 1 = toppbaren helt kollapsad (glas + titel).
  const [collapse, setCollapse] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("platform_order_type") === "PICKUP") setOrderType("PICKUP");
    setHydrated(true);
  }, []);

  // Sidans grå yta ska nå ända ut i overscroll/safe-area, inte bara .ve-root.
  useDesignBackground();

  useEffect(() => {
    if (!restaurant?.id) return;
    trackJourney("RESTAURANT_VIEWED", { restaurantId: restaurant.id, meta: { name: restaurant.name, slug: restaurantSlug } });
  }, [restaurant?.id, restaurant?.name, restaurantSlug]);

  const updateDeliveryOverride = useCartStore((s) => s.updateDeliveryOverride);
  const clearCart = useCartStore((s) => s.clearCart);

  // Ett partnerfönster får aldrig visa eller skicka vidare en annan
  // restaurangs gamla lokala varukorg.
  useEffect(() => {
    if (!embedMode || !restaurant?.slug) return;
    const current = useCartStore.getState();
    if (current.items.length > 0 && current.restaurantSlug !== restaurant.slug) clearCart();
  }, [clearCart, embedMode, restaurant?.slug]);

  useEffect(() => {
    if (!embedMode || !restaurant?.slug) return;
    rememberEmbedParentOrigin(new URLSearchParams(window.location.search).get(EMBED_PARENT_ORIGIN_PARAM));
    void ensureKioskAccess(restaurant.slug);
  }, [embedMode, restaurant?.slug]);
  const { isFavorite, toggle: toggleFavorite } = useFavorites();

  const [bogoPicker, setBogoPicker] = useState<{ dealId: string; dealTitle: string; rewardCategoryName: string | null; products: BogoPickerProduct[]; excludedExtraIds: string[] } | null>(null);
  const [bogoProduct, setBogoProduct] = useState<{ product: any; dealId: string; dealTitle: string; rewardCategoryName: string | null; excludedExtraIds: string[] } | null>(null);

  const zoneAvailableRef = useRef<boolean | null>(null);
  useEffect(() => { zoneAvailableRef.current = zoneAvailable; }, [zoneAvailable]);

  // Zonkoll — identisk med originalets checkZone (validate-location).
  const checkZone = useCallback(async (restaurantData: any): Promise<boolean | null> => {
    if (typeof window === "undefined") return null;
    const storedCoords = localStorage.getItem("platform_coords");
    const storedType = localStorage.getItem("platform_order_type") || "DELIVERY";
    if (!storedCoords || storedType !== "DELIVERY" || !restaurantData?.id) { setZoneAvailable(null); return null; }
    setCheckingZone(true);
    try {
      const coords = JSON.parse(storedCoords);
      const res = await axios.post(`${apiBase()}/api/cities/validate-location`, { lat: coords.lat, lng: coords.lng });
      if (!res.data.covered) {
        const result = embedMode || restaurantData?.isOpen ? false : null;
        setZoneAvailable(result);
        return result;
      }
      const all: any[] = (res.data.cities || []).flatMap((c: any) => c.restaurants || []);
      const thisRest = all.find((r: any) => r.id === restaurantData.id);
      if (!thisRest) {
        if (!restaurantData?.isOpen && !embedMode) { setZoneAvailable(null); return null; }
        setZoneAvailable(false);
        return false;
      }
      const fee = (thisRest.matchedZone?.deliveryFee ?? 0) / 100;
      const min = (thisRest.matchedZone?.minOrder ?? 0) / 100;
      const zoneEta = thisRest.matchedZone?.etaMinutes;
      setZoneAvailable(true);
      setRestaurant((prev: any) => prev ? { ...prev, deliveryFee: fee, minOrderAmount: min, etaMinutes: zoneEta != null ? zoneEta : prev.etaMinutes } : null);
      updateDeliveryOverride(restaurantData.id, fee, min);
      return true;
    } catch {
      setZoneAvailable(null);
      return null;
    } finally {
      setCheckingZone(false);
    }
  }, [embedMode, updateDeliveryOverride]);

  const handleOrderTypeChange = useCallback((nextType: OrderType) => {
    setOrderType(nextType);
    if (typeof window === "undefined") return;
    const previousType = localStorage.getItem("platform_order_type");
    localStorage.setItem("platform_order_type", nextType);
    if (nextType === "PICKUP") {
      setZoneAvailable(null);
      const pickupCity = localStorage.getItem("platform_pickup_city");
      if (pickupCity) { localStorage.setItem("platform_address", pickupCity); setAddress(pickupCity); return; }
      setShowAddressModal(true);
      return;
    }
    const deliveryAddress = localStorage.getItem("platform_delivery_address") || (previousType !== "PICKUP" ? localStorage.getItem("platform_address") : null);
    const hasCoords = Boolean(localStorage.getItem("platform_coords"));
    if (deliveryAddress) { localStorage.setItem("platform_address", deliveryAddress); setAddress(deliveryAddress); }
    if (!deliveryAddress || !hasCoords) { setShowAddressModal(true); return; }
    if (restaurant) void checkZone(restaurant);
  }, [checkZone, restaurant]);

  const ssrSeededRef = useRef(!!initialData);
  const fetchData = useCallback(async () => {
    const ssrSeed = ssrSeededRef.current;
    ssrSeededRef.current = false;
    try {
      if (!ssrSeed) setLoading(true);
      setError(null);
      const channelParams = embedMode ? { channel: "partner_embed" } : {};
      const menuParams = { slug: restaurantSlug, ...channelParams, format: MENU_FORMAT_PARAM, v: "20260702" };
      const [menuRes, restaurantRes, dealsRes] = await Promise.all([
        axios.get(`${apiBase()}/api/menu/categories`, { params: menuParams }),
        axios.get(`${apiBase()}/api/restaurants/${restaurantSlug}`),
        axios.get(`${apiBase()}/api/deals`, { params: { slug: restaurantSlug, ...channelParams } }),
      ]);
      const nextCategories = rehydrateMenuCategories(menuRes.data) as any[];
      setCategories(nextCategories);
      setDeals(Array.isArray(dealsRes.data) ? dealsRes.data : []);
      if (restaurantRes.data) {
        setRestaurant(restaurantRes.data);
        await checkZone(restaurantRes.data);
      }
      if (nextCategories.length > 0) setActiveCategory((prev) => prev ?? nextCategories[0].id);
    } catch (err) {
      console.error("Error fetching menu data:", err);
      if (!ssrSeed) setError(t("menu.loadError"));
    } finally {
      if (!ssrSeed) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantSlug, checkZone, embedMode]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("platform_address");
      if (stored) setAddress(stored);
      const storedType = localStorage.getItem("platform_order_type");
      if (storedType === "PICKUP" || storedType === "DELIVERY") setOrderType(storedType as OrderType);
    }
    fetchData();

    let socket: Socket | null = null;
    let cancelled = false;
    void import("socket.io-client").then(({ io }) => {
      if (cancelled) return;
      const target = socketTarget();
      socket = io(target.url, { path: "/socket.io", transports: target.transports });
      socket.on("settings:updated", (next) => {
        if (next.slug !== restaurantSlug) return;
        setRestaurant((prev: any) => {
          if (!prev) return prev;
          const zoneWasChecked = zoneAvailableRef.current === true;
          return {
            ...prev,
            isOpen: next.isOpen ?? prev.isOpen ?? true,
            deliveryFee: zoneWasChecked ? prev.deliveryFee : (next.deliveryFee ?? prev.deliveryFee ?? 0),
            minOrderAmount: zoneWasChecked ? prev.minOrderAmount : (next.minOrderAmount ?? prev.minOrderAmount ?? 150),
            etaMinutes: next.estimatedDeliveryTime ?? next.etaMinutes ?? prev.etaMinutes ?? 35,
          };
        });
      });
      socket.on("menu:changed", (evt: { restaurantId?: string | null }) => {
        const current = restaurant?.id;
        if (evt.restaurantId && current && evt.restaurantId !== current) return;
        try { window.dispatchEvent(new CustomEvent("viaeats:menu-changed", { detail: evt })); } catch {}
        fetchData();
      });
    });
    return () => { cancelled = true; socket?.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantSlug, fetchData]);

  // Scroll-spy för kategorichips: se scroll-lyssnaren nedan (deterministisk,
  // bygger på sektionernas position i stället för IntersectionObserver som
  // kan tappa uppdateringar i iOS Safari när sektionerna är högre än vyn).
  const chipRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const manualScrollUntilRef = useRef(0);
  const scopedCategoriesRef = useRef(scopedCategories);
  useEffect(() => { scopedCategoriesRef.current = scopedCategories; }, [scopedCategories]);

  useEffect(() => {
    if (!activeCategory) return;
    const chip = chipRefs.current.get(activeCategory);
    const strip = chip?.parentElement;
    if (!chip || !strip) return;
    const target = chip.offsetLeft - strip.clientWidth / 2 + chip.clientWidth / 2;
    const left = Math.max(0, Math.min(strip.scrollWidth - strip.clientWidth, target));
    try { strip.scrollTo({ left, behavior: "smooth" }); } catch { strip.scrollLeft = left; }
  }, [activeCategory]);

  // Scrollstyrd toppbar (iOS "large title"-känsla): när heron glider bakom
  // baren tonar glaset och restaurangens namn in, steglöst med scrollen.
  // Samma lyssnare avgör när sök-/kategoriraden fastnat ("stuck") → glas +
  // hårfin linje. rAF-throttlad; utanför övergångsfönstret klampar värdena
  // till 0/1 så React bailar ut utan omrendering.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const stickyRowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (loading) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const barH = barRef.current?.offsetHeight || (window.innerWidth >= 768 ? 80 : 52);
      const heroH = heroRef.current?.offsetHeight ?? 260;
      const start = Math.max(0, heroH - barH - 48);
      setCollapse(Math.min(1, Math.max(0, (window.scrollY - start) / 64)));
      const sTop = sentinelRef.current?.getBoundingClientRect().top;
      setStuck(sTop != null && sTop <= barH + 1);
      // Aktiv kategori = sista sektionen vars överkant passerat linjen strax
      // under den klistrade raden. Pausas kort efter ett chip-klick så den
      // mjuka scrollen hinner fram utan att markeringen hoppar.
      if (Date.now() >= manualScrollUntilRef.current) {
        const line = barH + (stickyRowRef.current?.offsetHeight ?? 100) + 8;
        let current: string | null = null;
        for (const cat of scopedCategoriesRef.current) {
          const el = document.getElementById(`ve-${cat.id}`);
          if (!el) continue;
          if (el.getBoundingClientRect().top <= line) current = cat.id;
          else break;
        }
        if (!current && scopedCategoriesRef.current[0]) current = scopedCategoriesRef.current[0].id;
        if (current) setActiveCategory((prev) => (prev === current ? prev : current));
      }
    };
    const onScroll = () => { if (!raf) raf = window.requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [loading]);

  // BOGO-trigger — samma regler som originalet.
  const checkBogoTrigger = useCallback(() => {
    const bogoDeal = deals.find((d) => d.triggerType === "BOGO_CATEGORY");
    if (!bogoDeal) return;
    const currentItems = useCartStore.getState().items;
    if (useCartStore.getState().bogoChoice?.dealId === bogoDeal.id) return;
    const needed = bogoDeal.triggerQuantity ?? 2;
    let triggered = false;
    if (bogoDeal.bogoTriggerProductIds && bogoDeal.bogoTriggerProductIds.length > 0) {
      triggered = currentItems.filter((i) => bogoDeal.bogoTriggerProductIds!.includes(i.productId)).reduce((s, i) => s + i.quantity, 0) >= needed;
    } else if (bogoDeal.triggerCategoryId) {
      const catProducts = new Set((categories.find((c) => c.id === bogoDeal.triggerCategoryId)?.products ?? []).map((p: any) => p.id));
      triggered = currentItems.filter((i) => catProducts.has(i.productId)).reduce((s, i) => s + i.quantity, 0) >= needed;
    } else if (bogoDeal.bogoMinOrderAmountOre) {
      triggered = useCartStore.getState().getTotal() * 100 >= bogoDeal.bogoMinOrderAmountOre;
    }
    if (!triggered) return;
    const rewardCatId = bogoDeal.rewardCategoryId || bogoDeal.triggerCategoryId;
    const allowed = new Set(bogoDeal.bogoRewardProductIds ?? []);
    const whitelist = (prods: BogoPickerProduct[]) => (allowed.size > 0 ? prods.filter((p) => allowed.has(p.id)) : prods);
    const toPicker = (p: any): BogoPickerProduct => ({ id: p.id, name: p.name, price: p.price, imageUrl: p.imageUrl ?? null, extraGroups: p.extraGroups ?? [] });
    let rewardProducts: BogoPickerProduct[] = [];
    let rewardCategoryName: string | null = null;
    if (rewardCatId) {
      const cat = categories.find((c) => c.id === rewardCatId);
      if (cat) { rewardCategoryName = cat.name; rewardProducts = whitelist((cat.products ?? []).map(toPicker)); }
    } else {
      rewardProducts = whitelist(categories.flatMap((c) => (c.products ?? []).map(toPicker)));
    }
    if (rewardProducts.length === 0) return;
    setBogoPicker({ dealId: bogoDeal.id, dealTitle: bogoDeal.title, rewardCategoryName, products: rewardProducts, excludedExtraIds: bogoDeal.bogoExcludedExtraIds ?? [] });
  }, [deals, categories]);

  const handleOpenProduct = useCallback((p: any) => {
    if (!restaurant?.isOpen) return;
    if (zoneAvailable === false) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (!address.trim() || (orderType === "DELIVERY" && !localStorage.getItem("platform_coords"))) {
      setPendingProduct(p);
      setShowAddressModal(true);
    } else {
      setSelectedProduct(p);
    }
  }, [restaurant?.isOpen, zoneAvailable, address, orderType]);

  // Embed-API mellan partnersidan och iframe:en. Produktdeeplinks går genom
  // samma adress-/zon-grind som ett vanligt produktklick.
  useEffect(() => {
    if (!embedMode || typeof window === "undefined") return;
    // Tillåtna partnerursprung ägs av lib/embedPartner — ingen lista här.
    const originAllowed = (origin: string) => origin === window.location.origin || trustedPartnerOrigin(origin) !== null;
    const sendHeight = () => {
      if (window.parent === window) return;
      window.parent.postMessage({ type: "viaeats:embed-height", height: document.documentElement.scrollHeight }, "*");
    };
    const onMessage = (event: MessageEvent) => {
      if (!originAllowed(event.origin) || !event.data || event.data.type !== "viaeats:open-product") return;
      const productId = typeof event.data.productId === "string" ? event.data.productId : "";
      if (!productId) return;
      const product = categories.flatMap((c: any) => c.products || []).find((item: any) => item.id === productId);
      if (product) handleOpenProduct(product);
    };
    window.addEventListener("message", onMessage);
    sendHeight();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sendHeight) : null;
    observer?.observe(document.documentElement);
    return () => { window.removeEventListener("message", onMessage); observer?.disconnect(); };
  }, [categories, embedMode, handleOpenProduct]);

  // ?product=<id> deeplink, samma grind som ett klick.
  const deepLinkDoneRef = useRef(false);
  useEffect(() => {
    if (deepLinkDoneRef.current || !hydrated || !restaurant || categories.length === 0) return;
    const productId = new URLSearchParams(window.location.search).get("product");
    deepLinkDoneRef.current = true;
    if (!productId) return;
    const product = categories.flatMap((c: any) => c.products ?? []).find((p: any) => p.id === productId);
    if (product) handleOpenProduct(product);
  }, [hydrated, restaurant, categories, handleOpenProduct]);

  const filteredCategories = scopedCategories
    .map((cat: any) => ({
      ...cat,
      products: cat.products.filter((p: any) =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.description?.toLowerCase().includes(searchTerm.toLowerCase())),
    }))
    .filter((cat: any) => cat.products.length > 0);

  const scrollToCategory = (id: string) => {
    setActiveCategory(id);
    manualScrollUntilRef.current = Date.now() + 800;
    const el = document.getElementById(`ve-${id}`);
    if (!el) return;
    const barH = barRef.current?.offsetHeight || (window.innerWidth >= 768 ? 80 : 52);
    const offset = barH + (stickyRowRef.current?.offsetHeight ?? 100) + 4;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: "smooth" });
  };

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  };

  // ── Laddning ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="ve-root min-h-screen pb-32 md:pt-20">
        <div className="ve-skeleton w-full" style={{ height: "min(46vw, 300px)" }} />
        <div className="max-w-[680px] mx-auto px-4 -mt-6">
          <div className="ve-card p-5">
            <div className="ve-skeleton w-16 h-16 rounded-[18px] -mt-12 mb-4" />
            <div className="ve-skeleton h-8 w-2/3 rounded-lg mb-3" />
            <div className="ve-skeleton h-4 w-1/2 rounded-md mb-5" />
            <div className="ve-skeleton h-11 w-full rounded-[12px] mb-4" />
            <div className="ve-skeleton h-16 w-full rounded-[14px]" />
          </div>
          <div className="flex gap-2 mt-6 mb-5">{[0, 1, 2, 3].map((i) => <div key={i} className="ve-skeleton h-9 w-24 rounded-full" />)}</div>
          <div className="ve-card overflow-hidden">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="ve-skeleton h-[112px] mx-4 my-3 rounded-[14px]" />)}</div>
        </div>
      </div>
    );
  }

  if (error || (!restaurant && !loading)) {
    return (
      <div className="ve-root min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-[20px] grid place-items-center mb-6" style={{ backgroundColor: "var(--ve-danger-soft)" }}>
          <X size={26} strokeWidth={2} style={{ color: "var(--ve-danger)" }} />
        </div>
        <h2 className="text-[22px] font-semibold mb-1.5" style={{ letterSpacing: "-0.02em" }}>{t("menu.errorTitle")}</h2>
        <p className="text-[15px] mb-8 max-w-sm" style={{ color: "var(--ve-ink-2)" }}>{error || t("menu.restaurantNotFound")}</p>
        {!embedMode && <Link href="/" className="ve-press px-7 h-12 rounded-full text-[16px] font-semibold flex items-center" style={{ backgroundColor: "var(--ve-cta)", color: "var(--ve-cta-ink)" }}>{t("menu.goHome")}</Link>}
      </div>
    );
  }

  // ── Härledda värden ─────────────────────────────────────────────────────
  const paused = ["PLATFORM_PAUSED", "CITY_PAUSED", "RESTAURANT_PAUSED"].includes(String(restaurant?.availabilityReason || ""))
    || (restaurant?.pausedUntil && new Date(restaurant.pausedUntil).getTime() > Date.now());
  const isOpen = Boolean(restaurant?.isOpen);
  const hoursToday = todayHours(restaurant?.openingHours);
  const statusLabel = paused ? "Pausad" : isOpen ? t("menu.statusOpen") : t("menu.statusClosed");
  const statusColor = paused ? "var(--ve-accent)" : isOpen ? "var(--ve-success)" : "var(--ve-danger)";
  const heroImage = restaurant?.heroImageUrl || restaurant?.imageUrl;
  const logo = restaurant?.imageUrl && restaurant.imageUrl !== heroImage ? restaurant.imageUrl : restaurant?.imageUrl;
  const disabled = !isOpen || zoneAvailable === false;

  const zones = Array.isArray(restaurant?.deliveryZones) ? restaurant.deliveryZones : [];
  const zoneFees = zones.filter((z: any) => z && z.isActive !== false && typeof z.fee === "number").map((z: any) => z.fee / 100);
  const minZoneFee = zoneFees.length ? Math.min(...zoneFees) : undefined;
  const displayFee = zoneAvailable === true ? restaurant.deliveryFee : (minZoneFee ?? restaurant.deliveryFee);
  const feeLabel = zoneAvailable === false && isOpen ? "–" : displayFee === 0 ? t("menu.stats.free") : `${displayFee} kr`;
  // Palmyras embed visar samma fasta tider som partnern kommunicerar på sin
  // egen sajt (medvetet undantag, samma som i gamla MenuContent).
  const embedIsPalmyra = embedMode && restaurant?.slug === "palmyra-pizzeria-lund";
  const pickupMinutes = restaurant?.pickupEtaMinutes ?? Math.max(5, Math.min(25, (restaurant?.etaMinutes ?? 30) - 5));
  const deliveryTimeLabel = embedIsPalmyra ? "30–45 min" : `${restaurant?.etaMinutes} ${t("menu.stats.min")}`;
  const pickupTimeLabel = embedIsPalmyra ? "~10 min" : `~${pickupMinutes} ${t("menu.stats.min")}`;
  const addressLine = orderType === "PICKUP" ? (address || "Avhämtning") : (address ? address.split(",")[0] : "Välj leveransadress");

  const facts = orderType === "DELIVERY"
    ? [
        { label: "Leverans", value: feeLabel },
        { label: "Tid", value: deliveryTimeLabel },
        { label: "Minsta order", value: `${restaurant.minOrderAmount} kr` },
      ]
    : [
        { label: "Klar om", value: pickupTimeLabel },
        { label: "Hämta hos", value: restaurant?.address ? String(restaurant.address).split(",")[0] : restaurant?.city || "Restaurangen" },
      ];

  // Knapparna i toppbaren: vitt glas över heron, neutral fyllning när baren kollapsat.
  const barButtonStyle = collapse > 0.5
    ? { backgroundColor: "var(--ve-fill-2)", boxShadow: "none", backdropFilter: "none", WebkitBackdropFilter: "none" }
    : undefined;

  return (
    <div className={`ve-root min-h-screen md:pt-20 ${embedMode ? "pb-56 md:pb-36" : "pb-36"}`}>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div ref={heroRef} className="ve-fade-in relative w-full overflow-hidden" style={{ height: "min(50vw, 320px)", minHeight: 210, backgroundColor: "#E5E5EA" }}>
        {heroImage ? (
          <span role="img" aria-label={restaurant?.name || ""} className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${optimizedImageUrl(heroImage, RESTAURANT_HERO_IMAGE_WIDTH, RESTAURANT_HERO_IMAGE_QUALITY)}")` }} />
        ) : (
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, var(--ve-fill-2), var(--ve-bg))" }} />
        )}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0) 40%)" }} />

        {/* Desktop: knapparna ligger i heron. Mobil: se den kollapsande toppbaren nedan. */}
        <div className="absolute inset-x-4 hidden md:flex items-center justify-between" style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
          {embedMode ? <span /> : (
            <button type="button" onClick={goBack} aria-label={t("common.back")} className="ve-glass-btn w-10 h-10 rounded-full grid place-items-center">
              <ChevronLeft size={20} strokeWidth={2.4} className="-ml-0.5" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowInfoModal(true)} aria-label={t("menu.info")} className="ve-glass-btn w-10 h-10 rounded-full grid place-items-center">
              <Info size={18} strokeWidth={2.2} />
            </button>
            {restaurant?.id && !embedMode && (
              <button
                type="button"
                aria-label="Spara favorit"
                aria-pressed={isFavorite(restaurant.id)}
                onClick={() => toggleFavorite(restaurant.id)}
                className="ve-glass-btn w-10 h-10 rounded-full grid place-items-center"
              >
                <Heart size={18} strokeWidth={2.2} fill={isFavorite(restaurant.id) ? "var(--ve-accent)" : "none"} style={{ color: isFavorite(restaurant.id) ? "var(--ve-accent)" : "var(--ve-ink)" }} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Kollapsande toppbar (mobil): glas + titel tonar in med scrollen ── */}
      <div ref={barRef} className="md:hidden fixed inset-x-0 top-0 z-40 pointer-events-none" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="absolute inset-0 ve-glass" style={{ opacity: collapse, boxShadow: collapse > 0.98 ? "inset 0 -0.5px 0 var(--ve-line)" : undefined }} />
        <div className="relative grid h-[52px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-4">
          {embedMode ? <span /> : (
            <button type="button" onClick={goBack} aria-label={t("common.back")} className="ve-glass-btn pointer-events-auto w-10 h-10 justify-self-start rounded-full grid place-items-center" style={barButtonStyle}>
              <ChevronLeft size={20} strokeWidth={2.4} className="-ml-0.5" />
            </button>
          )}
          <span className="relative grid max-w-[56vw] justify-self-center place-items-center">
            {/* Embed: "Powered by viaeats" ligger i navbaren ovanpå heron och
                tonar ut när restaurangnamnet tonar in. Ingen länk — embedden
                leder aldrig kunden bort från partnerns flöde. */}
            {embedMode && (
              <span
                aria-hidden={collapse >= 0.5}
                className="ve-glass-btn col-start-1 row-start-1 inline-flex h-8 items-center whitespace-nowrap rounded-full px-3 text-[12px] font-semibold"
                style={{ color: "var(--ve-ink-2)", opacity: 1 - collapse }}
              >
                Powered by&nbsp;<span style={{ color: "#F04F1A", fontWeight: 800 }}>viaeats</span>
              </span>
            )}
            <span
              aria-hidden={collapse < 0.5}
              className="col-start-1 row-start-1 max-w-full truncate text-center text-[16px] font-semibold"
              style={{ color: "var(--ve-ink)", letterSpacing: "-0.015em", opacity: collapse, transform: `translateY(${((1 - collapse) * 8).toFixed(2)}px)` }}
            >
              {restaurant?.name}
            </span>
          </span>
          <div className="flex items-center justify-end gap-2 pointer-events-auto">
            <button type="button" onClick={() => setShowInfoModal(true)} aria-label={t("menu.info")} className="ve-glass-btn w-10 h-10 rounded-full grid place-items-center" style={barButtonStyle}>
              <Info size={18} strokeWidth={2.2} />
            </button>
            {restaurant?.id && !embedMode && (
              <button
                type="button"
                aria-label="Spara favorit"
                aria-pressed={isFavorite(restaurant.id)}
                onClick={() => toggleFavorite(restaurant.id)}
                className="ve-glass-btn w-10 h-10 rounded-full grid place-items-center"
                style={barButtonStyle}
              >
                <Heart size={18} strokeWidth={2.2} fill={isFavorite(restaurant.id) ? "var(--ve-accent)" : "none"} style={{ color: isFavorite(restaurant.id) ? "var(--ve-accent)" : "var(--ve-ink)" }} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="ve-fade-in max-w-[680px] mx-auto px-4">
        {/* ── Huvudkort: logga, namn, status, segment, fakta ───────────── */}
        <section className="ve-card relative -mt-7 px-5 pt-5 pb-5">
          {logo && (
            <div className="absolute -top-9 left-5 w-[68px] h-[68px] rounded-[20px] overflow-hidden grid place-items-center" style={{ backgroundColor: "#fff", boxShadow: "0 0 0 3px #fff, 0 6px 18px rgba(0,0,0,0.12)" }}>
              <PlainImage src={logo} alt="" width={128} className="w-full h-full object-cover" fallback={<Utensils size={22} style={{ color: "var(--ve-ink-3)" }} />} />
            </div>
          )}
          <div className={logo ? "pt-7" : ""}>
            <h1 className="m-0 text-[28px] font-semibold leading-[1.1]" style={{ letterSpacing: "-0.025em", color: "var(--ve-ink)" }}>{restaurant?.name}</h1>
            <div className="mt-2 flex items-center gap-2 flex-wrap text-[14px]" style={{ color: "var(--ve-ink-2)" }}>
              {(() => {
                const rating = (
                  <>
                    <Star size={13} strokeWidth={0} fill="var(--ve-ink)" />
                    <span className="ve-tabular">{(restaurant?.rating || 5.0).toFixed(1)}</span>
                    <span className="ve-tabular" style={{ color: "var(--ve-ink-3)" }}>({restaurant?.ratingCount || 1})</span>
                  </>
                );
                return embedMode
                  ? <span className="inline-flex items-center gap-1 font-medium" style={{ color: "var(--ve-ink)" }}>{rating}</span>
                  : <Link href={`/r/${restaurantSlug}/reviews`} className="inline-flex items-center gap-1 font-medium" style={{ color: "var(--ve-ink)" }}>{rating}</Link>;
              })()}
              {restaurant?.cuisine && (<><span style={{ color: "var(--ve-ink-3)" }}>·</span><span>{restaurant.cuisine}</span></>)}
              <span style={{ color: "var(--ve-ink-3)" }}>·</span>
              <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: statusColor }}>
                <span className="w-[7px] h-[7px] rounded-full" style={{ backgroundColor: statusColor }} />
                {statusLabel}
                {hoursToday && <span className="font-normal ve-tabular" style={{ color: "var(--ve-ink-3)" }}>· {hoursToday}</span>}
              </span>
            </div>
          </div>

          <div className="mt-5">
            <Segmented value={orderType} onChange={handleOrderTypeChange} labels={{ DELIVERY: "Leverans", PICKUP: "Avhämtning" }} />
          </div>

          {/* Adressrad — öppnar samma AddressModal som originalet */}
          <button
            type="button"
            onClick={() => setShowAddressModal(true)}
            className="ve-row-press mt-4 w-full flex items-center gap-3 rounded-[14px] px-3.5 py-3 text-left"
            style={{ backgroundColor: "var(--ve-card-2)", boxShadow: "inset 0 0 0 0.5px var(--ve-line)" }}
          >
            <span className="w-8 h-8 rounded-full grid place-items-center shrink-0" style={{ backgroundColor: zoneAvailable === false ? "var(--ve-danger-soft)" : "var(--ve-fill)" }}>
              {orderType === "PICKUP" ? <Store size={15} strokeWidth={2} /> : <MapPin size={15} strokeWidth={2} style={{ color: zoneAvailable === false ? "var(--ve-danger)" : "var(--ve-ink)" }} />}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-medium truncate" style={{ color: "var(--ve-ink)", letterSpacing: "-0.01em" }}>{addressLine}</span>
              <span className="block text-[12.5px] mt-px" style={{ color: zoneAvailable === false ? "var(--ve-danger)" : "var(--ve-ink-3)" }}>
                {orderType === "PICKUP"
                  ? "Hämta själv i restaurangen"
                  : checkingZone ? "Kontrollerar leveransområde…"
                  : zoneAvailable === true ? "Vi levererar hit"
                  : zoneAvailable === false ? "Utanför leveransområdet"
                  : "Tryck för att välja adress"}
              </span>
            </span>
            <ChevronRight size={17} strokeWidth={2.2} style={{ color: "var(--ve-ink-3)" }} />
          </button>

          {restaurantSlug === 'palmyra-pizzeria-lund' && !embedMode && Date.now() <= Date.parse('2026-09-19T21:59:59.999Z') && (
            <div className="mt-4 rounded-[14px] px-5 py-4 text-center" style={{ background: '#fff2e8', color: '#0a2340' }}>
              <strong>VIA50: 50 kr från 150 kr · VIA70: 70 kr från 250 kr</strong>
              <p className="text-sm mt-1">Fri hemleverans inom Lund. Gäller idag och ej rabatterade varor. Adressen kontrolleras i kassan.</p>
            </div>
          )}

          {/* Faktarad */}
          <div className="mt-4 grid rounded-[14px] overflow-hidden" style={{ gridTemplateColumns: `repeat(${facts.length}, minmax(0, 1fr))`, backgroundColor: "var(--ve-card-2)", boxShadow: "inset 0 0 0 0.5px var(--ve-line)" }}>
            {facts.map((f, i) => (
              <div key={f.label} className="px-3 py-3 min-w-0" style={{ boxShadow: i === 0 ? undefined : "inset 0.5px 0 0 var(--ve-line)" }}>
                <div className="ve-tabular text-[15px] font-semibold truncate" style={{ color: "var(--ve-ink)", letterSpacing: "-0.01em" }}>{f.value}</div>
                <div className="text-[12px] mt-0.5 truncate" style={{ color: "var(--ve-ink-3)" }}>{f.label}</div>
              </div>
            ))}
          </div>

          {restaurant?.announcementText ? (
            <div className="mt-4 flex items-start gap-2.5 rounded-[14px] px-3.5 py-3" style={{ backgroundColor: "var(--ve-accent-soft)" }}>
              <Info size={15} strokeWidth={2.2} className="mt-0.5 shrink-0" style={{ color: "var(--ve-accent)" }} />
              <p className="m-0 text-[13.5px] font-medium leading-snug" style={{ color: "var(--ve-ink)" }}>{restaurant.announcementText}</p>
            </div>
          ) : null}
        </section>

        {/* Utanför zon */}
        {zoneAvailable === false && isOpen && orderType === "DELIVERY" && (
          <div className="ve-card mt-4 p-4 flex items-start gap-3.5">
            <span className="w-9 h-9 rounded-full grid place-items-center shrink-0" style={{ backgroundColor: "var(--ve-danger-soft)" }}>
              <AlertTriangle size={17} strokeWidth={2.2} style={{ color: "var(--ve-danger)" }} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="m-0 text-[15px] font-semibold" style={{ color: "var(--ve-ink)", letterSpacing: "-0.01em" }}>{t("menu.outOfZone.title")}</p>
              <p className="m-0 mt-0.5 text-[13.5px] leading-snug" style={{ color: "var(--ve-ink-2)" }}>
                {address ? t("menu.outOfZone.descWithAddress", { address }) : t("menu.outOfZone.desc")} {t("menu.outOfZone.action")}
              </p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setShowAddressModal(true)} className="ve-press px-4 h-10 rounded-full text-[14px] font-semibold" style={{ backgroundColor: "var(--ve-cta)", color: "var(--ve-cta-ink)" }}>{t("menu.outOfZone.newAddress")}</button>
                {!embedMode && <Link href="/" className="ve-press px-4 h-10 rounded-full text-[14px] font-semibold flex items-center" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}>{t("common.back")}</Link>}
              </div>
            </div>
          </div>
        )}

        {!isOpen && !paused && (
          <div className="ve-card mt-4 px-4 py-3.5 flex items-center gap-3">
            <Clock size={17} strokeWidth={2} style={{ color: "var(--ve-ink-3)" }} />
            <p className="m-0 text-[14px]" style={{ color: "var(--ve-ink-2)" }}>
              Restaurangen är stängd just nu.{hoursToday ? ` Öppet idag ${hoursToday}.` : ""}
            </p>
          </div>
        )}

        {restaurant?.id && !embedMode && (
          <div className="mt-4"><PreviouslyOrderedBar restaurantId={restaurant.id} restaurantSlug={restaurantSlug} /></div>
        )}

        {/* ── Klistrad sök + kategorier ────────────────────────────────── */}
        <div ref={sentinelRef} aria-hidden className="h-px" />
        <div
          ref={stickyRowRef}
          className={`ve-sticky-top sticky z-30 -mx-4 px-4 pt-2 pb-2 transition-shadow duration-300 ${stuck ? "ve-glass" : ""}`}
          style={{ boxShadow: stuck ? "inset 0 -0.5px 0 var(--ve-line)" : undefined }}
        >
          <div className="max-w-[680px] mx-auto">
            <div className="h-10 rounded-full flex items-center gap-2 pl-3.5 pr-2" style={{ backgroundColor: stuck ? "var(--ve-fill-2)" : "var(--ve-fill)" }}>
              <Search size={15} strokeWidth={2.4} className="shrink-0" style={{ color: "var(--ve-ink-3)" }} />
              <input
                type="search"
                enterKeyHint="search"
                placeholder={`Sök i ${restaurant?.name || "menyn"}`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="ve-input w-full min-w-0 bg-transparent border-none outline-none font-medium truncate"
                style={{ color: "var(--ve-ink)" }}
              />
              {searchTerm && (
                <button type="button" onClick={() => setSearchTerm("")} aria-label="Rensa" className="w-6 h-6 rounded-full grid place-items-center" style={{ backgroundColor: "var(--ve-ink-3)", color: "#fff" }}>
                  <X size={12} strokeWidth={3} />
                </button>
              )}
            </div>

            {scopedCategories.length > 0 && (
              <div className="ve-no-scrollbar flex gap-2 mt-2.5 -mx-4 px-4" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" as any, touchAction: "pan-x" }}>
                {scopedCategories.map((cat: any) => {
                  const active = activeCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      ref={(el) => { if (el) chipRefs.current.set(cat.id, el); else chipRefs.current.delete(cat.id); }}
                      onClick={() => scrollToCategory(cat.id)}
                      className="ve-chip shrink-0 h-9 px-4 rounded-full text-[14px] whitespace-nowrap"
                      style={{
                        backgroundColor: active ? "var(--ve-ink)" : "var(--ve-card)",
                        color: active ? "#fff" : "var(--ve-ink)",
                        fontWeight: active ? 600 : 500,
                        boxShadow: active ? "none" : "inset 0 0 0 0.5px var(--ve-line)",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Menyn ────────────────────────────────────────────────────── */}
        <div className="mt-4 flex flex-col gap-8">
          {filteredCategories.length === 0 ? (
            <div className="ve-card px-6 py-12 text-center">
              <div className="w-14 h-14 mx-auto rounded-full grid place-items-center mb-4" style={{ backgroundColor: "var(--ve-fill)" }}>
                <Search size={22} strokeWidth={2} style={{ color: "var(--ve-ink-3)" }} />
              </div>
              <p className="m-0 text-[17px] font-semibold" style={{ letterSpacing: "-0.015em" }}>{searchTerm ? "Inga träffar" : t("menu.noMenuTitle")}</p>
              <p className="m-0 mt-1 text-[14px]" style={{ color: "var(--ve-ink-2)" }}>{searchTerm ? `Inget i menyn matchar "${searchTerm}".` : t("menu.noMenuDesc")}</p>
            </div>
          ) : (
            filteredCategories.map((cat: any) => (
              <section key={cat.id} id={`ve-${cat.id}`} className="scroll-mt-40">
                <div className="flex items-baseline gap-3 px-1 mb-3">
                  <h2 className="m-0 text-[22px] font-semibold" style={{ letterSpacing: "-0.022em", color: "var(--ve-ink)" }}>{cat.name}</h2>
                  <span className="ve-tabular ml-auto text-[13px] font-medium" style={{ color: "var(--ve-ink-3)" }}>
                    {cat.products.length === 1 ? t("menu.dishCount.one", { n: 1 }) : t("menu.dishCount.other", { n: cat.products.length })}
                  </span>
                </div>
                {cat.id === DEALS_CATEGORY_ID && <p className="m-0 -mt-1 mb-3 px-1 text-[14px]" style={{ color: "var(--ve-ink-2)" }}>Utvalda erbjudanden när du beställer på viaeats.</p>}
                <div className="ve-card overflow-hidden">
                  {renderProducts(cat.products, handleOpenProduct, disabled)}
                </div>
              </section>
            ))
          )}
        </div>

        <p className="mt-10 text-center text-[12px]" style={{ color: "var(--ve-ink-3)" }}>
          {restaurant?.legalName || restaurant?.name}{restaurant?.organizationNumber ? ` · Org.nr ${restaurant.organizationNumber}` : ""}
        </p>
      </div>

      {/* ── Modaler ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedProduct && (
          <ProductSheet
            key={`product-${selectedProduct.id}`}
            product={selectedProduct}
            restaurantId={restaurant?.id || ""}
            restaurantSlug={restaurantSlug}
            onClose={() => { setSelectedProduct(null); setTimeout(() => checkBogoTrigger(), 50); }}
          />
        )}
        {bogoProduct && (
          <ProductSheet
            key={`bogo-${bogoProduct.product.id}`}
            product={bogoProduct.product}
            restaurantId={restaurant?.id || ""}
            restaurantSlug={restaurantSlug}
            bogoFreeFromDealId={bogoProduct.dealId}
            bogoDealTitle={bogoProduct.dealTitle}
            bogoRewardCategoryName={bogoProduct.rewardCategoryName}
            bogoExcludedExtraIds={bogoProduct.excludedExtraIds}
            onClose={() => setBogoProduct(null)}
          />
        )}
      </AnimatePresence>

      {bogoPicker && (
        <BogoPickerModal
          dealId={bogoPicker.dealId}
          dealTitle={bogoPicker.dealTitle}
          restaurantId={restaurant?.id || ""}
          rewardCategoryName={bogoPicker.rewardCategoryName}
          products={bogoPicker.products}
          onClose={() => setBogoPicker(null)}
          onSelectProduct={(p) => {
            setBogoProduct({ product: p, dealId: bogoPicker.dealId, dealTitle: bogoPicker.dealTitle, rewardCategoryName: bogoPicker.rewardCategoryName, excludedExtraIds: bogoPicker.excludedExtraIds });
            setBogoPicker(null);
          }}
        />
      )}

      {mounted && createPortal(
      <AnimatePresence>
        {showInfoModal && (
          <motion.div
            key="info"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            className="ve-root fixed inset-0 z-[1300] flex items-end sm:items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.42)", touchAction: "none" }}
            onClick={() => setShowInfoModal(false)}
          >
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog" aria-modal="true" aria-label={t("menu.info.title")}
              className="relative flex w-full flex-col overflow-hidden rounded-t-[26px] sm:max-w-[480px] sm:rounded-[26px]"
              style={{ backgroundColor: "var(--ve-bg)", height: "min(88dvh, 720px)", maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px))", boxShadow: "0 -8px 40px rgba(0,0,0,0.18)", touchAction: "pan-y" }}
            >
              <div className="flex shrink-0 justify-center pt-2.5"><span className="ve-sheet-handle" /></div>
              <div className="flex shrink-0 items-start justify-between px-5 pt-3 pb-3">
                <div className="min-w-0">
                  <p className="m-0 text-[13px] font-medium" style={{ color: "var(--ve-ink-3)" }}>{t("menu.info.title")}</p>
                  <h2 className="m-0 text-[22px] font-semibold truncate" style={{ letterSpacing: "-0.02em" }}>{restaurant?.name}</h2>
                </div>
                <button onClick={() => setShowInfoModal(false)} aria-label={t("common.close")} className="ve-press shrink-0 w-9 h-9 rounded-full grid place-items-center" style={{ backgroundColor: "var(--ve-fill)" }}>
                  <X size={16} strokeWidth={2.6} />
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4" style={{ overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" as any, paddingBottom: "max(env(safe-area-inset-bottom, 0px), 24px)" }}>
                {restaurant?.description && (
                  <div className="ve-card px-4 py-3.5">
                    <p className="m-0 text-[15px] leading-relaxed" style={{ color: "var(--ve-ink)" }}>{restaurant.description}</p>
                  </div>
                )}
                <div className="ve-card overflow-hidden">
                  {restaurant?.address && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([restaurant.address, restaurant.zip, restaurant.city].filter(Boolean).join(", "))}`}
                      target="_blank" rel="noreferrer"
                      className="ve-row-press flex items-center gap-3.5 px-4 py-3.5"
                      style={{ boxShadow: "inset 0 -0.5px 0 var(--ve-line)" }}
                    >
                      <span className="w-9 h-9 rounded-full grid place-items-center shrink-0" style={{ backgroundColor: "var(--ve-fill)" }}><MapPin size={16} strokeWidth={2.2} /></span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-medium truncate">{String(restaurant.address).split(",")[0]}</span>
                        <span className="block text-[13px]" style={{ color: "var(--ve-ink-3)" }}>{[restaurant.zip, restaurant.city].filter(Boolean).join(" ") || t("menu.info.openMaps")}</span>
                      </span>
                      <ChevronRight size={17} style={{ color: "var(--ve-ink-3)" }} />
                    </a>
                  )}
                  {restaurant?.phone && (
                    <a href={`tel:${String(restaurant.phone).replace(/\s+/g, "")}`} className="ve-row-press flex items-center gap-3.5 px-4 py-3.5" style={{ boxShadow: restaurant?.email ? "inset 0 -0.5px 0 var(--ve-line)" : undefined }}>
                      <span className="w-9 h-9 rounded-full grid place-items-center shrink-0" style={{ backgroundColor: "var(--ve-fill)" }}><Phone size={16} strokeWidth={2.2} /></span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-medium ve-tabular">{restaurant.phone}</span>
                        <span className="block text-[13px]" style={{ color: "var(--ve-ink-3)" }}>{t("menu.info.callUs")}</span>
                      </span>
                      <ChevronRight size={17} style={{ color: "var(--ve-ink-3)" }} />
                    </a>
                  )}
                  {restaurant?.email && (
                    <a href={`mailto:${restaurant.email}`} className="ve-row-press flex items-center gap-3.5 px-4 py-3.5">
                      <span className="w-9 h-9 rounded-full grid place-items-center shrink-0" style={{ backgroundColor: "var(--ve-fill)" }}><Mail size={16} strokeWidth={2.2} /></span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-medium truncate">{restaurant.email}</span>
                        <span className="block text-[13px]" style={{ color: "var(--ve-ink-3)" }}>{t("menu.info.email")}</span>
                      </span>
                      <ChevronRight size={17} style={{ color: "var(--ve-ink-3)" }} />
                    </a>
                  )}
                </div>
                {restaurant?.openingHours && (
                  <div className="ve-card overflow-hidden">
                    {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((day, i, arr) => {
                      const d = restaurant.openingHours?.[day];
                      const label = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"][i];
                      const isToday = WEEKDAYS[new Date().getDay()] === day;
                      const text = !d || d.closed || !d.shifts?.length ? "Stängt" : d.shifts.map((s: any) => `${s.open}–${s.close}`).join(", ");
                      return (
                        <div key={day} className="flex items-center justify-between px-4 py-2.5 text-[14.5px]" style={{ boxShadow: i === arr.length - 1 ? undefined : "inset 0 -0.5px 0 var(--ve-line)", fontWeight: isToday ? 600 : 400 }}>
                          <span>{label}</span>
                          <span className="ve-tabular" style={{ color: text === "Stängt" ? "var(--ve-ink-3)" : "var(--ve-ink)" }}>{text}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {(restaurant?.legalName || restaurant?.organizationNumber) && (
                  <p className="m-0 px-1 text-[12.5px]" style={{ color: "var(--ve-ink-3)" }}>
                    {restaurant.legalName}{restaurant.organizationNumber ? ` · ${t("menu.info.orgNr", { nr: restaurant.organizationNumber })}` : ""}
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body)}

      {showAddressModal && (
        <AddressModal
          isOpen={showAddressModal}
          onClose={() => { setShowAddressModal(false); setPendingProduct(null); }}
          onConfirm={async (newAddress, newOrderType, coords, postalCode, city) => {
            setAddress(newAddress);
            setOrderType(newOrderType);
            if (typeof window !== "undefined") {
              localStorage.setItem("platform_address", newAddress);
              localStorage.setItem("platform_order_type", newOrderType);
              if (newOrderType === "PICKUP") {
                localStorage.setItem("platform_pickup_city", city || newAddress);
              } else {
                localStorage.setItem("platform_delivery_address", newAddress);
                if (city) localStorage.setItem("platform_city", city);
              }
              if (coords) {
                localStorage.setItem("platform_coords", JSON.stringify(coords));
                const { rememberQuickAddress } = await import("@/lib/quickAddresses");
                rememberQuickAddress({ street: newAddress.split(",")[0].trim(), latitude: coords.lat, longitude: coords.lng, zip: postalCode, city });
              }
            }
            setShowAddressModal(false);
            let zoneOk: boolean | null = null;
            if (restaurant && newOrderType === "DELIVERY") zoneOk = await checkZone(restaurant);
            else { setZoneAvailable(null); zoneOk = null; }
            if (pendingProduct && zoneOk !== false) setSelectedProduct(pendingProduct);
            setPendingProduct(null);
          }}
          orderType={orderType}
          setOrderType={setOrderType}
          pickupCityName={embedMode ? (restaurant?.city || undefined) : undefined}
          confirmLabel={embedMode ? "Bekräfta och fortsätt" : undefined}
        />
      )}

      <CartBar href={embedMode ? `/cart?embed=1&restaurant=${encodeURIComponent(restaurantSlug)}` : "/cart"} aboveEmbedNav={embedMode} />
    </div>
  );
}
