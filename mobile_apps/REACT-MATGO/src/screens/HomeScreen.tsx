import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from 'react-i18next';
import { useArabic } from '../hooks/useArabic';
import {
  Animated,
  Easing,
  FlatList,
  Image,
  LayoutAnimation,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DealFlipCard, { type DealFlipCardData } from "../components/DealFlipCard";
import AddressModal from "../components/AddressModal";
import ScalePressable from "../components/ScalePressable";
import { ToggleChip, RestaurantCard, EmptyPanel } from "../components/ui";
import CityModal from "../components/CityModal";
import RestaurantInfoModal from "../components/RestaurantInfoModal";
import SponsorTile from "../components/SponsorTile";
import AddressPullDown from "../components/AddressPullDown";
import DiscountedDishesRail from "../components/DiscountedDishesRail";
import FreeDeliveryRail from "../components/FreeDeliveryRail";
import { HomeScreenSkeleton } from "../components/SkeletonLoader";
import { resolveHomeCategoryRestaurants } from "../lib/homeCategories";
import { getScreenCache, setScreenCache } from "../lib/screenCache";

import {
  AppRoute,
  City,
  HomeCategorySection,
  PublicDeal,
  Restaurant,
} from "../types";
import { useAppStore } from "../store/useAppStore";
import { api, getImageUrl } from "../lib/api";
import { rememberQuickAddress } from "../lib/quickAddresses";
import { useSharedStyles, useTheme } from "../theme";
import { getBottomTabsContentPadding, getScreenTopPadding, getStickyHeaderTopInset } from "../constants/layout";


// ─── Local helpers ─────────────────────────────────────────────────────────────
type PersonalDeal = {
  id?: string;
  code: string;
  campaign?: {
    title?: string;
    description?: string;
    discountType?: string;
    discountValue?: number;
    minOrder?: number;
    validUntil?: string | null;
  } | null;
};

type PromoCarouselItem =
  | { id: string; kind: "deal"; deal: DealFlipCardData }
  | { id: string; kind: "sponsor"; sponsor: any };

type SponsorCarouselItem = Extract<PromoCarouselItem, { kind: "sponsor" }>;

type HomeScreenCache = {
  restaurants: Restaurant[];
  cities: City[];
  deals: PublicDeal[];
  personalDeals: PersonalDeal[];
  homeCategorySections: HomeCategorySection[];
  sponsors: any[];
};

const PROMO_CARD_WIDTH = 260;
const PROMO_CARD_GAP = 12;
const PROMO_SNAP = PROMO_CARD_WIDTH + PROMO_CARD_GAP;

function formatPersonalDealReward(deal: PersonalDeal) {
  const campaign = deal.campaign || {};
  if (campaign.discountType === "PERCENTAGE") return `${campaign.discountValue || 0}% RABATT`;
  if (campaign.discountType === "FIXED") return `${campaign.discountValue || 0} KR RABATT`;
  return "Personligt erbjudande";
}

function formatPublicDealReward(deal: PublicDeal) {
  if (deal.discountType === "PERCENTAGE") return `${deal.discountValue || 0}% RABATT`;
  if (deal.discountType === "FIXED") return `${deal.discountValue || 0} KR RABATT`;
  if ((deal.comboProductNames || []).length > 0) return "COMBO DEAL";
  return "ERBJUDANDE";
}

function sortRestaurantsForHome(restaurants: Restaurant[], zoneIds: string[] | null = null) {
  return [...restaurants].sort((a, b) => {
    if (zoneIds !== null) {
      const aInZone = zoneIds.includes(a.id);
      const bInZone = zoneIds.includes(b.id);
      if (aInZone && !bInZone) return -1;
      if (!aInZone && bInZone) return 1;
    }
    const aOpen = a.isOpen !== false ? 1 : 0;
    const bOpen = b.isOpen !== false ? 1 : 0;
    if (aOpen !== bOpen) return bOpen - aOpen;
    const aFeat = a.featuredClass || 0;
    const bFeat = b.featuredClass || 0;
    if (aFeat !== bFeat) return bFeat - aFeat;
    return (b.rating || 0) - (a.rating || 0);
  });
}

const cuisineFilters = [
  { name: "Alla", emoji: "🍽️" },
  { name: "Favoriter", emoji: "❤️" },
  { name: "Pizza", emoji: "🍕" },
  { name: "Sushi", emoji: "🍣" },
  { name: "Kebab", emoji: "🥙" },
  { name: "Burgare", emoji: "🍔" },
  { name: "Pasta", emoji: "🍝" },
  { name: "Asiatiskt", emoji: "🥢" },
];

export default function HomeScreen({
  openRestaurant,
  openTab,
  pushRoute,
  onSearchPress,
}: {
  openRestaurant: (slug: string) => void;
  openTab: (name: "home" | "search" | "cart" | "profile" | "discover") => void;
  pushRoute?: (route: AppRoute) => void;
  onSearchPress?: () => void;
}) {
  const { t } = useTranslation();
  const { ls } = useArabic();
  const { palette } = useTheme();
  const styles = useSharedStyles();
  const themePreference = useAppStore((s) => s.themePreference);
  const setThemePreference = useAppStore((s) => s.setThemePreference);
  const token = useAppStore((s) => s.token);
  const cacheKey = token || "__guest__";
  const cachedData = getScreenCache<HomeScreenCache>("home", cacheKey);
  const insets = useSafeAreaInsets();
  const screenTopPadding = getScreenTopPadding(insets.top);
  const screenBottomPadding = getBottomTabsContentPadding(insets.bottom);
  const stickySearchTopInset = getStickyHeaderTopInset(insets.top);
  const scrollY = useRef(new Animated.Value(0)).current;
  const stickySearchVisibleRef = useRef(false);

  const [restaurants, setRestaurants] = useState<Restaurant[]>(() => cachedData?.restaurants || []);
  const [cities, setCities] = useState<City[]>(() => cachedData?.cities || []);
  const [deals, setDeals] = useState<PublicDeal[]>(() => cachedData?.deals || []);
  const [personalDeals, setPersonalDeals] = useState<PersonalDeal[]>(() => cachedData?.personalDeals || []);
  const [homeCategorySections, setHomeCategorySections] = useState<HomeCategorySection[]>(() => cachedData?.homeCategorySections || []);
  const [loading, setLoading] = useState(!cachedData);
  const [activeCuisine, setActiveCuisine] = useState("Alla");
  const [cityModalOpen, setCityModalOpen] = useState(false);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [autoOpenAddressPicker, setAutoOpenAddressPicker] = useState(false);
  const [infoRestaurant, setInfoRestaurant] = useState<Restaurant | null>(null);
  const [stickySearchActive, setStickySearchActive] = useState(false);
  // Quick-filter state
  const [quickFilter, setQuickFilter] = useState<"all" | "rated" | "fast" | "deals" | "free">("all");

  const [zoneRestaurantIds, setZoneRestaurantIds] = useState<string[] | null>(null);
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [sponsors, setSponsors] = useState<any[]>(() => cachedData?.sponsors || []);
  const promoListRef = useRef<FlatList<SponsorCarouselItem> | null>(null);
  const [activePromoIndex, setActivePromoIndex] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const address = useAppStore((s) => s.address);
  const coords = useAppStore((s) => s.coords);
  const orderType = useAppStore((s) => s.orderType);
  const pickupCity = useAppStore((s) => s.pickupCity);
  const deliveryOverrides = useAppStore((s) => s.deliveryOverrides);
  const setAddress = useAppStore((s) => s.setAddress);
  const setOrderType = useAppStore((s) => s.setOrderType);
  const setPendingPromoCode = useAppStore((s) => s.setPendingPromoCode);
  const setDeliveryOverrides = useAppStore((s) => s.setDeliveryOverrides);
  const profile = useAppStore((s) => s.profile);
  const favorites = useAppStore((s) => s.favorites);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    const firstName = profile?.name ? profile.name.split(" ")[0] : null;

    if (firstName) {
      if (h < 10) return { pre: t('home.greetings.morningName'), highlight: firstName, sub: t('home.greetings.subMorning') };
      if (h < 14) return { pre: t('home.greetings.lunchName'), highlight: firstName, sub: t('home.greetings.subLunch') };
      if (h < 17) return { pre: t('home.greetings.afternoonName'), highlight: firstName, sub: t('home.greetings.subAfternoon') };
      if (h < 22) return { pre: t('home.greetings.eveningName'), highlight: firstName, sub: t('home.greetings.subEvening') };
      return { pre: t('home.greetings.lateName'), highlight: firstName, sub: t('home.greetings.subLate') };
    }

    if (h < 10) return { pre: t('home.greetings.morningGuest.pre'), highlight: t('home.greetings.morningGuest.highlight'), sub: t('home.greetings.morningGuest.sub') };
    if (h < 14) return { pre: t('home.greetings.lunchGuest.pre'), highlight: t('home.greetings.lunchGuest.highlight'), sub: t('home.greetings.lunchGuest.sub') };
    if (h < 17) return { pre: t('home.greetings.afternoonGuest.pre'), highlight: t('home.greetings.afternoonGuest.highlight'), sub: t('home.greetings.afternoonGuest.sub') };
    if (h < 22) return { pre: t('home.greetings.eveningGuest.pre'), highlight: t('home.greetings.eveningGuest.highlight'), sub: t('home.greetings.eveningGuest.sub') };
    return { pre: t('home.greetings.lateGuest.pre'), highlight: t('home.greetings.lateGuest.highlight'), sub: t('home.greetings.lateGuest.sub') };
  }, [profile, t]);

  const validateZone = useCallback(async (lat: number, lng: number) => {
    try {
      const res = await api.post(`/api/cities/validate-location`, { lat, lng });
      if (res.data && res.data.covered && Array.isArray(res.data.cities)) {
        const ids = res.data.cities.flatMap((c: any) =>
          Array.isArray(c.restaurants) ? c.restaurants.map((r: any) => r.id) : []
        );

        const overrides: Record<string, any> = {};
        res.data.cities.forEach((c: any) => {
          if (Array.isArray(c.restaurants)) {
            c.restaurants.forEach((r: any) => {
              if (r.matchedZone) {
                overrides[r.id] = {
                  deliveryFee: (r.matchedZone.deliveryFee || 0) / 100,
                  minOrderAmount: (r.matchedZone.minOrder || 0) / 100,
                };
              }
            });
          }
        });

        setDeliveryOverrides(overrides);
        setZoneRestaurantIds(ids);
        setZoneError(null);
      } else {
        setZoneRestaurantIds([]);
        setDeliveryOverrides({});
        setZoneError(t('home.zoneUnavailable'));
      }
    } catch {
      // Network error — don't clear existing overrides; previous valid fees stay in place.
      setZoneRestaurantIds(null);
      setZoneError(null);
    }
  }, [setDeliveryOverrides, t]);

  const lastValidatedCoords = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (orderType === "DELIVERY" && coords) {
      if (!lastValidatedCoords.current || lastValidatedCoords.current.lat !== coords.lat || lastValidatedCoords.current.lng !== coords.lng) {
        lastValidatedCoords.current = { lat: coords.lat, lng: coords.lng };
        validateZone(coords.lat, coords.lng);
      }
    } else {
      setZoneRestaurantIds(null);
      setZoneError(null);
    }
  }, [coords, orderType, validateZone]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [restaurantsRes, citiesRes, dealsRes, homeCategorySectionsRes, persDealsRes, sponsorsRes] = await Promise.all([
          api.get("/api/restaurants"),
          api.get("/api/cities"),
          api.get("/api/deals"),
          api.get("/api/home-categories").catch(() => ({ data: [] })),
          token
            ? api.get("/api/profile/deals", { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
          api.get("/api/sponsors").catch(() => ({ data: [] })),
        ]);
        if (!active) return;
        const nextRestaurants = (restaurantsRes.data || []) as Restaurant[];
        const nextCities = (citiesRes.data || []) as City[];
        const nextDeals = ((dealsRes.data || []) as PublicDeal[]).filter((deal: PublicDeal) => deal.isActive !== false && deal.showOnSite !== false);
        const nextHomeCategorySections = (homeCategorySectionsRes.data || []) as HomeCategorySection[];
        const nextPersonalDeals = (persDealsRes.data || []) as PersonalDeal[];
        const nextSponsors = sponsorsRes.data || [];
        setRestaurants(nextRestaurants);
        setCities(nextCities);
        setDeals(nextDeals);
        setHomeCategorySections(nextHomeCategorySections);
        setPersonalDeals(nextPersonalDeals);
        setSponsors(nextSponsors);
        setScreenCache<HomeScreenCache>("home", cacheKey, {
          restaurants: nextRestaurants,
          cities: nextCities,
          deals: nextDeals,
          personalDeals: nextPersonalDeals,
          homeCategorySections: nextHomeCategorySections,
          sponsors: nextSponsors,
        });
      } catch {
        // silent — skeleton stays
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [cacheKey, token]);

  const selectedCity = useMemo(
    () => cities.find((city) => city.name.toLowerCase() === address.toLowerCase()) || null,
    [address, cities]
  );


  // homeDeals must be computed BEFORE filtered (filtered uses it for the "deals" quick-filter)
  const homeDeals = useMemo<DealFlipCardData[]>(() => {
    const restaurantById = new Map(restaurants.map((restaurant) => [restaurant.id, restaurant]));

    const personalCards = personalDeals.map((deal) => {
      const campaign = deal.campaign || {};
      const campaignTitle = campaign.title || t('home.deals.personalDefault');
      const isWelcome = campaignTitle.toLowerCase().includes("välkomst");

      return {
        id: `personal-${deal.id || deal.code}`,
        badgeLabel: isWelcome ? t('home.deals.welcome') : t('home.deals.personal'),
        title: campaignTitle,
        subtitle: deal.code ? t('home.deals.yourCode', { code: deal.code }) : "Unikt erbjudande för ditt konto",
        rewardLabel: formatPersonalDealReward(deal),
        description: campaign.description || t('home.deals.personalDescription'),
        code: deal.code?.toUpperCase(),
        validUntil: campaign.validUntil || null,
        minOrderText: campaign.minOrder && campaign.minOrder > 0 ? `MIN ${campaign.minOrder} KR` : null,
        tags: [],
        tone: isWelcome ? "orange" : "gold",
        variant: "personal",
      } satisfies DealFlipCardData;
    });

    const publicCards = deals.map((deal) => {
      const relatedRestaurantIds = Array.from(
        new Set([deal.restaurantId, ...(deal.applicableRestaurantIds || [])].filter((value): value is string => !!value))
      );
      const relatedRestaurants = relatedRestaurantIds
        .map((restaurantId) => restaurantById.get(restaurantId))
        .filter((restaurant): restaurant is Restaurant => !!restaurant);
      const primaryRestaurant = deal.restaurant?.slug
        ? deal.restaurant
        : relatedRestaurants.length === 1
          ? relatedRestaurants[0]
          : null;

      return {
        id: `public-${deal.id}`,
        badgeLabel: (deal.badgeText || (deal.isGlobal ? "Deal" : "Restaurang")).toUpperCase(),
        title: deal.title,
        subtitle: deal.isGlobal
          ? t('home.deals.globalSubtitle')
          : primaryRestaurant?.name || (relatedRestaurants.length > 1 ? t('home.deals.restaurants', { count: relatedRestaurants.length }) : "Utvalda restauranger"),
        rewardLabel: formatPublicDealReward(deal),
        description: deal.description || t('home.deals.publicDescription'),
        validUntil: deal.validUntil || null,
        minOrderText: deal.minOrder && deal.minOrder > 0 ? `MIN ${deal.minOrder} KR` : null,
        tags: deal.comboProductNames || [],
        tone: "purple",
        variant: "public",
        relatedRestaurantIds,
        onNavigateToFilteredRestaurants: () => {
          // Tar kunden till dedikerad /deals/[id]-spegel i RN — listar
          // alla restauranger som har erbjudandet plus deal-info i toppen.
          if (pushRoute) {
            pushRoute({ name: "deal", id: deal.id });
          }
        },
        onUseNow: () => {
          if (pushRoute) {
            pushRoute({ name: "deal", id: deal.id });
          } else if (primaryRestaurant?.slug) {
            openRestaurant(primaryRestaurant.slug);
          }
        },
      } satisfies DealFlipCardData;
    });

    return [...personalCards, ...publicCards];
  }, [deals, openRestaurant, personalDeals, restaurants, pushRoute, t]);

  const filtered = useMemo(() => {
    const raw = sortRestaurantsForHome(
      restaurants.filter((restaurant) => {
        const byCuisine =
          activeCuisine === "Alla" ||
          (restaurant.cuisine || "").toLowerCase().includes(activeCuisine.toLowerCase()) ||
          (restaurant.tags || []).some((tag) => tag.toLowerCase().includes(activeCuisine.toLowerCase()));

        if (!byCuisine) return false;

        if (orderType === "PICKUP" && selectedCity) {
          return (restaurant.city || "").toLowerCase() === selectedCity.name.toLowerCase();
        }

        return true;
      }),
      orderType === "DELIVERY" ? zoneRestaurantIds : null
    );

    const withOverrides = raw.map((r) => {
      const ovr = deliveryOverrides[r.id];
      if (!ovr) return r;
      return { ...r, deliveryFee: ovr.deliveryFee, minOrderAmount: ovr.minOrderAmount };
    });

    // Apply quick-filters
    return withOverrides.filter((r) => {
      if (quickFilter === "rated") return (r.rating || 0) >= 4.0;
      if (quickFilter === "fast") return (r.etaMinutes || 999) < 30;
      if (quickFilter === "deals") return homeDeals.some(d => d.relatedRestaurantIds?.includes(r.id));
      if (quickFilter === "free") return !r.deliveryFee || r.deliveryFee === 0;
      return true;
    });
  }, [activeCuisine, restaurants, selectedCity, orderType, zoneRestaurantIds, deliveryOverrides, quickFilter, homeDeals]);

  const featured = useMemo(() => {
    const allPremium = filtered.filter((r) => r.featuredClass === 1 || r.featuredClass === 2);
    const openPremium = allPremium.filter((r) => r.isOpen !== false);
    if (openPremium.length > 0) return openPremium.slice(0, 8);
    return allPremium.slice(0, 8);
  }, [filtered]);

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
          selectedCityName: selectedCity?.name,
          zoneRestaurantIds,
        }).map((r) => {
          const ovr = deliveryOverrides[r.id];
          if (!ovr) return r;
          return { ...r, deliveryFee: ovr.deliveryFee, minOrderAmount: ovr.minOrderAmount };
        }),
      }))
      .filter((section) => section.restaurants.length > 0);
  }, [homeCategorySections, restaurants, deals, deliveryOverrides, orderType, selectedCity?.name, zoneRestaurantIds]);

  const sponsorCards = useMemo<SponsorCarouselItem[]>(() => {
    return sponsors.map((sponsor: any) => ({ id: `sponsor-${sponsor.id}`, kind: "sponsor" as const, sponsor }));
  }, [sponsors]);

  // Determine an active deal for a given restaurant
  const getDealForRestaurant = useCallback((restaurantId: string) => {
    return homeDeals.find(d => d.relatedRestaurantIds?.includes(restaurantId) || d.isGlobal);
  }, [homeDeals]);

  const handlePromoMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / PROMO_SNAP);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActivePromoIndex(Math.max(0, Math.min(nextIndex, Math.max(sponsorCards.length - 1, 0))));
  }, [sponsorCards.length]);

  useEffect(() => {
    if (sponsorCards.length <= 1) return;

    progressAnim.setValue(0);
    const anim = Animated.timing(progressAnim, {
      toValue: 1,
      duration: 5000,
      easing: Easing.linear,
      useNativeDriver: false,
    });

    anim.start(({ finished }) => {
      if (finished) {
        const nextIndex = (activePromoIndex + 1) % sponsorCards.length;
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setActivePromoIndex(nextIndex);
        promoListRef.current?.scrollToOffset({
          offset: nextIndex * PROMO_SNAP,
          animated: true,
        });
      }
    });

    return () => {
      anim.stop();
    };
  }, [activePromoIndex, sponsorCards.length, progressAnim]);

  const toggleAnim = useRef(new Animated.Value(orderType === "DELIVERY" ? 0 : 1)).current;

  useEffect(() => {
    Animated.spring(toggleAnim, {
      toValue: orderType === "DELIVERY" ? 0 : 1,
      useNativeDriver: false,
      friction: 8,
      tension: 40,
    }).start();
  }, [orderType, toggleAnim]);

  const left = toggleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["1.5%", "49%"],
  });

  const stickySearchOpacity = scrollY.interpolate({
    inputRange: [60, 100, 135],
    outputRange: [0, 0, 1],
    extrapolate: "clamp",
  });

  const stickySearchTranslateY = scrollY.interpolate({
    inputRange: [60, 100, 135],
    outputRange: [-16, -10, 0],
    extrapolate: "clamp",
  });

  const inlineSearchOpacity = scrollY.interpolate({
    inputRange: [70, 110],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const handleHomeScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextActive = event.nativeEvent.contentOffset.y > 110;
    if (stickySearchVisibleRef.current !== nextActive) {
      stickySearchVisibleRef.current = nextActive;
      setStickySearchActive(nextActive);
    }
  }, []);

  const renderSearchBar = useCallback(
    (containerStyle?: any) => (
      <ScalePressable
        onPress={() => onSearchPress ? onSearchPress() : openTab("discover")}
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            borderRadius: 18,
            backgroundColor: palette.panel,
            borderWidth: 1,
            borderColor: palette.border,
            paddingLeft: 14,
            paddingRight: 4,
            paddingVertical: 4,
          },
          containerStyle,
        ]}
      >
        <Ionicons name="search-outline" size={14} color={palette.muted} />
        <Text style={{ flex: 1, color: palette.muted, fontSize: 12, fontWeight: "800" }}>{t('home.searchPlaceholder')}</Text>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: palette.gold, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="arrow-forward" size={14} color="#000" />
        </View>
      </ScalePressable>
    ),
    [openTab, t]
  );

  const renderRestaurantCategoryRail = (title: string, subtitle: string | null | undefined, sectionRestaurants: Restaurant[]) => (
    <View>
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.border, marginHorizontal: 20, marginBottom: 12 }} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 10 }}>
        <View style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
          <Text numberOfLines={1} style={{ color: palette.gold, fontSize: 18, fontWeight: "900", fontStyle: "italic" }}>{title.toUpperCase()}</Text>
          {!!subtitle && <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: ls(2.5), marginTop: 3 }}>{subtitle.toUpperCase()}</Text>}
        </View>
        <ScalePressable onPress={() => openTab("discover")} style={{ flexShrink: 0 }}>
          <Text style={{ color: palette.text, fontSize: 10, fontWeight: "900", borderBottomWidth: 1, borderBottomColor: palette.goldDark, paddingBottom: 3 }}>{t('home.viewAll')}</Text>
        </ScalePressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}>
        {sectionRestaurants.map((restaurant) => {
          const isOutOfZone = orderType === "DELIVERY" && zoneRestaurantIds !== null && !zoneRestaurantIds.includes(restaurant.id);
          const isClosed = restaurant.isOpen === false;
          const dimmed = isClosed || isOutOfZone;
          const activeDeal = getDealForRestaurant(restaurant.id);
          return (
            <RestaurantCard
              key={`${title}-${restaurant.id}`}
              restaurant={restaurant}
              isOutOfZone={isOutOfZone}
              dealText={activeDeal?.rewardLabel}
              dealTone={activeDeal?.tone}
              onPress={() => openRestaurant(restaurant.slug)}
              containerStyle={{ width: 300, opacity: dimmed ? 0.6 : 1 }}
            />
          );
        })}
      </ScrollView>
    </View>
  );

  if (loading) {
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: screenTopPadding, paddingBottom: screenBottomPadding }}
      >
        <HomeScreenSkeleton />
      </ScrollView>
    );
  }

  return (
    <>
      <Animated.ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: false,
          listener: handleHomeScroll,
        })}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: screenTopPadding, paddingBottom: screenBottomPadding, gap: 10 }}
      >
        <View style={{ paddingTop: 10, marginBottom: 2, paddingHorizontal: 20 }}>
          {/* Top row: address pulldown + theme toggle */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AddressPullDown
                onOpenFull={() => setAddressModalOpen(true)}
                zoneStatus={orderType === 'DELIVERY' ? (zoneError ? 'error' : coords ? 'ok' : null) : null}
                autoOpen={autoOpenAddressPicker}
                onAutoOpenHandled={() => setAutoOpenAddressPicker(false)}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                themePreference === "light"
                  ? "Byt till mörkt läge"
                  : themePreference === "dark"
                  ? "Följ systemets läge"
                  : "Byt till ljust läge"
              }
              onPress={() => {
                // Cycle: light -> dark -> system -> light
                const next =
                  themePreference === "light"
                    ? "dark"
                    : themePreference === "dark"
                    ? "system"
                    : "light";
                setThemePreference(next);
              }}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: palette.gold,
                backgroundColor: palette.panel,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name={
                  themePreference === "light"
                    ? "sunny-outline"
                    : themePreference === "dark"
                    ? "moon-outline"
                    : "desktop-outline"
                }
                size={18}
                color={palette.gold}
              />
            </Pressable>
          </View>

          {/* Greeting */}
          <View style={{ marginTop: 8 }}>
            <Text style={{ color: palette.text, fontSize: 22, fontWeight: "900", fontStyle: "italic", letterSpacing: -0.5 }}>
              {greeting.pre}<Text style={{ color: palette.gold }}>{greeting.highlight}</Text>
            </Text>
            <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 10, fontWeight: "700", letterSpacing: ls(1.5), marginTop: 3 }}>
              {greeting.sub}
            </Text>
          </View>

          {/* Stor toggle för Leverans / Hämtning på en egen rad */}
          <View
            style={{
              marginTop: 12,
              backgroundColor: palette.panel,
              borderWidth: 1,
              borderColor: palette.border,
              borderRadius: 999,
              padding: 4,
              flexDirection: "row",
              position: "relative",
              height: 48,
            }}
          >
            <Animated.View
              style={{
                position: "absolute",
                top: 4,
                bottom: 4,
                left: left,
                width: "50%",
                backgroundColor: palette.gold,
                borderRadius: 999,
              }}
            />
            {(
              [
                { key: "DELIVERY", label: t('home.delivery'), icon: "bicycle-outline" },
                { key: "PICKUP", label: t('home.pickup'), icon: "storefront-outline" },
              ] as const
            ).map((item) => {
              const active = orderType === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => {
                    setOrderType(item.key);
                    if (item.key === "PICKUP" && !pickupCity) {
                      setAutoOpenAddressPicker(true);
                    }
                  }}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, zIndex: 2 }}
                >
                  <Ionicons name={item.icon} size={16} color={active ? "#000" : palette.muted} />
                  <Text style={{ color: active ? "#000" : palette.muted, fontWeight: "900", fontSize: 12, letterSpacing: ls(1.5) }}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Animated.View style={{ opacity: inlineSearchOpacity }}>
            {renderSearchBar({
              marginTop: 8,
              shadowColor: palette.gold,
              shadowOpacity: 0.05,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 2,
            })}
          </Animated.View>

          {/* Zonstatus visas nu som en liten färgad prick på adress-pilen ovan istället för en
              hel banner – zonError behåller däremot fullständigt fel-meddelande så användaren
              förstår varför de inte ser några restauranger. */}
          {zoneError && orderType === "DELIVERY" && (
            <View style={{ backgroundColor: "rgba(220, 38, 38, 0.12)", borderColor: "rgba(220, 38, 38, 0.3)", borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="alert-circle" size={14} color="#f87171" />
              <Text style={{ flex: 1, color: "#fca5a5", fontSize: 10, fontWeight: "800", lineHeight: 14 }}>{zoneError}</Text>
            </View>
          )}
        </View>

        {/* Categories / Cuisine filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 20, paddingVertical: 2, marginTop: 4 }}>
          {cuisineFilters.map((filter) => {
            const active = activeCuisine === filter.name;
            return (
              <ScalePressable
                key={filter.name}
                onPress={() => {
                  setActiveCuisine(filter.name);
                  if (filter.name === "Alla") {
                    pushRoute?.({ name: "discover" } as any);
                  } else {
                    pushRoute?.({ name: "discover", cuisine: filter.name } as any);
                  }
                  // Favoriter navigates to discover with favorites filter
                }}
                style={{ alignItems: "center", gap: 6 }}
              >
                <View style={{
                  width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: active ? palette.gold : palette.panel,
                  borderWidth: 1, borderColor: active ? palette.gold : palette.border,
                  shadowColor: "#1C1C1E",
                  shadowOpacity: active ? 0.12 : 0.04,
                  shadowRadius: active ? 8 : 4,
                  elevation: active ? 4 : 1,
                }}>
                  <Text style={{ fontSize: 22, opacity: active ? 1 : 0.9 }}>{filter.emoji}</Text>
                </View>
                <Text style={{ color: active ? palette.gold : palette.muted, fontSize: 9, fontWeight: "700", letterSpacing: ls(1) }}>
                  {t(`home.cuisines.${filter.name}`, filter.name)}
                </Text>
              </ScalePressable>
            );
          })}
        </ScrollView>

        {sponsorCards.length > 0 && (
          <View style={{ marginBottom: 4 }}>
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.border, marginHorizontal: 20, marginBottom: 12 }} />
            <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
              <Text style={{ color: palette.text, fontSize: 12, fontWeight: "900", letterSpacing: ls(2) }}>{t('home.section.current')}</Text>
              <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: ls(2), marginTop: 2 }}>
                {t('home.section.campaigns')}
              </Text>
            </View>
            <FlatList
              ref={promoListRef}
              data={sponsorCards}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={PROMO_SNAP}
              snapToAlignment="start"
              disableIntervalMomentum
              bounces={false}
              onMomentumScrollEnd={handlePromoMomentumEnd}
              contentContainerStyle={{ paddingHorizontal: 20, paddingRight: 32 }}
              renderItem={({ item, index }) => (
                <View style={{ width: PROMO_CARD_WIDTH, marginRight: index === sponsorCards.length - 1 ? 0 : PROMO_CARD_GAP }}>
                  <SponsorTile sponsor={item.sponsor} openRestaurant={openRestaurant} pushRoute={pushRoute} />
                </View>
              )}
            />
            {sponsorCards.length > 1 && (
              <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5, marginTop: 10 }}>
                {sponsorCards.map((_, i) => {
                  const isActive = i === activePromoIndex;
                  return (
                    <View 
                      key={i} 
                      style={{ 
                        height: 4, 
                        width: isActive ? 34 : 6, 
                        backgroundColor: isActive ? "rgba(234,181,69,0.2)" : "rgba(255,255,255,0.18)", 
                        borderRadius: 3, 
                        overflow: "hidden",
                      }}
                    >
                      {isActive && (
                        <Animated.View style={{ 
                           height: "100%", 
                           backgroundColor: palette.gold, 
                           width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) 
                        }} />
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* REA & RABATTER (Flyttad upp under Aktuellt enligt önskemål) */}
        <DiscountedDishesRail openRestaurant={openRestaurant} />

        {resolvedHomeCategorySections.length > 0
          ? resolvedHomeCategorySections.map((section) => (
              <React.Fragment key={section.id}>
                {renderRestaurantCategoryRail(section.title, section.subtitle, section.restaurants)}
              </React.Fragment>
            ))
          : featured.length > 0
            ? renderRestaurantCategoryRail(t('home.section.hotlist.title'), t('home.section.hotlist.subtitle'), featured)
            : null}



        {/* FRI LEVERANS (Stor kategori) */}
        {orderType !== "PICKUP" && <FreeDeliveryRail openRestaurant={openRestaurant} />}

        {/* SNABB LEVERANS (Liten kategori - fungerar som "avskiljare" nr 2) */}
        {(() => {
          const fast = filtered.filter((r) => (r.etaMinutes ?? Number.POSITIVE_INFINITY) <= 25).slice(0, 10);
          if (fast.length === 0) return null;
          return (
            <View>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.border, marginHorizontal: 20, marginBottom: 12 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, marginBottom: 10 }}>
                <Ionicons name="flash" size={12} color="#f59e0b" />
                <Text style={{ color: palette.text, fontSize: 12, fontWeight: "900", letterSpacing: ls(2), textTransform: 'uppercase' }}>{t('home.section.fastDelivery')}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
                {fast.map((r) => (
                  <ScalePressable
                    key={r.id}
                    onPress={() => openRestaurant(r.slug)}
                    style={{ width: 140, borderRadius: 16, overflow: 'hidden', backgroundColor: palette.panel, borderWidth: 1, borderColor: "rgba(255,248,234,0.08)" }}
                  >
                    <View style={{ width: '100%', height: 75, backgroundColor: palette.bg }}>
                      {r.heroImageUrl || r.imageUrl ? (
                        <Image source={{ uri: getImageUrl((r.heroImageUrl || r.imageUrl) as string) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      ) : null}
                    </View>
                    <View style={{ padding: 10 }}>
                      <Text numberOfLines={1} style={{ color: palette.text, fontSize: 13, fontWeight: '900' }}>{r.name}</Text>
                      <Text style={{ color: palette.muted, fontSize: 10, marginTop: 4, fontWeight: '700' }}>{Math.round(r.etaMinutes ?? 0)} min • {r.rating ? r.rating.toFixed(1) + '★' : 'Ny'}</Text>
                    </View>
                  </ScalePressable>
                ))}
              </ScrollView>
            </View>
          );
        })()}





        <View>
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.border, marginHorizontal: 20, marginBottom: 12 }} />
          <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "800", letterSpacing: ls(2), paddingHorizontal: 20 }}>
            {(activeCuisine === "Alla" ? t('home.section.allRestaurants') : t(`home.cuisines.${activeCuisine}`, activeCuisine).toUpperCase()) + ` · ${filtered.length} ST`}
          </Text>
        </View>

        {/* STICKY QUICK-FILTERS – sortering over lista */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8, paddingHorizontal: 20 }}>
          {([
            { key: "all",   label: t('home.filters.all'),   icon: "apps-outline" },
            { key: "rated", label: t('home.filters.rated'),  icon: "star-outline" },
            { key: "fast",  label: t('home.filters.fast'),   icon: "flash-outline" },
            { key: "deals", label: t('home.filters.deals'),  icon: "pricetag-outline" },
            { key: "free",  label: t('home.filters.free'),   icon: "bicycle-outline" },
          ] as const).map((qf) => {
            const active = quickFilter === qf.key;
            return (
              <ScalePressable
                key={qf.key}
                onPress={() => setQuickFilter(qf.key)}
                style={[styles.quickFilterChip, active && styles.quickFilterChipActive]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Ionicons name={qf.icon} size={12} color={active ? "#000" : palette.muted} />
                  <Text style={[styles.quickFilterChipText, active && styles.quickFilterChipTextActive]}>{qf.label}</Text>
                </View>
              </ScalePressable>
            );
          })}
        </ScrollView>

        <View style={{ paddingHorizontal: 20, gap: 16 }}>
          {loading && (
            <View style={{ gap: 16 }}>
              {[1, 2, 3].map((i) => (
                <View key={i} style={{ width: '100%', height: 200, backgroundColor: palette.skeletonBase, borderRadius: 24, overflow: 'hidden' }}>
                  <View style={{ width: '100%', height: 140, backgroundColor: palette.skeletonHighlight }} />
                  <View style={{ padding: 14, gap: 8 }}>
                    <View style={{ width: '60%', height: 14, backgroundColor: palette.skeletonBase, borderRadius: 4 }} />
                    <View style={{ width: '40%', height: 10, backgroundColor: palette.skeletonHighlight, borderRadius: 4 }} />
                  </View>
                </View>
              ))}
            </View>
          )}
          {!loading && filtered.map((restaurant, index) => {
            const isOutOfZone = orderType === "DELIVERY" && zoneRestaurantIds !== null && !zoneRestaurantIds.includes(restaurant.id);
            const isClosed = restaurant.isOpen === false;
            const dimmed = isClosed || isOutOfZone;
            const activeDeal = getDealForRestaurant(restaurant.id);
            const injectDeal = (index + 1) % 4 === 0 ? homeDeals[Math.floor(index / 4) % homeDeals.length] : null;

            return (
              <View key={restaurant.id}>
                <RestaurantCard
                  restaurant={restaurant}
                  isOutOfZone={isOutOfZone}
                  dealText={activeDeal?.rewardLabel}
                  dealTone={activeDeal?.tone}
                  onPress={() => openRestaurant(restaurant.slug)}
                  containerStyle={{ opacity: dimmed ? 0.6 : 1 }}
                  isFavorite={favorites.includes(restaurant.id)}
                  onToggleFavorite={() => toggleFavorite(restaurant.id)}
                />
                {/* Option 1: Inline Feed Injection */}
                {injectDeal && (
                   <View style={{ opacity: 1, paddingHorizontal: 16, marginBottom: 20, alignItems: "center" }}>
                      <DealFlipCard deal={injectDeal} />
                   </View>
                )}
              </View>
            );
          })}

          {!loading && !filtered.length && <EmptyPanel label={t('home.empty')} />}
        </View>
      </Animated.ScrollView>

      <Animated.View
        pointerEvents={stickySearchActive ? "auto" : "none"}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 30,
          elevation: 30,
          opacity: stickySearchOpacity,
          transform: [{ translateY: stickySearchTranslateY }],
        }}
      >
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(255,248,239,0.98)", "rgba(255,248,239,0.94)", "rgba(255,248,239,0.72)", "rgba(255,248,239,0)"]}
          locations={[0, 0.38, 0.76, 1]}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View pointerEvents="box-none" style={{ paddingTop: stickySearchTopInset, paddingBottom: 12, paddingHorizontal: 20 }}>
          {renderSearchBar({
            shadowColor: palette.gold,
            shadowOpacity: 0.08,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 4,
          })}
        </View>
      </Animated.View>

      <CityModal
        open={cityModalOpen}
        cities={cities}
        selected={selectedCity?.id}
        onClose={() => setCityModalOpen(false)}
        onSelect={(city: City) => {
          setAddress(city.name, null);
          setCityModalOpen(false);
          if (city.deliveryMode === "ONLY_PICKUP") setOrderType("PICKUP");
          if (city.deliveryMode === "ONLY_DELIVERY") setOrderType("DELIVERY");
        }}
      />

      <AddressModal
        visible={addressModalOpen}
        initialValue={address}
        initialOrderType={orderType as any}
        onClose={() => setAddressModalOpen(false)}
        onSelect={async (addressText: string, selectedOrderType: any, coords: any) => {
          setOrderType(selectedOrderType);
          if (coords && selectedOrderType === "DELIVERY") {
            setAddress(addressText, coords || undefined);
            await validateZone(coords.lat, coords.lng);
          } else {
            setAddress(addressText, coords || undefined);
          }
          if (coords && selectedOrderType === "DELIVERY") {
            await rememberQuickAddress({
              street: addressText,
              latitude: coords.lat,
              longitude: coords.lng,
            });
          }
        }}
      />

      <RestaurantInfoModal restaurant={infoRestaurant} onClose={() => setInfoRestaurant(null)} />
    </>
  );
}
