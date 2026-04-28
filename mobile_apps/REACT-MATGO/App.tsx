import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  KeyboardAvoidingView,
  LayoutAnimation,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  BackHandler,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { NavigationContainer, createNavigationContainerRef, StackActions, CommonActions } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

const Stack = createNativeStackNavigator();
export const navigationRef = createNavigationContainerRef<any>();
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { io, Socket } from "socket.io-client";
import * as WebBrowser from "expo-web-browser";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

import { supabase } from "./src/lib/supabase";
import { validateEnv } from "./src/lib/env";
import {
  API_URL,
  SOCKET_URL,
  STRIPE_PUBLISHABLE_KEY,
  WEB_URL,
  api,
  getImageUrl,
} from "./src/lib/api";
import {
  APP_AUTH_CALLBACK_URL,
  isAuthRedirectUrl,
  parseAuthRedirect,
} from "./src/lib/authRedirect";
import { AppStripeProvider, useAppPaymentSheet } from "./src/lib/stripeProvider";
import { startOrderActivity, updateOrderActivity, endOrderActivity } from "./src/lib/liveActivities";
import { palette, styles } from "./src/constants/theme";
import { useAppStore } from "./src/store/useAppStore";
import { usePushNotifications } from "./src/hooks/usePushNotifications";

import type {
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

// ─── Screen imports ────────────────────────────────────────────────────────────
import HomeScreen from "./src/screens/HomeScreen";
import DiscoverScreen from "./src/screens/DiscoverScreen";
import SearchScreen from "./src/screens/SearchScreen";
import RestaurantScreen from "./src/screens/RestaurantScreen";
import CartScreen from "./src/screens/CartScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import OrderScreen from "./src/screens/OrderScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";

// ─── Component imports ─────────────────────────────────────────────────────────
import ProductModal from "./src/components/ProductModal";
import PremiumLoader from "./src/components/PremiumLoader";
import LiveOrderBanner from "./src/components/LiveOrderBanner";
import BottomTabs from "./src/components/BottomTabs";
import CityModal from "./src/components/CityModal";
import RestaurantInfoModal from "./src/components/RestaurantInfoModal";
import SponsorTile from "./src/components/SponsorTile";
import AddressModal from "./src/components/AddressModal";
import DealFlipCard, { type DealFlipCardData } from "./src/components/DealFlipCard";
import HomeAddressInput from "./src/components/HomeAddressInput";
import AddressAutocomplete from "./src/components/AddressAutocomplete";
import ZipAutocomplete from "./src/components/ZipAutocomplete";

// ─── Shared UI atoms (no longer exported from App — live in src/components/ui) ─
import ScalePressable from "./src/components/ScalePressable";
import StarRating from "./src/components/StarRating";
import NetworkBanner from "./src/components/NetworkBanner";

// Required for expo-auth-session to handle redirects on Android/web
WebBrowser.maybeCompleteAuthSession();

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Use a fixed custom scheme so Supabase can whitelist one stable mobile redirect.
const SUPABASE_REDIRECT_URL = APP_AUTH_CALLBACK_URL;

const COUNTRY_CODES = [
  { code: "+46", flag: "🇸🇪", name: "Sverige" },
  { code: "+45", flag: "🇩🇰", name: "Danmark" },
  { code: "+47", flag: "🇳🇴", name: "Norge" },
  { code: "+358", flag: "🇫🇮", name: "Finland" },
];

const cuisineFilters = ["Alla", "Pizza", "Sushi", "Kebab", "Burgare", "Pasta", "Asiatiskt"];


// ─── Shared UI components (defined here for use by App-internal screens) ───────
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
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
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

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Animated.View style={{ transform: [{ rotate: spin }] }}>
      <Ionicons name="reload-outline" size={size} color={color} />
    </Animated.View>
  );
}

function Header({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}) {
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

function RestaurantCard({
  restaurant,
  onPress,
  containerStyle,
  isOutOfZone = false,
}: {
  restaurant: Restaurant;
  onPress: () => void;
  containerStyle?: any;
  isOutOfZone?: boolean;
}) {
  return (
    <ScalePressable
      style={[
        styles.restaurantCard,
        {
          borderRadius: 36,
          padding: 14,
          borderWidth: 1.5,
          borderColor: "rgba(231,178,75,0.45)",
          shadowColor: palette.gold,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.25,
          shadowRadius: 18,
          elevation: 10,
          backgroundColor: palette.panel,
        },
        containerStyle,
      ]}
      onPress={onPress}
    >
      {!!restaurant.imageUrl && (
        <Image
          source={{ uri: getImageUrl(restaurant.heroImageUrl || restaurant.imageUrl) }}
          style={[styles.restaurantImage, { borderRadius: 28, height: 230 }]}
        />
      )}
      <View style={{ flex: 1, paddingTop: 18, paddingHorizontal: 6 }}>
        <Text
          style={{ color: palette.text, fontSize: 24, fontWeight: "900", marginBottom: 6 }}
          numberOfLines={1}
        >
          {restaurant.name.toUpperCase()}
        </Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
          {isOutOfZone ? (
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 12,
                backgroundColor: "rgba(220,38,38,0.15)",
              }}
            >
              <Text style={{ color: "#fb7185", fontSize: 10, fontWeight: "900" }}>UTANFÖR ZON</Text>
            </View>
          ) : (
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 12,
                backgroundColor:
                  restaurant.isOpen === false
                    ? "rgba(220,38,38,0.15)"
                    : "rgba(16,185,129,0.15)",
              }}
            >
              <Text
                style={{
                  color: restaurant.isOpen === false ? "#fb7185" : "#10b981",
                  fontSize: 10,
                  fontWeight: "900",
                }}
              >
                {restaurant.isOpen === false ? "STÄNGD" : "ÖPPET"}
              </Text>
            </View>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <StarRating rating={restaurant.rating || 4.5} size={14} />
            <Text style={{ color: palette.gold, fontSize: 13, fontWeight: "900", marginLeft: 2 }}>
              {restaurant.rating?.toFixed(1) || "4.5"}
            </Text>
          </View>
        </View>

        <Text style={{ color: "#6f667d", fontSize: 12, fontWeight: "800", marginBottom: 16 }}>
          {(restaurant.description || restaurant.cuisine || "Restaurang").toUpperCase()}
        </Text>

        <View
          style={{
            paddingTop: 16,
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,0.03)",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ flexDirection: "row", gap: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="time-outline" size={14} color={palette.gold} />
              <Text style={{ color: "#9c96a5", fontSize: 12, fontWeight: "900" }}>
                {Math.round(restaurant.etaMinutes || 30)} MIN
              </Text>
            </View>
            {restaurant.deliveryFee && restaurant.deliveryFee > 0 ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="bicycle-outline" size={14} color={palette.gold} />
                <Text style={{ color: "#9c96a5", fontSize: 12, fontWeight: "900" }}>
                  {Math.round(restaurant.deliveryFee)} KR
                </Text>
              </View>
            ) : (
              <Text style={{ color: "#10b981", fontSize: 12, fontWeight: "900" }}>
                Fri leverans
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={18} color={palette.gold} />
        </View>
      </View>
    </ScalePressable>
  );
}

function SectionTitle({
  title,
  actionLabel,
  onPress,
}: {
  title: string;
  actionLabel?: string;
  onPress?: () => void;
}) {
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

function ToggleChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <ScalePressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </ScalePressable>
  );
}

function Badge({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "danger" | "gold" | "info";
}) {
  const map = {
    success: { bg: "rgba(52,199,89,0.12)", text: palette.success },
    danger: { bg: "rgba(255,59,48,0.12)", text: palette.danger },
    gold: { bg: "rgba(234,181,69,0.12)", text: palette.gold },
    info: { bg: "rgba(0,122,255,0.12)", text: palette.info },
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

function SummaryRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
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
    <Pressable
      style={[styles.primaryButton, disabled && styles.primaryButtonDisabled, style]}
      onPress={onPress}
      disabled={disabled}
    >
      {icon && <Ionicons name={icon} size={18} color="#000" />}
      <Text style={styles.primaryButtonLabel}>{label}</Text>
    </Pressable>
  );
}

// ─── App-level data helpers ────────────────────────────────────────────────────
const DISCOVER_CATEGORIES = [
  { name: "Pizza", icon: "pizza-outline" as const, tint: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  { name: "Burgare", icon: "fast-food-outline" as const, tint: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  { name: "Sallad", icon: "leaf-outline" as const, tint: "#22c55e", bg: "rgba(34,197,94,0.1)" },
  { name: "Sushi", icon: "fish-outline" as const, tint: "#38bdf8", bg: "rgba(56,189,248,0.1)" },
  { name: "Kebab", icon: "restaurant-outline" as const, tint: "#f97316", bg: "rgba(249,115,22,0.1)" },
  { name: "Snabbmat", icon: "bicycle-outline" as const, tint: "#a855f7", bg: "rgba(168,85,247,0.1)" },
];

const PREFERENCE_OPTIONS = ["Lök", "Vitlök", "Nötter", "Fisk", "Skaldjur", "Ägg", "Mjölk", "Gluten"];
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

function sortRestaurantsForHome(restaurants: Restaurant[], zoneIds: string[] | null = null) {
  return [...restaurants].sort((a, b) => {
    if (zoneIds !== null) {
      const aIn = zoneIds.includes(a.id) ? 1 : 0;
      const bIn = zoneIds.includes(b.id) ? 1 : 0;
      if (aIn !== bIn) return bIn - aIn;
    }
    const aOpen = a.isOpen !== false ? 1 : 0;
    const bOpen = b.isOpen !== false ? 1 : 0;
    if (aOpen !== bOpen) return bOpen - aOpen;
    const aRank = a.featuredClass === 1 ? 2 : a.featuredClass === 2 ? 1 : 0;
    const bRank = b.featuredClass === 1 ? 2 : b.featuredClass === 2 ? 1 : 0;
    if (aRank !== bRank) return bRank - aRank;
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

export function getOpeningHoursLines(restaurant?: Restaurant | null) {
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

// ─── AppContent ────────────────────────────────────────────────────────────────
function AppContent() {
  const [currentRouteName, setCurrentRouteName] = useState<string>("home");
  const [splashFinished, setSplashFinished] = useState(false);
  const hydrated = useAppStore((s) => s.hydrated);
  const hydrate = useAppStore((s) => s.hydrate);
  const { activeOrderId, setActiveOrder } = useAppStore();
  const onboardingComplete = useAppStore((s) => s.onboardingComplete);
  const token = useAppStore((s) => s.token);
  const setToken = useAppStore((s) => s.setToken);

  usePushNotifications(token);

  useEffect(() => {
    const missingKeys = validateEnv();
    if (missingKeys.length) {
      Alert.alert(
        "Konfigurationsfel",
        `Appen saknar nödvändiga miljövariabler:\n\n${missingKeys.join("\n")}\n\nKontakta support.`
      );
    }
  }, []);

  useEffect(() => {
    hydrate().catch(() => {});
    const timer = setTimeout(() => {
      setSplashFinished(true);
    }, 2500); // Ensures the splash screen shows for at least 2.5s
    return () => clearTimeout(timer);
  }, [hydrate]);

  const pushRoute = useCallback((next: AppRoute) => {
    if (navigationRef.isReady()) {
      navigationRef.navigate(next.name, next);
    }
  }, []);

  const replaceRoute = useCallback((next: AppRoute) => {
    if (navigationRef.isReady()) {
      navigationRef.dispatch(StackActions.replace(next.name, next));
    }
  }, []);

  const goBack = useCallback(() => {
    if (navigationRef.isReady() && navigationRef.canGoBack()) {
      navigationRef.goBack();
    }
  }, []);

  const openRoot = useCallback(
    (name: "home" | "search" | "cart" | "profile" | "discover") => {
      if (navigationRef.isReady()) {
        const TABS = ["home", "search", "discover", "cart", "profile"];
        const currentName = navigationRef.getCurrentRoute()?.name || "home";

        if (currentName === name) {
          return;
        }

        const currentIndex = TABS.indexOf(currentName as "home");
        const targetIndex = TABS.indexOf(name as "home");
        
        let direction = "slide_from_right";
        if (currentIndex !== -1 && targetIndex !== -1) {
          direction = targetIndex > currentIndex ? "slide_from_right" : "slide_from_left";
        }

        // StackActions.replace prevents the iOS back-swipe revealing a previous tab
        // while still keeping other mounted screens alive (unlike CommonActions.reset
        // which unmounts everything and wipes in-memory state like scroll position).
        navigationRef.dispatch(StackActions.replace(name, { _slideDirection: direction }));
      }
    },
    []
  );

  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete);
  const setProfile = useAppStore((s) => s.setProfile);

  useEffect(() => {
    const checkSession = async () => {
      if (
        Platform.OS === "web" &&
        typeof window !== "undefined" &&
        window.location?.hash?.includes("access_token=")
      ) {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");

        if (accessToken && refreshToken) {
          try {
            const {
              data: { session },
            } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (session) {
              setToken(session.access_token);
              setOnboardingComplete(true);
              try {
                const profileRes = await api.get("/api/profile", {
                  headers: { Authorization: `Bearer ${session.access_token}` },
                });
                setProfile(profileRes.data);
              } catch {}
              openRoot("home");
              window.history.replaceState(null, "", window.location.pathname);
              return;
            }
          } catch (e) {
            console.error("Manual session set failed:", e);
          }
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        setToken(session.access_token);
        setOnboardingComplete(true);
      }
    };

    checkSession();

    const {
      data: { subscription: authListener },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.access_token) {
        setToken(session.access_token);
        setOnboardingComplete(true);
        if (event === "SIGNED_IN") {
          try {
            const profileRes = await api.get("/api/profile", {
              headers: { Authorization: `Bearer ${session.access_token}` },
            });
            setProfile(profileRes.data);
          } catch {}
          openRoot("home");
        }
      } else if (event === "SIGNED_OUT") {
        setToken(null);
        setOnboardingComplete(false);
      }
    });

    const handleUrl = async (url: string) => {
      if (!isAuthRedirectUrl(url)) return;

      const {
        code,
        token: appToken,
        accessToken,
        refreshToken,
        error: authError,
      } = parseAuthRedirect(url);

      if (authError) {
        Alert.alert("Inloggning misslyckades", authError);
        return;
      }

      if (accessToken && refreshToken) {
        try {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (!error && data.session?.access_token) {
            setToken(data.session.access_token);
            setOnboardingComplete(true);
            try {
              const profileRes = await api.get("/api/profile", {
                headers: { Authorization: `Bearer ${data.session.access_token}` },
              });
              setProfile(profileRes.data);
            } catch {}
            openRoot("home");
          }
        } catch (e) {
          console.error("Session restore failed:", e);
        }
        return;
      }

      if (code) {
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error && data.session?.access_token) {
            setToken(data.session.access_token);
            setOnboardingComplete(true);
            try {
              const profileRes = await api.get("/api/profile", {
                headers: { Authorization: `Bearer ${data.session.access_token}` },
              });
              setProfile(profileRes.data);
            } catch {}
            openRoot("home");
          }
        } catch (e) {
          console.error("Code exchange failed:", e);
        }
        return;
      }

      const redirectedToken = appToken ?? accessToken;
      if (redirectedToken) {
        setToken(redirectedToken);
        setOnboardingComplete(true);
        try {
          const profileRes = await api.get("/api/profile", {
            headers: { Authorization: `Bearer ${redirectedToken}` },
          });
          setProfile(profileRes.data);
        } catch {}
        openRoot("home");
      }
    };

    const linkSub = Linking.addEventListener("url", ({ url }) => {
      handleUrl(url).catch(() => {});
    });

    // Push Notification Registration
    const registerForPush = async () => {
      if (Platform.OS === "web") return;
      
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== "granted") return;

      try {
        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: Constants.expoConfig?.extra?.eas?.projectId,
        });
        
        if (tokenData.data && token) {
          await api.post("/api/notifications/register", { token: tokenData.data }, {
            headers: { Authorization: `Bearer ${token}` }
          });
          console.log("🚀 Push token registered:", tokenData.data);
        }
      } catch (error) {
        console.warn("Failed to register for push notifications:", error);
      }
    };

    if (token && hydrated) {
      registerForPush();
    }

    return () => {
      authListener.unsubscribe();
      linkSub.remove();
    };
  }, [openRoot, setOnboardingComplete, setProfile, setToken]);

  if (!hydrated || !splashFinished) {
    return <PremiumLoader message="Gör dig redo för en smakupplevelse..." />;
  }

  if (!onboardingComplete && !token) {
    return <OnboardingScreen onComplete={() => {}} />;
  }

  const tabValue =
    currentRouteName === "restaurant" || currentRouteName === "order" || currentRouteName === "register"
      ? "home"
      : currentRouteName;

  return (
    <View style={styles.safe}>
      <ExpoStatusBar style="dark" />
      <StatusBar barStyle="dark-content" />
      <LinearGradient
        colors={[palette.panel, palette.bg, palette.panelMuted]}
        locations={[0, 0.22, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView edges={["left", "right"]} style={{ flex: 1, backgroundColor: "transparent" }}>
        <View style={styles.appBg}>
          <NetworkBanner />
          <NavigationContainer
            ref={navigationRef}
            onStateChange={() => {
              const currentRoute = navigationRef.getCurrentRoute();
              if (currentRoute) {
                setCurrentRouteName(currentRoute.name);
              }
            }}
          >
            <Stack.Navigator
              screenOptions={{
                headerShown: false,
                animation: "slide_from_right",
                contentStyle: { backgroundColor: palette.bg }
              }}
            >
              <Stack.Screen 
                name="home"
                options={({ route }: any) => ({
                  animation: route.params?._slideDirection || "slide_from_left", // Default slide left when returning home
                })}
              >
                {() => (
                  <HomeScreen
                    openRestaurant={(slug) => pushRoute({ name: "restaurant", slug } as any)}
                    openTab={(tab) => {
                      if (tab === "discover") pushRoute({ name: "discover" });
                      else openRoot(tab as any);
                    }}
                    pushRoute={pushRoute}
                  />
                )}
              </Stack.Screen>

              <Stack.Screen 
                name="discover"
                options={({ route }: any) => ({
                  animation: route.params?._slideDirection || "slide_from_right",
                })}
              >
                {() => (
                  <DiscoverScreen
                    openRestaurant={(slug) => pushRoute({ name: "restaurant", slug } as any)}
                    goBack={goBack}
                  />
                )}
              </Stack.Screen>

              <Stack.Screen name="discover-filtered">
                {(props: any) => (
                  <DiscoverScreen
                    openRestaurant={(slug) => pushRoute({ name: "restaurant", slug } as any)}
                    goBack={goBack}
                    initialFilteredIds={props.route.params?.restaurantIds}
                    filteredTitle={props.route.params?.dealTitle}
                  />
                )}
              </Stack.Screen>

              <Stack.Screen 
                name="search"
                options={({ route }: any) => ({
                  animation: route.params?._slideDirection || "slide_from_right",
                })}
              >
                {() => <SearchScreen openRestaurant={(slug) => pushRoute({ name: "restaurant", slug } as any)} />}
              </Stack.Screen>

              <Stack.Screen name="restaurant">
                {(props: any) => (
                  <RestaurantScreen
                    slug={props.route.params?.slug}
                    goBack={goBack}
                    openCart={() => pushRoute({ name: "cart" })}
                  />
                )}
              </Stack.Screen>

              <Stack.Screen 
                name="cart"
                options={({ route }: any) => ({
                  animation: route.params?._slideDirection || "slide_from_right",
                })}
              >
                {() => (
                  <CartScreen
                    openProfile={() => pushRoute({ name: "profile" })}
                    openOrder={(id) => {
                      setActiveOrder(id);
                      replaceRoute({ name: "order", id } as any);
                    }}
                    openHome={() => openRoot("home")}
                  />
                )}
              </Stack.Screen>

              <Stack.Screen 
                name="profile"
                options={({ route }: any) => ({
                  animation: route.params?._slideDirection || "slide_from_right",
                })}
              >
                {() => (
                  <ProfileScreen
                    openRegister={(initialPhone) => pushRoute({ name: "register", initialPhone } as any)}
                    openOrder={(id) => pushRoute({ name: "order", id } as any)}
                    openCart={() => openRoot("cart")}
                  />
                )}
              </Stack.Screen>

              <Stack.Screen name="register">
                {(props: any) => (
                  <RegisterScreen
                    initialPhone={props.route.params?.initialPhone}
                    goBack={goBack}
                    onRegistered={() => replaceRoute({ name: "profile" })}
                  />
                )}
              </Stack.Screen>

              <Stack.Screen name="order">
                {(props: any) => (
                  <OrderScreen
                    id={props.route.params?.id}
                    goBack={() => {
                      if (navigationRef.isReady() && navigationRef.canGoBack()) goBack();
                      else openRoot("home");
                    }}
                  />
                )}
              </Stack.Screen>
            </Stack.Navigator>
          </NavigationContainer>

          {activeOrderId && currentRouteName !== "order" && (
            <LiveOrderBanner
              id={activeOrderId}
              openOrder={(id) => pushRoute({ name: "order", id } as any)}
              onDismiss={() => setActiveOrder(null)}
            />
          )}
          {!["restaurant", "order", "register"].includes(currentRouteName) && (
            <BottomTabs active={tabValue as any} onChange={openRoot} />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

// ─── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <SafeAreaProvider>
      <AppStripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} urlScheme="matgo">
        <AppContent />
      </AppStripeProvider>
    </SafeAreaProvider>
  );
}
