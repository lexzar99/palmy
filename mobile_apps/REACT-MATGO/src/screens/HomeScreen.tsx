import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
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

import {
  AppRoute,
  City,
  PublicDeal,
  Restaurant,
} from "../types";
import { useAppStore } from "../store/useAppStore";
import { api, getImageUrl } from "../lib/api";
import { palette, styles } from "../constants/theme";


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

const cuisineFilters = ["Alla", "Pizza", "Sushi", "Kebab", "Burgare", "Pasta", "Asiatiskt"];

export default function HomeScreen({
  openRestaurant,
  openTab,
  pushRoute,
}: {
  openRestaurant: (slug: string) => void;
  openTab: (name: "home" | "search" | "cart" | "profile" | "discover") => void;
  pushRoute?: (route: AppRoute) => void;
}) {

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [deals, setDeals] = useState<PublicDeal[]>([]);
  const [personalDeals, setPersonalDeals] = useState<PersonalDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCuisine, setActiveCuisine] = useState("Alla");
  const [cityModalOpen, setCityModalOpen] = useState(false);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [infoRestaurant, setInfoRestaurant] = useState<Restaurant | null>(null);
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);

  const [zoneRestaurantIds, setZoneRestaurantIds] = useState<string[] | null>(null);
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [sponsors, setSponsors] = useState<any[]>([]);
  const promoListRef = useRef<FlatList<PromoCarouselItem> | null>(null);
  const promoIndexRef = useRef(0);

  const address = useAppStore((s) => s.address);
  const coords = useAppStore((s) => s.coords);
  const orderType = useAppStore((s) => s.orderType);
  const token = useAppStore((s) => s.token);
  const deliveryOverrides = useAppStore((s) => s.deliveryOverrides);
  const setAddress = useAppStore((s) => s.setAddress);
  const setOrderType = useAppStore((s) => s.setOrderType);
  const setPendingPromoCode = useAppStore((s) => s.setPendingPromoCode);
  const setDeliveryOverrides = useAppStore((s) => s.setDeliveryOverrides);
  const profile = useAppStore((s) => s.profile);

  const renderGreeting = () => {
    const hour = new Date().getHours();
    const name = profile?.name ? profile.name.split(" ")[0] : null;

    if (name) {
      let timeGreet = "HEJ";
      let postGreet = "VAD ÄR DU SUGEN PÅ?";
      
      if (hour < 10) { timeGreet = "GOD MORGON"; postGreet = "REDO FÖR FRUKOST? ☕️"; }
      else if (hour < 14) { timeGreet = "HEJ"; postGreet = "DAGS FÖR LUNCH? 🍱"; }
      else if (hour >= 18) { timeGreet = "KVÄLLSMAT DAGS,"; postGreet = "PIZZA-KVÄLL? 🍕"; }

      return (
        <Text>
          {timeGreet} <Text style={{ color: palette.gold }}>{name.toUpperCase()}</Text>,{"\n"}
          {postGreet}
        </Text>
      );
    }

    let mainText = "VAD SKA VI";
    let accentText = "KÄKA";
    let endText = "IDAG?";

    if (hour < 10) { mainText = "DAGS FÖR EN"; accentText = "BRA"; endText = "FRUKOST?"; }
    else if (hour < 14) { mainText = "VAD BLIR DET TILL"; accentText = "LUNCH"; endText = "IDAG?"; }

    return (
      <Text>
        {mainText} <Text style={{ color: palette.gold }}>{accentText}</Text>{"\n"}
        {endText}
      </Text>
    );
  };

  const subGreeting = useMemo(() => {
    const options = [
      "Unna dig något riktigt gott idag! 🍣",
      "Stans bästa rätter, direkt till dörren. 🍟",
      "Hungrig? Vi har maten som räddar dagen. 🌮",
      "Gör idag lite godare med MatGo! 🍦",
    ];
    return options[Math.floor(Math.random() * options.length)];
  }, []);

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
        setZoneError("Vi levererar inte till den här adressen ännu. Välj avhämtning eller prova en annan adress.");
      }
    } catch {
      setZoneRestaurantIds(null);
      setDeliveryOverrides({});
      setZoneError(null);
    }
  }, [setDeliveryOverrides]);

  useEffect(() => {
    if (orderType === "DELIVERY" && coords) {
      validateZone(coords.lat, coords.lng);
    } else {
      setZoneRestaurantIds(null);
      setZoneError(null);
    }
  }, [coords, orderType, validateZone]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [restaurantsRes, citiesRes, dealsRes, persDealsRes, sponsorsRes] = await Promise.all([
          api.get("/api/restaurants"),
          api.get("/api/cities"),
          api.get("/api/deals"),
          token
            ? api.get("/api/profile/deals", { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
          api.get("/api/sponsors").catch(() => ({ data: [] })),
        ]);
        if (!active) return;
        setRestaurants(restaurantsRes.data || []);
        setCities(citiesRes.data || []);
        setDeals((dealsRes.data || []).filter((deal: PublicDeal) => deal.isActive !== false && deal.showOnSite !== false));
        setPersonalDeals(persDealsRes.data || []);
        setSponsors(sponsorsRes.data || []);
      } catch {
        // silent — skeleton stays
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  const selectedCity = useMemo(
    () => cities.find((city) => city.name.toLowerCase() === address.toLowerCase()) || null,
    [address, cities]
  );

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

    return raw.map((r) => {
      const ovr = deliveryOverrides[r.id];
      if (!ovr) return r;
      return { ...r, deliveryFee: ovr.deliveryFee, minOrderAmount: ovr.minOrderAmount };
    });
  }, [activeCuisine, restaurants, selectedCity, orderType, zoneRestaurantIds, deliveryOverrides]);

  const featured = useMemo(() => {
    const allPremium = filtered.filter((r) => r.featuredClass === 1 || r.featuredClass === 2);
    const openPremium = allPremium.filter((r) => r.isOpen !== false);
    if (openPremium.length > 0) return openPremium.slice(0, 8);
    return allPremium.slice(0, 8);
  }, [filtered]);

  const homeDeals = useMemo<DealFlipCardData[]>(() => {
    const restaurantById = new Map(restaurants.map((restaurant) => [restaurant.id, restaurant]));

    const personalCards = personalDeals.map((deal) => {
      const campaign = deal.campaign || {};
      const campaignTitle = campaign.title || "Personligt erbjudande";
      const isWelcome = campaignTitle.toLowerCase().includes("välkomst");

      return {
        id: `personal-${deal.id || deal.code}`,
        badgeLabel: isWelcome ? "VÄLKOMST" : "PERSONLIGT",
        title: campaignTitle,
        subtitle: deal.code ? `Din kod ${deal.code}` : "Unikt erbjudande för ditt konto",
        rewardLabel: formatPersonalDealReward(deal),
        description: campaign.description || "Det här erbjudandet är kopplat till ditt konto och kan användas i kassan.",
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
          ? "Gäller i hela appen"
          : primaryRestaurant?.name || (relatedRestaurants.length > 1 ? `${relatedRestaurants.length} restauranger` : "Utvalda restauranger"),
        rewardLabel: formatPublicDealReward(deal),
        description: deal.description || "Erbjudandet aktiveras automatiskt när du uppfyller villkoren i kassan.",
        validUntil: deal.validUntil || null,
        minOrderText: deal.minOrder && deal.minOrder > 0 ? `MIN ${deal.minOrder} KR` : null,
        tags: deal.comboProductNames || [],
        tone: "purple",
        variant: "public",
        relatedRestaurantIds,
        onNavigateToFilteredRestaurants: () => {
          if (pushRoute) {
            pushRoute({ name: "discover-filtered", restaurantIds: relatedRestaurantIds, dealTitle: deal.title });
          }
        },
        onUseNow: () => {
          if (primaryRestaurant?.slug) {
            openRestaurant(primaryRestaurant.slug);
            return;
          }
          if (pushRoute) {
            pushRoute({ name: "discover" });
          }
        },
      } satisfies DealFlipCardData;
    });

    return [...personalCards, ...publicCards];
  }, [deals, openRestaurant, personalDeals, restaurants, pushRoute]);

  const promoCards = useMemo<PromoCarouselItem[]>(() => {
    const dealItems = homeDeals.map((deal) => ({ id: deal.id, kind: "deal" as const, deal }));
    const sponsorItems = sponsors.map((sponsor: any) => ({ id: `sponsor-${sponsor.id}`, kind: "sponsor" as const, sponsor }));

    if (dealItems.length === 0) return sponsorItems;
    if (sponsorItems.length === 0) return dealItems;

    const merged: PromoCarouselItem[] = [];
    let sponsorIndex = 0;

    dealItems.forEach((item, index) => {
      merged.push(item);
      const shouldInsertSponsor = (index + 1) % 2 === 0 && sponsorIndex < sponsorItems.length;
      if (shouldInsertSponsor) {
        merged.push(sponsorItems[sponsorIndex]);
        sponsorIndex += 1;
      }
    });

    while (sponsorIndex < sponsorItems.length) {
      merged.push(sponsorItems[sponsorIndex]);
      sponsorIndex += 1;
    }

    return merged;
  }, [homeDeals, sponsors]);

  const handlePromoMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / PROMO_SNAP);
    promoIndexRef.current = Math.max(0, Math.min(nextIndex, Math.max(promoCards.length - 1, 0)));
  }, [promoCards.length]);

  useEffect(() => {
    promoIndexRef.current = 0;
    if (promoCards.length <= 1) return;

    const interval = setInterval(() => {
      const nextIndex = (promoIndexRef.current + 1) % promoCards.length;
      promoIndexRef.current = nextIndex;
      promoListRef.current?.scrollToOffset({
        offset: nextIndex * PROMO_SNAP,
        animated: true,
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [promoCards.length]);

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
    outputRange: ["2%", "50%"],
  });

  // No full-page loader — render UI shell immediately, data fills in

  return (
    <>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={{ paddingTop: 14, marginBottom: 6 }}>
          {/* Compact adresspil i toppen */}
          <AddressPullDown
            onOpenFull={() => setAddressModalOpen(true)}
            zoneStatus={orderType === 'DELIVERY' ? (zoneError ? 'error' : coords ? 'ok' : null) : null}
          />

          {/* Kompakt greeting + toggle */}
          <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: palette.text, fontSize: 20, fontWeight: "900", fontStyle: "italic", letterSpacing: -0.5 }}>
                Vad blir det <Text style={{ color: palette.gold }}>idag?</Text>
              </Text>
              <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 10, fontWeight: "900", letterSpacing: 2, marginTop: 4 }}>
                HITTA SNABBT · BESTÄLL ENKELT
              </Text>
            </View>

            <View
              style={{
                backgroundColor: palette.panel,
                borderWidth: 1,
                borderColor: palette.border,
                borderRadius: 999,
                padding: 3,
                flexDirection: "row",
                position: "relative",
                height: 36,
              }}
            >
              <Animated.View
                style={{
                  position: "absolute",
                  top: 3,
                  bottom: 3,
                  left: left,
                  width: "50%",
                  backgroundColor: palette.gold,
                  borderRadius: 999,
                }}
              />
              {(
                [
                  { key: "DELIVERY", label: "LEVERANS", icon: "bicycle-outline" },
                  { key: "PICKUP", label: "HÄMTNING", icon: "storefront-outline" },
                ] as const
              ).map((item) => {
                const active = orderType === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => setOrderType(item.key)}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 14, zIndex: 2 }}
                  >
                    <Ionicons name={item.icon} size={12} color={active ? "#000" : palette.muted} />
                    <Text style={{ color: active ? "#000" : palette.muted, fontWeight: "900", fontSize: 10, letterSpacing: 1 }}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Pickup: city dropdown compact */}
          {orderType === "PICKUP" && (
            <View style={{ marginTop: 10 }}>
              <ScalePressable
                onPress={() => setCityDropdownOpen(!cityDropdownOpen)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  borderRadius: 14,
                  backgroundColor: palette.panel,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderWidth: 1,
                  borderColor: cityDropdownOpen ? palette.gold : palette.border,
                }}
              >
                <Ionicons name="business-outline" size={14} color={palette.gold} />
                <Text style={{ flex: 1, color: palette.text, fontSize: 12, fontWeight: "800" }}>
                  {selectedCity?.name || "Alla städer"}
                </Text>
                <Ionicons name={cityDropdownOpen ? "chevron-up" : "chevron-down"} size={14} color={palette.muted} />
              </ScalePressable>
              {cityDropdownOpen && (
                <View style={{ marginTop: 8, backgroundColor: palette.panel, borderRadius: 14, padding: 6, borderWidth: 1, borderColor: palette.border }}>
                  <Pressable
                    onPress={() => { setAddress("", null); setCityDropdownOpen(false); }}
                    style={{ padding: 10, borderRadius: 8, backgroundColor: !selectedCity ? "rgba(234,181,69,0.12)" : "transparent" }}
                  >
                    <Text style={{ color: !selectedCity ? palette.gold : palette.text, fontWeight: "800", fontSize: 12 }}>Alla städer</Text>
                  </Pressable>
                  {cities.map((city) => (
                    <Pressable
                      key={city.id}
                      onPress={() => { setAddress(city.name, null); setCityDropdownOpen(false); }}
                      style={{ padding: 10, borderRadius: 8, backgroundColor: selectedCity?.id === city.id ? "rgba(234,181,69,0.12)" : "transparent" }}
                    >
                      <Text style={{ color: selectedCity?.id === city.id ? palette.gold : palette.text, fontWeight: "800", fontSize: 12 }}>{city.name}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Kompakt sökbar */}
          <ScalePressable
            onPress={() => openTab("discover")}
            style={{
              marginTop: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              borderRadius: 14,
              backgroundColor: palette.panel,
              borderWidth: 1,
              borderColor: palette.border,
              paddingLeft: 14,
              paddingRight: 4,
              paddingVertical: 4,
            }}
          >
            <Ionicons name="search-outline" size={14} color={palette.muted} />
            <Text style={{ flex: 1, color: palette.muted, fontSize: 12, fontWeight: "800" }}>Sök restaurang eller maträtt</Text>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: palette.gold, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="arrow-forward" size={14} color="#000" />
            </View>
          </ScalePressable>

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

        {promoCards.length > 0 && (
          <View style={{ marginTop: 18, marginBottom: 6 }}>
            <View style={{ paddingHorizontal: 18, marginBottom: 10 }}>
              <Text style={{ color: palette.text, fontSize: 14, fontWeight: "900", letterSpacing: 2 }}>AKTUELLT</Text>
              <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: 2, marginTop: 3 }}>
                KAMPANJER &amp; PARTNERS
              </Text>
            </View>
            <FlatList
              ref={promoListRef}
              data={promoCards}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={PROMO_SNAP}
              snapToAlignment="start"
              disableIntervalMomentum
              bounces={false}
              onMomentumScrollEnd={handlePromoMomentumEnd}
              contentContainerStyle={{ paddingHorizontal: 16, paddingRight: 32 }}
              renderItem={({ item, index }) => (
                <View style={{ width: PROMO_CARD_WIDTH, marginRight: index === promoCards.length - 1 ? 0 : PROMO_CARD_GAP }}>
                  {item.kind === "sponsor" ? (
                    <SponsorTile sponsor={item.sponsor} openRestaurant={openRestaurant} pushRoute={pushRoute} />
                  ) : (
                    <View style={{ alignItems: "center" }}>
                      <DealFlipCard deal={item.deal} />
                    </View>
                  )}
                </View>
              )}
            />
          </View>
        )}

        {/* NYA SEKTIONER: discounted + free delivery */}
        <DiscountedDishesRail openRestaurant={openRestaurant} />
        <FreeDeliveryRail openRestaurant={openRestaurant} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4, marginTop: 14 }}>
          {cuisineFilters.map((filter) => (
            <ToggleChip
              key={filter}
              label={filter === "Alla" ? "ALLA RESTAURANGER" : filter.toUpperCase()}
              active={activeCuisine === filter}
              onPress={() => setActiveCuisine(filter)}
            />
          ))}
        </ScrollView>

        {!!featured.length && (
          <View style={{ marginTop: 12 }}>
            <View style={[styles.sectionTitleRow, { marginBottom: 20 }]}>
              <View>
                <Text style={{ color: palette.gold, fontSize: 28, fontWeight: "900", fontStyle: "italic" }}>HETA LISTAN</Text>
                <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "900", letterSpacing: 3, marginTop: 8 }}>TOPPVALEN I DIN STAD JUST NU</Text>
              </View>
              <ScalePressable onPress={() => openTab("discover")}>
                <Text style={{ color: palette.text, fontSize: 12, fontWeight: "900", borderBottomWidth: 1, borderBottomColor: palette.goldDark, paddingBottom: 4 }}>VISA ALLA</Text>
              </ScalePressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 4 }}>
              {featured.map((restaurant) => {
                const isOutOfZone = orderType === "DELIVERY" && zoneRestaurantIds !== null && !zoneRestaurantIds.includes(restaurant.id);
                const isClosed = restaurant.isOpen === false;
                const dimmed = isClosed || isOutOfZone;
                return (
                  <RestaurantCard
                    key={restaurant.id}
                    restaurant={restaurant}
                    isOutOfZone={isOutOfZone}
                    onPress={() => openRestaurant(restaurant.slug)}
                    containerStyle={{ width: 320, opacity: dimmed ? 0.6 : 1 }}
                  />
                );
              })}
            </ScrollView>
          </View>
        )}

        <View style={styles.sectionTitleRow}>
          <Text style={{ color: palette.muted, fontSize: 17, fontWeight: "900", letterSpacing: 3 }}>
            {(activeCuisine === "Alla" ? "ALLA RESTAURANGER" : activeCuisine.toUpperCase()) + ` / ${filtered.length} ST`}
          </Text>
        </View>

        {loading && (
          <View style={{ alignItems: "center", paddingVertical: 40, gap: 12 }}>
            <ActivityIndicator size="large" color={palette.gold} />
            <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase" }}>Laddar restauranger...</Text>
          </View>
        )}
        {!loading && filtered.map((restaurant) => {
          const isOutOfZone = orderType === "DELIVERY" && zoneRestaurantIds !== null && !zoneRestaurantIds.includes(restaurant.id);
          const isClosed = restaurant.isOpen === false;
          const dimmed = isClosed || isOutOfZone;
          return (
            <RestaurantCard
              key={restaurant.id}
              restaurant={restaurant}
              isOutOfZone={isOutOfZone}
              onPress={() => openRestaurant(restaurant.slug)}
              containerStyle={{ opacity: dimmed ? 0.6 : 1, marginBottom: 20 }}
            />
          );
        })}

        {!loading && !filtered.length && <EmptyPanel label="Ingen träff. Här ekar det tomt just nu." />}
      </ScrollView>

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
        onSelect={(addressText: string, selectedOrderType: any, coords: any) => {
          setOrderType(selectedOrderType);
          setAddress(addressText, coords || undefined);
        }}
      />

      <RestaurantInfoModal restaurant={infoRestaurant} onClose={() => setInfoRestaurant(null)} />
    </>
  );
}
