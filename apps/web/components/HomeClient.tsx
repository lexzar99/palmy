"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import SmartImage from "@/components/SmartImage";
import { readHomeCache, writeHomeCache } from "@/lib/homeCache";
import axios from "axios";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";
import {
  MapPin,
  Search,
  Star,
  Clock,
  Store,
  Truck,
  ArrowRight,
  X,
  Sparkles,
  Info,
  Phone,
  Gift,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import AddressModal from "@/components/AddressModal";
import AddressPullDown from "@/components/AddressPullDown";
import DealFlipCard, { type DealCardData } from "@/components/DealFlipCard";
import SponsorCard, { type SponsorData } from "@/components/SponsorCard";
import DpointsHomeCard from "@/components/DpointsHomeCard";
import type { SponsorCardData } from "@/lib/dpoints";
import WelcomeDealBanner from "@/components/WelcomeDealBanner";
import EmptyState from "@/components/EmptyState";
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
  openingHours?: Record<string, { closed?: boolean; shifts?: { open: string; close: string }[] }> | null;
  featuredClass?: number;
  tags?: string[];
  phone?: string;
  address?: string;
  zip?: string;
}

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
const PROMO_CARD_WIDTH = 260;
const PROMO_CARD_GAP = 12;
const PROMO_SNAP = PROMO_CARD_WIDTH + PROMO_CARD_GAP;

type PromoCardItem =
  | { id: string; kind: "deal"; deal: DealCardData }
  | { id: string; kind: "sponsor"; sponsor: SponsorData }
  | { id: string; kind: "dpoints"; card: SponsorCardData };

export interface HomeInitialData {
  restaurants: Restaurant[];
  cities: City[];
  deals: any[];
  sponsors: SponsorData[];
  homeCategories: HomeCategorySection[];
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
  // Sticky-header collapse: kompakt (bara rad 1) när man scrollar ner, expanderar
  // mjukt (adress + sök) när man scrollar upp eller är nära toppen.
  // Drivs via ref + CSS (grid-template-rows 1fr↔0fr) istället för React-state så
  // att scroll INTE re-renderar hela (tunga) sidan varje gång headern fälls →
  // mjuk, jank-fri animation.
  const collapseRef = useRef<HTMLDivElement | null>(null);
  const collapsedRef = useRef(false);
  const lastScrollY = useRef(0);
  // Ignorera scroll-events en kort stund efter en collapse/expand så reflow:en
  // (innehållet skiftar när headern ändrar höjd) inte triggar en motsatt toggle
  // → inget "glitch upp/ner".
  const ignoreScrollUntil = useRef(0);
  const [restaurants, setRestaurants] = useState<Restaurant[]>(initialData?.restaurants ?? []);
  const [address, setAddress] = useState("");
  const [query, setQuery] = useState("");
  const [activeCuisine, setActiveCuisine] = useState("Alla");
  const [orderType, setOrderType] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [loading, setLoading] = useState(!initialData);
  const [apiError, setApiError] = useState(false);
  
  const [cities, setCities] = useState<City[]>(initialData?.cities ?? []);
  const [deals, setDeals] = useState<any[]>(() => (initialData?.deals ?? []).filter((d: any) => d.isActive && d.showOnSite));
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
  // Sticky-header collapse: TRÖSKEL-baserad hysteres (inte riktnings-baserad).
  // Kollapsa när man scrollat förbi 130px, expandera först när man är tillbaka
  // över 60px. Den 70px breda hysteres-bandet gör att reflow:en när headern
  // ändrar höjd aldrig kan flippa tillbaka state → ingen glitch/flip-flop, och
  // det fungerar oberoende av browser-zoom (200%) eftersom logiken bara läser
  // window.scrollY (CSS-px) mot fasta trösklar. rAF-throttlad.
  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      const y = window.scrollY;
      const next = collapsedRef.current ? y > 60 : y > 130;
      if (collapsedRef.current !== next) {
        collapsedRef.current = next;
        const el = collapseRef.current;
        if (el) {
          el.style.gridTemplateRows = next ? "0fr" : "1fr";
          el.style.opacity = next ? "0" : "1";
        }
      }
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // Favoriter (delad localStorage-backad store — paritet med RN)
  const { favorites, toggle: toggleFavorite } = useFavorites();

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
  const [dpointsCard, setDpointsCard] = useState<SponsorCardData | null>(null);
  // Dpoints-registreringskort i sponsor-railen — bara för utloggade besökare.
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
            validateZone(coords.lat, coords.lng);
          } catch { /* ignore */ }
        }
      } else {
        // Ingen sparad leveransadress → be om att skriva/välja en riktig.
        setAddress("");
        setDetectedCityName(null);
        setCityFamilyIds(null);
        setCityFamilyNames(null);
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
    const base = sponsors.map((sponsor) => ({ id: `sponsor-${sponsor.id}`, kind: "sponsor" as const, sponsor }));
    // Dpoints-kortet ligger FÖRST i samma array → räknas av karusellen + prickarna.
    return dpointsCard
      ? [{ id: "dpoints-signup", kind: "dpoints" as const, card: dpointsCard }, ...base]
      : base;
  }, [sponsors, dpointsCard]);

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
          const dimmed = r.isOpen === false || !inZone;
          const railPaused = r.pausedUntil ? new Date(r.pausedUntil) : null;
          const railIsPaused = railPaused !== null && railPaused.getTime() > Date.now();
          const railDimReason = !inZone
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
                  // Rak deal-chip uppe till vänster (ersätter den roterade
                  // ribbonen). Flyttas ner under status-pillen om den syns.
                  const badges = getBadgesForRestaurant(r.id);
                  if (!badges.bogo && !badges.regular) return null;
                  return (
                    <div className={`absolute ${railDimReason ? "top-11" : "top-3"} left-3 z-20 flex flex-wrap gap-1.5 max-w-[calc(100%-1.5rem)]`}>
                      {badges.bogo && (
                        <span className="bg-gold-500 text-[12px] font-semibold px-2 py-0.5 rounded-md" style={{ color: "#141416" }}>
                          {t("home.deal.badge.bogo")}
                        </span>
                      )}
                      {badges.regular && (
                        <span className="bg-gold-500 text-[12px] font-semibold px-2 py-0.5 rounded-md" style={{ color: "#141416" }}>
                          {badges.regular.discountPercent ? `−${badges.regular.discountPercent} %` : badges.regular.rewardLabel}
                        </span>
                      )}
                    </div>
                  );
                })()}
                <div className="h-36 sm:h-44 md:h-48 w-full relative overflow-hidden" style={{ backgroundColor: "var(--bg-deep)" }}>
                  {railDimReason && (
                    <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm" style={{ backgroundColor: "rgba(17,17,19,0.82)", backdropFilter: "blur(6px)" }}>
                      {!inZone ? <MapPin size={11} className="text-white" /> : <Clock size={11} className="text-white" />}
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
    if (r.isOpen === false || isPaused) {
      setClosedRestaurant(r);
      return;
    }
    router.push(getRestaurantHref(r));
  };



  return (
    <div className="min-h-screen pb-36 md:pt-28" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {/* ── MOBIL STICKY HEADER ── adressblock (primärkontroll) + kompakt
          leverans/hämtning-segmentkontroll (rad 1), sökfält (rad 2). Sticky
          så adressen alltid syns när man scrollar. Döljs på desktop. */}
      <div
        className="md:hidden sticky top-0 z-50"
        style={{ backgroundColor: "var(--bg-primary)", borderBottom: "1px solid var(--border-muted)", paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="px-4 pt-2 pb-2.5">
          {/* Rad 0: delívera-wordmark (varumärkesnärvaro på mobil — desktop har
              Navbar). Språkväljaren bor numera i Profil → Inställningar. */}
          {/* Rad 0: delívera-wordmark + leverans/hämtning — ALLTID synlig
              (den kompakta baren som blir kvar vid scroll). */}
          <div className="flex items-center justify-between">
            <span className="text-[18px] font-extrabold tracking-tight lowercase leading-none" style={{ color: "var(--text-primary)" }}>
              del<span style={{ color: "var(--gold-ink)" }}>ívera</span>
            </span>
            <div className="shrink-0 p-0.5 rounded-full flex items-center" style={{ backgroundColor: "var(--bg-deep)" }}>
              <button
                onClick={() => toggleOrderType("DELIVERY")}
                className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors"
                style={{ backgroundColor: orderType === "DELIVERY" ? "var(--color-gold-500, #E7B24B)" : "transparent", color: orderType === "DELIVERY" ? "#141416" : "var(--text-secondary)" }}
              >
                {t("cart.deliveryType.delivery")}
              </button>
              <button
                onClick={() => toggleOrderType("PICKUP")}
                className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors"
                style={{ backgroundColor: orderType === "PICKUP" ? "var(--color-gold-500, #E7B24B)" : "transparent", color: orderType === "PICKUP" ? "#141416" : "var(--text-secondary)" }}
              >
                {t("cart.deliveryType.pickup")}
              </button>
            </div>
          </div>

          {/* Adress + sök — fälls ihop (höjd + opacity → 0) när man scrollar
              förbi tröskeln, så bara den kompakta baren ovan blir kvar.
              Tröskel-baserad hysteres i scroll-handlern → ingen flip-flop. */}
          <div
            ref={collapseRef}
            className="grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-out"
            style={{ gridTemplateRows: "1fr", opacity: 1, willChange: "grid-template-rows" }}
          >
            <div className="min-h-0 overflow-hidden">
              {/* Adressblock i full bredd (primärkontroll) */}
              <div className="flex items-center pt-1.5">
                <div className="flex-1 min-w-0">
                  <AddressPullDown
                    currentAddress={address}
                    zoneStatus={orderType === "DELIVERY" ? (zoneError ? "error" : (typeof window !== "undefined" && localStorage.getItem("platform_coords")) ? "ok" : null) : null}
                    onOpenFull={() => setShowAddressModal(true)}
                    orderType={orderType}
                    cityName={detectedCityName}
                    onSelect={handleQuickAddressSelect}
                  />
                </div>
              </div>
              {/* Sökfält */}
              <Link
                href="/search"
                aria-label={t("home.searchCta")}
                className="mt-2 flex h-12 items-center gap-2.5 rounded-xl px-4 transition-colors active:opacity-80"
                style={{ backgroundColor: "var(--bg-deep)" }}
              >
                <Search size={16} strokeWidth={2} className="shrink-0" style={{ color: "var(--text-secondary)" }} />
                <span className="text-[14px] font-medium truncate" style={{ color: "var(--text-secondary)" }}>{t("home.searchCta")}</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
      <div className="relative mx-auto max-w-7xl 2xl:max-w-[1600px] px-4 sm:px-6 lg:px-10 xl:px-16 pt-3 md:pt-0">
        {/* DESKTOP SUBHEADER — adressblock till vänster, sök i mitten,
            leverans/hämtning-segmentkontroll till höger. På mobil sköts detta
            av den sticky toppbaren högst upp. */}
        <header className="hidden md:block mb-6 sm:mb-8 relative">
          <div className="flex items-center gap-4 lg:gap-6">
            <div className="shrink-0 min-w-0 max-w-[300px]">
              <AddressPullDown
                currentAddress={address}
                zoneStatus={orderType === "DELIVERY" ? (zoneError ? "error" : (typeof window !== "undefined" && localStorage.getItem("platform_coords")) ? "ok" : null) : null}
                onOpenFull={() => setShowAddressModal(true)}
                orderType={orderType}
                cityName={detectedCityName}
                onSelect={handleQuickAddressSelect}
              />
            </div>

            {/* Sökfält */}
            <Link
              href="/search"
              className="flex-1 max-w-xl mx-auto flex h-12 items-center gap-2.5 rounded-xl px-4 transition-colors hover:opacity-90"
              style={{ backgroundColor: "var(--bg-deep)" }}
            >
              <Search size={16} strokeWidth={2} className="shrink-0" style={{ color: "var(--text-secondary)" }} />
              <span className="text-[14px] font-medium flex-1 truncate" style={{ color: "var(--text-secondary)" }}>
                {t("home.searchCta")}
              </span>
            </Link>

            {/* Leverans/Hämtning — segmentkontroll */}
            <div className="shrink-0 p-0.5 rounded-full flex items-center" style={{ backgroundColor: "var(--bg-deep)" }}>
              <button
                onClick={() => toggleOrderType("DELIVERY")}
                className="px-4 py-2 rounded-full text-[12.5px] font-semibold transition-colors"
                style={{ backgroundColor: orderType === "DELIVERY" ? "var(--color-gold-500, #E7B24B)" : "transparent", color: orderType === "DELIVERY" ? "#141416" : "var(--text-secondary)" }}
              >
                {t("cart.deliveryType.delivery")}
              </button>
              <button
                onClick={() => toggleOrderType("PICKUP")}
                className="px-4 py-2 rounded-full text-[12.5px] font-semibold transition-colors"
                style={{ backgroundColor: orderType === "PICKUP" ? "var(--color-gold-500, #E7B24B)" : "transparent", color: orderType === "PICKUP" ? "#141416" : "var(--text-secondary)" }}
              >
                {t("cart.deliveryType.pickup")}
              </button>
            </div>
          </div>
        </header>

        {/* ── WHAT'S ON (Aktuellt) — först på sidan: stora banner-kort som
            auto-skiftar var 5:e sekund, med prick-indikator under. ── */}
        {promoCards.length > 0 && (
          <section className="mb-5">
            <div className="hidden lg:flex items-center gap-2 mb-3 px-1">
              <Sparkles size={14} className="text-gold-500" />
              <h2 className="text-lg sm:text-xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>{t("home.section.current")}</h2>
            </div>
            <div
              ref={promoRailRef}
              onScroll={handlePromoScroll}
              className="flex items-start gap-3 overflow-x-auto pb-1 no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0"
              style={{ scrollSnapType: "x mandatory" }}
            >
              {promoCards.map((item) => (
                <div key={item.id} style={{ scrollSnapAlign: "start" }}>
                  {item.kind === "dpoints"
                    ? <DpointsHomeCard card={item.card} />
                    : <SponsorCard sponsor={(item as any).sponsor} />}
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
                    style={{ width: activePromo === i ? "22px" : "6px", backgroundColor: activePromo === i ? "#EAB545" : "var(--border-muted)" }}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* "Senaste beställning"-kortet borttaget — den live order-tracking-
            bannern (LiveOrderBanner, fixed nederst) sköter aktiv order. */}

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
        {!loading && !cityFamilyResolving && detectedCityName && filtered.length === 0 && resolvedHomeCategorySections.every((s) => s.restaurants.filter(matchesCityFamily).length === 0) && (
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
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5">
                {filtered.map((r, i) => {
                  const isOutOfZone = orderType === "DELIVERY" && zoneRestaurantIds !== null && !zoneRestaurantIds.includes(r.id);
                  const isClosed = r.isOpen === false;
                  const dimmed = isClosed || isOutOfZone;
                  const pausedUntilDate = r.pausedUntil ? new Date(r.pausedUntil) : null;
                  const isPaused = pausedUntilDate !== null && pausedUntilDate.getTime() > Date.now();
                  const dimReason = isOutOfZone
                    ? "Utanför zon"
                    : isClosed
                      ? (isPaused
                          ? `Öppnar ${pausedUntilDate!.getHours().toString().padStart(2, "0")}:${pausedUntilDate!.getMinutes().toString().padStart(2, "0")}`
                          : (nextOpenLabel(r.openingHours) || "Stängd"))
                      : null;
                  const injectDeal = (allDealCards.length > 0 && (i + 1) % 4 === 0) ? allDealCards[Math.floor(i / 4) % allDealCards.length] : null;
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
                          className="group block rounded-2xl overflow-hidden hover:shadow-[0_4px_16px_rgba(20,20,22,0.08)] transition-shadow duration-200 relative"
                          style={{ backgroundColor: "var(--bg-secondary)", boxShadow: "0 2px 12px rgba(17,17,19,0.06)" }}
                        >
                          {/* ── IMAGE ──────────────────────────────────────── */}
                          {/* Bigger image on mobile (was h-44 / 176px → 200px)
                              so restaurant cards feel substantial against the
                              now-smaller sponsor rail. Stable at sm+. */}
                          <div className="h-[210px] sm:h-56 w-full overflow-hidden relative" style={{ backgroundColor: "var(--bg-deep)" }}>
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
                                {isOutOfZone ? <MapPin size={11} className="text-white" /> : <Clock size={11} className="text-white" />}
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
                              if (!badges.bogo && !badges.regular) return null;
                              return (
                                <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-1.5 max-w-[calc(100%-1.5rem)]">
                                  {badges.bogo && (
                                    <span className="bg-gold-500 text-[12px] font-semibold px-2 py-0.5 rounded-md" style={{ color: "#141416" }}>
                                      {t("home.deal.badge.bogo")}
                                    </span>
                                  )}
                                  {badges.regular && (
                                    <span className="bg-gold-500 text-[12px] font-semibold px-2 py-0.5 rounded-md" style={{ color: "#141416" }}>
                                      {badges.regular.discountPercent ? `−${badges.regular.discountPercent} %` : badges.regular.rewardLabel}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>

                          {/* ── CARD FOOTER (minimal: namn + rating + leveranstid) ── */}
                          <div className="px-4 py-3.5">
                            <h3 className="text-base sm:text-lg font-bold tracking-tight leading-tight truncate group-hover:text-gold-600 transition-colors mb-1.5" style={{ color: "var(--text-primary)" }}>{r.name}</h3>
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
                                      <span className="flex items-center gap-1"><Clock size={12} /> {etaDisplay}</span>
                                    </>
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


