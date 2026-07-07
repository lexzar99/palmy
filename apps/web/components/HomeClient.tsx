"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import SmartImage from "@/components/SmartImage";
import { readHomeCache, writeHomeCache } from "@/lib/homeCache";
import axios from "axios";
import { useRouter } from "next/navigation";
import { API_URL, SOCKET_URL } from "@/lib/api";
import { io as socketIO } from "socket.io-client";
import {
  MapPin,
  Search,
  Star,
  Clock,
  Store,
  Truck,
  X,
  Sparkles,
  Info,
  Phone,
  Gift,
  ChevronRight,
  Heart,
  ChevronDown,
  Crown,
  Flame,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import AddressModal from "@/components/AddressModal";
import { type DealCardData } from "@/components/DealFlipCard";
import SponsorCard, { type SponsorData } from "@/components/SponsorCard";
import DpointsHomeCard from "@/components/DpointsHomeCard";
import type { SponsorCardData } from "@/lib/dpoints";
import WelcomeDealBanner from "@/components/WelcomeDealBanner";
import EmptyState from "@/components/EmptyState";
import { OrderTrackingCard, TrackingAdsRail, type TrackingAd } from "@/components/OrderTrackingCard";
import { resolveHomeCategoryRestaurants, type HomeCategorySection } from "@/lib/homeCategories";
import { getPlatformSessionStatus } from "@/lib/platformSessionClient";
import { formatQuickAddress, parseStoredAddress, rememberQuickAddress } from "@/lib/quickAddresses";
import { useCartStore } from "@/store/cartStore";
import { useFavorites } from "@/lib/favoritesStore";
import { addSkippedReviewOrderId, readSkippedReviewOrderIds } from "@/lib/reviewPrompt";
import { useTranslation } from "@/lib/i18n/LocaleProvider";

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  cuisine?: string;
  description?: string;
  city?: string;
  imageUrl?: string;
  heroImageUrl?: string;
  rating?: number;
  ratingCount?: number;
  deliveryFee?: number;
  minOrderAmount?: number;
  etaMinutes?: number;
  isOpen?: boolean;
  comingSoon?: boolean;
  pausedUntil?: string | null;
  openingHours?: Record<string, { closed?: boolean; shifts?: { open: string; close: string }[] }> | null;
  featuredClass?: number;
  tags?: string[];
  phone?: string;
  address?: string;
  zip?: string;
}

const DEV_TRACKING_ADS: TrackingAd[] = [
  {
    id: "dev-ad-free-drink",
    brand: "ViaEats Test",
    title: "Testannons: dryck på köpet",
    subtitle: "Syns under ordertracking och kan öppnas i fullscreen.",
  },
  {
    id: "dev-ad-dessert",
    brand: "ViaEats Test",
    title: "Testannons: dessert-deal",
    subtitle: "Används bara lokalt när backend saknar annonser.",
  },
];

// Nästa öppettid → "Öppnar 10:00" / "Öppnar imorgon 11:00" / "Öppnar tis 11:00".
const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY_SHORT = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];
function nextOpenLabel(oh: Restaurant["openingHours"]): string | null {
  if (!oh) return null;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayIdx = now.getDay();
  for (let offset = 0; offset < 7; offset++) {
    const dayIdx = (todayIdx + offset) % 7;
    const day = oh[WEEKDAY_KEYS[dayIdx]];
    if (!day || day.closed || !Array.isArray(day.shifts)) continue;
    for (const sh of day.shifts) {
      const [h, m] = (sh.open || "").split(":").map(Number);
      if (Number.isNaN(h)) continue;
      const openMin = h * 60 + (m || 0);
      if (offset === 0 && openMin <= nowMin) continue;
      if (offset === 0) return `Öppnar ${sh.open}`;
      if (offset === 1) return `Öppnar imorgon ${sh.open}`;
      return `Öppnar ${WEEKDAY_SHORT[dayIdx]} ${sh.open}`;
    }
  }
  return null;
}

interface City {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  deliveryMode: "ALL" | "ONLY_PICKUP" | "ONLY_DELIVERY";
}

// Match RN-appens cuisine-ordning (HomeScreen.tsx): Alla, Favoriter, Pizza, Sushi, Kebab, Burgare, Pasta, Asiatiskt.
// "Favoriter" är en pseudo-cuisine som filtrerar via localStorage-backad favorites-store.
// Rena textchips ("tyst & direkt") — inga emoji/bilder; visning lokaliseras
// via home.cuisine.{label}-nycklarna, label är intern identifierare.
const cuisineFilters = [
  { label: "Alla" },
  { label: "Favoriter" },
  { label: "Pizza" },
  { label: "Sushi" },
  { label: "Kebab" },
  { label: "Burgare" },
  { label: "Pasta" },
  { label: "Asiatiskt" },
];

const ORDER_TYPE_KEY = "platform_order_type";
const ACTIVE_USER_DEAL_ID_KEY = "viaeats.activeUserDealId";
const ACTIVE_USER_DEAL_SNAPSHOT_KEY = "viaeats.activeUserDealSnapshot";
const ACTIVE_ORDER_KEY = "viaeats_active_order_id";
const ACTIVE_ORDER_TOKEN_KEY = "viaeats_active_order_token";
const ACTIVE_ORDER_PHONE_KEY = "viaeats_active_order_phone";
const ACTIVE_ORDERS_KEY = "viaeats_active_orders";
const CLOSED_ORDER_SEEN_KEY = "viaeats_closed_order_seen_v1";
const CLOSED_ORDER_VISIBLE_MS = 3 * 60 * 1000;
const CLOSED_ORDER_MAX_AGE_MS = 10 * 60 * 1000;
// Levererade ordrar ligger kvar på hemskärmen en stund så recensionsprompten
// hinner ses (Swift håller terminala ordrar i 15 min). Färskhets-guarden
// hindrar gamla historik-ordrar från att dyka upp vid kall sidladdning.
const DELIVERED_ORDER_VISIBLE_MS = 15 * 60 * 1000;
const DELIVERED_MAX_AGE_MS = 3 * 60 * 60 * 1000;
const ACTIVE_TRACKING_STATUSES = new Set(["PENDING", "ACCEPTED", "PREPARING", "READY", "DELIVERING", "OUT_FOR_DELIVERY", "ON_THE_WAY"]);
const CLOSED_TRACKING_STATUSES = new Set(["CANCELLED", "REJECTED", "DELIVERY_FAILED"]);
const DELIVERED_TRACKING_STATUSES = new Set(["DELIVERED", "COMPLETED"]);
const PROMO_CARD_WIDTH = 260;
const PROMO_CARD_GAP = 12;
const PROMO_SNAP = PROMO_CARD_WIDTH + PROMO_CARD_GAP;

type PromoCardItem =
  | { id: string; kind: "sponsor"; sponsor: SponsorData }
  | { id: string; kind: "dpoints"; card: SponsorCardData }
  | { id: string; kind: "appDeal"; appDeal: HomeAppDeal }
  | { id: string; kind: "pulseChampion"; module: HomePulseModule }
  | { id: string; kind: "pulseHighlight"; module: HomePulseModule; restaurant: PulseRailRestaurant; badge: string };

type HomeAppDealMissionProgress = {
  target: number;
  count: number;
  remaining: number;
  completed: boolean;
  windowDays: number;
  rewardPoints: number;
  claimed: boolean;
};

type HomeAppDeal = {
  id: string;
  title: string;
  subtitle?: string | null;
  badge?: string | null;
  imageUrl?: string | null;
  ctaLabel?: string | null;
  ctaAction?: string | null;
  ctaTarget?: string | null;
  placement?: string;
  audience?: string;
  template?: string;
  size?: string;
  claimRequired?: boolean;
  dpointsBonus?: number | null;
  missionType?: string | null;
  missionProgress?: HomeAppDealMissionProgress | null;
  checkoutApplicable?: boolean | null;
  discountType?: string | null;
  discountPercent?: number | null;
  amountKr?: number | null;
  freeDelivery?: boolean;
  minOrderKr?: number;
  restaurant?: { id: string; name: string; slug: string; imageUrl?: string | null; cuisine?: string | null } | null;
  userDealId?: string | null;
  claimed?: boolean;
  theme?: string | null;
};

type PulseRestaurant = {
  id: string;
  name: string;
  slug: string;
  cuisine?: string | null;
  imageUrl?: string | null;
  heroImageUrl?: string | null;
  rating?: number | null;
};

type PulseRailRestaurant = PulseRestaurant & {
  avgMinutesToday?: number | null;
  deliveredToday?: number | null;
  growthPct?: number | null;
};

type PulseProduct = {
  productId: string;
  name: string;
  priceKr: number;
  imageUrl?: string | null;
  restaurant: PulseRestaurant;
};

type HomePulseModule = {
  type: string;
  id: string;
  theme?: string | null;
  title: string;
  subtitle?: string | null;
  restaurant?: PulseRestaurant | null;
  restaurants?: PulseRailRestaurant[] | null;
  products?: PulseProduct[] | null;
  items?: PulseProduct[] | null;
  product?: (PulseProduct & { costPoints?: number; restaurant: PulseRestaurant }) | null;
  balance?: number | null;
  remainingPoints?: number | null;
  endsAt?: string | null;
  progress?: { count: number; target: number; rewardPoints: number } | null;
  images?: string[] | null;
  percent?: number | null;
};

type HomePulseResponse = {
  greeting?: string | null;
  modules: HomePulseModule[];
};

function readClosedOrderSeen() {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(CLOSED_ORDER_SEEN_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed as Record<string, number> : {};
  } catch {
    return {};
  }
}

function writeClosedOrderSeen(map: Record<string, number>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CLOSED_ORDER_SEEN_KEY, JSON.stringify(map));
  } catch {
    /* noop */
  }
}

function shouldShowTrackingOrderOnHome(order: any) {
  const status = String(order?.status || "").toUpperCase();
  const paymentStatus = String(order?.paymentStatus || "").toUpperCase();
  if (status === "AWAITING_PAYMENT" || ["AWAITING_PAYMENT", "FAILED", "EXPIRED"].includes(paymentStatus)) return false;
  if (ACTIVE_TRACKING_STATUSES.has(status)) return true;
  const isDelivered = DELIVERED_TRACKING_STATUSES.has(status);
  if (!CLOSED_TRACKING_STATUSES.has(status) && !isDelivered) return false;
  const orderId = String(order?.id || "");
  if (!orderId) return false;
  const createdAt = order?.createdAt ? new Date(order.createdAt).getTime() : 0;
  if (isDelivered) {
    // Bara färska leveranser — annars skulle gammal orderhistorik dyka upp
    // som "levererad" på hemskärmen vid kall sidladdning.
    if (!createdAt || Number.isNaN(createdAt) || Date.now() - createdAt > DELIVERED_MAX_AGE_MS) return false;
  } else if (!createdAt || Number.isNaN(createdAt) || Date.now() - createdAt > CLOSED_ORDER_MAX_AGE_MS) {
    // Avbrutna/avvisade orders ska inte återuppstå vid login. Visa dem bara
    // precis efter händelsen så kunden förstår vad som hände.
    return false;
  }
  const visibleMs = isDelivered ? DELIVERED_ORDER_VISIBLE_MS : CLOSED_ORDER_VISIBLE_MS;
  const seen = readClosedOrderSeen();
  const seenAt = Number(seen[orderId] || 0);
  if (seenAt > 0) return Date.now() < seenAt + visibleMs;
  seen[orderId] = Date.now();
  writeClosedOrderSeen(seen);
  return true;
}

function shouldHydrateTrackingOrderFromHistory(order: any) {
  const status = String(order?.status || "").toUpperCase();
  if (CLOSED_TRACKING_STATUSES.has(status)) return shouldShowTrackingOrderOnHome(order);
  return shouldShowTrackingOrderOnHome(order);
}

function forgetClosedHomeOrder(orderId: string) {
  if (typeof window === "undefined" || !orderId) return;
  try {
    if (localStorage.getItem(ACTIVE_ORDER_KEY) === orderId) {
      localStorage.removeItem(ACTIVE_ORDER_KEY);
      localStorage.removeItem(ACTIVE_ORDER_TOKEN_KEY);
      localStorage.removeItem(ACTIVE_ORDER_PHONE_KEY);
    }
    const stored = JSON.parse(localStorage.getItem(ACTIVE_ORDERS_KEY) || "[]");
    const next = (Array.isArray(stored) ? stored : []).filter((order: any) => String(order?.id || "") !== orderId);
    localStorage.setItem(ACTIVE_ORDERS_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

function absoluteMediaUrl(path?: string | null) {
  if (!path) return "";
  if (path.startsWith("/")) return `${API_URL}${path}`;
  return path;
}

function pulseGradient(theme?: string | null) {
  switch (theme) {
    case "ember":
      return "linear-gradient(135deg, #F0601F 0%, #B8291A 100%)";
    case "forest":
      return "linear-gradient(135deg, #21945C 0%, #0D5C3D 100%)";
    case "midnight":
      return "linear-gradient(135deg, #292E4D 0%, #0D1024 100%)";
    case "gold":
      return "linear-gradient(135deg, #DEA128 0%, #9E660D 100%)";
    default:
      return "linear-gradient(135deg, var(--deal-blue) 0%, var(--deal-blue-deep) 100%)";
  }
}

function pulseChipColor(theme?: string | null) {
  switch (theme) {
    case "ember": return "#8C210F";
    case "forest": return "#0A4D30";
    case "midnight": return "#141633";
    case "gold": return "#784D08";
    default: return "var(--deal-blue-ink)";
  }
}

// "Utvald"-badge (Swift-paritet, se RestaurantCard.dealBadges): guld för
// toppnivån (featuredClass 1), silver för nivå 2. Krona-ikon.
function FeaturedBadge({ featuredClass }: { featuredClass?: number | null }) {
  const gold = featuredClass === 1;
  const silver = featuredClass === 2;
  if (!gold && !silver) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-md text-white"
      style={{ backgroundColor: gold ? "#B7800D" : "#868A94" }}
    >
      <Crown size={11} strokeWidth={2.6} />
      Utvald
    </span>
  );
}

function dealValueHeadline(deal: HomeAppDeal) {
  const progress = deal.missionProgress;
  if (deal.missionType && progress?.rewardPoints) return `+${progress.rewardPoints} Vpoints`;
  if (deal.freeDelivery) return "Fri leverans";
  if ((deal.discountPercent ?? 0) > 0) return `${deal.discountPercent}% rabatt`;
  if ((deal.amountKr ?? 0) > 0) return `${deal.amountKr} kr rabatt`;
  if ((deal.dpointsBonus ?? 0) > 0) return `+${deal.dpointsBonus} Vpoints`;
  return deal.badge ?? "";
}

function dealCtaTitle(deal: HomeAppDeal, isActive: boolean) {
  const progress = deal.missionProgress;
  const isMission = Boolean(deal.missionType);
  const isClaimed = Boolean(deal.userDealId);
  if (isMission) {
    if (progress?.completed) return "Klart!";
    if (isClaimed && progress) return `${progress.count} av ${progress.target}`;
    return deal.ctaLabel || "Starta uppdraget";
  }
  if (isActive) return "Vald i kassan";
  if (isClaimed) return "Hämtad";
  return deal.ctaLabel || (deal.claimRequired ? "Hämta" : "Beställ");
}

function SwiftSectionHeader({ title, subtitle }: { title: string; subtitle?: string | null }) {
  return (
    <div className="min-w-0">
      <h2 className="text-[22px] font-black leading-tight tracking-normal text-[var(--ink)]">{title}</h2>
      {!!subtitle && <p className="mt-0.5 text-[13px] font-semibold text-[var(--muted)]">{subtitle}</p>}
    </div>
  );
}

function DpointsGlyph({ size = 18 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-block shrink-0"
      style={{ width: size, height: size, borderRadius: size * 0.22, backgroundColor: "var(--orange)" }}
    >
      <span
        className="absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 rotate-45 border-white"
        style={{
          width: size * 0.42,
          height: size * 0.42,
          borderWidth: Math.max(1.5, size * 0.11),
          borderRadius: size * 0.1,
        }}
      />
    </span>
  );
}

function HomeAppDealCard({
  deal,
  activeUserDealId,
  claiming,
  fullWidth = false,
  onAction,
}: {
  deal: HomeAppDeal;
  activeUserDealId: string;
  claiming: boolean;
  fullWidth?: boolean;
  onAction: (deal: HomeAppDeal) => void;
}) {
  const isClaimed = Boolean(deal.userDealId);
  const isMission = Boolean(deal.missionType);
  const isActive = Boolean(deal.userDealId && deal.userDealId === activeUserDealId);
  const progress = deal.missionProgress;
  const fraction = progress?.target ? Math.min(1, progress.count / progress.target) : 0;

  return (
    <button
      type="button"
      onClick={() => onAction(deal)}
      disabled={claiming || (isMission && isClaimed)}
      className={`swift-deal-card ${fullWidth ? "w-full" : "w-[300px]"} shrink-0 text-left active:scale-[0.99] disabled:cursor-default`}
      style={{ background: pulseGradient(deal.theme) }}
    >
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          {!!deal.badge && (
            <span className="mb-1.5 inline-flex h-[22px] items-center rounded-full bg-white/90 px-2 text-[10px] font-black uppercase" style={{ color: pulseChipColor(deal.theme) }}>
              {deal.badge}
            </span>
          )}
          <h3 className="line-clamp-2 text-[19px] font-black leading-[1.08] tracking-normal text-white">{deal.title}</h3>
          {!!deal.subtitle && <p className="mt-1.5 line-clamp-2 text-[12px] font-semibold leading-snug text-white/85">{deal.subtitle}</p>}
        </div>
        {!!dealValueHeadline(deal) && (
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1.5 text-[13px] font-black" style={{ color: pulseChipColor(deal.theme) }}>
            {dealValueHeadline(deal)}
          </span>
        )}
      </div>

      <div className="mt-auto pt-3">
        {isMission && progress && isClaimed && (
          <div className="mb-2.5">
            <div className="h-[7px] overflow-hidden rounded-full bg-white/25">
              <div className="h-full min-w-2 rounded-full bg-white" style={{ width: `${Math.max(7, fraction * 100)}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] font-bold text-white/85">
              {progress.completed
                ? "Uppdraget klart, poängen är dina"
                : progress.windowDays > 0
                  ? `${progress.remaining} kvar inom ${progress.windowDays} dagar`
                  : `${progress.remaining} beställningar kvar`}
            </p>
          </div>
        )}
        <div className="flex items-center gap-2">
          {deal.restaurant && (
            <span className="min-w-0 flex items-center gap-1.5 text-[12px] font-bold text-white/90">
              <Store size={12} strokeWidth={2.3} />
              <span className="truncate">{deal.restaurant.name}</span>
            </span>
          )}
          <span className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3.5 text-[13px] font-black" style={{ color: pulseChipColor(deal.theme) }}>
            {claiming ? "..." : isActive ? "✓" : null}
            {dealCtaTitle(deal, isActive)}
          </span>
        </div>
      </div>
    </button>
  );
}

function ChampionPromoCard({ module, onOpen }: { module: HomePulseModule; onOpen: (slug: string) => void }) {
  const restaurant = module.restaurant;
  if (!restaurant) return null;
  const image = absoluteMediaUrl(module.images?.[0] || restaurant.heroImageUrl || restaurant.imageUrl);
  return (
    <button type="button" onClick={() => onOpen(restaurant.slug)} className="swift-promo-card group text-left">
      {image ? <SmartImage src={image} alt={restaurant.name} sizes="(max-width: 640px) 88vw, 460px" className="absolute inset-0 h-full w-full object-cover" /> : <span className="absolute inset-0" style={{ background: pulseGradient(module.theme) }} />}
      <span className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/10 to-black/75" />
      <span className="absolute inset-x-0 bottom-0 p-4">
        <span className="mb-1.5 inline-flex h-6 items-center gap-1.5 rounded-full bg-[var(--gold)] px-2.5 text-[10px] font-black uppercase text-[#784D08]">
          <Crown size={11} fill="currentColor" /> {module.title}
        </span>
        <span className="block truncate text-[24px] font-black leading-tight text-white">{restaurant.name}</span>
        <span className="mt-1 flex items-center gap-2 text-[12px] font-bold text-white/90">
          {module.subtitle}
          {restaurant.rating ? <span className="text-[var(--gold)]">★ {restaurant.rating.toFixed(1)}</span> : null}
        </span>
      </span>
    </button>
  );
}

function HighlightPromoCard({ restaurant, badge, onOpen }: { restaurant: PulseRailRestaurant; badge: string; onOpen: (slug: string) => void }) {
  const image = absoluteMediaUrl(restaurant.heroImageUrl || restaurant.imageUrl);
  return (
    <button type="button" onClick={() => onOpen(restaurant.slug)} className="swift-promo-card text-left">
      {image ? <SmartImage src={image} alt={restaurant.name} sizes="(max-width: 640px) 88vw, 460px" className="absolute inset-0 h-full w-full object-cover" /> : <span className="absolute inset-0" style={{ background: pulseGradient("sky") }} />}
      <span className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/10 to-black/70" />
      <span className="absolute inset-x-0 bottom-0 p-4">
        <span className="mb-1.5 inline-flex h-6 items-center rounded-full bg-white px-2.5 text-[10px] font-black uppercase text-[var(--ink)]">{badge}</span>
        <span className="block truncate text-[24px] font-black leading-tight text-white">{restaurant.name}</span>
        <span className="mt-1 flex items-center gap-2 text-[12px] font-bold text-white/90">
          {restaurant.cuisine || "Restaurang"}
          {restaurant.rating ? <span className="text-[var(--gold)]">★ {restaurant.rating.toFixed(1)}</span> : null}
        </span>
      </span>
    </button>
  );
}

function PulseMessageCard({ module }: { module: HomePulseModule }) {
  return (
    <div className="swift-message-card" style={{ background: pulseGradient(module.theme) }}>
      <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px] bg-white/20 text-white">
        {module.type === "WEATHER" ? <CloudRainIcon /> : <Sparkles size={20} fill="currentColor" />}
      </div>
      <div className="min-w-0">
        <h3 className="truncate text-[16px] font-black leading-tight text-white">{module.title}</h3>
        {!!module.subtitle && <p className="mt-1 line-clamp-2 text-[12px] font-bold leading-snug text-white/90">{module.subtitle}</p>}
      </div>
    </div>
  );
}

function CloudRainIcon() {
  return <span className="text-lg font-black">☔</span>;
}

function PulseProductRail({ module, onOpen }: { module: HomePulseModule; onOpen: (slug: string) => void }) {
  const products = module.type === "NEW_MENU_ITEMS" ? module.items : module.products;
  if (!products?.length) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2">
        {module.title === "Hetast just nu" && <Flame size={17} fill="var(--orange)" className="text-[var(--orange)]" />}
        <SwiftSectionHeader title={module.title} subtitle={module.subtitle || ""} />
      </div>
      <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-5 px-5">
        {products.map((product) => {
          const image = absoluteMediaUrl(product.imageUrl);
          return (
            <button key={product.productId} type="button" onClick={() => onOpen(product.restaurant.slug)} className="swift-product-card">
              <div className="relative h-[110px] w-full overflow-hidden bg-[var(--bg-deep)]">
                {image ? <SmartImage src={image} alt={product.name} sizes="168px" className="h-full w-full object-cover" /> : <div className="h-full w-full" style={{ background: pulseGradient(module.theme) }} />}
                {module.type === "NEW_MENU_ITEMS" && <span className="absolute left-2 top-2 rounded-full bg-[var(--orange)] px-2 py-1 text-[9px] font-black uppercase text-white">Nyhet</span>}
              </div>
              <div className="p-2.5 text-left">
                <p className="truncate text-[13px] font-black text-[var(--ink)]">{product.name}</p>
                <div className="mt-1 flex items-center gap-2 text-[11px] font-bold text-[var(--muted)]">
                  <span className="min-w-0 truncate">{product.restaurant.name}</span>
                  <span className="ml-auto shrink-0 text-[12px] font-black text-[var(--ink)]">{Math.round(product.priceKr)} kr</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PulseRestaurantRail({ module, onOpen }: { module: HomePulseModule; onOpen: (slug: string) => void }) {
  const restaurants = module.restaurants;
  if (!restaurants?.length) return null;
  return (
    <section className="space-y-3">
      <SwiftSectionHeader title={module.title} subtitle={module.subtitle || ""} />
      <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-5 px-5">
        {restaurants.map((restaurant) => (
          <button key={restaurant.id} type="button" onClick={() => onOpen(restaurant.slug)} className="swift-chip-card">
            <div className="h-12 w-12 overflow-hidden rounded-2xl bg-[var(--bg-deep)]">
              {restaurant.imageUrl || restaurant.heroImageUrl ? (
                <SmartImage src={absoluteMediaUrl(restaurant.imageUrl || restaurant.heroImageUrl)} alt={restaurant.name} sizes="48px" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-[13px] font-black text-[var(--ink)]">{restaurant.name}</p>
              <p className="truncate text-[11px] font-bold text-[var(--muted)]">
                {restaurant.growthPct ? `+${restaurant.growthPct}% denna vecka` : restaurant.avgMinutesToday ? `${restaurant.avgMinutesToday} min idag` : restaurant.cuisine || "Restaurang"}
              </p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function PulseModuleSection({ module, onOpenRestaurant }: { module: HomePulseModule; onOpenRestaurant: (slug: string) => void }) {
  if (["OCCASION", "WEATHER", "STREAK", "POINTS_NUDGE", "FAVORITE"].includes(module.type)) {
    return <PulseMessageCard module={module} />;
  }
  if (["HOT_PRODUCTS", "NEW_MENU_ITEMS"].includes(module.type)) {
    return <PulseProductRail module={module} onOpen={onOpenRestaurant} />;
  }
  if (["FASTEST_TODAY", "TRENDING", "NEW_RESTAURANTS"].includes(module.type)) {
    return <PulseRestaurantRail module={module} onOpen={onOpenRestaurant} />;
  }
  return null;
}

export interface HomeInitialData {
  restaurants: Restaurant[];
  cities: City[];
  deals: any[];
  sponsors: SponsorData[];
  homeCategories: HomeCategorySection[];
  appDeals?: HomeAppDeal[];
  pulse?: HomePulseResponse;
}

/**
 * HomeClient — hela hemsidans interaktiva UI (filter, adress, karuseller).
 * Servern (app/page.tsx) streamar in första datan via initialData så första
 * målningen sker utan klient-fetch-vattenfall; en tyst bakgrunds-refetch
 * hämtar färsk data direkt efter mount (samma mönster som MenuContent).
 */
export default function HomeClient({ initialData = null }: { initialData?: HomeInitialData | null }) {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const promoRailRef = useRef<HTMLDivElement | null>(null);
  const promoIndexRef = useRef(0);
  const [activePromo, setActivePromo] = useState(0);
  // Sticky-headern är nu TVÅ lager (ingen JS, ingen höjd-animation → kan aldrig
  // glitcha): en tunn sticky bar (ViaEats + leverans/hämtning) som alltid
  // sitter kvar, och adress + sök som vanligt dokumentflöde nedanför som bara
  // scrollar bort naturligt bakom den sticky baren. Ren CSS position:sticky.
  const [restaurants, setRestaurants] = useState<Restaurant[]>(initialData?.restaurants ?? []);
  const [address, setAddress] = useState("");
  const [query, setQuery] = useState("");
  const [activeCuisine, setActiveCuisine] = useState("Alla");
  const [orderType, setOrderType] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [loading, setLoading] = useState(!initialData);
  const [apiError, setApiError] = useState(false);
  
  const [cities, setCities] = useState<City[]>(initialData?.cities ?? []);
  const [deals, setDeals] = useState<any[]>(() => (initialData?.deals ?? []).filter((d: any) => d.isActive && d.showOnSite));
  const [appDeals, setAppDeals] = useState<HomeAppDeal[]>(initialData?.appDeals ?? []);
  const [pulseModules, setPulseModules] = useState<HomePulseModule[]>(initialData?.pulse?.modules ?? []);
  const [homeGreeting, setHomeGreeting] = useState<string | null>(initialData?.pulse?.greeting ?? null);
  const [personalDeals, setPersonalDeals] = useState<any[]>([]);
  const [sponsors, setSponsors] = useState<SponsorData[]>(initialData?.sponsors ?? []);
  const [homeCategorySections, setHomeCategorySections] = useState<HomeCategorySection[]>(initialData?.homeCategories ?? []);
  const [filteredByDeal, setFilteredByDeal] = useState<{ ids: string[]; title: string } | null>(null);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  // Stad-familj från kundens adress (resolvad via Google Places city-namn +
  // backend's parent-hierarki). null = ingen adress satt → visa alla. Annars
  // filtreras restauranglistan så bara restauranger i denna stad-familj syns.
  const [cityFamilyIds, setCityFamilyIds] = useState<string[] | null>(null);
  // Stad-familjens namn (lowercase) — används som fallback i kategori-/heta-
  // listan-filtret för restauranger som saknar cityId men har stad-namn.
  const [cityFamilyNames, setCityFamilyNames] = useState<string[] | null>(null);
  const [detectedCityName, setDetectedCityName] = useState<string | null>(null);
  // Sant medan stad-familjen slås upp (family-by-name in-flight). Under denna
  // lucka faller filtret tillbaka på mjuk namn-matchning istället för strikt
  // "visa inget" — annars flashade "inte tillgänglig i din stad än" för en
  // återbesökare innan uppslaget hunnit svara.
  const [cityFamilyResolving, setCityFamilyResolving] = useState(false);
  // A14 — hero override from admin CMS. null = use translations (default).
  // Återställ senast valda kategori vid mount (t.ex. när man backar in från en
  // restaurang) så man inte alltid hamnar på "Alla".
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("home_cuisine");
      if (saved) setActiveCuisine(saved);
    } catch { /* noop */ }
  }, []);
  // Favoriter (delad localStorage-backad store — paritet med RN)
  const { favorites, toggle: toggleFavorite } = useFavorites();

  // Zone filtering – IDs of restaurants that can deliver to the user's saved coords
  const [zoneRestaurantIds, setZoneRestaurantIds] = useState<string[] | null>(null);
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [hasDeliveryCoords, setHasDeliveryCoords] = useState(false);
  // Zone-specific delivery info per restaurant (fee öre, minOrder öre, etaMinutes, zoneName)
  const [zoneDeliveryInfo, setZoneDeliveryInfo] = useState<Record<string, {
    deliveryFee: number; minOrder: number; etaMinutes?: number | null; zoneName?: string;
  }>>({});
  const deliveryOverrides = useCartStore((s) => s.deliveryOverrides);
  const setDeliveryOverrides = useCartStore((s) => s.setDeliveryOverrides);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [dpointsCard, setDpointsCard] = useState<SponsorCardData | null>(null);
  const [dpointsBalance, setDpointsBalance] = useState<number | null>(null);
  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  const [trackingAds, setTrackingAds] = useState<TrackingAd[]>([]);
  const [courierPositions, setCourierPositions] = useState<Record<string, { lat: number; lng: number }>>({});
  const [activeUserDealId, setActiveUserDealId] = useState("");
  const [claimingDealId, setClaimingDealId] = useState<string | null>(null);
  // Recensionsprompt efter levererad order — skippade order-id delas med
  // ordersidan och Swift-appen via viaeats.skippedReviewOrderIds.
  const [skippedReviewIds, setSkippedReviewIds] = useState<string[]>([]);
  useEffect(() => {
    setSkippedReviewIds(readSkippedReviewOrderIds());
  }, []);

  useEffect(() => {
    try {
      setActiveUserDealId(localStorage.getItem(ACTIVE_USER_DEAL_ID_KEY) || "");
    } catch { /* noop */ }
  }, []);
  useEffect(() => {
    axios.get("/api/platform/dpoints/me")
      .then((res) => setDpointsBalance(res.data?.enabled ? Number(res.data.balance ?? 0) : null))
      .catch(() => setDpointsBalance(null));
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    Promise.all([
      axios.get(`/api/platform/deals/app`, { params: { placement: "HOME_TOP", limit: 8, loggedIn: "1", _t: Date.now() } }).catch(() => ({ data: { deals: appDeals } })),
      axios.get(`/api/platform/home/pulse`, { params: { _t: Date.now() } }).catch(() => ({ data: { greeting: homeGreeting, modules: pulseModules } })),
    ]).then(([dealsRes, pulseRes]) => {
      if (Array.isArray(dealsRes.data?.deals)) setAppDeals(dealsRes.data.deals);
      if (Array.isArray(pulseRes.data?.modules)) {
        setPulseModules(pulseRes.data.modules);
        setHomeGreeting(pulseRes.data.greeting ?? null);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  useEffect(() => {
    const fallbackAds = process.env.NODE_ENV !== "production" ? DEV_TRACKING_ADS : [];
    axios.get("/api/platform/ads")
      .then((res) => {
        const rows = Array.isArray(res.data) ? res.data : [];
        setTrackingAds(rows.length ? rows : fallbackAds);
      })
      .catch(() => setTrackingAds(fallbackAds));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchOrderDetail = async (order: any) => {
      const id = order?.id;
      if (!id) return null;
      const qs = new URLSearchParams();
      const phone = order.customerPhone || order.phone || order.__trackingPhone || localStorage.getItem(ACTIVE_ORDER_PHONE_KEY);
      const token = order.__trackingToken || order.token || order.accessToken || localStorage.getItem(ACTIVE_ORDER_TOKEN_KEY);
      if (token) qs.set("token", token);
      if (phone) qs.set("phone", phone);
      const url = qs.toString()
        ? `${API_URL}/api/orders/${id}?${qs.toString()}`
        : `${API_URL}/api/orders/${id}`;
      return axios.get(url).then((res) => ({
        ...res.data,
        __trackingPhone: phone || null,
        __trackingToken: token || null,
      })).catch(() => order);
    };

    const loadActiveOrders = async () => {
      try {
        const rowsById = new Map<string, any>();
        const storedId = localStorage.getItem(ACTIVE_ORDER_KEY);
        if (storedId) rowsById.set(storedId, { id: storedId, customerPhone: localStorage.getItem(ACTIVE_ORDER_PHONE_KEY) });
        try {
          const storedOrders = JSON.parse(localStorage.getItem(ACTIVE_ORDERS_KEY) || "[]");
          (Array.isArray(storedOrders) ? storedOrders : []).forEach((order: any) => {
            if (order?.id) rowsById.set(String(order.id), {
              id: String(order.id),
              customerPhone: order.phone || order.customerPhone || null,
              __trackingPhone: order.phone || order.customerPhone || null,
              __trackingToken: order.token || order.accessToken || null,
            });
          });
        } catch { /* noop */ }
        if (process.env.NODE_ENV !== "production") {
          try {
            const testOrdersRaw = new URLSearchParams(window.location.search).get("testOrders");
            const testOrders = testOrdersRaw ? JSON.parse(testOrdersRaw) : [];
            const normalizedTestOrders = (Array.isArray(testOrders) ? testOrders : [])
              .filter((order: any) => order?.id)
              .map((order: any) => ({
                id: String(order.id),
                phone: order.phone || order.customerPhone || null,
                token: order.token || order.accessToken || null,
              }));
            if (normalizedTestOrders.length > 0) {
              rowsById.clear();
              localStorage.setItem(ACTIVE_ORDERS_KEY, JSON.stringify(normalizedTestOrders.slice(0, 3)));
            }
            normalizedTestOrders.forEach((order: any) => {
              if (order?.id) rowsById.set(String(order.id), {
                id: String(order.id),
                customerPhone: order.phone || null,
                __trackingPhone: order.phone || null,
                __trackingToken: order.token || null,
              });
            });
          } catch { /* noop */ }
        }

        if (isLoggedIn) {
          const history = await axios.get("/api/platform/profile/orders").catch(() => ({ data: [] }));
          (Array.isArray(history.data) ? history.data : []).forEach((order: any) => {
            if (order?.id && shouldHydrateTrackingOrderFromHistory(order)) rowsById.set(String(order.id), order);
          });
        }

        const details = await Promise.all(Array.from(rowsById.values()).slice(0, 3).map(fetchOrderDetail));
        const next = details
          .filter(Boolean)
          .filter((order) => {
            const status = String(order.status || "").toUpperCase();
            const paymentStatus = String(order.paymentStatus || "").toUpperCase();
            const shouldShow = shouldShowTrackingOrderOnHome(order);
            if (!shouldShow && (CLOSED_TRACKING_STATUSES.has(status) || DELIVERED_TRACKING_STATUSES.has(status))) forgetClosedHomeOrder(String(order.id || ""));
            return shouldShow;
          })
          .slice(0, 3);
        if (!cancelled) setActiveOrders(next);
      } catch {
        if (!cancelled) setActiveOrders([]);
      }
    };

    void loadActiveOrders();
    const timer = window.setInterval(loadActiveOrders, 15000);
    const onStorage = (event: StorageEvent) => {
      if (!event.key || [ACTIVE_ORDER_KEY, ACTIVE_ORDER_PHONE_KEY, ACTIVE_ORDER_TOKEN_KEY, ACTIVE_ORDERS_KEY].includes(event.key)) void loadActiveOrders();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, [isLoggedIn]);

  useEffect(() => {
    const trackable = activeOrders.filter((order) => {
      const type = String(order.orderType || order.type || "").toUpperCase();
      return type !== "PICKUP" && !order.selfDelivery;
    });
    if (trackable.length === 0) return;
    const socket = socketIO(SOCKET_URL, { path: "/socket.io", transports: ["websocket", "polling"] });
    socket.on("connect", () => trackable.forEach((order) => socket.emit("join:order", order.id)));
    socket.on("courier:location", (payload: any) => {
      if (!payload?.orderId || typeof payload.lat !== "number" || typeof payload.lng !== "number") return;
      setCourierPositions((current) => ({ ...current, [String(payload.orderId)]: { lat: payload.lat, lng: payload.lng } }));
    });
    socket.on("order:status", (payload: any) => {
      if (!payload?.orderId || !payload.status) return;
      setActiveOrders((orders) => orders
        .map((order) => (
          String(order.id) === String(payload.orderId)
            ? { ...order, status: payload.status, estimatedTime: payload.estimatedTime ?? order.estimatedTime, etaEndsAt: payload.etaEndsAt ?? order.etaEndsAt, deliveringAt: payload.deliveringAt ?? order.deliveringAt }
            : order
        ))
        .filter(shouldShowTrackingOrderOnHome));
    });
    return () => {
      socket.disconnect();
    };
  }, [activeOrders]);
  // Vpoints-registreringskort i sponsor-railen — bara för utloggade besökare.
  useEffect(() => {
    if (isLoggedIn) {
      try { localStorage.setItem("dp_hadAccount", "1"); } catch { /* noop */ }
      setDpointsCard(null);
      return;
    }
    // Anti-farming: visa inte signup-erbjudandet om enheten redan haft ett konto.
    try { if (localStorage.getItem("dp_hadAccount")) { setDpointsCard(null); return; } } catch { /* noop */ }
    Promise.all([
      axios.get(`${API_URL}/api/dpoints/sponsor-card`).catch(() => ({ data: { card: null } })),
      axios.get(`${API_URL}/api/settings`).catch(() => ({ data: {} })),
    ]).then(([cardRes, setRes]: [{ data?: { card?: SponsorCardData | null } }, { data?: { dpoints?: { cardOnHome?: boolean } } }]) => {
      const onHome = setRes?.data?.dpoints?.cardOnHome ?? true;
      setDpointsCard(onHome ? (cardRes?.data?.card ?? null) : null);
    });
  }, [isLoggedIn]);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [closedRestaurant, setClosedRestaurant] = useState<Restaurant | null>(null);
  const [infoRestaurant, setInfoRestaurant] = useState<Restaurant | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      void getPlatformSessionStatus().then(setIsLoggedIn);
      const storedType = localStorage.getItem(ORDER_TYPE_KEY);
      // För leverans: läs den RIKTIGA leveransadressen först. platform_address
      // kan ha nollats (session-rensning) eller skrivits över med pickup-stad →
      // annars ser adressen "resettad" ut efter en order. Faller tillbaka till
      // platform_address. (Cart-sidan läser redan delivery-först, så detta gör
      // hemskärmen konsekvent.)
      const stored = (storedType !== "PICKUP" && localStorage.getItem("platform_delivery_address"))
        || localStorage.getItem("platform_address");
      if (stored) {
        const { clean } = parseStoredAddress(stored);
        setAddress(clean);
        localStorage.setItem("platform_address", clean);
        // Återställ coords från delivery-nyckeln om de nollats (för zon-koll).
        if (storedType !== "PICKUP" && !localStorage.getItem("platform_coords")) {
          const dc = localStorage.getItem("platform_delivery_coords");
          if (dc) localStorage.setItem("platform_coords", dc);
        }
      }
      if (storedType === "PICKUP" || storedType === "DELIVERY") setOrderType(storedType as "DELIVERY" | "PICKUP");

      const storedCity = storedType === "PICKUP"
        ? localStorage.getItem("platform_pickup_city")
        : localStorage.getItem("platform_city");
      if (storedCity) {
        setDetectedCityName(storedCity);
        setCityFamilyResolving(true);
        axios.get(`${API_URL}/api/cities/family-by-name`, { params: { name: storedCity } })
          .then((res) => {
            const familyIds: string[] = Array.isArray(res.data?.familyIds) ? res.data.familyIds : [];
            const familyNames: string[] = Array.isArray(res.data?.familyNames) ? res.data.familyNames : [];
            setCityFamilyIds(familyIds.length > 0 ? familyIds : null);
            setCityFamilyNames(familyNames.length > 0 ? familyNames.map((n) => n.toLowerCase()) : null);
            if (res.data?.name) setDetectedCityName(res.data.name);
          })
          .catch(() => { setCityFamilyIds(null); setCityFamilyNames(null); })
          .finally(() => setCityFamilyResolving(false));
      }

      const err = localStorage.getItem("platform_address_error");
      if (err) {
        setDeliveryError(err);
        localStorage.removeItem("platform_address_error");
      }

      if (storedType === "PICKUP" && !storedCity) {
        setShowAddressModal(true);
      }

      // Restore zone filtering from saved coords
      const storedCoords = localStorage.getItem("platform_coords");
      setHasDeliveryCoords(Boolean(storedCoords && storedType !== "PICKUP"));
      if (storedCoords && stored && storedType !== "PICKUP") {
        try {
          const coords = JSON.parse(storedCoords);
          const parsed = parseStoredAddress(stored);
          rememberQuickAddress({ street: parsed.street, zip: parsed.zip || undefined, city: parsed.city || undefined, latitude: coords.lat, longitude: coords.lng });
          validateZone(coords.lat, coords.lng);
        } catch (err) {
          console.warn("Failed to parse stored coords:", err);
        }
      }
    }
  }, []);

  // Seedad av servern? Då målas sidan direkt och denna fetch blir en TYST
  // bakgrunds-refresh (ingen spinner, inget fel-overlay över giltig SSR-data).
  // Seed från localStorage-cachen när servern inte gav initialData (kall ISR-
  // revalidering, API nere vid build, eller dev-mode utan RSC-cache). Körs
  // post-hydrering → ingen hydration-mismatch. Den tysta fetchen nedan ersätter
  // strax med färsk data; detta tar bara bort skeleton-flashen vid återbesök.
  const seededFromCacheRef = useRef(false);
  useEffect(() => {
    if (initialData) return;
    const cached = readHomeCache();
    if (!cached) return;
    seededFromCacheRef.current = true;
    setRestaurants(cached.restaurants);
    setCities(cached.cities);
    setDeals((cached.deals ?? []).filter((d: any) => d.isActive && d.showOnSite));
    setSponsors(cached.sponsors);
    setHomeCategorySections(cached.homeCategories);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ssrSeededRef = useRef(!!initialData);
  useEffect(() => {
    const ssrSeed = ssrSeededRef.current;
    ssrSeededRef.current = false;
    // Visa skeleton bara om vi inte redan har NÅGOT att rendera (varken RSC-
    // seed eller cache) — annars körs fetchen tyst i bakgrunden.
    if (!ssrSeed && !seededFromCacheRef.current) setLoading(true);
    Promise.all([
      axios.get(`${API_URL}/api/restaurants`),
      axios.get(`${API_URL}/api/cities`),
      axios.get(`${API_URL}/api/deals`),
      axios.get(`${API_URL}/api/sponsors`).catch(() => ({ data: [] })),
      axios.get(`${API_URL}/api/home-categories`).catch(() => ({ data: [] })),
      axios.get(`/api/platform/profile/deals`).catch(() => ({ data: [] })),
      axios.get(isLoggedIn ? `/api/platform/deals/app` : `${API_URL}/api/deals/app`, { params: { placement: "HOME_TOP", limit: 8, loggedIn: isLoggedIn ? "1" : "0", _t: Date.now() } }).catch(() => ({ data: { deals: initialData?.appDeals ?? [] } })),
      axios.get(isLoggedIn ? `/api/platform/home/pulse` : `${API_URL}/api/home/pulse`, { params: { _t: Date.now() } }).catch(() => ({ data: initialData?.pulse ?? { modules: [] } })),
    ]).then(([resRest, resCities, resDeals, resSponsors, resHomeCategories, resPersonal, resAppDeals, resPulse]) => {
      const restaurantsData = Array.isArray(resRest.data) ? resRest.data : [];
      const citiesData = Array.isArray(resCities.data) ? resCities.data : [];
      const dealsData = Array.isArray(resDeals.data) ? resDeals.data : [];
      const sponsorsData = Array.isArray(resSponsors.data) ? resSponsors.data : [];
      const homeCategoryData = Array.isArray(resHomeCategories.data) ? resHomeCategories.data : [];
      const personalDealsData = Array.isArray(resPersonal.data) ? resPersonal.data : [];
      const appDealsData = Array.isArray(resAppDeals.data?.deals) ? resAppDeals.data.deals : [];
      const pulseData = resPulse.data && typeof resPulse.data === "object" ? resPulse.data as HomePulseResponse : { modules: [] };

      setRestaurants(restaurantsData);
      setCities(citiesData);
      setDeals(dealsData.filter((d: any) => d.isActive && d.showOnSite));
      setSponsors(sponsorsData);
      setHomeCategorySections(homeCategoryData);
      setPersonalDeals(personalDealsData);
      setAppDeals(appDealsData);
      setPulseModules(Array.isArray(pulseData.modules) ? pulseData.modules : []);
      setHomeGreeting(pulseData.greeting ?? null);

      // Persistera för nästa besök → instant paint utan skeleton (personalDeals
      // utelämnas medvetet: kontospecifikt, hämtas alltid färskt).
      writeHomeCache({
        restaurants: restaurantsData,
        cities: citiesData,
        deals: dealsData,
        sponsors: sponsorsData,
        homeCategories: homeCategoryData,
      });

      const initialAddress = localStorage.getItem("platform_address") || "";
      if (initialAddress && citiesData.length > 0) {
        const match = citiesData.find((c: City) => c.name?.toLowerCase() === initialAddress.toLowerCase());
        if (match) setSelectedCity(match);
      }
    }).catch((err) => {
      console.error("API Error on Home:", err);
      if (!ssrSeed) setApiError(true);
    })
    .finally(() => { if (!ssrSeed) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validateZone = async (lat: number, lng: number) => {
    try {
      const res = await axios.post(`${API_URL}/api/cities/validate-location`, { lat, lng });
      if (res.data.covered) {
        const ids: string[] = [];
        const info: typeof zoneDeliveryInfo = {};
        const overrides: Record<string, { deliveryFee: number; minOrderAmount: number }> = {};
        res.data.cities.forEach((c: any) => {
          c.restaurants.forEach((r: any) => {
            ids.push(r.id);
            if (r.matchedZone) {
              const fee = (r.matchedZone.deliveryFee ?? 0) / 100;
              const min = (r.matchedZone.minOrder    ?? 0) / 100;
              info[r.id] = {
                deliveryFee: fee,
                minOrder:    min,
                etaMinutes:  r.matchedZone.etaMinutes  ?? null,
                zoneName:    r.matchedZone.name,
              };
              overrides[r.id] = { deliveryFee: fee, minOrderAmount: min };
            }
          });
        });
        setZoneRestaurantIds(ids);
        setZoneDeliveryInfo(info);
        setDeliveryOverrides(overrides);
        setZoneError(null);
      } else {
        setZoneRestaurantIds([]);
        setZoneDeliveryInfo({});
        setDeliveryOverrides({});
        setZoneError(t("home.zone.notCovered"));
      }
    } catch {
      setZoneRestaurantIds(null); // fail open — show all restaurants
      setZoneDeliveryInfo({});
      setDeliveryOverrides({});
    }
  };

  const saveAddress = (value: string) => {
    setAddress(value);
    if (typeof window !== "undefined") {
      localStorage.setItem("platform_address", value);
    }
  };

  const resolveCityFamily = async (cityName: string) => {
    setCityFamilyResolving(true);
    try {
      const res = await axios.get(`${API_URL}/api/cities/family-by-name`, { params: { name: cityName } });
      const familyIds: string[] = Array.isArray(res.data?.familyIds) ? res.data.familyIds : [];
      const familyNames: string[] = Array.isArray(res.data?.familyNames) ? res.data.familyNames : [];
      setCityFamilyIds(familyIds.length > 0 ? familyIds : null);
      setCityFamilyNames(familyNames.length > 0 ? familyNames.map((n) => n.toLowerCase()) : null);
      if (res.data?.name) setDetectedCityName(res.data.name);
    } catch {
      setCityFamilyIds(null);
      setCityFamilyNames(null);
    } finally {
      setCityFamilyResolving(false);
    }
  };

  const toggleOrderType = (type: "DELIVERY" | "PICKUP") => {
    if (selectedCity) {
      if (type === "DELIVERY" && selectedCity.deliveryMode === "ONLY_PICKUP") return;
      if (type === "PICKUP" && selectedCity.deliveryMode === "ONLY_DELIVERY") return;
    }

    setOrderType(type);
    if (typeof window !== "undefined") {
      localStorage.setItem(ORDER_TYPE_KEY, type);
    }

    if (type === "PICKUP") {
      setZoneRestaurantIds(null);
      setHasDeliveryCoords(false);
      // Pickup-city auto-default: prefer the delivery city the user already
      // picked. Falls back to the previously-used pickup city, then to the
      // address modal as a last resort. Old behaviour kept a stale pickup
      // city (e.g. Malmö) forever — even after the user moved to Lund.
      const storedDeliveryCity = typeof window !== "undefined" ? localStorage.getItem("platform_city") : null;
      const storedPickupCity = typeof window !== "undefined" ? localStorage.getItem("platform_pickup_city") : null;
      const preferredCity = storedDeliveryCity || storedPickupCity;
      if (preferredCity) {
        // Sync pickup-city to whichever city we actually want to use so the
        // next pickup toggle remembers it correctly.
        if (typeof window !== "undefined") localStorage.setItem("platform_pickup_city", preferredCity);
        setDetectedCityName(preferredCity);
        resolveCityFamily(preferredCity);
      } else {
        setDetectedCityName(null);
        setCityFamilyIds(null);
        setCityFamilyNames(null);
        setShowAddressModal(true);
      }
    } else if (type === "DELIVERY") {
      // Återställ den RIKTIGA leveransadressen — INTE pickup-stadens namn.
      const realAddr = typeof window !== "undefined" ? localStorage.getItem("platform_delivery_address") : null;
      const realCity = typeof window !== "undefined" ? localStorage.getItem("platform_delivery_city") : null;
      const realCoordsRaw = typeof window !== "undefined" ? localStorage.getItem("platform_delivery_coords") : null;

      if (realAddr) {
        setAddress(realAddr);
        localStorage.setItem("platform_address", realAddr);
        if (realCity) {
          localStorage.setItem("platform_city", realCity);
          setDetectedCityName(realCity);
          resolveCityFamily(realCity);
        }
        if (realCoordsRaw) {
          try {
            const coords = JSON.parse(realCoordsRaw);
            localStorage.setItem("platform_coords", realCoordsRaw);
            setHasDeliveryCoords(true);
            validateZone(coords.lat, coords.lng);
          } catch { /* ignore */ }
        }
      } else {
        // Ingen sparad leveransadress → be om att skriva/välja en riktig.
        setAddress("");
        setDetectedCityName(null);
        setCityFamilyIds(null);
        setCityFamilyNames(null);
        setHasDeliveryCoords(false);
        setShowAddressModal(true);
      }
    }
  };

  const handleAddressConfirm = async (addr: string, type: "DELIVERY" | "PICKUP", coords?: { lat: number; lng: number }, postalCode?: string, city?: string) => {
    setOrderType(type);
    localStorage.setItem(ORDER_TYPE_KEY, type);
    setShowAddressModal(false);
    setZoneError(null);

    if (type === "PICKUP") {
      const pickupCity = city || addr;
      localStorage.setItem("platform_pickup_city", pickupCity);
      // Spegla staden till platform_address också, så restaurang-sidans
      // adress-grind (som kollar platform_address) inte öppnar modalen igen
      // när man redan valt avhämtningsstad här. Paritet med restaurang-flödet.
      localStorage.setItem("platform_address", pickupCity);
      setDetectedCityName(pickupCity);
      setZoneRestaurantIds(null);
      setHasDeliveryCoords(false);
      await resolveCityFamily(pickupCity);
    } else {
      saveAddress(addr);
      // Spara den RIKTIGA leveransadressen separat så att pickup (som speglar
      // stadsnamnet till platform_address) inte skriver över den. Vid byte
      // pickup→leverans återställs denna istället för stadsnamnet.
      localStorage.setItem("platform_delivery_address", addr);
      if (city) {
        localStorage.setItem("platform_city", city);
        localStorage.setItem("platform_delivery_city", city);
        await resolveCityFamily(city);
      } else {
        localStorage.removeItem("platform_city");
        setCityFamilyIds(null);
        setDetectedCityName(null);
      }
      if (coords) {
        localStorage.setItem("platform_coords", JSON.stringify(coords));
        localStorage.setItem("platform_delivery_coords", JSON.stringify(coords));
        setHasDeliveryCoords(true);
        rememberQuickAddress({ street: addr.split(",")[0].trim(), latitude: coords.lat, longitude: coords.lng, zip: postalCode, city });
        await validateZone(coords.lat, coords.lng);
      } else {
        localStorage.removeItem("platform_coords");
        setZoneRestaurantIds(null);
        setHasDeliveryCoords(false);
      }
    }

    if (pendingHref) {
      setPendingHref(null);
    }
  };

  // Delad snabbväljar-handler — används av AddressPullDown både i sticky-headern
  // (mobil) och i desktop-headern. Kallar samma confirm-flöde som modalen så
  // stad-state alltid hålls konsekvent.
  const handleQuickAddressSelect = (a: { latitude?: number | null; longitude?: number | null; zip?: string; city?: string }) => {
    const full = formatQuickAddress(a as any);
    handleAddressConfirm(
      full,
      orderType,
      a.latitude != null && a.longitude != null ? { lat: a.latitude, lng: a.longitude } : undefined,
      a.zip,
      a.city,
    );
  };

  const allDealCards = useMemo<DealCardData[]>(() => {
    const personal: DealCardData[] = personalDeals.map(d => ({
      id: `personal-${d.id}`,
      badgeLabel: (d.campaign?.title || "").toLowerCase().includes("välkomst") ? t("home.deal.badge.welcome") : t("home.deal.badge.personal"),
      title: d.campaign?.title || t("home.deal.defaultTitle"),
      subtitle: d.code ? t("home.deal.yourCode", { code: d.code }) : t("home.deal.linkedToAccount"),
      rewardLabel: d.campaign?.discountType === "PERCENTAGE"
        ? t("home.deal.percentOff", { value: d.campaign.discountValue })
        : t("home.deal.krOff", { value: d.campaign?.discountValue || 0 }),
      description: d.campaign?.description || t("home.deal.autoApplied"),
      code: d.code,
      validUntil: d.campaign?.validUntil,
      minOrderText: d.campaign?.minOrder ? t("home.deal.minOrderShort", { amount: d.campaign.minOrder }) : null,
      tone: (d.campaign?.title || "").toLowerCase().includes("välkomst") ? "orange" as const : "gold" as const,
      variant: "personal" as const,
    }));

    const pub: DealCardData[] = deals.map(d => {
      const related = [d.restaurantId, ...(d.applicableRestaurantIds || [])].filter(Boolean);
      const isBogo = d.triggerType === "BOGO_CATEGORY" || d.dealType === "BOGO_CATEGORY";
      const discountPercent = !isBogo && d.discountType === "PERCENTAGE" ? Number(d.discountValue) || 0 : 0;
      return {
        id: d.id,
        badgeLabel: d.isGlobal ? t("home.deal.badge.global") : (d.restaurant?.name || t("home.deal.defaultTitle")),
        title: d.title,
        subtitle: d.description || (d.restaurant?.name ? t("home.deal.atRestaurant", { name: d.restaurant.name }) : t("home.deal.allRestaurants")),
        // BOGO har 0kr discount men ger gratisvara — visa det istället för "0 kr".
        // Fri-leverans/NONE-deals har discountValue 0: visa deras badgeText
        // ("Fri leverans") i stället för det felaktiga "0 kr".
        rewardLabel: isBogo
          ? t("home.deal.bogo")
          : d.discountType === "PERCENTAGE"
            ? `${d.discountValue}%`
            : Number(d.discountValue) > 0
              ? `${d.discountValue} ${t("common.kr")}`
              : (d.badgeText || ""),
        description: d.description,
        code: d.code,
        validUntil: d.validUntil,
        minOrderText: d.minOrder ? t("home.deal.minOrderShort", { amount: d.minOrder }) : null,
        tags: d.tags || [],
        tone: (isBogo ? "emerald" : "purple") as "emerald" | "purple",
        isBogo,
        discountPercent,
        variant: "public" as const,
        relatedRestaurantIds: related,
        isGlobal: d.isGlobal ?? false,
        onNavigateToFiltered: (ids: string[], title: string) => setFilteredByDeal({ ids, title }),
      };
    });

    return [...personal, ...pub];
  }, [deals, personalDeals, restaurants]);

  // Delad city-filter-helper. Används av:
  //   - filtered (huvud-grid)
  //   - renderFeaturedRail (Heta listan, PIZZA FREDAG, SNABB LUNCH osv)
  //   - featured (auto-utvalda)
  // Tidigare bug: city-filter satt bara i filtered → HomeCategorySection's
  // rå admin-data (section.restaurants) gick aldrig igenom → restauranger
  // från andra städer visades i Heta listan oavsett kundens adress.
  const matchesCityFamily = useCallback((r: Restaurant): boolean => {
    if (cityFamilyIds && cityFamilyIds.length > 0) {
      const rCityId = (r as any).cityId as string | null | undefined;
      if (rCityId) return cityFamilyIds.includes(rCityId);
      // Ingen cityId → matcha stad-namnet mot HELA familjen (parent + barn),
      // inte bara det valda namnet. Annars tappas barn-stadens restauranger
      // (t.ex. Dalby under Lund) som saknar cityId.
      if (cityFamilyNames && cityFamilyNames.length > 0) {
        return cityFamilyNames.includes((r.city || "").toLowerCase());
      }
      if (detectedCityName) {
        return (r.city || "").toLowerCase() === detectedCityName.toLowerCase();
      }
      return false;
    }
    // Familjen slås fortfarande upp → mjuk namn-matchning så stadens
    // restauranger syns direkt (ingen "inte tillgänglig"-flash).
    if (detectedCityName && cityFamilyResolving) {
      return (r.city || "").toLowerCase() === detectedCityName.toLowerCase();
    }
    // Strict: vi har stad-namnet men inte hittade familyIds → visa inget
    if (detectedCityName) return false;
    if (orderType === "PICKUP") return false;
    return true;
  }, [cityFamilyIds, cityFamilyNames, detectedCityName, cityFamilyResolving, orderType]);

  // Antal restauranger i kundens stad per cuisine — visas som liten siffra i
  // chip-raden så man ser hur många som faktiskt finns i staden av varje.
  // Räknas mot hela stadens pool (ignorerar aktiv cuisine, annars blir alla
  // utom den valda 0).
  const cuisineCounts = useMemo(() => {
    const cityPool = restaurants.filter(matchesCityFamily);
    const counts: Record<string, number> = {};
    for (const c of cuisineFilters) {
      if (c.label === "Alla") counts[c.label] = cityPool.length;
      else if (c.label === "Favoriter") counts[c.label] = cityPool.filter((r) => favorites.has(r.id)).length;
      else
        counts[c.label] = cityPool.filter(
          (r) =>
            (r.cuisine || "").toLowerCase().includes(c.label.toLowerCase()) ||
            (r.tags || []).some((tag) => tag.toLowerCase().includes(c.label.toLowerCase())),
        ).length;
    }
    return { counts, total: cityPool.length };
  }, [restaurants, matchesCityFamily, favorites]);

  const filtered = useMemo(() => {
    const list = restaurants.filter((r) => {
      // "Favoriter" är en pseudo-cuisine: filtrerar mot localStorage-store i stället för cuisine-fält
      const matchCuisine =
        activeCuisine === "Alla"
          ? true
          : activeCuisine === "Favoriter"
            ? favorites.has(r.id)
            : (r.cuisine || "").toLowerCase().includes(activeCuisine.toLowerCase()) ||
              (r.tags || []).some((t) => t.toLowerCase().includes(activeCuisine.toLowerCase()));
      const matchQuery =
        query.trim().length === 0 ||
        r.name.toLowerCase().includes(query.toLowerCase()) ||
        (r.description || "").toLowerCase().includes(query.toLowerCase());
      const matchDeal = !filteredByDeal || filteredByDeal.ids.includes(r.id);
      // City-filter via delad helper — samma logik kör för main-grid OCH
      // alla rails (Heta listan, PIZZA FREDAG, SNABB LUNCH).
      const matchCity = matchesCityFamily(r);
      return matchCuisine && matchQuery && matchCity && matchDeal;
    });

    const sorted = list.sort((a, b) => {
      const aInZone = zoneRestaurantIds === null || !orderType || orderType === "PICKUP" || zoneRestaurantIds.includes(a.id);
      const bInZone = zoneRestaurantIds === null || !orderType || orderType === "PICKUP" || zoneRestaurantIds.includes(b.id);
      if (aInZone !== bInZone) return aInZone ? -1 : 1;
      const aOpen = a.isOpen !== false ? 1 : 0;
      const bOpen = b.isOpen !== false ? 1 : 0;
      if (aOpen !== bOpen) return bOpen - aOpen;
      const aPremium = (a.featuredClass === 1 || a.featuredClass === 2) ? 1 : 0;
      const bPremium = (b.featuredClass === 1 || b.featuredClass === 2) ? 1 : 0;
      if (aPremium !== bPremium) return bPremium - aPremium;
      return a.name.localeCompare(b.name);
    });

    // Sortera så in-zone-restauranger kommer FÖRST. Out-of-zone-restauranger
    // hamnar längst ner (dimmade och markerade "Utanför zon" i UI). Detta är
    // viktigt så vi inte rankar restauranger högt som ändå inte kan leverera.
    const inZoneSorted = sorted.slice().sort((a, b) => {
      if (zoneRestaurantIds === null) return 0;
      const aIn = zoneRestaurantIds.includes(a.id) ? 0 : 1;
      const bIn = zoneRestaurantIds.includes(b.id) ? 0 : 1;
      return aIn - bIn;
    });

    return inZoneSorted;
  }, [restaurants, activeCuisine, query, orderType, zoneRestaurantIds, filteredByDeal, favorites, matchesCityFamily]);

  const featured = filtered.filter((r) => r.featuredClass === 1 || r.featuredClass === 2).slice(0, 8);

  const resolvedHomeCategorySections = useMemo(() => {
    return homeCategorySections
      .map((section) => ({
        ...section,
        restaurants: resolveHomeCategoryRestaurants({
          section,
          restaurants,
          deals,
          deliveryOverrides,
          orderType,
          selectedCityName: detectedCityName,
          cityFamilyIds,
          cityFamilyNames,
          zoneRestaurantIds,
        }),
      }))
      .filter((section) => section.restaurants.length > 0);
  }, [homeCategorySections, restaurants, deals, deliveryOverrides, orderType, detectedCityName, cityFamilyIds, cityFamilyNames, zoneRestaurantIds]);

  const promoCards = useMemo<PromoCardItem[]>(() => {
    const extras: PromoCardItem[] = [];
    const champion = pulseModules.find((module) => module.type === "CHAMPION" && module.restaurant);
    if (champion) extras.push({ id: `pulse-champion-${champion.id}`, kind: "pulseChampion", module: champion });
    extras.push(...appDeals.slice(0, 7).map((appDeal) => ({ id: `app-deal-${appDeal.id}`, kind: "appDeal" as const, appDeal })));
    const trending = pulseModules.find((module) => module.type === "TRENDING" && module.restaurants?.length);
    const newInTown = pulseModules.find((module) => module.type === "NEW_RESTAURANTS" && module.restaurants?.length);
    if (trending?.restaurants?.[0]) extras.push({ id: `pulse-trending-${trending.restaurants[0].id}`, kind: "pulseHighlight", module: trending, restaurant: trending.restaurants[0], badge: "Trendar" });
    if (newInTown?.restaurants?.[0]) extras.push({ id: `pulse-new-${newInTown.restaurants[0].id}`, kind: "pulseHighlight", module: newInTown, restaurant: newInTown.restaurants[0], badge: "Ny i stan" });

    const sponsorCards: PromoCardItem[] = sponsors.map((sponsor) => ({ id: `sponsor-${sponsor.id}`, kind: "sponsor" as const, sponsor }));
    const base: PromoCardItem[] = [];
    const max = Math.max(sponsorCards.length, extras.length);
    for (let i = 0; i < max; i++) {
      if (sponsorCards[i]) base.push(sponsorCards[i]);
      if (extras[i]) base.push(extras[i]);
    }
    // Vpoints-kortet ligger FÖRST i samma array → räknas av karusellen + prickarna.
    return dpointsCard
      ? [{ id: "dpoints-signup", kind: "dpoints" as const, card: dpointsCard }, ...base]
      : base;
  }, [sponsors, dpointsCard, appDeals, pulseModules]);

  const getDealForRestaurant = useCallback((restaurantId: string) => {
    return allDealCards.find(d => d.relatedRestaurantIds?.includes(restaurantId) || d.isGlobal);
  }, [allDealCards]);

  // En restaurang kan ha max 2 badges: en BOGO + en regular (högsta procenten).
  const getBadgesForRestaurant = useCallback((restaurantId: string) => {
    const eligible = allDealCards.filter(d => d.relatedRestaurantIds?.includes(restaurantId) || d.isGlobal);
    const bogo = eligible.find(d => d.isBogo) || null;
    const regulars = eligible.filter(d => !d.isBogo);
    // Sortera regulars: högsta % först, fallback till första
    regulars.sort((a, b) => (b.discountPercent || 0) - (a.discountPercent || 0));
    const regular = regulars[0] || null;
    return { bogo, regular };
  }, [allDealCards]);

  const handlePromoScroll = useCallback(() => {
    const rail = promoRailRef.current;
    if (!rail) return;
    // Mät faktisk kortbredd (korten är 460px/86vw, inte den gamla 260-konstanten)
    // så index landar rätt och ALLA kort cyklas.
    const first = rail.children[0] as HTMLElement | undefined;
    const snap = first ? first.offsetWidth + PROMO_CARD_GAP : PROMO_SNAP;
    const idx = Math.max(
      0,
      Math.min(Math.round(rail.scrollLeft / snap), Math.max(promoCards.length - 1, 0))
    );
    promoIndexRef.current = idx;
    setActivePromo(idx);
  }, [promoCards.length]);

  useEffect(() => {
    promoIndexRef.current = 0;
    setActivePromo(0);
    if (promoCards.length <= 1) return;

    // Skifta kort var 5:e sekund (önskemål).
    const interval = window.setInterval(() => {
      const rail = promoRailRef.current;
      if (!rail) return;

      const nextIndex = (promoIndexRef.current + 1) % promoCards.length;
      promoIndexRef.current = nextIndex;
      setActivePromo(nextIndex);
      const first = rail.children[0] as HTMLElement | undefined;
      const snap = first ? first.offsetWidth + PROMO_CARD_GAP : PROMO_SNAP;
      rail.scrollTo({ left: nextIndex * snap, behavior: "smooth" });
    }, 5000);

    return () => window.clearInterval(interval);
  }, [promoCards.length]);

  const getRestaurantHref = (r: Restaurant) => `/restaurants/${r.slug}`;

  const getImageSrc = (path?: string) => {
    if (!path) return "";
    if (path.startsWith("/")) return `${API_URL}${path}`;
    return path;
  };

  const getCardImage = (r: Restaurant) => {
    return getImageSrc(r.heroImageUrl || r.imageUrl || "");
  };

  const activateAppDeal = (deal: HomeAppDeal) => {
    const userDealId = deal.userDealId;
    if (!userDealId) return;
    try {
      localStorage.setItem(ACTIVE_USER_DEAL_ID_KEY, userDealId);
      localStorage.setItem(ACTIVE_USER_DEAL_SNAPSHOT_KEY, JSON.stringify(deal));
    } catch { /* noop */ }
    setActiveUserDealId(userDealId);
    router.push("/cart");
  };

  const runAppDealCta = (deal: HomeAppDeal) => {
    const action = (deal.ctaAction || (deal.claimRequired !== false ? "CLAIM" : "RESTAURANT")).toUpperCase();
    if (action === "CART") {
      router.push("/cart");
      return;
    }
    if (action === "REWARDS") {
      router.push("/profile?tab=rewards");
      return;
    }
    if (action === "URL" && deal.ctaTarget) {
      window.location.href = deal.ctaTarget;
      return;
    }
    if (action === "RESTAURANT") {
      const slug = deal.ctaTarget || deal.restaurant?.slug;
      if (slug) router.push(`/restaurants/${slug}`);
      return;
    }
    if (deal.restaurant?.slug && deal.claimRequired === false) {
      router.push(`/restaurants/${deal.restaurant.slug}`);
    }
  };

  const handleAppDealAction = async (deal: HomeAppDeal) => {
    if (!isLoggedIn) {
      router.push("/profile");
      return;
    }
    if (deal.userDealId && !deal.missionType) {
      activateAppDeal(deal);
      return;
    }
    if (deal.missionType && deal.userDealId) return;
    if (deal.claimRequired === false || (deal.ctaAction && deal.ctaAction.toUpperCase() !== "CLAIM")) {
      runAppDealCta(deal);
      return;
    }
    setClaimingDealId(deal.id);
    try {
      const res = await axios.post(`/api/platform/deals/app/${deal.id}/claim`, {});
      const claimedDeal = res.data?.deal || deal;
      if (claimedDeal?.userDealId && !claimedDeal?.missionType) {
        setAppDeals((current) => current.filter((item) => item.id !== deal.id));
        activateAppDeal(claimedDeal);
      } else {
        setAppDeals((current) => current.map((item) => item.id === deal.id ? claimedDeal : item));
      }
    } catch (err: any) {
      if (err?.response?.status === 401) router.push("/profile");
    } finally {
      setClaimingDealId(null);
    }
  };

  const openRestaurantSlug = (slug: string) => {
    router.push(`/restaurants/${slug}`);
  };

  const renderFeaturedRail = (title: string, subtitle: string | null | undefined, sectionRestaurants: Restaurant[], options: { alwaysShow?: boolean } = {}) => {
    // City-filter FÖRST — applicerar samma helper som main-grid använder.
    // Detta körs automatiskt på ALLA rails (Heta listan, PIZZA FREDAG, SNABB
    // LUNCH och alla framtida HomeCategorySections som admin skapar) utan
    // att admin behöver tänka på det.
    const cityFiltered = sectionRestaurants.filter((r) => matchesCityFamily(r));

    // Om sektionen blir tom efter city-filter: dölj hela sektionen — så
    // användaren inte ser tomma rails av rubriker. Heta listan kan undantas
    // via alwaysShow=true (den är "premium-listan" som ska synas oavsett).
    if (cityFiltered.length === 0 && !options.alwaysShow) return null;

    // Sortera så in-zone-restauranger kommer FÖRST. Out-of-zone hamnar
    // längst ner dimmade.
    const sortedSection = cityFiltered.slice().sort((a, b) => {
      if (zoneRestaurantIds === null) return 0;
      const aIn = zoneRestaurantIds.includes(a.id) ? 0 : 1;
      const bIn = zoneRestaurantIds.includes(b.id) ? 0 : 1;
      return aIn - bIn;
    });
    return (
    <section className="mb-3">
      <div className="flex items-end justify-between mb-1.5 px-1">
        <div className="min-w-0">
          {/* Lugn rubrik — samma skala som restaurang-/ordersidan. Guld bara
              på "Visa alla"-länken. */}
          <h2 className="text-lg sm:text-xl font-bold tracking-tight truncate" style={{ color: "var(--text-primary)" }}>{title}</h2>
          {!!subtitle && <p className="text-[12px] font-medium mt-0.5 truncate" style={{ color: "var(--text-secondary)" }}>{subtitle}</p>}
        </div>
        <Link href="/search" className="text-[12px] font-bold text-gold-600 hover:text-gold-500 transition-all shrink-0 ml-3">{t("home.viewAll")}</Link>
      </div>
      {/* Mobil: horisontell scroll • md+: 2-kolumn grid • lg+: 3-kolumn • xl+: 4-kolumn */}
      <div className="flex md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 overflow-x-auto md:overflow-visible pb-1 md:pb-0 no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
        {sortedSection.map((r, i) => {
          const inZone = orderType !== "DELIVERY" || zoneRestaurantIds === null || zoneRestaurantIds.includes(r.id);
          const isComingSoon = r.comingSoon === true;
          const dimmed = isComingSoon || r.isOpen === false || !inZone;
          const railPaused = r.pausedUntil ? new Date(r.pausedUntil) : null;
          const railIsPaused = railPaused !== null && railPaused.getTime() > Date.now();
          const railDimReason = isComingSoon
            ? "Kommer snart"
            : !inZone
            ? "Utanför zon"
            : r.isOpen === false
              ? (railIsPaused
                  ? `Öppnar ${railPaused!.getHours().toString().padStart(2, "0")}:${railPaused!.getMinutes().toString().padStart(2, "0")}`
                  : (nextOpenLabel(r.openingHours) || "Stängd"))
              : null;
          return (
            <div
              key={`${title}-${r.id}`}
              className={`transition-all duration-300 shrink-0 md:shrink w-[230px] sm:w-[260px] md:w-auto active:opacity-80 ${dimmed ? "grayscale opacity-80" : ""}`}
            >
              <Link
                href={getRestaurantHref(r)}
                onClick={(e) => handleRestaurantClick(e, r)}
                className="group relative block h-full rounded-2xl flex flex-col overflow-hidden transition-all duration-300 ease-out hover:shadow-xl hover:-translate-y-1"
                style={{ backgroundColor: "var(--bg-secondary)", boxShadow: "0 2px 12px rgba(17,17,19,0.06)" }}
              >
                {(() => {
                  // Utvald-tier + deal-chip uppe till vänster (Swift-paritet).
                  // Flyttas ner under status-pillen om den syns.
                  const badges = getBadgesForRestaurant(r.id);
                  const regularLabel = badges.regular
                    ? (badges.regular.discountPercent ? `−${badges.regular.discountPercent} %` : badges.regular.rewardLabel)
                    : "";
                  const showFeatured = r.featuredClass === 1 || r.featuredClass === 2;
                  if (!showFeatured && !badges.bogo && !regularLabel) return null;
                  return (
                    <div className={`absolute ${railDimReason ? "top-11" : "top-3"} left-3 z-20 flex flex-wrap gap-1.5 max-w-[calc(100%-1.5rem)]`}>
                      <FeaturedBadge featuredClass={r.featuredClass} />
                      {badges.bogo && (
                        <span className="bg-gold-500 text-[12px] font-semibold px-2 py-0.5 rounded-md" style={{ color: "#141416" }}>
                          {t("home.deal.badge.bogo")}
                        </span>
                      )}
                      {regularLabel && (
                        <span className="bg-gold-500 text-[12px] font-semibold px-2 py-0.5 rounded-md" style={{ color: "#141416" }}>
                          {regularLabel}
                        </span>
                      )}
                    </div>
                  );
                })()}
                <div className="h-36 sm:h-44 md:h-48 w-full relative overflow-hidden" style={{ backgroundColor: "var(--bg-deep)" }}>
                  {railDimReason && (
                    <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm" style={{ backgroundColor: "rgba(17,17,19,0.82)", backdropFilter: "blur(6px)" }}>
                      {isComingSoon ? <Store size={11} className="text-white" /> : !inZone ? <MapPin size={11} className="text-white" /> : <Clock size={11} className="text-white" />}
                      <span className="text-[10px] font-black uppercase tracking-wide text-white">{railDimReason}</span>
                    </div>
                  )}
                  {r.heroImageUrl || r.imageUrl ? (
                    <SmartImage src={getCardImage(r)} alt={r.name} sizes="(max-width: 768px) 260px, 25vw" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <span className="text-3xl font-bold" style={{ color: "var(--text-secondary)", opacity: 0.4 }}>{r.name.slice(0, 1).toUpperCase()}</span>
                    </div>
                  )}
                </div>

                <div className="px-3 py-2.5">
                  <h3 className="text-sm sm:text-base font-bold group-hover:text-gold-500 transition-colors tracking-tight leading-tight mb-1.5 truncate" style={{ color: "var(--text-primary)" }}>{r.name}</h3>
                  <div className="flex items-center gap-2 text-[10px] font-bold" style={{ color: "var(--text-secondary)" }}>
                    <span className="flex items-center gap-1">
                      <Star size={11} className="fill-gold-500 text-gold-500" />
                      <span className="font-black" style={{ color: "var(--text-primary)" }}>{(r.rating ?? 4.5).toFixed(1)}</span>
                    </span>
                    {orderType === "DELIVERY" && (() => {
                      const zi = zoneDeliveryInfo[r.id];
                      const outOfZone = zoneRestaurantIds !== null && !zoneRestaurantIds.includes(r.id);
                      if (outOfZone) {
                        return (<><span className="opacity-40">·</span><span className="text-rose-500/80 uppercase tracking-wider">{t("home.status.outOfZone") ?? "Levererar ej"}</span></>);
                      }
                      const eta = zi?.etaMinutes ?? r.etaMinutes ?? 30;
                      return (<><span className="opacity-40">·</span><span className="flex items-center gap-1"><Clock size={11} /> {eta} {t("home.minutesShort")}</span></>);
                    })()}
                  </div>
                </div>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
    );
  };

  const handleRestaurantClick = (e: React.MouseEvent, r: Restaurant) => {
    e.preventDefault();
    // Stängd restaurang — visa modal istället för silent navigation eller
    // native alert(). Tidigare användes window.alert() men det:
    // (a) bryts av mobile-keyboard
    // (b) ser oprofessionellt ut
    // (c) hindrar kund från att kolla menyn ändå
    // Modal:en (closedRestaurant nedan) ger valet "Se meny" eller "Stäng".
    const pausedUntil = r.pausedUntil ? new Date(r.pausedUntil) : null;
    const isPaused = pausedUntil && pausedUntil.getTime() > Date.now();
    if (r.comingSoon) return;
    if (r.isOpen === false || isPaused) {
      setClosedRestaurant(r);
      return;
    }
    router.push(getRestaurantHref(r));
  };



  return (
    <div className="viaeats-app-bg min-h-screen pb-36 md:pt-24" style={{ color: "var(--text-primary)" }}>
      <div className="sticky top-0 z-[1400] border-b border-[var(--border-muted)] bg-white/75 backdrop-blur-xl md:static md:border-0 md:bg-transparent md:backdrop-blur-0" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <header className="mx-auto max-w-7xl px-5 py-3.5 md:px-7 md:pb-6 md:pt-0">
          {!!homeGreeting && (
            <p className="mb-2 text-[15px] font-black leading-tight tracking-normal text-[var(--ink)]">{homeGreeting}</p>
          )}

          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setShowAddressModal(true)} className="min-w-0 flex flex-1 items-center gap-3 text-left">
              <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[rgba(240,79,26,0.12)] text-[var(--orange)]">
                <MapPin size={18} fill="currentColor" strokeWidth={2.2} />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-normal text-[var(--muted)]">
                  {orderType === "DELIVERY" ? t("home.address.deliverTo") : t("home.address.pickupIn")}
                </span>
                <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[15px] font-black leading-tight tracking-normal text-[var(--ink)]">
                    {address || detectedCityName || "Välj adress"}
                  </span>
                  <ChevronDown size={14} strokeWidth={2.6} className="shrink-0 text-[var(--ink)] opacity-70" />
                </span>
              </span>
            </button>

            <Link
              href="/orders"
              className="hidden h-9 shrink-0 items-center gap-1.5 rounded-full bg-[rgba(240,79,26,0.09)] px-3 text-[12px] font-black text-[var(--orange)] sm:inline-flex"
              aria-label="Vpoints"
            >
              <DpointsGlyph size={16} />
              <span className="tabular-nums">{dpointsBalance != null ? `${dpointsBalance.toLocaleString("sv-SE")} p` : "Vpoints"}</span>
            </Link>

            <Link
              href="/discover"
              className="relative flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-white text-[var(--ink)] swift-card-shadow"
              aria-label="Favoriter"
            >
              <Heart size={18} fill={favorites.size > 0 ? "var(--orange)" : "none"} strokeWidth={2.2} className={favorites.size > 0 ? "text-[var(--orange)]" : ""} />
              {favorites.size > 0 && (
                <span className="absolute -right-1 -top-1 flex min-h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[var(--orange)] px-1 text-[9px] font-black text-white">
                  {favorites.size > 99 ? "99+" : favorites.size}
                </span>
              )}
            </Link>
          </div>

          <div className="mt-3">
            <label className="flex h-10 flex-1 items-center gap-2 rounded-[13px] border border-[var(--line)] bg-white px-3">
              <Search size={15} strokeWidth={2.2} className="shrink-0 text-[var(--muted)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Sök restaurang, sushi, pizza..."
                className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-semibold text-[var(--ink)] outline-none placeholder:text-[var(--muted)] md:text-[14px]"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="text-[var(--muted)]" aria-label="Rensa sök">
                  <X size={16} fill="currentColor" />
                </button>
              )}
            </label>
          </div>
        </header>
      </div>

      <div className="relative mx-auto max-w-7xl 2xl:max-w-[1600px] px-5 sm:px-6 lg:px-10 xl:px-16 pt-5 md:pt-0">

        {activeOrders.length > 0 && activeCuisine === "Alla" && (
          <section className="mb-5">
            <div className="space-y-2">
              {activeOrders.map((order, index) => {
                  const qs = new URLSearchParams();
                  try {
                  const token = order.__trackingToken || localStorage.getItem(ACTIVE_ORDER_TOKEN_KEY);
                  const phone = order.__trackingPhone || order.customerPhone || localStorage.getItem(ACTIVE_ORDER_PHONE_KEY);
                  if (token) qs.set("token", token);
                  if (phone) qs.set("phone", phone);
                } catch { /* noop */ }
                const href = qs.toString() ? `/order/${order.id}?${qs.toString()}` : `/order/${order.id}`;
                // Recensionsprompt (Swift-paritet): levererad, ej recenserad,
                // ej skippad. "Recensera" öppnar ordersidans review-kort,
                // "Skippa" sparas i viaeats.skippedReviewOrderIds.
                const orderStatus = String(order.status || "").toUpperCase();
                const showReviewPrompt =
                  DELIVERED_TRACKING_STATUSES.has(orderStatus) &&
                  !(Number(order.rating || 0) > 0) &&
                  !order.reviewedAt &&
                  !skippedReviewIds.includes(String(order.id));
                return (
                  <div key={order.id} className={index === 0 ? "" : "mt-2"}>
                    <OrderTrackingCard
                      order={order}
                      href={href}
                      courier={courierPositions[String(order.id)]}
                    />
                    {showReviewPrompt && (
                      <div className="mt-2 flex gap-2">
                        <Link
                          href={href}
                          className="flex h-10 flex-[2] items-center justify-center gap-1.5 rounded-xl text-[13px] font-black text-white active:scale-[0.99]"
                          style={{ backgroundColor: "#2E7D4F" }}
                        >
                          <Star size={14} className="fill-current" /> Recensera +Vpoints
                        </Link>
                        <button
                          type="button"
                          onClick={() => setSkippedReviewIds(addSkippedReviewOrderId(String(order.id)))}
                          className="h-10 flex-1 rounded-xl text-[13px] font-bold active:scale-[0.99]"
                          style={{ backgroundColor: "rgba(17,17,19,0.06)", color: "var(--text-secondary)" }}
                        >
                          Skippa
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <TrackingAdsRail ads={trackingAds} />
          </section>
        )}

        {/* ── WHAT'S ON (Aktuellt) — först på sidan: stora banner-kort som
            auto-skiftar var 5:e sekund, med prick-indikator under. ── */}
        {promoCards.length > 0 && (
          <section className="mb-5">
            <div className="mb-3 px-1">
              <SwiftSectionHeader title={t("home.section.current")} subtitle={t("home.section.currentSub")} />
            </div>
            <div
              ref={promoRailRef}
              onScroll={handlePromoScroll}
              className="flex items-start gap-3 overflow-x-auto pb-1 no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0"
              style={{ scrollSnapType: "x mandatory" }}
            >
              {promoCards.map((item) => (
                <div key={item.id} style={{ scrollSnapAlign: "start" }}>
                  {item.kind === "dpoints" ? (
                    <DpointsHomeCard card={item.card} />
                  ) : item.kind === "sponsor" ? (
                    <SponsorCard sponsor={item.sponsor} />
                  ) : item.kind === "appDeal" ? (
                    <HomeAppDealCard
                      deal={item.appDeal}
                      activeUserDealId={activeUserDealId}
                      claiming={claimingDealId === item.appDeal.id}
                      onAction={handleAppDealAction}
                    />
                  ) : item.kind === "pulseChampion" ? (
                    <ChampionPromoCard module={item.module} onOpen={openRestaurantSlug} />
                  ) : (
                    <HighlightPromoCard restaurant={item.restaurant} badge={item.badge} onOpen={openRestaurantSlug} />
                  )}
                </div>
              ))}
            </div>
            {/* Prick-indikator */}
            {promoCards.length > 1 && (
              <div className="flex items-center justify-center gap-1.5 mt-3">
                {promoCards.map((item, i) => (
                  <button
                    key={`dot-${item.id}`}
                    aria-label={`Visa erbjudande ${i + 1}`}
                    onClick={() => {
                      const rail = promoRailRef.current;
                      if (rail) rail.scrollTo({ left: i * PROMO_SNAP, behavior: "smooth" });
                      promoIndexRef.current = i;
                      setActivePromo(i);
                    }}
                    className="h-1.5 rounded-full transition-all"
                    style={{ width: activePromo === i ? "22px" : "6px", backgroundColor: activePromo === i ? "#F0531C" : "var(--border-muted)" }}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {pulseModules
          .filter((module) => ["COMEBACK", "STREAK", "POINTS_NUDGE", "OCCASION", "WEATHER", "FAVORITE"].includes(module.type))
          .slice(0, 3)
          .map((module) => (
            <section key={module.id} className="mb-5">
              <PulseModuleSection module={module} onOpenRestaurant={openRestaurantSlug} />
            </section>
          ))}

        {/* ── KATEGORIER — ramlösa text-tabbar med guld-underline för aktiv
            (samma språk som menysidans sticky kategori-rad). ── */}
        <section className="mb-5 sm:mb-6 mt-4">
          <div className="flex gap-5 sm:gap-6 overflow-x-auto lg:flex-wrap lg:overflow-visible no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 border-b" style={{ borderColor: "var(--border-muted)" }}>
            {cuisineFilters.map((c) => {
              const active = activeCuisine === c.label;
              const count = cuisineCounts.counts[c.label] ?? 0;
              const isSpecial = c.label === "Alla" || c.label === "Favoriter";
              // Dölj cuisine-chips som inte finns i staden (när datan laddats).
              // Alla/Favoriter visas alltid.
              if (!isSpecial && cuisineCounts.total > 0 && count === 0) return null;
              // Visa siffran när stadens pool är känd (men inte "Favoriter 0").
              const showCount = cuisineCounts.total > 0 && !(c.label === "Favoriter" && count === 0);
              return (
                <button
                  key={c.label}
                  onClick={() => {
                    setActiveCuisine(c.label);
                    // Spara vald kategori så att man hamnar tillbaka på samma
                    // kategori när man backar in från en restaurang (router.back).
                    try { sessionStorage.setItem("home_cuisine", c.label); } catch { /* noop */ }
                    setTimeout(() => {
                      const target = document.getElementById("restaurant-list");
                      if (target) {
                        const offset = target.getBoundingClientRect().top + window.scrollY - 80;
                        window.scrollTo({ top: offset, behavior: "smooth" });
                      }
                    }, 80);
                  }}
                  className={`quick-filter-chip shrink-0 touch-manipulation ${active ? "active" : ""}`}
                >
                  {t(`home.cuisine.${c.label}`)}
                  {showCount && (
                    <span className="text-[11px] tabular-nums" style={{ opacity: 0.55 }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {resolvedHomeCategorySections.length > 0
          ? resolvedHomeCategorySections.map((section) => {
              // Locale-aware titel: falla tillbaka på svenska originalet om
              // admin inte fyllt i engelska översättningen (titleEn null/tom).
              const localizedTitle = locale === "en" && section.titleEn ? section.titleEn : section.title;
              const localizedSubtitle = locale === "en" && section.subtitleEn ? section.subtitleEn : section.subtitle;
              // Sektionen filtreras automatiskt by stad i renderFeaturedRail
              // (matchesCityFamily). Om tom efter filter returneras null →
              // sektionen försvinner från sidan utan extra logik här.
              return (
                <React.Fragment key={section.id}>
                  {renderFeaturedRail(localizedTitle, localizedSubtitle, section.restaurants)}
                </React.Fragment>
              );
            })
          : featured.length > 0
            ? renderFeaturedRail(t("home.section.hot"), t("home.section.hotSub"), featured)
            : null}

        {/* GLOBAL TOM-STATE — visas när inga restauranger alls matchar kundens
            stad (varken main-grid, rails, eller HomeCategorySections). Detta är
            "vi har inte kommit till din stad ännu"-banner. Trigger:
              - Användaren har valt adress (detectedCityName satt)
              - Men varken filtered eller någon HomeCategorySection har träffar
            Backend-data laddas ENBART när /api/restaurants returnerar nya
            data — ingen polling, ingen hammring av cities/family-by-name. */}
        {!loading && !apiError && !cityFamilyResolving && detectedCityName && filtered.length === 0 && resolvedHomeCategorySections.every((s) => s.restaurants.filter(matchesCityFamily).length === 0) && (
          <section className="mb-10">
            <div className="rounded-3xl px-6 py-10 text-center" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
              <div className="mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(240,83,28,0.1)" }}>
                <MapPin size={22} className="text-gold-500" />
              </div>
              <h3 className="text-xl sm:text-2xl font-black tracking-tight mb-2" style={{ color: "var(--text-primary)" }}>
                Vi har inte kommit till {detectedCityName} ännu
              </h3>
              <p className="text-sm font-medium max-w-md mx-auto" style={{ color: "var(--text-secondary)" }}>
                Men vi expanderar fort — kolla tillbaka snart. Tills dess kan du
                använda en annan adress för att se restauranger i en stad vi servar.
              </p>
            </div>
          </section>
        )}

        {filteredByDeal && (
          <section className="mb-10">
            <div className="flex items-center justify-between gap-4 rounded-[1.8rem] border px-5 py-4" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)" }}>
              <div>
                <p className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>{t("home.dealFilter.label")}</p>
                <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{filteredByDeal.title}</p>
              </div>
              <button onClick={() => setFilteredByDeal(null)}
                className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-full border"
                style={{ color: "var(--text-secondary)", borderColor: "var(--border-muted)" }}>
                <X size={12} /> {t("home.dealFilter.clear")}
              </button>
            </div>
          </section>
        )}





        {/* Dynamic List Section */}
        <section id="restaurant-list" className="scroll-mt-24">
          {/* Welcome/Referral deal-banner — visas bara för inloggade som har
              en aktiv WELCOME/REFERRAL-deal från backend. */}
          {isLoggedIn && <WelcomeDealBanner enabled={isLoggedIn} />}

          {/* InviteFriendsBanner borttagen — referral-systemet avstängt för launch */}

          {/* Loyalty banner — shown to guests when restaurant list has loaded */}
          {!isLoggedIn && !loading && !apiError && filtered.length > 0 && (
            <Link
              href="/profile"
              className="mb-6 px-4 py-3.5 rounded-xl flex items-center gap-3.5 transition-colors"
              style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
            >
              <div className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center" style={{ backgroundColor: "var(--gold-soft)" }}>
                <Gift size={16} strokeWidth={1.8} style={{ color: "var(--gold-ink)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>{t("home.loyalty.title")}</p>
                <p className="text-[13px] leading-snug mt-0.5" style={{ color: "var(--text-secondary)" }}>{t("home.loyalty.subtitle")}</p>
              </div>
              <ChevronRight size={16} strokeWidth={2} className="shrink-0" style={{ color: "var(--text-secondary)" }} />
            </Link>
          )}

          <div className="flex items-center justify-between mb-4 px-1">
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                {activeCuisine === "Alla" ? t("home.section.allRestaurants") : t(`home.cuisine.${activeCuisine}`)}
              </h2>
              <p className="text-[12px] font-medium mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {filtered.length} {filtered.length === 1 ? t("home.restaurantCount.one") : t("home.restaurantCount.many")}
              </p>
            </div>
          </div>

          {apiError ? (
            <div className="py-24 text-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8 border" style={{ backgroundColor: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.15)" }}>
                <X size={32} className="text-rose-500" />
              </div>
              <p className="text-[17px] font-bold tracking-tight mb-1.5" style={{ color: "var(--text-primary)" }}>{t("home.error.serverUnreachable")}</p>
              <p className="text-[13.5px] mb-6" style={{ color: "var(--text-secondary)" }}>{t("home.error.checkConnection")}</p>
              <button
                onClick={() => { setApiError(false); setLoading(true); window.location.reload(); }}
                className="px-6 h-12 bg-gold-500 rounded-xl text-[15px] font-semibold active:scale-95 transition-all"
                style={{ color: "#141416" }}
              >
                {t("home.error.reload")}
              </button>
            </div>
          ) : loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-48 rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Search} title={t("home.empty.title")} text={t("home.empty.sub")} />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4 sm:gap-5">
                {filtered.map((r, i) => {
                  const isOutOfZone = orderType === "DELIVERY" && zoneRestaurantIds !== null && !zoneRestaurantIds.includes(r.id);
                  const isClosed = r.isOpen === false;
                  const isComingSoon = r.comingSoon === true;
                  const dimmed = isComingSoon || isClosed || isOutOfZone;
                  const pausedUntilDate = r.pausedUntil ? new Date(r.pausedUntil) : null;
                  const isPaused = pausedUntilDate !== null && pausedUntilDate.getTime() > Date.now();
                  const dimReason = isComingSoon
                    ? "Kommer snart"
                    : isOutOfZone
                    ? "Utanför zon"
                    : isClosed
                      ? (isPaused
                          ? `Öppnar ${pausedUntilDate!.getHours().toString().padStart(2, "0")}:${pausedUntilDate!.getMinutes().toString().padStart(2, "0")}`
                          : (nextOpenLabel(r.openingHours) || "Stängd"))
                      : null;
                  const isFav = favorites.has(r.id);

                  const toggleFav = (e: React.MouseEvent) => {
                    e.preventDefault(); e.stopPropagation();
                    toggleFavorite(r.id);
                  };

                  return (
                    <React.Fragment key={r.id}>
                      {/* Was motion.div with staggered i*0.04 fade-in. For 30+
                          cards that's ~1.2s before the last card appears —
                          felt slow on cold-cache loads. Now: instant render
                          with a CSS active:scale tap feedback only. */}
                      <div className={`transition-all duration-200 active:scale-[0.99] ${dimmed ? "grayscale opacity-80" : ""}`}>
                        <Link
                          href={getRestaurantHref(r)}
                          onClick={(e) => handleRestaurantClick(e, r)}
                          className="group block overflow-hidden rounded-[20px] border border-[var(--line)] bg-white transition-shadow duration-200 relative swift-card-shadow"
                        >
                          {/* ── IMAGE ──────────────────────────────────────── */}
                          {/* Bigger image on mobile (was h-44 / 176px → 200px)
                              so restaurant cards feel substantial against the
                              now-smaller sponsor rail. Stable at sm+. */}
                          <div className="h-[178px] w-full overflow-hidden relative" style={{ backgroundColor: "var(--bg-deep)" }}>
                            {r.imageUrl || r.heroImageUrl ? (
                              <SmartImage src={getCardImage(r)} alt={r.name} sizes="(max-width: 768px) 260px, 25vw" className="h-full w-full object-cover" />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center">
                                <span className="text-3xl font-bold" style={{ color: "var(--text-secondary)", opacity: 0.4 }}>{r.name.slice(0, 1).toUpperCase()}</span>
                              </div>
                            )}

                            {/* Anledning till att kortet är grått (stängt / utanför
                                zon) — enkel, fin pill. Visas bara när dimmed. */}
                            {dimReason && (
                              <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm" style={{ backgroundColor: "rgba(17,17,19,0.82)", backdropFilter: "blur(6px)" }}>
                                {isComingSoon ? <Store size={11} className="text-white" /> : isOutOfZone ? <MapPin size={11} className="text-white" /> : <Clock size={11} className="text-white" />}
                                <span className="text-[10px] font-black uppercase tracking-wide text-white">{dimReason}</span>
                              </div>
                            )}

                            {/* Hjärta: top-RIGHT */}
                            <button
                              onClick={toggleFav}
                              className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 backdrop-blur-md"
                              style={{ backgroundColor: "rgba(255,255,255,0.92)", boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}
                              aria-label={isFav ? t("home.favorite.remove") : t("home.favorite.add")}
                            >
                              {isFav
                                ? <svg viewBox="0 0 24 24" fill="#FF3B30" className="w-5 h-5"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                                : <svg viewBox="0 0 24 24" fill="none" stroke="#8E8E93" strokeWidth="2.2" className="w-5 h-5"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                              }
                            </button>

                            {/* Deal-badges (BOGO/regular) — raka guldchips nere till
                                vänster (samma stil som rails), ersätter de roterade/
                                färgglada pillerna. */}
                            {(() => {
                              const badges = getBadgesForRestaurant(r.id);
                              const regularLabel = badges.regular
                                ? (badges.regular.discountPercent ? `−${badges.regular.discountPercent} %` : badges.regular.rewardLabel)
                                : "";
                              const showFeatured = r.featuredClass === 1 || r.featuredClass === 2;
                              if (!showFeatured && !badges.bogo && !regularLabel) return null;
                              return (
                                <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-1.5 max-w-[calc(100%-1.5rem)]">
                                  <FeaturedBadge featuredClass={r.featuredClass} />
                                  {badges.bogo && (
                                    <span className="bg-gold-500 text-[12px] font-semibold px-2 py-0.5 rounded-md" style={{ color: "#141416" }}>
                                      {t("home.deal.badge.bogo")}
                                    </span>
                                  )}
                                  {regularLabel && (
                                    <span className="bg-gold-500 text-[12px] font-semibold px-2 py-0.5 rounded-md" style={{ color: "#141416" }}>
                                      {regularLabel}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>

                          {/* ── CARD FOOTER (minimal: namn + rating + leveranstid) ── */}
                          <div className="px-3.5 py-3.5">
                            <div className="mb-2 flex items-start gap-2.5">
                              <div className="min-w-0 flex-1">
                                <h3 className="truncate text-[17px] font-black leading-tight tracking-normal text-[var(--ink)]">{r.name}</h3>
                                <p className="mt-0.5 truncate text-[12px] font-semibold text-[var(--muted)]">{r.cuisine?.charAt(0).toUpperCase()}{r.cuisine?.slice(1) || r.description || "Restaurang"}</p>
                              </div>
                              <span className="inline-flex h-[26px] shrink-0 items-center gap-1 rounded-full bg-[var(--ink)] px-2 text-[12px] font-black text-white">
                                <Star size={11} fill="var(--gold)" className="text-[var(--gold)]" />
                                {(r.rating ?? 4.7).toFixed(1)}
                              </span>
                            </div>
                            {(() => {
                              const zi = zoneDeliveryInfo[r.id];
                              const showEta = orderType === "DELIVERY";
                              const etaDisplay = showEta
                                ? (zi?.etaMinutes != null ? `${zi.etaMinutes} ${t("home.minutes")}` : (isOutOfZone ? "—" : `${r.etaMinutes ?? 30} ${t("home.minutes")}`))
                                : null;
                              return (
                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] font-bold text-[rgba(15,15,18,0.66)]">
                                  {etaDisplay && (
                                    <span className="flex items-center gap-1"><Clock size={12} fill="currentColor" /> {etaDisplay}</span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    {orderType === "PICKUP" ? <Store size={12} /> : <Truck size={12} />}
                                    {orderType === "PICKUP" ? "0 kr" : (zi?.deliveryFee ?? r.deliveryFee ?? 0) <= 0 ? "Gratis" : `${Math.round(zi?.deliveryFee ?? r.deliveryFee ?? 0)} kr`}
                                  </span>
                                  {r.city && (
                                    <span className="flex min-w-0 items-center gap-1"><MapPin size={12} fill="currentColor" /> <span className="truncate">{r.city}</span></span>
                                  )}
                                  {isOutOfZone && (
                                    <>
                                      <span className="opacity-40">·</span>
                                      <span className="text-rose-500/80 uppercase tracking-wider">{t("home.status.outOfZone") ?? "Levererar ej"}</span>
                                    </>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </Link>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            )}
        </section>

        {/* Info Modal Implementation */}
        <AnimatePresence>
          {infoRestaurant && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center p-6 backdrop-blur-md" onClick={() => setInfoRestaurant(null)} style={{ backgroundColor: "rgba(252,252,249,0.92)" }}>
              <motion.div initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm glass-panel p-10 rounded-[3.5rem] relative" onClick={e => e.stopPropagation()} style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)", boxShadow: "var(--card-shadow)" }}>
                <div className="w-16 h-16 bg-gold-500/10 rounded-[2rem] flex items-center justify-center mb-8 border border-gold-500/20 text-gold-500">
                    <Info size={32} />
                </div>
                <h2 className="text-2xl font-bold tracking-tight mb-2" style={{ color: "var(--text-primary)" }}>{infoRestaurant.name}</h2>
                <p className="text-[10px] font-black uppercase tracking-widest mb-10" style={{ color: "var(--text-secondary)" }}>{t("home.info.title")}</p>

                <div className="space-y-8">
                    {infoRestaurant.description && (
                      <div className="flex items-start gap-4">
                          <div className="min-w-0">
                            <div className="text-[9px] font-black uppercase tracking-[0.3em] mb-1" style={{ color: "var(--text-secondary)" }}>{t("home.info.description")}</div>
                            <p className="text-xs font-bold leading-relaxed uppercase tracking-wider italic" style={{ color: "var(--text-primary)", opacity: 0.6 }}>{infoRestaurant.description}</p>
                          </div>
                      </div>
                    )}
                    {(infoRestaurant.address || infoRestaurant.city) && (
                      <div className="flex items-start gap-4">
                        <MapPin className="mt-1" size={18} style={{ color: "var(--text-secondary)" }} />
                        <div className="min-w-0">
                          <div className="text-[9px] font-black uppercase tracking-[0.3em] mb-1" style={{ color: "var(--text-secondary)" }}>{t("home.info.findUs")}</div>
                          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{infoRestaurant.address}</div>
                          <div className="text-sm font-medium opacity-60" style={{ color: "var(--text-primary)" }}>{infoRestaurant.zip} {infoRestaurant.city}</div>
                        </div>
                      </div>
                    )}
                    {infoRestaurant.phone && (
                      <div className="flex items-start gap-4">
                        <Phone className="mt-1" size={18} style={{ color: "var(--text-secondary)" }} />
                        <div className="min-w-0">
                          <div className="text-[9px] font-black uppercase tracking-[0.3em] mb-1" style={{ color: "var(--text-secondary)" }}>{t("home.info.callUs")}</div>
                          <a href={`tel:${infoRestaurant.phone}`} className="text-lg font-black text-gold-500 hover:text-gold-400 transition-colors uppercase italic">{infoRestaurant.phone}</a>
                        </div>
                      </div>
                    )}
                </div>

                <button onClick={() => setInfoRestaurant(null)} className="absolute top-10 right-10 text-zinc-700 hover:text-white transition-colors">
                    <X size={24} />
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Promo Footer */}
        <section className="mt-12 lg:mt-20 rounded-[2rem] sm:rounded-[2.5rem] lg:rounded-[3.5rem] bg-gradient-to-r from-gold-500 to-amber-600 p-6 sm:p-10 lg:p-12 relative overflow-hidden group shadow-2xl shadow-gold-500/10">
           <div className="absolute right-[-50px] top-[-50px] w-[200px] h-[200px] bg-white/20 rounded-full blur-[80px]" />
           <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-6 sm:gap-10">
              <div className="text-center sm:text-left">
                 <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-zinc-950 tracking-tight leading-tight mb-3">{t("home.installCta.titleLine1")} <br /> {t("home.installCta.titleLine2")}</h2>
                 <p className="text-zinc-950/60 text-[10px] font-black uppercase tracking-[0.2em]">{t("home.installCta.sub")}</p>
              </div>
              <button
                onClick={() => window.dispatchEvent(new Event('trigger-pwa-install'))}
                className="shrink-0 px-8 sm:px-10 py-4 sm:py-5 bg-zinc-950 text-white rounded-2xl sm:rounded-3xl font-black uppercase tracking-[0.3em] text-[10px] shadow-2xl active:scale-95 transition-all group-hover:bg-zinc-900 border border-white/5"
              >
                {t("home.installCta.button")}
              </button>
           </div>
        </section>
      </div>

      <AddressModal isOpen={showAddressModal} onClose={() => { setShowAddressModal(false); setPendingHref(null); }} onConfirm={handleAddressConfirm} orderType={orderType} setOrderType={setOrderType} />

      {/* Closed popup handling */}
      <AnimatePresence>
        {closedRestaurant && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center p-6 backdrop-blur-md" onClick={() => setClosedRestaurant(null)} style={{ backgroundColor: "rgba(252,252,249,0.92)" }}>
             <motion.div initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm glass-panel p-10 rounded-[3.5rem] text-center border overflow-hidden" onClick={e => e.stopPropagation()} style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)", boxShadow: "var(--card-shadow)" }}>
                <div className="w-20 h-20 bg-rose-500/10 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 border border-rose-500/20 shadow-lg shadow-rose-500/10">
                   <span className="text-4xl text-rose-500 group-hover:scale-110 transition-transform">🌙</span>
                </div>
                <h3 className="text-xl font-bold tracking-tight mb-2" style={{ color: "var(--text-primary)" }}>{closedRestaurant.name}</h3>
                <p className="text-[11px] font-bold uppercase tracking-widest mb-10 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{t("home.closedModal.line1")} <br /> {t("home.closedModal.line2")}</p>
                <div className="flex flex-col gap-3">
                   <button onClick={() => { router.push(getRestaurantHref(closedRestaurant)); setClosedRestaurant(null); }} className="w-full py-5 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all">{t("home.closedModal.seeMenu")}</button>
                   <button onClick={() => setClosedRestaurant(null)} className="w-full py-5 font-black uppercase text-[10px] tracking-widest transition-colors" style={{ color: "var(--text-secondary)" }}>{t("common.close")}</button>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
