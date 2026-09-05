"use client";

import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import axios from "axios";
import type { Socket } from "socket.io-client";
import { Search, Info, ChevronLeft, MapPin, Phone, Mail, Clock, Bike, Star, ShoppingBag, X, AlertTriangle, CheckCircle2, Heart, Plus, Utensils, Store, Truck } from "lucide-react";
import { API_URL, SOCKET_URL } from "@/lib/api";
import { ensureKioskAccess } from "@/lib/kioskAccessClient";
import dynamic from "next/dynamic";
import FloatingCartButton from "@/components/FloatingCartButton";
import { EMBED_PARENT_ORIGIN_PARAM, rememberEmbedParentOrigin } from "@/lib/embedPartner";
import SmartImage from "@/components/SmartImage";
import { PublicDeal } from "@/lib/deals";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import PreviouslyOrderedBar from "@/components/PreviouslyOrderedBar";
import { useCartStore } from "@/store/cartStore";
import { useFavorites } from "@/lib/favoritesStore";
import { type BogoPickerProduct } from "@/components/BogoPickerModal";
import { useTranslation } from "@/lib/i18n/LocaleProvider";
import { trackJourney } from "@/lib/journey";
import EmptyState from "@/components/EmptyState";
import { rehydrateMenuCategories, MENU_FORMAT_PARAM } from "@/lib/menu";
import { optimizedImageUrl, RESTAURANT_HERO_IMAGE_QUALITY, RESTAURANT_HERO_IMAGE_WIDTH } from "@/lib/imageOptimization";

// Tunga modaler laddas först vid interaktion (köp/adress/BOGO) → mindre initial
// JS för restaurang-sidan = snabbare första rendering/hydration.
const ProductModal = dynamic(() => import("@/components/ProductModal"), { ssr: false });
const AddressModal = dynamic(() => import("@/components/AddressModal"), { ssr: false });
const BogoPickerModal = dynamic(() => import("@/components/BogoPickerModal"), { ssr: false });

interface MenuContentInitialData {
  categories?: any[];
  deals?: PublicDeal[];
  restaurant?: any;
}

interface MenuContentProps {
  restaurantSlug?: string;
  restaurantId?: string;
  isStandalone?: boolean;
  /** Fristående partner/kiosk-läge. Håller kunden i embed-flödet och
   *  döljer discovery-/profilfunktioner utan att ändra vanlig restaurangvy. */
  embedMode?: boolean;
  /** Server-rendered first-paint data (from app/restaurants/[slug]/page.tsx).
   *  When present, the menu renders immediately with no client fetch waterfall. */
  initialData?: MenuContentInitialData | null;
}

// ─── Produktkort-helpers ─────────────────────────────────────────────────
function getDisplayPrice(p: any): { final: number; original: number | null } {
  if (typeof p.discountPrice === "number" && p.discountPrice > 0 && p.discountPrice < p.price) {
    return { final: p.discountPrice, original: p.price };
  }
  if (typeof p.discountPercent === "number" && p.discountPercent > 0) {
    const final = Math.max(0, Math.round(p.price - (p.price * p.discountPercent) / 100));
    if (final < p.price) return { final, original: p.price };
  }
  return { final: p.price, original: null };
}

function ProductPriceLine({ product, compact = false }: { product: any; compact?: boolean }) {
  const { final, original } = getDisplayPrice(product);
  const discountPct = original != null && original > final ? Math.round((1 - final / original) * 100) : 0;
  const hasDiscount = discountPct > 0;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-2 min-w-0">
        <span
          className={`${compact ? "text-[14px]" : "text-[14.5px]"} font-extrabold leading-tight`}
          style={{ color: hasDiscount ? "var(--orange, #F04F1A)" : "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}
        >
          från {final} kr
        </span>
        {hasDiscount && (
          <span
            className={`${compact ? "text-[12.5px]" : "text-[13px]"} font-bold line-through leading-tight`}
            style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}
          >
            {original} kr
          </span>
        )}
      </div>
      {hasDiscount && (
        <span className={`${compact ? "text-[12.5px]" : "text-[13px]"} font-extrabold leading-tight`} style={{ color: "var(--orange, #F04F1A)" }}>
          {discountPct}% rabatt
        </span>
      )}
    </div>
  );
}

/**
 * UniformCard — menyns produktrad (listvy): full-bredd, INGEN kort-box
 * eller ram, bara en hårfin avdelare nedtill. Text vänster (namn, beskrivning,
 * pris), bild 92px höger med flytande guld-plus. Utan bild: ren textrad med
 * plus-knapp. Tema-variabler → light + dark. Guld bara på plus + rabattpris.
 */
function UniformCard({ product, onClick, disabled }: { product: any; onClick: () => void; disabled: boolean }) {
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
      className={`group relative w-full text-left flex items-center gap-3 py-4 transition-opacity ${disabled ? "opacity-50 grayscale cursor-not-allowed" : "active:opacity-70 cursor-pointer"}`}
      style={{ borderBottom: "1px solid var(--border-muted)" }}
    >
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <h3 className="m-0 text-[15px] font-semibold leading-snug line-clamp-2" style={{ color: "var(--text-primary)", letterSpacing: "-0.2px" }}>
          {product.name}
        </h3>
        {showDescription && (
          <p className="m-0 text-[13px] leading-snug line-clamp-2" style={{ color: "var(--text-secondary)" }}>
            {product.description}
          </p>
        )}
        <div className="mt-0.5 flex items-start gap-2 flex-wrap">
          <ProductPriceLine product={product} />
          {(product.isVegan || product.isVegetarian || product.isGlutenFree) && (
            <span className="flex items-center gap-1.5 ml-0.5">
              {product.isVegan && <span className="text-[11.5px] font-medium px-1.5 rounded-md" style={{ color: "var(--success-ink)", border: "1px solid color-mix(in srgb, var(--success-ink) 30%, transparent)" }}>Vegan</span>}
              {product.isVegetarian && !product.isVegan && <span className="text-[11.5px] font-medium px-1.5 rounded-md" style={{ color: "var(--success-ink)", border: "1px solid color-mix(in srgb, var(--success-ink) 30%, transparent)" }}>Vegetarisk</span>}
              {product.isGlutenFree && <span className="text-[11.5px] font-medium px-1.5 rounded-md" style={{ color: "var(--success-ink)", border: "1px solid color-mix(in srgb, var(--success-ink) 30%, transparent)" }}>Glutenfri</span>}
            </span>
          )}
        </div>
      </div>

      {/* Med bild: 92px ruta med flytande guld-plus. Utan bild: ren textrad
          med plus-knappen till höger. */}
      {hasImage ? (
        <div className="relative shrink-0 w-[92px] h-[92px] rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-deep)" }}>
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="96px"
            quality={82}
            className="object-cover"
            onError={() => setImgFailed(true)}
          />
          <span
            aria-hidden="true"
            className="absolute right-1.5 bottom-1.5 w-7 h-7 rounded-full grid place-items-center"
            style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--line-strong)", boxShadow: "0 1px 4px rgba(20,20,22,0.12)" }}
          >
            <Plus size={15} strokeWidth={2.2} />
          </span>
        </div>
      ) : (
        <span
          aria-hidden="true"
          className="shrink-0 w-8 h-8 rounded-full grid place-items-center"
          style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--line-strong)", boxShadow: "0 1px 4px rgba(20,20,22,0.12)" }}
        >
          <Plus size={16} strokeWidth={2.2} />
        </span>
      )}
    </button>
  );
}

/**
 * CompactCard — halv-bredds produktkort (displayMode COMPACT). Två per rad på
 * mobil: bild överst, namn + pris under. Samma deal/rabatt-logik som
 * UniformCard men i en kompakt box istället för full-bredds rad.
 */
function CompactCard({ product, onClick, disabled }: { product: any; onClick: () => void; disabled: boolean }) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => { setImgFailed(false); }, [product.imageUrl]);
  const hasImage = Boolean(product.imageUrl) && !imgFailed;
  const showDescription = Boolean(product.description) && !product.hideDescription;
  const { final, original } = getDisplayPrice(product);
  const discountPct = original != null && original > final ? Math.round((1 - final / original) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={`group relative w-full text-left flex flex-col rounded-xl overflow-hidden transition-opacity ${disabled ? "opacity-50 grayscale cursor-not-allowed" : "active:opacity-70 cursor-pointer"}`}
      style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
    >
      {/* Bild-yta — ALLTID samma kvadratiska höjd. Riktig bild om den laddar,
          annars en ren neutral platta med en dämpad bestick-ikon → alla kort
          får exakt samma höjd, 2-up jämnt. Flytande plus + rabatt-badge ligger
          alltid på bild-ytan (oavsett bild eller platta). */}
      <div className="relative w-full aspect-square overflow-hidden" style={{ backgroundColor: "var(--bg-deep)" }}>
        {hasImage ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, 280px"
            quality={82}
            className="object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <Utensils size={26} strokeWidth={1.6} style={{ color: "var(--text-secondary)", opacity: 0.45 }} />
          </div>
        )}
        <span
          aria-hidden="true"
          className="absolute right-1.5 bottom-1.5 w-7 h-7 rounded-full grid place-items-center"
          style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--line-strong)", boxShadow: "0 1px 4px rgba(20,20,22,0.12)" }}
        >
          <Plus size={15} strokeWidth={2.2} />
        </span>
        {discountPct > 0 && (
          <span className="absolute left-1.5 top-1.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-md" style={{ backgroundColor: "var(--gold-soft)", color: "var(--gold-ink)" }}>
            −{discountPct} %
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1 px-3 py-2.5">
        <h3 className="m-0 text-[14px] font-semibold leading-snug line-clamp-1" style={{ color: "var(--text-primary)", letterSpacing: "-0.2px" }}>
          {product.name}
        </h3>
        {showDescription && (
          <p className="m-0 text-[11.5px] leading-tight line-clamp-2" style={{ color: "var(--text-secondary)" }}>
            {product.description}
          </p>
        )}
        <div className="mt-auto pt-0.5">
          <ProductPriceLine product={product} compact />
        </div>
      </div>
    </button>
  );
}

/**
 * Renderar en kategoris produkter: FULL = full-bredds rad (UniformCard),
 * COMPACT = halv-bredd (CompactCard) där intilliggande COMPACT-produkter
 * paras ihop till ett 2-kolumns rutnät. Bevarar produktordningen.
 */
function renderCategoryProducts(
  products: any[],
  onOpen: (p: any) => void,
  disabled: boolean,
): ReactNode[] {
  const rows: ReactNode[] = [];
  let i = 0;
  while (i < products.length) {
    const p = products[i];
    if (p.displayMode === "COMPACT") {
      // Samla alla efterföljande COMPACT-produkter i en sammanhängande grupp.
      const group: any[] = [];
      while (i < products.length && products[i].displayMode === "COMPACT") {
        group.push(products[i]);
        i++;
      }
      rows.push(
        <div key={`compact-${group[0].id}`} className="grid grid-cols-2 gap-3 py-3">
          {group.map((cp) => (
            <CompactCard key={cp.id} product={cp} onClick={() => onOpen(cp)} disabled={disabled} />
          ))}
        </div>,
      );
    } else {
      rows.push(
        <UniformCard key={p.id} product={p} onClick={() => onOpen(p)} disabled={disabled} />,
      );
      i++;
    }
  }
  return rows;
}

const MenuContent = ({ restaurantSlug, restaurantId, isStandalone = false, embedMode = false, initialData = null }: MenuContentProps) => {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<any[]>(initialData?.categories ?? []);
  const [deals, setDeals] = useState<PublicDeal[]>(initialData?.deals ?? []);
  const [restaurant, setRestaurant] = useState<any>(initialData?.restaurant ?? null);
  // SSR seeded the menu → start without the blocking spinner / client fetch.
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(initialData?.categories?.[0]?.id ?? null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  const [address, setAddress] = useState("");
  // Initiera från det plattform-val kunden redan gjort (hem/discover/annan
  // restaurang). Default DELIVERY bara om inget val finns. Utan detta stod
  // orderType alltid på DELIVERY vid mount → adress-grinden trodde att en
  // pickup-kund saknade adress (ingen coords) och öppnade modalen igen.
  // SSR-säker default. Det riktiga valet läses ur localStorage EFTER mount i
  // effekten nedan (inte i initializern) — annars skiljer sig server-render
  // (alltid DELIVERY) från klientens första render → hydration-mismatch.
  const [orderType, setOrderType] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  // Grindarna nedan väntar på detta så pickup-kunder inte felaktigt promptas
  // medan orderType fortfarande står på sin SSR-default.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("platform_order_type") === "PICKUP") {
      setOrderType("PICKUP");
    }
    setHydrated(true);
  }, []);

  // Kundresan: besökaren öppnade en meny. Väntar på restaurangen så namnet
  // följer med — ett id i adminvyn säger ingenting om var folk faktiskt var.
  useEffect(() => {
    if (!restaurant?.id) return;
    trackJourney("RESTAURANT_VIEWED", {
      restaurantId: restaurant.id,
      meta: { name: restaurant.name, slug: restaurantSlug },
    });
  }, [restaurant?.id, restaurant?.name, restaurantSlug]);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<any>(null);
  // Zone check state
  const [zoneAvailable, setZoneAvailable] = useState<boolean | null>(null); // null = not checked yet
  const [checkingZone, setCheckingZone] = useState(false);

  const router = useRouter();

  const items = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clearCart);
  const updateDeliveryOverride = useCartStore((state) => state.updateDeliveryOverride);
  const subtotal = useCartStore((state) => state.getTotal());
  const productIds = items.flatMap((item) => Array.from({ length: item.quantity }, () => item.productId));
  // Favoriter — synkat med övriga vyer via localStorage-store
  const { isFavorite, toggle: toggleFavorite } = useFavorites();
  const bogoChoice = useCartStore((state) => state.bogoChoice);
  const setBogoChoice = useCartStore((state) => state.setBogoChoice);

  // Ett partnerfönster får aldrig visa eller skicka vidare en annan
  // restaurangs gamla lokala varukorg. Vanliga ViaEats-sidor behåller exakt
  // samma beteende som tidigare.
  useEffect(() => {
    if (!embedMode || !restaurant?.slug) return;
    const current = useCartStore.getState();
    if (current.items.length > 0 && current.restaurantSlug !== restaurant.slug) {
      clearCart();
    }
  }, [clearCart, embedMode, restaurant?.slug]);

  useEffect(() => {
    if (!embedMode || !restaurant?.slug) return;
    rememberEmbedParentOrigin(
      new URLSearchParams(window.location.search).get(EMBED_PARENT_ORIGIN_PARAM),
    );
    void ensureKioskAccess(restaurant.slug);
  }, [embedMode, restaurant?.slug]);

  // BOGO picker state
  const [bogoPicker, setBogoPicker] = useState<{
    dealId: string;
    dealTitle: string;
    rewardCategoryName: string | null;
    products: BogoPickerProduct[];
    excludedExtraIds: string[];
  } | null>(null);
  // Produkt vald från BOGO-picker → öppnas i ProductModal med gratis-kontext
  const [bogoProduct, setBogoProduct] = useState<{ product: any; dealId: string; dealTitle: string; rewardCategoryName: string | null; excludedExtraIds: string[] } | null>(null);

  // Track zone-availability in a ref so the socket handler always reads the latest value
  const zoneAvailableRef = useRef<boolean | null>(null);
  useEffect(() => { zoneAvailableRef.current = zoneAvailable; }, [zoneAvailable]);

  /**
   * Check delivery zone using validate-location (same endpoint as homepage).
   * - Gives consistent zone-specific fees (not affected by GPS missing on restaurant).
   * - validate-location only returns OPEN restaurants, so:
   *     • Open restaurant, address outside zone  → zoneAvailable = false  (show banner)
   *     • Closed restaurant, not in results      → zoneAvailable = null   (no banner)
   *     • Address outside all city zones         → zoneAvailable = false (only for open restaurants)
   * - Does NOT depend on deliveryOverrides to avoid an infinite update loop:
   *     updateDeliveryOverride → deliveryOverrides changes → checkZone recreated
   *     → fetchData recreated → useEffect refires → infinite loop.
   *   Instead, updateDeliveryOverride is a stable Zustand action reference.
   */
  const checkZone = useCallback(async (restaurantData: any): Promise<boolean | null> => {
    if (typeof window === "undefined") return null;
    const storedCoords = localStorage.getItem("platform_coords");
    const storedType = localStorage.getItem("platform_order_type") || "DELIVERY";
    if (!storedCoords || storedType !== "DELIVERY" || !restaurantData?.id) {
      setZoneAvailable(null);
      return null;
    }
    setCheckingZone(true);
    try {
      const coords = JSON.parse(storedCoords);
      // POST validate-location — same as homepage, gives authoritative zone fees
      const res = await axios.post(`${API_URL}/api/cities/validate-location`, {
        lat: coords.lat,
        lng: coords.lng,
      });

      if (!res.data.covered) {
        // Entire address is outside all city zones
        // Only flag as out-of-zone for open restaurants (closed ones show closed state instead)
        const result = embedMode || restaurantData?.isOpen ? false : null;
        setZoneAvailable(result);
        return result;
      }

      const allRestaurants: any[] = (res.data.cities || []).flatMap((c: any) => c.restaurants || []);
      const thisRest = allRestaurants.find((r: any) => r.id === restaurantData.id);

      if (!thisRest) {
        // Not in results — either closed (filtered out by validate-location) or outside zone
        if (!restaurantData?.isOpen && !embedMode) {
          setZoneAvailable(null); // Closed: zone check not applicable
          return null;
        }
        setZoneAvailable(false); // Open but outside this restaurant's zone
        return false;
      }

      // In zone — fees are in öre from the API → convert to kr
      const fee = (thisRest.matchedZone?.deliveryFee ?? 0) / 100;
      const min = (thisRest.matchedZone?.minOrder ?? 0) / 100;
      // ZONE-ETA: admin sätter "kickstart" per zon. När per-zon auto-räkning
      // implementeras (separat backend-job som mäter createdAt→deliveringAt
      // för orders inom zonen) returneras `calculatedEtaMinutes` här istället.
      // För nu visas admin-manual som hjälp tills tillräckligt med data finns.
      const zoneEta = thisRest.matchedZone?.etaMinutes;

      setZoneAvailable(true);
      setRestaurant((prev: any) =>
        prev ? {
          ...prev,
          deliveryFee: fee,
          minOrderAmount: min,
          // Skriv över restaurang-default-ETA med zon-ETA om finns → stats-kortet
          // matchar nu vad kortet på home visade (zone-specifik tid).
          etaMinutes: zoneEta != null ? zoneEta : prev.etaMinutes,
        } : null
      );
      // Update cart store so checkout shows the same zone fee
      // updateDeliveryOverride is a stable Zustand action — safe to call without adding to deps
      updateDeliveryOverride(restaurantData.id, fee, min);
      return true;
    } catch {
      setZoneAvailable(null); // fail open
      return null;
    } finally {
      setCheckingZone(false);
    }
  // ↓ Only stable Zustand action — no deliveryOverrides in deps (prevents infinite loop)
  }, [embedMode, updateDeliveryOverride]);

  const handleOrderTypeChange = useCallback((nextType: "DELIVERY" | "PICKUP") => {
    setOrderType(nextType);
    if (typeof window === "undefined") return;

    const previousType = localStorage.getItem("platform_order_type");
    localStorage.setItem("platform_order_type", nextType);

    if (nextType === "PICKUP") {
      setZoneAvailable(null);
      const pickupCity = localStorage.getItem("platform_pickup_city");
      if (pickupCity) {
        localStorage.setItem("platform_address", pickupCity);
        setAddress(pickupCity);
        return;
      }
      setShowAddressModal(true);
      return;
    }

    const deliveryAddress =
      localStorage.getItem("platform_delivery_address") ||
      (previousType !== "PICKUP" ? localStorage.getItem("platform_address") : null);
    const hasCoords = Boolean(localStorage.getItem("platform_coords"));
    if (deliveryAddress) {
      localStorage.setItem("platform_address", deliveryAddress);
      setAddress(deliveryAddress);
    }
    if (!deliveryAddress || !hasCoords) {
      setShowAddressModal(true);
      return;
    }
    if (restaurant) void checkZone(restaurant);
  }, [checkZone, restaurant]);

  const ssrSeededRef = useRef(!!initialData);
  const fetchData = useCallback(async () => {
    // First mount with SSR-seeded data: rendera direkt från servern (ingen
    // spinner) MEN kör ändå en TYST bakgrunds-refetch. SSR-datan kan vara
    // stale i upp till 5 min (Next Data Cache) om on-demand-revalidate inte är
    // konfigurerad — då skulle t.ex. en nyligen uppladdad Erbjudande-bild
    // (offersImageUrl) eller kategori-bild aldrig synas. Den tysta refetchen
    // hämtar färsk meny utan flicker. Senare anrop (socket) kör normalt.
    const ssrSeed = ssrSeededRef.current;
    ssrSeededRef.current = false;
    try {
      if (!ssrSeed) setLoading(true);
      setError(null);

      const params: any = {};
      if (restaurantId) params.restaurantId = restaurantId;
      if (restaurantSlug) params.slug = restaurantSlug;
      // format=normalized → mindre payload; rehydreras nedan till samma form.
      const channelParams = embedMode ? { channel: "partner_embed" } : {};
      const menuParams = { ...params, ...channelParams, format: MENU_FORMAT_PARAM, v: "20260702" };

      const [menuRes, restaurantRes, dealsRes] = await Promise.all([
        axios.get(`${API_URL}/api/menu/categories`, { params: menuParams }),
        restaurantSlug ? axios.get(`${API_URL}/api/restaurants/${restaurantSlug}`) : Promise.resolve({ data: null }),
        axios.get(`${API_URL}/api/deals`, {
          params: {
            ...(restaurantId ? { restaurantId } : restaurantSlug ? { slug: restaurantSlug } : {}),
            ...channelParams,
          },
        }),
      ]);

      // Rehydrera (normalized → inbäddade extraGroups). Tål även default/array.
      const nextCategories = rehydrateMenuCategories(menuRes.data) as any[];
      setCategories(nextCategories);
      setDeals(dealsRes.data);
      if (restaurantRes.data) {
        setRestaurant(restaurantRes.data);
        // Run zone check after setting restaurant
        await checkZone(restaurantRes.data);
      } else {
        const settingsRes = await axios.get(`${API_URL}/api/settings`);
        setRestaurant({
          name: "ViaEats Lund",
          isOpen: settingsRes.data.isOpen ?? true,
          deliveryFee: settingsRes.data.deliveryFee ?? 0,
          minOrderAmount: settingsRes.data.minOrderAmount ?? 150,
          etaMinutes: settingsRes.data.estimatedDeliveryTime ?? 35,
        });
      }

      if (nextCategories.length > 0) setActiveCategory(nextCategories[0].id);
    } catch (err) {
      console.error("Error fetching menu data:", err);
      // På en tyst SSR-seed-refresh: visa INTE fel-overlay över redan renderad
      // SSR-data — behåll det servern gav oss.
      if (!ssrSeed) setError(t("menu.loadError"));
    } finally {
      if (!ssrSeed) setLoading(false);
    }
  }, [restaurantId, restaurantSlug, checkZone, embedMode, initialData]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("platform_address");
      if (stored) setAddress(stored);
      const storedType = localStorage.getItem("platform_order_type");
      if (storedType === "PICKUP" || storedType === "DELIVERY") setOrderType(storedType as "DELIVERY" | "PICKUP");
    }

    fetchData();

    let socket: Socket | null = null;
    let cancelled = false;

    void import("socket.io-client").then(({ io }) => {
      if (cancelled) return;
      socket = io(SOCKET_URL, {
        path: "/socket.io",
        transports: ["websocket", "polling"],
      });

      socket.on("settings:updated", (nextSettings) => {
        const isGlobal = !nextSettings.slug && !nextSettings.restaurantId;
        const isMatch = nextSettings.slug === restaurantSlug || (restaurantId && nextSettings.restaurantId === restaurantId);

        if (isMatch || (isGlobal && !restaurantSlug)) {
          setRestaurant((prev: any) => {
            if (!prev) return prev;
            const zoneWasChecked = zoneAvailableRef.current === true;
            return {
              ...prev,
              isOpen: nextSettings.isOpen ?? prev.isOpen ?? true,
              // Don't overwrite zone-checked fee with socket base fee
              // (socket sends the restaurant's base fee; zone fee takes priority)
              deliveryFee: zoneWasChecked ? prev.deliveryFee : (nextSettings.deliveryFee ?? prev.deliveryFee ?? 0),
              minOrderAmount: zoneWasChecked ? prev.minOrderAmount : (nextSettings.minOrderAmount ?? prev.minOrderAmount ?? 150),
              etaMinutes: nextSettings.estimatedDeliveryTime ?? nextSettings.etaMinutes ?? prev.etaMinutes ?? 35,
            };
          });
        }
      });

      // A15: real-time menu propagation. When admin/restaurant changes a product,
      // category, or extra, we refetch the menu so customers never see stale data.
      // Cart revalidation happens on next checkout (existing path) — the menu
      // refetch alone removes the item from the catalog UI so users notice.
      socket.on("menu:changed", (evt: { restaurantId?: string | null }) => {
        const isMatch = !evt.restaurantId || (restaurantId && evt.restaurantId === restaurantId);
        if (!isMatch) return;
        // Notify the rest of the app (e.g. cart page) — listeners can decide
        // whether to revalidate cart contents.
        try { window.dispatchEvent(new CustomEvent("viaeats:menu-changed", { detail: evt })); } catch {}
        fetchData();
      });
    });

    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [restaurantSlug, restaurantId, fetchData]);

  // Adressmodalen laddas på faktisk intent (adressknapp/produktklick). Det
  // undviker att kartbibliotek och tiles blockar första restaurang-renderingen.

  // Refs för pill-knapparna — används för att auto-scrolla aktiv pill in i
  // viewport horisontellt när användaren scrollar mellan kategorier vertikalt.
  const pillRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  // Lås kort efter manuell pill-klick så IntersectionObserver inte direkt
  // skriver över aktiv kategori medan smooth-scroll pågår.
  const manualScrollUntilRef = useRef(0);

  // Observer som spårar vilken kategori-section som är synligast just nu
  // och uppdaterar activeCategory därefter. rootMargin offsetar för
  // sticky-headerns höjd så "första synliga" matchar visuellt vad
  // användaren faktiskt tittar på.
  useEffect(() => {
    if (typeof window === "undefined" || categories.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < manualScrollUntilRef.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          const id = (visible[0].target as HTMLElement).id;
          setActiveCategory((prev) => (prev === id ? prev : id));
        }
      },
      { rootMargin: "-180px 0px -55% 0px", threshold: [0, 0.1, 0.3, 0.6, 1] },
    );
    const elements: HTMLElement[] = [];
    categories.forEach((cat) => {
      const el = document.getElementById(cat.id);
      if (el) {
        observer.observe(el);
        elements.push(el);
      }
    });
    return () => {
      elements.forEach((el) => observer.unobserve(el));
      observer.disconnect();
    };
  }, [categories]);

  // När activeCategory ändras (av observer eller klick): scrolla pill-listan
  // horisontellt så aktiv pill alltid är synlig (centrerad om möjligt).
  useEffect(() => {
    if (!activeCategory) return;
    const pill = pillRefs.current.get(activeCategory);
    if (pill) {
      pill.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [activeCategory]);

  // Måste definieras FÖRE early returns — Rules of Hooks
  const checkBogoTrigger = useCallback(() => {
    const bogoDeal = deals.find((d) => d.triggerType === "BOGO_CATEGORY");
    if (!bogoDeal) return;

    const currentItems = useCartStore.getState().items;
    const existingChoice = useCartStore.getState().bogoChoice;
    if (existingChoice?.dealId === bogoDeal.id) return;

    const needed = bogoDeal.triggerQuantity ?? 2;
    let triggered = false;

    if (bogoDeal.bogoTriggerProductIds && bogoDeal.bogoTriggerProductIds.length > 0) {
      const count = currentItems
        .filter((i) => bogoDeal.bogoTriggerProductIds!.includes(i.productId))
        .reduce((s, i) => s + i.quantity, 0);
      triggered = count >= needed;
    } else if (bogoDeal.triggerCategoryId) {
      const catProducts = new Set(
        (categories.find((c) => c.id === bogoDeal.triggerCategoryId)?.products ?? []).map((p: any) => p.id)
      );
      const count = currentItems
        .filter((i) => catProducts.has(i.productId))
        .reduce((s, i) => s + i.quantity, 0);
      triggered = count >= needed;
    } else if (bogoDeal.bogoMinOrderAmountOre) {
      triggered = useCartStore.getState().getTotal() * 100 >= bogoDeal.bogoMinOrderAmountOre;
    }

    if (!triggered) return;

    const rewardCatId = bogoDeal.rewardCategoryId || bogoDeal.triggerCategoryId;
    const allowedRewardIds = new Set(bogoDeal.bogoRewardProductIds ?? []);
    let rewardProducts: BogoPickerProduct[] = [];
    let rewardCategoryName: string | null = null;

    const applyWhitelist = (prods: BogoPickerProduct[]) =>
      allowedRewardIds.size > 0 ? prods.filter((p) => allowedRewardIds.has(p.id)) : prods;

    const toPickerProduct = (p: any): BogoPickerProduct => ({
      id: p.id, name: p.name, price: p.price, imageUrl: p.imageUrl ?? null,
      extraGroups: p.extraGroups ?? [],
    });

    if (rewardCatId) {
      const cat = categories.find((c) => c.id === rewardCatId);
      if (cat) {
        rewardCategoryName = cat.name;
        rewardProducts = applyWhitelist((cat.products ?? []).map(toPickerProduct));
      }
    } else {
      rewardProducts = applyWhitelist(categories.flatMap((c) => (c.products ?? []).map(toPickerProduct)));
    }

    if (rewardProducts.length === 0) return;
    setBogoPicker({
      dealId: bogoDeal.id,
      dealTitle: bogoDeal.title,
      rewardCategoryName,
      products: rewardProducts,
      excludedExtraIds: bogoDeal.bogoExcludedExtraIds ?? [],
    });
  }, [deals, categories]);

  /**
   * Öppna produkt-modal. Hanterar 3 gating-fall i ordning:
   *  1. Restaurang stängd → tyst noop (kortet är redan disabled visuellt).
   *  2. Adress utanför leveranszon → scrolla upp till banner.
   *  3. Ingen adress satt (på DELIVERY) → öppna AddressModal med pending product.
   *  4. Annars → öppna ProductModal direkt.
   */
  const handleOpenProduct = useCallback((p: any) => {
    if (!restaurant?.isOpen) return;
    if (zoneAvailable === false) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (!address.trim() || (orderType === "DELIVERY" && !localStorage.getItem("platform_coords"))) {
      setPendingProduct(p);
      setShowAddressModal(true);
    } else {
      setSelectedProduct(p);
    }
  }, [restaurant?.isOpen, zoneAvailable, address, orderType]);

  // Embed-API mellan partnersidan och ViaEats iframe:en. Produktdeeplinks går
  // genom samma adress-/zon-grind som ett vanligt produktklick. Annars kunde
  // en deal på Palmyras startsida öppna produktmodalen utan leveransadress.
  useEffect(() => {
    if (!embedMode || typeof window === "undefined") return;
    const allowedOrigins = new Set([
      window.location.origin,
      "https://palmyrapizzeria.se",
      "https://www.palmyrapizzeria.se",
      "http://localhost:3000",
      "http://localhost:4000",
    ]);
    const sendHeight = () => {
      if (window.parent === window) return;
      window.parent.postMessage({
        type: "viaeats:embed-height",
        height: document.documentElement.scrollHeight,
      }, "*");
    };
    const onMessage = (event: MessageEvent) => {
      if (!allowedOrigins.has(event.origin) || !event.data || event.data.type !== "viaeats:open-product") return;
      const productId = typeof event.data.productId === "string" ? event.data.productId : "";
      if (!productId) return;
      const product = categories.flatMap((category: any) => category.products || []).find((item: any) => item.id === productId);
      if (product) handleOpenProduct(product);
    };
    window.addEventListener("message", onMessage);
    sendHeight();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sendHeight) : null;
    observer?.observe(document.documentElement);
    return () => {
      window.removeEventListener("message", onMessage);
      observer?.disconnect();
    };
  }, [categories, embedMode, handleOpenProduct]);

  // Partner-deeplink: ?product=<id> (från t.ex. partner-embedden på
  // restaurangens egen sajt) öppnar produkten direkt via samma gating som ett
  // vanligt klick (stängt/zon/adress). Väntar på hydrated så adress-grinden
  // läser kundens riktiga läge, konsumeras exakt en gång.
  const deepLinkDoneRef = useRef(false);
  useEffect(() => {
    if (deepLinkDoneRef.current || !hydrated || !restaurant || categories.length === 0) return;
    const productId = new URLSearchParams(window.location.search).get("product");
    deepLinkDoneRef.current = true;
    if (!productId) return;
    const product = categories
      .flatMap((c: any) => c.products ?? [])
      .find((p: any) => p.id === productId);
    if (product) handleOpenProduct(product);
  }, [hydrated, restaurant, categories, handleOpenProduct]);

  // Platt meny: hela restaurangens kategorier visas direkt. Produkter filtreras
  // på sökterm. Inga huvudkategorier längre.
  const scopedCategories = categories;

  const filteredCategories = scopedCategories
    .map((cat: any) => ({
      ...cat,
      products: cat.products.filter(
        (p: any) =>
          p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.description?.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    }))
    .filter((cat: any) => cat.products.length > 0);


  if (loading) {
    return (
      <div className="pb-32 md:pt-20" style={{ backgroundColor: "var(--bg-primary)" }}>
        {/* Hero — matchar nya kompakta hero-höjden */}
        <div className="skeleton w-full h-40 sm:h-56 !rounded-none" />
        <div className="px-4 sm:px-6 pt-5 relative max-w-2xl mx-auto">
          {/* Namn + meta + inforad */}
          <div className="skeleton h-8 w-2/3 rounded-xl mb-3" />
          <div className="skeleton h-4 w-1/3 rounded-lg mb-2.5" />
          <div className="skeleton h-4 w-2/4 rounded-lg mb-6" />
          {/* Sök + kategori-pills */}
          <div className="skeleton h-11 w-full rounded-full mb-3" />
          <div className="flex gap-2 mb-8">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-9 w-24 rounded-full" />
            ))}
          </div>
          {/* Produktrader (full-bredd lista) */}
          <div>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton h-[92px] w-full rounded-xl mb-2.5" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || (!restaurant && !loading)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="w-16 h-16 rounded-xl flex items-center justify-center mb-6" style={{ backgroundColor: "rgba(225,29,72,0.08)" }}>
          <X size={28} strokeWidth={1.8} style={{ color: "#be123c" }} />
        </div>
        <h2 className="text-[20px] font-bold tracking-tight mb-1.5" style={{ color: "var(--text-primary)" }}>{t("menu.errorTitle")}</h2>
        <p className="text-[13.5px] mb-8 max-w-sm" style={{ color: "var(--text-secondary)" }}>{error || t("menu.restaurantNotFound")}</p>
        {!embedMode && <Link href="/" className="px-6 h-12 bg-gold-500 rounded-xl text-[15px] font-semibold active:scale-95 transition-all flex items-center" style={{ color: "#141416" }}>{t("menu.goHome")}</Link>}
      </div>
    );
  }

  const restaurantDisplayTitle = restaurant?.name || t("common.loading");
  const embedIsPalmyra = embedMode && restaurant?.slug === "palmyra-pizzeria-lund";
  const restaurantPaused = ["PLATFORM_PAUSED", "CITY_PAUSED", "RESTAURANT_PAUSED"].includes(String(restaurant?.availabilityReason || "")) ||
    (restaurant?.pausedUntil && new Date(restaurant.pausedUntil).getTime() > Date.now());
  const availabilityLabel = restaurantPaused ? "Pausad · många beställningar" : restaurant?.isOpen ? t("menu.statusOpen") : t("menu.statusClosed");

  const heroImage = restaurant?.heroImageUrl || restaurant?.imageUrl;

  return (
    <div className="pb-32 md:pt-20 selection:bg-gold-500/30" style={{ backgroundColor: "var(--bg-primary)" }}>
      {/* ── Hero: kompakt — bilden är kontext, inte huvudinnehåll ────────── */}
      <div className="relative w-full h-40 sm:h-56 overflow-hidden">
        {/* Heron är en 160 px hög remsa (224 px från sm). Den begärde 3840 px i
            kvalitet 90 = 111 kB till en mobil som behöver 42 kB — och det här
            är sidan annonsklick landar på. */}
        {heroImage ? (
          <span
            role="img"
            aria-label={restaurant?.name || ""}
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url("${optimizedImageUrl(heroImage, RESTAURANT_HERO_IMAGE_WIDTH, RESTAURANT_HERO_IMAGE_QUALITY)}")` }}
          />
        ) : (
          <div className="w-full h-full" style={{ backgroundImage: "linear-gradient(135deg, var(--bg-deep), var(--bg-primary))" }} />
        )}
        {/* Subtil mörkare gradient i topp + ljus fade nederst för seamless övergång till content */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[color:var(--bg-primary)] to-transparent" />

        {/* Top-icons: Back (vänster), Favorit (höger) — share-knapp borttagen.
            Back går ETT steg tillbaka i historiken (tillbaka till hemsidan med
            den kategori man stod på) istället för en hård redirect till "/".
            Fallback till "/" om sidan öppnades direkt (ingen historik). */}
        {!embedMode && <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) router.back();
            else router.push("/");
          }}
          aria-label={t("common.back")}
          className="absolute left-4 w-11 h-11 rounded-full backdrop-blur-xl bg-white/85 border border-white/40 flex items-center justify-center shadow-lg active:scale-90 transition-transform duration-200 ease-out"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
        >
          <ChevronLeft size={20} className="text-zinc-900" />
        </button>}
        {/* Top-höger kluster: Info + Kontakt (telefon) + Favorit — kompakta
            ikon-knappar uppe i hero:n istället för stora pill-knappar nedanför.
            Gör headern smalare och simplare. */}
        <div
          className="absolute right-4 flex items-center gap-2"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
        >
          <button
            type="button"
            onClick={() => setShowInfoModal(true)}
            aria-label={t("menu.info")}
            className="w-10 h-10 rounded-full backdrop-blur-xl bg-white/85 border border-white/40 flex items-center justify-center shadow-lg active:scale-90 transition-transform"
          >
            <Info size={18} className="text-zinc-800" />
          </button>
          {restaurant?.phone && (
            <a
              href={`tel:${String(restaurant.phone).replace(/\s+/g, "")}`}
              aria-label={t("menu.contact")}
              className="w-10 h-10 rounded-full backdrop-blur-xl bg-gold-500 border border-white/30 flex items-center justify-center shadow-lg active:scale-90 transition-transform"
            >
              <Phone size={17} className="text-zinc-950" />
            </a>
          )}
          {restaurant?.id && !embedMode && (
            <button
              type="button"
              aria-label="Spara favorit"
              aria-pressed={isFavorite(restaurant.id)}
              onClick={() => toggleFavorite(restaurant.id)}
              className="w-10 h-10 rounded-full backdrop-blur-xl bg-white/85 border border-white/40 flex items-center justify-center shadow-lg active:scale-95 transition-all"
            >
              <Heart
                size={18}
                className={isFavorite(restaurant.id) ? "text-rose-500" : "text-zinc-700"}
                fill={isFavorite(restaurant.id) ? "currentColor" : "none"}
              />
            </button>
          )}
        </div>

      </div>

      {/* ── Restaurang-info DIREKT under hero (titel, rating, knappar) ──── */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-5 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="m-0 font-bold tracking-tight leading-tight text-[1.65rem] sm:text-4xl" style={{ color: "var(--text-primary)" }}>
            {restaurantDisplayTitle}
          </h1>
          {/* Öppet/stängt — lugn chip i statuspaletten, ingen puls */}
          <div
            className="px-2.5 py-1 rounded-md flex items-center gap-1.5"
            style={{ backgroundColor: restaurantPaused ? "var(--gold-soft)" : restaurant?.isOpen ? "var(--success-soft)" : "rgba(225,29,72,0.08)" }}
          >
            <span className="text-[12px] font-semibold" style={{ color: restaurantPaused ? "var(--gold-ink)" : restaurant?.isOpen ? "var(--success-ink)" : "#be123c" }}>
              {availabilityLabel}
            </span>
          </div>
        </div>
        {/* Metarad: ★ rating (antal) · cuisine */}
        <div className="mt-2 flex items-center gap-2 text-sm">
          {embedMode ? (
            <span className="flex items-center gap-1.5">
              <Star size={14} className="text-gold-500 fill-gold-500" />
              <span className="font-bold" style={{ color: "var(--text-primary)" }}>{(restaurant?.rating || 5.0).toFixed(1)}</span>
              <span className="font-medium text-xs" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>({restaurant?.ratingCount || 1})</span>
            </span>
          ) : <Link
            href={`/r/${restaurantSlug || restaurant.slug}/reviews`}
            className="flex items-center gap-1.5 hover:opacity-75 transition-opacity"
          >
            <Star size={14} className="text-gold-500 fill-gold-500" />
            <span className="font-bold" style={{ color: "var(--text-primary)" }}>{(restaurant?.rating || 5.0).toFixed(1)}</span>
            <span className="font-medium text-xs" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>({restaurant?.ratingCount || 1})</span>
          </Link>}
          {restaurant?.cuisine && (
            <>
              <span style={{ color: "var(--text-secondary)", opacity: 0.5 }}>·</span>
              <span className="font-medium text-[13px]" style={{ color: "var(--text-secondary)" }}>{restaurant.cuisine}</span>
            </>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 rounded-[10px] overflow-hidden" style={{ border: "1px solid var(--line-strong)" }}>
          {(["DELIVERY", "PICKUP"] as const).map((type, i) => {
            const active = orderType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => handleOrderTypeChange(type)}
                className="relative flex h-11 items-center justify-center gap-2 text-[13.5px] transition-colors"
                style={{
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                  fontWeight: active ? 700 : 500,
                  backgroundColor: active ? "var(--gold-soft)" : "var(--bg-secondary)",
                  borderLeft: i === 1 ? "1px solid var(--line-strong)" : undefined,
                }}
              >
                {type === "DELIVERY" ? <Truck size={15} /> : <Store size={15} />}
                {type === "DELIVERY" ? t("cart.deliveryType.delivery") : t("cart.deliveryType.pickup")}
                {active && <span className="absolute left-4 right-4 bottom-0 h-[2px] rounded-full" style={{ backgroundColor: "var(--color-gold-500)" }} />}
              </button>
            );
          })}
        </div>

      </div>

      <div className="mx-auto max-w-2xl px-4 sm:px-6 pt-4 relative">

        {/* Embedded partners show the selected address immediately below the
            delivery/pickup toggle. The same zone result gates product clicks. */}
        {embedMode && (
          <button
            type="button"
            onClick={() => setShowAddressModal(true)}
            className="mb-4 w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors active:scale-[0.99]"
            style={{
              backgroundColor: zoneAvailable === true ? "rgba(22,163,74,0.07)" : zoneAvailable === false ? "rgba(225,29,72,0.07)" : "var(--bg-secondary)",
              border: `1px solid ${zoneAvailable === true ? "rgba(22,163,74,0.28)" : zoneAvailable === false ? "rgba(225,29,72,0.25)" : "var(--border-muted)"}`,
            }}
          >
            {orderType === "PICKUP" ? (
              <Store size={17} className="shrink-0" style={{ color: "var(--gold-ink)" }} />
            ) : zoneAvailable === true ? (
              <CheckCircle2 size={18} className="shrink-0" style={{ color: "#15803d" }} />
            ) : zoneAvailable === false ? (
              <AlertTriangle size={18} className="shrink-0" style={{ color: "#be123c" }} />
            ) : (
              <MapPin size={18} className="shrink-0" style={{ color: "var(--text-secondary)" }} />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold" style={{ color: zoneAvailable === true ? "#166534" : zoneAvailable === false ? "#be123c" : "var(--text-primary)" }}>
                {orderType === "PICKUP"
                  ? "Avhämtning i Lund"
                  : address || "Välj leveransadress"}
              </span>
              <span className="block text-[12px] mt-0.5" style={{ color: zoneAvailable === true ? "#15803d" : zoneAvailable === false ? "#be123c" : "var(--text-secondary)" }}>
                {orderType === "PICKUP"
                  ? "Endast Palmyra Pizzeria, Lund"
                  : zoneAvailable === true
                    ? "Vi levererar till din adress"
                    : zoneAvailable === false
                      ? "Vi levererar inte dit"
                      : checkingZone
                        ? "Kontrollerar leveransområde…"
                        : "Tryck för att välja adress"}
              </span>
            </span>
            <span className="shrink-0 text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>Ändra</span>
          </button>
        )}

        {/* Out-of-zone banner — only shown for OPEN restaurants; closed ones are handled by the closed state */}
          {zoneAvailable === false && restaurant?.isOpen && orderType === "DELIVERY" && !embedMode && (
            <div
              className="mb-6 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center gap-3.5"
              style={{ backgroundColor: "rgba(225,29,72,0.06)", border: "1px solid rgba(225,29,72,0.2)" }}
            >
              <AlertTriangle size={18} strokeWidth={1.8} className="shrink-0 mt-0.5 sm:mt-0" style={{ color: "#be123c" }} />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold mb-0.5" style={{ color: "#be123c" }}>
                  {t("menu.outOfZone.title")}
                </p>
                <p className="text-[13px] leading-snug break-words" style={{ color: "var(--text-secondary)" }}>
                  {address
                    ? t("menu.outOfZone.descWithAddress", { address })
                    : t("menu.outOfZone.desc")}{" "}
                  {t("menu.outOfZone.action")}
                </p>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  onClick={() => setShowAddressModal(true)}
                  className="px-4 h-10 rounded-xl text-[13.5px] font-semibold transition-all active:scale-95"
                  style={{ backgroundColor: "var(--text-primary)", color: "var(--bg-primary)" }}
                >
                  {t("menu.outOfZone.newAddress")}
                </button>
                {!embedMode && <Link
                  href="/"
                  className="px-4 h-10 rounded-xl text-[13.5px] font-semibold transition-all flex items-center"
                  style={{ border: "1px solid var(--line-strong)", color: "var(--text-primary)" }}
                >
                  {t("common.back")}
                </Link>}
              </div>
            </div>
          )}

        {/* Infobanner — admin-konfigurerbar text per restaurang */}
        {restaurant?.announcementText ? (
          <div
            className="mb-5 flex items-start gap-3 rounded-xl px-4 py-3.5"
            style={{ backgroundColor: "var(--gold-soft)", border: "1px solid color-mix(in srgb, var(--gold-ink) 25%, transparent)" }}
          >
            <Info size={15} strokeWidth={1.8} className="mt-0.5 shrink-0" style={{ color: "var(--gold-ink)" }} />
            <p className="text-[13.5px] font-medium leading-snug" style={{ color: "var(--gold-ink)" }}>
              {restaurant.announcementText}
            </p>
          </div>
        ) : null}


        {/* Previously ordered bar (inloggade kunder) */}
        {restaurant?.id && !embedMode && (
          <PreviouslyOrderedBar restaurantId={restaurant.id} restaurantSlug={restaurantSlug || restaurant.slug} />
        )}

        {/* ── Inforad: leveransfakta i EN tunn rad (ersätter stats-kortet).
            Samma värden som förut — avgift (zon-logik intakt), väntetid och
            minsta order — men utan kort-i-kort. Wrappar snyggt på 320px. */}
        {orderType === "DELIVERY" && (
          <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
            <span className="inline-flex items-center gap-1.5">
              <Bike size={15} className="shrink-0" strokeWidth={1.8} style={{ color: "var(--text-secondary)" }} />
              <span className="font-semibold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
                {(zoneAvailable === false && restaurant?.isOpen)
                  ? "–"
                  : (() => {
                      // Avgift att visa: matchad zon om adressen löst en (zoneAvailable===true),
                      // annars LÄGSTA aktiva zon-avgift — den riktiga fallbacken, inte bas-
                      // defaulten (t.ex. 49). Zon-fee lagras i öre → /100. Ingen hårdkodning.
                      const zones = Array.isArray((restaurant as any)?.deliveryZones) ? (restaurant as any).deliveryZones : [];
                      const zoneFees = zones
                        .filter((z: any) => z && z.isActive !== false && typeof z.fee === "number")
                        .map((z: any) => z.fee / 100);
                      const minZoneFee = zoneFees.length ? Math.min(...zoneFees) : undefined;
                      const fee = zoneAvailable === true ? restaurant.deliveryFee : (minZoneFee ?? restaurant.deliveryFee);
                      return fee === 0 ? t("menu.stats.free") : `${fee} kr`;
                    })()}
              </span>
              <span className="lowercase" style={{ color: "var(--text-secondary)" }}>{t("menu.stats.fee")}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock size={15} className="shrink-0" strokeWidth={1.8} style={{ color: "var(--text-secondary)" }} />
                <span className="font-semibold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{embedIsPalmyra ? "30–45 min" : `~${restaurant.etaMinutes} ${t("menu.stats.min")}`}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShoppingBag size={15} className="shrink-0" strokeWidth={1.8} style={{ color: "var(--text-secondary)" }} />
              <span className="font-semibold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{restaurant.minOrderAmount} kr</span>
              <span className="lowercase" style={{ color: "var(--text-secondary)" }}>{t("menu.stats.minOrder")}</span>
            </span>
          </div>
        )}

        {/* Avhämtningsläge: visa BARA avhämtningstid (min-order gäller bara
            leverans). Tid = leverans-ETA − 5 min, clampad 5–25. */}
        {orderType === "PICKUP" && (
          <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
            <span className="inline-flex items-center gap-1.5">
              <Clock size={15} className="shrink-0" strokeWidth={1.8} style={{ color: "var(--text-secondary)" }} />
              <span className="font-semibold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{embedIsPalmyra ? "~10 min" : `~${Math.max(5, Math.min(25, (restaurant.etaMinutes ?? 30) - 5))} ${t("menu.stats.min")}`}</span>
              <span className="lowercase" style={{ color: "var(--text-secondary)" }}>{t("cart.deliveryType.pickup")}</span>
            </span>
          </div>
        )}

        {/* ── STICKY header: tillbaka + sök (restaurangnamn) + kategori-pills ──
            Allt i EN sticky-bar som följer med vid scroll → back-knappen och
            sökrutan (placeholder = restaurangens namn) förblir alltid synliga.
            Ärver containerns marginal (ingen -mx) → ingen horisontell overflow.
            top: mobil = safe-area (ingen navbar), desktop = 80px (fast navbar). */}
        <div
          className="sticky z-30 mb-8 pt-2 pb-2.5 top-[env(safe-area-inset-top,0px)] md:top-20"
          style={{ backgroundColor: "var(--bg-primary)" }}
        >
          {/* Rad 1: tillbaka-knapp + sökruta (visar restaurangens namn) */}
          <div className="flex items-center gap-2.5">
              {!embedMode && <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined" && window.history.length > 1) router.back();
                else router.push("/");
              }}
              aria-label={t("common.back")}
              className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-transform"
              style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
            >
              <ChevronLeft size={20} />
              </button>}
            <div className="flex-1 min-w-0 h-12 rounded-xl flex items-center gap-2.5 px-4" style={{ backgroundColor: "var(--bg-deep)" }}>
              <Search size={16} strokeWidth={2} className="shrink-0" style={{ color: "var(--text-secondary)" }} />
              <input
                type="text"
                placeholder={restaurant?.name || t("menu.searchPlaceholder")}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full min-w-0 bg-transparent border-none text-[14px] font-medium focus:ring-0 focus:outline-none placeholder:text-zinc-400 truncate"
                style={{ color: "var(--text-primary)" }}
              />
            </div>
          </div>

          {/* Rad 2: kategorier som understrukna tabbar (referralflöde) — aktiv =
              text-primary med 2px underline, inaktiv = secondary. Scroll-spy
              och auto-center är oförändrade. */}
          {scopedCategories.length > 0 && (
            <div
              className="flex gap-6 no-scrollbar pt-2 border-b"
              style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" as any, touchAction: "pan-x", borderColor: "var(--border-muted)" }}
            >
              {scopedCategories.map((cat: any) => {
                const isActive = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    ref={(el) => {
                      if (el) pillRefs.current.set(cat.id, el);
                      else pillRefs.current.delete(cat.id);
                    }}
                    onClick={() => {
                      setActiveCategory(cat.id);
                      // Pausa intersection-observer i 700ms så manuellt klick
                      // hinner scrolla färdigt utan att observer skriver över.
                      manualScrollUntilRef.current = Date.now() + 700;
                      const element = document.getElementById(cat.id);
                      if (element) {
                        const offset = 100;
                        window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - offset, behavior: "smooth" });
                      }
                    }}
                    className="pb-2.5 text-[14.5px] font-semibold transition-colors shrink-0 whitespace-nowrap"
                    style={{
                      color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                      borderBottom: isActive ? "2px solid var(--color-gold-500, #F0531C)" : "2px solid transparent",
                      marginBottom: "-1px",
                    }}
                  >
                    {cat.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Menyn: kategorier med produkter (FULL eller COMPACT per produkt) ── */}
        <div className="space-y-12">
           {filteredCategories.length === 0 ? (
             <EmptyState
               icon={ShoppingBag}
               title={t("menu.noMenuTitle")}
               text={t("menu.noMenuDesc")}
               ctaLabel={t("menu.goHome")}
               ctaHref="/"
             />
           ) : (
             <>
               {filteredCategories.map((cat: any) => (
                 <section key={cat.id} id={cat.id}>
                   <div className="flex items-baseline gap-3 pt-4 pb-2">
                     <h2 className="m-0 text-lg sm:text-xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                       {cat.name}
                     </h2>
                     <span className="ml-auto text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
                       {cat.products.length === 1 ? t("menu.dishCount.one", { n: cat.products.length }) : t("menu.dishCount.other", { n: cat.products.length })}
                     </span>
                   </div>
                   {/* Full-width lista med hårfina avdelare (listvy) — inga
                       kort-i-kort, ren bakgrund hela vägen ut till kanten. FULL =
                       full-bredds rad, COMPACT = halv-bredd (2 per rad). */}
                   <div style={{ borderTop: "1px solid var(--border-muted)" }}>
                     {renderCategoryProducts(
                       cat.products,
                       handleOpenProduct,
                  !restaurant?.isOpen || zoneAvailable === false,
                     )}
                   </div>
                 </section>
               ))}
             </>
           )}
        </div>
      </div>

      {/* Overlays / Modals */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          restaurantId={restaurant?.id || ""}
          restaurantSlug={restaurantSlug}
          onClose={() => {
            setSelectedProduct(null);
            // Kontrollera om BOGO-deal triggas efter att produkten lagts i korgen
            setTimeout(() => checkBogoTrigger(), 50);
          }}
        />
      )}

      {bogoPicker && (
        <BogoPickerModal
          dealId={bogoPicker.dealId}
          dealTitle={bogoPicker.dealTitle}
          restaurantId={restaurant?.id || ""}
          rewardCategoryName={bogoPicker.rewardCategoryName}
          products={bogoPicker.products}
          onClose={() => setBogoPicker(null)}
          onSelectProduct={(p) => {
            setBogoProduct({
              product: p,
              dealId: bogoPicker.dealId,
              dealTitle: bogoPicker.dealTitle,
              rewardCategoryName: bogoPicker.rewardCategoryName,
              excludedExtraIds: bogoPicker.excludedExtraIds,
            });
            setBogoPicker(null);
          }}
        />
      )}

      {bogoProduct && (
        <ProductModal
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

      {showInfoModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/40 backdrop-blur-md p-4 sm:p-6" onClick={() => setShowInfoModal(false)}>
          <div
            className="w-full max-w-md rounded-2xl relative overflow-hidden max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
          >
              {/* Header — restaurant name + close. The full info modal got a
                  cleaner header so the rest of the body can breathe. */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b" style={{ borderColor: "var(--border-muted)" }}>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium mb-0.5" style={{ color: "var(--text-secondary)" }}>{t("menu.info.title")}</div>
                  <h2 className="text-[18px] font-bold tracking-tight truncate" style={{ color: "var(--text-primary)" }}>
                    {restaurant?.name}
                  </h2>
                </div>
                <button
                  onClick={() => setShowInfoModal(false)}
                  className="shrink-0 ml-3 w-9 h-9 rounded-full flex items-center justify-center hover:opacity-70 transition-colors"
                  aria-label={t("common.close")}
                >
                  <X size={18} className="text-zinc-500" />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-5 space-y-5">
                {restaurant?.description && (
                  <div>
                    <div className="text-[12.5px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>{t("product.description")}</div>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{restaurant.description}</p>
                  </div>
                )}

                {restaurant?.address && (
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5" size={16} strokeWidth={1.8} style={{ color: "var(--text-secondary)" }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>{t("menu.info.findHere")}</div>
                      {/* Tappable address — opens Google Maps from any device.
                          Falls back gracefully if no zip/city. */}
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([restaurant.address, restaurant.zip, restaurant.city].filter(Boolean).join(", "))}`}
                        target="_blank"
                        rel="noreferrer"
                        className="block group"
                      >
                        <div className="text-sm font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>{restaurant.address}</div>
                        {(restaurant.zip || restaurant.city) && (
                          <div className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
                            {[restaurant.zip, restaurant.city].filter(Boolean).join(" ")}
                          </div>
                        )}
                        <span className="text-[12.5px] font-medium mt-1 inline-block" style={{ color: "var(--gold-ink)" }}>{t("menu.info.openMaps") || "Öppna i kartor"}</span>
                      </a>
                    </div>
                  </div>
                )}

                {restaurant?.phone && (
                  <div className="flex items-start gap-3">
                    <Phone className="mt-0.5" size={16} strokeWidth={1.8} style={{ color: "var(--text-secondary)" }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>{t("menu.info.callUs")}</div>
                      <a href={`tel:${String(restaurant.phone).replace(/\s+/g, "")}`} className="text-sm font-semibold transition-colors" style={{ color: "var(--text-primary)" }}>
                        {restaurant.phone}
                      </a>
                    </div>
                  </div>
                )}

                {(restaurant as any)?.email && (
                  <div className="flex items-start gap-3">
                    <Mail className="mt-0.5" size={16} strokeWidth={1.8} style={{ color: "var(--text-secondary)" }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>{t("menu.info.email")}</div>
                      <a href={`mailto:${(restaurant as any).email}`} className="text-sm font-semibold transition-colors break-words" style={{ color: "var(--text-primary)" }}>
                        {(restaurant as any).email}
                      </a>
                    </div>
                  </div>
                )}

                {/* Legal identity block — pulled live from Restaurant model
                    (legalName + organizationNumber) instead of hardcoded. Only
                    rendered when restaurant has filled in their company info. */}
                {((restaurant as any)?.legalName || (restaurant as any)?.organizationNumber) && (
                  <div className="pt-4 border-t" style={{ borderColor: "var(--border-muted)" }}>
                    <div className="text-[12.5px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>{t("menu.info.legal")}</div>
                    {(restaurant as any)?.legalName && (
                      <div className="text-sm font-semibold mb-0.5" style={{ color: "var(--text-primary)" }}>
                        {(restaurant as any).legalName}
                      </div>
                    )}
                    {(restaurant as any)?.organizationNumber && (
                      <div className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
                        {t("menu.info.orgNr", { nr: (restaurant as any).organizationNumber })}
                      </div>
                    )}
                  </div>
                )}
              </div>
          </div>
        </div>
      )}

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
              // Spegla stad-nycklarna som hemsidan läser, så adress-modalen inte
              // dyker upp igen när man redan valt här (paritet med home-flödet).
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
            // Re-check zone — checkZone returns the result directly (avoids stale state)
            let zoneOk: boolean | null = null;
            if (restaurant && newOrderType === "DELIVERY") {
              zoneOk = await checkZone(restaurant);
            } else {
              setZoneAvailable(null);
              zoneOk = null;
            }
            // Only open product modal if zone check didn't fail
            if (pendingProduct && zoneOk !== false) {
              setSelectedProduct(pendingProduct);
            }
            setPendingProduct(null);
          }}
          orderType={orderType}
          setOrderType={setOrderType}
          pickupCityName={embedMode ? "Lund" : undefined}
          confirmLabel={embedMode ? "Bekräfta och fortsätt" : undefined}
        />
      )}

      {/* DealSpotlight på restaurang-sidan borttagen — användaren ska bara
          se discountade priser direkt i menyn, inte en separat banner. */}
      <FloatingCartButton />
    </div>
  );
};

export default MenuContent;
