import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  LayoutAnimation,
  FlatList,
  Image,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { io, Socket } from "socket.io-client";
import {
  API_URL,
  SOCKET_URL,
  STRIPE_PUBLISHABLE_KEY,
  WEB_URL,
  api,
  getImageUrl,
} from "./src/lib/api";
import DealFlipCard, { type DealFlipCardData } from "./src/components/DealFlipCard";
import {
  AppRoute,
  CartItem,
  City,
  DeliveryCheck,
  MenuCategory,
  MenuExtra,
  MenuExtraGroup,
  MenuProduct,
  Order,
  OrderType,
  Profile,
  PublicDeal,
  Restaurant,
  ReviewPayload,
} from "./src/types";
import { useAppStore } from "./src/store/useAppStore";
import { AppStripeProvider, useAppPaymentSheet } from "./src/lib/stripeProvider";

const palette = {
  bg: "#0b0a0f",
  panel: "#17151d",
  panelMuted: "#1f1b27",
  card: "#221d2c",
  border: "#322b3e",
  text: "#f9f7f3",
  muted: "#b2a8bf",
  gold: "#e7b24b",
  goldDark: "#a8741d",
  success: "#22c55e",
  danger: "#ef4444",
  info: "#38bdf8",
};

const cuisineFilters = ["Alla", "Pizza", "Sushi", "Kebab", "Burgare", "Pasta", "Asiatiskt"];

function ScalePressable({ children, onPress, style }: { children: React.ReactNode; onPress?: () => void; style?: any }) {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => {
    Animated.timing(scale, { toValue: 0.92, duration: 80, useNativeDriver: Platform.OS !== "web" }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, friction: 3, tension: 150, useNativeDriver: Platform.OS !== "web" }).start();
  };

  const flattened = StyleSheet.flatten(style) || {};
  const {
    margin,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    marginHorizontal,
    marginVertical,
    width,
    height,
    flex,
    flexGrow,
    flexShrink,
    alignSelf,
    position,
    top,
    bottom,
    left,
    right,
    zIndex,
    ...contentStyle
  } = flattened as any;

  const pressableStyle = {
    margin,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    marginHorizontal,
    marginVertical,
    width,
    height,
    flex,
    flexGrow,
    flexShrink,
    alignSelf,
    position,
    top,
    bottom,
    left,
    right,
    zIndex,
  };

  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut} style={pressableStyle}>
      <Animated.View style={[{ transform: [{ scale }] }, contentStyle, { flex: 1 }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

type PaymentButtonProps = {
  amount: number;
  disabled: boolean;
  onPaid: (paymentIntentId: string) => Promise<void>;
};

function PaymentButton({ amount, disabled, onPaid }: PaymentButtonProps) {
  const { initPaymentSheet, presentPaymentSheet } = useAppPaymentSheet();
  const [busy, setBusy] = useState(false);

  const handlePay = useCallback(async () => {
    if (disabled || busy) return;
    setBusy(true);
    try {
      // PAYMENT BYPASSED FOR APP TESTING
      // Backend recognises FREE_PROMO + discountCode "testa" as isTestOrder = true,
      // which skips Stripe verification entirely (see routes/orders.ts).
      await onPaid("FREE_PROMO");
      
      /* 
      // Original Stripe logic preserved but disabled for launch
      const intentRes = await api.post("/api/payments/create-intent", { amount });
      const clientSecret = intentRes.data?.clientSecret;
      const paymentIntentId = intentRes.data?.paymentIntentId || intentRes.data?.id || "PAYMENT_INTENT";

      if (!clientSecret) throw new Error("Betalningen kunde inte initieras.");

      const init = await initPaymentSheet({
        merchantDisplayName: "MatGo",
        paymentIntentClientSecret: clientSecret,
        defaultBillingDetails: { name: "MatGo customer" },
      });

      if (init.error) throw new Error(init.error.message);

      const present = await presentPaymentSheet();
      if (present.error) throw new Error(present.error.message);

      await onPaid(paymentIntentId);
      */
    } catch (error: any) {
      Alert.alert("Slutförande misslyckades", error?.message || "Försök igen om en stund.");
    } finally {
      setBusy(false);
    }
  }, [amount, busy, disabled, initPaymentSheet, onPaid, presentPaymentSheet]);

  return (
    <PrimaryButton
      label={busy ? "Skickar order..." : `Beställ nu — ${Math.round(amount)} kr`}
      onPress={handlePay}
      disabled={disabled || busy}
      icon="card-outline"
    />
  );
}

function AppContent() {
  const [routeStack, setRouteStack] = useState<AppRoute[]>([{ name: "home" }]);
  const route = routeStack[routeStack.length - 1];
  const hydrated = useAppStore((s) => s.hydrated);
  const hydrate = useAppStore((s) => s.hydrate);

  useEffect(() => {
    hydrate().catch(() => {});
  }, [hydrate]);

  const pushRoute = useCallback((next: AppRoute) => {
    setRouteStack((current) => [...current, next]);
  }, []);

  const replaceRoute = useCallback((next: AppRoute) => {
    setRouteStack((current) => [...current.slice(0, current.length - 1), next]);
  }, []);

  const goBack = useCallback(() => {
    setRouteStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
  }, []);

  const openRoot = useCallback((name: "home" | "search" | "cart" | "profile" | "discover") => {
    setRouteStack([{ name }]);
  }, []);

  if (!hydrated) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={[styles.appBg, styles.loaderWrap]}>
          <ActivityIndicator color={palette.gold} />
        </View>
      </SafeAreaView>
    );
  }

  const tabValue = route.name === "restaurant" || route.name === "order" || route.name === "register" ? "home" : route.name;

  return (
    <SafeAreaView style={styles.safe}>
      <ExpoStatusBar style="light" />
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={["#120f18", "#09080c"]} style={styles.appBg}>
        {route.name === "home" && <HomeScreen openRestaurant={(slug) => pushRoute({ name: "restaurant", slug })} openTab={openRoot} />}
        {route.name === "discover" && <DiscoverScreen openRestaurant={(slug) => pushRoute({ name: "restaurant", slug })} goBack={goBack} />}
        {route.name === "search" && <SearchScreen openRestaurant={(slug) => pushRoute({ name: "restaurant", slug })} />}
        {route.name === "restaurant" && (
          <RestaurantScreen
            slug={route.slug}
            goBack={goBack}
            openCart={() => pushRoute({ name: "cart" })}
          />
        )}
        {route.name === "cart" && (
          <CartScreen
            openProfile={() => pushRoute({ name: "profile" })}
            openOrder={(id) => replaceRoute({ name: "order", id })}
            openHome={() => openRoot("home")}
          />
        )}
        {route.name === "profile" && (
          <ProfileScreen
            openRegister={() => pushRoute({ name: "register" })}
            openOrder={(id) => pushRoute({ name: "order", id })}
            openCart={() => openRoot("cart")}
          />
        )}
        {route.name === "register" && <RegisterScreen goBack={goBack} onRegistered={() => replaceRoute({ name: "profile" })} />}
        {route.name === "order" && (
          <OrderScreen 
            id={route.id} 
            goBack={() => {
              if (routeStack.length > 1) goBack();
              else openRoot("home");
            }} 
          />
        )}

        {!["restaurant", "order", "register"].includes(route.name) && (
          <BottomTabs active={tabValue} onChange={openRoot} />
        )}
      </LinearGradient>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <AppStripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} urlScheme="reactmatgo">
      <AppContent />
    </AppStripeProvider>
  );
}

const DISCOVER_CATEGORIES = [
  { name: "Pizza", icon: "pizza-outline" as const, tint: "#ef4444", bg: "#2c1217" },
  { name: "Burgare", icon: "fast-food-outline" as const, tint: "#f59e0b", bg: "#33200d" },
  { name: "Sallad", icon: "leaf-outline" as const, tint: "#22c55e", bg: "#123020" },
  { name: "Sushi", icon: "fish-outline" as const, tint: "#38bdf8", bg: "#132b36" },
  { name: "Kebab", icon: "restaurant-outline" as const, tint: "#f97316", bg: "#351b12" },
  { name: "Snabbmat", icon: "bicycle-outline" as const, tint: "#a855f7", bg: "#251434" },
];

const COUNTRY_CODES = [
  { code: "+46", flag: "🇸🇪" },
  { code: "+47", flag: "🇳🇴" },
  { code: "+45", flag: "🇩🇰" },
  { code: "+1", flag: "🇺🇸" },
];

const APP_AUTH_DEEP_LINK = "matgo://auth";

type SavedAddress = {
  id: string;
  label: string;
  street: string;
  city: string;
  zip: string;
  note?: string | null;
  isDefault?: boolean;
};

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

const dayOrder = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const dayLabels: Record<string, string> = {
  monday: "Mån",
  tuesday: "Tis",
  wednesday: "Ons",
  thursday: "Tors",
  friday: "Fre",
  saturday: "Lör",
  sunday: "Sön",
};

function sortRestaurantsForHome(restaurants: Restaurant[]) {
  return [...restaurants].sort((a, b) => {
    const aOpen = a.isOpen !== false ? 1 : 0;
    const bOpen = b.isOpen !== false ? 1 : 0;
    
    // 1. Prioritize OPEN status above all else
    if (aOpen !== bOpen) return bOpen - aOpen;

    // 2. Among restaurants with the same open status, prioritize Premium (1) then Standard (2)
    const aRank = a.featuredClass === 1 ? 2 : (a.featuredClass === 2 ? 1 : 0);
    const bRank = b.featuredClass === 1 ? 2 : (b.featuredClass === 2 ? 1 : 0);
    
    if (aRank !== bRank) return bRank - aRank;

    // 3. Alphabetical fallback
    return a.name.localeCompare(b.name);
  });
}

function getRestaurantDeal(deals: PublicDeal[], restaurantId?: string) {
  return deals.find(
    (deal) =>
      deal.isGlobal ||
      deal.restaurantId === restaurantId ||
      !!(restaurantId && deal.applicableRestaurantIds?.includes(restaurantId))
  );
}

function formatPublicDealReward(deal: PublicDeal) {
  if (deal.discountType === "FIXED") {
    return `${Number(deal.discountValue || 0).toFixed(0)} KR RABATT`;
  }

  return `${Number(deal.discountValue || 0).toFixed(0)}% RABATT`;
}

function formatPersonalDealReward(deal: PersonalDeal) {
  const campaign = deal.campaign || {};
  if (campaign.discountType === "FIXED") {
    return `${Number(campaign.discountValue || 0).toFixed(0)} KR RABATT`;
  }

  return `${Number(campaign.discountValue || 0).toFixed(0)}% RABATT`;
}

function getTodayOpeningPreview(restaurant?: Restaurant | null) {
  const regular = restaurant?.openingHours?.regular;
  if (!regular) return null;
  const todayKey = dayOrder[new Date().getDay()];
  const today = regular[todayKey];
  if (!today) return null;
  if (today.closed || !today.shifts?.length) return "Stängt idag";
  return today.shifts.map((shift) => `${shift.open}-${shift.close}`).join(", ");
}

function getOpeningHoursLines(restaurant?: Restaurant | null) {
  const regular = restaurant?.openingHours?.regular;
  if (!regular) return [];
  return dayOrder.map((day) => {
    const config = regular[day];
    if (!config || config.closed || !config.shifts?.length) {
      return `${dayLabels[day]}: Stängt`;
    }
    return `${dayLabels[day]}: ${config.shifts.map((shift) => `${shift.open}-${shift.close}`).join(", ")}`;
  });
}

function HomeScreen({
  openRestaurant,
  openTab,
}: {
  openRestaurant: (slug: string) => void;
  openTab: (name: "home" | "search" | "cart" | "profile" | "discover") => void;
}) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [deals, setDeals] = useState<PublicDeal[]>([]);
  const [personalDeals, setPersonalDeals] = useState<PersonalDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCuisine, setActiveCuisine] = useState("Alla");
  const [cityModalOpen, setCityModalOpen] = useState(false);
  const [infoRestaurant, setInfoRestaurant] = useState<Restaurant | null>(null);

  const address = useAppStore((s) => s.address);
  const orderType = useAppStore((s) => s.orderType);
  const token = useAppStore((s) => s.token);
  const setAddress = useAppStore((s) => s.setAddress);
  const setOrderType = useAppStore((s) => s.setOrderType);
  const setPendingPromoCode = useAppStore((s) => s.setPendingPromoCode);
  const cartCount = useAppStore((s) => s.items.reduce((sum, item) => sum + item.quantity, 0));

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [restaurantsRes, citiesRes, dealsRes, persDealsRes] = await Promise.all([
          api.get("/api/restaurants"),
          api.get("/api/cities"),
          api.get("/api/deals"),
          token ? api.get("/api/profile/deals", { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        ]);
        if (!active) return;
        setRestaurants(restaurantsRes.data || []);
        setCities(citiesRes.data || []);
        setDeals((dealsRes.data || []).filter((deal: PublicDeal) => deal.isActive !== false && deal.showOnSite !== false));
        setPersonalDeals(persDealsRes.data || []);
      } catch (error) {
        Alert.alert("Kunde inte ladda", "MatGo kunde inte nå samma restaurang-API som webbappen använder.");
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
    return sortRestaurantsForHome(
      restaurants
      .filter((restaurant) => {
        const byCuisine =
          activeCuisine === "Alla" ||
          (restaurant.cuisine || "").toLowerCase().includes(activeCuisine.toLowerCase()) ||
          (restaurant.tags || []).some((tag) => tag.toLowerCase().includes(activeCuisine.toLowerCase()));
        const byCity = !selectedCity || (restaurant.city || "").toLowerCase() === selectedCity.name.toLowerCase();
        return byCuisine && byCity;
      })
    );
  }, [activeCuisine, restaurants, selectedCity]);

  const featured = useMemo(() => {
    const allPremium = filtered.filter(r => r.featuredClass === 1 || r.featuredClass === 2);
    const openPremium = allPremium.filter(r => r.isOpen !== false);
    
    // If there are ANY open premium restaurants, show ONLY open ones.
    // Otherwise fallback to showing closed premium ones (so list isn't empty).
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
        tone: isWelcome ? "gold" : "emerald",
        onUseNow: () => {
          setPendingPromoCode(deal.code);
          openTab("cart");
        },
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
        tone: deal.isGlobal ? "gold" : "emerald",
        onUseNow: () => {
          if (primaryRestaurant?.slug) {
            openRestaurant(primaryRestaurant.slug);
            return;
          }

          openTab("discover");
        },
      } satisfies DealFlipCardData;
    });

    return [...personalCards, ...publicCards];
  }, [deals, openRestaurant, openTab, personalDeals, restaurants, setPendingPromoCode]);

  const toggleAnim = useRef(new Animated.Value(orderType === "DELIVERY" ? 0 : 1)).current;

  useEffect(() => {
    Animated.spring(toggleAnim, {
      toValue: orderType === "DELIVERY" ? 0 : 1,
      useNativeDriver: false,
      friction: 8,
      tension: 40,
    }).start();
  }, [orderType]);

  const left = toggleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["2%", "50%"],
  });

  return (
    <>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={{ paddingTop: 8 }}>
          <View
            style={{
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 18,
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: "#2a2318",
              borderWidth: 1,
              borderColor: "#5b4726",
              marginBottom: 16,
            }}
          >
            <Ionicons name="sparkles-outline" size={15} color={palette.gold} />
            <Text style={{ color: palette.gold, fontSize: 11, fontWeight: "900", letterSpacing: 4 }}>SMAKA FRAMTIDEN</Text>
          </View>

          <Text style={{ color: palette.text, fontSize: 44, lineHeight: 44, fontWeight: "900" }}>VAD VILL DU</Text>
          <Text style={{ fontSize: 44, lineHeight: 44, fontWeight: "900" }}>
            <Text style={{ color: palette.gold }}>ÄTA</Text>
            <Text style={{ color: palette.text }}> IDAG?</Text>
          </Text>

          <View
            style={{
              marginTop: 22,
              backgroundColor: "#17171b",
              borderWidth: 1,
              borderColor: "#2a2a31",
              borderRadius: 999,
              padding: 6,
              flexDirection: "row",
              position: "relative",
              height: 64,
            }}
          >
            <Animated.View
              style={{
                position: "absolute",
                top: 6,
                bottom: 6,
                left: left,
                width: "48%",
                backgroundColor: palette.gold,
                borderRadius: 999,
              }}
            />
            {([
              { key: "DELIVERY", label: "LEVERANS", icon: "car-outline" },
              { key: "PICKUP", label: "HÄMTNING", icon: "storefront-outline" },
            ] as const).map((item) => {
              const active = orderType === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setOrderType(item.key)}
                  style={{
                    flex: 1,
                    borderRadius: 999,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    zIndex: 2,
                  }}
                >
                  <Ionicons name={item.icon} size={20} color={active ? "#000" : "#6e6a77"} />
                  <Text style={{ color: active ? "#000" : "#6e6a77", fontWeight: "900", fontSize: 14 }}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View
             style={{
               marginTop: 12,
               borderRadius: 18,
               padding: 6,
               backgroundColor: "rgba(24,24,27,0.8)",
               borderWidth: 1,
               borderColor: "rgba(255,255,255,0.05)",
             }}
          >
            <ScalePressable
              onPress={() => setCityModalOpen(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                borderRadius: 20,
                backgroundColor: "#101015",
                paddingHorizontal: 16,
                paddingVertical: 14,
                marginBottom: 10,
              }}
            >
              <Ionicons name="location-outline" size={18} color={palette.gold} />
              <Text numberOfLines={1} style={{ flex: 1, color: address ? palette.text : "#6e6a77", fontSize: 14, fontWeight: "800" }}>
                {address || "Ange din adress..."}
              </Text>
            </ScalePressable>

            <ScalePressable
              onPress={() => openTab("discover")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                borderRadius: 20,
                backgroundColor: "#101015",
                paddingLeft: 16,
                paddingRight: 6,
                paddingVertical: 6,
              }}
            >
              <Ionicons name="search-outline" size={18} color="#5f5b66" />
              <Text style={{ flex: 1, color: "#5f5b66", fontSize: 14, fontWeight: "800" }}>Sök restaurang eller rätt...</Text>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: palette.gold,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="arrow-forward" size={18} color="#000" />
              </View>
            </ScalePressable>
          </View>
        </View>

        {!!homeDeals.length && (
          <View style={{ marginTop: 10, marginBottom: 8 }}>
            <View style={[styles.sectionTitleRow, { marginBottom: 16 }]}> 
              <View>
                <Text style={{ color: palette.text, fontSize: 17, fontWeight: "900", letterSpacing: 3 }}>ERBJUDANDEN</Text>
                <Text style={{ color: "#6f667d", fontSize: 10, fontWeight: "900", letterSpacing: 2, marginTop: 6 }}>
                  PERSONLIGA OCH PUBLIKA DEALS JUST NU
                </Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalCards}>
              {homeDeals.map((deal) => (
                <DealFlipCard key={deal.id} deal={deal} />
              ))}
            </ScrollView>
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
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
                <Text style={{ color: "#6f667d", fontSize: 11, fontWeight: "900", letterSpacing: 3, marginTop: 8 }}>
                  TOPPVALEN I DIN STAD JUST NU
                </Text>
              </View>
              <ScalePressable onPress={() => openTab("discover")}>
                <Text style={{ color: palette.text, fontSize: 12, fontWeight: "900", borderBottomWidth: 1, borderBottomColor: "#74521d", paddingBottom: 4 }}>
                  VISA ALLA
                </Text>
              </ScalePressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalCards}>
              {featured.map((restaurant) => {
                const deal = getRestaurantDeal(deals, restaurant.id);
                return (
                  <ScalePressable
                    key={restaurant.id}
                    onPress={() => openRestaurant(restaurant.slug)}
                    style={{
                      width: 300,
                      backgroundColor: "#19191d",
                      borderRadius: 34,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.06)",
                      padding: 14,
                      opacity: restaurant.isOpen === false ? 0.5 : 1, // Dim closed restaurants
                    }}
                  >
                    <View style={{ height: 200, borderRadius: 24, overflow: "hidden", marginBottom: 18, backgroundColor: "#111015" }}>
                      {!!(restaurant.heroImageUrl || restaurant.imageUrl) && (
                        <Image source={{ uri: getImageUrl(restaurant.heroImageUrl || restaurant.imageUrl) }} style={{ width: "100%", height: "100%" }} />
                      )}
                      <View style={{ position: "absolute", top: 12, left: 12 }}>
                        <View
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 12,
                            backgroundColor: restaurant.isOpen === false ? "rgba(220,38,38,0.85)" : "rgba(16,185,129,0.85)",
                          }}
                        >
                          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "900" }}>
                            {restaurant.isOpen === false ? "STÄNGD" : "ÖPPET"}
                          </Text>
                        </View>
                      </View>
                      <View style={{ position: "absolute", top: 12, right: 12 }}>
                         <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.6)", flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Ionicons name="star" size={13} color={palette.gold} />
                            <Text style={{ color: palette.gold, fontSize: 12, fontWeight: "900" }}>{restaurant.rating || "5.0"}</Text>
                         </View>
                      </View>
                    </View>

                    <Text style={{ color: palette.text, fontSize: 22, fontWeight: "900" }} numberOfLines={1}>{restaurant.name.toUpperCase()}</Text>
                    <Text style={{ color: "#6f667d", fontSize: 11, fontWeight: "800", marginTop: 4 }}>{(restaurant.cuisine || "MATGO SELECTION").toUpperCase()}</Text>
                    
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.04)" }}>
                       <View style={{ flexDirection: "row", gap: 16 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                             <Ionicons name="time-outline" size={14} color={palette.gold} />
                             <Text style={{ color: "#9c96a5", fontSize: 11, fontWeight: "900" }}>{Math.round(restaurant.etaMinutes || 30)} MIN</Text>
                          </View>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                             <Ionicons name="bicycle-outline" size={14} color={palette.gold} />
                             <Text style={{ color: "#9c96a5", fontSize: 11, fontWeight: "900" }}>{Math.round(restaurant.deliveryFee || 0)} KR</Text>
                          </View>
                       </View>
                       <Ionicons name="chevron-forward" size={18} color={palette.gold} />
                    </View>
                  </ScalePressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        <View style={styles.sectionTitleRow}>
          <Text style={{ color: "#6f667d", fontSize: 17, fontWeight: "900", letterSpacing: 3 }}>
            {(activeCuisine === "Alla" ? "ALLA RESTAURANGER" : activeCuisine.toUpperCase()) + ` / ${filtered.length} ST`}
          </Text>
        </View>
        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={palette.gold} />
          </View>
        ) : (
          filtered.map((restaurant) => {
            const todayHours = getTodayOpeningPreview(restaurant);
            return (
              <ScalePressable
                key={restaurant.id}
                onPress={() => openRestaurant(restaurant.slug)}
                style={{
                  backgroundColor: "#19191d",
                  borderRadius: 36,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.05)",
                  padding: 14,
                  marginBottom: 18,
                  opacity: restaurant.isOpen === false ? 0.5 : 1, // Dim closed restaurants
                }}
              >
                <View style={{ height: 230, borderRadius: 28, overflow: "hidden", backgroundColor: "#111015" }}>
                  {!!(restaurant.heroImageUrl || restaurant.imageUrl) && (
                    <Image source={{ uri: getImageUrl(restaurant.heroImageUrl || restaurant.imageUrl) }} style={{ width: "100%", height: "100%" }} />
                  )}
                </View>

                <View style={{ paddingHorizontal: 10, paddingTop: 20, gap: 10 }}>
                   <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={{ color: restaurant.featuredClass === 1 || restaurant.featuredClass === 2 ? palette.gold : palette.text, fontSize: 24, fontWeight: "900", flex: 1 }} numberOfLines={1}>
                        {restaurant.name.toUpperCase()}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <View
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 10,
                            backgroundColor: restaurant.isOpen === false ? "rgba(220,38,38,0.15)" : "rgba(16,185,129,0.15)",
                          }}
                        >
                          <Text style={{ color: restaurant.isOpen === false ? "#fb7185" : "#10b981", fontSize: 10, fontWeight: "900" }}>
                            {restaurant.isOpen === false ? "STÄNGD" : "ÖPPET"}
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(231,178,75,0.1)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 }}>
                           <Ionicons name="star" size={14} color={palette.gold} />
                           <Text style={{ color: palette.gold, fontSize: 13, fontWeight: "900" }}>{restaurant.rating || "5.0"}</Text>
                        </View>
                      </View>
                   </View>
                   
                   <Text style={{ color: "#6f667d", fontSize: 12, fontWeight: "800" }}>{(restaurant.description || restaurant.cuisine || "MATGO SELECTION").toUpperCase()}</Text>

                   <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.03)" }}>
                      <View style={{ flexDirection: "row", gap: 20 }}>
                         <Text style={{ color: "#9c96a5", fontSize: 12, fontWeight: "900" }}>{Math.round(restaurant.etaMinutes || 30)} MIN</Text>
                         <Text style={{ color: "#9c96a5", fontSize: 12, fontWeight: "900" }}>{Math.round(restaurant.deliveryFee || 0)} KR</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="#6e6a77" />
                   </View>
                </View>
              </ScalePressable>
            );
          })
        )}

        {!loading && !filtered.length && <EmptyPanel label="Ingen träff. Här ekar det tomt just nu." />}
      </ScrollView>

      <CityModal
        open={cityModalOpen}
        cities={cities}
        selected={selectedCity?.id}
        onClose={() => setCityModalOpen(false)}
        onSelect={(city) => {
          setAddress(city.name, null);
          setCityModalOpen(false);
          if (city.deliveryMode === "ONLY_PICKUP") setOrderType("PICKUP");
          if (city.deliveryMode === "ONLY_DELIVERY") setOrderType("DELIVERY");
        }}
      />

      <RestaurantInfoModal restaurant={infoRestaurant} onClose={() => setInfoRestaurant(null)} />
    </>
  );
}

function DiscoverScreen({ openRestaurant, goBack }: { openRestaurant: (slug: string) => void; goBack: () => void }) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeSearch, setActiveSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const token = useAppStore((s) => s.token);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [restaurantsRes, ordersRes] = await Promise.all([
          api.get("/api/restaurants"),
          token ? api.get("/api/profile/orders", { headers: { Authorization: `Bearer ${token}` } }) : Promise.resolve({ data: [] }),
        ]);
        if (!active) return;
        setRestaurants(restaurantsRes.data || []);
        setOrders(ordersRes.data || []);
      } catch {
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  const recentOrders = orders.slice(0, 3);
  const filteredRestaurants = restaurants.filter((restaurant) => {
    const haystack = `${restaurant.name} ${restaurant.cuisine || ""} ${(restaurant.tags || []).join(" ")}`.toLowerCase();
    return haystack.includes(activeSearch.toLowerCase());
  });

  const trendingRestaurants = [...restaurants].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 5);

  return (
    <ScreenWrap>
      <View style={{ paddingTop: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <View>
            <Text style={{ fontSize: 34, fontWeight: "900" }}>
              <Text style={{ color: palette.text }}>UPPTÄCK</Text>
              <Text style={{ color: palette.gold }}>MATGO</Text>
            </Text>
            <Text style={{ color: "#6f667d", fontSize: 11, fontWeight: "900", letterSpacing: 2, marginTop: 6 }}>
              HITTA DIN NÄSTA FAVORITUPPLEVELSE
            </Text>
          </View>
          <Pressable
            onPress={goBack}
            style={{
              width: 58,
              height: 58,
              borderRadius: 20,
              backgroundColor: "#17171b",
              borderWidth: 1,
              borderColor: "#2b2a31",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="compass-outline" size={26} color={palette.gold} />
          </Pressable>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            borderRadius: 30,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            backgroundColor: "#17171b",
            paddingHorizontal: 20,
            paddingVertical: 16,
            marginBottom: 18,
          }}
        >
          <Ionicons name="search-outline" size={24} color="#6f667d" />
          <TextInput
            value={activeSearch}
            onChangeText={setActiveSearch}
            placeholder="Sök restauranger, rätter eller smaker..."
            placeholderTextColor="#6f667d"
            style={{ flex: 1, color: palette.text, fontSize: 16, fontWeight: "700", marginBottom: 0, padding: 0 }}
          />
        </View>
      </View>

      {loading && (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={palette.gold} />
        </View>
      )}



      {!loading && !activeSearch && (
        <View style={{ marginTop: 10 }}>
          <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900", letterSpacing: 2, marginBottom: 16 }}>KATEGORIER</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
            {DISCOVER_CATEGORIES.map((category) => (
              <ScalePressable
                key={category.name}
                onPress={() => setActiveSearch(category.name)}
                style={{
                  width: 100,
                  height: 120,
                  borderRadius: 24,
                  backgroundColor: "#19191d",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.05)",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 14,
                    backgroundColor: category.bg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name={category.icon as any} size={22} color={category.tint} />
                </View>
                <Text style={{ color: "#b8b2c2", fontSize: 11, fontWeight: "900", letterSpacing: 0.5 }}>{category.name.toUpperCase()}</Text>
              </ScalePressable>
            ))}
          </ScrollView>
        </View>
      )}

      {!loading && !activeSearch && (
        <View style={{ marginTop: 16 }}>
          <View style={[styles.sectionTitleRow, { marginBottom: 18 }]}>
            <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900", letterSpacing: 2 }}>POPULÄRT JUST NU</Text>
          </View>
          {trendingRestaurants.map((restaurant) => (
            <ScalePressable
              key={restaurant.id}
              onPress={() => openRestaurant(restaurant.slug)}
              style={{
                backgroundColor: "#19191d",
                borderRadius: 30,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.05)",
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                gap: 16,
                marginBottom: 14,
              }}
            >
              <View style={{ width: 82, height: 82, borderRadius: 24, overflow: "hidden", backgroundColor: "#111015" }}>
                {!!(restaurant.heroImageUrl || restaurant.imageUrl) && (
                  <Image source={{ uri: getImageUrl(restaurant.heroImageUrl || restaurant.imageUrl) }} style={{ width: "100%", height: "100%" }} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Text style={{ color: palette.text, fontSize: 19, fontWeight: "900" }}>{restaurant.name.toUpperCase()}</Text>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 12,
                      backgroundColor: restaurant.isOpen === false ? "rgba(244,63,94,0.15)" : "rgba(16,185,129,0.15)",
                    }}
                  >
                    <Text style={{ color: restaurant.isOpen === false ? "#fb7185" : "#10b981", fontSize: 10, fontWeight: "900" }}>
                      {restaurant.isOpen === false ? "STÄNGD" : "ÖPPET"}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="star" size={12} color={palette.gold} />
                  <Text style={{ color: palette.gold, fontSize: 12, fontWeight: "900" }}>
                    {restaurant.rating ? restaurant.rating.toFixed(1) : "Ny"}
                  </Text>
                  <Text style={{ color: "#7f798a", fontSize: 12, fontWeight: "700" }}>{(restaurant.city || "").toUpperCase()}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward-outline" size={20} color={palette.gold} />
            </ScalePressable>
          ))}
        </View>
      )}

      {!loading && !!activeSearch && (
        <View style={{ marginTop: 16 }}>
          <View style={styles.sectionTitleRow}>
            <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900", letterSpacing: 2 }}>
              SÖKRESULTAT FÖR "{activeSearch.toUpperCase()}"
            </Text>
            <Pressable onPress={() => setActiveSearch("")}>
              <Text style={{ color: "#7f798a", fontSize: 12, fontWeight: "900" }}>RENSA</Text>
            </Pressable>
          </View>
          {filteredRestaurants.length === 0 ? (
            <EmptyPanel label="Inga restauranger hittade. Prova att söka på något annat." />
          ) : (
            filteredRestaurants.map((restaurant) => (
              <RestaurantCard key={restaurant.id} restaurant={restaurant} onPress={() => openRestaurant(restaurant.slug)} />
            ))
          )}
        </View>
      )}
    </ScreenWrap>
  );
}

function SearchScreen({ openRestaurant }: { openRestaurant: (slug: string) => void }) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await api.get("/api/restaurants");
        if (active) setRestaurants(response.data || []);
      } catch {}
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = restaurants.filter((restaurant) => {
    const haystack = `${restaurant.name} ${restaurant.cuisine || ""} ${restaurant.description || ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  return (
    <ScreenWrap>
      <View style={{ paddingTop: 8 }}>
        <Header title="SÖK" subtitle="Hitta din nästa måltid" />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            borderRadius: 30,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            backgroundColor: "#17171b",
            paddingHorizontal: 20,
            paddingVertical: 16,
            marginBottom: 18,
          }}
        >
          <Ionicons name="search-outline" size={24} color="#6f667d" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Sök restauranger, rätter eller smaker..."
            placeholderTextColor="#6f667d"
            style={{ flex: 1, color: palette.text, fontSize: 16, fontWeight: "700", marginBottom: 0, padding: 0 }}
          />
          {!!query && (
            <Pressable onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={20} color="#6f667d" />
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={palette.gold} />
        </View>
      ) : (
        <>
          {!query && (
            <View style={{ marginTop: 10 }}>
              <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900", letterSpacing: 2, marginBottom: 16 }}>KATEGORIER</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 14 }}>
                {DISCOVER_CATEGORIES.map((category) => (
                  <ScalePressable
                    key={category.name}
                    onPress={() => setQuery(category.name)}
                    style={{
                      width: "47%",
                      minHeight: 140,
                      borderRadius: 22,
                      backgroundColor: "#19191d",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.05)",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 12,
                    }}
                  >
                    <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: category.bg, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name={category.icon as any} size={24} color={category.tint} />
                    </View>
                    <Text style={{ color: "#b8b2c2", fontSize: 12, fontWeight: "900", letterSpacing: 1 }}>{category.name.toUpperCase()}</Text>
                  </ScalePressable>
                ))}
              </View>
            </View>
          )}

          {!!query && (
            <View style={{ marginTop: 10 }}>
               {filtered.length === 0 ? (
                 <EmptyPanel label="Inga restauranger hittade. Prova något annat." />
               ) : (
                 filtered.map((restaurant) => (
                   <RestaurantCard key={restaurant.id} restaurant={restaurant} onPress={() => openRestaurant(restaurant.slug)} />
                 ))
               )}
            </View>
          )}
        </>
      )}
    </ScreenWrap>
  );
}

function RestaurantScreen({
  slug,
  goBack,
  openCart,
}: {
  slug: string;
  goBack: () => void;
  openCart: () => void;
}) {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [deals, setDeals] = useState<PublicDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<MenuProduct | null>(null);

  const menuScrollRef = useRef<ScrollView | null>(null);
  const categoryPositions = useRef<Record<string, number>>({});

  const address = useAppStore((s) => s.address);
  const cartItems = useAppStore((s) => s.items);

  useEffect(() => {
    let active = true;
    let socket: Socket | null = null;

    (async () => {
      try {
        const [menuRes, restaurantRes, dealsRes] = await Promise.all([
          api.get("/api/menu/categories", { params: { slug } }),
          api.get(`/api/restaurants/${slug}`),
          api.get("/api/deals"),
        ]);
        if (!active) return;
        setCategories(menuRes.data || []);
        setActiveCategory(menuRes.data?.[0]?.id || null);
        setRestaurant(restaurantRes.data || null);
        setDeals(dealsRes.data || []);
      } catch {
        Alert.alert("Restaurant not available", "We could not load this restaurant right now.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    socket = io(SOCKET_URL, { path: "/socket.io", transports: ["websocket", "polling"] });
    socket.on("settings:updated", (nextSettings: any) => {
      setRestaurant((current) => {
        if (!current) return current;
        const isMatch = nextSettings.slug === current.slug || nextSettings.restaurantId === current.id;
        if (!isMatch) return current;
        return {
          ...current,
          isOpen: nextSettings.isOpen ?? current.isOpen,
          deliveryFee: nextSettings.deliveryFee ?? current.deliveryFee,
          minOrderAmount: nextSettings.minOrderAmount ?? current.minOrderAmount,
          etaMinutes: nextSettings.estimatedDeliveryTime ?? nextSettings.etaMinutes ?? current.etaMinutes,
        };
      });
    });

    return () => {
      active = false;
      socket?.disconnect();
    };
  }, [slug]);

  const filteredCategories = useMemo(() => {
    return categories
      .map((category) => ({
        ...category,
        products: category.products.filter((product) => {
          const text = `${product.name} ${product.description || ""}`.toLowerCase();
          return text.includes(searchTerm.toLowerCase());
        }),
      }))
      .filter((category) => category.products.length > 0);
  }, [categories, searchTerm]);

  const categoryTabs = useMemo(() => (searchTerm.trim() ? filteredCategories : categories), [categories, filteredCategories, searchTerm]);

  const restaurantNameParts = useMemo(() => {
    const parts = (restaurant?.name || "Restaurant").trim().split(/\s+/).filter(Boolean);
    return {
      primary: parts[0] || "Restaurant",
      secondary: parts.slice(1).join(" "),
    };
  }, [restaurant?.name]);

  const heroImage = restaurant?.heroImageUrl || restaurant?.imageUrl;

  useEffect(() => {
    if (!filteredCategories.length) return;
    if (!activeCategory || !filteredCategories.some((category) => category.id === activeCategory)) {
      setActiveCategory(filteredCategories[0].id);
    }
  }, [activeCategory, filteredCategories]);

  useEffect(() => {
    categoryPositions.current = {};
  }, [searchTerm, slug]);

  const addItem = useAppStore((s) => s.addItem);

  const scrollToCategory = useCallback((categoryId: string) => {
    setActiveCategory(categoryId);
    const targetY = categoryPositions.current[categoryId];
    if (typeof targetY === "number") {
      menuScrollRef.current?.scrollTo({ y: Math.max(0, targetY - 140), animated: true });
    }
  }, []);

  const handleMenuScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!filteredCategories.length) return;

      const scrollY = event.nativeEvent.contentOffset.y + 190;
      let currentCategory = filteredCategories[0].id;

      filteredCategories.forEach((category) => {
        const position = categoryPositions.current[category.id];
        if (typeof position === "number" && position <= scrollY) {
          currentCategory = category.id;
        }
      });

      if (currentCategory !== activeCategory) {
        setActiveCategory(currentCategory);
      }
    },
    [activeCategory, filteredCategories],
  );

  return (
    <>
      <ScrollView
        ref={menuScrollRef}
        stickyHeaderIndices={[2]}
        onScroll={handleMenuScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.restaurantScreenContent}
      >
        <View style={styles.restaurantHeroWrap}>
          <View style={styles.restaurantHeroCardPremium}>
            {heroImage ? (
              <Image source={{ uri: getImageUrl(heroImage) }} style={styles.restaurantHeroCoverImage} />
            ) : (
              <LinearGradient colors={["#201c28", "#0b0a0f"]} style={StyleSheet.absoluteFillObject} />
            )}
            <LinearGradient colors={["rgba(11,10,15,0.05)", "rgba(11,10,15,0.42)", palette.bg]} style={styles.restaurantHeroOverlay} />

            <View style={styles.restaurantHeroTopBar}>
              <Pressable style={styles.restaurantHeroBackButton} onPress={goBack}>
                <Ionicons name="chevron-back" size={18} color={palette.gold} />
                <Text style={styles.restaurantHeroBackText}>Tillbaka</Text>
              </Pressable>

              <View style={styles.restaurantHeroActionRow}>
                <Pressable style={styles.restaurantHeroGhostButton} onPress={() => setShowInfoModal(true)}>
                  <Ionicons name="information-circle-outline" size={16} color={palette.gold} />
                  <Text style={styles.restaurantHeroGhostButtonText}>Info</Text>
                </Pressable>
                {!!restaurant?.phone && (
                  <Pressable
                    style={styles.restaurantHeroPrimaryButton}
                    onPress={() => Linking.openURL(`tel:${String(restaurant.phone).replace(/\s+/g, "")}`).catch(() => {})}
                  >
                    <Ionicons name="call-outline" size={16} color="#000" />
                    <Text style={styles.restaurantHeroPrimaryButtonText}>Kontakt</Text>
                  </Pressable>
                )}
              </View>
            </View>

            <View style={styles.restaurantHeroContentPremium}>
              <View style={[styles.restaurantHeroStatusPill, restaurant?.isOpen === false ? styles.restaurantHeroStatusPillClosed : styles.restaurantHeroStatusPillOpen]}>
                <View style={[styles.restaurantHeroStatusDot, restaurant?.isOpen === false ? styles.restaurantHeroStatusDotClosed : styles.restaurantHeroStatusDotOpen]} />
                <Text style={[styles.restaurantHeroStatusText, restaurant?.isOpen === false ? styles.restaurantHeroStatusTextClosed : styles.restaurantHeroStatusTextOpen]}>
                  {restaurant?.isOpen === false ? "Stangd" : "Oppen"}
                </Text>
              </View>

              <Text style={styles.restaurantHeroTitlePremium}>
                {restaurantNameParts.primary}{" "}
                {!!restaurantNameParts.secondary && <Text style={styles.restaurantHeroTitleAccent}>{restaurantNameParts.secondary}</Text>}
              </Text>

              <View style={styles.restaurantHeroMetaRowPremium}>
                <Text style={styles.restaurantHeroCuisine}>{(restaurant?.cuisine || "Restaurang").toUpperCase()}</Text>
                <View style={styles.restaurantHeroRatingWrap}>
                  <Ionicons name="star" size={12} color={palette.gold} />
                  <Text style={styles.restaurantHeroRatingText}>{(restaurant?.rating || 4.6).toFixed(1)}</Text>
                  <Text style={styles.restaurantHeroRatingCount}>({restaurant?.ratingCount || 120})</Text>
                </View>
              </View>

              {!!restaurant?.description && (
                <Text numberOfLines={3} style={styles.restaurantHeroDescriptionPremium}>
                  {restaurant.description}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.restaurantQuickStatsRow}>
          <View style={styles.restaurantQuickStatCard}>
            <Ionicons name="bicycle-outline" size={18} color={palette.gold} />
            <Text style={styles.restaurantQuickStatLabel}>Avgift</Text>
            <Text style={styles.restaurantQuickStatValue}>{Math.round(restaurant?.deliveryFee || 0)} KR</Text>
          </View>
          <View style={styles.restaurantQuickStatCard}>
            <Ionicons name="time-outline" size={18} color={palette.gold} />
            <Text style={styles.restaurantQuickStatLabel}>Vantetid</Text>
            <Text style={styles.restaurantQuickStatValue}>~{Math.round(restaurant?.etaMinutes || 35)} MIN</Text>
          </View>
          <View style={styles.restaurantQuickStatCard}>
            <Ionicons name="storefront-outline" size={18} color={palette.gold} />
            <Text style={styles.restaurantQuickStatLabel}>Minsta order</Text>
            <Text style={styles.restaurantQuickStatValue}>{Math.round(restaurant?.minOrderAmount || 0)} KR</Text>
          </View>
        </View>

        <View style={styles.restaurantStickyNavWrap}>
          <View style={styles.restaurantStickyNavCard}>
            <View style={styles.restaurantSearchInputWrap}>
              <Ionicons name="search-outline" size={18} color={palette.muted} />
              <TextInput
                value={searchTerm}
                onChangeText={setSearchTerm}
                placeholder="Vad ar du sugen pa?"
                placeholderTextColor={palette.muted}
                style={styles.restaurantSearchInput}
              />
            </View>

            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.restaurantCategoryRail}
            >
              {categoryTabs.map((category) => (
                <Pressable
                  key={category.id}
                  style={[styles.restaurantCategoryChip, activeCategory === category.id && styles.restaurantCategoryChipActive]}
                  onPress={() => scrollToCategory(category.id)}
                >
                  <Text style={[styles.restaurantCategoryChipText, activeCategory === category.id && styles.restaurantCategoryChipTextActive]}>
                    {category.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>

        <View style={styles.restaurantMenuSectionsWrap}>
          {loading && (
            <View style={styles.loaderWrap}>
              <ActivityIndicator color={palette.gold} />
            </View>
          )}

          {!loading && !filteredCategories.length && <EmptyPanel label="No menu items matched your search." />}

          {!loading &&
            filteredCategories.map((category) => (
              <View
                key={category.id}
                style={styles.restaurantMenuSection}
                onLayout={(event) => {
                  categoryPositions.current[category.id] = event.nativeEvent.layout.y;
                }}
              >
                <View style={styles.restaurantMenuSectionHeader}>
                  <Text style={styles.restaurantMenuSectionTitle}>{category.name}</Text>
                  <View style={styles.restaurantMenuSectionDivider} />
                </View>

                <View style={styles.restaurantMenuProductList}>
                  {category.products.map((product) => {
                    const disabled = restaurant?.isOpen === false;

                    return (
                      <Pressable
                        key={product.id}
                        style={[styles.restaurantMenuProductCard, disabled && styles.restaurantMenuProductCardDisabled]}
                        onPress={() => {
                          if (disabled) return;
                          setSelectedProduct(product);
                        }}
                      >
                        {!!product.imageUrl && <Image source={{ uri: getImageUrl(product.imageUrl) }} style={styles.restaurantMenuProductImage} />}

                        <View style={styles.restaurantMenuProductBody}>
                          <View style={styles.restaurantMenuProductTopRow}>
                            <Text numberOfLines={1} style={styles.restaurantMenuProductTitle}>
                              {product.name}
                            </Text>
                            <View style={styles.restaurantMenuPriceBadge}>
                              <Text style={styles.restaurantMenuPriceBadgeText}>{product.price} KR</Text>
                            </View>
                          </View>

                          <Text numberOfLines={2} style={styles.restaurantMenuProductDescription}>
                            {product.description || "Tryck for att valja tillbehor, sas och onskemal."}
                          </Text>

                          <View style={styles.restaurantMenuProductTags}>
                            {product.isVegan && <View style={[styles.restaurantMenuDietDot, { backgroundColor: "#22c55e" }]} />}
                            {product.isVegetarian && <View style={[styles.restaurantMenuDietDot, { backgroundColor: "#f59e0b" }]} />}
                            {product.isGlutenFree && <View style={[styles.restaurantMenuDietDot, { backgroundColor: "#38bdf8" }]} />}
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
        </View>
      </ScrollView>

      {!!cartItems.length && (
        <Pressable style={styles.floatingCart} onPress={openCart}>
          <Ionicons name="bag-handle-outline" size={18} color="#000" />
          <Text style={styles.floatingCartText}>Open cart</Text>
        </Pressable>
      )}

      <ProductModal
        product={selectedProduct}
        address={address}
        onClose={() => setSelectedProduct(null)}
        onAdd={(payload) => {
          if (!restaurant || !selectedProduct) return;
          addItem({
            productId: selectedProduct.id,
            restaurantId: restaurant.id,
            restaurantSlug: restaurant.slug,
            name: selectedProduct.name,
            price: selectedProduct.price,
            quantity: payload.quantity,
            extras: payload.extras,
            note: payload.note,
          });
          setSelectedProduct(null);
        }}
      />

      <RestaurantInfoModal restaurant={showInfoModal ? restaurant : null} onClose={() => setShowInfoModal(false)} />
    </>
  );
}

function CartEmptyState({ onExplore }: { onExplore: () => void }) {
  const scale = useRef(new Animated.Value(0.9)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: Platform.OS !== "web", friction: 8 }),
      Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== "web" }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40, transform: [{ scale }], opacity }}>
      <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: "#19191d", alignItems: "center", justifyContent: "center", marginBottom: 30, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" }}>
        <Ionicons name="bag-handle-outline" size={60} color={palette.gold} style={{ opacity: 0.8 }} />
      </View>
      <Text style={{ color: palette.text, fontSize: 24, fontWeight: "900", fontStyle: "italic", textAlign: "center", marginBottom: 12 }}>
        ÄR DU VERKLIGEN MÄTT?
      </Text>
      <Text style={{ color: "#6f667d", fontSize: 13, fontWeight: "700", textAlign: "center", lineHeight: 22, marginBottom: 40, textTransform: "uppercase", letterSpacing: 0.5 }}>
        Din kasse ser skrämmande tom ut. Men oroa dig inte, vi har massor av gott som väntar på dig!
      </Text>
      
      <Pressable 
        onPress={onExplore}
        style={({ pressed }) => [
          {
            backgroundColor: palette.gold,
            paddingHorizontal: 32,
            paddingVertical: 18,
            borderRadius: 30,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            transform: [{ scale: pressed ? 0.95 : 1 }],
            shadowColor: palette.gold,
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.3,
            shadowRadius: 20,
          }
        ]}
      >
        <Text style={{ color: "#000", fontSize: 13, fontWeight: "900", letterSpacing: 1 }}>UTFORSKA RESTAURANGER</Text>
        <Ionicons name="arrow-forward" size={18} color="#000" />
      </Pressable>
    </Animated.View>
  );
}

function CartScreen({
  openProfile,
  openOrder,
  openHome,
}: {
  openProfile: () => void;
  openOrder: (id: string) => void;
  openHome: () => void;
}) {
  const items = useAppStore((s) => s.items);
  const removeItem = useAppStore((s) => s.removeItem);
  const updateQuantity = useAppStore((s) => s.updateQuantity);
  const clearCart = useAppStore((s) => s.clearCart);
  const token = useAppStore((s) => s.token);
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const pendingPromoCode = useAppStore((s) => s.pendingPromoCode);
  const setPendingPromoCode = useAppStore((s) => s.setPendingPromoCode);
  const currentRestaurantId = useAppStore((s) => s.restaurantId);
  const currentRestaurantSlug = useAppStore((s) => s.restaurantSlug);
  const coords = useAppStore((s) => s.coords);
  const orderType = useAppStore((s) => s.orderType);
  const setOrderType = useAppStore((s) => s.setOrderType);

  const [pageLoading, setPageLoading] = useState(true);
  const [restaurantSettings, setRestaurantSettings] = useState({
    isOpen: true,
    deliveryFee: 49,
    minOrderAmount: 150,
    estimatedDeliveryTime: 35,
  });
  const [personalDeals, setPersonalDeals] = useState<any[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [promoCode, setPromoCode] = useState("");
  const [selectedPersonalDeal, setSelectedPersonalDeal] = useState<any | null>(null);
  const [deliveryCheck, setDeliveryCheck] = useState<DeliveryCheck | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    customerName: "",
    customerPhone: "",
    deliveryStreet: "",
    deliveryZip: "",
    deliveryInstructions: "",
    note: "",
  });

  // Load from storage on mount
  useEffect(() => {
    const storedAddress = useAppStore.getState().address || "";
    const storedType = useAppStore.getState().orderType || "DELIVERY";
    
    setFormData(prev => ({
      ...prev,
      deliveryStreet: prev.deliveryStreet || storedAddress,
    }));
    setOrderType(storedType);
  }, []);

  const subtotal = useMemo(
    () =>
      items.reduce((sum, item) => {
        const extras = item.extras.reduce((extraSum, extra) => extraSum + extra.price, 0);
        return sum + (item.price + extras) * item.quantity;
      }, 0),
    [items]
  );

  const personalDiscount = useMemo(() => {
    if (!selectedPersonalDeal) return 0;
    const campaign = selectedPersonalDeal.campaign || {};
    if (subtotal < (campaign.minOrder || 0)) return 0;
    if (campaign.discountType === "PERCENTAGE") return (subtotal * campaign.discountValue) / 100;
    return campaign.discountValue || 0;
  }, [selectedPersonalDeal, subtotal]);

  const deliveryFee = orderType === "DELIVERY" ? deliveryCheck?.deliveryFee ?? restaurantSettings.deliveryFee : 0;
  const isTestCode = selectedPersonalDeal?.code === "test" || selectedPersonalDeal?.code === "testa";
  const total = isTestCode ? 0 : Math.max(0, subtotal + deliveryFee - personalDiscount);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [settingsRes, profileRes, dealsRes, restaurantRes] = await Promise.all([
          api.get("/api/settings").catch(() => ({ data: {} })),
          token ? api.get("/api/profile", { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: null })) : Promise.resolve({ data: null }),
          token ? api.get("/api/profile/deals", { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
          currentRestaurantId ? api.get(`/api/restaurants/${currentRestaurantId}`).catch(() => ({ data: null })) : Promise.resolve({ data: null }),
        ]);

        if (!active) return;
        setRestaurantSettings((current) => ({
          ...current,
          ...settingsRes.data,
          deliveryFee: restaurantRes.data?.deliveryFee ?? settingsRes.data?.deliveryFee ?? current.deliveryFee,
          minOrderAmount: restaurantRes.data?.minOrderAmount ?? settingsRes.data?.minOrderAmount ?? current.minOrderAmount,
          isOpen: restaurantRes.data?.isOpen ?? settingsRes.data?.isOpen ?? current.isOpen,
        }));

        setProfile(profileRes.data || null);
        setPersonalDeals(dealsRes.data || []);
        
        setFormData((current) => ({
          ...current,
          customerName: current.customerName || profileRes.data?.name || "",
          customerPhone: current.customerPhone || profileRes.data?.phone || "",
          deliveryStreet: current.deliveryStreet || profileRes.data?.address || "",
          deliveryZip: current.deliveryZip || profileRes.data?.zip || "",
        }));

        if (token) {
          const addressRes = await api.get("/api/profile/addresses", { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] }));
          if (active) setSavedAddresses(addressRes.data || []);
        }
      } finally {
        if (active) setPageLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [currentRestaurantId, setProfile, token]);

  useEffect(() => {
    if (!pendingPromoCode || !personalDeals.length) return;

    const normalizedCode = pendingPromoCode.trim().toLowerCase();
    const match = personalDeals.find((deal) => deal.code?.trim().toLowerCase() === normalizedCode);
    if (!match) return;

    setSelectedPersonalDeal(match);
    setPromoCode(match.code);
    setPendingPromoCode(null);
  }, [pendingPromoCode, personalDeals, setPendingPromoCode]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (orderType !== "DELIVERY" || !coords || !currentRestaurantId) return;
      const response = await api
        .get("/api/delivery/check", { params: { lat: coords.lat, lng: coords.lng, restaurantId: currentRestaurantId } })
        .catch(() => ({ data: null }));
      if (active && response.data) {
        setDeliveryCheck(response.data);
      }
    })();
    return () => {
      active = false;
    };
  }, [coords, currentRestaurantId, orderType]);

  const handlePromo = useCallback(() => {
    const code = promoCode.trim().toLowerCase();
    if (code === "test" || code === "testa") {
      setSelectedPersonalDeal({ code, campaign: { discountType: "FIXED", discountValue: total, minOrder: 0 } });
      return;
    }
    const match = personalDeals.find((deal) => deal.code?.toLowerCase() === code);
    if (match) {
      setSelectedPersonalDeal(match);
      return;
    }
    Alert.alert("Promo code", "That code was not valid.");
  }, [personalDeals, promoCode, total]);

  const handleCheckoutPress = async () => {
    if (submitting) return;
    if (!formData.customerName.trim()) { Alert.alert("Namn saknas", "Fyll i ditt namn."); return; }
    if (!formData.customerPhone.trim()) { Alert.alert("Telefon saknas", "Fyll i ditt telefonnummer."); return; }
    if (orderType === "DELIVERY" && !formData.deliveryStreet.trim()) { Alert.alert("Adress saknas", "Fyll i leveransadress."); return; }
    if (orderType === "DELIVERY" && !formData.deliveryZip.trim()) { Alert.alert("Postnummer saknas", "Fyll i postnummer."); return; }
    if (!items.length) { Alert.alert("Tom varukorg", "Lägg till produkter först."); return; }

    setSubmitting(true);
    try {
      // 1. Check for restaurant status and min order locally first
      if (!restaurantSettings.isOpen) {
        Alert.alert("Stängt", "Restaurangen är för närvarande stängd.");
        setSubmitting(false);
        return;
      }
      if (subtotal < restaurantSettings.minOrderAmount) {
        Alert.alert("Minsta ordervärde", `Minsta ordervärde är ${restaurantSettings.minOrderAmount} kr.`);
        setSubmitting(false);
        return;
      }
      if (orderType === "DELIVERY" && deliveryCheck && !deliveryCheck.available) {
        Alert.alert("Utanför leveransområde", "Vi kan tyvärr inte leverera till din adress.");
        setSubmitting(false);
        return;
      }

      const isTestFlow = selectedPersonalDeal?.code === "test" || selectedPersonalDeal?.code === "testa";

      const payload = {
        type: orderType,
        customerName: formData.customerName,
        customerPhone: formData.customerPhone,
        deliveryStreet: orderType === "DELIVERY" ? formData.deliveryStreet : undefined,
        deliveryZip: orderType === "DELIVERY" ? formData.deliveryZip : undefined,
        deliveryInstructions: orderType === "DELIVERY" ? formData.deliveryInstructions || undefined : undefined,
        deliveryNote: formData.note || undefined, // API supports both, webapp uses note
        note: formData.note || undefined,
        stripePaymentIntentId: isTestFlow ? "FREE_PROMO" : "BYPASS",
        discountCode: selectedPersonalDeal?.code || undefined,
        appliedDealId: undefined, // Could be enhanced to support global deals
        restaurantId: currentRestaurantId || undefined,
        restaurantSlug: currentRestaurantSlug || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          note: item.note,
          selectedExtras: item.extras.map((extra) => ({
            groupId: extra.groupId,
            groupName: extra.groupName,
            extraId: extra.extraId,
            extraName: extra.name,
            priceAddon: extra.price,
          })),
        })),
      };

      const response = await api.post("/api/orders", payload, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const successId = response.data?.orderId || response.data?.id;
      if (successId) {
        clearCart();
        openOrder(successId);
      } else {
        Alert.alert("Serverfel", "Inget order-ID returnerades: " + JSON.stringify(response.data));
      }
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.message || "Okänt fel";
      Alert.alert("Kunde inte skicka order", typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
      <Header 
        title="Din kasse" 
        subtitle={items.length === 1 ? "1 produkt" : `${items.length} produkter`}
      />

      {pageLoading && (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={palette.gold} />
        </View>
      )}

      {!pageLoading && !items.length && <CartEmptyState onExplore={openHome} />}

      {!pageLoading && !!items.length && (
        <>
          {/* 1. Item List */}
          <View style={styles.cartItemList}>
            {items.map((item) => (
              <View key={item.cartItemId} style={styles.cartItem}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900", fontStyle: "italic", textTransform: "uppercase" }}>
                    {item.quantity}x {item.name}
                  </Text>
                  {item.extras.length > 0 && (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                      {item.extras.map((e) => (
                        <View key={e.extraId} style={{ backgroundColor: "#19191d", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: "rgba(255,255,255,0.04)" }}>
                          <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "800", textTransform: "uppercase" }}>{e.name}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <View style={[styles.cartActions, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
                  <View style={styles.counter}>
                    <Pressable hitSlop={10} onPress={() => updateQuantity(item.cartItemId, -1)}>
                      <Ionicons name="remove" size={18} color={palette.muted} />
                    </Pressable>
                    <Text style={styles.counterText}>{item.quantity}</Text>
                    <Pressable hitSlop={10} onPress={() => updateQuantity(item.cartItemId, 1)}>
                      <Ionicons name="add" size={18} color={palette.gold} />
                    </Pressable>
                  </View>
                  <Pressable hitSlop={10} onPress={() => removeItem(item.cartItemId)}>
                    <Ionicons name="trash-outline" size={18} color={palette.danger} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>

          {/* 2. Order Type Toggle */}
          <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 4 }}>
            {(["DELIVERY", "PICKUP"] as const).map((type) => (
              <Pressable
                key={type}
                onPress={() => setOrderType(type)}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  backgroundColor: orderType === type ? palette.gold : palette.panel,
                  borderRadius: 22,
                  paddingVertical: 16,
                  borderWidth: 1,
                  borderColor: orderType === type ? palette.gold : palette.border,
                }}
              >
                <Ionicons name={type === "DELIVERY" ? "bicycle-outline" : "storefront-outline"} size={20} color={orderType === type ? "#000" : palette.muted} />
                <Text style={{ color: orderType === type ? "#000" : palette.text, fontWeight: "900", textTransform: "uppercase", fontSize: 11, letterSpacing: 1 }}>
                  {type === "DELIVERY" ? "Leverans" : "Hämtning"}
                </Text>
              </Pressable>
            ))}
          </View>

          {!token && (
            <View style={[styles.formCard, { borderColor: "rgba(231,178,75,0.2)", backgroundColor: "rgba(231,178,75,0.03)" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(231,178,75,0.1)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="person-outline" size={20} color={palette.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900", fontStyle: "italic", textTransform: "uppercase" }}>Beställ som gäst</Text>
                  <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "700", marginTop: 2 }}>Logga in för att se tidigare beställningar.</Text>
                </View>
                <Pressable onPress={openProfile} style={{ backgroundColor: palette.gold, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 }}>
                  <Text style={{ color: "#000", fontSize: 10, fontWeight: "900", textTransform: "uppercase" }}>Logga in</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* 3. Customer Info */}
          <View style={styles.formCard}>
            <Text style={{ color: palette.text, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Personuppgifter</Text>
            <View style={{ gap: 10 }}>
              <TextInput
                style={styles.input}
                placeholder="Fullständigt namn"
                placeholderTextColor={palette.muted}
                value={formData.customerName}
                onChangeText={(value) => setFormData((v) => ({ ...v, customerName: value }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Telefonnummer"
                placeholderTextColor={palette.muted}
                keyboardType="phone-pad"
                value={formData.customerPhone}
                onChangeText={(value) => setFormData((v) => ({ ...v, customerPhone: value }))}
              />
            </View>
          </View>

          {/* 4. Delivery Info */}
          {orderType === "DELIVERY" && (
            <View style={styles.formCard}>
              <Text style={{ color: palette.text, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Leveransadress</Text>
              
              {(savedAddresses.length > 0 || profile?.address) && (
                <View style={{ marginBottom: 16 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {profile?.address && (
                      <Pressable 
                        onPress={() => setFormData(v => ({ ...v, deliveryStreet: profile.address || "", deliveryZip: profile.zip || "" }))}
                        style={{ 
                          flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, 
                          backgroundColor: formData.deliveryStreet === profile.address ? "rgba(231,178,75,0.12)" : "rgba(255,255,255,0.03)",
                          borderWidth: 1, borderColor: formData.deliveryStreet === profile.address ? palette.gold : "rgba(255,255,255,0.08)"
                        }}
                      >
                        <Ionicons name="home-outline" size={14} color={formData.deliveryStreet === profile.address ? palette.gold : palette.muted} />
                        <Text style={{ color: formData.deliveryStreet === profile.address ? palette.gold : palette.text, fontSize: 10, fontWeight: "900", textTransform: "uppercase" }}>Hemadress</Text>
                      </Pressable>
                    )}
                    {savedAddresses.map(addr => (
                      <Pressable 
                        key={addr.id}
                        onPress={() => setFormData(v => ({ ...v, deliveryStreet: addr.street, deliveryZip: addr.zip }))}
                        style={{ 
                          flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, 
                          backgroundColor: formData.deliveryStreet === addr.street ? "rgba(231,178,75,0.12)" : "rgba(255,255,255,0.03)",
                          borderWidth: 1, borderColor: formData.deliveryStreet === addr.street ? palette.gold : "rgba(255,255,255,0.08)"
                        }}
                      >
                        <Ionicons name={addr.label === "Jobb" ? "briefcase-outline" : "map-outline"} size={14} color={formData.deliveryStreet === addr.street ? palette.gold : palette.muted} />
                        <Text style={{ color: formData.deliveryStreet === addr.street ? palette.gold : palette.text, fontSize: 10, fontWeight: "900", textTransform: "uppercase" }}>{addr.label}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View style={{ gap: 10 }}>
                <TextInput
                  style={styles.input}
                  placeholder="Gatuadress"
                  placeholderTextColor={palette.muted}
                  value={formData.deliveryStreet}
                  onChangeText={(value) => setFormData((v) => ({ ...v, deliveryStreet: value }))}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Postnummer"
                  placeholderTextColor={palette.muted}
                  keyboardType="number-pad"
                  value={formData.deliveryZip}
                  onChangeText={(value) => setFormData((v) => ({ ...v, deliveryZip: value }))}
                />

                <Text style={{ color: palette.text, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.5, marginTop: 12, marginBottom: 8 }}>Instruktioner</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {[
                    { id: "RING_DOORBELL", label: "Ring på", icon: "notifications-outline" },
                    { id: "LEAVE_AT_DOOR", label: "Lämna dörr", icon: "exit-outline" },
                    { id: "MEET_OUTSIDE", label: "Möt ute", icon: "person-outline" },
                    { id: "PORTKOD", label: "Portkod", icon: "key-outline" },
                  ].map(opt => (
                    <Pressable 
                      key={opt.id}
                      onPress={() => setFormData(v => ({ ...v, deliveryInstructions: v.deliveryInstructions === opt.id ? "" : opt.id }))}
                      style={{ 
                        flex: 1, minWidth: "46%", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 16, 
                        backgroundColor: formData.deliveryInstructions === opt.id ? "rgba(231,178,75,0.12)" : "rgba(255,255,255,0.03)",
                        borderWidth: 1, borderColor: formData.deliveryInstructions === opt.id ? palette.gold : "rgba(255,255,255,0.08)"
                      }}
                    >
                      <Ionicons name={opt.icon as any} size={16} color={formData.deliveryInstructions === opt.id ? palette.gold : palette.muted} />
                      <Text style={{ color: formData.deliveryInstructions === opt.id ? palette.gold : palette.text, fontSize: 10, fontWeight: "900", textTransform: "uppercase" }}>{opt.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* 5. Notes & Promo */}
          <View style={styles.formCard}>
            <Text style={{ color: palette.text, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Övrigt</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: "top", paddingTop: 14 }]}
              placeholder="Notering (t.ex. allergier, portkod...)"
              placeholderTextColor={palette.muted}
              multiline
              value={formData.note}
              onChangeText={(value) => setFormData((v) => ({ ...v, note: value }))}
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="Rabattkod"
                placeholderTextColor={palette.muted}
                autoCapitalize="none"
                value={selectedPersonalDeal ? selectedPersonalDeal.code : promoCode}
                onChangeText={(value) => {
                  if (selectedPersonalDeal) setSelectedPersonalDeal(null);
                  setPromoCode(value);
                }}
                editable={!selectedPersonalDeal}
              />
              <Pressable 
                onPress={selectedPersonalDeal ? () => { setSelectedPersonalDeal(null); setPromoCode(""); } : handlePromo}
                style={{ backgroundColor: selectedPersonalDeal ? palette.danger : palette.gold, paddingHorizontal: 22, justifyContent: "center", borderRadius: 18 }}
              >
                <Text style={{ color: selectedPersonalDeal ? "#fff" : "#000", fontWeight: "900", textTransform: "uppercase", fontSize: 10 }}>
                  {selectedPersonalDeal ? "Ta bort" : "Kolla"}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* 6. Summary */}
          <View style={[styles.formCard, { backgroundColor: "transparent", borderWidth: 0, paddingHorizontal: 4 }]}>
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: palette.muted, fontWeight: "800", textTransform: "uppercase", fontSize: 11, letterSpacing: 0.5 }}>Delsumma</Text>
                <Text style={{ color: palette.text, fontWeight: "900", fontSize: 11 }}>{Math.round(subtotal)} KR</Text>
              </View>
              {orderType === "DELIVERY" && (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: palette.muted, fontWeight: "800", textTransform: "uppercase", fontSize: 11, letterSpacing: 0.5 }}>Frakt</Text>
                  <Text style={{ color: palette.gold, fontWeight: "900", fontSize: 11 }}>{Math.round(deliveryFee)} KR</Text>
                </View>
              )}
              {personalDiscount > 0 && (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: palette.success, fontWeight: "800", textTransform: "uppercase", fontSize: 11, letterSpacing: 0.5 }}>Rabatt</Text>
                  <Text style={{ color: palette.success, fontWeight: "900", fontSize: 11 }}>-{Math.round(personalDiscount)} KR</Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 20 }}>
               <Text style={{ color: palette.text, fontSize: 34, fontWeight: "900", fontStyle: "italic", textTransform: "uppercase", letterSpacing: -1.2 }}>Totalt</Text>
               <Text style={{ color: palette.gold, fontSize: 48, fontWeight: "900", fontStyle: "italic", letterSpacing: -1 }}>
                 {Math.round(total)} <Text style={{ fontSize: 14, fontStyle: "normal", opacity: 0.6 }}>SEK</Text>
               </Text>
            </View>

            {subtotal < restaurantSettings.minOrderAmount && (
              <View style={{ backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 16, padding: 14, marginTop: 18, borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" }}>
                <Text style={{ color: palette.danger, fontSize: 10, fontWeight: "900", textAlign: "center", textTransform: "uppercase", letterSpacing: 0.5 }}>Minsta order på {restaurantSettings.minOrderAmount} kr krävs</Text>
              </View>
            )}

            <PrimaryButton
              label={submitting ? "Skickar order..." : `Slutför köp — ${Math.round(total)} kr`}
              onPress={handleCheckoutPress}
              disabled={submitting || !restaurantSettings.isOpen || subtotal < restaurantSettings.minOrderAmount}
              icon="checkmark-circle-outline"
              style={{ marginTop: 28, paddingVertical: 19 }}
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}

function ProfileScreen({
  openRegister,
  openOrder,
  openCart,
}: {
  openRegister: () => void;
  openOrder: (id: string) => void;
  openCart: () => void;
}) {
  const token = useAppStore((s) => s.token);
  const setToken = useAppStore((s) => s.setToken);
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const clearSession = useAppStore((s) => s.clearSession);
  const addItem = useAppStore((s) => s.addItem);
  const clearCart = useAppStore((s) => s.clearCart);

  const [orders, setOrders] = useState<Order[]>([]);
  const [deals, setDeals] = useState<PersonalDeal[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+46");
  const [otpCode, setOtpCode] = useState("");
  const [otpPhone, setOtpPhone] = useState("");
  const [showOtp, setShowOtp] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [socialLoading, setSocialLoading] = useState<"google" | "facebook" | null>(null);
  const [showAddPhone, setShowAddPhone] = useState(false);
  const [addPhoneCountry, setAddPhoneCountry] = useState("+46");
  const [addPhoneNum, setAddPhoneNum] = useState("");
  const [addPhoneLoading, setAddPhoneLoading] = useState(false);
  const [addPhoneError, setAddPhoneError] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "orders" | "settings" | "deals" | "addresses">("overview");
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [newAddrLabel, setNewAddrLabel] = useState("Hem");
  const [newAddrStreet, setNewAddrStreet] = useState("");
  const [newAddrCity, setNewAddrCity] = useState("");
  const [newAddrZip, setNewAddrZip] = useState("");
  const [newAddrNote, setNewAddrNote] = useState("");
  const [addrSaving, setAddrSaving] = useState(false);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  const getAuthHeaders = useCallback(
    (authToken: string) => ({ Authorization: `Bearer ${authToken}` }),
    [],
  );

  const normalizePhone = useCallback((value: string) => value.replace(/\D/g, ""), []);

  const buildInternationalPhone = useCallback(
    (selectedCountryCode: string, rawPhone: string) => `${selectedCountryCode}${normalizePhone(rawPhone).replace(/^0/, "")}`,
    [normalizePhone],
  );

  const parseQueryParams = useCallback((url: string) => {
    const query = url.split("?")[1] || "";
    return query.split("&").reduce<Record<string, string>>((acc, part) => {
      if (!part) return acc;
      const [key, value = ""] = part.split("=");
      acc[decodeURIComponent(key)] = decodeURIComponent(value);
      return acc;
    }, {});
  }, []);

  const fetchProfileData = useCallback(
    async (authToken: string) => {
      setPageLoading(true);
      try {
        const headers = getAuthHeaders(authToken);
        const [profileRes, ordersRes, dealsRes, addressRes] = await Promise.all([
          api.get("/api/profile", { headers }),
          api.get("/api/profile/orders", { headers }),
          api.get("/api/profile/deals", { headers }),
          api.get("/api/profile/addresses", { headers }),
        ]);

        const nextProfile = (profileRes.data || null) as Profile | null;
        setProfile(nextProfile);
        setOrders((ordersRes.data || []) as Order[]);
        setDeals((dealsRes.data || []) as PersonalDeal[]);
        setSavedAddresses((addressRes.data || []) as SavedAddress[]);
        setEditName(nextProfile?.name || "");
        setEditEmail(nextProfile?.email || "");
        setShowAddPhone(!nextProfile?.phone);
      } catch {
        clearSession();
        setOrders([]);
        setDeals([]);
        setSavedAddresses([]);
      } finally {
        setPageLoading(false);
      }
    },
    [clearSession, getAuthHeaders, setProfile],
  );

  useEffect(() => {
    if (!token) {
      setPageLoading(false);
      setProfile(null);
      setOrders([]);
      setDeals([]);
      setSavedAddresses([]);
      setShowAddPhone(false);
      return;
    }

    fetchProfileData(token).catch(() => clearSession());
  }, [clearSession, fetchProfileData, setProfile, token]);

  const handleIncomingAuthUrl = useCallback(
    async (url: string | null) => {
      if (!url || !url.startsWith(APP_AUTH_DEEP_LINK)) return;

      const params = parseQueryParams(url);
      if (params.error) {
        Alert.alert("Inloggning misslyckades", params.error);
        return;
      }

      if (!params.token) return;

      setPageLoading(true);
      setLoginError("");
      setToken(params.token);
    },
    [parseQueryParams, setToken],
  );

  useEffect(() => {
    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleIncomingAuthUrl(url).catch(() => {});
    });

    Linking.getInitialURL()
      .then((url) => handleIncomingAuthUrl(url))
      .catch(() => {});

    return () => subscription.remove();
  }, [handleIncomingAuthUrl]);

  const sendOtpToPhone = useCallback(
    async (phoneNumber: string) => {
      setAuthLoading(true);
      setLoginError("");
      setAddPhoneError("");

      try {
        await api.post("/api/account/send-otp", { phone: phoneNumber });
        setOtpPhone(phoneNumber);
        setShowOtp(true);
        setShowAddPhone(false);
      } catch (error: any) {
        const message = error?.response?.data?.error || "Kunde inte skicka kod";
        setLoginError(message);
        setAddPhoneError(message);
      } finally {
        setAuthLoading(false);
        setAddPhoneLoading(false);
      }
    },
    [],
  );

  const handleSendOtp = useCallback(async () => {
    if (!phone.trim()) {
      Alert.alert("Nummer krävs", "Ange telefonnumret du använder på webben.");
      return;
    }

    const internationalPhone = buildInternationalPhone(countryCode, phone);
    if (!normalizePhone(internationalPhone)) {
      Alert.alert("Nummer krävs", "Ange ett giltigt telefonnummer.");
      return;
    }

    await sendOtpToPhone(internationalPhone);
  }, [buildInternationalPhone, countryCode, normalizePhone, phone, sendOtpToPhone]);

  const handleAddPhone = useCallback(async () => {
    if (!addPhoneNum.trim()) {
      setAddPhoneError("Ange telefonnummer");
      return;
    }

    setAddPhoneLoading(true);
    const internationalPhone = buildInternationalPhone(addPhoneCountry, addPhoneNum);
    await sendOtpToPhone(internationalPhone);
  }, [addPhoneCountry, addPhoneNum, buildInternationalPhone, sendOtpToPhone]);

  const verifyOtp = useCallback(async () => {
    if (!otpCode.trim()) return;

    setAuthLoading(true);
    setLoginError("");

    try {
      const response = await api.post(
        "/api/account/verify-otp",
        { phone: otpPhone, code: otpCode },
        { headers: token ? getAuthHeaders(token) : {} },
      );

      const nextToken = response.data?.token as string | undefined;
      if (!nextToken) throw new Error("Ingen session returnerades");

      setToken(nextToken);
      setShowOtp(false);
      setOtpCode("");
      setPhone("");
      setAddPhoneNum("");
      setPageLoading(true);
    } catch (error: any) {
      setLoginError(error?.response?.data?.error || "Felaktig kod");
    } finally {
      setAuthLoading(false);
    }
  }, [getAuthHeaders, otpCode, otpPhone, setToken, token]);

  const handleSocialLogin = useCallback(async (provider: "google" | "facebook") => {
    setSocialLoading(provider);
    try {
      await Linking.openURL(`${WEB_URL}/mobile-auth?provider=${provider}&redirect=${encodeURIComponent(APP_AUTH_DEEP_LINK)}`);
    } catch {
      Alert.alert("Kunde inte öppna inloggning", "Kontrollera att webbinloggningen är tillgänglig och försök igen.");
    } finally {
      setSocialLoading(null);
    }
  }, []);

  const handleLogout = useCallback(() => {
    clearSession();
    setOrders([]);
    setDeals([]);
    setSavedAddresses([]);
    setShowOtp(false);
    setShowAddPhone(false);
    setActiveTab("overview");
    setIsEditing(false);
    setLoginError("");
  }, [clearSession]);

  const handleUpdateProfile = useCallback(async () => {
    if (!token || !profile) return;

    setIsSaving(true);
    try {
      await api.patch(
        "/api/profile",
        {
          name: editName.trim() || undefined,
          email: editEmail.trim() || null,
        },
        { headers: getAuthHeaders(token) },
      );

      setProfile({
        ...profile,
        name: editName.trim() || profile.name,
        email: editEmail.trim() || undefined,
      });
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setIsEditing(false);
      }, 1200);
    } catch (error: any) {
      Alert.alert("Kunde inte spara", error?.response?.data?.error || "Försök igen om en stund.");
    } finally {
      setIsSaving(false);
    }
  }, [editEmail, editName, getAuthHeaders, profile, setProfile, token]);

  const refreshAddresses = useCallback(async () => {
    if (!token) return;
    await fetchProfileData(token);
  }, [fetchProfileData, token]);

  const handleSaveAddress = useCallback(async () => {
    if (!token) return;
    if (!newAddrStreet.trim() || !newAddrCity.trim() || !newAddrZip.trim()) {
      Alert.alert("Adress saknas", "Fyll i gata, stad och postnummer.");
      return;
    }

    setAddrSaving(true);
    try {
      await api.post(
        "/api/profile/addresses",
        {
          label: newAddrLabel,
          street: newAddrStreet.trim(),
          city: newAddrCity.trim(),
          zip: newAddrZip.trim(),
          note: newAddrNote.trim() || undefined,
          isDefault: savedAddresses.length === 0,
        },
        { headers: getAuthHeaders(token) },
      );
      setNewAddrStreet("");
      setNewAddrCity("");
      setNewAddrZip("");
      setNewAddrNote("");
      await refreshAddresses();
    } catch (error: any) {
      Alert.alert("Kunde inte spara", error?.response?.data?.error || "Försök igen om en stund.");
    } finally {
      setAddrSaving(false);
    }
  }, [addrSaving, getAuthHeaders, newAddrCity, newAddrLabel, newAddrNote, newAddrStreet, newAddrZip, refreshAddresses, savedAddresses.length, token]);

  const setAddressAsDefault = useCallback(
    async (addressId: string) => {
      if (!token) return;
      try {
        await api.patch(`/api/profile/addresses/${addressId}`, { isDefault: true }, { headers: getAuthHeaders(token) });
        await refreshAddresses();
      } catch {
        Alert.alert("Kunde inte uppdatera", "Adressen kunde inte göras till standard.");
      }
    },
    [getAuthHeaders, refreshAddresses, token],
  );

  const deleteSavedAddress = useCallback(
    async (addressId: string) => {
      if (!token) return;
      try {
        await api.delete(`/api/profile/addresses/${addressId}`, { headers: getAuthHeaders(token) });
        setSavedAddresses((current) => current.filter((item) => item.id !== addressId));
      } catch {
        Alert.alert("Kunde inte radera", "Adressen kunde inte tas bort.");
      }
    },
    [getAuthHeaders, token],
  );

  const handleReorder = useCallback(
    async (orderId: string) => {
      if (!token) return;
      setReorderingId(orderId);

      try {
        const response = await api.get(`/api/profile/orders/${orderId}/reorder`, { headers: getAuthHeaders(token) });
        const reorderData = response.data;

        clearCart();

        for (const item of reorderData.items || []) {
          addItem({
            productId: item.productId,
            restaurantId: reorderData.restaurantId,
            restaurantSlug: reorderData.restaurantSlug || null,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            extras: item.extras || [],
            note: item.note || undefined,
          });
        }

        if (reorderData.unavailableItems?.length) {
          Alert.alert("Vissa produkter saknas", reorderData.unavailableItems.join(", "));
        }

        openCart();
      } catch (error: any) {
        Alert.alert("Kunde inte beställa igen", error?.response?.data?.error || "Försök igen om en stund.");
      } finally {
        setReorderingId(null);
      }
    },
    [addItem, clearCart, getAuthHeaders, openCart, token],
  );

  const handleDeleteAccount = useCallback(() => {
    if (!token) return;

    Alert.alert(
      "Radera konto",
      "Det här raderar ditt konto och anonymiserar din orderhistorik. Vill du fortsätta?",
      [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Radera",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await api.delete("/api/profile", { headers: getAuthHeaders(token) });
                handleLogout();
              } catch (error: any) {
                Alert.alert("Kunde inte radera", error?.response?.data?.error || "Försök igen om en stund.");
              }
            })();
          },
        },
      ],
    );
  }, [getAuthHeaders, handleLogout, token]);

  return (
    <ScreenWrap>
      {pageLoading ? (
        <View style={[styles.loaderWrap, { minHeight: 420 }]}>
          <ActivityIndicator color={palette.gold} />
        </View>
      ) : !token || !profile ? (
        <View style={{ paddingTop: 18, paddingBottom: 18 }}>
          <View
            style={{
              width: 108,
              height: 108,
              borderRadius: 34,
              backgroundColor: "#241b11",
              borderWidth: 1,
              borderColor: "#5f4a25",
              alignItems: "center",
              justifyContent: "center",
              alignSelf: "center",
              marginBottom: 22,
            }}
          >
            <Ionicons name="lock-closed-outline" size={44} color={palette.gold} />
          </View>

          <Text style={{ color: palette.text, fontSize: 34, fontWeight: "900", textAlign: "center" }}>VALKOMMEN</Text>
          <Text style={{ color: palette.gold, fontSize: 34, fontWeight: "900", textAlign: "center", marginTop: -2 }}>TILLBAKA</Text>
          <Text style={{ color: "#6f667d", fontSize: 11, fontWeight: "900", letterSpacing: 2, textAlign: "center", marginTop: 18 }}>
            LOGGA IN MED TELEFON ELLER SOCIALT KONTO
          </Text>

          <View style={[styles.formCard, { borderRadius: 30, marginTop: 24, padding: 20 }]}>
            <Text style={{ color: "#7f798a", fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 12 }}>TELEFONNUMMER</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => {
                  const currentIndex = COUNTRY_CODES.findIndex((item) => item.code === countryCode);
                  const next = COUNTRY_CODES[(currentIndex + 1) % COUNTRY_CODES.length];
                  setCountryCode(next.code);
                }}
                style={{
                  width: 118,
                  borderRadius: 22,
                  backgroundColor: "#19191d",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                  paddingHorizontal: 16,
                  paddingVertical: 18,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ fontSize: 24 }}>{COUNTRY_CODES.find((item) => item.code === countryCode)?.flag || "🇸🇪"}</Text>
                <Text style={{ color: palette.text, fontSize: 15, fontWeight: "900" }}>{countryCode}</Text>
                <Ionicons name="chevron-forward-outline" size={16} color="#7f798a" />
              </Pressable>

              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0, fontSize: 18, fontWeight: "800", paddingVertical: 18 }]}
                placeholder="070 000 00 00"
                placeholderTextColor="#5f5b66"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />
            </View>

            {!!loginError && <Text style={{ color: palette.danger, fontSize: 11, fontWeight: "800", marginTop: 14, textAlign: "center" }}>{loginError}</Text>}

            <PrimaryButton label={authLoading ? "FORTSATT..." : "FORTSATT"} onPress={handleSendOtp} disabled={authLoading} style={{ marginTop: 18 }} />

            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 28, marginBottom: 18 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.06)" }} />
              <Text style={{ color: "#7f798a", fontSize: 10, fontWeight: "900", letterSpacing: 2 }}>ELLER MED SOCIALT</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.06)" }} />
            </View>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable
                onPress={() => handleSocialLogin("google")}
                style={{
                  flex: 1,
                  backgroundColor: "#19191d",
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                  paddingVertical: 18,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  opacity: socialLoading === "facebook" ? 0.6 : 1,
                }}
              >
                <Ionicons name={socialLoading === "google" ? "hourglass-outline" : "logo-google"} size={20} color="#fff" />
                <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>GOOGLE</Text>
              </Pressable>
              <Pressable
                onPress={() => handleSocialLogin("facebook")}
                style={{
                  flex: 1,
                  backgroundColor: "#19191d",
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                  paddingVertical: 18,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  opacity: socialLoading === "google" ? 0.6 : 1,
                }}
              >
                <Ionicons name={socialLoading === "facebook" ? "hourglass-outline" : "logo-facebook"} size={20} color="#1877f2" />
                <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>FACEBOOK</Text>
              </Pressable>
            </View>
          </View>

          <Pressable style={{ marginTop: 24 }} onPress={openRegister}>
            <Text style={{ color: "#7f798a", fontSize: 12, fontWeight: "900", textAlign: "center" }}>
              INGET KONTO? <Text style={{ color: palette.gold }}>SKAPA KONTO GRATIS</Text>
            </Text>
          </Pressable>
        </View>
      ) : showAddPhone ? (
        <View style={{ paddingTop: 20, gap: 16 }}>
          <View style={[styles.formCard, { borderRadius: 34, padding: 24 }]}> 
            <View style={{ width: 70, height: 70, borderRadius: 24, backgroundColor: "rgba(231,178,75,0.1)", borderWidth: 1, borderColor: "rgba(231,178,75,0.2)", alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 18 }}>
              <Ionicons name="call-outline" size={28} color={palette.gold} />
            </View>
            <Text style={{ color: palette.text, fontSize: 28, fontWeight: "900", textAlign: "center", fontStyle: "italic" }}>LAGG TILL TELEFON</Text>
            <Text style={{ color: palette.muted, fontSize: 13, textAlign: "center", lineHeight: 20, marginTop: 10 }}>
              Ditt konto ar skapat via social inloggning. Verifiera ditt telefonnummer for att anvanda samma konto i appen och pa webben.
            </Text>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 22 }}>
              <Pressable
                onPress={() => {
                  const currentIndex = COUNTRY_CODES.findIndex((item) => item.code === addPhoneCountry);
                  const next = COUNTRY_CODES[(currentIndex + 1) % COUNTRY_CODES.length];
                  setAddPhoneCountry(next.code);
                }}
                style={{
                  width: 118,
                  borderRadius: 22,
                  backgroundColor: "#19191d",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                  paddingHorizontal: 16,
                  paddingVertical: 18,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ fontSize: 24 }}>{COUNTRY_CODES.find((item) => item.code === addPhoneCountry)?.flag || "🇸🇪"}</Text>
                <Text style={{ color: palette.text, fontSize: 15, fontWeight: "900" }}>{addPhoneCountry}</Text>
                <Ionicons name="chevron-forward-outline" size={16} color="#7f798a" />
              </Pressable>

              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0, fontSize: 18, fontWeight: "800", paddingVertical: 18 }]}
                placeholder="070 000 00 00"
                placeholderTextColor="#5f5b66"
                keyboardType="phone-pad"
                value={addPhoneNum}
                onChangeText={setAddPhoneNum}
              />
            </View>

            {!!addPhoneError && <Text style={{ color: palette.danger, fontSize: 11, fontWeight: "800", marginTop: 14, textAlign: "center" }}>{addPhoneError}</Text>}

            <PrimaryButton label={addPhoneLoading ? "SPARAR..." : "SPARA NUMMER"} onPress={handleAddPhone} disabled={addPhoneLoading} style={{ marginTop: 18 }} />
            <Pressable onPress={handleLogout} style={{ marginTop: 12 }}>
              <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "800", textAlign: "center" }}>Logga ut</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <View style={[styles.formCard, { borderRadius: 34, padding: 22 }]}> 
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View style={{ width: 58, height: 58, borderRadius: 20, backgroundColor: palette.gold, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {profile.image ? <Image source={{ uri: profile.image }} style={{ width: "100%", height: "100%" }} /> : <Ionicons name="person-outline" size={28} color="#000" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: palette.text, fontSize: 22, fontWeight: "900" }}>{(profile.name || "KUNDPROFIL").toUpperCase()}</Text>
                <Text style={{ color: "#7f798a", fontSize: 13, fontWeight: "800", marginTop: 2 }}>{profile.phone || profile.email || "GAST"}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                  <Ionicons name={profile.isVerified ? "shield-checkmark" : "alert-circle-outline"} size={14} color={profile.isVerified ? palette.success : palette.danger} />
                  <Text style={{ color: profile.isVerified ? palette.success : palette.danger, fontSize: 10, fontWeight: "900", textTransform: "uppercase" }}>
                    {profile.isVerified ? "Verifierad" : "Ej verifierad"}
                  </Text>
                </View>
              </View>
              <Pressable onPress={handleLogout} style={{ padding: 10 }}>
                <Ionicons name="log-out-outline" size={26} color={palette.danger} />
              </Pressable>
            </View>
          </View>

          {!profile.phone && (
            <Pressable
              onPress={() => setShowAddPhone(true)}
              style={{
                backgroundColor: "rgba(245,158,11,0.08)",
                borderRadius: 24,
                borderWidth: 1,
                borderColor: "rgba(245,158,11,0.2)",
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View>
                <Text style={{ color: "#f59e0b", fontSize: 10, fontWeight: "900", textTransform: "uppercase" }}>Rekommenderat</Text>
                <Text style={{ color: palette.text, fontSize: 14, fontWeight: "800", marginTop: 4 }}>Lagg till telefonnummer</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#f59e0b" />
            </Pressable>
          )}

          <View style={{ flexDirection: "row", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 24, padding: 6, marginBottom: 6, flexWrap: "wrap" }}>
            {([
              { id: "overview", icon: "person-outline", label: "HEM" },
              { id: "deals", icon: "sparkles-outline", label: "DEALS" },
              { id: "orders", icon: "time-outline", label: "ORDER" },
              { id: "addresses", icon: "location-outline", label: "ADRESS" },
              { id: "settings", icon: "settings-outline", label: "INST" },
            ] as const).map((tab) => (
              <Pressable
                key={tab.id}
                onPress={() => {
                  setActiveTab(tab.id);
                  if (tab.id !== "settings") setIsEditing(false);
                }}
                style={{
                  width: "20%",
                  minWidth: 62,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  paddingVertical: 12,
                  borderRadius: 18,
                  backgroundColor: activeTab === tab.id ? "rgba(255,255,255,0.1)" : "transparent",
                }}
              >
                <Ionicons name={tab.icon as any} size={16} color={activeTab === tab.id ? palette.gold : "#7f798a"} />
                <Text style={{ color: activeTab === tab.id ? palette.text : "#7f798a", fontSize: 8, fontWeight: "900" }}>{tab.label}</Text>
              </Pressable>
            ))}
          </View>

          {activeTab === "overview" && (
            <>
              <View style={[styles.formCard, { borderRadius: 30, padding: 22, gap: 18 }]}> 
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <Ionicons name="call-outline" size={16} color={palette.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#7f798a", fontSize: 9, fontWeight: "900", letterSpacing: 1.6 }}>TELEFON</Text>
                    <Text style={{ color: palette.text, fontSize: 14, fontWeight: "800", marginTop: 2 }}>{profile.phone || "Ej angivet"}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <Ionicons name="mail-outline" size={16} color={palette.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#7f798a", fontSize: 9, fontWeight: "900", letterSpacing: 1.6 }}>E-POST</Text>
                    <Text style={{ color: palette.text, fontSize: 14, fontWeight: "800", marginTop: 2 }}>{profile.email || "Ej angivet"}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <Ionicons name="home-outline" size={16} color={palette.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#7f798a", fontSize: 9, fontWeight: "900", letterSpacing: 1.6 }}>STANDARDADRESS</Text>
                    <Text style={{ color: palette.text, fontSize: 14, fontWeight: "800", marginTop: 2 }}>
                      {savedAddresses.find((item) => item.isDefault)?.street || profile.address || "Ingen sparad adress"}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={[styles.formCard, { borderRadius: 26, flex: 1, padding: 18 }]}> 
                  <Text style={{ color: "#7f798a", fontSize: 9, fontWeight: "900", letterSpacing: 1.6 }}>BESTALLNINGAR</Text>
                  <Text style={{ color: palette.text, fontSize: 30, fontWeight: "900", marginTop: 6 }}>{orders.length}</Text>
                </View>
                <View
                  style={[
                    styles.formCard,
                    {
                      borderRadius: 26,
                      flex: 1,
                      padding: 18,
                      backgroundColor: profile.isVerified ? "rgba(34,197,94,0.12)" : palette.panel,
                      borderColor: profile.isVerified ? "rgba(34,197,94,0.22)" : palette.border,
                    },
                  ]}
                >
                  <Text style={{ color: "#7f798a", fontSize: 9, fontWeight: "900", letterSpacing: 1.6 }}>STATUS</Text>
                  <Text style={{ color: profile.isVerified ? palette.success : palette.danger, fontSize: 15, fontWeight: "900", marginTop: 10, textTransform: "uppercase" }}>
                    {profile.isVerified ? "Verifierad" : "Ej veri."}
                  </Text>
                </View>
              </View>
            </>
          )}

          {activeTab === "deals" && (
            <View style={{ gap: 12 }}>
              {!deals.length ? (
                <View style={[styles.formCard, { borderRadius: 30, padding: 26, alignItems: "center" }]}> 
                  <Ionicons name="pricetags-outline" size={34} color="#4b4652" />
                  <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "900", marginTop: 14 }}>Inga erbjudanden tillgangliga</Text>
                </View>
              ) : (
                deals.map((deal) => (
                  <View key={deal.id || deal.code} style={{ backgroundColor: "rgba(231,178,75,0.06)", borderRadius: 30, borderWidth: 1, borderColor: "rgba(231,178,75,0.18)", padding: 22, gap: 16 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 14 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: palette.gold, fontSize: 10, fontWeight: "900", textTransform: "uppercase" }}>{deal.campaign?.title || "Personligt erbjudande"}</Text>
                        <Text style={{ color: palette.text, fontSize: 22, fontWeight: "900", fontStyle: "italic", marginTop: 6 }}>
                          {deal.campaign?.discountType === "PERCENTAGE"
                            ? `${deal.campaign?.discountValue || 0}% RABATT`
                            : `${deal.campaign?.discountValue || 0} KR RABATT`}
                        </Text>
                      </View>
                      <View style={{ width: 46, height: 46, borderRadius: 16, backgroundColor: palette.gold, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="ticket-outline" size={24} color="#000" />
                      </View>
                    </View>

                    <View style={{ backgroundColor: "rgba(0,0,0,0.24)", borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={{ color: palette.text, fontSize: 11, fontWeight: "900" }}>KOD: {deal.code}</Text>
                      <Pressable onPress={() => Linking.openURL(`sms:&body=${deal.code}`).catch(() => {})}>
                        <Text style={{ color: palette.gold, fontSize: 10, fontWeight: "900", textTransform: "uppercase" }}>Dela</Text>
                      </Pressable>
                    </View>

                    <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "800" }}>Min. order: {deal.campaign?.minOrder || 0} kr</Text>
                  </View>
                ))
              )}
            </View>
          )}

          {activeTab === "orders" && (
            <View style={{ gap: 12 }}>
              {!orders.length ? (
                <View style={[styles.formCard, { borderRadius: 30, padding: 26, alignItems: "center" }]}> 
                  <Ionicons name="time-outline" size={34} color="#4b4652" />
                  <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "900", marginTop: 14 }}>Inga ordrar annu</Text>
                </View>
              ) : (
                orders.map((order) => (
                  <View key={order.id} style={[styles.formCard, { borderRadius: 30, padding: 18, gap: 14 }]}> 
                    <Pressable onPress={() => openOrder(order.id)}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <View style={{ flex: 1, paddingRight: 16 }}>
                          <Text style={{ color: palette.text, fontSize: 15, fontWeight: "900", fontStyle: "italic", textTransform: "uppercase" }}>
                            {order.restaurant?.name || order.restaurantName || "Bestallning"}
                          </Text>
                          <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "800", marginTop: 4 }}>
                            {order.createdAt ? new Date(order.createdAt).toLocaleDateString("sv-SE") : ""}
                          </Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={{ color: palette.gold, fontSize: 20, fontWeight: "900" }}>{(order.total || order.totalAmount || 0).toFixed(0)} kr</Text>
                          <Text style={{ color: "#7f798a", fontSize: 10, fontWeight: "900", marginTop: 4 }}>{order.status.toUpperCase()}</Text>
                        </View>
                      </View>
                    </Pressable>

                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <Pressable
                        onPress={() => handleReorder(order.id)}
                        style={{ backgroundColor: "rgba(231,178,75,0.1)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(231,178,75,0.18)", paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 8 }}
                      >
                        <Ionicons name={reorderingId === order.id ? "hourglass-outline" : "refresh-outline"} size={14} color={palette.gold} />
                        <Text style={{ color: palette.gold, fontSize: 10, fontWeight: "900", textTransform: "uppercase" }}>
                          {reorderingId === order.id ? "Laddar" : "Bestall igen"}
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() => openOrder(order.id)}
                        style={{ backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 8 }}
                      >
                        <Ionicons name="chevron-forward-outline" size={14} color={palette.text} />
                        <Text style={{ color: palette.text, fontSize: 10, fontWeight: "900", textTransform: "uppercase" }}>Detaljer</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {activeTab === "addresses" && (
            <View style={{ gap: 14 }}>
              {!savedAddresses.length ? (
                <View style={[styles.formCard, { borderRadius: 30, padding: 26, alignItems: "center" }]}> 
                  <Ionicons name="location-outline" size={34} color="#4b4652" />
                  <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "900", marginTop: 14 }}>Inga sparade adresser</Text>
                </View>
              ) : (
                savedAddresses.map((addr) => (
                  <View key={addr.id} style={[styles.formCard, { borderRadius: 26, padding: 18, flexDirection: "row", gap: 12, alignItems: "center" }]}> 
                    <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: addr.isDefault ? "rgba(231,178,75,0.12)" : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: addr.isDefault ? "rgba(231,178,75,0.2)" : "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name={addr.label === "Hem" ? "home-outline" : addr.label === "Jobb" ? "briefcase-outline" : "location-outline"} size={18} color={addr.isDefault ? palette.gold : palette.muted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={{ color: palette.text, fontSize: 14, fontWeight: "900", fontStyle: "italic", textTransform: "uppercase" }}>{addr.label}</Text>
                        {addr.isDefault && <Text style={{ color: palette.gold, fontSize: 8, fontWeight: "900", textTransform: "uppercase" }}>Standard</Text>}
                      </View>
                      <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "800", marginTop: 4 }}>{addr.street}, {addr.zip} {addr.city}</Text>
                      {!!addr.note && <Text style={{ color: "#7f798a", fontSize: 10, marginTop: 4 }}>{addr.note}</Text>}
                    </View>
                    <View style={{ gap: 8 }}>
                      {!addr.isDefault && (
                        <Pressable onPress={() => setAddressAsDefault(addr.id)} style={{ padding: 8 }}>
                          <Ionicons name="checkmark-outline" size={16} color={palette.gold} />
                        </Pressable>
                      )}
                      <Pressable
                        onPress={() => {
                          Alert.alert("Radera adress?", "Den har adressen tas bort fran ditt konto.", [
                            { text: "Avbryt", style: "cancel" },
                            { text: "Radera", style: "destructive", onPress: () => { void deleteSavedAddress(addr.id); } },
                          ]);
                        }}
                        style={{ padding: 8 }}
                      >
                        <Ionicons name="trash-outline" size={16} color={palette.danger} />
                      </Pressable>
                    </View>
                  </View>
                ))
              )}

              <View style={[styles.formCard, { borderRadius: 30, padding: 20, gap: 12 }]}> 
                <Text style={{ color: palette.text, fontSize: 15, fontWeight: "900", fontStyle: "italic" }}>LAGG TILL ADRESS</Text>

                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(["Hem", "Jobb", "Annat"] as const).map((label) => (
                    <Pressable
                      key={label}
                      onPress={() => setNewAddrLabel(label)}
                      style={{
                        flex: 1,
                        backgroundColor: newAddrLabel === label ? "rgba(231,178,75,0.12)" : "rgba(255,255,255,0.04)",
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: newAddrLabel === label ? "rgba(231,178,75,0.24)" : "rgba(255,255,255,0.06)",
                        paddingVertical: 12,
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                      }}
                    >
                      <Ionicons name={label === "Hem" ? "home-outline" : label === "Jobb" ? "briefcase-outline" : "location-outline"} size={14} color={newAddrLabel === label ? palette.gold : palette.muted} />
                      <Text style={{ color: newAddrLabel === label ? palette.gold : palette.muted, fontSize: 9, fontWeight: "900", textTransform: "uppercase" }}>{label}</Text>
                    </Pressable>
                  ))}
                </View>

                <TextInput style={styles.input} placeholder="Gatuadress" placeholderTextColor={palette.muted} value={newAddrStreet} onChangeText={setNewAddrStreet} />
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Stad" placeholderTextColor={palette.muted} value={newAddrCity} onChangeText={setNewAddrCity} />
                  <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Postnummer" placeholderTextColor={palette.muted} value={newAddrZip} onChangeText={setNewAddrZip} />
                </View>
                <TextInput style={[styles.input, { marginBottom: 0 }]} placeholder="Portkod, vaning (valfritt)" placeholderTextColor={palette.muted} value={newAddrNote} onChangeText={setNewAddrNote} />
                <PrimaryButton label={addrSaving ? "SPARAR..." : "SPARA ADRESS"} onPress={handleSaveAddress} disabled={addrSaving} icon="add-outline" style={{ marginTop: 4 }} />
              </View>
            </View>
          )}

          {activeTab === "settings" && !isEditing && (
            <View style={{ gap: 14 }}>
              <View style={[styles.formCard, { borderRadius: 30, padding: 0, overflow: "hidden" }]}> 
                <Pressable onPress={() => setIsEditing(true)} style={{ padding: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(231,178,75,0.12)", alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="create-outline" size={18} color={palette.gold} />
                    </View>
                    <View>
                      <Text style={{ color: palette.text, fontSize: 14, fontWeight: "800" }}>Redigera profil</Text>
                      <Text style={{ color: palette.muted, fontSize: 10, marginTop: 3 }}>Namn och e-post</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward-outline" size={18} color="#7f798a" />
                </Pressable>
              </View>

              <View style={[styles.formCard, { borderRadius: 30, padding: 0, overflow: "hidden" }]}> 
                <Pressable onPress={() => Linking.openURL(`${WEB_URL}/privacy`).catch(() => {})} style={{ padding: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" }}>
                  <Text style={{ color: palette.text, fontSize: 14, fontWeight: "800" }}>Integritetspolicy</Text>
                  <Ionicons name="open-outline" size={18} color="#7f798a" />
                </Pressable>
                <Pressable onPress={() => Linking.openURL(`${WEB_URL}/terms`).catch(() => {})} style={{ padding: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: palette.text, fontSize: 14, fontWeight: "800" }}>Anvandarvillkor</Text>
                  <Ionicons name="open-outline" size={18} color="#7f798a" />
                </Pressable>
              </View>

              <View style={[styles.formCard, { borderRadius: 30, padding: 0, overflow: "hidden" }]}> 
                <Pressable onPress={handleDeleteAccount} style={{ padding: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: palette.danger, fontSize: 14, fontWeight: "800" }}>Radera konto</Text>
                  <Ionicons name="trash-outline" size={18} color={palette.danger} />
                </Pressable>
              </View>
            </View>
          )}

          {activeTab === "settings" && isEditing && (
            <View style={[styles.formCard, { borderRadius: 30, padding: 20, gap: 14 }]}> 
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Pressable onPress={() => setIsEditing(false)}>
                  <Ionicons name="arrow-back-outline" size={18} color={palette.text} />
                </Pressable>
                <Text style={{ color: palette.text, fontSize: 18, fontWeight: "900", fontStyle: "italic" }}>ANDRA UPPGIFTER</Text>
              </View>

              <TextInput style={styles.input} placeholder="Namn" placeholderTextColor={palette.muted} value={editName} onChangeText={setEditName} />
              <TextInput style={styles.input} placeholder="E-post" placeholderTextColor={palette.muted} value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" autoCapitalize="none" />
              <TextInput style={[styles.input, { color: "#7f798a" }]} editable={false} value={profile.phone || "Ej angivet"} />
              <PrimaryButton
                label={isSaving ? "SPARAR..." : saveSuccess ? "SPARAT" : "SPARA"}
                onPress={handleUpdateProfile}
                disabled={isSaving}
                icon={saveSuccess ? "checkmark-outline" : "save-outline"}
                style={saveSuccess ? { backgroundColor: palette.success } : undefined}
              />
            </View>
          )}
        </>
      )}

      <Modal visible={showOtp} transparent animationType="slide" onRequestClose={() => setShowOtp(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { borderRadius: 30 }]}> 
            <Text style={styles.sectionHeading}>Verifiera kod</Text>
            <Text style={styles.helperText}>Kod skickad till {otpPhone}</Text>
            <TextInput
              style={styles.input}
              placeholder="000 000"
              placeholderTextColor={palette.muted}
              value={otpCode}
              onChangeText={(value) => setOtpCode(value.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
            />
            {!!loginError && <Text style={{ color: palette.danger, fontSize: 11, fontWeight: "800", marginBottom: 10, textAlign: "center" }}>{loginError}</Text>}
            <PrimaryButton label={authLoading ? "VERIFIERAR..." : "BEKRAFTA KOD"} onPress={verifyOtp} disabled={authLoading} icon="shield-checkmark-outline" />
            <Pressable style={{ marginTop: 10 }} onPress={() => setShowOtp(false)}>
              <Text style={styles.linkText}>Avbryt</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScreenWrap>
  );
}

function RegisterScreen({
  goBack,
  onRegistered,
}: {
  goBack: () => void;
  onRegistered: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const setToken = useAppStore((s) => s.setToken);

  const register = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.post("/api/account/register-user", { name, phone, email, password });
      if (response.data?.token) {
        setToken(response.data.token);
      }
      onRegistered();
    } catch (error: any) {
      Alert.alert("Registration failed", error?.response?.data?.error || "Please try again.");
    } finally {
      setLoading(false);
    }
  }, [email, name, onRegistered, password, phone, setToken]);

  return (
    <ScreenWrap>
      <Header title="Register" subtitle="Password registration from the same API" onBack={goBack} />
      <View style={styles.formCard}>
        <TextInput style={styles.input} placeholder="Full name" placeholderTextColor={palette.muted} value={name} onChangeText={setName} />
        <TextInput style={styles.input} placeholder="Phone" placeholderTextColor={palette.muted} value={phone} onChangeText={setPhone} />
        <TextInput style={styles.input} placeholder="Email" placeholderTextColor={palette.muted} value={email} onChangeText={setEmail} />
        <TextInput style={styles.input} placeholder="Password" placeholderTextColor={palette.muted} secureTextEntry value={password} onChangeText={setPassword} />
        <PrimaryButton label={loading ? "Creating..." : "Create account"} onPress={register} disabled={loading} icon="person-add-outline" />
      </View>
    </ScreenWrap>
  );
}

function OrderScreen({ id, goBack }: { id: string; goBack: () => void }) {
  const token = useAppStore((s) => s.token);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);

  const fetchOrder = useCallback(async () => {
    try {
      const response = await api.get(`/api/orders/${id}`);
      setOrder(response.data || null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrder();

    // Socket.IO for real-time status updates (same as the webapp)
    const socket = io(SOCKET_URL, { path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => socket.emit("join:order", id));
    socket.on("order:status", (payload: any) => {
      if (payload.orderId === id) {
        setOrder((current) => (current ? { ...current, status: payload.status, estimatedTime: payload.estimatedTime ?? current.estimatedTime } : current));
      }
    });

    // Poll every 15 s as a fallback (matching the webapp's behaviour)
    const pollInterval = setInterval(() => {
      fetchOrder();
    }, 15000);

    return () => {
      socket.disconnect();
      clearInterval(pollInterval);
    };
  }, [fetchOrder, id]);

  if (loading) {
    return (
      <ScreenWrap>
        <Header title="Spårar beställning..." subtitle={`Laddar #...`} onBack={goBack} />
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={palette.gold} />
        </View>
      </ScreenWrap>
    );
  }

  if (!order) {
    return (
      <ScreenWrap>
        <Header title="Order hittades inte" subtitle={id} onBack={goBack} />
        <EmptyPanel label="Kunde inte hitta beställningen." />
      </ScreenWrap>
    );
  }

  const getStatusDisplay = () => {
    switch (order.status) {
      case "PENDING":
        return { label: "GRANSKAS", desc: "Vi har tagit emot din beställning. Väntar på att köket ska bekräfta.", icon: "time-outline", color: "#f59e0b" };
      case "ACCEPTED":
      case "PREPARING":
        return { label: "TILLAGAS", desc: "Dina råvaror förvandlas till en fantastisk måltid just nu.", icon: "flame-outline", color: "#f97316" };
      case "READY":
        return { label: "REDO!", desc: "Maten är klar! Din beställning är packad och redo att hämtas upp.", icon: "checkmark-circle-outline", color: "#0ea5e9" };
      case "OUT_FOR_DELIVERY":
      case "DELIVERING":
        return { label: "PÅ VÄG!", desc: "Utkörning pågår! Håll ett öga på dörren.", icon: "bicycle-outline", color: "#10b981" };
      case "DELIVERED":
      case "COMPLETED":
        return { label: "LEVERERAD", desc: "Hoppas det smakar! Tack för att du handlar hos oss.", icon: "checkmark-done-outline", color: "#22c55e" };
      case "CANCELLED":
      case "REJECTED":
        return { label: "AVBRUTEN", desc: "Tyvärr blev beställningen avbruten. Du har inte debiterats.", icon: "close-circle-outline", color: palette.danger };
      default:
        return { label: order.status, desc: "Status uppdateras strax...", icon: "ellipse-outline", color: palette.gold };
    }
  };

  const statusInfo = getStatusDisplay();
  const isRejected = order.status === "REJECTED" || order.status === "CANCELLED";
  const steps = order.type === "DELIVERY" ? ["PENDING", "ACCEPTED", "PREPARING", "OUT_FOR_DELIVERY"] : ["PENDING", "ACCEPTED", "PREPARING", "READY"];
  const currentIdx = steps.indexOf(order.status);

  return (
    <ScreenWrap>
      <View style={{ flex: 1, backgroundColor: palette.bg, padding: 20 }}>
        {/* Header section matching web */}
        <Pressable onPress={() => goBack()} style={{ width: 44, height: 44, backgroundColor: "#19191d", borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
           <Ionicons name="arrow-back" size={22} color={palette.text} />
        </Pressable>

        <View style={{ marginBottom: 30 }}>
          <View style={{ alignSelf: "flex-start", backgroundColor: "rgba(231, 178, 75, 0.1)", borderWidth: 1, borderColor: "rgba(231, 178, 75, 0.3)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <Ionicons name="flash" size={14} color={palette.gold} style={{ opacity: 0.8 }} />
            <Text style={{ color: palette.gold, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 }}>LIVE TRACKING</Text>
          </View>
          <Text style={{ fontSize: 38, fontWeight: "900", color: palette.text, fontStyle: "italic", letterSpacing: -1 }}>
            ORDER <Text style={{ color: palette.gold }}>{order.orderNumber || `#${id.slice(0, 8)}`}</Text>
          </Text>
          <Text style={{ fontSize: 10, fontWeight: "900", color: "#6f667d", letterSpacing: 2, marginTop: 4 }}>
            DIN BESTÄLLNING BEHANDLAS I REALTID
          </Text>
        </View>

        {/* ETA Panel */}
        {order.status !== "COMPLETED" && order.status !== "DELIVERED" && !isRejected && (
          <View style={{ backgroundColor: "#19191d", borderRadius: 32, padding: 24, flexDirection: "row", alignItems: "center", gap: 20, marginBottom: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: palette.gold, alignItems: "center", justifyContent: "center", shadowColor: palette.gold, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 20 }}>
               <Ionicons name="time" size={32} color="#000" />
            </View>
            <View>
               <Text style={{ color: "#6f667d", fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 4 }}>KLAR OM UNGEFÄR</Text>
               <Text style={{ color: palette.text, fontSize: 28, fontWeight: "900", fontStyle: "italic", letterSpacing: -1 }}>~{order.estimatedTime} MIN</Text>
            </View>
          </View>
        )}

        {/* Status Panel */}
        <View style={{ backgroundColor: `${statusInfo.color}10`, borderRadius: 40, padding: 30, alignItems: "center", marginBottom: 30, borderWidth: 1, borderColor: `${statusInfo.color}30` }}>
           <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: palette.bg, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
              <View style={{ position: "absolute" }}>
                <PulseIndicator color={statusInfo.color} size={60} />
              </View>
              <Ionicons name={statusInfo.icon as any} size={36} color={statusInfo.color} />
           </View>
           <Text style={{ color: statusInfo.color, fontSize: 26, fontWeight: "900", fontStyle: "italic", letterSpacing: -1, marginBottom: 8 }}>
             {statusInfo.label}
           </Text>
           <Text style={{ color: "#85808e", fontSize: 12, fontWeight: "700", letterSpacing: 1, textAlign: "center", lineHeight: 20, textTransform: "uppercase" }}>
             {statusInfo.desc}
           </Text>
           {order.status === "PENDING" && (
             <View style={{ marginTop: 20 }}>
                <SpinningLoader color={statusInfo.color} size={24} />
             </View>
           )}
        </View>

        {/* Progress Bar */}
        {!isRejected && currentIdx !== -1 && (
          <View style={{ marginBottom: 40, paddingHorizontal: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              {steps.map((step, idx) => {
                const isDone = currentIdx >= idx;
                const isActive = currentIdx === idx;
                const info = idx === steps.length - 1 && order.status === "READY" ? { label: "REDO" } : { label: step.split("_")[0] };
                
                return (
                  <View key={step} style={{ alignItems: "center", gap: 10, flex: 1, position: "relative" }}>
                    {/* Line behind */}
                    {idx < steps.length - 1 && (
                      <View 
                        style={{ 
                          position: "absolute", 
                          top: 15, 
                          left: "50%", 
                          right: "-50%", 
                          height: 2, 
                          backgroundColor: isDone && currentIdx > idx ? palette.gold : "rgba(255,255,255,0.05)",
                          zIndex: 0
                        }} 
                      />
                    )}
                    
                    <View 
                      style={{ 
                        width: 30, 
                        height: 30, 
                        borderRadius: 15, 
                        backgroundColor: isDone ? palette.gold : palette.bg, 
                        borderWidth: 2, 
                        borderColor: isDone ? palette.gold : "rgba(255,255,255,0.1)",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 1,
                        shadowColor: isDone ? palette.gold : "transparent",
                        shadowOpacity: 0.3,
                        shadowRadius: 10
                      }}
                    >
                      {isDone ? (
                        <Ionicons name="checkmark" size={16} color="#000" />
                      ) : (
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.2)" }} />
                      )}
                    </View>
                    <Text style={{ fontSize: 8, fontWeight: "900", color: isActive ? palette.gold : isDone ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)", letterSpacing: 1 }}>
                      {info.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Details Panel */}
        <View style={{ backgroundColor: "#151318", borderRadius: 32, padding: 24, marginBottom: 20 }}>
           <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <Text style={{ color: palette.text, fontSize: 18, fontWeight: "900", fontStyle: "italic", letterSpacing: -0.5 }}>BESTÄLLNINGSDETALJER</Text>
              <Ionicons name="basket-outline" size={24} color={palette.gold} />
           </View>

           {order.items?.map((item: any, i: number) => (
             <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 16 }}>
                <View style={{ flexDirection: "row", gap: 12, flex: 1 }}>
                   <View style={{ backgroundColor: "rgba(231, 178, 75, 0.1)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, alignSelf: "flex-start", marginTop: 2 }}>
                      <Text style={{ color: palette.gold, fontSize: 10, fontWeight: "900" }}>{item.quantity}x</Text>
                   </View>
                   <View style={{ flex: 1 }}>
                      <Text style={{ color: palette.text, fontSize: 14, fontWeight: "900", fontStyle: "italic", textTransform: "uppercase", marginBottom: 4 }}>
                         {item.productName || item.name}
                      </Text>
                      {(() => {
                        let extras = [];
                        try {
                          extras = typeof item.selectedExtras === "string" 
                            ? JSON.parse(item.selectedExtras) 
                            : (item.selectedExtras || []);
                        } catch (e) { extras = []; }
                        
                        return Array.isArray(extras) ? extras.map((extra: any, j: number) => (
                          <Text key={j} style={{ color: palette.muted, fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" }}>
                             {extra.extraName} {extra.priceAddon > 0 ? `(+${extra.priceAddon} kr)` : ""}
                          </Text>
                        )) : null;
                      })()}
                      {!!item.note && (
                         <Text style={{ color: palette.info, fontSize: 10, fontWeight: "700", fontStyle: "italic", marginTop: 4 }}>
                            Tips: {item.note}
                         </Text>
                      )}
                   </View>
                </View>
                <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "900", fontStyle: "italic" }}>
                   {item.subtotal} KR
                </Text>
             </View>
           ))}

           <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.05)", marginVertical: 20 }} />

           <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 16 }}>
              <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 }}>DELSUMMA</Text>
              <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "900" }}>{(order.total || 0) - (order.deliveryFee || 0)} KR</Text>
           </View>
           {order.type === "DELIVERY" && (
             <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 16 }}>
                <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 }}>LEVERANS</Text>
                <Text style={{ color: palette.gold, fontSize: 10, fontWeight: "900" }}>{order.deliveryFee || 0} KR</Text>
             </View>
           )}

           <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.05)", marginVertical: 20 }} />

           <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
              <Text style={{ color: palette.text, fontSize: 24, fontWeight: "900", fontStyle: "italic", letterSpacing: -1 }}>SUMMA</Text>
              <Text style={{ color: palette.gold, fontSize: 32, fontWeight: "900", fontStyle: "italic", letterSpacing: -1 }}>{order.total || 0} <Text style={{ fontSize: 12, fontWeight: "700", fontStyle: "normal" }}>SEK</Text></Text>
           </View>
        </View>

        {/* Management Panel */}
        <View style={{ backgroundColor: "#151318", borderRadius: 32, padding: 24, marginBottom: 40 }}>
           <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <Text style={{ color: palette.text, fontSize: 18, fontWeight: "900", fontStyle: "italic", letterSpacing: -0.5 }}>HANTERING</Text>
              <Ionicons name={order.type === "DELIVERY" ? "car-outline" : "business-outline"} size={24} color={palette.gold} />
           </View>

           <View style={{ gap: 20 }}>
             <View style={{ flexDirection: "row", gap: 16 }}>
                <Ionicons name="call-outline" size={18} color={palette.gold} style={{ marginTop: 2 }} />
                <View>
                   <Text style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, fontWeight: "900", letterSpacing: 2, marginBottom: 4 }}>DITT NUMMER</Text>
                   <Text style={{ color: palette.text, fontSize: 14, fontWeight: "900", fontStyle: "italic" }}>{order.customerPhone}</Text>
                </View>
             </View>
             <View style={{ flexDirection: "row", gap: 16 }}>
                <Ionicons name="storefront-outline" size={18} color={palette.gold} style={{ marginTop: 2 }} />
                <View>
                   <Text style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, fontWeight: "900", letterSpacing: 2, marginBottom: 4 }}>RESTAURANG</Text>
                   <Text style={{ color: palette.text, fontSize: 14, fontWeight: "900", fontStyle: "italic", textTransform: "uppercase" }}>{order.restaurantName || order.restaurant?.name || "RESTAURANG"}</Text>
                </View>
             </View>
             {order.type === "DELIVERY" && (
               <View style={{ flexDirection: "row", gap: 16 }}>
                  <Ionicons name="location-outline" size={18} color={palette.info} style={{ marginTop: 2 }} />
                  <View>
                     <Text style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, fontWeight: "900", letterSpacing: 2, marginBottom: 4 }}>LEVERANSADRESS</Text>
                     <Text style={{ color: palette.text, fontSize: 14, fontWeight: "900", fontStyle: "italic", textTransform: "uppercase" }}>{order.deliveryStreet}</Text>
                     <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "900", textTransform: "uppercase" }}>{order.deliveryZip} {order.deliveryCity}</Text>
                  </View>
               </View>
             )}
           </View>
        </View>

      </View>
    </ScreenWrap>
  );
}

function ProductModal({
  product,
  address,
  onClose,
  onAdd,
}: {
  product: MenuProduct | null;
  address: string;
  onClose: () => void;
  onAdd: (payload: { quantity: number; note?: string; extras: CartItem["extras"] }) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [extras, setExtras] = useState<CartItem["extras"]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  const orderedGroups = useMemo(
    () => [...(product?.extraGroups || [])].sort((a, b) => (a.position || 0) - (b.position || 0)),
    [product],
  );

  const getExtraPrice = useCallback((extra: MenuExtra) => extra.priceAddon ?? extra.price ?? 0, []);

  const getSelectionCount = useCallback(
    (groupId: string) => extras.filter((item) => item.groupId === groupId).length,
    [extras],
  );

  const getGroupHelperText = useCallback((group: MenuExtraGroup) => {
    const min = group.minSelections || 0;
    const max = group.maxSelections || 0;

    if (min > 0 && max > 0 && min === max) return `Välj ${max} alternativ`;
    if (min > 0 && max > 0) return `Välj ${min}-${max} alternativ`;
    if (min > 0) return `Välj minst ${min}`;
    if (max > 1) return `Välj upp till ${max}`;
    if (group.type === "RADIO") return "Välj 1 alternativ";
    return group.required ? "Måste väljas" : "Valfritt";
  }, []);

  useEffect(() => {
    if (!product) {
      setQuantity(1);
      setNote("");
      setExtras([]);
      setSelectionError(null);
      return;
    }

    const defaults: CartItem["extras"] = [];
    product.extraGroups?.forEach((group) => {
      group.extras.forEach((extra) => {
        if (extra.isDefault) {
          defaults.push({
            groupId: group.id,
            groupName: group.name,
            extraId: extra.id,
            name: extra.name,
            price: getExtraPrice(extra),
          });
        }
      });
    });

    setQuantity(1);
    setNote("");
    setExtras(defaults);
    setSelectionError(null);
  }, [getExtraPrice, product]);

  if (!product) return null;

  const extrasPrice = extras.reduce((sum, extra) => sum + extra.price, 0);
  const totalPrice = (product.price + extrasPrice) * quantity;

  const toggleExtra = (group: MenuExtraGroup, extra: MenuExtra) => {
    setSelectionError(null);

    setExtras((current) => {
      const exists = current.some((item) => item.extraId === extra.id);

      if (group.type === "RADIO") {
        if (exists) return current;
        return [
          ...current.filter((item) => item.groupId !== group.id),
          {
            groupId: group.id,
            groupName: group.name,
            extraId: extra.id,
            name: extra.name,
            price: getExtraPrice(extra),
          },
        ];
      }

      if (exists) {
        return current.filter((item) => item.extraId !== extra.id);
      }

      const countInGroup = current.filter((item) => item.groupId === group.id).length;
      if (countInGroup >= (group.maxSelections || 99)) {
        return current;
      }

      return [
        ...current,
        {
          groupId: group.id,
          groupName: group.name,
          extraId: extra.id,
          name: extra.name,
          price: getExtraPrice(extra),
        },
      ];
    });
  };

  const handleAddToCart = () => {
    for (const group of orderedGroups) {
      const selectedInGroup = extras.filter((item) => item.groupId === group.id);

      if (group.required && selectedInGroup.length === 0) {
        setSelectionError(`Välj ett alternativ i ${group.name.toLowerCase()}.`);
        return;
      }

      if (selectedInGroup.length < (group.minSelections || 0)) {
        setSelectionError(`${group.name} kräver minst ${group.minSelections} val.`);
        return;
      }

      if (selectedInGroup.length > (group.maxSelections || 99)) {
        setSelectionError(`${group.name} tillåter högst ${group.maxSelections} val.`);
        return;
      }
    }

    onAdd({ quantity, note: note.trim() || undefined, extras });
  };

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, styles.productModalBackdrop]}>
        <Pressable style={styles.productModalScrim} onPress={onClose} />
        <View style={styles.productModalSheet}>
          <View style={styles.productModalHandle} />
          <Pressable style={styles.productModalCloseButton} onPress={onClose}>
            <Ionicons name="close" size={20} color={palette.text} />
          </Pressable>

          <ScrollView style={styles.productModalScroll} contentContainerStyle={styles.productModalContent} showsVerticalScrollIndicator={false}>
            {product.imageUrl ? (
              <View style={styles.productHeroCard}>
                <Image source={{ uri: getImageUrl(product.imageUrl) }} style={styles.productHeroImage} />
                <LinearGradient colors={["transparent", "rgba(11,10,15,0.15)", "rgba(11,10,15,0.96)"]} style={styles.productHeroOverlay} />
                <View style={styles.productHeroContent}>
                  <View style={styles.productHeroPriceChip}>
                    <Text style={styles.productHeroPriceChipText}>Från {product.price} kr</Text>
                  </View>
                  <Text style={styles.productModalTitle}>{product.name}</Text>
                  {!!product.description && <Text style={styles.productModalDescription}>{product.description}</Text>}
                </View>
              </View>
            ) : (
              <View style={styles.productModalHeader}>
                <View style={styles.productHeroPriceChip}>
                  <Text style={styles.productHeroPriceChipText}>Från {product.price} kr</Text>
                </View>
                <Text style={styles.productModalTitle}>{product.name}</Text>
                {!!product.description && <Text style={styles.productModalDescription}>{product.description}</Text>}
              </View>
            )}

            <View style={styles.productMetaCard}>
              <Ionicons name="location-outline" size={18} color={palette.gold} />
              <Text style={styles.productMetaText} numberOfLines={2}>
                {address ? `Leverans till ${address}` : "Lägg till adress på startsidan om du vill kontrollera leveransen."}
              </Text>
            </View>

            {orderedGroups.map((group) => {
              const selectionCount = getSelectionCount(group.id);
              return (
                <View key={group.id} style={styles.productGroupCard}>
                  <View style={styles.productGroupHeader}>
                    <View style={{ flex: 1, gap: 6 }}>
                      <Text style={styles.productGroupTitle}>{group.name}</Text>
                      <Text style={styles.productGroupDescription}>{group.description || getGroupHelperText(group)}</Text>
                    </View>
                    <View style={styles.productGroupBadgeRow}>
                      <View style={[styles.productGroupBadge, group.required ? styles.productGroupBadgeRequired : styles.productGroupBadgeOptional]}>
                        <Text style={[styles.productGroupBadgeText, group.required ? styles.productGroupBadgeTextRequired : styles.productGroupBadgeTextOptional]}>
                          {group.required ? "Måste väljas" : "Valfritt"}
                        </Text>
                      </View>
                      {(group.maxSelections || 0) > 1 && (
                        <View style={styles.productGroupCountBadge}>
                          <Text style={styles.productGroupCountText}>{selectionCount}/{group.maxSelections}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.productOptionsList}>
                    {(group.extras || []).map((extra) => {
                      const active = extras.some((item) => item.extraId === extra.id);
                      const extraPrice = getExtraPrice(extra);
                      const disabled = group.type !== "RADIO" && !active && selectionCount >= (group.maxSelections || 99);

                      return (
                        <Pressable
                          key={extra.id}
                          style={[styles.productOptionCard, active && styles.productOptionCardActive, disabled && styles.productOptionCardDisabled]}
                          onPress={() => toggleExtra(group, extra)}
                          disabled={disabled}
                        >
                          <View style={styles.productOptionMainRow}>
                            <View style={[styles.productOptionIndicator, active && styles.productOptionIndicatorActive]}>
                              {active && <View style={styles.productOptionIndicatorInner} />}
                            </View>
                            <View style={styles.productOptionTextWrap}>
                              <Text style={[styles.productOptionTitle, active && styles.productOptionTitleActive]}>{extra.name}</Text>
                              <Text style={[styles.productOptionMeta, active && styles.productOptionMetaActive]}>
                                {extraPrice > 0 ? `+${extraPrice} kr` : "Ingår"}
                              </Text>
                            </View>
                          </View>
                          {active && <Ionicons name="checkmark" size={18} color={palette.gold} />}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}

            <View style={styles.productNoteCard}>
              <Text style={styles.productNoteLabel}>Önskemål</Text>
              <TextInput
                style={styles.productNoteInput}
                multiline
                placeholder="Allergier eller speciella önskemål?"
                placeholderTextColor={palette.muted}
                value={note}
                onChangeText={setNote}
              />
            </View>

            {!!selectionError && (
              <View style={styles.productSelectionError}>
                <Ionicons name="alert-circle-outline" size={18} color="#fda4af" />
                <Text style={styles.productSelectionErrorText}>{selectionError}</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.productModalFooter}>
            <View style={styles.productFooterSummaryRow}>
              <View>
                <Text style={styles.productFooterLabel}>Totalt</Text>
                <Text style={styles.productFooterValue}>{totalPrice} kr</Text>
              </View>
              <View style={styles.productQuantityCard}>
                <Pressable onPress={() => setQuantity((current) => Math.max(1, current - 1))} style={styles.productQuantityButton}>
                  <Ionicons name="remove-outline" size={18} color={palette.text} />
                </Pressable>
                <Text style={styles.productQuantityValue}>{quantity}</Text>
                <Pressable onPress={() => setQuantity((current) => current + 1)} style={styles.productQuantityButton}>
                  <Ionicons name="add-outline" size={18} color={palette.text} />
                </Pressable>
              </View>
            </View>

            <Pressable style={styles.productAddButton} onPress={handleAddToCart}>
              <View style={styles.productAddButtonContent}>
                <View style={styles.productAddButtonIconWrap}>
                  <Ionicons name="bag-handle-outline" size={18} color="#000" />
                </View>
                <View>
                  <Text style={styles.productAddButtonLabel}>Lägg i kassen</Text>
                  <Text style={styles.productAddButtonSubLabel}>Klar att beställa</Text>
                </View>
              </View>
              <Text style={styles.productAddButtonPrice}>{totalPrice} kr</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function BottomTabs({
  active,
  onChange,
}: {
  active: string;
  onChange: (name: "home" | "search" | "cart" | "profile" | "discover") => void;
}) {
  const itemCount = useAppStore((state) => state.items.reduce((sum, item) => sum + item.quantity, 0));
  const tabs: { key: "home" | "discover" | "cart" | "profile"; label: string; icon: keyof typeof Ionicons.glyphMap; count?: number }[] = [
    { key: "home", label: "HEM", icon: "home-outline" },
    { key: "discover", label: "UPPTÄCK", icon: "compass-outline" },
    { key: "cart", label: "KASSE", icon: "bag-handle-outline", count: itemCount },
    { key: "profile", label: "PROFIL", icon: "person-outline" },
  ];

  const translateX = useRef(new Animated.Value(0)).current;
  const pillWidth = useRef(new Animated.Value(0)).current;
  const [layouts, setLayouts] = useState<Record<string, { x: number; width: number }>>({});

  useEffect(() => {
    if (layouts[active]) {
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: layouts[active].x,
          useNativeDriver: false,
          friction: 8,
          tension: 40,
        }),
        Animated.spring(pillWidth, {
          toValue: layouts[active].width,
          useNativeDriver: false,
          friction: 8,
          tension: 40,
        }),
      ]).start();
    }
  }, [active, layouts, translateX, pillWidth]);

  return (
    <View
      style={[
        styles.bottomTabs,
        {
          left: 16,
          right: 16,
          bottom: 25,
          borderRadius: 40,
          paddingVertical: 10,
          paddingHorizontal: 10,
          backgroundColor: "#16151a",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.06)",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.5,
          shadowRadius: 20,
          elevation: 10,
          flexDirection: "row",
        },
      ]}
    >
      <Animated.View
        style={{
          position: "absolute",
          top: 10,
          bottom: 10,
          left: 10,
          width: pillWidth,
          transform: [{ translateX }],
          backgroundColor: palette.gold,
          borderRadius: 30,
          zIndex: 0,
        }}
      />

      {tabs.map((tab) => (
        <TabItem
          key={tab.key}
          tab={tab}
          isFocused={active === tab.key}
          onLayout={(e) => {
            const { x, width } = e.nativeEvent.layout;
            setLayouts((prev) => ({ ...prev, [tab.key]: { x, width } }));
          }}
          onPress={() => onChange(tab.key)}
        />
      ))}
    </View>
  );
}

function TabItem({ 
  tab, 
  isFocused, 
  onLayout,
  onPress 
}: { 
  tab: any; 
  isFocused: boolean; 
  onLayout: (e: any) => void;
  onPress: () => void 
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.9,
      useNativeDriver: Platform.OS !== "web",
      friction: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: Platform.OS !== "web",
      friction: 4,
    }).start();
  };

  return (
    <Pressable
      onLayout={onLayout}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={{
        flex: isFocused ? 1.4 : 1,
        height: 54,
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1,
      }}
    >
      <Animated.View 
        style={{ 
          flexDirection: "row", 
          alignItems: "center", 
          justifyContent: "center", 
          gap: 6,
          transform: [{ scale }]
        }}
      >
        <Ionicons 
          name={isFocused ? (tab.icon.replace("-outline", "") as any) : tab.icon} 
          size={22} 
          color={isFocused ? "#000" : "#6e6a77"} 
        />
        {isFocused && (
          <Text 
            numberOfLines={1} 
            style={{ 
              color: "#000", 
              fontSize: 12, 
              fontWeight: "900",
              letterSpacing: 0.2
            }}
          >
            {tab.label}
          </Text>
        )}
      </Animated.View>
      {!!tab.count && tab.count > 0 && !isFocused && (
        <View
          style={{
            position: "absolute",
            right: "15%",
            top: 10,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: palette.gold,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "#16151a",
          }}
        >
          <Text style={{ color: "#000", fontSize: 9, fontWeight: "900" }}>{tab.count}</Text>
        </View>
      )}
    </Pressable>
  );
}

function CityModal({
  open,
  cities,
  selected,
  onClose,
  onSelect,
}: {
  open: boolean;
  cities: City[];
  selected?: string;
  onClose: () => void;
  onSelect: (city: City) => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.sectionHeading}>Choose city</Text>
          <FlatList
            data={cities}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable style={[styles.cityOption, item.id === selected && styles.extraRowActive]} onPress={() => onSelect(item)}>
                <Text style={styles.summaryLabel}>{item.name}</Text>
                <Text style={styles.summaryValue}>{item.deliveryMode}</Text>
              </Pressable>
            )}
          />
          <Pressable style={{ marginTop: 10 }} onPress={onClose}>
            <Text style={styles.linkText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function RestaurantInfoModal({
  restaurant,
  onClose,
}: {
  restaurant: Restaurant | null;
  onClose: () => void;
}) {
  if (!restaurant) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { borderRadius: 34, padding: 24 }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: palette.text, fontSize: 28, fontWeight: "900" }}>{restaurant.name.toUpperCase()}</Text>
              <Text style={{ color: "#7f798a", fontSize: 12, fontWeight: "900", letterSpacing: 2, marginTop: 6 }}>
                RESTAURANG INFORMATION
              </Text>
            </View>
            <Pressable onPress={onClose}>
              <Ionicons name="close-outline" size={24} color={palette.text} />
            </Pressable>
          </View>

          {!!restaurant.description && <Text style={[styles.helperText, { marginBottom: 18 }]}>{restaurant.description}</Text>}

          {!!(restaurant.address || restaurant.city) && (
            <View style={{ marginBottom: 16 }}>
              <Text style={{ color: palette.gold, fontWeight: "900", marginBottom: 6 }}>Adress</Text>
              <Text style={styles.helperText}>{[restaurant.address, restaurant.zip, restaurant.city].filter(Boolean).join(", ")}</Text>
            </View>
          )}

          {!!restaurant.phone && (
            <View style={{ marginBottom: 16 }}>
              <Text style={{ color: palette.gold, fontWeight: "900", marginBottom: 6 }}>Telefon</Text>
              <Text style={styles.helperText}>{restaurant.phone}</Text>
            </View>
          )}

          {!!getOpeningHoursLines(restaurant).length && (
            <View style={{ marginBottom: 8 }}>
              <Text style={{ color: palette.gold, fontWeight: "900", marginBottom: 8 }}>Öppettider</Text>
              {getOpeningHoursLines(restaurant).map((line) => (
                <Text key={line} style={[styles.helperText, { marginBottom: 4 }]}>
                  {line}
                </Text>
              ))}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function PulseIndicator({ color, size = 12 }: { color: string; size?: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 2, duration: 1500, useNativeDriver: Platform.OS !== "web" }),
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: Platform.OS !== "web" }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0, duration: 1500, useNativeDriver: Platform.OS !== "web" }),
          Animated.timing(opacity, { toValue: 0.6, duration: 0, useNativeDriver: Platform.OS !== "web" }),
        ]),
      ])
    ).start();
  }, [scale, opacity]);

  return (
    <View style={{ alignItems: "center", justifyContent: "center", width: size * 2, height: size * 2 }}>
      <Animated.View
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          transform: [{ scale }],
          opacity,
        }}
      />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function SpinningLoader({ color, size = 20 }: { color: string; size?: number }) {
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      })
    ).start();
  }, [rotate]);

  const spin = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View style={{ transform: [{ rotate: spin }] }}>
      <Ionicons name="reload-outline" size={size} color={color} />
    </Animated.View>
  );
}

function Header({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
  return (
    <View style={styles.header}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {onBack && (
          <Pressable style={styles.backButton} onPress={onBack}>
            <Ionicons name="chevron-back-outline" size={18} color={palette.text} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
        </View>
      </View>
    </View>
  );
}

function ScreenWrap({ children }: { children: React.ReactNode }) {
  return <ScrollView contentContainerStyle={styles.scrollContent}>{children}</ScrollView>;
}

function RestaurantCard({ restaurant, onPress }: { restaurant: Restaurant; onPress: () => void }) {
  return (
    <ScalePressable style={[styles.restaurantCard, { borderRadius: 30, padding: 14 }]} onPress={onPress}>
      {!!restaurant.imageUrl && (
        <Image source={{ uri: getImageUrl(restaurant.heroImageUrl || restaurant.imageUrl) }} style={[styles.restaurantImage, { borderRadius: 22 }]} />
      )}
      <View style={{ flex: 1, paddingTop: 14 }}>
        <View style={styles.inlineSummary}>
          <Text style={[styles.cardTitle, { fontSize: 22 }]}>{restaurant.name.toUpperCase()}</Text>
          <Badge label={restaurant.isOpen === false ? "STÄNGD" : "ÖPPEN"} tone={restaurant.isOpen === false ? "danger" : "success"} />
        </View>
        <Text style={[styles.productDescription, { fontSize: 11, fontWeight: "900", letterSpacing: 2 }]}>
          {(restaurant.description || restaurant.cuisine || "Restaurang").toUpperCase()}
        </Text>
        <View
          style={{
            marginTop: 12,
            borderRadius: 22,
            backgroundColor: "#25242b",
            paddingHorizontal: 14,
            paddingVertical: 14,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Text style={styles.helperText}>{Math.round(restaurant.etaMinutes || 30)} MIN</Text>
          <Text style={styles.helperText}>{Math.round(restaurant.deliveryFee || 0)} KR</Text>
          <Text style={styles.helperText}>{(restaurant.city || "").toUpperCase()}</Text>
        </View>
      </View>
    </ScalePressable>
  );
}

function SectionTitle({ title, actionLabel, onPress }: { title: string; actionLabel?: string; onPress?: () => void }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionHeading}>{title}</Text>
      {!!actionLabel && !!onPress && (
        <Pressable onPress={onPress}>
          <Text style={styles.linkText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

function ToggleChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <ScalePressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </ScalePressable>
  );
}

function Badge({ label, tone }: { label: string; tone: "success" | "danger" | "gold" | "info" }) {
  const map = {
    success: { bg: "#163520", text: palette.success },
    danger: { bg: "#33151a", text: palette.danger },
    gold: { bg: "#32220b", text: palette.gold },
    info: { bg: "#132d36", text: palette.info },
  };
  return (
    <View style={[styles.badge, { backgroundColor: map[tone].bg }]}>
      <Text style={[styles.badgeText, { color: map[tone].text }]}>{label}</Text>
    </View>
  );
}

function Counter({
  value,
  onDecrease,
  onIncrease,
}: {
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <View style={styles.counter}>
      <Pressable onPress={onDecrease}>
        <Ionicons name="remove-outline" size={18} color={palette.text} />
      </Pressable>
      <Text style={styles.counterText}>{value}</Text>
      <Pressable onPress={onIncrease}>
        <Ionicons name="add-outline" size={18} color={palette.text} />
      </Pressable>
    </View>
  );
}

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.inlineSummary}>
      <Text style={[styles.summaryLabel, highlight && { color: palette.text }]}>{label}</Text>
      <Text style={[styles.summaryValue, highlight && { color: palette.gold }]}>{value}</Text>
    </View>
  );
}

function EmptyPanel({ label }: { label: string }) {
  return (
    <View style={styles.emptyPanel}>
      <Text style={styles.helperText}>{label}</Text>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
  icon,
  style,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: any;
}) {
  return (
    <Pressable style={[styles.primaryButton, disabled && styles.primaryButtonDisabled, style]} onPress={onPress} disabled={disabled}>
      {icon && <Ionicons name={icon} size={18} color="#000" />}
      <Text style={styles.primaryButtonLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  appBg: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 120,
    gap: 16,
  },
  screen: {
    paddingHorizontal: 20,
    paddingTop: 18,
    gap: 16,
  },
  cartItemList: {
    gap: 14,
  },
  restaurantScreenContent: {
    paddingBottom: 150,
  },
  restaurantHeroWrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  restaurantHeroCardPremium: {
    minHeight: 360,
    borderRadius: 34,
    overflow: "hidden",
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    justifyContent: "space-between",
  },
  restaurantHeroCoverImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  restaurantHeroOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  restaurantHeroTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  restaurantHeroBackButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(18,17,23,0.7)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  restaurantHeroBackText: {
    color: palette.text,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  restaurantHeroActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  restaurantHeroGhostButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(18,17,23,0.7)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  restaurantHeroGhostButtonText: {
    color: palette.text,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  restaurantHeroPrimaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: palette.gold,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  restaurantHeroPrimaryButtonText: {
    color: "#000",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  restaurantHeroContentPremium: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    gap: 12,
  },
  restaurantHeroStatusPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  restaurantHeroStatusPillOpen: {
    backgroundColor: "rgba(34,197,94,0.12)",
    borderColor: "rgba(34,197,94,0.24)",
  },
  restaurantHeroStatusPillClosed: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderColor: "rgba(239,68,68,0.22)",
  },
  restaurantHeroStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  restaurantHeroStatusDotOpen: {
    backgroundColor: palette.success,
  },
  restaurantHeroStatusDotClosed: {
    backgroundColor: palette.danger,
  },
  restaurantHeroStatusText: {
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  restaurantHeroStatusTextOpen: {
    color: palette.success,
  },
  restaurantHeroStatusTextClosed: {
    color: palette.danger,
  },
  restaurantHeroTitlePremium: {
    color: palette.text,
    fontSize: 37,
    lineHeight: 40,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: -1.2,
    fontStyle: "italic",
  },
  restaurantHeroTitleAccent: {
    color: palette.gold,
  },
  restaurantHeroMetaRowPremium: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  restaurantHeroCuisine: {
    color: "rgba(249,247,243,0.42)",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  restaurantHeroRatingWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  restaurantHeroRatingText: {
    color: palette.gold,
    fontSize: 12,
    fontWeight: "800",
  },
  restaurantHeroRatingCount: {
    color: "rgba(249,247,243,0.32)",
    fontSize: 11,
    fontWeight: "800",
  },
  restaurantHeroDescriptionPremium: {
    color: "rgba(249,247,243,0.74)",
    fontSize: 14,
    lineHeight: 21,
    maxWidth: "88%",
  },
  restaurantQuickStatsRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 14,
    marginBottom: 20,
  },
  restaurantQuickStatCard: {
    flex: 1,
    backgroundColor: palette.panel,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 10,
    paddingVertical: 16,
    alignItems: "center",
    gap: 6,
  },
  restaurantQuickStatLabel: {
    color: "rgba(178,168,191,0.7)",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    textAlign: "center",
  },
  restaurantQuickStatValue: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },
  restaurantStickyNavWrap: {
    paddingHorizontal: 16,
    paddingBottom: 18,
    backgroundColor: palette.bg,
  },
  restaurantStickyNavCard: {
    backgroundColor: "rgba(23,21,29,0.96)",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 10,
    gap: 10,
  },
  restaurantSearchInputWrap: {
    backgroundColor: "rgba(11,10,15,0.75)",
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  restaurantSearchInput: {
    flex: 1,
    color: palette.text,
    fontSize: 14,
    fontWeight: "700",
    paddingVertical: 0,
  },
  restaurantCategoryRail: {
    gap: 8,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  restaurantCategoryChip: {
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 20,
    backgroundColor: "transparent",
  },
  restaurantCategoryChipActive: {
    backgroundColor: palette.gold,
    shadowColor: palette.gold,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  restaurantCategoryChipText: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  restaurantCategoryChipTextActive: {
    color: "#000",
  },
  restaurantMenuSectionsWrap: {
    paddingHorizontal: 16,
    gap: 26,
  },
  restaurantMenuSection: {
    gap: 14,
  },
  restaurantMenuSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 4,
  },
  restaurantMenuSectionTitle: {
    color: palette.text,
    fontSize: 28,
    fontWeight: "900",
    textTransform: "uppercase",
    fontStyle: "italic",
    letterSpacing: -0.7,
  },
  restaurantMenuSectionDivider: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  restaurantMenuProductList: {
    gap: 12,
  },
  restaurantMenuProductCard: {
    backgroundColor: palette.panel,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  restaurantMenuProductCardDisabled: {
    opacity: 0.5,
  },
  restaurantMenuProductImage: {
    width: 98,
    height: 98,
    borderRadius: 24,
    backgroundColor: palette.card,
  },
  restaurantMenuProductBody: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 4,
  },
  restaurantMenuProductTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  restaurantMenuProductTitle: {
    flex: 1,
    color: palette.text,
    fontSize: 16,
    fontWeight: "900",
    textTransform: "uppercase",
    fontStyle: "italic",
    lineHeight: 18,
  },
  restaurantMenuPriceBadge: {
    backgroundColor: "rgba(231,178,75,0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(231,178,75,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  restaurantMenuPriceBadgeText: {
    color: palette.gold,
    fontSize: 11,
    fontWeight: "900",
  },
  restaurantMenuProductDescription: {
    color: "rgba(178,168,191,0.78)",
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  restaurantMenuProductTags: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 8,
  },
  restaurantMenuDietDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  hero: {
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 16,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  eyebrow: {
    color: palette.gold,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  heroTitle: {
    color: palette.text,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "800",
  },
  heroSubtitle: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 18,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 10,
  },
  searchShell: {
    backgroundColor: palette.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchPlaceholder: {
    color: palette.muted,
    fontSize: 14,
  },
  cityPicker: {
    backgroundColor: palette.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cityText: {
    flex: 1,
    color: palette.text,
    fontSize: 15,
    fontWeight: "600",
  },
  sectionTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 16,
  },
  sectionHeading: {
    color: palette.text,
    fontSize: 20,
    fontWeight: "800",
  },
  chipRow: {
    gap: 10,
    paddingRight: 20,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: palette.panel,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
  },
  chipActive: {
    backgroundColor: palette.gold,
    borderColor: palette.gold,
  },
  chipText: {
    color: palette.text,
    fontWeight: "700",
  },
  chipTextActive: {
    color: "#000",
  },
  horizontalCards: {
    gap: 12,
    paddingRight: 20,
  },
  dealCard: {
    width: 240,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 22,
    padding: 16,
    gap: 8,
  },
  dealTitle: {
    color: palette.gold,
    fontSize: 16,
    fontWeight: "800",
  },
  dealBody: {
    color: palette.muted,
    lineHeight: 19,
  },
  restaurantCard: {
    backgroundColor: palette.panel,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: "hidden",
    marginBottom: 14,
  },
  restaurantImage: {
    width: "100%",
    height: 170,
  },
  cardTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "800",
    flex: 1,
    paddingRight: 10,
  },
  loaderWrap: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  floatingCart: {
    position: "absolute",
    bottom: 88,
    right: 20,
    backgroundColor: palette.gold,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  floatingCartText: {
    color: "#000",
    fontWeight: "800",
  },
  bottomTabs: {
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: "#110f16",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: 8,
    flexDirection: "row",
  },
  bottomTab: {
    flex: 1,
    alignItems: "center",
    gap: 5,
  },
  bottomTabLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: palette.panel,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 20,
    maxHeight: "80%",
  },
  modalCardLarge: {
    backgroundColor: palette.panel,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 20,
    maxHeight: "90%",
  },
  productModalBackdrop: {
    justifyContent: "flex-end",
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  productModalScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  productModalSheet: {
    backgroundColor: palette.bg,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderBottomWidth: 0,
    maxHeight: "92%",
    overflow: "hidden",
  },
  productModalHandle: {
    alignSelf: "center",
    width: 54,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    marginTop: 10,
    marginBottom: 4,
  },
  productModalCloseButton: {
    position: "absolute",
    top: 18,
    right: 18,
    zIndex: 5,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(11,10,15,0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  productModalScroll: {
    flexGrow: 0,
  },
  productModalContent: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 28,
    gap: 16,
  },
  productHeroCard: {
    minHeight: 260,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: palette.panel,
  },
  productHeroImage: {
    width: "100%",
    height: 260,
  },
  productHeroOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  productHeroContent: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18,
    gap: 10,
  },
  productModalHeader: {
    backgroundColor: palette.panel,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 20,
    gap: 10,
  },
  productHeroPriceChip: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(231,178,75,0.14)",
    borderWidth: 1,
    borderColor: "rgba(231,178,75,0.22)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  productHeroPriceChipText: {
    color: palette.gold,
    fontSize: 12,
    fontWeight: "800",
  },
  productModalTitle: {
    color: palette.text,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  productModalDescription: {
    color: "rgba(249,247,243,0.74)",
    fontSize: 14,
    lineHeight: 21,
  },
  productMetaCard: {
    backgroundColor: palette.panel,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  productMetaText: {
    color: palette.muted,
    flex: 1,
    lineHeight: 19,
  },
  productGroupCard: {
    backgroundColor: palette.panel,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 14,
  },
  productGroupHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  productGroupTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "800",
  },
  productGroupDescription: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  productGroupBadgeRow: {
    alignItems: "flex-end",
    gap: 8,
  },
  productGroupBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  productGroupBadgeRequired: {
    backgroundColor: "rgba(231,178,75,0.12)",
    borderColor: "rgba(231,178,75,0.22)",
  },
  productGroupBadgeOptional: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.08)",
  },
  productGroupBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  productGroupBadgeTextRequired: {
    color: palette.gold,
  },
  productGroupBadgeTextOptional: {
    color: palette.muted,
  },
  productGroupCountBadge: {
    backgroundColor: palette.card,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  productGroupCountText: {
    color: palette.text,
    fontSize: 11,
    fontWeight: "700",
  },
  productOptionsList: {
    gap: 10,
  },
  productOptionCard: {
    backgroundColor: palette.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  productOptionCardActive: {
    borderColor: "rgba(231,178,75,0.65)",
    backgroundColor: "rgba(231,178,75,0.08)",
  },
  productOptionCardDisabled: {
    opacity: 0.45,
  },
  productOptionMainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  productOptionIndicator: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  productOptionIndicatorActive: {
    borderColor: palette.gold,
    backgroundColor: "rgba(231,178,75,0.12)",
  },
  productOptionIndicatorInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.gold,
  },
  productOptionTextWrap: {
    flex: 1,
    gap: 2,
  },
  productOptionTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "700",
  },
  productOptionTitleActive: {
    color: "#fff5dd",
  },
  productOptionMeta: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  productOptionMetaActive: {
    color: palette.gold,
  },
  productNoteCard: {
    backgroundColor: palette.panel,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 10,
  },
  productNoteLabel: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "800",
  },
  productNoteInput: {
    minHeight: 110,
    borderRadius: 18,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: palette.text,
    textAlignVertical: "top",
    lineHeight: 20,
  },
  productSelectionError: {
    backgroundColor: "rgba(244,63,94,0.12)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(244,63,94,0.2)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  productSelectionErrorText: {
    color: "#fecdd3",
    flex: 1,
    lineHeight: 19,
  },
  productModalFooter: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(18,17,23,0.98)",
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 26,
    gap: 14,
  },
  productFooterSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  productFooterLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  productFooterValue: {
    color: palette.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.4,
    marginTop: 2,
  },
  productQuantityCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: palette.panel,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  productQuantityButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.card,
    alignItems: "center",
    justifyContent: "center",
  },
  productQuantityValue: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "800",
    minWidth: 28,
    textAlign: "center",
  },
  productAddButton: {
    backgroundColor: palette.gold,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  productAddButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  productAddButtonIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  productAddButtonLabel: {
    color: "#000",
    fontSize: 16,
    fontWeight: "900",
  },
  productAddButtonSubLabel: {
    color: "rgba(0,0,0,0.58)",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  productAddButtonPrice: {
    color: "#000",
    fontSize: 18,
    fontWeight: "900",
  },
  cityOption: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  header: {
    paddingBottom: 6,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.border,
  },
  headerTitle: {
    color: palette.text,
    fontSize: 28,
    fontWeight: "800",
  },
  headerSubtitle: {
    color: palette.muted,
    fontSize: 14,
    marginTop: 2,
  },
  restaurantHero: {
    padding: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 12,
  },
  restaurantHeroImage: {
    width: "100%",
    height: 180,
    borderRadius: 18,
  },
  restaurantMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  input: {
    backgroundColor: palette.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    color: palette.text,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  multiline: {
    minHeight: 92,
    textAlignVertical: "top",
  },
  infoCard: {
    width: 220,
    backgroundColor: palette.panelMuted,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    gap: 8,
  },
  infoCardTitle: {
    color: palette.text,
    fontWeight: "700",
  },
  infoCardBody: {
    color: palette.muted,
    lineHeight: 18,
  },
  sectionBlock: {
    gap: 10,
  },
  productCard: {
    backgroundColor: palette.panel,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },
  productTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "800",
  },
  productDescription: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  productPrice: {
    color: palette.gold,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 8,
  },
  productImage: {
    width: 84,
    height: 84,
    borderRadius: 18,
  },
  alertCard: {
    backgroundColor: "#291b14",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#5d4123",
    padding: 18,
    gap: 10,
  },
  alertTitle: {
    color: palette.gold,
    fontSize: 18,
    fontWeight: "800",
  },
  alertText: {
    color: palette.text,
    lineHeight: 19,
  },
  cartItem: {
    backgroundColor: palette.panel,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cartActions: {
    alignItems: "center",
    gap: 12,
  },
  counter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: palette.card,
    minWidth: 92,
  },
  counterText: {
    color: palette.text,
    fontWeight: "800",
  },
  formCard: {
    backgroundColor: palette.panel,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18,
    gap: 10,
  },
  inlineRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  secondaryButton: {
    backgroundColor: palette.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  secondaryButtonLabel: {
    color: palette.text,
    fontWeight: "700",
  },
  helperText: {
    color: palette.muted,
    lineHeight: 18,
  },
  orderCard: {
    backgroundColor: palette.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
  },
  extraRow: {
    backgroundColor: palette.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  extraRowActive: {
    borderColor: palette.gold,
    backgroundColor: "#30220b",
  },
  inlineSummary: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  summaryLabel: {
    color: palette.muted,
    fontSize: 14,
    flex: 1,
  },
  summaryValue: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "700",
  },
  emptyPanel: {
    backgroundColor: palette.panel,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    backgroundColor: palette.gold,
    borderRadius: 18,
    paddingVertical: 15,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonLabel: {
    color: "#000",
    fontWeight: "800",
  },
  linkText: {
    color: palette.gold,
    fontWeight: "700",
    textAlign: "center",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
