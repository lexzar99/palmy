"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { io, Socket } from "socket.io-client";
import { Search, Loader2, Info, ChevronLeft, MapPin, Phone, Mail, Clock, Bike, Star, ShoppingBag, X, AlertTriangle, Heart, Plus, Tag } from "lucide-react";
import { API_URL, SOCKET_URL } from "@/lib/api";
import ProductModal from "@/components/ProductModal";
import FloatingCartButton from "@/components/FloatingCartButton";
import DealSpotlight from "@/components/DealSpotlight";
import { PublicDeal, formatDealReward } from "@/lib/deals";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import AddressModal from "@/components/AddressModal";
import PreviouslyOrderedBar from "@/components/PreviouslyOrderedBar";
import DealBannerStrip from "@/components/DealBannerStrip";
import { useCartStore } from "@/store/cartStore";
import { useFavorites } from "@/lib/favoritesStore";
import BogoPickerModal, { type BogoPickerProduct } from "@/components/BogoPickerModal";
import { useTranslation } from "@/lib/i18n/LocaleProvider";

interface MenuContentInitialData {
  categories?: any[];
  mainCategories?: any[];
  deals?: PublicDeal[];
  restaurant?: any;
}

interface MenuContentProps {
  restaurantSlug?: string;
  restaurantId?: string;
  isStandalone?: boolean;
  /** Server-rendered first-paint data (from app/restaurants/[slug]/page.tsx).
   *  When present, the menu renders immediately with no client fetch waterfall. */
  initialData?: MenuContentInitialData | null;
}

// ─── Produktkort-helpers ─────────────────────────────────────────────────
// Visningsläget styrs från admin per produkt (Product.displayMode).
// "FULL"    → en per rad, stor bild + beskrivning + stor VARUKORG-knapp
// "COMPACT" → 2 per rad i grid, för drycker, sidor, chili cheese etc.
//
// Consecutiva COMPACT-produkter slås ihop till en 2-grid-rad. Om en kategori
// blandar FULL och COMPACT renderas de i den ordning admin satt position.

type ProductRow =
  | { type: "FULL"; product: any }
  | { type: "COMPACT"; products: any[] };

function groupProductsByDisplay(products: any[]): ProductRow[] {
  const rows: ProductRow[] = [];
  for (const p of products) {
    const mode = (p.displayMode === "COMPACT" ? "COMPACT" : "FULL") as "FULL" | "COMPACT";
    if (mode === "FULL") {
      rows.push({ type: "FULL", product: p });
    } else {
      const last = rows[rows.length - 1];
      if (last && last.type === "COMPACT" && last.products.length < 2) {
        last.products.push(p);
      } else {
        rows.push({ type: "COMPACT", products: [p] });
      }
    }
  }
  return rows;
}

function getDisplayPrice(p: any): { final: number; original: number | null } {
  if (p.discountActive) {
    const final = p.discountPrice ?? Math.round(p.price - (p.price * (p.discountPercent || 0) / 100));
    return { final, original: p.price };
  }
  return { final: p.price, original: null };
}

// (useImageReachable-proben borttagen — korten använder nu next/image med
//  onError-fallback, vilket tar bort den dubbla bild-laddningen per kort.)

/**
 * Tile-bild för main-kategori. Visar bilden om den går att hämta, annars
 * faller tillbaka till stort centerat namn på neutral bakgrund (samma
 * design som UniformCard:s text-only-platta).
 */
function MainCatImage({ url, name }: { url: string | null | undefined; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [url]);
  return (
    <>
      {url && !failed && (
        <Image
          src={url}
          alt={name}
          fill
          sizes="(max-width: 640px) 50vw, 220px"
          className="object-cover"
          onError={() => setFailed(true)}
        />
      )}
      {(!url || failed) && (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <span className="text-2xl md:text-3xl font-black text-center" style={{ color: "var(--text-primary)" }}>{name}</span>
        </div>
      )}
    </>
  );
}

/**
 * FullProductCard — produktrad för 1-per-rad-mode.
 *
 * Layout:
 *  • Namn (display italic)
 *  • Pris STORT direkt under namnet — premium-känsla. Originalpris (om rabatt)
 *    som litet överstruket bredvid det rabatterade priset.
 *  • Beskrivning (om hideDescription=false och description finns)
 *  • Dietary pills
 *  • Bild (om finns) till höger — square, ren utan inre padding
 *
 * Kortet är helt klickbart → öppnar ProductModal. Ingen separat
 * "Lägg i varukorg"-knapp (kvantitet/extras väljs i modalen).
 */
function FullProductCard({ product, cartQty, onClick, disabled }: { product: any; cartQty: number; onClick: () => void; disabled: boolean }) {
  const { final, original } = getDisplayPrice(product);
  // imageUrl finns OCH laddar OK. onError (404/raderad i R2) → text-only istället
  // för broken-img-ikon. Ingen separat probe-laddning längre.
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => { setImgFailed(false); }, [product.imageUrl]);
  const hasImage = Boolean(product.imageUrl) && !imgFailed;
  const showDescription = !product.hideDescription && Boolean(product.description);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.995 }}
      disabled={disabled}
      aria-disabled={disabled}
      className={`group relative w-full text-left rounded-2xl overflow-hidden transition-all ${disabled ? "opacity-50 grayscale cursor-not-allowed" : "cursor-pointer hover:shadow-[0_8px_24px_rgba(28,28,30,0.07)]"}`}
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1.5px solid rgba(28,28,30,0.08)",
        boxShadow: "0 3px 12px rgba(28,28,30,0.04)",
      }}
    >
      <div className="flex items-start gap-3 p-3 sm:p-4">
        {/* Text-block — fyller all bredd om ingen bild, annars 1fr */}
        <div className="flex-1 min-w-0">
          <h3 className="text-base sm:text-lg font-black uppercase italic leading-tight" style={{ color: "var(--text-primary)" }}>{product.name}</h3>

          {/* Pris — stort & premium, direkt under namnet */}
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span
              className="text-2xl sm:text-[1.7rem] font-black leading-none tracking-tight"
              style={{ color: original != null ? "var(--color-gold-600, #C28E2E)" : "var(--text-primary)", fontFeatureSettings: "'tnum'" }}
            >
              {final}
              <span className="text-base sm:text-lg font-bold ml-1 opacity-70">kr</span>
            </span>
            {original != null && (
              <span className="text-sm font-semibold text-zinc-400 line-through" style={{ fontFeatureSettings: "'tnum'" }}>
                {original} kr
              </span>
            )}
            {cartQty > 0 && (
              <span className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gold-500/15 text-gold-700 text-[10px] font-black uppercase tracking-wider">
                <ShoppingBag size={11} strokeWidth={2.6} />
                {cartQty} i korg
              </span>
            )}
          </div>

          {showDescription && (
            <p className="mt-2.5 text-[13px] leading-relaxed line-clamp-2" style={{ color: "var(--text-secondary)" }}>{product.description}</p>
          )}

          {(product.isVegan || product.isVegetarian || product.isGlutenFree) && (
            <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
              {product.isVegan && <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-700 uppercase tracking-wider">Vegan</span>}
              {product.isVegetarian && <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-700 uppercase tracking-wider">Veg</span>}
              {product.isGlutenFree && <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/10 text-blue-700 uppercase tracking-wider">GF</span>}
            </div>
          )}
        </div>

        {/* Bild som square — INNE i kortet med padding, INTE edge-to-edge */}
        {hasImage && (
          <div className="relative shrink-0 w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-deep)" }}>
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 96px, 112px"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              onError={() => setImgFailed(true)}
            />
          </div>
        )}
      </div>
    </motion.button>
  );
}

/**
 * SquareRailCard — kompakt kvadratiskt kort för horisontella rails
 * ("Populärt"). Hela kortet är aspect-square. Bilden fyller övre 62%,
 * text-stack med namn + pris i undre 38%. Mycket tightare än grid-kortet
 * och fungerar både med och utan bild (gold-fallback med stort namn).
 */
function SquareRailCard({ product, onClick, disabled }: { product: any; onClick: () => void; disabled: boolean }) {
  const { final, original } = getDisplayPrice(product);
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => { setImgFailed(false); }, [product.imageUrl]);
  const hasImage = Boolean(product.imageUrl) && !imgFailed;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={`group relative snap-start shrink-0 rounded-2xl overflow-hidden text-left flex flex-col ${disabled ? "opacity-50 grayscale cursor-not-allowed" : "active:scale-[0.97] cursor-pointer"}`}
      style={{
        width: "42vw",
        maxWidth: "170px",
        minWidth: "138px",
        aspectRatio: "1 / 1",
        backgroundColor: "var(--bg-secondary)",
        boxShadow: "0 2px 10px rgba(28,28,30,0.06), 0 1px 2px rgba(28,28,30,0.03)",
      }}
    >
      {/* Övre 62% — bild (overlay) eller gold-fallback */}
      <div
        className="relative w-full flex-shrink-0"
        style={{
          height: "62%",
          backgroundImage:
            "radial-gradient(circle at 22% 28%, rgba(200,154,60,0.26) 0%, transparent 50%), radial-gradient(circle at 78% 76%, rgba(200,154,60,0.18) 0%, transparent 50%), linear-gradient(135deg, rgba(200,154,60,0.22) 0%, rgba(200,154,60,0.10) 100%)",
        }}
      >
        {hasImage && (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="170px"
            className="object-cover"
            onError={() => setImgFailed(true)}
          />
        )}
        {!hasImage && (
          <div className="absolute inset-0 flex items-center justify-center px-2 text-center">
            <span
              className="font-black leading-tight line-clamp-2 break-words"
              style={{
                color: "#8a6418",
                fontSize:
                  (product.name || "").length > 14 ? "12px"
                    : (product.name || "").length > 10 ? "14px"
                      : (product.name || "").length > 7 ? "16px"
                        : "19px",
                letterSpacing: "-0.3px",
                lineHeight: 1.05,
              }}
              lang="sv"
            >
              {product.name}
            </span>
          </div>
        )}
        {/* Flytande "+"-bubbla i nedre högra hörnet på bilden, krymper
            mot textraden så den syns över skarven utan att täcka pris. */}
        <span
          className="absolute right-1.5 -bottom-3 w-7 h-7 rounded-full grid place-items-center font-black text-[14px] leading-none"
          style={{
            backgroundColor: "var(--accent, #c89a3c)",
            color: "#1c1c1e",
            border: "2.5px solid var(--bg-secondary)",
            boxShadow: "0 2px 6px rgba(200,154,60,0.35)",
          }}
        >+</span>
      </div>

      {/* Undre 38% — namn (1 rad) + pris */}
      <div className="flex-1 flex flex-col justify-between px-2.5 pt-2.5 pb-2 min-h-0">
        <h3
          className="m-0 font-black leading-tight line-clamp-1 overflow-hidden"
          style={{
            fontSize: "12.5px",
            letterSpacing: "-0.3px",
            color: "var(--text-primary)",
          }}
        >
          {product.name}
        </h3>
        <div className="flex items-baseline gap-1.5">
          {original != null && original !== final && (
            <span
              className="text-[9px] font-bold line-through"
              style={{ color: "var(--text-tertiary, #9a9a9a)" }}
            >
              {original}
            </span>
          )}
          <span style={{
            fontSize: "13px",
            fontWeight: 900,
            color: "var(--text-primary)",
            letterSpacing: "-0.2px",
          }}>
            {final}
            <small style={{
              fontSize: "9px",
              fontWeight: 700,
              color: "var(--text-tertiary, #9a9a9a)",
              marginLeft: 1,
            }}>KR</small>
          </span>
        </div>
      </div>
    </button>
  );
}

/**
 * UniformCard — den nya menyns produktkort (uniform6-design).
 * Samma höjd för alla, bild eller text-only-platta upptill, namn + kort
 * beskrivning + pris under. Flytande "+"-knapp som overlay på bilden, och en
 * "🔥 Populär"-flagga i högra hörnet om kortet också finns i Mest Populära.
 */
function UniformCard({ product, isPopular, onClick, disabled }: { product: any; isPopular?: boolean; onClick: () => void; disabled: boolean }) {
  const { final, original } = getDisplayPrice(product);
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => { setImgFailed(false); }, [product.imageUrl]);
  const hasImage = Boolean(product.imageUrl) && !imgFailed;
  const totalH = 270;
  const imgH = 160;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={`group relative rounded-2xl overflow-hidden text-left flex flex-col transition-transform ${disabled ? "opacity-50 grayscale cursor-not-allowed" : "active:scale-[0.98] cursor-pointer"}`}
      style={{ height: `${totalH}px`, backgroundColor: "var(--bg-secondary)", boxShadow: "0 2px 8px rgba(28,28,30,0.04), 0 1px 2px rgba(28,28,30,0.03)" }}
    >
      {/* Bild (overlay) eller text-only platta */}
      <div
        className="relative flex-shrink-0"
        style={{
          height: `${imgH}px`,
          backgroundImage:
            "radial-gradient(circle at 22% 28%, rgba(200,154,60,0.22) 0%, transparent 40%), radial-gradient(circle at 78% 76%, rgba(200,154,60,0.16) 0%, transparent 42%), linear-gradient(135deg, rgba(200,154,60,0.20) 0%, rgba(200,154,60,0.10) 100%)",
        }}
      >
        {hasImage && (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, 220px"
            className="object-cover"
            onError={() => setImgFailed(true)}
          />
        )}
        {!hasImage && (
          <div className="absolute inset-0 flex items-center justify-center px-2 pt-3 pb-5 text-center">
            <span
              className="font-black leading-tight overflow-hidden line-clamp-2 max-w-full break-words hyphens-auto"
              style={{
                color: "#8a6418",
                // Aggressiv skalning så även Margherita (10) får plats utan att
                // klippas i 190px-kort. Wrap (break-words) är säkerhetsnät för
                // ovanliga ord-längder.
                fontSize:
                  (product.name || "").length > 15
                    ? "13px"
                    : (product.name || "").length > 12
                      ? "15px"
                      : (product.name || "").length > 8
                        ? "17px"
                        : (product.name || "").length > 6
                          ? "20px"
                          : "23px",
                letterSpacing: "-0.4px",
                lineHeight: 1.1,
              }}
              lang="sv"
            >
              {product.name}
            </span>
          </div>
        )}
        {isPopular && (
          <span
            className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest backdrop-blur-md"
            style={{ backgroundColor: "rgba(255,255,255,0.92)", color: "#8a6418" }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C12 2 8 6 8 10C8 11.5 8.5 12.5 9 13C8 12 7 11 6 11C5 11 4 12 4 14C4 18 7.5 22 12 22C16.5 22 20 18.5 20 14C20 9 16 7 16 4C16 3 15 2 14 2C13 2 12.5 3 12 4C11.5 3 12 2 12 2Z"/></svg>
            Populär
          </span>
        )}
        {/* Flytande add-knapp */}
        <span
          className="absolute right-2.5 -bottom-4 w-9 h-9 rounded-full grid place-items-center font-black text-[18px] leading-none"
          style={{ backgroundColor: "var(--accent, #c89a3c)", color: "#1c1c1e", border: "3px solid var(--bg-secondary)", boxShadow: "0 3px 10px rgba(200,154,60,0.35)" }}
        >
          +
        </span>
      </div>

      {/* Text-stack */}
      <div className="flex-1 flex flex-col gap-1 px-3.5 pt-[22px] pb-3.5 min-h-0">
        <h3
          className="m-0 font-black leading-tight overflow-hidden"
          style={{ fontSize: "17px", letterSpacing: "-0.5px", color: "var(--text-primary)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}
        >
          {product.name}
        </h3>
        {product.description && (
          <p
            className="m-0 leading-snug overflow-hidden"
            style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 600, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}
          >
            {product.description}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            {original != null && original !== final && (
              <span className="text-xs font-bold line-through" style={{ color: "var(--text-tertiary, #9a9a9a)" }}>
                {original}
              </span>
            )}
            <span style={{ fontSize: "16px", fontWeight: 900, color: "var(--text-primary)", letterSpacing: "-0.2px" }}>
              {final}
              <small style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-tertiary, #9a9a9a)", marginLeft: 2 }}>KR</small>
            </span>
          </div>
          <div className="flex gap-1">
            {product.isVegan && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#22c55e" }} />}
            {product.isVegetarian && !product.isVegan && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#f59e0b" }} />}
            {product.isGlutenFree && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#38bdf8" }} />}
          </div>
        </div>
      </div>
    </button>
  );
}

/**
 * CompactProductCard — för 2-grid-vyn (drycker, sidor, chili cheese etc).
 * Square-bild ovan, namn + pris + plus-knapp under. Ingen beskrivning visas.
 */
function CompactProductCard({ product, cartQty, onClick, disabled }: { product: any; cartQty: number; onClick: () => void; disabled: boolean }) {
  const { final, original } = getDisplayPrice(product);
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => { setImgFailed(false); }, [product.imageUrl]);
  const hasImage = Boolean(product.imageUrl) && !imgFailed;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      disabled={disabled}
      aria-disabled={disabled}
      className={`group w-full text-left rounded-2xl overflow-hidden transition-all flex flex-col ${disabled ? "opacity-50 grayscale cursor-not-allowed" : "cursor-pointer"}`}
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1.5px solid rgba(28,28,30,0.08)",
        boxShadow: "0 4px 14px rgba(28,28,30,0.04)",
      }}
    >
      {hasImage ? (
        <div className="relative w-full aspect-square overflow-hidden" style={{ backgroundColor: "var(--bg-deep)" }}>
          <Image src={product.imageUrl} alt={product.name} fill sizes="(max-width: 640px) 50vw, 220px" className="object-cover transition-transform duration-500 group-hover:scale-105" onError={() => setImgFailed(true)} />
        </div>
      ) : (
        <div className="w-full aspect-square flex items-center justify-center" style={{ backgroundColor: "var(--bg-deep)" }}>
          <ShoppingBag size={28} className="text-zinc-300" />
        </div>
      )}
      <div className="p-2.5 flex flex-col gap-1">
        <h4 className="text-sm font-bold leading-tight line-clamp-2 min-h-[2.4em]" style={{ color: "var(--text-primary)" }}>{product.name}</h4>
        <div className="flex items-center justify-between mt-1">
          <div className="flex flex-col">
            {original != null && (
              <span className="text-[10px] font-medium text-zinc-400 line-through leading-none">{original} kr</span>
            )}
            <span className={`text-sm font-black leading-tight ${original != null ? "text-gold-600" : ""}`} style={original == null ? { color: "var(--text-primary)" } : undefined}>{final} kr</span>
          </div>
          <div className="w-9 h-9 rounded-full bg-gold-500 flex items-center justify-center shadow-md shadow-gold-500/25 group-hover:bg-gold-400 transition-colors relative">
            <Plus size={18} className="text-zinc-950" strokeWidth={2.8} />
            {cartQty > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-zinc-950 text-gold-400 text-[10px] font-black flex items-center justify-center border-2 border-white">
                {cartQty}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
}

const MenuContent = ({ restaurantSlug, restaurantId, isStandalone = false, initialData = null }: MenuContentProps) => {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<any[]>(initialData?.categories ?? []);
  const [mainCategories, setMainCategories] = useState<any[]>(initialData?.mainCategories ?? []);
  const [selectedMainCategoryId, setSelectedMainCategoryId] = useState<string | null>(null);
  const [deals, setDeals] = useState<PublicDeal[]>(initialData?.deals ?? []);
  const [restaurant, setRestaurant] = useState<any>(initialData?.restaurant ?? null);
  // SSR seeded the menu → start without the blocking spinner / client fetch.
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(initialData?.categories?.[0]?.id ?? null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  const [address, setAddress] = useState("");
  const [orderType, setOrderType] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<any>(null);
  // Zone check state
  const [zoneAvailable, setZoneAvailable] = useState<boolean | null>(null); // null = not checked yet
  const [checkingZone, setCheckingZone] = useState(false);

  const router = useRouter();

  const items = useCartStore((state) => state.items);
  const updateDeliveryOverride = useCartStore((state) => state.updateDeliveryOverride);
  const subtotal = useCartStore((state) => state.getTotal());
  const productIds = items.flatMap((item) => Array.from({ length: item.quantity }, () => item.productId));
  // Favoriter — synkat med övriga vyer via localStorage-store
  const { isFavorite, toggle: toggleFavorite } = useFavorites();
  const bogoChoice = useCartStore((state) => state.bogoChoice);
  const setBogoChoice = useCartStore((state) => state.setBogoChoice);

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
        const result = restaurantData?.isOpen ? false : null;
        setZoneAvailable(result);
        return result;
      }

      const allRestaurants: any[] = (res.data.cities || []).flatMap((c: any) => c.restaurants || []);
      const thisRest = allRestaurants.find((r: any) => r.id === restaurantData.id);

      if (!thisRest) {
        // Not in results — either closed (filtered out by validate-location) or outside zone
        if (!restaurantData?.isOpen) {
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
  }, [updateDeliveryOverride]);

  const ssrSeededRef = useRef(!!initialData);
  const fetchData = useCallback(async () => {
    // First mount with SSR-seeded data: the menu is already rendered from the
    // server, so skip the redundant client refetch and only run the client-only
    // zone check. Later calls (socket "menu:changed") refetch normally.
    if (ssrSeededRef.current) {
      ssrSeededRef.current = false;
      if (initialData?.restaurant) {
        try { await checkZone(initialData.restaurant); } catch {}
      }
      return;
    }
    try {
      setLoading(true);
      setError(null);

      const params: any = {};
      if (restaurantId) params.restaurantId = restaurantId;
      if (restaurantSlug) params.slug = restaurantSlug;
      const menuParams = { ...params, v: "20260428" };

      const [menuRes, restaurantRes, dealsRes] = await Promise.all([
        axios.get(`${API_URL}/api/menu/categories`, { params: menuParams }),
        restaurantSlug ? axios.get(`${API_URL}/api/restaurants/${restaurantSlug}`) : Promise.resolve({ data: null }),
        axios.get(`${API_URL}/api/deals`, { params: restaurantId ? { restaurantId } : restaurantSlug ? { slug: restaurantSlug } : {} }),
      ]);

      // Endpoint returnerar nu { mainCategories, categories }. Gammalt format
      // (platt array) stöds som fallback.
      const menuData = menuRes.data;
      const nextCategories = Array.isArray(menuData) ? menuData : (menuData?.categories || []);
      const nextMainCategories = Array.isArray(menuData) ? [] : (menuData?.mainCategories || []);
      setCategories(nextCategories);
      setMainCategories(nextMainCategories);
      setDeals(dealsRes.data);
      if (restaurantRes.data) {
        setRestaurant(restaurantRes.data);
        // Run zone check after setting restaurant
        await checkZone(restaurantRes.data);
      } else {
        const settingsRes = await axios.get(`${API_URL}/api/settings`);
        setRestaurant({
          name: "FoodGo Lund",
          isOpen: settingsRes.data.isOpen ?? true,
          deliveryFee: settingsRes.data.deliveryFee ?? 0,
          minOrderAmount: settingsRes.data.minOrderAmount ?? 150,
          etaMinutes: settingsRes.data.estimatedDeliveryTime ?? 35,
        });
      }

      if (nextCategories.length > 0) setActiveCategory(nextCategories[0].id);
    } catch (err) {
      console.error("Error fetching menu data:", err);
      setError(t("menu.loadError"));
    } finally {
      setLoading(false);
    }
  }, [restaurantId, restaurantSlug, checkZone, initialData]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("platform_address");
      if (stored) setAddress(stored);
      const storedType = localStorage.getItem("platform_order_type");
      if (storedType === "PICKUP" || storedType === "DELIVERY") setOrderType(storedType as "DELIVERY" | "PICKUP");
    }

    fetchData();

    const socket: Socket = io(SOCKET_URL, {
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
      try { window.dispatchEvent(new CustomEvent("matgo:menu-changed", { detail: evt })); } catch {}
      fetchData();
    });

    return () => { socket.disconnect(); };
  }, [restaurantSlug, restaurantId, fetchData]);

  // ── Adress-grind vid restaurang-öppning ────────────────────────────────
  // Flyttad hit från handleOpenProduct: när en gäst landar på en restaurang
  // (DELIVERY utan sparad adress/koordinater) öppnas SAMMA AddressModal direkt,
  // istället för att kapa det första produktklicket. handleOpenProduct behålls
  // som skyddsnät om gästen stänger modalen. Endast på fristående restaurangsida.
  const addressPromptedRef = useRef(false);
  useEffect(() => {
    if (!isStandalone) return;
    if (addressPromptedRef.current) return;
    if (loading || !restaurant?.isOpen) return;
    if (typeof window === "undefined") return;
    const noAddr = !localStorage.getItem("platform_address");
    const noCoords = !localStorage.getItem("platform_coords");
    if (noAddr || (orderType === "DELIVERY" && noCoords)) {
      addressPromptedRef.current = true;
      setShowAddressModal(true);
    }
  }, [isStandalone, loading, restaurant, orderType]);

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

  // Skopa till vald huvudkategori. Virtuella huvudkategorier (Erbjudanden,
  // Övrigt) bär sina egna kategorier direkt — alla andra matchar på
  // mainCategoryId.
  const activeMainCategory = mainCategories.find((mc) => mc.id === selectedMainCategoryId) || null;
  const scopedCategories = !selectedMainCategoryId
    ? categories
    : activeMainCategory?.isVirtual
      ? activeMainCategory.categories
      : categories.filter((c: any) => c.mainCategoryId === selectedMainCategoryId);

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

  // Populära produkter för aktiv huvudkategori. Backend bygger ranking
  // (orderitem-count + bild-boost). Klienten visar dem i en topp-sektion
  // dubblerade — produkten visas både här OCH i sin riktiga kategori.
  const popularProductIds: string[] = activeMainCategory?.popularProductIds || [];
  const popularSet = new Set(popularProductIds);
  const allScopedProducts: any[] = filteredCategories.flatMap((c: any) => c.products);
  const popularProducts: any[] = popularProductIds
    .map((id) => allScopedProducts.find((p) => p.id === id))
    .filter(Boolean);

  const isGridMode = mainCategories.length > 0 && !selectedMainCategoryId && !searchTerm.trim();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="w-12 h-12 rounded-2xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center">
          <Loader2 className="animate-spin text-gold-500" size={24} />
        </div>
        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.4em] text-gold-500/60 animate-pulse">{t("menu.loadingMenu")}</p>
      </div>
    );
  }

  if (error || (!restaurant && !loading)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="w-20 h-20 bg-rose-500/10 rounded-[2.5rem] border border-rose-500/20 flex items-center justify-center mb-8">
          <X size={40} className="text-rose-500" />
        </div>
        <h2 className="text-2xl font-black uppercase italic tracking-tight mb-2" style={{ color: "var(--text-primary)" }}>{t("menu.errorTitle")}</h2>
        <p className="text-xs font-bold uppercase tracking-widest mb-10 max-w-sm" style={{ color: "var(--text-secondary)" }}>{error || t("menu.restaurantNotFound")}</p>
        <Link href="/" className="px-10 py-5 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all">{t("menu.goHome")}</Link>
      </div>
    );
  }

  const restaurantDisplayTitle = restaurant?.name || t("common.loading");
  const titleParts = restaurantDisplayTitle.split(" ");
  const firstWord = titleParts[0];
  const restOfTitle = titleParts.slice(1).join(" ");

  const heroImage = restaurant?.heroImageUrl || restaurant?.imageUrl;

  return (
    <div className="pb-32 md:pt-20 selection:bg-gold-500/30" style={{ backgroundColor: "var(--bg-primary)" }}>
      {/* ── Hero: kompakt 32vh på mobil, 40vh på desktop ─────────────────── */}
      <div className="relative w-full h-[32vh] sm:h-[40vh] overflow-hidden">
        {heroImage ? (
          <img src={heroImage} alt={restaurant?.name} loading="eager" decoding="async" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full" style={{ backgroundImage: "linear-gradient(135deg, var(--bg-deep), var(--bg-primary))" }} />
        )}
        {/* Subtil mörkare gradient i topp + ljus fade nederst för seamless övergång till content */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[color:var(--bg-primary)] to-transparent" />

        {/* Top-icons: Back (vänster), Favorit (höger) — share-knapp borttagen */}
        <Link
          href="/"
          aria-label={t("common.back")}
          className="absolute top-4 left-4 w-11 h-11 rounded-full backdrop-blur-xl bg-white/85 border border-white/40 flex items-center justify-center shadow-lg active:scale-95 transition-all"
        >
          <ChevronLeft size={20} className="text-zinc-900" />
        </Link>
        {restaurant?.id && (
          <button
            type="button"
            aria-label="Spara favorit"
            aria-pressed={isFavorite(restaurant.id)}
            onClick={() => toggleFavorite(restaurant.id)}
            className="absolute top-4 right-4 w-11 h-11 rounded-full backdrop-blur-xl bg-white/85 border border-white/40 flex items-center justify-center shadow-lg active:scale-95 transition-all"
          >
            <Heart
              size={19}
              className={isFavorite(restaurant.id) ? "text-rose-500" : "text-zinc-700"}
              fill={isFavorite(restaurant.id) ? "currentColor" : "none"}
            />
          </button>
        )}

      </div>

      {/* ── Restaurang-info DIREKT under hero (titel, rating, knappar) ──── */}
      <div className="px-5 sm:px-6 lg:px-12 pt-4 sm:pt-6 max-w-5xl mx-auto">
        <div className="flex items-start gap-3 flex-wrap">
          <h1 className="font-black italic uppercase tracking-tight leading-[0.95] text-[2.4rem] sm:text-5xl">
            <span style={{ color: "var(--text-primary)" }}>{firstWord}</span>
            {restOfTitle && (
              <>
                {" "}
                <span className="text-gold-500">{restOfTitle}</span>
              </>
            )}
          </h1>
          {/* Open/closed status now sits next to the title instead of being
              stuck to the hero — easier to spot above the fold on mobile and
              doesn't overlap the back button on small screens. */}
          <div
            className={`mt-2 sm:mt-3 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm ${
              restaurant?.isOpen
                ? "bg-emerald-500/95 text-white"
                : "bg-rose-500/95 text-white"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full bg-white ${restaurant?.isOpen ? "animate-pulse" : ""}`} />
            <span className="text-[10px] font-black uppercase tracking-[0.15em]">
              {restaurant?.isOpen ? t("menu.statusOpen") : t("menu.statusClosed")}
            </span>
          </div>
        </div>
        {/* Inline metadata: cuisine · ★rating (votes) */}
        <div className="mt-2.5 flex items-center gap-2 text-sm">
          {restaurant?.cuisine && (
            <span className="font-bold uppercase tracking-wider text-xs" style={{ color: "var(--text-secondary)" }}>{restaurant.cuisine}</span>
          )}
          {restaurant?.cuisine && <span className="text-zinc-300">·</span>}
          <Link
            href={`/r/${restaurantSlug || restaurant.slug}/reviews`}
            className="flex items-center gap-1.5 hover:opacity-75 transition-opacity"
          >
            <Star size={14} className="text-gold-500 fill-gold-500" />
            <span className="font-bold" style={{ color: "var(--text-primary)" }}>{(restaurant?.rating || 5.0).toFixed(1)}</span>
            <span className="font-medium text-xs" style={{ color: "var(--text-secondary)", opacity: 0.6 }}>({restaurant?.ratingCount || 1})</span>
          </Link>
        </div>

        {/* Action-knappar: INFO (outline) + KONTAKTA OSS (solid gold) */}
        <div className="mt-4 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowInfoModal(true)}
            className="px-5 py-3 rounded-full flex items-center gap-2 text-xs font-black uppercase tracking-wider transition-all hover:bg-zinc-50 active:scale-95"
            style={{ backgroundColor: "var(--bg-secondary)", border: "1.5px solid var(--border-muted)", color: "var(--text-primary)" }}
          >
            <Info size={15} className="text-zinc-600" />
            {t("menu.info")}
          </button>
          {restaurant?.phone && (
            <a
              href={`tel:${String(restaurant.phone).replace(/\s+/g, "")}`}
              className="px-5 py-3 rounded-full flex items-center gap-2 text-xs font-black uppercase tracking-wider bg-gold-500 text-zinc-950 hover:bg-gold-400 transition-all shadow-md shadow-gold-500/20 active:scale-95"
            >
              <Phone size={15} />
              {t("menu.contact")}
            </a>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-5 sm:px-6 lg:px-12 pt-6 sm:pt-8 relative">

        {/* Out-of-zone banner — only shown for OPEN restaurants; closed ones are handled by the closed state */}
        <AnimatePresence>
          {zoneAvailable === false && restaurant?.isOpen && orderType === "DELIVERY" && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 p-6 rounded-[2rem] bg-rose-500/10 border border-rose-500/30 flex flex-col sm:flex-row items-start sm:items-center gap-4"
            >
              <div className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} className="text-rose-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-black uppercase tracking-widest text-rose-600 mb-1">
                  {t("menu.outOfZone.title")}
                </p>
                <p className="text-[11px] font-bold text-rose-600/70 leading-relaxed break-words">
                  {address
                    ? t("menu.outOfZone.descWithAddress", { address })
                    : t("menu.outOfZone.desc")}{" "}
                  {t("menu.outOfZone.action")}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => setShowAddressModal(true)}
                  className="px-4 py-2.5 bg-rose-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-rose-600 transition-all active:scale-95"
                >
                  {t("menu.outOfZone.newAddress")}
                </button>
                <Link
                  href="/"
                  className="px-4 py-2.5 bg-rose-500/20 border border-rose-500/30 text-rose-700 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-rose-500/30 transition-all"
                >
                  {t("common.back")}
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Infobanner — admin-konfigurerbar text per restaurang */}
        {restaurant?.announcementText ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-5 py-4"
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
            <p className="text-[12px] font-bold leading-relaxed text-amber-700 dark:text-amber-400">
              {restaurant.announcementText}
            </p>
          </motion.div>
        ) : null}

        {/* Aktuella deal-banners för den här restaurangen */}
        {(restaurantSlug || restaurant?.slug) ? (
          <div className="mb-5 -mx-4 sm:-mx-6">
            <DealBannerStrip slug={restaurantSlug || restaurant?.slug} />
          </div>
        ) : null}

        {/* Previously ordered bar (inloggade kunder) */}
        {restaurant?.id && (
          <PreviouslyOrderedBar restaurantId={restaurant.id} restaurantSlug={restaurantSlug || restaurant.slug} />
        )}

        {/* ── Stats-kort: 3 kolumner på desktop, kompakta på mobil ──
            Tidigare hade kortet `grid-cols-3` även på 320px-skärmar →
            "MINSTA ORDER" / "VÄNTETID" truncatedes till "MINSTA OR..." /
            "VÄNTETI...". Nu: värdet är största elementet och får aldrig
            wrappa, labels får wrappa till 2 rader, ikonen krymper på
            extra-små viewports och horisontell padding minskas så all
            text alltid syns. */}
        {orderType === "DELIVERY" && <div className="grid grid-cols-3 mb-6 rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid rgba(28,28,30,0.08)", boxShadow: "0 4px 16px rgba(28,28,30,0.04)" }}>
          {[
            {
              icon: Bike,
              label: t("menu.stats.fee"),
              value: (zoneAvailable === false && restaurant?.isOpen)
                ? "–"
                : (restaurant.deliveryFee === 0 ? t("menu.stats.free") : `${restaurant.deliveryFee} kr`),
            },
            {
              icon: Clock,
              label: t("menu.stats.eta"),
              value: `~${restaurant.etaMinutes} ${t("menu.stats.min")}`,
            },
            {
              icon: ShoppingBag,
              label: t("menu.stats.minOrder"),
              value: `${restaurant.minOrderAmount} kr`,
            },
          ].map((stat, i, arr) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className={`flex items-center gap-2 px-2 py-3 sm:gap-2.5 sm:px-4 sm:py-4 ${i < arr.length - 1 ? "border-r" : ""}`}
                style={{ borderColor: "rgba(28,28,30,0.06)" }}
              >
                <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-gold-500/10 flex items-center justify-center shrink-0">
                  <Icon size={14} className="sm:[&]:size-4 text-gold-500" strokeWidth={2.2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider leading-tight break-words" style={{ color: "var(--text-secondary)" }}>{stat.label}</div>
                  <div className="text-xs sm:text-sm font-black leading-tight mt-0.5 whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{stat.value}</div>
                </div>
              </div>
            );
          })}
        </div>}

        {/* ── Huvudkategori-grid: visas tills användaren väljer en kategori ── */}
        {isGridMode && (
          <div className="mb-10">
            <div className="mb-3 rounded-full flex items-center gap-3 px-5 py-3" style={{ backgroundColor: "var(--bg-secondary)", border: "1.5px solid rgba(28,28,30,0.08)" }}>
              <Search size={18} className="shrink-0" style={{ color: "var(--text-secondary)" }} />
              <input
                type="text"
                placeholder={t("menu.searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-transparent border-none text-sm font-semibold focus:ring-0 focus:outline-none placeholder:text-zinc-400"
                style={{ color: "var(--text-primary)" }}
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1">
              {mainCategories.map((mc: any) => (
                <button
                  key={mc.id}
                  type="button"
                  onClick={() => setSelectedMainCategoryId(mc.id)}
                  className="group relative aspect-square rounded-md overflow-hidden cursor-pointer transition-transform hover:scale-[1.01]"
                  style={{ backgroundColor: "var(--bg-secondary)" }}
                >
                  <MainCatImage url={mc.imageUrl} name={mc.name} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Tillbaka till huvudkategorier (visas i drilldown-läge) ── */}
        {!isGridMode && mainCategories.length > 0 && (
          <button
            type="button"
            onClick={() => { setSelectedMainCategoryId(null); setSearchTerm(""); }}
            className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest opacity-70 hover:opacity-100 transition-opacity"
            style={{ color: "var(--text-secondary)" }}
          >
            <ChevronLeft size={14} />
            Alla kategorier
          </button>
        )}

        {/* ── Sticky header: SÖK + KATEGORI-PILLS följer med när man scrollar ──
            Båda i samma wrapper så de sticky-positioneras tillsammans. Bryter
            ut ur parent-padding (-mx-5 osv) så bakgrunden täcker hela viewport-
            bredden när sticky → ingen content "syns igenom" på sidorna. */}
        {!isGridMode && <div
          className="sticky z-40 mb-8 -mx-5 sm:-mx-6 lg:-mx-12 top-0 md:top-20"
          style={{ backgroundColor: "var(--bg-primary)" }}
        >
          {/* Sök — egen horisontell padding så den inte ligger edge-to-edge */}
          <div className="px-5 sm:px-6 lg:px-12 pt-2">
            <div className="rounded-full flex items-center gap-3 px-5 py-3" style={{ backgroundColor: "var(--bg-secondary)", border: "1.5px solid rgba(28,28,30,0.08)" }}>
              <Search size={18} className="shrink-0" style={{ color: "var(--text-secondary)" }} />
              <input
                type="text"
                placeholder={t("menu.searchPlaceholder")}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-transparent border-none text-sm font-semibold focus:ring-0 focus:outline-none placeholder:text-zinc-400"
                style={{ color: "var(--text-primary)" }}
              />
            </div>
          </div>

          {/* Kategori-pills — egen horisontell scroll edge-to-edge med inner padding.
              touch-action: pan-x → tillåter swipe-att-scrolla horisontellt utan
              att kollidera med sidans vertikala scroll. */}
          {scopedCategories.length > 0 && (
            <div className="py-2.5">
              <div
                className="flex gap-2 no-scrollbar px-5 sm:px-6 lg:px-12"
                style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" as any, touchAction: "pan-x" }}
              >
              {scopedCategories.map((cat: any) => {
                const isActive = activeCategory === cat.id;
                return (
                  <motion.button
                    key={cat.id}
                    ref={(el) => {
                      if (el) pillRefs.current.set(cat.id, el);
                      else pillRefs.current.delete(cat.id);
                    }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => {
                      setActiveCategory(cat.id);
                      // Pausa intersection-observer i 700ms så manuellt klick
                      // hinner scrolla färdigt utan att observer skriver över.
                      manualScrollUntilRef.current = Date.now() + 700;
                      const element = document.getElementById(cat.id);
                      if (element) {
                        const offset = 160;
                        window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - offset, behavior: "smooth" });
                      }
                    }}
                    className={`px-4 py-2.5 rounded-full text-xs font-bold transition-all shrink-0 whitespace-nowrap ${
                      isActive
                        ? "bg-gold-500 text-zinc-950 shadow-md shadow-gold-500/25"
                        : "hover:bg-zinc-50"
                    }`}
                    style={isActive ? {} : { backgroundColor: "var(--bg-secondary)", border: "1.5px solid rgba(28,28,30,0.08)", color: "var(--text-primary)" }}
                  >
                    {cat.name}
                  </motion.button>
                );
              })}
              </div>
            </div>
          )}
        </div>}

        {/* ── REA: rabatterade produkter på horisontell 2-grid swipe ──────── */}
        {(() => {
          // Visas inte i grid-läget — rabatterade rätter exponeras där via
          // den virtuella "Erbjudanden"-tile istället.
          if (isGridMode) return null;
          const discountedProducts = filteredCategories
            .flatMap((cat: any) => cat.products)
            .filter((p: any) => p.discountActive && p.discountScope === "PRODUCT");
          if (discountedProducts.length === 0) return null;
          const disabled = !restaurant?.isOpen || zoneAvailable === false;
          const itemCount = (p: any) => items.filter((i) => i.productId === p.id).reduce((s, i) => s + i.quantity, 0);
          return (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <Tag size={16} className="text-gold-500" strokeWidth={2.5} />
                  <h3 className="text-sm font-black uppercase tracking-widest" style={{ color: "var(--text-primary)" }}>{t("menu.recommended")}</h3>
                </div>
                <div className="h-px bg-zinc-200 flex-1" />
              </div>
              <div
                className="flex gap-3 overflow-x-auto no-scrollbar -mx-5 sm:-mx-6 lg:-mx-12 px-5 sm:px-6 lg:px-12 pb-2 snap-x snap-mandatory scroll-pl-5 sm:scroll-pl-6 lg:scroll-pl-12"
                style={{ WebkitOverflowScrolling: "touch" as any }}
              >
                {discountedProducts.map((p: any) => {
                  const cartQty = itemCount(p);
                  const finalPrice = p.discountPrice ?? Math.round(p.price - (p.price * (p.discountPercent || 0) / 100));
                  return (
                    <motion.button
                      key={p.id}
                      type="button"
                      onClick={() => handleOpenProduct(p)}
                      whileTap={disabled ? undefined : { scale: 0.97 }}
                      disabled={disabled}
                      aria-disabled={disabled}
                      className={`shrink-0 snap-start text-left rounded-2xl overflow-hidden transition-all flex flex-col ${disabled ? "opacity-50 grayscale cursor-not-allowed" : "cursor-pointer"}`}
                      style={{ width: "calc((100% - 12px) / 2)", maxWidth: 200, backgroundColor: "var(--bg-secondary)", border: "1.5px solid rgba(28,28,30,0.08)", boxShadow: "0 4px 12px rgba(28,28,30,0.04)" }}
                    >
                      <div className="relative w-full aspect-square overflow-hidden" style={{ backgroundColor: "var(--bg-deep)" }}>
                        {p.imageUrl && <img src={p.imageUrl} alt={p.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />}
                        {/* Discount badge — uses the actual discountPercent if
                            present (e.g. "-30%"), falls back to a subtle gold
                            tag if only discountPrice is set. The old "REA" word
                            was redundant and shouty. */}
                        {((p.discountPercent && p.discountPercent > 0) || p.discountPrice != null) && (
                          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-gold-500 text-zinc-950 text-[9px] font-black uppercase tracking-wider shadow">
                            {p.discountPercent && p.discountPercent > 0
                              ? `-${p.discountPercent}%`
                              : p.discountLabel || ""}
                          </div>
                        )}
                      </div>
                      <div className="p-3 flex flex-col gap-1.5">
                        <h4 className="text-sm font-bold leading-tight line-clamp-1" style={{ color: "var(--text-primary)" }}>{p.name}</h4>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[11px] font-medium text-zinc-400 line-through">{p.price} kr</span>
                          <span className="text-sm font-black text-gold-600">{finalPrice} kr</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                            {cartQty > 0 ? `${cartQty} i varukorg` : "Lägg till"}
                          </span>
                          <div className="w-7 h-7 rounded-full bg-gold-500 flex items-center justify-center shadow-sm shadow-gold-500/25">
                            <Plus size={16} className="text-zinc-950" strokeWidth={2.5} />
                          </div>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          );
        })()}

        {/* ── Menyn: kategorier med produkter (FULL eller COMPACT per produkt) ──
            Döljs i grid-läget — kunden borrar först ner via en huvudkategori. */}
        {!isGridMode && <div className="space-y-12">
           {filteredCategories.length === 0 ? (
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 flex flex-col items-center justify-center text-center">
               <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ backgroundColor: "var(--bg-deep)" }}>
                 <ShoppingBag size={28} className="text-gold-500/60" />
               </div>
               <h3 className="text-lg font-black uppercase tracking-tight mb-2" style={{ color: "var(--text-primary)" }}>{t("menu.noMenuTitle")}</h3>
               <p className="text-zinc-500 font-medium text-sm max-w-sm">
                 {t("menu.noMenuDesc")}
               </p>
             </motion.div>
           ) : (
             <>
               {/* POPULÄRT — horisontell scroll-rail med slumpade rätter från
                   huvudkategorin (bild-rätter får högre vikt). Produkten dubbleras
                   nedan i sin riktiga kategori-sektion med en "Populär"-flagga. */}
               {popularProducts.length > 0 && !searchTerm.trim() && (
                 <section className="mb-2 -mx-5 sm:-mx-6 lg:-mx-12">
                   <div className="flex items-center gap-2.5 mb-3 px-5 sm:px-6 lg:px-12">
                     <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--accent, #c89a3c)" }}>
                       <path d="M12 2C12 2 8 6 8 10C8 11.5 8.5 12.5 9 13C8 12 7 11 6 11C5 11 4 12 4 14C4 18 7.5 22 12 22C16.5 22 20 18.5 20 14C20 9 16 7 16 4C16 3 15 2 14 2C13 2 12.5 3 12 4C11.5 3 12 2 12 2Z"/>
                     </svg>
                     <h2 className="font-black leading-none m-0" style={{ fontSize: "26px", letterSpacing: "-0.7px", color: "var(--text-primary)" }}>
                       Populärt
                     </h2>
                     <span className="ml-auto text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
                       {popularProducts.length} val
                     </span>
                   </div>
                   {/* gap-2 = tight spacing mellan kvadratiska kort.
                       scroll-pl-* gör att `snap-start` respekterar left-padding
                       så första kortet inte snäpper flush mot viewport-kanten. */}
                   <div
                     className="flex gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-2 px-5 sm:px-6 lg:px-12 scroll-pl-5 sm:scroll-pl-6 lg:scroll-pl-12"
                     style={{ WebkitOverflowScrolling: "touch" as any, touchAction: "pan-x" }}
                   >
                     {popularProducts.map((p) => (
                       <SquareRailCard
                         key={`pop-${p.id}`}
                         product={p}
                         onClick={() => handleOpenProduct(p)}
                         disabled={!restaurant?.isOpen || zoneAvailable === false}
                       />
                     ))}
                   </div>
                 </section>
               )}

               {filteredCategories.map((cat: any) => (
                 <section key={cat.id} id={cat.id}>
                   <div className="flex items-center gap-3 pt-5 pb-4 px-1">
                     <h2 className="font-black leading-none m-0" style={{ fontSize: "26px", letterSpacing: "-0.7px", color: "var(--text-primary)" }}>
                       {cat.name}
                     </h2>
                     <span className="ml-auto text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
                       {cat.products.length} {cat.products.length === 1 ? "rätt" : "rätter"}
                     </span>
                   </div>
                   <div className="grid grid-cols-2 gap-3">
                     {cat.products.map((p: any) => (
                       <UniformCard
                         key={p.id}
                         product={p}
                         isPopular={popularSet.has(p.id)}
                         onClick={() => handleOpenProduct(p)}
                         disabled={!restaurant?.isOpen || zoneAvailable === false}
                       />
                     ))}
                   </div>
                 </section>
               ))}
             </>
           )}
        </div>}
      </div>

      {/* Overlays / Modals */}
      <AnimatePresence>
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
      </AnimatePresence>

      <AnimatePresence>
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
      </AnimatePresence>

      <AnimatePresence>
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
      </AnimatePresence>

       <AnimatePresence>
        {showInfoModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/40 backdrop-blur-md p-4 sm:p-6" onClick={() => setShowInfoModal(false)}>
            <motion.div
              initial={{ scale: 0.96, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 12 }}
              className="w-full max-w-md rounded-3xl relative shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
              onClick={e => e.stopPropagation()}
              style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
            >
              {/* Header — restaurant name + close. The full info modal got a
                  cleaner header so the rest of the body can breathe. */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b" style={{ borderColor: "var(--border-muted)" }}>
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-500 mb-1">{t("menu.info.title")}</div>
                  <h2 className="text-lg sm:text-xl font-black uppercase italic tracking-tight truncate" style={{ color: "var(--text-primary)" }}>
                    {restaurant?.name}
                  </h2>
                </div>
                <button
                  onClick={() => setShowInfoModal(false)}
                  className="shrink-0 ml-3 w-9 h-9 rounded-full flex items-center justify-center hover:bg-zinc-100/50 transition-colors"
                  aria-label={t("common.close")}
                >
                  <X size={18} className="text-zinc-500" />
                </button>
              </div>

              <div className="overflow-y-auto px-6 py-5 space-y-5">
                {restaurant?.description && (
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-400 mb-1.5">{t("product.description")}</div>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{restaurant.description}</p>
                  </div>
                )}

                {restaurant?.address && (
                  <div className="flex items-start gap-3">
                    <MapPin className="text-gold-500 mt-0.5" size={16} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-400 mb-1">{t("menu.info.findHere")}</div>
                      {/* Tappable address — opens Google Maps from any device.
                          Falls back gracefully if no zip/city. */}
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([restaurant.address, restaurant.zip, restaurant.city].filter(Boolean).join(", "))}`}
                        target="_blank"
                        rel="noreferrer"
                        className="block group"
                      >
                        <div className="text-sm font-bold leading-snug group-hover:text-gold-500 transition-colors" style={{ color: "var(--text-primary)" }}>{restaurant.address}</div>
                        {(restaurant.zip || restaurant.city) && (
                          <div className="text-xs opacity-70" style={{ color: "var(--text-secondary)" }}>
                            {[restaurant.zip, restaurant.city].filter(Boolean).join(" ")}
                          </div>
                        )}
                        <span className="text-[10px] font-black uppercase tracking-widest text-gold-500 mt-1 inline-block">{t("menu.info.openMaps") || "Öppna i kartor →"}</span>
                      </a>
                    </div>
                  </div>
                )}

                {restaurant?.phone && (
                  <div className="flex items-start gap-3">
                    <Phone className="text-gold-500 mt-0.5" size={16} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-400 mb-1">{t("menu.info.callUs")}</div>
                      <a href={`tel:${String(restaurant.phone).replace(/\s+/g, "")}`} className="text-sm font-bold text-gold-500 hover:text-gold-600 transition-colors">
                        {restaurant.phone}
                      </a>
                    </div>
                  </div>
                )}

                {(restaurant as any)?.email && (
                  <div className="flex items-start gap-3">
                    <Mail className="text-gold-500 mt-0.5" size={16} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-400 mb-1">E-post</div>
                      <a href={`mailto:${(restaurant as any).email}`} className="text-sm font-bold text-gold-500 hover:text-gold-600 transition-colors break-words">
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
                    <div className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-400 mb-2">Juridisk information</div>
                    {(restaurant as any)?.legalName && (
                      <div className="text-sm font-bold mb-0.5" style={{ color: "var(--text-primary)" }}>
                        {(restaurant as any).legalName}
                      </div>
                    )}
                    {(restaurant as any)?.organizationNumber && (
                      <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        Org.nr {(restaurant as any).organizationNumber}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AddressModal
        isOpen={showAddressModal}
        onClose={() => { setShowAddressModal(false); setPendingProduct(null); }}
        onConfirm={async (newAddress, newOrderType, coords, postalCode, city) => {
          setAddress(newAddress);
          setOrderType(newOrderType);
          if (typeof window !== "undefined") {
            localStorage.setItem("platform_address", newAddress);
            localStorage.setItem("platform_order_type", newOrderType);
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
      />

      {/* DealSpotlight på restaurang-sidan borttagen — användaren ska bara
          se discountade priser direkt i menyn, inte en separat banner. */}
      <FloatingCartButton />
    </div>
  );
};

export default MenuContent;
