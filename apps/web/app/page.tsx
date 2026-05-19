"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";
import {
  MapPin,
  Search,
  Star,
  Clock,
  Bike,
  ChevronRight,
  Store,
  Truck,
  ArrowRight,
  X,
  Sparkles,
  Percent,
  Info,
  Phone,
  Mail,
  Sun,
  Moon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/app/providers";
import AddressModal from "@/components/AddressModal";
import AddressPullDown from "@/components/AddressPullDown";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import DealFlipCard, { type DealCardData } from "@/components/DealFlipCard";
import SponsorCard, { type SponsorData } from "@/components/SponsorCard";
import DiscountedDishesSection from "@/components/DiscountedDishesSection";
import RecentOrderCard from "@/components/RecentOrderCard";
import WelcomeDealBanner from "@/components/WelcomeDealBanner";
import InviteFriendsBanner from "@/components/InviteFriendsBanner";
import { resolveHomeCategoryRestaurants, type HomeCategorySection } from "@/lib/homeCategories";
import { getPlatformSessionStatus } from "@/lib/platformSessionClient";
import { formatQuickAddress, parseStoredAddress, rememberQuickAddress } from "@/lib/quickAddresses";
import { useCartStore } from "@/store/cartStore";
import { useFavorites } from "@/lib/favoritesStore";
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
  pausedUntil?: string | null;
  featuredClass?: number;
  tags?: string[];
  phone?: string;
  address?: string;
  zip?: string;
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
// Bilder från Unsplash CDN (200x200 cropped, q=80) — gör cuisine-railen "äkta"
// istället för plain emojis. "Alla" och "Favoriter" behåller emoji-fallback
// eftersom de inte är konkreta kök.
const cuisineFilters = [
  { label: "Alla",      emoji: "📋", image: null },
  { label: "Favoriter", emoji: "❤️", image: null },
  { label: "Pizza",     emoji: "🍕", image: "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=240&h=240&fit=crop&q=80" },
  { label: "Sushi",     emoji: "🍣", image: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=240&h=240&fit=crop&q=80" },
  { label: "Kebab",     emoji: "🥙", image: "https://images.unsplash.com/photo-1530469912745-a215c6b256ea?w=240&h=240&fit=crop&q=80" },
  { label: "Burgare",   emoji: "🍔", image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=240&h=240&fit=crop&q=80" },
  { label: "Pasta",     emoji: "🍝", image: "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=240&h=240&fit=crop&q=80" },
  { label: "Asiatiskt", emoji: "🥢", image: "https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?w=240&h=240&fit=crop&q=80" },
];

const ORDER_TYPE_KEY = "platform_order_type";
const PROMO_CARD_WIDTH = 260;
const PROMO_CARD_GAP = 12;
const PROMO_SNAP = PROMO_CARD_WIDTH + PROMO_CARD_GAP;

type PromoCardItem =
  | { id: string; kind: "deal"; deal: DealCardData }
  | { id: string; kind: "sponsor"; sponsor: SponsorData };

export default function HomePage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { t, locale } = useTranslation();
  const promoRailRef = useRef<HTMLDivElement | null>(null);
  const promoIndexRef = useRef(0);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [address, setAddress] = useState("");
  const [query, setQuery] = useState("");
  const [activeCuisine, setActiveCuisine] = useState("Alla");
  const [orderType, setOrderType] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false);
  
  const [cities, setCities] = useState<City[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [personalDeals, setPersonalDeals] = useState<any[]>([]);
  const [sponsors, setSponsors] = useState<SponsorData[]>([]);
  const [homeCategorySections, setHomeCategorySections] = useState<HomeCategorySection[]>([]);
  const [filteredByDeal, setFilteredByDeal] = useState<{ ids: string[]; title: string } | null>(null);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  // Stad-familj från kundens adress (resolvad via Google Places city-namn +
  // backend's parent-hierarki). null = ingen adress satt → visa alla. Annars
  // filtreras restauranglistan så bara restauranger i denna stad-familj syns.
  const [cityFamilyIds, setCityFamilyIds] = useState<string[] | null>(null);
  const [detectedCityName, setDetectedCityName] = useState<string | null>(null);
  // Quick-filter state
  const [quickFilter, setQuickFilter] = useState<"all" | "rated" | "fast" | "deals" | "free">("all");
  // A14 — hero override from admin CMS. null = use translations (default).
  const [heroOverride, setHeroOverride] = useState<{
    title?: string | null;
    subtitle?: string | null;
    imageUrl?: string | null;
    ctaLabel?: string | null;
    ctaUrl?: string | null;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/api/settings`);
        if (!cancelled && res.data?.hero) setHeroOverride(res.data.hero);
      } catch {
        /* fall back to translations */
      }
    })();
    return () => { cancelled = true; };
  }, []);
  // Favoriter (delad localStorage-backad store — paritet med RN)
  const { favorites, toggle: toggleFavorite } = useFavorites();
  // Tidsbaserad greeting — beräknas BARA client-side i useEffect för att
  // undvika hydration-mismatch (server-time ≠ client-time). Initial null →
  // render visar inget greeting → useEffect populerar efter mount → matchar
  // server-output.
  const [greetingHour, setGreetingHour] = useState<number | null>(null);
  useEffect(() => {
    setGreetingHour(new Date().getHours());
    // Uppdatera varje minut så det inte fastnar på "GOD MORGON" hela dagen.
    const timer = setInterval(() => setGreetingHour(new Date().getHours()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Zone filtering – IDs of restaurants that can deliver to the user's saved coords
  const [zoneRestaurantIds, setZoneRestaurantIds] = useState<string[] | null>(null);
  const [zoneError, setZoneError] = useState<string | null>(null);
  // Zone-specific delivery info per restaurant (fee öre, minOrder öre, etaMinutes, zoneName)
  const [zoneDeliveryInfo, setZoneDeliveryInfo] = useState<Record<string, {
    deliveryFee: number; minOrder: number; etaMinutes?: number | null; zoneName?: string;
  }>>({});
  const deliveryOverrides = useCartStore((s) => s.deliveryOverrides);
  const setDeliveryOverrides = useCartStore((s) => s.setDeliveryOverrides);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [closedRestaurant, setClosedRestaurant] = useState<Restaurant | null>(null);
  const [infoRestaurant, setInfoRestaurant] = useState<Restaurant | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      void getPlatformSessionStatus().then(setIsLoggedIn);
      const stored = localStorage.getItem("platform_address");
      const storedType = localStorage.getItem(ORDER_TYPE_KEY);
      if (stored) {
        const { clean } = parseStoredAddress(stored);
        setAddress(clean);
        if (clean !== stored) localStorage.setItem("platform_address", clean);
      }
      if (storedType === "PICKUP" || storedType === "DELIVERY") setOrderType(storedType as "DELIVERY" | "PICKUP");

      const storedCity = storedType === "PICKUP"
        ? localStorage.getItem("platform_pickup_city")
        : localStorage.getItem("platform_city");
      if (storedCity) {
        setDetectedCityName(storedCity);
        axios.get(`${API_URL}/api/cities/family-by-name`, { params: { name: storedCity } })
          .then((res) => {
            const familyIds: string[] = Array.isArray(res.data?.familyIds) ? res.data.familyIds : [];
            setCityFamilyIds(familyIds.length > 0 ? familyIds : null);
            if (res.data?.name) setDetectedCityName(res.data.name);
          })
          .catch(() => setCityFamilyIds(null));
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

  useEffect(() => {
    setLoading(true);
    Promise.all([
      axios.get(`${API_URL}/api/restaurants`),
      axios.get(`${API_URL}/api/cities`),
      axios.get(`${API_URL}/api/deals`),
      axios.get(`${API_URL}/api/sponsors`).catch(() => ({ data: [] })),
      axios.get(`${API_URL}/api/home-categories`).catch(() => ({ data: [] })),
      axios.get(`/api/platform/profile/deals`).catch(() => ({ data: [] })),
    ]).then(([resRest, resCities, resDeals, resSponsors, resHomeCategories, resPersonal]) => {
      const restaurantsData = Array.isArray(resRest.data) ? resRest.data : [];
      const citiesData = Array.isArray(resCities.data) ? resCities.data : [];
      const dealsData = Array.isArray(resDeals.data) ? resDeals.data : [];
      const sponsorsData = Array.isArray(resSponsors.data) ? resSponsors.data : [];
      const homeCategoryData = Array.isArray(resHomeCategories.data) ? resHomeCategories.data : [];
      const personalDealsData = Array.isArray(resPersonal.data) ? resPersonal.data : [];

      setRestaurants(restaurantsData);
      setCities(citiesData);
      setDeals(dealsData.filter((d: any) => d.isActive && d.showOnSite));
      setSponsors(sponsorsData);
      setHomeCategorySections(homeCategoryData);
      setPersonalDeals(personalDealsData);

      const initialAddress = localStorage.getItem("platform_address") || "";
      if (initialAddress && citiesData.length > 0) {
        const match = citiesData.find((c: City) => c.name?.toLowerCase() === initialAddress.toLowerCase());
        if (match) setSelectedCity(match);
      }
    }).catch((err) => {
      console.error("API Error on Home:", err);
      setApiError(true);
    })
    .finally(() => setLoading(false));
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
    try {
      const res = await axios.get(`${API_URL}/api/cities/family-by-name`, { params: { name: cityName } });
      const familyIds: string[] = Array.isArray(res.data?.familyIds) ? res.data.familyIds : [];
      setCityFamilyIds(familyIds.length > 0 ? familyIds : null);
      if (res.data?.name) setDetectedCityName(res.data.name);
    } catch {
      setCityFamilyIds(null);
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
      const storedPickupCity = typeof window !== "undefined" ? localStorage.getItem("platform_pickup_city") : null;
      if (storedPickupCity) {
        setDetectedCityName(storedPickupCity);
        resolveCityFamily(storedPickupCity);
      } else {
        setDetectedCityName(null);
        setCityFamilyIds(null);
        setShowAddressModal(true);
      }
    } else if (type === "DELIVERY") {
      const storedDeliveryCity = typeof window !== "undefined" ? localStorage.getItem("platform_city") : null;
      if (storedDeliveryCity) {
        setDetectedCityName(storedDeliveryCity);
        resolveCityFamily(storedDeliveryCity);
      } else {
        setDetectedCityName(null);
        setCityFamilyIds(null);
      }
      const storedCoords = typeof window !== "undefined" ? localStorage.getItem("platform_coords") : null;
      if (storedCoords) {
        try {
          const coords = JSON.parse(storedCoords);
          validateZone(coords.lat, coords.lng);
        } catch { /* ignore */ }
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
      setDetectedCityName(pickupCity);
      setZoneRestaurantIds(null);
      await resolveCityFamily(pickupCity);
    } else {
      saveAddress(addr);
      if (city) {
        localStorage.setItem("platform_city", city);
        await resolveCityFamily(city);
      } else {
        localStorage.removeItem("platform_city");
        setCityFamilyIds(null);
        setDetectedCityName(null);
      }
      if (coords) {
        localStorage.setItem("platform_coords", JSON.stringify(coords));
        rememberQuickAddress({ street: addr.split(",")[0].trim(), latitude: coords.lat, longitude: coords.lng, zip: postalCode, city });
        await validateZone(coords.lat, coords.lng);
      } else {
        localStorage.removeItem("platform_coords");
        setZoneRestaurantIds(null);
      }
    }

    if (pendingHref) {
      setPendingHref(null);
    }
  };

  // allDealCards must be defined before filtered (filtered uses it for the 'deals' quick-filter)
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
        rewardLabel: isBogo
          ? t("home.deal.bogo")
          : d.discountType === "PERCENTAGE"
            ? `${d.discountValue}%`
            : `${d.discountValue} ${t("common.kr")}`,
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
      if (detectedCityName) {
        return (r.city || "").toLowerCase() === detectedCityName.toLowerCase();
      }
      return false;
    }
    // Strict: vi har stad-namnet men inte hittade familyIds → visa inget
    if (detectedCityName) return false;
    if (orderType === "PICKUP") return false;
    return true;
  }, [cityFamilyIds, detectedCityName, orderType]);

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

    // Apply quick-filters
    return inZoneSorted.filter((r) => {
      if (quickFilter === "rated") return (r.rating || 0) >= 4.0;
      if (quickFilter === "fast") return (r.etaMinutes || 999) < 30;
      if (quickFilter === "deals") return allDealCards.some(d => d.relatedRestaurantIds?.includes(r.id));
      // "Free" baseras på ZON-fee, inte restaurang-default. Out-of-zone restauranger
      // exkluderas eftersom vi inte kan veta om deras zon-fee är 0.
      if (quickFilter === "free") {
        const zi = zoneDeliveryInfo[r.id];
        return zi != null && zi.deliveryFee === 0;
      }
      return true;
    });
  }, [restaurants, activeCuisine, query, orderType, zoneRestaurantIds, zoneDeliveryInfo, filteredByDeal, quickFilter, allDealCards, favorites, matchesCityFamily]);

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
          zoneRestaurantIds,
        }),
      }))
      .filter((section) => section.restaurants.length > 0);
  }, [homeCategorySections, restaurants, deals, deliveryOverrides, orderType, detectedCityName, zoneRestaurantIds]);

  const promoCards = useMemo<PromoCardItem[]>(() => {
    return sponsors.map((sponsor) => ({ id: `sponsor-${sponsor.id}`, kind: "sponsor" as const, sponsor }));
  }, [sponsors]);

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
    promoIndexRef.current = Math.max(
      0,
      Math.min(Math.round(rail.scrollLeft / PROMO_SNAP), Math.max(promoCards.length - 1, 0))
    );
  }, [promoCards.length]);

  useEffect(() => {
    promoIndexRef.current = 0;
    if (promoCards.length <= 1) return;

    const interval = window.setInterval(() => {
      const rail = promoRailRef.current;
      if (!rail) return;

      const nextIndex = (promoIndexRef.current + 1) % promoCards.length;
      promoIndexRef.current = nextIndex;
      rail.scrollTo({ left: nextIndex * PROMO_SNAP, behavior: "smooth" });
    }, 4000);

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
          <h2 className="text-gold-gradient text-lg sm:text-xl font-black tracking-tight leading-[1.05] italic uppercase truncate">{title}</h2>
          {!!subtitle && <p className="text-zinc-500 text-[9px] font-bold uppercase tracking-wider mt-0.5 truncate">{subtitle}</p>}
        </div>
        <Link href="/search" className="text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-gold-500 transition-all shrink-0 ml-3">{t("home.viewAll")}</Link>
      </div>
      {/* Mobil: horisontell scroll • md+: 2-kolumn grid • lg+: 3-kolumn • xl+: 4-kolumn */}
      <div className="flex md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 overflow-x-auto md:overflow-visible pb-1 md:pb-0 no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
        {sortedSection.map((r, i) => {
          const inZone = orderType !== "DELIVERY" || zoneRestaurantIds === null || zoneRestaurantIds.includes(r.id);
          const dimmed = r.isOpen === false || !inZone;
          return (
            <motion.div
              key={`${title}-${r.id}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, type: "spring", stiffness: 300, damping: 25 }}
              whileTap={{ opacity: 0.7, scale: 0.99 }}
              className={`transition-opacity duration-300 shrink-0 md:shrink w-[200px] sm:w-[230px] md:w-auto ${dimmed ? "opacity-75 grayscale-[20%]" : ""}`}
            >
              <Link
                href={getRestaurantHref(r)}
                onClick={(e) => handleRestaurantClick(e, r)}
                className="group relative block h-full rounded-2xl p-2 flex flex-col overflow-hidden border transition-all hover:shadow-md"
                style={{ backgroundColor: "var(--bg-secondary)", borderColor: "rgba(28,28,30,0.08)" }}
              >
                {(() => {
                  const badges = getBadgesForRestaurant(r.id);
                  return (
                    <>
                      {badges.bogo && (
                        <div className="absolute top-8 -left-7 -rotate-45 bg-emerald-500 text-zinc-950 px-9 py-1.5 shadow-2xl z-20">
                          <p className="text-[7px] font-black uppercase tracking-widest text-center">{t("home.deal.bogo")}</p>
                        </div>
                      )}
                      {badges.regular && (
                        <div className={`absolute ${badges.bogo ? "top-16 -left-7" : "top-8 -left-7"} -rotate-45 ${badges.regular.tone === "purple" ? "bg-purple-500" : badges.regular.tone === "orange" ? "bg-orange-500" : "bg-gold-500"} text-zinc-950 px-9 py-1.5 shadow-2xl z-20`}>
                          <p className="text-[7px] font-black uppercase tracking-widest text-center">{badges.regular.rewardLabel}</p>
                        </div>
                      )}
                    </>
                  );
                })()}
                <div className="h-28 sm:h-32 md:h-36 lg:h-40 w-full rounded-xl sm:rounded-2xl bg-zinc-100 relative overflow-hidden mb-2.5">
                  {r.heroImageUrl || r.imageUrl ? (
                    <img src={getCardImage(r)} alt={r.name} loading="lazy" decoding="async" className="h-full w-full object-cover transition-all duration-700 group-hover:scale-110 group-hover:rotate-1" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-4xl" style={{ backgroundColor: "var(--bg-deep)" }}>🍴</div>
                  )}

                  <div className="absolute top-3 right-3 flex flex-col gap-2 items-end z-10">
                    {(() => {
                      const pausedUntil = r.pausedUntil ? new Date(r.pausedUntil) : null;
                      const isPaused = pausedUntil !== null && pausedUntil.getTime() > Date.now();
                      const open = r.isOpen !== false && !isPaused;
                      const cls = isPaused
                        ? "bg-amber-400/30 border-amber-400/40 text-amber-100"
                        : open
                          ? "bg-emerald-500/30 border-emerald-500/30 text-emerald-100"
                          : "bg-rose-500/30 border-rose-500/30 text-rose-100";
                      const dot = isPaused ? "bg-amber-300 animate-pulse" : open ? "bg-emerald-400 animate-pulse" : "bg-rose-400";
                      const label = isPaused
                        ? t("home.status.pausedUntil", { time: `${pausedUntil!.getHours().toString().padStart(2, "0")}:${pausedUntil!.getMinutes().toString().padStart(2, "0")}` })
                        : open ? t("home.restaurantOpen") : t("home.restaurantClosed");
                      return (
                        <div className={`px-3 py-1 rounded-full backdrop-blur-md border flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest ${cls}`}>
                          <div className={`w-1 h-1 rounded-full ${dot}`} />
                          {label}
                        </div>
                      );
                    })()}
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setInfoRestaurant(r); }}
                      aria-label={t("home.aria.infoAbout", { name: r.name })}
                      className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-zinc-100 border border-white/10 hover:bg-gold-500 hover:text-zinc-950 transition-all shadow-xl"
                    >
                      <Info size={14} />
                    </button>
                    <div className="px-2.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md flex items-center gap-1 border border-white/10">
                      {r.rating ? (
                        <>
                          <Star size={11} className="fill-gold-500 text-gold-500" />
                          <span className="text-[10px] font-black italic text-zinc-100">{r.rating.toFixed(1)}</span>
                        </>
                      ) : (
                        <span className="text-[10px] font-black italic text-emerald-400">{t("home.badge.new")}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="px-1.5 pb-1.5">
                  <h3 className="text-sm sm:text-base font-black group-hover:text-gold-500 transition-colors uppercase tracking-tight leading-tight mb-1 truncate" style={{ color: "var(--text-primary)" }}>{r.name}</h3>
                  <p className="text-[9px] font-bold uppercase tracking-wider mb-2 truncate" style={{ color: "var(--text-secondary)" }}>{r.description || r.cuisine}</p>

                  <div className="flex items-center justify-between border-t pt-2" style={{ borderColor: "var(--border-muted)" }}>
                    {orderType === "DELIVERY" && (() => {
                      const zi = zoneDeliveryInfo[r.id];
                      const outOfZone = zoneRestaurantIds !== null && !zoneRestaurantIds.includes(r.id);
                      if (outOfZone || !zi) {
                        return (
                          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-rose-500/80">
                            <Bike size={11} className="text-rose-500/60" />
                            <span>{t("home.status.outOfZone") ?? "Levererar ej"}</span>
                          </div>
                        );
                      }
                      const eta = zi.etaMinutes ?? r.etaMinutes ?? 30;
                      return (
                        <div className="flex items-center gap-3 text-[9px] font-black uppercase tracking-wider text-zinc-400">
                          <span className="flex items-center gap-1"><Clock size={11} className="text-gold-500/50" /> {eta} {t("home.minutesShort")}</span>
                          <span className="flex items-center gap-1"><Bike size={11} className="text-gold-500/50" /> {zi.deliveryFee === 0 ? t("home.feeFreeShort") : `${zi.deliveryFee} ${t("home.feeUnitShort")}`}</span>
                        </div>
                      );
                    })()}
                    <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 group-hover:bg-gold-500 group-hover:text-zinc-950 transition-all">
                      <ChevronRight size={16} />
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
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
    if (r.isOpen === false || isPaused) {
      setClosedRestaurant(r);
      return;
    }
    router.push(getRestaurantHref(r));
  };



  return (
    <div className="min-h-screen pb-36 pt-[max(1rem,env(safe-area-inset-top,0px))] md:pt-20" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <div className="relative mx-auto max-w-7xl 2xl:max-w-[1600px] px-4 sm:px-6 lg:px-10 xl:px-16">
        {/* DESKTOP COMPACT HERO — only md+ — bakgrund + stor titel + tagline */}
        <section
          className="hidden md:block relative overflow-hidden rounded-3xl mb-8 mt-2"
          style={{
            background: "linear-gradient(135deg, rgba(212,167,74,0.18) 0%, rgba(212,167,74,0.04) 50%, transparent 100%)",
            border: "1px solid rgba(212,167,74,0.18)",
          }}
        >
          {/* Radial glow */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: "radial-gradient(circle at 80% 30%, rgba(212,167,74,0.25) 0%, transparent 55%)",
          }} />
          {/* Grid bakgrund */}
          <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.04) 1px,transparent 1px)",
            backgroundSize: "48px 48px",
          }} />

          <div className="relative grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8 px-10 py-12 lg:py-14 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border mb-5" style={{ borderColor: "rgba(212,167,74,0.3)", backgroundColor: "rgba(212,167,74,0.08)" }}>
                <Sparkles size={11} className="text-gold-500" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-500">{t("home.heroDesktop.eyebrow")}</span>
              </div>
              <h1 className="text-5xl lg:text-6xl xl:text-7xl font-black italic tracking-tighter leading-[0.95] mb-3" style={{ color: "var(--text-primary)" }}>
                {heroOverride?.title || t("home.heroDesktop.titleLine1")}<br />
                <span className="text-gold-500">{heroOverride?.subtitle || t("home.heroDesktop.titleLine2")}</span>
              </h1>
              <p className="text-sm lg:text-base font-bold mt-4 max-w-md" style={{ color: "var(--text-secondary)" }}>
                {t("home.heroDesktop.subtitle")}
              </p>
              {heroOverride?.ctaLabel && heroOverride?.ctaUrl ? (
                <Link
                  href={heroOverride.ctaUrl}
                  className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest bg-gold-500 text-black hover:opacity-90 transition-opacity"
                >
                  {heroOverride.ctaLabel}
                </Link>
              ) : null}
              <div className="flex items-center gap-3 mt-6 flex-wrap">
                {[t("home.heroDesktop.badge.fast"), t("home.heroDesktop.badge.secure"), t("home.heroDesktop.badge.local")].map((b) => (
                  <div key={b} className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-gold-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>{b}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="hidden lg:flex items-center justify-center relative">
              <div className="absolute inset-0 rounded-full" style={{
                background: "radial-gradient(circle, rgba(212,167,74,0.2) 0%, transparent 60%)",
              }} />
              {heroOverride?.imageUrl ? (
                <img
                  src={heroOverride.imageUrl}
                  alt=""
                  className="relative max-h-[260px] xl:max-h-[300px] w-auto object-contain drop-shadow-2xl"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="relative text-[180px] xl:text-[220px] font-black italic tracking-tighter leading-[1.15] opacity-90 text-gold-500 select-none">
                  🍕
                </div>
              )}
            </div>
          </div>
        </section>

        {/* HEADER */}
        <header className="mb-6 sm:mb-8 relative">
          {/* Mobil-titel — på desktop ersätts den av compact hero ovan.
              Mobile-hero har subtle gold-gradient + tidsbaserad greeting +
              restaurant-count så hela kortet känns "alive" istället för bara
              en titel. Logik orörd — bara visuell wrapper. */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 md:hidden relative overflow-hidden rounded-3xl px-5 py-5"
            style={{
              // Bas-bakgrund från tema-variabel så dark/light båda får solid bg.
              // Gold-gradient läggs ovanpå som overlay via :before-pseudo-effekt
              // (vi använder inline-element istället eftersom inline style inte
              // stödjer pseudo).
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid rgba(212,167,74,0.25)",
            }}
          >
            {/* Gold-gradient overlay — täcker hela kortet med låg opacitet */}
            <div className="absolute inset-0 pointer-events-none" style={{
              background: "linear-gradient(135deg, rgba(212,167,74,0.16) 0%, rgba(212,167,74,0.04) 65%, transparent 100%)",
            }} />
            {/* Subtle radial glow uppe i högra hörnet */}
            <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full pointer-events-none" style={{
              background: "radial-gradient(circle, rgba(212,167,74,0.22) 0%, transparent 60%)",
            }} />

            {/* Tidsbaserad greeting — använder greetingHour-state som bara
                sätts client-side efter mount → ingen hydration-mismatch. */}
            {greetingHour !== null && (() => {
              const hour = greetingHour;
              const greeting =
                hour < 5 ? t("home.greeting.night") :
                hour < 11 ? t("home.greeting.morning") :
                hour < 17 ? t("home.greeting.day") :
                hour < 22 ? t("home.greeting.evening") :
                t("home.greeting.night");
              const openCount = restaurants.filter((r) => r.isOpen !== false).length;
              return (
                <div className="flex items-center gap-2 mb-3 relative z-10">
                  <div className="w-1.5 h-1.5 rounded-full bg-gold-500 shadow-[0_0_8px_rgba(212,167,74,0.8)]" />
                  <p className="text-[9px] font-black uppercase tracking-[0.25em]" style={{ color: "var(--text-secondary)" }}>
                    {greeting}
                    {openCount > 0 && (
                      <span className="text-gold-500"> · {t("home.openCount", { count: openCount })}</span>
                    )}
                  </p>
                </div>
              );
            })()}

            <div className="relative z-10 flex items-start justify-between gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight leading-tight min-w-0 flex-1" style={{ color: "var(--text-primary)" }}>
                {t("home.heroMobile.titleLead")} <span className="text-gold-500 italic">{t("home.heroMobile.titleAccent")}</span>
              </h1>
              {/* Mobil-action-cluster: språk + kontakta + theme bredvid rubriken.
                  Knapparna är 9×9 (36×36) för att 3 st + titel ska få plats på
                  smala telefoner (390px) utan att hamna utanför overflow:hidden. */}
              <div className="shrink-0 flex items-center gap-1">
                <div style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)" }} className="rounded-xl">
                  <LocaleSwitcher buttonClassName="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90" iconSize={15} />
                </div>
                <Link
                  href="/contact"
                  aria-label={t("nav.contact")}
                  className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90"
                  style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)" }}
                >
                  <Mail size={15} className="text-gold-600" />
                </Link>
                <button
                  onClick={toggleTheme}
                  aria-label={theme === "dark" ? t("nav.theme.toLight") : t("nav.theme.toDark")}
                  className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90"
                  style={{
                    backgroundColor: "var(--bg-deep)",
                    border: "1px solid var(--border-muted)",
                  }}
                >
                  {theme === "dark" ? (
                    <Sun size={15} className="text-gold-500" />
                  ) : (
                    <Moon size={15} className="text-gold-600" />
                  )}
                </button>
              </div>
            </div>
            <p className="relative z-10 text-[10px] font-bold uppercase tracking-[0.2em] mt-1.5" style={{ color: "var(--text-secondary)" }}>
              {t("home.heroMobile.subtitle")}
            </p>
          </motion.div>

          {/* Senaste beställning — visas bara om kund har order-historik
              (inloggad ELLER gäst). Conversion-CTA "fortsätt där du var". */}
          <RecentOrderCard />

          {/* Adress + Toggle + Sök — pancake på mobil, en rad på desktop */}
          <div className="grid gap-3 lg:grid-cols-[1.4fr_auto_1fr] lg:items-center lg:gap-4">
            <AddressPullDown
              currentAddress={address}
              zoneStatus={orderType === "DELIVERY" ? (zoneError ? "error" : (typeof window !== "undefined" && localStorage.getItem("platform_coords")) ? "ok" : null) : null}
              onOpenFull={() => setShowAddressModal(true)}
              orderType={orderType}
              cityName={detectedCityName}
              onSelect={(a) => {
                // BUG-FIX: snabbväljaren triggade inte handleAddressConfirm tidigare
                // → cityFamilyIds + detectedCityName hängde kvar från förra adressen
                // → filter visade fel restauranger när användaren bytte adress via
                // snabbväljaren istället för full address-modal. Nu kallar vi samma
                // funktion som modalen så stad-state alltid uppdateras konsekvent.
                const full = formatQuickAddress(a);
                handleAddressConfirm(
                  full,
                  orderType,
                  a.latitude != null && a.longitude != null
                    ? { lat: a.latitude, lng: a.longitude }
                    : undefined,
                  a.zip,
                  a.city,
                );
              }}
            />

            {/* Leverans/Hämtning-toggle */}
            <div className="relative p-1 glass-panel rounded-2xl flex items-center shadow-sm lg:w-[280px]">
              <div
                className="absolute inset-y-1 bg-gold-500 rounded-xl transition-all duration-300 shadow-lg"
                style={{ width: 'calc(50% - 4px)', left: orderType === 'DELIVERY' ? '4px' : 'calc(50%)' }}
              />
              <button
                onClick={() => toggleOrderType("DELIVERY")}
                className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors ${orderType === 'DELIVERY' ? 'text-zinc-950' : 'text-zinc-500'}`}
              >
                <Truck size={15} /> {t("cart.deliveryType.delivery")}
              </button>
              <button
                onClick={() => toggleOrderType("PICKUP")}
                className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors ${orderType === 'PICKUP' ? 'text-zinc-950' : 'text-zinc-500'}`}
              >
                <Store size={15} /> {t("cart.deliveryType.pickup")}
              </button>
            </div>

            {/* Sökfält */}
            <Link
              href="/search"
              className="flex items-center gap-2 rounded-2xl px-4 py-3 border hover:border-gold-500/50 transition-all group shadow-sm"
              style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-muted)" }}
            >
              <Search size={14} className="shrink-0" style={{ color: "var(--text-secondary)" }} />
              <span className="text-[11px] font-bold flex-1 truncate" style={{ color: "var(--text-secondary)" }}>
                {t("home.searchCta")}
              </span>
              <div className="w-7 h-7 rounded-full bg-gold-500 flex items-center justify-center text-zinc-950 group-hover:rotate-12 transition-all shrink-0">
                <ArrowRight size={14} />
              </div>
            </Link>
          </div>
        </header>

        {/* Cuisine Selector */}
        <section className="mb-6 sm:mb-8">
          <div className="flex sm:justify-start gap-2 sm:gap-3 overflow-x-auto lg:flex-wrap lg:overflow-visible pb-2 no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
            {cuisineFilters.map((c, i) => (
              <motion.button
                key={c.label}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.05 + i * 0.04 }}
                onClick={() => {
                  setActiveCuisine(c.label);
                  // Smooth-scroll till restaurang-listan så användaren ser
                  // resultatet direkt utan att scrolla manuellt
                  setTimeout(() => {
                    const target = document.getElementById("restaurant-list");
                    if (target) {
                      const offset = target.getBoundingClientRect().top + window.scrollY - 80;
                      window.scrollTo({ top: offset, behavior: "smooth" });
                    }
                  }, 80);
                }}
                className="flex flex-col items-center gap-1.5 transition-all active:scale-95 flex-shrink-0 group touch-manipulation"
              >
                <div className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-[1.5rem] overflow-hidden transition-all ${
                  activeCuisine === c.label
                    ? "ring-2 ring-gold-500 shadow-[0_6px_18px_rgba(234,181,69,0.3)]"
                    : "ring-1 ring-[rgba(28,28,30,0.08)] group-hover:ring-gold-500/30"
                }`} style={{ backgroundColor: c.image ? "var(--bg-deep)" : "var(--bg-card)", boxShadow: activeCuisine === c.label ? undefined : "var(--card-shadow)" }}>
                  {c.image ? (
                    <img
                      src={c.image}
                      alt={c.label}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                  ) : (
                    <div className={`w-full h-full flex items-center justify-center text-2xl sm:text-3xl ${activeCuisine === c.label ? "bg-gold-500" : ""}`}>
                      <span className={`${activeCuisine === c.label ? "" : "opacity-90 group-hover:opacity-100"} transition-all`}>{c.emoji}</span>
                    </div>
                  )}
                </div>
                <span className={`text-[10px] sm:text-[10.5px] font-bold uppercase tracking-wider ${
                  activeCuisine === c.label ? "text-gold-500" : "group-hover:text-gold-400"
                }`} style={{ color: activeCuisine === c.label ? undefined : "var(--text-secondary)" }}>
                  {t(`home.cuisine.${c.label}`)}
                </span>
              </motion.button>
            ))}
          </div>
        </section>

        {/*
          Aktuellt + Rea & Rabatter:
          - Mobil/tablet: stacked (Aktuellt först, Rea & Rabatter under)
          - Desktop (lg+): 2-kolumn grid – Aktuellt (sponsor cards horisontell scroll, ~4 synliga)
            tar huvudbredden, Rea & Rabatter är vertikal sidebar till höger.
          Sponsor-korten behåller sin storlek (260px) — fler syns bara för att containern är bredare.
        */}
        <div className="mb-8 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_420px] lg:gap-6 xl:gap-8 lg:items-start">
          {promoCards.length > 0 ? (
            <section className="mb-6 lg:mb-0">
              <div className="flex items-center justify-between mb-3 px-1">
                <div>
                  <h2 className="text-base sm:text-lg font-black uppercase tracking-tight flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                    <Sparkles size={14} className="text-gold-500" /> {t("home.section.current")}
                  </h2>
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    {t("home.section.currentSub")}
                  </p>
                </div>
              </div>
              <div
                ref={promoRailRef}
                onScroll={handlePromoScroll}
                className="flex gap-3 overflow-x-auto pb-3 no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0"
                style={{ scrollSnapType: "x mandatory" }}
              >
                {promoCards.map((item) => (
                  <div key={item.id} style={{ scrollSnapAlign: "start" }}>
                    <SponsorCard sponsor={(item as any).sponsor} />
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <div className="hidden lg:block" />
          )}

          {/* REA & RABATTER — horisontell rail på mobil/tablet, vertikal sidebar på lg+ */}
          <DiscountedDishesSection variant="responsive" />
        </div>

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
        {!loading && detectedCityName && filtered.length === 0 && resolvedHomeCategorySections.every((s) => s.restaurants.filter(matchesCityFamily).length === 0) && (
          <section className="mb-10">
            <div className="rounded-3xl px-6 py-10 text-center" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
              <div className="mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(231,178,75,0.1)" }}>
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
                <p className="text-[9px] font-black uppercase tracking-[0.25em]" style={{ color: "var(--text-secondary)" }}>{t("home.dealFilter.label")}</p>
                <p className="text-sm font-black uppercase" style={{ color: "var(--text-primary)" }}>{filteredByDeal.title}</p>
              </div>
              <button onClick={() => setFilteredByDeal(null)}
                className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl border"
                style={{ color: "#B8AA95", borderColor: "rgba(255,248,234,0.10)" }}>
                <X size={11} /> {t("home.dealFilter.clear")}
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
            <div className="mb-6 p-4 rounded-[1.5rem] border border-gold-500/15 bg-gold-500/5 flex items-center gap-4">
              <div className="w-9 h-9 shrink-0 bg-gold-500/10 rounded-xl border border-gold-500/20 flex items-center justify-center text-lg">🎁</div>
              <p className="text-[11px] font-bold leading-snug flex-1" style={{ color: "var(--text-secondary)" }}>
                <span className="text-gold-500 font-black">{t("home.loyalty.headline")}</span> {t("home.loyalty.sub")}{" "}
                <a href="/profile" className="text-gold-400 underline font-black hover:text-gold-300">{t("home.loyalty.cta")}</a>
              </p>
            </div>
          )}

          <div className="flex items-center justify-between mb-4 px-1">
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-[0.12em] uppercase" style={{ color: "var(--text-primary)" }}>
                {activeCuisine === "Alla" ? t("home.section.allRestaurants") : t(`home.cuisine.${activeCuisine}`)}
              </h2>
              <p className="text-[9px] font-bold uppercase tracking-widest mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {filtered.length} {filtered.length === 1 ? t("home.restaurantCount.one") : t("home.restaurantCount.many")}
              </p>
            </div>
          </div>

          {/* QUICK-FILTERS */}
          <div className="flex gap-2 overflow-x-auto lg:flex-wrap lg:overflow-visible pb-3 no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 mb-5">
            {([
              { key: "all",   labelKey: "home.quickFilter.all",    icon: "📊" },
              { key: "rated", labelKey: "home.quickFilter.rated",  icon: "★" },
              { key: "fast",  labelKey: "home.quickFilter.fast",   icon: "⚡" },
              { key: "deals", labelKey: "home.quickFilter.deals",  icon: "🎫" },
              { key: "free",  labelKey: "home.quickFilter.free",   icon: "🚲" },
            ] as const).map((qf) => (
              <button
                key={qf.key}
                onClick={() => setQuickFilter(qf.key)}
                className={`quick-filter-chip ${quickFilter === qf.key ? 'active' : ''}`}
              >
                <span>{qf.icon}</span>
                <span>{t(qf.labelKey)}</span>
              </button>
            ))}
          </div>

          {apiError ? (
            <div className="py-24 text-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8 border" style={{ backgroundColor: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.15)" }}>
                <X size={32} className="text-rose-500" />
              </div>
              <p className="text-2xl font-black uppercase tracking-tight mb-2" style={{ color: "var(--text-primary)" }}>{t("home.error.serverUnreachable")}</p>
              <p className="text-[10px] font-black uppercase tracking-widest mb-6" style={{ color: "var(--text-secondary)" }}>{t("home.error.checkConnection")}</p>
              <button
                onClick={() => { setApiError(false); setLoading(true); window.location.reload(); }}
                className="px-8 py-4 bg-gold-500 text-zinc-950 rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all"
              >
                {t("home.error.reload")}
              </button>
            </div>
          ) : loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-48 rounded-[2rem]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-24 text-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8 border" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)" }}>
                <Search size={32} style={{ color: "var(--text-secondary)" }} />
              </div>
              <p className="text-2xl font-black uppercase tracking-tight mb-2" style={{ color: "var(--text-primary)" }}>{t("home.empty.title")}</p>
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>{t("home.empty.sub")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5">
                {filtered.map((r, i) => {
                  const isOutOfZone = orderType === "DELIVERY" && zoneRestaurantIds !== null && !zoneRestaurantIds.includes(r.id);
                  const isClosed = r.isOpen === false;
                  const dimmed = isClosed || isOutOfZone;
                  const injectDeal = (allDealCards.length > 0 && (i + 1) % 4 === 0) ? allDealCards[Math.floor(i / 4) % allDealCards.length] : null;
                  const isFav = favorites.has(r.id);

                  const toggleFav = (e: React.MouseEvent) => {
                    e.preventDefault(); e.stopPropagation();
                    toggleFavorite(r.id);
                  };

                  return (
                    <React.Fragment key={r.id}>
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04, type: "spring", stiffness: 300, damping: 25 }}
                        whileTap={{ scale: 0.99 }}
                        className={`transition-opacity duration-300 ${dimmed ? "opacity-70" : ""}`}
                      >
                        <Link
                          href={getRestaurantHref(r)}
                          onClick={(e) => handleRestaurantClick(e, r)}
                          className="group block rounded-2xl overflow-hidden hover:shadow-[0_10px_30px_rgba(28,28,30,0.08)] transition-all relative"
                          style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid rgba(28,28,30,0.08)", boxShadow: "0 4px 14px rgba(28,28,30,0.04)" }}
                        >
                          {/* ── IMAGE ──────────────────────────────────────── */}
                          <div className="h-44 sm:h-52 w-full overflow-hidden relative" style={{ backgroundColor: "var(--bg-deep)" }}>
                            {r.imageUrl || r.heroImageUrl ? (
                              <img src={getCardImage(r)} alt={r.name} loading="lazy" decoding="async" className="h-full w-full object-cover group-hover:scale-105 transition-all duration-700" />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-4xl">🍱</div>
                            )}

                            {/* Status-pill: top-LEFT (matchar inspirations-bilden) */}
                            {(() => {
                              const pausedUntil = r.pausedUntil ? new Date(r.pausedUntil) : null;
                              const isPaused = pausedUntil !== null && pausedUntil.getTime() > Date.now();
                              const open = r.isOpen !== false && !isPaused;
                              const bg = isOutOfZone
                                ? "bg-zinc-700/95 text-white"
                                : isPaused
                                  ? "bg-amber-500/95 text-zinc-950"
                                  : open
                                    ? "bg-emerald-500/95 text-white"
                                    : "bg-rose-500/95 text-white";
                              const label = isOutOfZone
                                ? t("home.status.outOfZone")
                                : isPaused
                                  ? t("home.status.pausedUntil", { time: `${pausedUntil!.getHours().toString().padStart(2, "0")}:${pausedUntil!.getMinutes().toString().padStart(2, "0")}` })
                                  : open ? t("home.restaurantOpen") : t("home.restaurantClosed");
                              return (
                                <div className={`absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full backdrop-blur-md flex items-center gap-1.5 shadow-md ${bg}`}>
                                  <div className={`w-1.5 h-1.5 rounded-full bg-white ${open && !isPaused ? "animate-pulse" : ""}`} />
                                  <span className="text-[10px] font-black uppercase tracking-wider">{label}</span>
                                </div>
                              );
                            })()}

                            {/* Hjärta: top-RIGHT (matchar inspirations-bilden) */}
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

                            {/* Deal-badges (BOGO/regular) — bottom-left på bilden så de inte
                                kolliderar med status/heart. Behålls för att inte ta bort funktion. */}
                            {(() => {
                              const badges = getBadgesForRestaurant(r.id);
                              if (!badges.bogo && !badges.regular) return null;
                              return (
                                <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-1.5 max-w-[calc(100%-1.5rem)]">
                                  {badges.bogo && (
                                    <div className="bg-emerald-500 text-zinc-950 px-2.5 py-1 rounded-full shadow-md">
                                      <p className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1"><Sparkles size={10}/> {t("home.deal.bogo")}</p>
                                    </div>
                                  )}
                                  {badges.regular && (
                                    <div className={`${badges.regular.tone === "purple" ? "bg-purple-500" : badges.regular.tone === "orange" ? "bg-orange-500" : "bg-gold-500"} text-zinc-950 px-2.5 py-1 rounded-full shadow-md`}>
                                      <p className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1"><Sparkles size={10}/> {badges.regular.rewardLabel}</p>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>

                          {/* ── CARD FOOTER ────────────────────────────────── */}
                          <div className="px-4 py-3.5">
                            {/* Rad 1: Namn (stort) + info-knapp till höger */}
                            <div className="flex items-start justify-between gap-2 mb-0.5">
                              <h3 className="text-base sm:text-lg font-black uppercase italic tracking-tight leading-tight truncate flex-1 group-hover:text-gold-600 transition-colors" style={{ color: "var(--text-primary)" }}>{r.name}</h3>
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setInfoRestaurant(r); }}
                                className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:bg-gold-500/10 hover:text-gold-600 shrink-0 -mt-0.5"
                                style={{ color: "var(--text-secondary)" }}
                                aria-label={t("home.info") ?? "Info"}
                              >
                                <Info size={14} />
                              </button>
                            </div>
                            {/* Rad 2: Kategori (subtil) */}
                            <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>{r.cuisine || r.description || t("home.restaurantFallback")}</p>
                            {(() => {
                              const zi = zoneDeliveryInfo[r.id];
                              const showEta = orderType === "DELIVERY";
                              const etaDisplay = showEta
                                ? (zi?.etaMinutes != null ? `${zi.etaMinutes} ${t("home.minutes")}` : (isOutOfZone ? "—" : `${r.etaMinutes ?? 30} ${t("home.minutes")}`))
                                : null;
                              return (
                                <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                                  <span className="flex items-center gap-1">
                                    <Star size={13} className="fill-gold-500 text-gold-500" />
                                    <span className="font-black" style={{ color: "var(--text-primary)" }}>{(r.rating ?? 4.5).toFixed(1)}</span>
                                    {r.ratingCount != null && r.ratingCount > 0 && (
                                      <span className="opacity-60">({r.ratingCount})</span>
                                    )}
                                  </span>
                                  {etaDisplay && (
                                    <>
                                      <span className="opacity-40">·</span>
                                      <span>{etaDisplay}</span>
                                    </>
                                  )}
                                </div>
                              );
                            })()}
                            {orderType === "DELIVERY" && (() => {
                              const zi = zoneDeliveryInfo[r.id];
                              if (isOutOfZone || !zi) {
                                return (
                                  <div className="mt-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-rose-500/80">
                                    <Bike size={13} className="text-rose-500/60" strokeWidth={2.2} />
                                    <span>{t("home.status.outOfZone") ?? "Utanför leveranszon"}</span>
                                  </div>
                                );
                              }
                              const fee = zi.deliveryFee;
                              return (
                                <div className="mt-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider">
                                  <Bike size={13} className={fee === 0 ? "text-emerald-600" : "text-gold-500/70"} strokeWidth={2.2} />
                                  {fee === 0
                                    ? <span className="text-emerald-600">{t("home.freeDelivery")}</span>
                                    : <span style={{ color: "var(--text-secondary)" }}>{fee} {t("common.kr")}</span>}
                                </div>
                              );
                            })()}
                          </div>
                        </Link>
                      </motion.div>

                      {/* Inline Deal Injection */}
                      {injectDeal && (
                        <div className="flex items-center justify-center w-full" style={{ padding: "0 10px" }}>
                          <DealFlipCard deal={injectDeal} />
                        </div>
                      )}
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
                <h2 className="text-3xl font-black uppercase italic mb-2" style={{ color: "var(--text-primary)" }}>{infoRestaurant.name}</h2>
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
                          <div className="text-sm font-black italic uppercase" style={{ color: "var(--text-primary)" }}>{infoRestaurant.address}</div>
                          <div className="text-sm font-black italic uppercase opacity-40" style={{ color: "var(--text-primary)" }}>{infoRestaurant.zip} {infoRestaurant.city}</div>
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
                 <h2 className="text-2xl sm:text-3xl lg:text-5xl font-black text-zinc-950 uppercase tracking-tighter leading-[1.15] mb-3 italic">{t("home.installCta.titleLine1")} <br /> {t("home.installCta.titleLine2")}</h2>
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
                <h3 className="text-2xl font-black uppercase tracking-tight italic mb-2" style={{ color: "var(--text-primary)" }}>{closedRestaurant.name}</h3>
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
